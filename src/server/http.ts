import { randomUUID } from "node:crypto";
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { InputError } from "../engine/validate.js";
import { hashPassword, newToken, sha256, verifyPassword } from "./crypto.js";
import { openContext, openSecret, sealSecret, type AppContext, type IncidentSecret, type PlanSecret } from "./db.js";
import { executePlan } from "./plan.js";
import {
  canAssignRole,
  canCreateIncident,
  canManageUsers,
  canRunPlan,
  canUpdateIncident,
  canViewAudit,
  canViewIncident,
  isRole,
  planPermissions,
  ROLE_LABEL,
  type GrantLevel,
  type IncidentKind,
  type ModuleName,
  type Role,
} from "./rbac.js";

const SESSION_MS = 12 * 60 * 60 * 1000;
const KINDS = new Set<IncidentKind>(["cordon", "containment", "land_sar", "marine_sar", "public_order"]);
const CLASSIFICATIONS = new Set(["training", "official", "sensitive", "restricted"]);
const STATUSES = new Set(["draft", "active", "contained", "suspended", "closed"]);

type AuthUser = {
  id: string;
  email: string;
  displayName: string;
  appointment: string;
  role: Role;
  agencyId: string;
  agencyName: string;
  agencyShort: string;
  homeLat: number;
  homeLng: number;
  evaluation: boolean;
  callsign: string;
  unitId: string | null;
  unitShort: string | null;
  unitConcealed: boolean;
  showName: boolean;
};

type RequestContext = {
  req: http.IncomingMessage;
  res: http.ServerResponse;
  url: URL;
  params: Record<string, string>;
  body: unknown;
  user: AuthUser | null;
  ip: string;
  app: AppContext;
};

type Handler = (ctx: RequestContext) => Promise<void> | void;

const attempts = new Map<string, { count: number; reset: number }>();
let dummyHash = "";

export function createServer() {
  const app = openContext();
  if (!dummyHash) dummyHash = hashPassword("preserve-timing-padding-account");
  const server = http.createServer((req, res) => {
    void handle(req, res, app);
  });
  return server;
}

async function handle(req: http.IncomingMessage, res: http.ServerResponse, app: AppContext) {
  const url = new URL(req.url || "/", "http://preserve.local");
  const ip = req.socket.remoteAddress || "";
  try {
    if (req.method === "GET" && !url.pathname.startsWith("/api/")) {
      serveStatic(req, res, url.pathname);
      return;
    }
    const matched = matchRoute(req.method || "GET", url.pathname);
    if (!matched) {
      send(res, 404, { error: "Not found." });
      return;
    }
    const body = matched.auth || req.method !== "GET" ? await readBody(req) : {};
    const user = matched.auth ? userFromRequest(app, req) : null;
    if (matched.auth && !user) {
      send(res, 401, { error: "Sign in again." });
      return;
    }
    await matched.handler({ req, res, url, params: matched.params, body, user, ip, app });
  } catch (error) {
    if (error instanceof InputError) {
      send(res, 400, { error: error.message });
      return;
    }
    console.error(error instanceof Error ? error.message : "Request failed");
    if (!res.headersSent) send(res, 500, { error: "The installation could not complete that." });
  }
}

function matchRoute(method: string, pathname: string) {
  for (const route of routes) {
    if (route.method !== method) continue;
    const params = matchPath(route.pattern, pathname);
    if (params) return { ...route, params };
  }
  return null;
}

function matchPath(pattern: string, pathname: string): Record<string, string> | null {
  const expected = pattern.split("/").filter(Boolean);
  const actual = pathname.split("/").filter(Boolean);
  if (expected.length !== actual.length) return null;
  const params: Record<string, string> = {};
  for (let index = 0; index < expected.length; index++) {
    if (expected[index].startsWith(":")) params[expected[index].slice(1)] = decodeURIComponent(actual[index]);
    else if (expected[index] !== actual[index]) return null;
  }
  return params;
}

const routes: { method: string; pattern: string; auth: boolean; handler: Handler }[] = [
  { method: "GET", pattern: "/api/health", auth: false, handler: health },
  { method: "GET", pattern: "/api/auth/bootstrap", auth: false, handler: bootstrap },
  { method: "POST", pattern: "/api/auth/login", auth: false, handler: login },
  { method: "POST", pattern: "/api/auth/logout", auth: true, handler: logout },
  { method: "GET", pattern: "/api/auth/me", auth: true, handler: me },
  { method: "GET", pattern: "/api/config", auth: true, handler: config },
  { method: "GET", pattern: "/api/security/posture", auth: true, handler: posture },
  { method: "GET", pattern: "/api/agencies", auth: true, handler: agencies },
  { method: "POST", pattern: "/api/agencies", auth: true, handler: createAgency },
  { method: "GET", pattern: "/api/directory", auth: true, handler: directory },
  { method: "GET", pattern: "/api/users", auth: true, handler: users },
  { method: "POST", pattern: "/api/users", auth: true, handler: createUser },
  { method: "PATCH", pattern: "/api/users/:id", auth: true, handler: updateUser },
  { method: "GET", pattern: "/api/incidents", auth: true, handler: incidents },
  { method: "POST", pattern: "/api/incidents", auth: true, handler: createIncident },
  { method: "GET", pattern: "/api/incidents/:id", auth: true, handler: incident },
  { method: "PATCH", pattern: "/api/incidents/:id", auth: true, handler: updateIncident },
  { method: "POST", pattern: "/api/incidents/:id/members", auth: true, handler: addMember },
  { method: "DELETE", pattern: "/api/incidents/:id/members/:userId", auth: true, handler: removeMember },
  { method: "POST", pattern: "/api/incidents/:id/grants", auth: true, handler: addGrant },
  { method: "DELETE", pattern: "/api/incidents/:id/grants/:grantId", auth: true, handler: removeGrant },
  { method: "POST", pattern: "/api/incidents/:id/plans", auth: true, handler: createPlan },
  { method: "PUT", pattern: "/api/presence", auth: true, handler: upsertPresence },
  { method: "GET", pattern: "/api/presence", auth: true, handler: listPresence },
  { method: "GET", pattern: "/api/lights", auth: true, handler: listLights },
  { method: "POST", pattern: "/api/lights", auth: true, handler: createLight },
  { method: "GET", pattern: "/api/audit", auth: true, handler: auditList },
];

