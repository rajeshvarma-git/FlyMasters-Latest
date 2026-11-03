// Launch contract, account creation: the real route handlers against a real PostgreSQL.
// POST /api/users, the public admin and telecaller sign-ups, and sign-in run exactly as in production; the
// schema comes from the repo's own migrations, built in a throwaway schema that is dropped at the end.
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
const schema = `troutes_${randomBytes(4).toString("hex")}`;

let pool;
let handlers;
let B1;
let B2;

if (!skip) {
  const admin = new pg.Pool({ connectionString: URL });
  await admin.query(`CREATE SCHEMA ${schema}`);
  await admin.end();
  process.env.DATABASE_URL = `${URL}${URL.includes("?") ? "&" : "?"}options=-c%20search_path%3D${schema}`;
  process.env.TELECALLER_SIGNUP_CODE = "let-me-in";
  delete process.env.ADMIN_SIGNUP_CODE;
  delete process.env.ADMIN_SIGNUP_OPEN;
  ({ pool } = await import("../server/lib/db.mjs"));
  const { migrate } = await import("../server/lib/migrate.mjs");
  await migrate();
  const core = (await import("../server/routes/core.mjs")).default;
  const finalHandler = (path) => core.stack.find((l) => l.route?.path === path && l.route.methods.post).route.stack.at(-1).handle;
  handlers = {
    createUser: finalHandler("/api/users"),
    adminSignup: finalHandler("/api/auth/signup"),
    telecallerSignup: finalHandler("/api/auth/telecaller-signup"),
    signin: finalHandler("/api/auth/signin"),
  };
  B1 = (await pool.query("INSERT INTO branches (name, code) VALUES ('Hyderabad', 'HYD') RETURNING id")).rows[0].id;
  B2 = (await pool.query("INSERT INTO branches (name, code) VALUES ('Vizag', 'VIZ') RETURNING id")).rows[0].id;
}

test.after(async () => {
  if (skip) return;
  await pool.end();
  const admin = new pg.Pool({ connectionString: URL });
  await admin.query(`DROP SCHEMA ${schema} CASCADE`);
  await admin.end();
});

const SUPER = { id: "boss", role: "super_admin", email: "boss@x.test", scope: { allBranches: true, branchIds: [] } };
const adminOf = (...ids) => ({ id: "adm1", role: "admin", email: "adm1@x.test", scope: { allBranches: false, branchIds: ids } });
const headOf = (...ids) => ({ id: "bh1", role: "branch_head", email: "bh1@x.test", scope: { allBranches: false, branchIds: ids } });

async function run(handler, body, actor = null) {
  const res = { code: 200, body: null, status(c) { this.code = c; return this; }, json(b) { this.body = b; return this; } };
  const req = { body, headers: {}, ip: `t-${Math.random()}`, params: {} };
  if (actor) { req.user = { id: actor.id, role: actor.role, email: actor.email }; req.scope = actor.scope; }
  await handler(req, res);
  return res;
}
const createUser = (actor, body) => run(handlers.createUser, body, actor);

const n = async (sql, params = []) => Number((await pool.query(sql, params)).rows[0].n);
const rowsFor = async (email) => ({
  login: await n("SELECT count(*) AS n FROM auth_users WHERE lower(email) = $1", [email.toLowerCase()]),
  role: await n("SELECT count(*) AS n FROM user_roles WHERE user_id IN (SELECT id FROM auth_users WHERE lower(email) = $1)", [email.toLowerCase()]),
  memberships: await n("SELECT count(*) AS n FROM user_branches WHERE user_id IN (SELECT id FROM auth_users WHERE lower(email) = $1)", [email.toLowerCase()]),
  profile: await n("SELECT count(*) AS n FROM app_records WHERE table_name = 'profiles' AND data->>'user_id' IN (SELECT id FROM auth_users WHERE lower(email) = $1)", [email.toLowerCase()]),
});
const nothingFor = async (email) => assert.deepEqual(await rowsFor(email), { login: 0, role: 0, memberships: 0, profile: 0 }, `rows left behind for ${email}`);
const totalLogins = () => n("SELECT count(*) AS n FROM auth_users");

