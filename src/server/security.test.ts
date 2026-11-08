import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { decryptJson, encryptJson, hashPassword, verifyPassword } from "./crypto.js";
import { assertEgress } from "./egress.js";
import { canRunPlan, canViewIncident } from "./rbac.js";

test("egress allows only environmental hosts and numeric queries", () => {
  assert.doesNotThrow(() =>
    assertEgress(
      "api.open-meteo.com",
      "/v1/forecast?latitude=-36.8&longitude=174.8&current=wind_speed_10m,wind_direction_10m&wind_speed_unit=kn&timezone=UTC",
    ),
  );
  assert.throws(() => assertEgress("api.openai.com", "/v1/chat"));
  assert.throws(() => assertEgress("api.open-meteo.com", "/v1/chat?latitude=1&longitude=2"));
  assert.throws(() =>
    assertEgress("api.open-meteo.com", "/v1/forecast?latitude=-36.8&longitude=174.8&prompt=case-notes"),
  );
  assert.throws(() => assertEgress("api.openstreetmap.org", "/api/0.6/map?bbox=1,2,3,not-a-number"));
});

test("records round-trip through AES-GCM and passwords do not compare early", () => {
  process.env.PRESERVE_SCRYPT_N = "1024";
  const key = Buffer.alloc(32, 9);
  const sealed = encryptJson(key, { title: "Exercise subject" });
  assert.equal(sealed.includes("Exercise"), false);
  assert.deepEqual(decryptJson(key, sealed), { title: "Exercise subject" });
  const hash = hashPassword("Harbour-Watch-1948");
  assert.equal(hash.includes("Harbour"), false);
  assert.equal(verifyPassword("Harbour-Watch-1948", hash), true);
  assert.equal(verifyPassword("Harbour-Watch-1949", hash), false);
});

test("field officers see assigned incidents only and cannot plan", () => {
  assert.equal(
    canViewIncident({ role: "field_officer", sameAgency: true, grant: "none", member: false }),
    false,
  );
  assert.equal(
    canViewIncident({ role: "field_officer", sameAgency: true, grant: "none", member: true }),
    true,
  );
  assert.equal(canRunPlan("field_officer", "cordon", true, "none"), false);
  assert.equal(canRunPlan("commander", "marine_sar", false, "plan"), true);
  assert.equal(canRunPlan("commander", "marine_sar", false, "view"), false);
  assert.equal(canRunPlan("search_coordinator", "cordon", true, "none"), false);
  assert.equal(canRunPlan("search_coordinator", "land_sar", true, "none"), true);
});

test("accounts, grants, and plans stay inside the installation", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "preserve-"));
  process.env.PRESERVE_DATA_DIR = dir;
  process.env.PRESERVE_MASTER_KEY = Buffer.alloc(32, 4).toString("base64");
  process.env.PRESERVE_SCRYPT_N = "1024";
  process.env.PRESERVE_DEMO_BANNER = "1";
  process.env.PRESERVE_ENV = "test";
  process.env.PRESERVE_BLOCK_EGRESS = "1";
  const { createServer } = await import("./http.js");
  const server = createServer();
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("No port");
  const base = `http://127.0.0.1:${address.port}`;

  const bootstrap = await fetch(`${base}/api/auth/bootstrap`).then((res) => res.json());
  assert.equal(bootstrap.demoBanner, true);
  assert.equal(bootstrap.password, "Harbour-Watch-1948");

  const fieldCookie = await signIn(base, "field@hmp.preserve.test");
  const fieldList = await fetch(`${base}/api/incidents`, { headers: { cookie: fieldCookie } }).then((res) => res.json());
  assert.deepEqual(
    fieldList.incidents.map((item: { id: string }) => item.id),
    ["inc-cordon"],
  );
  const hidden = await fetch(`${base}/api/incidents/inc-land`, { headers: { cookie: fieldCookie } });
  assert.equal(hidden.status, 404);
  const denied = await fetch(`${base}/api/incidents/inc-cordon/plans`, {
    method: "POST",
    headers: { cookie: fieldCookie, "content-type": "application/json" },
    body: JSON.stringify({
      module: "cordon",
      input: { subject: { lat: -36.83, lng: 174.8 }, structure: "detached", exits: 4, risk: "unknown" },
    }),
  });
  assert.equal(denied.status, 403);

  const commanderCookie = await signIn(base, "commander@hmp.preserve.test");
  const shared = await fetch(`${base}/api/incidents/inc-marine`, { headers: { cookie: commanderCookie } });
  assert.equal(shared.status, 200);
  const marine = await fetch(`${base}/api/incidents/inc-marine/plans`, {
    method: "POST",
    headers: { cookie: commanderCookie, "content-type": "application/json" },
    body: JSON.stringify({
      module: "marine_sar",
      input: {
        lkp: { lat: -36.75, lng: 174.9 },
        hoursMissing: 6,
        vessel: "cabin_cruiser",
        lengthM: 12,
      },
      environment: {
        windSpeedKn: 20,
        windFromDeg: 0,
        currentSpeedKn: 0,
        currentTowardDeg: 0,
        source: "manual",
      },
    }),
  });
  assert.equal(marine.status, 201);
  const marineBody = await marine.json();
  assert.equal(marineBody.plan.output.model, "preserve-marine-sar-v1");
  assert.ok(marineBody.plan.output.datum.lat < -36.75);

  const cordon = await fetch(`${base}/api/incidents/inc-cordon/plans`, {
    method: "POST",
    headers: { cookie: commanderCookie, "content-type": "application/json" },
    body: JSON.stringify({
      module: "cordon",
      input: { subject: { lat: -36.8297, lng: 174.7964 }, structure: "commercial", risk: "firearm" },
    }),
  });
  assert.equal(cordon.status, 201);
  const cordonBody = await cordon.json();
  assert.ok(cordonBody.plan.output.standoffM >= 90);
  assert.equal(cordonBody.plan.output.posts.filter((post: { kind: string }) => post.kind === "scene").length, 4);
  assert.match(JSON.stringify(cordonBody.plan.output.narrative), /does not describe an approach/i);

  const audit = await fetch(`${base}/api/audit`, { headers: { cookie: commanderCookie } }).then((res) => res.json());
  assert.ok(audit.entries.some((entry: { action: string }) => entry.action === "plan.create"));

  const raw = fs.readFileSync(path.join(dir, "preserve.db"));
  const walPath = path.join(dir, "preserve.db-wal");
  const rawWal = fs.existsSync(walPath) ? fs.readFileSync(walPath) : Buffer.alloc(0);
  const combined = Buffer.concat([raw, rawWal]).toString("utf8");
  assert.equal(combined.includes("overdue walker"), false);
  assert.equal(combined.includes("Harbour-Watch-1948"), false);
  assert.equal(combined.includes("cabin cruiser"), false);

  server.close();
});

async function signIn(base: string, email: string) {
  const response = await fetch(`${base}/api/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email, password: "Harbour-Watch-1948" }),
  });
  assert.equal(response.status, 200);
  const cookie = response.headers.get("set-cookie");
  assert.ok(cookie);
  return cookie.split(";")[0];
}