function health(_ctx: RequestContext) {
  send(_ctx.res, 200, { ok: true, product: "PRESERVE" });
}

function bootstrap(ctx: RequestContext) {
  const users = ctx.app.db.prepare("SELECT COUNT(*) AS n FROM users WHERE active = 1").get() as { n: number };
  // Unauthenticated bootstrap never returns passwords, emails, or roles.
  send(ctx.res, 200, {
    demoBanner: false,
    hasUsers: users.n > 0,
    evaluationReady: evaluationActive(ctx.app),
  });
}

function login(ctx: RequestContext) {
  const body = asObject(ctx.body);
  const email = String(body.email ?? "").trim().toLowerCase();
  const password = String(body.password ?? "");
  const key = `${ctx.ip}:${email}`;
  const now = Date.now();
  const attempt = attempts.get(key);
  if (attempt && attempt.reset > now && attempt.count >= 8) {
    send(ctx.res, 429, { error: "Too many attempts. Wait and try again." });
    return;
  }
  const row = findUserByEmail(ctx.app, email);
  const ok = verifyPassword(password, row?.password_hash || dummyHash);
  if (!row || !row.active || !ok) {
    const current = attempts.get(key);
    const fresh = !current || current.reset < now;
    attempts.set(key, { count: fresh ? 1 : current.count + 1, reset: fresh ? now + 15 * 60 * 1000 : current.reset });
    writeAudit(ctx, "auth.rejected", "user", undefined, "Rejected a sign-in.");
    send(ctx.res, 401, { error: "Those credentials were not accepted." });
    return;
  }
  attempts.delete(key);
  const token = newToken();
  const expires = new Date(now + SESSION_MS).toISOString();
  ctx.app.db
    .prepare("INSERT INTO sessions (id, user_id, token_hash, expires_at, created_at, revoked) VALUES (?, ?, ?, ?, ?, 0)")
    .run(randomUUID(), row.id, sha256(token), expires, new Date().toISOString());
  ctx.app.db.prepare("UPDATE users SET last_login_at = ? WHERE id = ?").run(new Date().toISOString(), row.id);
  writeAudit(ctx, "auth.login", "user", row.id, "Signed in.");
  send(ctx.res, 200, { user: publicUser(row, ctx.app) }, { "set-cookie": sessionCookie(token) });
}

function logout(ctx: RequestContext) {
  const token = readCookie(ctx.req.headers.cookie, "preserve_session");
  if (token) {
    ctx.app.db.prepare("UPDATE sessions SET revoked = 1 WHERE token_hash = ?").run(sha256(token));
  }
  writeAudit(ctx, "auth.logout", "user", ctx.user?.id, "Signed out.");
  send(ctx.res, 200, { ok: true }, { "set-cookie": sessionCookie("", true) });
}

function me(ctx: RequestContext) {
  send(ctx.res, 200, { user: ctx.user, evaluationInstall: evaluationActive(ctx.app) });
}

function config(ctx: RequestContext) {
  send(ctx.res, 200, {
    tileUrl: tileUrl(),
    attribution: "© OpenStreetMap",
  });
}

function posture(ctx: RequestContext) {
  send(ctx.res, 200, {
    product: "PRESERVE",
    externalModelConfigured: false,
    caseDataLeavesHost: false,
    egressAllowlist: ["api.openstreetmap.org", "api.open-meteo.com", "marine-api.open-meteo.com"],
    tileUrl: tileUrl(),
    encryption: "AES-256-GCM",
    passwordHashing: "scrypt",
    sessionHours: 12,
    selfRegistration: false,
    audit: true,
    evaluationInstall: evaluationActive(ctx.app),
    mapNote:
      "Map tiles are pictures of the ground, requested by the browser. They can reveal the area being viewed to the tile host. Use an internal tile server, or switch the map to grid, for a sensitive operation.",
  });
}

function agencies(ctx: RequestContext) {
  const rows = ctx.app.db
    .prepare("SELECT id, name, short_name, kind FROM agencies ORDER BY name")
    .all() as { id: string; name: string; short_name: string; kind: string }[];
  send(ctx.res, 200, {
    agencies: rows.map((row) => ({ id: row.id, name: row.name, shortName: row.short_name, kind: row.kind })),
  });
}

function createAgency(ctx: RequestContext) {
  if (ctx.user?.role !== "superadmin") return send(ctx.res, 403, { error: "Only the registrar can add an agency." });
  const body = asObject(ctx.body);
  const name = cleanText(body.name, 3, 80, "Agency name");
  const shortName = cleanText(body.shortName, 2, 8, "Short name").toUpperCase();
  if (!/^[A-Z0-9]{2,8}$/.test(shortName)) throw new InputError("Short name is 2 to 8 letters or numbers.");
  const kind = String(body.kind ?? "police");
  if (!["police", "rescue", "maritime", "joint", "registry"].includes(kind)) throw new InputError("Agency kind is not recognised.");
  const lat = numberIn(body.homeLat, -90, 90, "Home latitude");
  const lng = numberIn(body.homeLng, -180, 180, "Home longitude");
  const id = randomUUID();
  ctx.app.db
    .prepare("INSERT INTO agencies (id, name, short_name, kind, home_lat, home_lng, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)")
    .run(id, name, shortName, kind, lat, lng, new Date().toISOString());
  writeAudit(ctx, "agency.create", "agency", id, `Added agency ${shortName}.`);
  send(ctx.res, 201, { id });
}

function directory(ctx: RequestContext) {
  if (!ctx.user || ctx.user.role === "field_officer" || ctx.user.role === "observer") {
    return send(ctx.res, 403, { error: "You cannot open the directory." });
  }
  const rows = listUsers(ctx.app, ctx.user.role === "superadmin" ? undefined : ctx.user.agencyId).filter((user) => user.active);
  send(ctx.res, 200, {
    users: rows.map((user) => ({
      id: user.id,
      displayName: user.display_name,
      appointment: user.appointment,
      role: user.role,
      agencyId: user.agency_id,
    })),
  });
}

