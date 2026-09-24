import crypto from "crypto";

// PIN hashing helpers. PINs are never stored in plain text — only a
// per-user random salt plus the scrypt hash of (pin + salt) are persisted.

export function generateSalt() {
  return crypto.randomBytes(16).toString("hex");
}

export function hashPin(pin, salt) {
  return crypto.scryptSync(String(pin), salt, 32).toString("hex");
}

export function verifyPinHash(pin, salt, hash) {
  if (!salt || !hash || pin == null || pin === "") return false;
  const candidate = hashPin(pin, salt);
  const a = Buffer.from(candidate, "hex");
  const b = Buffer.from(hash, "hex");
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

export function isValidPinFormat(pin) {
  return /^[0-9]{4,8}$/.test(String(pin ?? ""));
}
