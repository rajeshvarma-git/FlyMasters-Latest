// The first Super Admin, against a real PostgreSQL.
//
// Nothing in the code or the migrations creates one, so a brand-new database has nobody who can create
// an Admin, and employee onboarding cannot start on it. This is that one-off path. It must be hard to
// misuse: it refuses once a Super Admin exists, it refuses to hand super_admin to an account that
// already exists, it refuses a weak password, and it leaves an audit row behind.
//
// The real proof is the last assertion of the first test: the account it creates can sign in through
// the application's own sign-in route. A bootstrap that writes a password the app cannot verify is
// worse than none at all.
//
// Opt-in, so a plain `npm test` needs no database:
//   $env:TEST_DATABASE_URL = "postgresql://user:pass@localhost:5432/anydb"     (PowerShell)
//   npm test

import test from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import pg from "pg";

const URL = process.env.TEST_DATABASE_URL;
const skip = URL ? false : "set TEST_DATABASE_URL to run the PostgreSQL checks";
const schema = `bsa_${randomBytes(4).toString("hex")}`;

let pool;
let bootstrapSuperAdmin;
let signin;
let me;

if (!skip) {
  const admin = new pg.Pool({ connectionString: URL });
  await admin.query(`CREATE SCHEMA ${schema}`);
  await admin.end();
  process.env.DATABASE_URL = `${URL}${URL.includes("?") ? "&" : "?"}options=-c%20search_path%3D${schema}`;
  process.env.NODE_ENV = "production"; // keep the dev seed (admin@local.test) out of this database
  process.env.JWT_SECRET = process.env.JWT_SECRET || `bootstrap-test-${randomBytes(8).toString("hex")}`;
  delete process.env.ADMIN_SIGNUP_CODE;
  delete process.env.ADMIN_SIGNUP_OPEN;
  ({ pool } = await import("../server/lib/db.mjs"));
  const { migrate } = await import("../server/lib/migrate.mjs");
  await migrate();
  ({ bootstrapSuperAdmin } = await import("../server/lib/bootstrapSuperAdmin.mjs"));
  const core = (await import("../server/routes/core.mjs")).default;
  const handler = (path, method) => {
    const layer = core.stack.find((l) => l.route?.path === path && l.route.methods[method]);
    assert.ok(layer, `route not found: ${method.toUpperCase()} ${path}`);
    return layer.route.stack.at(-1).handle;
  };
  signin = handler("/api/auth/signin", "post");
  me = handler("/api/me", "get");
}

test.after(async () => {
  if (skip) return;
  await pool.end();
  const admin = new pg.Pool({ connectionString: URL });
  await admin.query(`DROP SCHEMA ${schema} CASCADE`);
  await admin.end();
});

async function run(handler, { body = {}, user, scope } = {}) {
  const res = {
    code: 200, body: null,
    status(c) { this.code = c; return this; },
    json(b) { this.body = b; return this; },
  };
  const req = { body, headers: {}, ip: `b-${Math.random()}`, params: {}, query: {}, user, scope };
  await handler(req, res);
  return res;
}

const superAdmins = async () => (await pool.query(
  "SELECT user_id FROM user_roles WHERE role = 'super_admin'",
)).rows;
const accounts = async () => Number((await pool.query("SELECT count(*)::int AS n FROM auth_users")).rows[0].n);
const auditRows = async () => (await pool.query(
  "SELECT action, entity, detail FROM audit_log WHERE action = 'super_admin.bootstrap' ORDER BY id",
)).rows;

const GOOD = { email: "first.boss@x.test", password: "a-long-enough-secret", firstName: "First", lastName: "Boss" };