function users(ctx: RequestContext) {
  if (!ctx.user || !canManageUsers(ctx.user.role)) return send(ctx.res, 403, { error: "You cannot manage accounts." });
  const rows = listUsers(ctx.app, ctx.user.role === "superadmin" ? undefined : ctx.user.agencyId);
  send(ctx.res, 200, { users: rows.map(presentUser) });
}

function createUser(ctx: RequestContext) {
  if (!ctx.user || !canManageUsers(ctx.user.role)) return send(ctx.res, 403, { error: "You cannot manage accounts." });
  const body = asObject(ctx.body);
  const role = String(body.role ?? "");
  if (!isRole(role) || !canAssignRole(ctx.user.role, role)) throw new InputError("That role cannot be assigned.");
  const agencyId = ctx.user.role === "superadmin" ? String(body.agencyId ?? "") : ctx.user.agencyId;
  const agency = ctx.app.db.prepare("SELECT id FROM agencies WHERE id = ?").get(agencyId);
  if (!agency) throw new InputError("Choose an agency.");
  const email = String(body.email ?? "").trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 120) throw new InputError("Enter a valid email.");
  const password = String(body.password ?? "");
  assertPassword(password);
  const id = randomUUID();
  ctx.app.db
    .prepare(
      `INSERT INTO users (id, agency_id, email, display_name, appointment, password_hash, role, active, evaluation, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, 1, 0, ?)`,
    )
    .run(
      id,
      agencyId,
      email,
      cleanText(body.displayName, 2, 80, "Name"),
      cleanText(body.appointment, 2, 80, "Appointment"),
      hashPassword(password),
      role,
      new Date().toISOString(),
    );
  writeAudit(ctx, "user.create", "user", id, `Added an account in role ${role}.`);
  send(ctx.res, 201, { id });
}

function updateUser(ctx: RequestContext) {
  if (!ctx.user || !canManageUsers(ctx.user.role)) return send(ctx.res, 403, { error: "You cannot manage accounts." });
  const row = findUserById(ctx.app, ctx.params.id);
  if (!row || (ctx.user.role !== "superadmin" && row.agency_id !== ctx.user.agencyId)) {
    return send(ctx.res, 404, { error: "Account not found." });
  }
  const body = asObject(ctx.body);
  if (body.role != null) {
    const role = String(body.role);
    if (!isRole(role) || !canAssignRole(ctx.user.role, role)) throw new InputError("That role cannot be assigned.");
    if (row.id === ctx.user.id) throw new InputError("You cannot change your own role.");
    ctx.app.db.prepare("UPDATE users SET role = ? WHERE id = ?").run(role, row.id);
  }
  if (body.active != null) {
    if (row.id === ctx.user.id) throw new InputError("You cannot deactivate your own account.");
    ctx.app.db.prepare("UPDATE users SET active = ? WHERE id = ?").run(body.active ? 1 : 0, row.id);
    if (!body.active) ctx.app.db.prepare("UPDATE sessions SET revoked = 1 WHERE user_id = ?").run(row.id);
  }
  if (body.displayName != null) {
    ctx.app.db.prepare("UPDATE users SET display_name = ? WHERE id = ?").run(cleanText(body.displayName, 2, 80, "Name"), row.id);
  }
  if (body.appointment != null) {
    ctx.app.db.prepare("UPDATE users SET appointment = ? WHERE id = ?").run(cleanText(body.appointment, 2, 80, "Appointment"), row.id);
  }
  if (body.password != null) {
    const password = String(body.password);
    assertPassword(password);
    ctx.app.db
      .prepare("UPDATE users SET password_hash = ?, evaluation = 0 WHERE id = ?")
      .run(hashPassword(password), row.id);
    ctx.app.db.prepare("UPDATE sessions SET revoked = 1 WHERE user_id = ?").run(row.id);
  }
  writeAudit(ctx, "user.update", "user", row.id, "Updated an account.");
  send(ctx.res, 200, { ok: true });
}

function incidents(ctx: RequestContext) {
  const visible = visibleIncidents(ctx);
  send(ctx.res, 200, { incidents: visible.map((item) => summarize(ctx, item)) });
}

function createIncident(ctx: RequestContext) {
  if (!ctx.user) return;
  const body = asObject(ctx.body);
  const kind = String(body.kind ?? "") as IncidentKind;
  if (!KINDS.has(kind) || !canCreateIncident(ctx.user.role, kind)) {
    return send(ctx.res, 403, { error: "You cannot open that kind of incident." });
  }
  const classification = String(body.classification ?? "official");
  if (!CLASSIFICATIONS.has(classification)) throw new InputError("Classification is not recognised.");
  const secret: IncidentSecret = {
    title: cleanText(body.title, 3, 120, "Title"),
    summary: cleanText(body.summary ?? "", 0, 2000, "Summary"),
    locationLabel: cleanText(body.locationLabel ?? "", 0, 120, "Location label"),
    lat: numberIn(body.lat, -90, 90, "Latitude"),
    lng: numberIn(body.lng, -180, 180, "Longitude"),
  };
  const id = randomUUID();
  const reference = nextReference(ctx.app, ctx.user.agencyShort);
  const now = new Date().toISOString();
  ctx.app.db
    .prepare(
      `INSERT INTO incidents (id, agency_id, reference, kind, classification, status, secret, created_by, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, 'active', ?, ?, ?, ?)`,
    )
    .run(id, ctx.user.agencyId, reference, kind, classification, sealSecret(ctx.app.key, secret), ctx.user.id, now, now);
  ctx.app.db.prepare("INSERT INTO incident_members (incident_id, user_id, duty) VALUES (?, ?, 'lead')").run(id, ctx.user.id);
  const memberIds = Array.isArray(body.memberIds) ? body.memberIds.map(String) : [];
  for (const userId of memberIds) {
    if (userId === ctx.user.id) continue;
    const person = findUserById(ctx.app, userId);
    if (!person || person.agency_id !== ctx.user.agencyId || !person.active) continue;
    ctx.app.db
      .prepare("INSERT OR IGNORE INTO incident_members (incident_id, user_id, duty) VALUES (?, ?, ?)")
      .run(id, userId, dutyForRole(person.role));
  }
  writeAudit(ctx, "incident.create", "incident", id, `Opened ${reference}.`);
  send(ctx.res, 201, { id, reference });
}