// Makes one kind of write fail for the duration of fn(), the way a database error would.
async function whileFailing(match, fn) {
  const original = pool.query.bind(pool);
  pool.query = (text, ...rest) => (match(String(text), rest[0]) ? Promise.reject(new Error("injected failure")) : original(text, ...rest));
  const quiet = console.error;
  console.error = () => {};
  try { return await fn(); } finally { pool.query = original; console.error = quiet; }
}

const person = (email, extra = {}) => ({ email, password: "secret12", firstName: "Asha", lastName: "Rao", phone: "9000000000", ...extra });

// ---- allowed creation ------------------------------------------------------------------------------------

test("a Super Admin creates an Admin: login, role and profile exist", { skip }, async () => {
  const r = await createUser(SUPER, person("admin.a@x.test", { role: "admin" }));
  assert.equal(r.code, 200, JSON.stringify(r.body));
  assert.deepEqual(await rowsFor("admin.a@x.test"), { login: 1, role: 1, memberships: 0, profile: 1 });
  assert.equal(await n("SELECT count(*) AS n FROM user_roles WHERE role = 'admin' AND user_id = $1", [r.body.id]), 1);
});

test("an Admin creates a counselor, telecaller and accountant in their own branch", { skip }, async () => {
  for (const role of ["counselor", "telecaller", "accountant"]) {
    const email = `${role}.own@x.test`;
    const r = await createUser(adminOf(B1), person(email, { role, branchId: B1 }));
    assert.equal(r.code, 200, `${role}: ${JSON.stringify(r.body)}`);
    assert.deepEqual(await rowsFor(email), { login: 1, role: 1, memberships: 1, profile: 1 }, role);
    const saved = (await pool.query("SELECT role, branch_id FROM user_roles WHERE user_id = $1", [r.body.id])).rows[0];
    assert.deepEqual([saved.role, saved.branch_id], [role, B1]);
  }
});

test("a counselor created by an Admin also gets the counselor records, and can sign in", { skip }, async () => {
  const r = await createUser(adminOf(B1), person("cou.signin@x.test", { role: "counselor", branchId: B1 }));
  assert.equal(r.code, 200);
  assert.ok(r.body.counselorId, "counselorId is returned");
  assert.equal(await n("SELECT count(*) AS n FROM counselor_users WHERE lower(email) = 'cou.signin@x.test'"), 1);
  assert.equal(await n("SELECT count(*) AS n FROM app_records WHERE table_name = 'counselors' AND data->>'user_id' = $1", [r.body.id]), 1);
  const signedIn = await run(handlers.signin, { email: "cou.signin@x.test", password: "secret12" });
  assert.equal(signedIn.code, 200, JSON.stringify(signedIn.body));
  assert.equal(signedIn.body.user.role, "counselor");
  assert.ok(signedIn.body.token);
});

// ---- forbidden requests: refused, and nothing is written -----------------------------------------------------

test("an Admin cannot create an Admin, Branch Head or Super Admin", { skip }, async () => {
  for (const role of ["admin", "branch_head", "super_admin"]) {
    const email = `no.${role}@x.test`;
    const r = await createUser(adminOf(B1), person(email, { role, branchId: B1 }));
    assert.equal(r.code, 403, `${role}: ${JSON.stringify(r.body)}`);
    await nothingFor(email);
  }
});

test("an Admin cannot place anyone in a branch they do not hold, or in a branch that does not exist", { skip }, async () => {
  const other = await createUser(adminOf(B1), person("wrong.branch@x.test", { role: "telecaller", branchId: B2 }));
  assert.equal(other.code, 403, JSON.stringify(other.body));
  await nothingFor("wrong.branch@x.test");
  const ghost = await createUser(SUPER, person("ghost.branch@x.test", { role: "telecaller", branchId: "11111111-1111-1111-1111-111111111111" }));
  assert.equal(ghost.code, 400, JSON.stringify(ghost.body));
  await nothingFor("ghost.branch@x.test");
});

test("a branch-scoped role needs a branch", { skip }, async () => {
  const r = await createUser(SUPER, person("no.branch@x.test", { role: "counselor" }));
  assert.equal(r.code, 400);
  await nothingFor("no.branch@x.test");
});

test("a Branch Head cannot create any account, not even in their own branch", { skip }, async () => {
  const r = await createUser(headOf(B1), person("by.head@x.test", { role: "telecaller", branchId: B1 }));
  assert.equal(r.code, 403, JSON.stringify(r.body));
  await nothingFor("by.head@x.test");
});