test("on a database with no Super Admin it creates one, and that account can sign in", { skip }, async () => {
  assert.deepEqual(await superAdmins(), [], "this database already had a Super Admin");

  const result = await bootstrapSuperAdmin(pool, GOOD);
  assert.ok(result.created, JSON.stringify(result));
  assert.equal(result.email, GOOD.email);

  const rows = await superAdmins();
  assert.equal(rows.length, 1, JSON.stringify(rows));
  assert.equal(String(rows[0].user_id), String(result.id));

  // The point of the whole exercise: the application can actually sign this account in.
  const signedIn = await run(signin, { body: { email: GOOD.email, password: GOOD.password } });
  assert.equal(signedIn.code, 200, JSON.stringify(signedIn.body));
  assert.ok(signedIn.body?.token, "no token was issued");
  assert.equal(signedIn.body.user.role, "super_admin");

  // And the role the rest of the app enforces is the one it was given.
  const whoami = await run(me, { user: { id: result.id, role: "super_admin" }, scope: { allBranches: true, branchIds: [] } });
  assert.equal(whoami.code, 200, JSON.stringify(whoami.body));
  assert.equal(whoami.body.access.role, "super_admin");

  // A profile exists, so the portal shows a name rather than a blank.
  const profile = (await pool.query(
    "SELECT data->>'first_name' AS first FROM app_records WHERE table_name = 'profiles' AND data->>'user_id' = $1",
    [String(result.id)],
  )).rows[0];
  assert.equal(profile?.first, "First");

  const audit = await auditRows();
  assert.equal(audit.length, 1, JSON.stringify(audit));
  assert.equal(audit[0].detail?.email, GOOD.email);
  assert.equal(audit[0].detail?.password, undefined, "the audit row contains the password");
});

test("it refuses once a Super Admin exists, and changes nothing", { skip }, async () => {
  const before = await accounts();
  await assert.rejects(
    () => bootstrapSuperAdmin(pool, { ...GOOD, email: "second.boss@x.test" }),
    /already/i,
  );
  assert.equal(await accounts(), before, "an account was created anyway");
  assert.equal((await superAdmins()).length, 1);
  assert.equal((await auditRows()).length, 1, "a refused bootstrap was audited as a success");
});

test("--allow-additional is the only way to add a second Super Admin", { skip }, async () => {
  const result = await bootstrapSuperAdmin(pool, {
    ...GOOD, email: "second.boss@x.test", allowAdditional: true,
  });
  assert.ok(result.created);
  assert.equal((await superAdmins()).length, 2);
  const signedIn = await run(signin, { body: { email: "second.boss@x.test", password: GOOD.password } });
  assert.equal(signedIn.code, 200, JSON.stringify(signedIn.body));
});

test("it will not hand super_admin to an email that already has an account", { skip }, async () => {
  const before = await superAdmins();
  await assert.rejects(
    () => bootstrapSuperAdmin(pool, { ...GOOD, allowAdditional: true }),
    /exists/i,
  );
  assert.deepEqual(await superAdmins(), before, "an existing account was promoted");
});

test("it refuses a short password and a malformed email, and writes nothing", { skip }, async () => {
  const beforeAccounts = await accounts();
  const beforeSupers = (await superAdmins()).length;
  await assert.rejects(() => bootstrapSuperAdmin(pool, {
    email: "third.boss@x.test", password: "short", allowAdditional: true,
  }), /password/i);
  await assert.rejects(() => bootstrapSuperAdmin(pool, {
    email: "not-an-email", password: GOOD.password, allowAdditional: true,
  }), /email/i);
  assert.equal(await accounts(), beforeAccounts);
  assert.equal((await superAdmins()).length, beforeSupers);
});

test("the Super Admin it creates has no branch, because it is not branch-scoped", { skip }, async () => {
  const rows = await pool.query(
    "SELECT branch_id FROM user_roles WHERE role = 'super_admin' AND user_id = (SELECT id FROM auth_users WHERE email = $1)",
    [GOOD.email],
  );
  assert.equal(rows.rows[0]?.branch_id, null, "a Super Admin was pinned to one branch");
  const memberships = await pool.query(
    "SELECT count(*)::int AS n FROM user_branches WHERE user_id = (SELECT id FROM auth_users WHERE email = $1)",
    [GOOD.email],
  );
  assert.equal(Number(memberships.rows[0].n), 0);
});