function incident(ctx: RequestContext) {
  const found = requireIncident(ctx);
  if (!found) return;
  writeAudit(ctx, "incident.view", "incident", found.row.id, `Viewed ${found.row.reference}.`);
  send(ctx.res, 200, presentIncident(ctx, found));
}

function updateIncident(ctx: RequestContext) {
  const found = requireIncident(ctx);
  if (!found) return;
  if (!canUpdateIncident(ctx.user!.role, found.sameAgency)) {
    return send(ctx.res, 403, { error: "You cannot change this incident record." });
  }
  const body = asObject(ctx.body);
  const secret = { ...found.secret };
  if (body.title != null) secret.title = cleanText(body.title, 3, 120, "Title");
  if (body.summary != null) secret.summary = cleanText(body.summary, 0, 2000, "Summary");
  if (body.locationLabel != null) secret.locationLabel = cleanText(body.locationLabel, 0, 120, "Location label");
  if (body.lat != null) secret.lat = numberIn(body.lat, -90, 90, "Latitude");
  if (body.lng != null) secret.lng = numberIn(body.lng, -180, 180, "Longitude");
  let status = found.row.status;
  let classification = found.row.classification;
  if (body.status != null) {
    status = String(body.status);
    if (!STATUSES.has(status)) throw new InputError("Status is not recognised.");
  }
  if (body.classification != null) {
    classification = String(body.classification);
    if (!CLASSIFICATIONS.has(classification)) throw new InputError("Classification is not recognised.");
  }
  ctx.app.db
    .prepare("UPDATE incidents SET secret = ?, status = ?, classification = ?, updated_at = ? WHERE id = ?")
    .run(sealSecret(ctx.app.key, secret), status, classification, new Date().toISOString(), found.row.id);
  writeAudit(ctx, "incident.update", "incident", found.row.id, `Updated ${found.row.reference}.`);
  const next = requireIncident(ctx);
  if (next) send(ctx.res, 200, presentIncident(ctx, next));
}

function addMember(ctx: RequestContext) {
  const found = requireIncident(ctx);
  if (!found) return;
  if (!canUpdateIncident(ctx.user!.role, found.sameAgency)) {
    return send(ctx.res, 403, { error: "You cannot change who is on this incident." });
  }
  const body = asObject(ctx.body);
  const person = findUserById(ctx.app, String(body.userId ?? ""));
  if (!person || person.agency_id !== found.row.agency_id || !person.active) {
    throw new InputError("Choose someone from the owning agency.");
  }
  const duty = String(body.duty ?? dutyForRole(person.role));
  if (!["lead", "planner", "search", "field", "observer"].includes(duty)) throw new InputError("Duty is not recognised.");
  ctx.app.db
    .prepare(
      `INSERT INTO incident_members (incident_id, user_id, duty) VALUES (?, ?, ?)
       ON CONFLICT(incident_id, user_id) DO UPDATE SET duty = excluded.duty`,
    )
    .run(found.row.id, person.id, duty);
  writeAudit(ctx, "incident.member", "incident", found.row.id, `Updated membership on ${found.row.reference}.`);
  send(ctx.res, 200, { ok: true });
}

function removeMember(ctx: RequestContext) {
  const found = requireIncident(ctx);
  if (!found) return;
  if (!canUpdateIncident(ctx.user!.role, found.sameAgency)) {
    return send(ctx.res, 403, { error: "You cannot change who is on this incident." });
  }
  if (ctx.params.userId === found.row.created_by) throw new InputError("The opening officer stays on the incident.");
  ctx.app.db.prepare("DELETE FROM incident_members WHERE incident_id = ? AND user_id = ?").run(found.row.id, ctx.params.userId);
  writeAudit(ctx, "incident.member_remove", "incident", found.row.id, `Removed a member from ${found.row.reference}.`);
  send(ctx.res, 200, { ok: true });
}

function addGrant(ctx: RequestContext) {
  const found = requireIncident(ctx);
  if (!found) return;
  if (!canUpdateIncident(ctx.user!.role, found.sameAgency)) {
    return send(ctx.res, 403, { error: "You cannot share this incident." });
  }
  const body = asObject(ctx.body);
  const agencyId = String(body.agencyId ?? "");
  const permission = String(body.permission ?? "");
  if (agencyId === found.row.agency_id) throw new InputError("The owning agency already has the incident.");
  if (!["view", "plan"].includes(permission)) throw new InputError("Share as view or plan.");
  const agency = ctx.app.db.prepare("SELECT id FROM agencies WHERE id = ?").get(agencyId);
  if (!agency) throw new InputError("Choose an agency.");
  const id = randomUUID();
  ctx.app.db
    .prepare(
      `INSERT INTO incident_grants (id, incident_id, agency_id, permission, granted_by, created_at)
       VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT(incident_id, agency_id) DO UPDATE SET permission = excluded.permission, granted_by = excluded.granted_by, created_at = excluded.created_at`,
    )
    .run(id, found.row.id, agencyId, permission, ctx.user!.id, new Date().toISOString());
  writeAudit(ctx, "incident.grant", "incident", found.row.id, `Shared ${found.row.reference} (${permission}).`);
  send(ctx.res, 200, { ok: true });
}

function removeGrant(ctx: RequestContext) {
  const found = requireIncident(ctx);
  if (!found) return;
  if (!canUpdateIncident(ctx.user!.role, found.sameAgency)) {
    return send(ctx.res, 403, { error: "You cannot change sharing." });
  }
  ctx.app.db.prepare("DELETE FROM incident_grants WHERE id = ? AND incident_id = ?").run(ctx.params.grantId, found.row.id);
  writeAudit(ctx, "incident.grant_remove", "incident", found.row.id, `Removed a share on ${found.row.reference}.`);
  send(ctx.res, 200, { ok: true });
}

