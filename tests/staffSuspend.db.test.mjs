// Removing or suspending a staff member must actually revoke access, against a real PostgreSQL.
//
// Found by scripts/acceptance-onboarding.mjs: `POST /api/counselors/:id/remove` returned ok and the
// removed Counselor could still sign in with their role and branch intact. `auth_users` has no
// is_active column, so the flag resolveAccountIdentity honours is user_roles.is_active, and removal
// never touched it. Nothing in the codebase could suspend an account at all.
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
const schema = `sus_${randomBytes(4).toString("hex")}`;

let pool;
let h;
let B1;
let B2;

if (!skip) {
  const admin = new pg.Pool({ connectionString: URL });
  await admin.query(`CREATE SCHEMA ${schema}`);
  await admin.end();
  process.env.DATABASE_URL = `${URL}${URL.includes("?") ? "&" : "?"}options=-c%20search_path%3D${schema}`;
  process.env.JWT_SECRET = process.env.JWT_SECRET || `suspend-test-${randomBytes(8).toString("hex")}`;
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
    removeCounselor: last("/api/counselors/:id/remove", "post"),
    removeTelecaller: last("/api/telecallers/:id/remove", "post"),
    suspend: last("/api/users/:id/suspend", "post"),
    restore: last("/api/users/:id/restore", "post"),
    state: last("/api/state", "get"),
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
const scopeOf = (...ids) => ({ allBranches: false, branchIds: ids });
const PASSWORD = "suspend-test-pass";

async function run(handler, { body = {}, params = {}, actor }) {
  const res = {
    code: 200, body: null,
    status(c) { this.code = c; return this; },
    json(b) { this.body = b; return this; },
  };
  const req = {
    body, headers: {}, ip: `s-${Math.random()}`, params, query: {},
    user: { id: actor.id, role: actor.role, email: actor.email }, scope: actor.scope,
  };
  await handler(req, res);
  return res;
}

let seq = 0;
async function makeStaff(role, branchId, actor = SUPER) {
  const email = `sus${++seq}.${role}@x.test`;
  const r = await run(h.createUser, {
    actor,
    body: { email, password: PASSWORD, firstName: "Sus", lastName: role, role, branchId },
  });
  assert.equal(r.code, 200, JSON.stringify(r.body));
  return { id: r.body.id, email, role };
}

const canSignIn = async (email) => {
  const r = await run(h.signin, { actor: { id: "anon", role: "student", email }, body: { email, password: PASSWORD } });
  return { ok: r.code === 200 && Boolean(r.body?.token), res: r };
};
const roleRow = async (userId) => (await pool.query(
  "SELECT role, is_active FROM user_roles WHERE user_id = $1", [String(userId)],
)).rows[0];
const auditFor = async (action, userId) => (await pool.query(
  "SELECT action, entity_id FROM audit_log WHERE action = $1 AND entity_id = $2", [action, String(userId)],
)).rows;

// ---- the defect: removal must revoke access ---------------------------------------------------

test("a removed Counselor can no longer sign in", { skip }, async () => {
  const c = await makeStaff("counselor", B1);
  assert.ok((await canSignIn(c.email)).ok, "could not sign in before removal; the test proves nothing");
  const removed = await run(h.removeCounselor, { actor: SUPER, params: { id: c.id }, body: {} });
  assert.equal(removed.code, 200, JSON.stringify(removed.body));
  const after = await canSignIn(c.email);
  assert.equal(after.ok, false, `a removed Counselor still signed in: ${JSON.stringify(after.res.body)?.slice(0, 160)}`);
  assert.equal((await roleRow(c.id))?.is_active, false, "user_roles.is_active was left alone");
});

test("a removed Telecaller can no longer sign in", { skip }, async () => {
  const t = await makeStaff("telecaller", B1);
  assert.ok((await canSignIn(t.email)).ok);
  const removed = await run(h.removeTelecaller, { actor: SUPER, params: { id: t.id }, body: {} });
  assert.equal(removed.code, 200, JSON.stringify(removed.body));
  const after = await canSignIn(t.email);
  assert.equal(after.ok, false, `a removed Telecaller still signed in: ${JSON.stringify(after.res.body)?.slice(0, 160)}`);
});

// ---- suspend and restore ----------------------------------------------------------------------

test("suspend blocks sign-in, restore brings it back, and both are audited", { skip }, async () => {
  const t = await makeStaff("telecaller", B1);
  assert.ok((await canSignIn(t.email)).ok);

  const suspended = await run(h.suspend, { actor: SUPER, params: { id: t.id }, body: { reason: "left the company" } });
  assert.equal(suspended.code, 200, JSON.stringify(suspended.body));
  assert.equal((await canSignIn(t.email)).ok, false, "a suspended account still signed in");
  assert.equal((await roleRow(t.id))?.is_active, false);
  assert.equal((await auditFor("staff.suspend", t.id)).length, 1);

  const restored = await run(h.restore, { actor: SUPER, params: { id: t.id }, body: {} });
  assert.equal(restored.code, 200, JSON.stringify(restored.body));
  assert.ok((await canSignIn(t.email)).ok, "a restored account could not sign in");
  assert.equal((await roleRow(t.id))?.is_active, true);
  assert.equal((await auditFor("staff.restore", t.id)).length, 1);
});

test("suspending twice is harmless", { skip }, async () => {
  const t = await makeStaff("telecaller", B1);
  assert.equal((await run(h.suspend, { actor: SUPER, params: { id: t.id }, body: {} })).code, 200);
  assert.equal((await run(h.suspend, { actor: SUPER, params: { id: t.id }, body: {} })).code, 200);
  assert.equal((await canSignIn(t.email)).ok, false);
});

// ---- who may do it ----------------------------------------------------------------------------

test("an Admin can suspend staff in their own branch", { skip }, async () => {
  const admin = await makeStaff("admin", B1);
  const target = await makeStaff("counselor", B1);
  const actor = { id: admin.id, role: "admin", email: admin.email, scope: scopeOf(B1) };
  assert.equal((await run(h.suspend, { actor, params: { id: target.id }, body: {} })).code, 200);
  assert.equal((await canSignIn(target.email)).ok, false);
});

test("an Admin cannot suspend staff in a branch they do not hold", { skip }, async () => {
  const admin = await makeStaff("admin", B1);
  const target = await makeStaff("counselor", B2);
  const actor = { id: admin.id, role: "admin", email: admin.email, scope: scopeOf(B1) };
  const r = await run(h.suspend, { actor, params: { id: target.id }, body: {} });
  assert.ok(r.code === 403 || r.code === 404, `expected a refusal, got ${r.code} ${JSON.stringify(r.body)}`);
  assert.ok((await canSignIn(target.email)).ok, "the account was suspended anyway");
});

test("a Super Admin account cannot be suspended", { skip }, async () => {
  const other = await makeStaff("super_admin", null);
  const r = await run(h.suspend, { actor: SUPER, params: { id: other.id }, body: {} });
  assert.equal(r.code, 403, JSON.stringify(r.body));
  assert.ok((await canSignIn(other.email)).ok, "a Super Admin was locked out");
});

test("you cannot suspend yourself", { skip }, async () => {
  const admin = await makeStaff("admin", B1);
  const actor = { id: admin.id, role: "admin", email: admin.email, scope: scopeOf(B1) };
  const r = await run(h.suspend, { actor, params: { id: admin.id }, body: {} });
  assert.equal(r.code, 400, JSON.stringify(r.body));
  assert.ok((await canSignIn(admin.email)).ok, "an admin locked themselves out");
});

// The tests above call the final handler, which is past the guard stack, so the role gate is checked
// the way the rest of this repository checks it: against the real middleware in front of the route
// (same approach as tests/staffMoveRestricted.test.mjs).
test("only Admin and Super Admin may suspend or restore; other roles are refused by the guard", { skip }, async () => {
  const core = (await import("../server/routes/core.mjs")).default;
  const roleOutcome = (path, role) => {
    const layer = core.stack.find((l) => l.route?.path === path && l.route.methods.post);
    assert.ok(layer, `${path} not found`);
    const res = { code: null, body: null, status(c) { this.code = c; return this; }, json(b) { this.body = b; return this; } };
    let passed = false;
    for (const handle of layer.route.stack.map((x) => x.handle).slice(0, -1)) {
      if (handle.length < 3 || handle.name === "session" || handle.name === "branchScope") continue;
      handle({ user: { id: "u", role } }, res, () => { passed = true; });
      if (res.code) break;
    }
    return { code: res.code, passed };
  };
  for (const path of ["/api/users/:id/suspend", "/api/users/:id/restore"]) {
    for (const role of ["admin", "super_admin"]) {
      assert.equal(roleOutcome(path, role).passed, true, `${role} was blocked from ${path}`);
    }
    for (const role of ["branch_head", "counselor", "telecaller", "accountant", "partner", "student"]) {
      assert.equal(roleOutcome(path, role).code, 403, `${role} was allowed through to ${path}`);
    }
  }
});


// ---- what an admin can SEE about a suspended account -------------------------------------------
//
// Journey 6.5 of the release walkthrough: suspend an employee, then look at the staff list. Access was
// correctly refused (6.6, 6.7 pass), but the list showed the account as perfectly normal - it read
// profiles.is_active while suspension writes user_roles.is_active, the flag resolveAccountIdentity
// actually honours. The one screen that should tell an admin "this person is disabled" was reading a
// different flag from the one that disables them.

const staffRow = async (id) => {
  const r = await run(h.state, { actor: SUPER });
  assert.equal(r.code, 200, JSON.stringify(r.body).slice(0, 200));
  return (r.body?.users || []).find((row) => String(row.id) === String(id));
};

test("the staff list shows a suspended employee as inactive", { skip }, async () => {
  const staff = await makeStaff("telecaller", B1);
  const before = await staffRow(staff.id);
  assert.ok(before, "the new employee is not in the staff list at all");
  assert.equal(before.is_active, true, "a new employee is already shown as inactive");

  const done = await run(h.suspend, { actor: SUPER, params: { id: staff.id }, body: { reason: "left the company" } });
  assert.equal(done.code, 200, JSON.stringify(done.body));

  const after = await staffRow(staff.id);
  assert.equal(after.is_active, false,
    "the staff list still calls a suspended employee active, so an admin cannot tell who has been disabled");

  // And the flag has to mean what the sign-in check means by it.
  const tried = await canSignIn(staff.email);
  assert.equal(tried.ok, false, "the account shown as inactive can still sign in");
});

test("restoring puts the account back to active in the same list", { skip }, async () => {
  const staff = await makeStaff("counselor", B1);
  await run(h.suspend, { actor: SUPER, params: { id: staff.id }, body: { reason: "temporary" } });
  assert.equal((await staffRow(staff.id)).is_active, false);

  const back = await run(h.restore, { actor: SUPER, params: { id: staff.id } });
  assert.equal(back.code, 200, JSON.stringify(back.body));
  assert.equal((await staffRow(staff.id)).is_active, true, "a restored employee is still shown as inactive");
  assert.equal((await canSignIn(staff.email)).ok, true, "a restored employee cannot sign in");
});
