// Staff password hashing, in one place.
//
// The format is `scrypt:<salt>:<hash>`, which is what every staff account in auth_users carries and
// what the sign-in route verifies. It lived inside server/routes/core.mjs; it moved here so the
// one-off Super Admin bootstrap can write a password the application can actually verify, rather
// than a second implementation that might drift from this one.
//
// verifyPassword accepts only this format. Older non-scrypt hashes are rejected here and upgraded by
// the sign-in route, which is where that decision already lived.
import { randomBytes, scryptSync, timingSafeEqual } from "crypto";

export function hashPassword(password) {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(password, salt, 64).toString("hex");
  return `scrypt:${salt}:${hash}`;
}

export function verifyPassword(password, stored) {
  if (!password || !stored) return false;
  if (stored.startsWith("scrypt:")) {
    const parts = stored.split(":");
    const salt = parts[1];
    const hash = parts[2];
    if (!salt || !hash) return false;
    const next = scryptSync(password, salt, 64);
    const prev = Buffer.from(hash, "hex");
    return next.length === prev.length && timingSafeEqual(next, prev);
  }
  return false;
}