async function createPlan(ctx: RequestContext) {
  const found = requireIncident(ctx);
  if (!found) return;
  const body = asObject(ctx.body);
  const module = String(body.module ?? "") as ModuleName;
  if (!KINDS.has(module)) throw new InputError("Choose a planning module.");
  if (!canRunPlan(ctx.user!.role, module, found.sameAgency, found.grant)) {
    return send(ctx.res, 403, { error: "Your role cannot run that plan." });
  }
  const executed = await executePlan(ctx.app, module, body.input, {
    ways: body.ways,
    environment: body.environment,
  });
  const versionRow = ctx.app.db
    .prepare("SELECT COALESCE(MAX(version), 0) AS version FROM plans WHERE incident_id = ? AND module = ?")
    .get(found.row.id, module) as { version: number };
  const version = versionRow.version + 1;
  const id = randomUUID();
  const createdAt = new Date().toISOString();
  const secret: PlanSecret = { input: executed.input, output: executed.output, context: executed.meta };
  ctx.app.db
    .prepare("INSERT INTO plans (id, incident_id, module, version, secret, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)")
    .run(id, found.row.id, module, version, sealSecret(ctx.app.key, secret), ctx.user!.id, createdAt);
  ctx.app.db.prepare("UPDATE incidents SET updated_at = ? WHERE id = ?").run(createdAt, found.row.id);
  writeAudit(ctx, "plan.create", "plan", id, `Ran ${module} v${version} on ${found.row.reference}.`);
  send(ctx.res, 201, {
    plan: {
      id,
      incidentId: found.row.id,
      module,
      version,
      createdAt,
      createdByName: ctx.user!.displayName,
      input: executed.input,
      output: executed.output,
    },
    context: executed.context,
  });
}

function auditList(ctx: RequestContext) {
  if (!ctx.user || !canViewAudit(ctx.user.role)) return send(ctx.res, 403, { error: "You cannot read the audit log." });
  const rows =
    ctx.user.role === "superadmin"
      ? (ctx.app.db.prepare("SELECT * FROM audit_log ORDER BY id DESC LIMIT 300").all() as AuditRow[])
      : (ctx.app.db
          .prepare("SELECT * FROM audit_log WHERE agency_id = ? ORDER BY id DESC LIMIT 300")
          .all(ctx.user.agencyId) as AuditRow[]);
  send(ctx.res, 200, {
    entries: rows.map((row) => ({
      id: row.id,
      at: row.at,
      action: row.action,
      summary: row.summary,
      entityType: row.entity_type,
      entityId: row.entity_id,
      actorId: row.actor_id,
    })),
  });
}

type IncidentRow = {
  id: string;
  agency_id: string;
  reference: string;
  kind: string;
  classification: string;
  status: string;
  secret: string;
  created_by: string;
  created_at: string;
  updated_at: string;
};

function visibleIncidents(ctx: RequestContext) {
  if (!ctx.user) return [];
  const rows =
    ctx.user.role === "superadmin"
      ? (ctx.app.db.prepare("SELECT * FROM incidents ORDER BY updated_at DESC").all() as IncidentRow[])
      : (ctx.app.db
          .prepare(
            `SELECT DISTINCT i.* FROM incidents i
             LEFT JOIN incident_grants g ON g.incident_id = i.id AND g.agency_id = ?
             WHERE i.agency_id = ? OR g.id IS NOT NULL
             ORDER BY i.updated_at DESC`,
          )
          .all(ctx.user.agencyId, ctx.user.agencyId) as IncidentRow[]);
  const memberships = new Set(
    (ctx.app.db.prepare("SELECT incident_id FROM incident_members WHERE user_id = ?").all(ctx.user.id) as { incident_id: string }[]).map(
      (row) => row.incident_id,
    ),
  );
  return rows.filter((row) => {
    const grant = grantFor(ctx.app, row.id, ctx.user!.agencyId);
    return canViewIncident({
      role: ctx.user!.role,
      sameAgency: row.agency_id === ctx.user!.agencyId,
      grant,
      member: memberships.has(row.id),
    });
  });
}

function requireIncident(ctx: RequestContext) {
  const row = ctx.app.db.prepare("SELECT * FROM incidents WHERE id = ?").get(ctx.params.id) as IncidentRow | undefined;
  if (!row || !ctx.user) {
    send(ctx.res, 404, { error: "Incident not found." });
    return null;
  }
  const member = Boolean(
    ctx.app.db.prepare("SELECT 1 AS ok FROM incident_members WHERE incident_id = ? AND user_id = ?").get(row.id, ctx.user.id),
  );
  const sameAgency = row.agency_id === ctx.user.agencyId;
  const grant = grantFor(ctx.app, row.id, ctx.user.agencyId);
  if (!canViewIncident({ role: ctx.user.role, sameAgency, grant, member })) {
    writeAudit(ctx, "incident.denied", "incident", row.id, "Denied an incident request.");
    send(ctx.res, 404, { error: "Incident not found." });
    return null;
  }
  return { row, secret: openSecret<IncidentSecret>(ctx.app.key, row.secret), sameAgency, grant, member };
}

function presentIncident(
  ctx: RequestContext,
  found: { row: IncidentRow; secret: IncidentSecret; sameAgency: boolean; grant: GrantLevel },
) {
  const members = ctx.app.db
    .prepare(
      `SELECT m.user_id, m.duty, u.display_name, u.appointment, u.role
       FROM incident_members m JOIN users u ON u.id = m.user_id
       WHERE m.incident_id = ? ORDER BY u.display_name`,
    )
    .all(found.row.id) as { user_id: string; duty: string; display_name: string; appointment: string; role: string }[];
  const grants = ctx.app.db
    .prepare(
      `SELECT g.id, g.agency_id, g.permission, a.name, a.short_name
       FROM incident_grants g JOIN agencies a ON a.id = g.agency_id
       WHERE g.incident_id = ?`,
    )
    .all(found.row.id) as { id: string; agency_id: string; permission: string; name: string; short_name: string }[];
  const plans = ctx.app.db
    .prepare("SELECT id, module, version, secret, created_by, created_at FROM plans WHERE incident_id = ? ORDER BY created_at DESC")
    .all(found.row.id) as { id: string; module: string; version: number; secret: string; created_by: string; created_at: string }[];
  const names = new Map(
    (ctx.app.db.prepare("SELECT id, display_name FROM users").all() as { id: string; display_name: string }[]).map((row) => [
      row.id,
      row.display_name,
    ]),
  );
  const agency = ctx.app.db.prepare("SELECT name, short_name FROM agencies WHERE id = ?").get(found.row.agency_id) as {
    name: string;
    short_name: string;
  };
  return {
    incident: {
      ...summarize(ctx, found.row),
      summary: found.secret.summary,
      agencyName: agency.name,
      createdAt: found.row.created_at,
    },
    members: members.map((member) => ({
      userId: member.user_id,
      duty: member.duty,
      displayName: member.display_name,
      appointment: member.appointment,
      role: member.role,
    })),
    grants: grants.map((grant) => ({
      id: grant.id,
      agencyId: grant.agency_id,
      agencyName: grant.name,
      shortName: grant.short_name,
      permission: grant.permission,
    })),
    plans: plans.map((plan) => {
      const secret = openSecret<PlanSecret>(ctx.app.key, plan.secret);
      return {
        id: plan.id,
        module: plan.module,
        version: plan.version,
        createdAt: plan.created_at,
        createdByName: names.get(plan.created_by) || "Removed account",
        input: secret.input,
        output: secret.output,
      };
    }),
    can: {
      update: canUpdateIncident(ctx.user!.role, found.sameAgency),
      plan: planPermissions(ctx.user!.role, found.sameAgency, found.grant),
    },
    directory: found.sameAgency
      ? listUsers(ctx.app, found.row.agency_id)
          .filter((user) => user.active)
          .map((user) => ({ id: user.id, displayName: user.display_name, appointment: user.appointment, role: user.role }))
      : [],
  };
}

