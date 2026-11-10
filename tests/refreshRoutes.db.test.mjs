// The sign-in, refresh and sign-out routes end to end, against a real PostgreSQL (milestone 1.3).
//
// refreshRotation.db.test.mjs covers the token library on its own. This covers what the API does with
// it: that signing in hands back both tokens, that refreshing returns a working access token, that the
// refresh token is single-use, that signing out means the session cannot be refreshed again, and that
// an account suspended since sign-in cannot refresh its way back in.
//
// Opt-in, so a plain `npm test` needs no database:
//   $env:TEST_DATABASE_URL = "postgresql://user:pass@localhost:5432/anydb"     (PowerShell)
//   npm test

import test from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import jwt from "jsonwebtoken";
import pg from "pg";

const URL = process.env.TEST_DATABASE_URL;
const skip = URL ? false : "set TEST_DATABASE_URL to run the PostgreSQL checks";
const schema = `refr_${randomBytes(4).toString("hex")}`;
const SECRET = `refresh-routes-${randomBytes(8).toString("hex")}`;
const PASSWORD = "refresh-test-pass";

let pool;
let h;
let B1;

if (!skip) {
  const admin = new pg.Pool({ connectionString: URL });
  await admin.query(`CREATE SCHEMA ${schema}`);
  await admin.end();
  process.env.DATABASE_URL = `${URL}${URL.includes("?") ? "&" : "?"}options=-c%20search_path%3D${schema}`;
  process.env.JWT_SECRET = SECRET;
  delete process.env.ADMIN_SIGNUP_CODE;
  delete process.env.ADMIN_SIGNUP_OPEN;
  ({ pool } = await import("../server/lib/db.mjs"));
  const { migrate } = await import("../server/lib/migrate.mjs");
  await migrate();
  const core = (await import("../server/routes/core.mjs")).default;
  const last = (path, method) => {
    const layer = core.stack.find((l) => l.route?.path === path && l.route.methods[method]);
    assert.ok(layer, `route not found: ${method.toUpperCase()} ${path}`);
    return layer.route.stack.at(-1).handle;
  };
  h = {
    createUser: last("/api/users", "post"),
    signin: last("/api/auth/signin", "post"),
    refresh: last("/api/auth/refresh", "post"),
    signout: last("/api/auth/signout", "post"),
    signoutEverywhere: last("/api/auth/signout-everywhere", "post"),
    suspend: last("/api/users/:id/suspend", "post"),
  };
  B1 = (await pool.query("INSERT INTO branches (name, code) VALUES ('Hyderabad', 'HYD') RETURNING id")).rows[0].id;
}

test.after(async () => {
  if (skip) return;
  await pool.end();
  const admin = new pg.Pool({ connectionString: URL });
  await admin.query(`DROP SCHEMA ${schema} CASCADE`);
  await admin.end();
});

const SUPER = { id: "boss", role: "super_admin", email: "boss@x.test", scope: { allBranches: true, branchIds: [] } };

async function run(handler, { body = {}, params = {}, actor } = {}) {
  const res = { code: 200, body: null, status(c) { this.code = c; return this; }, json(b) { this.body = b; return this; } };
  const req = { body, params, headers: {}, ip: `t-${Math.random()}` };
  if (actor) { req.user = { id: actor.id, role: actor.role, email: actor.email }; req.scope = actor.scope; }
  await handler(req, res);
  return res;
}

let seq = 0;
async function staffMember(role = "counselor") {
  seq += 1;
  const email = `refresh.${seq}.${randomBytes(3).toString("hex")}@x.test`;
  const made = await run(h.createUser, {
    actor: SUPER,
    body: { email, password: PASSWORD, firstName: "Asha", lastName: "Rao", phone: "9000000000", role, branchId: B1 },
  });
  assert.equal(made.code, 200, JSON.stringify(made.body));
  const signedIn = await run(h.signin, { body: { email, password: PASSWORD } });
  assert.equal(signedIn.code, 200, JSON.stringify(signedIn.body));
  return { id: made.body.id, email, signin: signedIn.body };
}

// ---- what signing in now returns ---------------------------------------------------------------

test("signing in returns a short access token and a refresh token", { skip }, async () => {
  const { signin } = await staffMember();
  assert.ok(signin.token, "no access token");
  assert.ok(signin.refreshToken, "no refresh token: the client has no way to stay signed in");
  assert.ok(signin.refreshExpiresAt, "the client is not told when the session ends");

  const claims = jwt.verify(signin.token, SECRET);
  const minutes = (claims.exp - claims.iat) / 60;
  assert.ok(minutes <= 60, `the access token lives ${minutes} minutes: it cannot be revoked, so this is the exposure window`);
  assert.ok(minutes >= 1, "the access token is too short to be usable");
  assert.equal(signin.expiresIn, "15m");
});

