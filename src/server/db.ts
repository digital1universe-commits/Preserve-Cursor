import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { decryptJson, encryptJson, hashPassword, loadMasterKey } from "./crypto.js";
import type { Role } from "./rbac.js";

export type IncidentSecret = {
  title: string;
  summary: string;
  locationLabel: string;
  lat: number;
  lng: number;
};

export type PlanSecret = {
  input: unknown;
  output: unknown;
  context?: unknown;
};

export type AppContext = {
  db: DatabaseSync;
  key: Buffer;
  dataDir: string;
};

const EVAL_PASSWORD = "Harbour-Watch-1948";

export function openContext(dataDir = process.env.PRESERVE_DATA_DIR || path.join(process.cwd(), "data")): AppContext {
  fs.mkdirSync(dataDir, { recursive: true });
  const key = loadMasterKey(dataDir);
  const db = new DatabaseSync(path.join(dataDir, "preserve.db"));
  db.exec("PRAGMA journal_mode = WAL;");
  db.exec("PRAGMA foreign_keys = ON;");
  migrate(db);
  seed(db, key);
  ensureOperationalExtras(db, key);
  return { db, key, dataDir };
}

function migrate(db: DatabaseSync) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS agencies (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      short_name TEXT NOT NULL UNIQUE,
      kind TEXT NOT NULL,
      home_lat REAL NOT NULL,
      home_lng REAL NOT NULL,
      created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      agency_id TEXT NOT NULL REFERENCES agencies(id),
      email TEXT NOT NULL UNIQUE,
      display_name TEXT NOT NULL,
      appointment TEXT NOT NULL,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL,
      active INTEGER NOT NULL DEFAULT 1,
      evaluation INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      last_login_at TEXT
    );
    CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id),
      token_hash TEXT NOT NULL UNIQUE,
      expires_at TEXT NOT NULL,
      created_at TEXT NOT NULL,
      revoked INTEGER NOT NULL DEFAULT 0
    );
    CREATE TABLE IF NOT EXISTS incidents (
      id TEXT PRIMARY KEY,
      agency_id TEXT NOT NULL REFERENCES agencies(id),
      reference TEXT NOT NULL UNIQUE,
      kind TEXT NOT NULL,
      classification TEXT NOT NULL,
      status TEXT NOT NULL,
      secret TEXT NOT NULL,
      created_by TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS incident_members (
      incident_id TEXT NOT NULL REFERENCES incidents(id),
      user_id TEXT NOT NULL REFERENCES users(id),
      duty TEXT NOT NULL,
      PRIMARY KEY (incident_id, user_id)
    );
    CREATE TABLE IF NOT EXISTS incident_grants (
      id TEXT PRIMARY KEY,
      incident_id TEXT NOT NULL REFERENCES incidents(id),
      agency_id TEXT NOT NULL REFERENCES agencies(id),
      permission TEXT NOT NULL,
      granted_by TEXT NOT NULL,
      created_at TEXT NOT NULL,
      UNIQUE (incident_id, agency_id)
    );
    CREATE TABLE IF NOT EXISTS plans (
      id TEXT PRIMARY KEY,
      incident_id TEXT NOT NULL REFERENCES incidents(id),
      module TEXT NOT NULL,
      version INTEGER NOT NULL,
      secret TEXT NOT NULL,
      created_by TEXT NOT NULL,
      created_at TEXT NOT NULL,
      UNIQUE (incident_id, module, version)
    );
    CREATE TABLE IF NOT EXISTS audit_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      at TEXT NOT NULL,
      actor_id TEXT,
      agency_id TEXT,
      action TEXT NOT NULL,
      entity_type TEXT,
      entity_id TEXT,
      summary TEXT NOT NULL,
      ip TEXT
    );
    CREATE TABLE IF NOT EXISTS cache (
      cache_key TEXT PRIMARY KEY,
      kind TEXT NOT NULL,
      body TEXT NOT NULL,
      stored_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS units (
      id TEXT PRIMARY KEY,
      agency_id TEXT NOT NULL REFERENCES agencies(id),
      name TEXT NOT NULL,
      short_name TEXT NOT NULL,
      conceal_from_agency INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      UNIQUE (agency_id, short_name)
    );
    CREATE TABLE IF NOT EXISTS presence (
      user_id TEXT PRIMARY KEY REFERENCES users(id),
      lat REAL NOT NULL,
      lng REAL NOT NULL,
      accuracy_m REAL,
      heading REAL,
      incident_id TEXT,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS agency_lights (
      id TEXT PRIMARY KEY,
      agency_id TEXT NOT NULL REFERENCES agencies(id),
      lat REAL NOT NULL,
      lng REAL NOT NULL,
      label TEXT,
      created_by TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS incidents_agency ON incidents(agency_id, updated_at);
    CREATE INDEX IF NOT EXISTS audit_at ON audit_log(id DESC);
    CREATE INDEX IF NOT EXISTS presence_updated ON presence(updated_at);
    CREATE INDEX IF NOT EXISTS agency_lights_agency ON agency_lights(agency_id);
  `);
  ensureColumn(db, "users", "callsign", "TEXT");
  ensureColumn(db, "users", "unit_id", "TEXT");
  ensureColumn(db, "users", "show_name", "INTEGER NOT NULL DEFAULT 0");
}

function ensureColumn(db: DatabaseSync, table: string, column: string, definition: string) {
  const rows = db.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[];
  if (rows.some((row) => row.name === column)) return;
  db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
}

function seed(db: DatabaseSync, key: Buffer) {
  const count = db.prepare("SELECT COUNT(*) AS n FROM users").get() as { n: number };
  if (count.n > 0) return;
  const now = new Date().toISOString();
  const password = hashPassword(EVAL_PASSWORD);
  const agencies = [
    ["jor", "Joint Operations Registry", "JOR", "registry", -36.83, 174.798],
    ["hmp", "Harbour Metro Police", "HMP", "police", -36.83, 174.798],
    ["crc", "Coastal Rescue Coordination", "CRC", "rescue", -36.83, 174.798],
  ];
  const insertAgency = db.prepare(
    "INSERT INTO agencies (id, name, short_name, kind, home_lat, home_lng, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
  );
  const insertUser = db.prepare(
    `INSERT INTO users (id, agency_id, email, display_name, appointment, password_hash, role, active, evaluation, created_at, callsign, unit_id, show_name)
     VALUES (?, ?, ?, ?, ?, ?, ?, 1, 1, ?, ?, ?, 0)`,
  );
  const insertUnit = db.prepare(
    "INSERT INTO units (id, agency_id, name, short_name, conceal_from_agency, created_at) VALUES (?, ?, ?, ?, ?, ?)",
  );
  db.exec("BEGIN");
  try {
    for (const agency of agencies) insertAgency.run(...agency, now);
    insertUnit.run("hmp-general", "hmp", "General duties", "GD", 0, now);
    insertUnit.run("hmp-aos", "hmp", "Armed offenders", "AOS", 1, now);
    insertUnit.run("crc-marine", "crc", "Marine desk", "MAR", 0, now);
    const users: [string, string, string, string, string, Role, string, string][] = [
      ["registrar", "jor", "registrar@preserve.test", "System registrar", "Registry", "superadmin", "JOR-1", ""],
      ["controller", "hmp", "controller@hmp.preserve.test", "Duty controller", "Duty controller", "agency_admin", "HMP-CTRL", "hmp-general"],
      ["commander", "hmp", "commander@hmp.preserve.test", "Incident commander", "Incident commander", "commander", "HMP-IC1", "hmp-general"],
      ["planner", "hmp", "planner@hmp.preserve.test", "Tactical planner", "Tactical planner", "planner", "HMP-P1", "hmp-general"],
      ["field", "hmp", "field@hmp.preserve.test", "Field officer", "Field officer", "field_officer", "HMP-F12", "hmp-general"],
      ["search", "crc", "search@crc.preserve.test", "Search coordinator", "Search coordinator", "search_coordinator", "CRC-S1", "crc-marine"],
      ["watch", "crc", "watch@crc.preserve.test", "Watch officer", "Watch officer", "agency_admin", "CRC-W1", "crc-marine"],
    ];
    for (const user of users) {
      insertUser.run(user[0], user[1], user[2], user[3], user[4], password, user[5], now, user[6], user[7] || null);
    }
    insertIncident(db, key, {
      id: "inc-cordon",
      agencyId: "hmp",
      reference: "PRV-HMP-CORDON",
      kind: "cordon",
      classification: "training",
      status: "active",
      createdBy: "commander",
      secret: {
        title: "Training — warehouse cordon",
        summary: "Exercise only. A reported occupant inside a detached warehouse. Plan the containment ring and the outer cordon.",
        locationLabel: "Devonport training sector",
        lat: -36.8297,
        lng: 174.7964,
      },
      members: [
        ["commander", "lead"],
        ["planner", "planner"],
        ["field", "field"],
      ],
    });
    insertIncident(db, key, {
      id: "inc-land",
      agencyId: "hmp",
      reference: "PRV-HMP-LAND",
      kind: "land_sar",
      classification: "training",
      status: "active",
      createdBy: "commander",
      secret: {
        title: "Training — overdue walker",
        summary: "Exercise only. Adult walker last seen on the high ground, confused about the tracks down.",
        locationLabel: "Mount Victoria training sector",
        lat: -36.8266,
        lng: 174.7986,
      },
      members: [
        ["commander", "lead"],
        ["planner", "planner"],
      ],
      grants: [["grant-land-crc", "crc", "view"]],
    });
    insertIncident(db, key, {
      id: "inc-marine",
      agencyId: "crc",
      reference: "PRV-CRC-SEA",
      kind: "marine_sar",
      classification: "training",
      status: "active",
      createdBy: "search",
      secret: {
        title: "Training — overdue cabin cruiser",
        summary: "Exercise only. 12 m cabin cruiser overdue from a gulf position. No distress call in the exercise.",
        locationLabel: "Hauraki training position",
        lat: -36.75,
        lng: 174.9,
      },
      members: [
        ["search", "search"],
        ["watch", "lead"],
      ],
      grants: [["grant-sea-hmp", "hmp", "plan"]],
    });
    insertIncident(db, key, {
      id: "inc-order",
      agencyId: "hmp",
      reference: "PRV-HMP-ORDER",
      kind: "public_order",
      classification: "training",
      status: "active",
      createdBy: "commander",
      secret: {
        title: "Training — harbour protest march",
        summary: "Exercise only. Planned foot protest from the ferry area toward the civic strip. Keep the march on route and protect nearby sites.",
        locationLabel: "Devonport waterfront training sector",
        lat: -36.8312,
        lng: 174.7968,
      },
      members: [
        ["commander", "lead"],
        ["planner", "planner"],
        ["field", "field"],
      ],
    });
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}

function insertIncident(
  db: DatabaseSync,
  key: Buffer,
  incident: {
    id: string;
    agencyId: string;
    reference: string;
    kind: string;
    classification: string;
    status: string;
    createdBy: string;
    secret: IncidentSecret;
    members: [string, string][];
    grants?: [string, string, string][];
  },
) {
  const now = new Date().toISOString();
  db.prepare(
    `INSERT INTO incidents (id, agency_id, reference, kind, classification, status, secret, created_by, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    incident.id,
    incident.agencyId,
    incident.reference,
    incident.kind,
    incident.classification,
    incident.status,
    encryptJson(key, incident.secret),
    incident.createdBy,
    now,
    now,
  );
  const member = db.prepare("INSERT INTO incident_members (incident_id, user_id, duty) VALUES (?, ?, ?)");
  for (const [userId, duty] of incident.members) member.run(incident.id, userId, duty);
  const grant = db.prepare(
    "INSERT INTO incident_grants (id, incident_id, agency_id, permission, granted_by, created_at) VALUES (?, ?, ?, ?, ?, ?)",
  );
  for (const [id, agencyId, permission] of incident.grants ?? []) {
    grant.run(id, incident.id, agencyId, permission, incident.createdBy, now);
  }
}

function ensureOperationalExtras(db: DatabaseSync, key: Buffer) {
  const now = new Date().toISOString();
  const units = db.prepare("SELECT COUNT(*) AS n FROM units").get() as { n: number };
  if (units.n === 0) {
    const insertUnit = db.prepare(
      "INSERT OR IGNORE INTO units (id, agency_id, name, short_name, conceal_from_agency, created_at) VALUES (?, ?, ?, ?, ?, ?)",
    );
    insertUnit.run("hmp-general", "hmp", "General duties", "GD", 0, now);
    insertUnit.run("hmp-aos", "hmp", "Armed offenders", "AOS", 1, now);
    insertUnit.run("crc-marine", "crc", "Marine desk", "MAR", 0, now);
  }
  const patch = db.prepare("UPDATE users SET callsign = COALESCE(NULLIF(callsign, ''), ?), unit_id = COALESCE(unit_id, ?) WHERE id = ?");
  patch.run("HMP-IC1", "hmp-general", "commander");
  patch.run("HMP-P1", "hmp-general", "planner");
  patch.run("HMP-F12", "hmp-general", "field");
  patch.run("HMP-CTRL", "hmp-general", "controller");
  patch.run("CRC-S1", "crc-marine", "search");
  patch.run("CRC-W1", "crc-marine", "watch");
  patch.run("JOR-1", null, "registrar");
  const order = db.prepare("SELECT id FROM incidents WHERE id = 'inc-order'").get() as { id: string } | undefined;
  if (!order) {
    insertIncident(db, key, {
      id: "inc-order",
      agencyId: "hmp",
      reference: "PRV-HMP-ORDER",
      kind: "public_order",
      classification: "training",
      status: "active",
      createdBy: "commander",
      secret: {
        title: "Training — harbour protest march",
        summary: "Exercise only. Planned foot protest from the ferry area toward the civic strip. Keep the march on route and protect nearby sites.",
        locationLabel: "Devonport waterfront training sector",
        lat: -36.8312,
        lng: 174.7968,
      },
      members: [
        ["commander", "lead"],
        ["planner", "planner"],
        ["field", "field"],
      ],
    });
  }
}

export function openSecret<T>(key: Buffer, payload: string): T {
  return decryptJson<T>(key, payload);
}

export function sealSecret(key: Buffer, value: unknown): string {
  return encryptJson(key, value);
}