function summarize(ctx: RequestContext, row: IncidentRow) {
  const secret = openSecret<IncidentSecret>(ctx.app.key, row.secret);
  const agency = ctx.app.db.prepare("SELECT short_name FROM agencies WHERE id = ?").get(row.agency_id) as { short_name: string };
  return {
    id: row.id,
    reference: row.reference,
    kind: row.kind,
    classification: row.classification,
    status: row.status,
    title: secret.title,
    locationLabel: secret.locationLabel,
    lat: secret.lat,
    lng: secret.lng,
    updatedAt: row.updated_at,
    agencyId: row.agency_id,
    agencyShort: agency.short_name,
  };
}

function grantFor(app: AppContext, incidentId: string, agencyId: string): GrantLevel {
  const row = app.db
    .prepare("SELECT permission FROM incident_grants WHERE incident_id = ? AND agency_id = ?")
    .get(incidentId, agencyId) as { permission: string } | undefined;
  if (row?.permission === "plan" || row?.permission === "view") return row.permission;
  return "none";
}

type UserRow = {
  id: string;
  agency_id: string;
  email: string;
  display_name: string;
  appointment: string;
  password_hash: string;
  role: Role;
  active: number;
  evaluation: number;
  callsign?: string | null;
  unit_id?: string | null;
  show_name?: number | null;
  agency_name: string;
  agency_short: string;
  home_lat: number;
  home_lng: number;
};

function findUserByEmail(app: AppContext, email: string): UserRow | undefined {
  return app.db
    .prepare(
      `SELECT u.*, a.name AS agency_name, a.short_name AS agency_short, a.home_lat, a.home_lng
       FROM users u JOIN agencies a ON a.id = u.agency_id WHERE u.email = ?`,
    )
    .get(email) as UserRow | undefined;
}

function findUserById(app: AppContext, id: string): UserRow | undefined {
  return app.db
    .prepare(
      `SELECT u.*, a.name AS agency_name, a.short_name AS agency_short, a.home_lat, a.home_lng
       FROM users u JOIN agencies a ON a.id = u.agency_id WHERE u.id = ?`,
    )
    .get(id) as UserRow | undefined;
}

function listUsers(app: AppContext, agencyId?: string): UserRow[] {
  const sql = `SELECT u.*, a.name AS agency_name, a.short_name AS agency_short, a.home_lat, a.home_lng
    FROM users u JOIN agencies a ON a.id = u.agency_id`;
  if (!agencyId) return app.db.prepare(`${sql} ORDER BY a.short_name, u.display_name`).all() as UserRow[];
  return app.db.prepare(`${sql} WHERE u.agency_id = ? ORDER BY u.display_name`).all(agencyId) as UserRow[];
}

function presentUser(row: UserRow) {
  return {
    id: row.id,
    email: row.email,
    displayName: row.display_name,
    appointment: row.appointment,
    role: row.role,
    roleLabel: ROLE_LABEL[row.role],
    active: Boolean(row.active),
    evaluation: Boolean(row.evaluation),
    agencyId: row.agency_id,
    agencyName: row.agency_name,
    agencyShort: row.agency_short,
    callsign: row.callsign || row.appointment,
    unitId: row.unit_id || null,
    showName: Boolean(row.show_name),
  };
}

function publicUser(row: UserRow, app: AppContext): AuthUser {
  const unit = row.unit_id
    ? (app.db.prepare("SELECT short_name, conceal_from_agency FROM units WHERE id = ?").get(row.unit_id) as
        | { short_name: string; conceal_from_agency: number }
        | undefined)
    : undefined;
  return {
    id: row.id,
    email: row.email,
    displayName: row.display_name,
    appointment: row.appointment,
    role: row.role,
    agencyId: row.agency_id,
    agencyName: row.agency_name,
    agencyShort: row.agency_short,
    homeLat: row.home_lat,
    homeLng: row.home_lng,
    evaluation: Boolean(row.evaluation),
    callsign: row.callsign || row.appointment,
    unitId: row.unit_id || null,
    unitShort: unit?.short_name || null,
    unitConcealed: Boolean(unit?.conceal_from_agency),
    showName: Boolean(row.show_name),
  };
}

function upsertPresence(ctx: RequestContext) {
  const body = asObject(ctx.body);
  const lat = Number(body.lat);
  const lng = Number(body.lng);
  if (!Number.isFinite(lat) || lat < -90 || lat > 90) throw new InputError("Latitude is not valid.");
  if (!Number.isFinite(lng) || lng < -180 || lng > 180) throw new InputError("Longitude is not valid.");
  const accuracy = body.accuracyM == null || body.accuracyM === "" ? null : Number(body.accuracyM);
  const heading = body.heading == null || body.heading === "" ? null : Number(body.heading);
  const incidentId = body.incidentId ? String(body.incidentId) : null;
  const now = new Date().toISOString();
  ctx.app.db
    .prepare(
      `INSERT INTO presence (user_id, lat, lng, accuracy_m, heading, incident_id, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(user_id) DO UPDATE SET lat = excluded.lat, lng = excluded.lng, accuracy_m = excluded.accuracy_m,
         heading = excluded.heading, incident_id = excluded.incident_id, updated_at = excluded.updated_at`,
    )
    .run(ctx.user!.id, lat, lng, Number.isFinite(accuracy as number) ? accuracy : null, Number.isFinite(heading as number) ? heading : null, incidentId, now);
  send(ctx.res, 200, { ok: true, updatedAt: now });
}