test("no password means no account: there is no default password", { skip }, async () => {
  const r = await createUser(SUPER, { email: "nopass@x.test", role: "student", firstName: "N", lastName: "P" });
  assert.equal(r.code, 400);
  await nothingFor("nopass@x.test");
  const short = await createUser(SUPER, person("shortpass@x.test", { role: "student", password: "123" }));
  assert.equal(short.code, 400);
  await nothingFor("shortpass@x.test");
});

test("a role that is not assignable is refused", { skip }, async () => {
  const r = await createUser(SUPER, person("partner.try@x.test", { role: "partner" }));
  assert.equal(r.code, 400);
  await nothingFor("partner.try@x.test");
});

// ---- duplicates ------------------------------------------------------------------------------------------------

test("the same email twice: the second is refused and exactly one account exists, whatever the letter case", { skip }, async () => {
  const first = await createUser(SUPER, person("dup@x.test", { role: "student" }));
  assert.equal(first.code, 200);
  const before = await totalLogins();
  const second = await createUser(SUPER, person("dup@x.test", { role: "student" }));
  const shouting = await createUser(SUPER, person("DUP@X.TEST", { role: "student" }));
  assert.equal(second.code, 400);
  assert.equal(shouting.code, 400);
  assert.equal((await rowsFor("dup@x.test")).login, 1);
  assert.equal(await totalLogins(), before);
  assert.equal((await run(handlers.signin, { email: "dup@x.test", password: "secret12" })).code, 200, "the original account still works");
});

test("two requests for the same email at the same moment create one account", { skip }, async () => {
  const [a, b] = await Promise.all([
    createUser(SUPER, person("race@x.test", { role: "student" })),
    createUser(SUPER, person("race@x.test", { role: "student" })),
  ]);
  assert.deepEqual([a.code, b.code].sort(), [200, 400]);
  assert.deepEqual(await rowsFor("race@x.test"), { login: 1, role: 1, memberships: 0, profile: 1 });
});

// ---- rollback: a failed later write leaves nothing, and the email can be used again ------------------------------

test("profile write fails: the request answers 500, no login or role is left, and a retry succeeds", { skip }, async () => {
  const email = "rb.profile@x.test";
  const failed = await whileFailing((t) => /INSERT INTO app_records/.test(t), () => createUser(adminOf(B1), person(email, { role: "telecaller", branchId: B1 })));
  assert.equal(failed.code, 500);
  assert.match(failed.body.error, /Nothing was saved/);
  await nothingFor(email);
  assert.equal((await run(handlers.signin, { email, password: "secret12" })).code, 401, "a half-created account cannot sign in");
  const retry = await createUser(adminOf(B1), person(email, { role: "telecaller", branchId: B1 }));
  assert.equal(retry.code, 200, JSON.stringify(retry.body));
  assert.deepEqual(await rowsFor(email), { login: 1, role: 1, memberships: 1, profile: 1 });
});

test("counselor record write fails: everything for that person is removed, including the profile", { skip }, async () => {
  const email = "rb.counselor@x.test";
  const failed = await whileFailing((t) => /INSERT INTO counselor_users/.test(t), () => createUser(adminOf(B1), person(email, { role: "counselor", branchId: B1 })));
  assert.equal(failed.code, 500);
  await nothingFor(email);
  const retry = await createUser(adminOf(B1), person(email, { role: "counselor", branchId: B1 }));
  assert.equal(retry.code, 200, JSON.stringify(retry.body));
});

test("the last counselor write fails: still all-or-nothing", { skip }, async () => {
  const email = "rb.counselor2@x.test";
  let appRecordWrites = 0; // the profile is the first app_records write, the counselor record the second
  const failed = await whileFailing((t) => /INSERT INTO app_records/.test(t) && ++appRecordWrites === 2, () => createUser(adminOf(B1), person(email, { role: "counselor", branchId: B1 })));
  assert.equal(failed.code, 500);
  await nothingFor(email);
  assert.equal(await n("SELECT count(*) AS n FROM app_records WHERE table_name = 'counselors' AND data->>'user_id' IN (SELECT id FROM auth_users WHERE lower(email) = $1)", [email]), 0);
});

