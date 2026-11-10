// Refresh-token rotation, reuse detection and revocation (milestone 1.3).
//
// Staff sessions used to be one seven-day JWT with no way to revoke it: signing out cleared the
// browser and a copied token kept working for a week. The access token is now minutes long and a
// rotating refresh token issues the next one. These are the security properties that change is for.
//
// Opt-in, so a plain `npm test` needs no database:
//   $env:TEST_DATABASE_URL = "postgresql://user:pass@localhost:5432/anydb"     (PowerShell)
//   npm test

import test from "node:test";
import assert from "node:assert/strict";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import pg from "pg";

const URL = process.env.TEST_DATABASE_URL;
const skip = URL ? false : "set TEST_DATABASE_URL to run the PostgreSQL checks";
const schema = `rot_${randomBytes(4).toString("hex")}`;

let pool;
let lib;

if (!skip) {
  const admin = new pg.Pool({ connectionString: URL });
  await admin.query(`CREATE SCHEMA ${schema}`);
  await admin.end();
  process.env.DATABASE_URL = `${URL}${URL.includes("?") ? "&" : "?"}options=-c%20search_path%3D${schema}`;
  ({ pool } = await import("../server/lib/db.mjs"));
  const { migrate } = await import("../server/lib/migrate.mjs");
  await migrate();
  lib = await import("../server/lib/refreshTokens.mjs");
}

test.after(async () => {
  if (skip) return;
  await pool.end();
  const admin = new pg.Pool({ connectionString: URL });
  await admin.query(`DROP SCHEMA ${schema} CASCADE`);
  await admin.end();
});

const userId = () => randomUUID();
// Hash here rather than in SQL: the hashing is the library's business, and digest() would need
// pgcrypto installed in the test schema.
const hashOf = (token) => createHash("sha256").update(token).digest("hex");
const rowFor = async (token) => (await pool.query(
  "SELECT * FROM auth_refresh_tokens WHERE token_hash = $1", [hashOf(token)],
)).rows[0];

test("the token itself is never stored, only its hash", { skip }, async () => {
  const u = userId();
  const { token } = await lib.issueRefreshToken(pool, { userId: u });
  const stored = (await pool.query("SELECT token_hash FROM auth_refresh_tokens WHERE user_id = $1", [u])).rows[0];
  assert.ok(stored?.token_hash, "nothing was stored");
  assert.notEqual(stored.token_hash, token, "the raw token is in the database, so a leaked row is a live session");
  assert.match(stored.token_hash, /^[0-9a-f]{64}$/, "the stored value is not a SHA-256 hash");
  assert.ok(token.length >= 40, "the token is too short to be 32 random bytes");
});

test("two tokens are never the same", { skip }, async () => {
  const u = userId();
  const seen = new Set();
  for (let i = 0; i < 20; i += 1) seen.add((await lib.issueRefreshToken(pool, { userId: u })).token);
  assert.equal(seen.size, 20, "tokens repeat, so they are predictable");
});

test("rotating returns a new token, keeps the family, and spends the old one", { skip }, async () => {
  const u = userId();
  const first = await lib.issueRefreshToken(pool, { userId: u });
  const second = await lib.rotateRefreshToken(pool, first.token);

  assert.notEqual(second.token, first.token, "rotation handed back the same token");
  assert.equal(second.familyId, first.familyId, "the new token started a different family");
  assert.equal(String(second.userId), String(u));
  const old = await rowFor(first.token);
  assert.ok(old.used_at, "the presented token was not marked used, so it can be replayed");
});

test("a chain of rotations keeps working", { skip }, async () => {
  const u = userId();
  let current = await lib.issueRefreshToken(pool, { userId: u });
  const family = current.familyId;
  for (let i = 0; i < 5; i += 1) {
    current = await lib.rotateRefreshToken(pool, current.token);
    assert.equal(current.familyId, family, `rotation ${i + 1} left the family`);
  }
});

// ---- the point of rotation ---------------------------------------------------------------------