function listPresence(ctx: RequestContext) {
  const scope = String(ctx.url.searchParams.get("scope") || "incident");
  const incidentId = ctx.url.searchParams.get("incidentId");
  const viewer = ctx.user!;
  const cutoff = new Date(Date.now() - 15 * 60 * 1000).toISOString();
  const rows = ctx.app.db
    .prepare(
      `SELECT p.user_id, p.lat, p.lng, p.accuracy_m, p.heading, p.incident_id, p.updated_at,
              u.display_name, u.appointment, u.callsign, u.show_name, u.unit_id, u.agency_id,
              un.short_name AS unit_short, un.conceal_from_agency
       FROM presence p
       JOIN users u ON u.id = p.user_id
       LEFT JOIN units un ON un.id = u.unit_id
       WHERE p.updated_at >= ?`,
    )
    .all(cutoff) as {
    user_id: string;
    lat: number;
    lng: number;
    accuracy_m: number | null;
    heading: number | null;
    incident_id: string | null;
    updated_at: string;
    display_name: string;
    appointment: string;
    callsign: string | null;
    show_name: number | null;
    unit_id: string | null;
    agency_id: string;
    unit_short: string | null;
    conceal_from_agency: number | null;
  }[];

  const memberIds = new Set<string>();
  if (incidentId) {
    const members = ctx.app.db.prepare("SELECT user_id FROM incident_members WHERE incident_id = ?").all(incidentId) as { user_id: string }[];
    for (const member of members) memberIds.add(member.user_id);
  }

  const visible = rows.filter((row) => {
    if (row.user_id === viewer.id) return true;
    const concealed = Boolean(row.conceal_from_agency);
    const sameUnit = Boolean(viewer.unitId && row.unit_id && viewer.unitId === row.unit_id);
    if (concealed && !sameUnit) {
      // Private units stay hidden from the wider organisation, but remain visible to colleagues on the same incident.
      if (!(scope === "incident" && incidentId && memberIds.has(row.user_id) && memberIds.has(viewer.id))) return false;
    }
    if (scope === "agency") return row.agency_id === viewer.agencyId;
    if (scope === "incident") {
      if (!incidentId) return false;
      if (memberIds.has(row.user_id)) return true;
      return row.agency_id === viewer.agencyId && row.incident_id === incidentId;
    }
    return false;
  });

  send(ctx.res, 200, {
    scope,
    positions: visible.map((row) => ({
      userId: row.user_id,
      callsign: row.callsign || row.appointment,
      name: row.show_name ? row.display_name : undefined,
      appointment: row.appointment,
      unitShort: row.unit_short,
      lat: row.lat,
      lng: row.lng,
      accuracyM: row.accuracy_m,
      heading: row.heading,
      incidentId: row.incident_id,
      updatedAt: row.updated_at,
      self: row.user_id === viewer.id,
    })),
  });
}

function listLights(ctx: RequestContext) {
  const south = Number(ctx.url.searchParams.get("south"));
  const west = Number(ctx.url.searchParams.get("west"));
  const north = Number(ctx.url.searchParams.get("north"));
  const east = Number(ctx.url.searchParams.get("east"));
  if (![south, west, north, east].every(Number.isFinite)) throw new InputError("A map box is required for lights.");
  const agency = ctx.app.db
    .prepare(
      `SELECT id, lat, lng, label FROM agency_lights
       WHERE agency_id = ? AND lat BETWEEN ? AND ? AND lng BETWEEN ? AND ?`,
    )
    .all(ctx.user!.agencyId, south, north, west, east) as { id: string; lat: number; lng: number; label: string | null }[];
  const cached = ctx.app.db
    .prepare("SELECT body FROM cache WHERE kind = 'osm' ORDER BY stored_at DESC LIMIT 8")
    .all() as { body: string }[];
  const osm: { id: string; lat: number; lng: number }[] = [];
  for (const row of cached) {
    try {
      const packed = JSON.parse(row.body) as { lights?: { id: string; position: { lat: number; lng: number } }[] };
      for (const light of packed.lights ?? []) {
        if (light.position.lat < south || light.position.lat > north || light.position.lng < west || light.position.lng > east) continue;
        osm.push({ id: light.id, lat: light.position.lat, lng: light.position.lng });
      }
    } catch {
      /* ignore bad cache rows */
    }
  }
  send(ctx.res, 200, {
    lights: [
      ...agency.map((light) => ({ id: light.id, lat: light.lat, lng: light.lng, label: light.label || "Agency light", source: "agency" as const })),
      ...osm.map((light) => ({ id: light.id, lat: light.lat, lng: light.lng, label: "Street light", source: "osm" as const })),
    ],
  });
}

function createLight(ctx: RequestContext) {
  const role = ctx.user!.role;
  if (role !== "superadmin" && role !== "agency_admin" && role !== "commander" && role !== "planner") {
    send(ctx.res, 403, { error: "Your role cannot add agency lights." });
    return;
  }
  const body = asObject(ctx.body);
  const lat = Number(body.lat);
  const lng = Number(body.lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) throw new InputError("A light needs a position.");
  const id = randomUUID();
  const now = new Date().toISOString();
  ctx.app.db
    .prepare("INSERT INTO agency_lights (id, agency_id, lat, lng, label, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)")
    .run(id, ctx.user!.agencyId, lat, lng, body.label ? String(body.label).slice(0, 80) : "Agency light", ctx.user!.id, now);
  writeAudit(ctx, "light.create", "light", id, "Added an agency street light.");
  send(ctx.res, 201, { id, lat, lng, label: body.label || "Agency light", source: "agency" });
}