// The login, role and branches are written on one transaction connection, not through pool.query.
async function whileClientFailing(match, fn) {
  const original = pool.connect.bind(pool);
  // pool.query() itself calls pool.connect(callback); only the promise form (a transaction) is wrapped.
  pool.connect = (callback) => {
    if (typeof callback === "function") return original(callback);
    return original().then((client) => {
      const realQuery = client.query;
      const query = realQuery.bind(client);
      client.query = (text, ...rest) => (match(String(text)) ? Promise.reject(new Error("injected failure")) : query(text, ...rest));
      // the pool reuses this connection: give it back unmodified
      const realRelease = client.release;
      client.release = (...args) => { client.query = realQuery; client.release = realRelease; return realRelease.apply(client, args); };
      return client;
    });
  };
  const quiet = console.error;
  console.error = () => {};
  try { return await fn(); } finally { pool.connect = original; console.error = quiet; }
}

test("the role write fails inside the transaction: the login is rolled back too", { skip }, async () => {
  const email = "rb.role@x.test";
  const failed = await whileClientFailing((t) => /INSERT INTO user_roles/.test(t), () => createUser(SUPER, person(email, { role: "student" })));
  assert.equal(failed.code, 500);
  await nothingFor(email);
  assert.equal((await createUser(SUPER, person(email, { role: "student" }))).code, 200, "the email is free again");
});

test("the branch write fails inside the transaction: the login and role are rolled back too", { skip }, async () => {
  const email = "rb.branch@x.test";
  const failed = await whileClientFailing((t) => /INSERT INTO user_branches/.test(t), () => createUser(adminOf(B1), person(email, { role: "telecaller", branchId: B1 })));
  assert.equal(failed.code, 500);
  await nothingFor(email);
});

test("removing a half-created account does not touch anyone else", { skip }, async () => {
  const keep = "rb.keep@x.test";
  assert.equal((await createUser(adminOf(B1), person(keep, { role: "counselor", branchId: B1 }))).code, 200);
  const before = await rowsFor(keep);
  await whileFailing((t) => /INSERT INTO app_records/.test(t), () => createUser(adminOf(B1), person("rb.other@x.test", { role: "counselor", branchId: B1 })));
  assert.deepEqual(await rowsFor(keep), before);
  assert.equal((await run(handlers.signin, { email: keep, password: "secret12" })).code, 200);
});

// ---- public sign-ups ---------------------------------------------------------------------------------------------

test("public Admin sign-up outside production works and creates an Admin with no branch; a failed profile write leaves nothing", { skip }, async () => {
  const email = "self.admin@x.test";
  const failed = await whileFailing((t) => /INSERT INTO app_records/.test(t), () => run(handlers.adminSignup, person(email)));
  assert.equal(failed.code, 500);
  await nothingFor(email);
  const ok = await run(handlers.adminSignup, person(email));
  assert.equal(ok.code, 200, JSON.stringify(ok.body));
  assert.equal(ok.body.user.role, "admin");
  assert.deepEqual(await rowsFor(email), { login: 1, role: 1, memberships: 0, profile: 1 });
  assert.equal((await run(handlers.adminSignup, person(email))).code, 400, "no second account for the same email");
});

test("telecaller sign-up needs the code; the account is pending with no branch; a failed profile write leaves nothing", { skip }, async () => {
  const email = "self.tc@x.test";
  const wrong = await run(handlers.telecallerSignup, person(email, { code: "nope" }));
  assert.equal(wrong.code, 403);
  await nothingFor(email);
  const failed = await whileFailing((t) => /INSERT INTO app_records/.test(t), () => run(handlers.telecallerSignup, person(email, { code: "let-me-in" })));
  assert.equal(failed.code, 500);
  await nothingFor(email);
  const ok = await run(handlers.telecallerSignup, person(email, { code: "let-me-in" }));
  assert.equal(ok.code, 200, JSON.stringify(ok.body));
  const saved = (await pool.query("SELECT role, branch_id FROM user_roles WHERE user_id = $1", [ok.body.user.id])).rows[0];
  assert.deepEqual([saved.role, saved.branch_id], ["telecaller", null]);
  assert.equal(await n("SELECT count(*) AS n FROM user_branches WHERE user_id = $1", [ok.body.user.id]), 0, "no branch access until an admin assigns one");
});
