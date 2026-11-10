// An expired session must stop working, on every portal (milestone 1.3).
//
// The access token was signed for seven days and nothing tested what happens when one expires, so the
// "expired sessions" row of 1.3's gate was empty even for the web. jwt.verify rejects an expired token
// on its own; this pins that it does, on every router, and that the refusal says so clearly rather than
// looking like a permissions problem.
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
const schema = `exp_${randomBytes(4).toString("hex")}`;
const SECRET = `expiry-test-${randomBytes(8).toString("hex")}`;

let pool;
let routes;
let staff;

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
  const counselor = (await import("../server/routes/counselor.mjs")).default;
  const cases = (await import("../server/routes/cases.mjs")).default;
  // The FULL stack for each route, so the session middleware actually runs.
  const stack = (router, path, method) => {
    const layer = router.stack.find((l) => l.route?.path === path && l.route.methods[method]);
    assert.ok(layer, `route not found: ${method.toUpperCase()} ${path}`);
    return layer.route.stack.map((s) => s.handle);
  };
  routes = {
    "admin /api/me": stack(core, "/api/me", "get"),
    "admin /api/users": stack(core, "/api/users", "post"),
    "counselor /api/counselor/state": stack(counselor, "/api/counselor/state", "get"),
    "telecaller /api/telecaller/state": stack(core, "/api/telecaller/state", "get"),
    "student /api/case/me": stack(cases, "/api/case/me", "get"),
  };

  const branch = (await pool.query("INSERT INTO branches (name, code) VALUES ('Hyderabad','HYD') RETURNING id")).rows[0].id;
  const created = (await import("../server/lib/accountWrites.mjs"));
  const { hashPassword } = await import("../server/lib/password.mjs");
  const id = randomBytes(16).toString("hex");
  await created.createAccount(pool, {
    id, email: "expiry@x.test", passwordHash: hashPassword("expiry-test-pass"),
    metadata: {}, role: "counselor", branchIds: [branch],
  });
  staff = { id, email: "expiry@x.test", branch };
}

test.after(async () => {
  if (skip) return;
  await pool.end();
  const admin = new pg.Pool({ connectionString: URL });
  await admin.query(`DROP SCHEMA ${schema} CASCADE`);
  await admin.end();
});

/** A token exactly like the real one, but with the lifetime the caller asks for. */
const tokenFor = (expiresIn) =>
  jwt.sign({ id: staff.id, email: staff.email, role: "counselor", branch_id: staff.branch }, SECRET, { expiresIn });

async function callThrough(handlers, token) {
  const res = {
    code: 200, body: null, headers: {},
    status(c) { this.code = c; return this; },
    json(b) { this.body = b; return this; },
    set(k, v) { this.headers[k] = v; return this; },
  };
  const req = {
    headers: token ? { authorization: `Bearer ${token}` } : {},
    body: {}, params: {}, query: {}, ip: "10.0.0.1",
  };
  for (const handle of handlers) {
    let advanced = false;
    await handle(req, res, () => { advanced = true; });
    if (!advanced) break; // the chain stopped here, which is what a refusal looks like
  }
  return res;
}

test("an expired token is refused on every portal, with a message that says so", { skip }, async () => {
  const expired = tokenFor("-1s"); // issued in the past: already expired
  for (const [name, handlers] of Object.entries(routes)) {
    const res = await callThrough(handlers, expired);
    assert.equal(res.code, 401, `${name} accepted an expired token (${res.code})`);
    assert.match(
      String(res.body?.error || ""), /expired|sign in/i,
      `${name} refused an expired token but not as an expired session: ${JSON.stringify(res.body)}`,
    );
  }
});

test("a token that is still valid is let through, so the test above means something", { skip }, async () => {
  const res = await callThrough(routes["counselor /api/counselor/state"], tokenFor("5m"));
  assert.notEqual(res.code, 401, `a valid token was refused: ${JSON.stringify(res.body)}`);
});

test("expiry is checked by the server, not taken on trust from the token", { skip }, async () => {
  // A token whose payload claims a far-future expiry but which was signed with a different secret, and
  // one with its expiry edited after signing: both must fail, or anyone could mint their own session.
  const foreign = jwt.sign({ id: staff.id, role: "counselor" }, "not-the-real-secret", { expiresIn: "7d" });
  assert.equal((await callThrough(routes["admin /api/me"], foreign)).code, 401, "a token signed with another secret was accepted");

  const expired = tokenFor("-1s");
  const [header, , signature] = expired.split(".");
  const forgedPayload = Buffer.from(JSON.stringify({
    id: staff.id, email: staff.email, role: "counselor", branch_id: staff.branch,
    iat: Math.floor(Date.now() / 1000), exp: Math.floor(Date.now() / 1000) + 99999,
  })).toString("base64url");
  const tampered = `${header}.${forgedPayload}.${signature}`;
  assert.equal((await callThrough(routes["admin /api/me"], tampered)).code, 401, "a token with an edited expiry was accepted");
});

test("no token and a malformed token are refused the same way", { skip }, async () => {
  for (const token of ["", "not.a.token", "Bearer-ish nonsense"]) {
    const res = await callThrough(routes["admin /api/me"], token);
    assert.equal(res.code, 401, `"${token}" was not refused`);
  }
});