function userFromRequest(app: AppContext, req: http.IncomingMessage): AuthUser | null {
  const token = readCookie(req.headers.cookie, "preserve_session");
  if (!token) return null;
  const row = app.db
    .prepare("SELECT user_id, expires_at, revoked FROM sessions WHERE token_hash = ?")
    .get(sha256(token)) as { user_id: string; expires_at: string; revoked: number } | undefined;
  if (!row || row.revoked || new Date(row.expires_at).getTime() < Date.now()) return null;
  const user = findUserById(app, row.user_id);
  if (!user || !user.active) return null;
  return publicUser(user, app);
}

type AuditRow = {
  id: number;
  at: string;
  actor_id: string | null;
  agency_id: string | null;
  action: string;
  entity_type: string | null;
  entity_id: string | null;
  summary: string;
};

function writeAudit(ctx: RequestContext, action: string, entityType: string, entityId: string | undefined, summary: string) {
  ctx.app.db
    .prepare(
      `INSERT INTO audit_log (at, actor_id, agency_id, action, entity_type, entity_id, summary, ip)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(new Date().toISOString(), ctx.user?.id ?? null, ctx.user?.agencyId ?? null, action, entityType, entityId ?? null, summary, ctx.ip);
}

function nextReference(app: AppContext, shortName: string) {
  for (let attempt = 0; attempt < 5; attempt++) {
    const stamp = Date.now().toString(36).toUpperCase().slice(-5);
    const noise = Math.floor(Math.random() * 1296).toString(36).toUpperCase().padStart(2, "0");
    const reference = `PRV-${shortName}-${stamp}${noise}`;
    const existing = app.db.prepare("SELECT 1 FROM incidents WHERE reference = ?").get(reference);
    if (!existing) return reference;
  }
  return `PRV-${shortName}-${randomUUID().slice(0, 8).toUpperCase()}`;
}

function dutyForRole(role: string) {
  if (role === "planner") return "planner";
  if (role === "search_coordinator") return "search";
  if (role === "field_officer") return "field";
  if (role === "observer") return "observer";
  return "lead";
}

function evaluationActive(app: AppContext) {
  const row = app.db.prepare("SELECT COUNT(*) AS n FROM users WHERE evaluation = 1 AND active = 1").get() as { n: number };
  return row.n > 0;
}

function tileUrl() {
  const configured = process.env.PRESERVE_TILE_URL;
  if (
    configured &&
    /^https:\/\/[A-Za-z0-9.-]+\/[A-Za-z0-9._{}\/-]+$/.test(configured) &&
    configured.includes("{z}")
  ) {
    return configured;
  }
  return "https://tile.openstreetmap.org/{z}/{x}/{y}.png";
}

function sessionCookie(token: string, clear = false) {
  const secure = process.env.PRESERVE_ENV === "production" ? "; Secure" : "";
  return `preserve_session=${clear ? "" : token}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${clear ? 0 : SESSION_MS / 1000}${secure}`;
}

function readCookie(header: string | undefined, name: string) {
  if (!header) return "";
  for (const part of header.split(";")) {
    const [key, ...rest] = part.trim().split("=");
    if (key === name) return decodeURIComponent(rest.join("="));
  }
  return "";
}

function send(res: http.ServerResponse, status: number, data: unknown, extra: Record<string, string> = {}) {
  const body = JSON.stringify(data);
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "content-length": Buffer.byteLength(body),
    "cache-control": "no-store",
    "x-content-type-options": "nosniff",
    "referrer-policy": "no-referrer",
    "x-frame-options": "DENY",
    ...extra,
  });
  res.end(body);
}

function readBody(req: http.IncomingMessage): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;
    req.on("data", (chunk: Buffer) => {
      size += chunk.length;
      if (size > 6_000_000) {
        reject(new InputError("The request is too large."));
        req.destroy();
      } else chunks.push(chunk);
    });
    req.on("end", () => {
      if (!chunks.length) {
        resolve({});
        return;
      }
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString("utf8")));
      } catch {
        reject(new InputError("The request was not valid JSON."));
      }
    });
    req.on("error", reject);
  });
}

function asObject(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new InputError("The request was empty.");
  return value as Record<string, unknown>;
}

function cleanText(value: unknown, min: number, max: number, label: string) {
  const text = String(value ?? "").trim().replace(/\s+/g, " ");
  if (text.length < min || text.length > max) {
    throw new InputError(min === 0 ? `${label} must be under ${max} characters.` : `${label} must be ${min} to ${max} characters.`);
  }
  return text;
}

function numberIn(value: unknown, min: number, max: number, label: string) {
  const number = Number(value);
  if (!Number.isFinite(number) || number < min || number > max) throw new InputError(`${label} is not valid.`);
  return number;
}

function assertPassword(password: string) {
  if (password.length < 12 || password.length > 200 || !/[A-Za-z]/.test(password) || !/\d/.test(password)) {
    throw new InputError("Use a password of at least 12 characters, with a letter and a number.");
  }
}

const MIME: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".webmanifest": "application/manifest+json",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".ico": "image/x-icon",
};

function serveStatic(req: http.IncomingMessage, res: http.ServerResponse, pathname: string) {
  const root = path.resolve("dist");
  const relative = pathname === "/" ? "/index.html" : pathname;
  const target = path.normalize(path.join(root, relative));
  if (!target.startsWith(root)) {
    send(res, 403, { error: "Not found." });
    return;
  }
  const file = fs.existsSync(target) && fs.statSync(target).isFile() ? target : path.join(root, "index.html");
  if (!fs.existsSync(file)) {
    send(res, 404, { error: "The interface has not been built." });
    return;
  }
  const ext = path.extname(file);
  const headers: Record<string, string> = {
    "content-type": MIME[ext] || "application/octet-stream",
    "x-content-type-options": "nosniff",
    "referrer-policy": "no-referrer",
    "x-frame-options": "DENY",
  };
  if (ext === ".html") {
    headers["cache-control"] = "no-cache";
    headers["content-security-policy"] =
      "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob: https:; connect-src 'self'; font-src 'self' data:; worker-src 'self'; manifest-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'";
  } else {
    headers["cache-control"] = "public, max-age=86400";
  }
  res.writeHead(200, headers);
  fs.createReadStream(file).pipe(res);
  void req;
}