test("the refresh token is not the access token, and is not a JWT", { skip }, async () => {
  const { signin } = await staffMember();
  assert.notEqual(signin.refreshToken, signin.token);
  assert.equal(signin.refreshToken.includes("."), false, "the refresh token looks like a JWT: it should be opaque");
});

// ---- refreshing --------------------------------------------------------------------------------

test("refreshing returns a working access token and the next refresh token", { skip }, async () => {
  const { signin, email } = await staffMember();
  const r = await run(h.refresh, { body: { refreshToken: signin.refreshToken } });
  assert.equal(r.code, 200, JSON.stringify(r.body));

  const claims = jwt.verify(r.body.token, SECRET);
  assert.equal(claims.role, "counselor", "the refreshed token carries the wrong role");
  assert.equal(r.body.user.email, email);
  assert.notEqual(r.body.refreshToken, signin.refreshToken, "the same refresh token came back: it is not rotating");
});

test("the refresh token is single-use, and reusing it ends the session", { skip }, async () => {
  const { signin } = await staffMember();
  const first = await run(h.refresh, { body: { refreshToken: signin.refreshToken } });
  assert.equal(first.code, 200);

  const replay = await run(h.refresh, { body: { refreshToken: signin.refreshToken } });
  assert.equal(replay.code, 401, "a used refresh token was accepted a second time");
  assert.equal(replay.body.code, "REFRESH_REUSED");

  const afterTheft = await run(h.refresh, { body: { refreshToken: first.body.refreshToken } });
  assert.equal(afterTheft.code, 401, "the live token still worked after a reuse was detected");
});

test("a missing or made-up refresh token is refused with 401, not 500", { skip }, async () => {
  for (const body of [{}, { refreshToken: "" }, { refreshToken: randomBytes(32).toString("base64url") }]) {
    const r = await run(h.refresh, { body });
    assert.equal(r.code, 401, JSON.stringify(r.body));
    assert.ok(r.body.error, "no message for the client to show");
  }
});

// ---- signing out -------------------------------------------------------------------------------

test("after signing out the refresh token no longer works", { skip }, async () => {
  const { signin } = await staffMember();
  const out = await run(h.signout, { body: { refreshToken: signin.refreshToken } });
  assert.equal(out.code, 200);
  assert.equal(out.body.ok, true);

  const after = await run(h.refresh, { body: { refreshToken: signin.refreshToken } });
  assert.equal(after.code, 401, "signing out did not end the session: this is the bug the change is for");
  assert.equal(after.body.code, "REFRESH_REVOKED");
});

test("signing out an unknown token answers ok rather than confirming it is unknown", { skip }, async () => {
  const r = await run(h.signout, { body: { refreshToken: randomBytes(32).toString("base64url") } });
  assert.equal(r.code, 200);
  assert.equal(r.body.ok, true);
});

test("signing out everywhere ends every device for that person", { skip }, async () => {
  const { id, email } = await staffMember();
  const second = await run(h.signin, { body: { email, password: PASSWORD } });
  const third = await run(h.signin, { body: { email, password: PASSWORD } });

  const out = await run(h.signoutEverywhere, { actor: { id, role: "counselor", email, scope: { allBranches: false, branchIds: [B1] } } });
  assert.equal(out.code, 200, JSON.stringify(out.body));
  assert.ok(out.body.sessionsEnded >= 2);

  for (const session of [second.body, third.body]) {
    const after = await run(h.refresh, { body: { refreshToken: session.refreshToken } });
    assert.equal(after.code, 401, "a device was left signed in");
  }
});

// ---- the account changing under a live session -------------------------------------------------

test("an account suspended after sign-in cannot refresh, and its session is ended", { skip }, async () => {
  const { id, signin } = await staffMember();
  const suspended = await run(h.suspend, { actor: SUPER, params: { id }, body: { reason: "left the company" } });
  assert.equal(suspended.code, 200, JSON.stringify(suspended.body));

  const r = await run(h.refresh, { body: { refreshToken: signin.refreshToken } });
  assert.equal(r.code, 403, `a suspended account refreshed its session: ${JSON.stringify(r.body)}`);
  assert.equal(r.body.code, "ACCOUNT_DISABLED");

  const live = await pool.query(
    "SELECT count(*)::int AS n FROM auth_refresh_tokens WHERE user_id = $1 AND revoked_at IS NULL", [String(id)],
  );
  assert.equal(Number(live.rows[0].n), 0, "the suspended account kept a usable refresh token");
});

test("a deleted account cannot refresh", { skip }, async () => {
  const { id, signin } = await staffMember();
  await pool.query("DELETE FROM user_roles WHERE user_id = $1", [String(id)]);
  await pool.query("DELETE FROM auth_users WHERE id::text = $1", [String(id)]);
  const r = await run(h.refresh, { body: { refreshToken: signin.refreshToken } });
  assert.equal(r.code, 401, JSON.stringify(r.body));
});