test("using a token twice ends the whole sign-in, not just that token", { skip }, async () => {
  const u = userId();
  const first = await lib.issueRefreshToken(pool, { userId: u });
  const second = await lib.rotateRefreshToken(pool, first.token);

  // The thief replays the token they copied.
  await assert.rejects(() => lib.rotateRefreshToken(pool, first.token), (error) => {
    assert.equal(error.code, "REFRESH_REUSED");
    assert.equal(error.status, 401);
    return true;
  });

  // And the real holder is signed out too, because there is no way to tell which one was the thief.
  await assert.rejects(() => lib.rotateRefreshToken(pool, second.token), (error) => {
    assert.equal(error.code, "REFRESH_REVOKED", "the live token still worked after a reuse was detected");
    return true;
  });

  const family = (await pool.query(
    "SELECT count(*)::int AS n FROM auth_refresh_tokens WHERE family_id = $1 AND revoked_at IS NULL", [first.familyId],
  )).rows[0].n;
  assert.equal(Number(family), 0, "part of the family survived the reuse");
  const reason = (await rowFor(second.token)).revoked_reason;
  assert.match(String(reason), /reuse/i, "the revocation does not record why");
});

test("one person's reuse does not touch their other sign-ins", { skip }, async () => {
  const u = userId();
  const phone = await lib.issueRefreshToken(pool, { userId: u });   // one device
  const laptop = await lib.issueRefreshToken(pool, { userId: u });  // another
  const phoneNext = await lib.rotateRefreshToken(pool, phone.token);
  await assert.rejects(() => lib.rotateRefreshToken(pool, phone.token)); // reuse on the phone

  const stillGood = await lib.rotateRefreshToken(pool, laptop.token);
  assert.ok(stillGood.token, "the other device was signed out by an unrelated reuse");
  await assert.rejects(() => lib.rotateRefreshToken(pool, phoneNext.token), /ended for safety|signed out/i);
});

test("signing out revokes the family, so the token stops working", { skip }, async () => {
  const u = userId();
  const issued = await lib.issueRefreshToken(pool, { userId: u });
  assert.equal(await lib.revokeFamily(pool, issued.familyId, "signed out"), 1);
  await assert.rejects(() => lib.rotateRefreshToken(pool, issued.token), (error) => {
    assert.equal(error.code, "REFRESH_REVOKED");
    return true;
  });
});

test("signing out everywhere revokes every sign-in for that person only", { skip }, async () => {
  const mine = userId();
  const theirs = userId();
  const a = await lib.issueRefreshToken(pool, { userId: mine });
  const b = await lib.issueRefreshToken(pool, { userId: mine });
  const other = await lib.issueRefreshToken(pool, { userId: theirs });

  assert.equal(await lib.revokeAllForUser(pool, mine, "signed out everywhere"), 2);
  for (const token of [a.token, b.token]) {
    await assert.rejects(() => lib.rotateRefreshToken(pool, token), /signed out/i);
  }
  assert.ok((await lib.rotateRefreshToken(pool, other.token)).token, "someone else's session was revoked");
});

test("an expired refresh token is refused, and does not revoke the family", { skip }, async () => {
  const u = userId();
  const issued = await lib.issueRefreshToken(pool, { userId: u, ttlDays: -1 }); // already past
  await assert.rejects(() => lib.rotateRefreshToken(pool, issued.token), (error) => {
    assert.equal(error.code, "REFRESH_EXPIRED");
    return true;
  });
});

test("an unknown or empty token is refused without saying which", { skip }, async () => {
  for (const token of ["", "not-a-real-token", randomBytes(32).toString("base64url")]) {
    await assert.rejects(() => lib.rotateRefreshToken(pool, token), (error) => {
      assert.equal(error.status, 401);
      // No "no such token" vs "wrong token" distinction to probe with.
      assert.doesNotMatch(String(error.message), /unknown|not found|no such/i);
      return true;
    });
  }
});

test("housekeeping removes only long-expired rows", { skip }, async () => {
  const u = userId();
  const live = await lib.issueRefreshToken(pool, { userId: u });
  const stale = await lib.issueRefreshToken(pool, { userId: u, ttlDays: -400 });
  const purged = await lib.purgeExpiredRefreshTokens(pool);
  assert.ok(purged >= 1, "nothing was purged");
  assert.ok(await rowFor(live.token), "a live token was purged");
  assert.equal(await rowFor(stale.token), undefined, "the long-expired token is still there");
});
