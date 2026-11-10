// Rotating refresh tokens for staff sessions (milestone 1.3).
//
// The access token is now minutes long, so something has to issue the next one without asking for the
// password again. That is the refresh token: opaque, 32 random bytes, stored only as a SHA-256 hash, and
// good for exactly ONE use.
//
// Rotation with reuse detection, which is what makes this worth doing:
//   * Every refresh returns a new refresh token and marks the presented one used.
//   * Presenting a token that has already been used means two parties hold it — the real one and
//     whoever copied it. There is no way to tell which is which, so the whole family (every token
//     descended from that sign-in) is revoked and both are forced to sign in again.
//   * Sign-out revokes the family, which is what makes sign-out mean something: before this, signing
//     out only cleared the browser and a copied token kept working for its full seven days.
//
// Hashing is SHA-256, not scrypt: the token is 32 bytes of randomness, so there is nothing to brute
// force, and a refresh runs on every page load where a slow hash would be felt.
import { createHash, randomBytes, randomUUID } from "crypto";

/** How long a refresh token lives. The session ends when this does, unless it is used before then. */
export const REFRESH_TTL_DAYS = Number(process.env.REFRESH_TOKEN_TTL_DAYS || 30);

export class RefreshRejected extends Error {
  constructor(message, { code = "REFRESH_INVALID", status = 401 } = {}) {
    super(message);
    this.code = code;
    this.status = status;
  }
}

const hashToken = (token) => createHash("sha256").update(String(token)).digest("hex");
const newToken = () => randomBytes(32).toString("base64url");

/**
 * Issues a refresh token. Without `familyId` this starts a new family, which is what a fresh sign-in
 * does; a rotation passes the existing family so the chain stays linked.
 */
export async function issueRefreshToken(db, { userId, familyId = null, ttlDays = REFRESH_TTL_DAYS }) {
  const token = newToken();
  const id = randomUUID();
  const family = familyId || randomUUID();
  const expiresAt = new Date(Date.now() + ttlDays * 24 * 60 * 60 * 1000);
  await db.query(
    `INSERT INTO auth_refresh_tokens (id, token_hash, user_id, family_id, expires_at)
     VALUES ($1, $2, $3, $4, $5)`,
    [id, hashToken(token), String(userId), family, expiresAt.toISOString()],
  );
  return { token, id, familyId: family, expiresAt };
}

/** Ends a whole sign-in: every token descended from it stops working. */
export async function revokeFamily(db, familyId, reason) {
  const result = await db.query(
    `UPDATE auth_refresh_tokens SET revoked_at = now(), revoked_reason = $2
      WHERE family_id = $1 AND revoked_at IS NULL`,
    [String(familyId), String(reason || "revoked")],
  );
  return Number(result.rowCount || 0);
}

/** Ends every sign-in for one person, on every device. */
export async function revokeAllForUser(db, userId, reason) {
  const result = await db.query(
    `UPDATE auth_refresh_tokens SET revoked_at = now(), revoked_reason = $2
      WHERE user_id = $1 AND revoked_at IS NULL`,
    [String(userId), String(reason || "revoked")],
  );
  return Number(result.rowCount || 0);
}

/**
 * Exchanges a refresh token for the next one.
 *
 * Throws RefreshRejected on anything that is not a clean, single, first use. The reuse case revokes the
 * family before throwing, so a stolen token costs the thief and the victim the session rather than
 * silently granting the thief a rolling one.
 */
export async function rotateRefreshToken(db, presented) {
  const value = String(presented || "");
  if (!value) throw new RefreshRejected("No refresh token was given.");
  const hash = hashToken(value);

  // The transaction only decides. Acting on a rejection — revoking a reused family — happens after it
  // commits, because a throw inside a transaction rolls the revocation back with it.
  const outcome = await withTransaction(db, async (tx) => {
    // Claim the token and mark it used in ONE statement. Two requests arriving together cannot both
    // win this: the second updates no rows and falls through to the reuse path below, which is the
    // behaviour we want anyway.
    const claimed = await tx.query(
      `UPDATE auth_refresh_tokens SET used_at = now()
        WHERE token_hash = $1 AND used_at IS NULL AND revoked_at IS NULL AND expires_at > now()
        RETURNING *`,
      [hash],
    );
    const row = claimed.rows[0];
    if (row) {
      const next = await issueRefreshToken(tx, { userId: row.user_id, familyId: row.family_id });
      return { ok: true, session: { ...next, userId: row.user_id } };
    }

    // Nothing was claimed. Work out why, without telling the caller more than "sign in again".
    const { rows } = await tx.query("SELECT * FROM auth_refresh_tokens WHERE token_hash = $1", [hash]);
    const existing = rows[0];
    if (!existing) return { ok: false, message: "That session is no longer valid. Sign in again." };
    if (existing.used_at) {
      // Two holders of the same one-use token. Which one is the thief cannot be known, so end the
      // sign-in for both and make them prove who they are again.
      return {
        ok: false,
        code: "REFRESH_REUSED",
        revokeFamilyId: existing.family_id,
        message: "That session was ended for safety because its token was used twice. Sign in again.",
      };
    }
    if (existing.revoked_at) {
      return { ok: false, code: "REFRESH_REVOKED", message: "That session has been signed out. Sign in again." };
    }
    return { ok: false, code: "REFRESH_EXPIRED", message: "That session has expired. Sign in again." };
  });

  if (outcome.ok) return outcome.session;
  if (outcome.revokeFamilyId) await revokeFamily(db, outcome.revokeFamilyId, "refresh token reused");
  throw new RefreshRejected(outcome.message, outcome.code ? { code: outcome.code } : undefined);
}

/**
 * Runs `fn` inside one transaction when `db` is a pool, and directly when it is already a client (a
 * caller that is mid-transaction). A half-rotation would either lock the person out or leave two live
 * tokens, so this is not optional.
 */
async function withTransaction(db, fn) {
  if (typeof db.connect !== "function") return fn(db);
  const client = await db.connect();
  try {
    await client.query("BEGIN");
    const result = await fn(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}

/** Housekeeping: nothing depends on it, but the table should not grow without limit. */
export async function purgeExpiredRefreshTokens(db, { olderThanDays = REFRESH_TTL_DAYS } = {}) {
  const result = await db.query(
    `DELETE FROM auth_refresh_tokens
      WHERE expires_at < now() - ($1 || ' days')::interval`,
    [String(Math.max(0, olderThanDays))],
  );
  return Number(result.rowCount || 0);
}
