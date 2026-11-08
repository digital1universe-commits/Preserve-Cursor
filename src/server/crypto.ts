import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
  scryptSync,
  timingSafeEqual,
} from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const VERSION = "v1";

export function loadMasterKey(dataDir: string): Buffer {
  const fromEnv = process.env.PRESERVE_MASTER_KEY;
  if (fromEnv) {
    const key = Buffer.from(fromEnv, "base64");
    if (key.length !== 32) {
      throw new Error("PRESERVE_MASTER_KEY must be 32 bytes, encoded as base64.");
    }
    return key;
  }
  const keyPath = path.join(dataDir, "master.key");
  if (fs.existsSync(keyPath)) {
    const key = Buffer.from(fs.readFileSync(keyPath, "utf8").trim(), "base64");
    if (key.length !== 32) throw new Error("The installation key is unreadable.");
    return key;
  }
  fs.mkdirSync(dataDir, { recursive: true });
  const key = randomBytes(32);
  fs.writeFileSync(keyPath, `${key.toString("base64")}\n`, { mode: 0o600 });
  return key;
}

export function encryptJson(key: Buffer, value: unknown): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const ciphertext = Buffer.concat([
    cipher.update(JSON.stringify(value), "utf8"),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();
  return `${VERSION}.${Buffer.concat([iv, tag, ciphertext]).toString("base64")}`;
}

export function decryptJson<T>(key: Buffer, payload: string): T {
  const [version, body] = payload.split(".");
  if (version !== VERSION || !body) throw new Error("Record could not be opened.");
  const raw = Buffer.from(body, "base64");
  const iv = raw.subarray(0, 12);
  const tag = raw.subarray(12, 28);
  const ciphertext = raw.subarray(28);
  const decipher = createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(tag);
  const plain = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  return JSON.parse(plain.toString("utf8")) as T;
}

export function hashPassword(password: string): string {
  const { N, r, p } = scryptOptions();
  const salt = randomBytes(16);
  const hash = scryptSync(password, salt, 32, { N, r, p });
  return `scrypt$${N}$${r}$${p}$${salt.toString("hex")}$${hash.toString("hex")}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  const [scheme, nRaw, rRaw, pRaw, saltHex, hashHex] = stored.split("$");
  if (scheme !== "scrypt" || !saltHex || !hashHex) return false;
  const expected = Buffer.from(hashHex, "hex");
  const actual = scryptSync(password, Buffer.from(saltHex, "hex"), expected.length, {
    N: Number(nRaw),
    r: Number(rRaw),
    p: Number(pRaw),
  });
  if (actual.length !== expected.length) return false;
  return timingSafeEqual(actual, expected);
}

export function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

export function newToken(): string {
  return randomBytes(32).toString("hex");
}

function scryptOptions(): { N: number; r: number; p: number } {
  const N = Number(process.env.PRESERVE_SCRYPT_N || 16384);
  if (!Number.isInteger(N) || N < 1024) return { N: 16384, r: 8, p: 1 };
  return { N, r: 8, p: 1 };
}
