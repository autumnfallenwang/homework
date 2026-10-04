// Credentials at rest (ADR 0010): the TeacherEase portal passwords
// (`children.portal_password`) and the SMTP password (`settings` "smtp.password")
// are stored sealed with AES-256-GCM as `enc:v1:<base64(iv | tag | ciphertext)>`.
//
// The key is derived from BETTER_AUTH_SECRET with HKDF (its own salt and label),
// so it lives in the cluster Secret, never in the database, and needs no secret of
// its own. Rotating BETTER_AUTH_SECRET therefore needs the credentials unsealed
// first (src/scripts/unseal-credentials.ts) and sealed again on the next boot.
//
// A value without the prefix is a plaintext one from before ADR 0010: it reads as
// is, and the API seals it on boot (services/credentials.ts).

import { createCipheriv, createDecipheriv, hkdfSync, randomBytes } from "node:crypto";
import { config } from "../config.js";

const PREFIX = "enc:v1:";
const IV_BYTES = 12;
const TAG_BYTES = 16;

/** Settings keys whose values are credentials. */
export const CREDENTIAL_SETTING_KEYS: ReadonlySet<string> = new Set(["smtp.password"]);

let derivedKey: Buffer | null = null;

function key(): Buffer {
  if (derivedKey) return derivedKey;
  const secret = config.betterAuthSecret;
  if (!secret) throw new Error("BETTER_AUTH_SECRET is required to seal or open credentials");
  derivedKey = Buffer.from(hkdfSync("sha256", secret, "homework", "credentials at rest v1", 32));
  return derivedKey;
}

export function isSealed(value: string): boolean {
  return value.startsWith(PREFIX);
}

/** Seal a credential for storage. Empty stays empty (nothing to protect, and "not set" stays readable). */
export function sealCredential(plain: string): string {
  if (plain === "" || isSealed(plain)) return plain;
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv("aes-256-gcm", key(), iv);
  const body = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  return PREFIX + Buffer.concat([iv, cipher.getAuthTag(), body]).toString("base64");
}

/** The stored value back as plaintext; a legacy plaintext value passes through. Throws if tampered with or sealed under another key. */
export function openCredential(stored: string): string {
  if (!isSealed(stored)) return stored;
  const raw = Buffer.from(stored.slice(PREFIX.length), "base64");
  const iv = raw.subarray(0, IV_BYTES);
  const tag = raw.subarray(IV_BYTES, IV_BYTES + TAG_BYTES);
  const decipher = createDecipheriv("aes-256-gcm", key(), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([
    decipher.update(raw.subarray(IV_BYTES + TAG_BYTES)),
    decipher.final(),
  ]).toString("utf8");
}
