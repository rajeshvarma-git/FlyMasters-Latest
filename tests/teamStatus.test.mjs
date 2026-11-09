// Team Status: four roles, two separate statuses, and branch scope on BOTH the list and the
// single-person request. Pure rules first, then the real route handlers over a fake database.
process.env.DATABASE_URL = process.env.DATABASE_URL || "postgresql://nobody:nothing@127.0.0.1:1/none";

import test from "node:test";
import assert from "node:assert/strict";
import { buildEmployees, buildTeamList, workingStatus, employeeVisible } from "../server/lib/teamStatus.mjs";
import core from "../server/routes/core.mjs";
import { pool } from "../server/lib/db.mjs";

const A = "aaaaaaaa-0000-0000-0000-000000000001";
const B = "bbbbbbbb-0000-0000-0000-000000000002";
const everything = { allBranches: true, branchIds: [] };
const only = (...ids) => ({ allBranches: false, branchIds: ids });
const TODAY = "2026-11-03";

const user = (id, role, branches, extra = {}) => ({
  id, role, email: `${id}@x.test`, first_name: id, last_name: "", branch_ids: branches, is_active: true, ...extra,
});
const users = [
  user("c1", "counselor", [A]), user("t1", "telecaller", [A]), user("h1", "branch_head", [A]),
  user("ad1", "admin", [A]), user("c2", "counselor", [B]), user("ad2", "admin", [B]),
  user("adx", "admin", [A, B]), user("noBranch", "admin", []),
  user("stu", "student", [A]), user("acct", "accountant", [A]), user("boss", "super_admin", []),
];
const branches = [{ id: A, name: "Hyderabad" }, { id: B, name: "Vizag" }];
const base = { users, counselors: [], branches, today: TODAY, attendance: [], leave: [], everClocked: new Set() };

test("all five employee roles are listed; students and super admins are not", () => {
  const rows = buildTeamList({ ...base, scope: everything });
  assert.deepEqual(
    [...new Set(rows.map((r) => r.role))].sort(),
    ["accountant", "admin", "branch_head", "counselor", "telecaller"],
  );
  // The Accountant is an ordinary branch-scoped employee, so it is listed. A Student is not an
  // employee and a Super Admin is global rather than branch staff, so neither is.
  assert.ok(rows.some((r) => r.id === "acct"), "the accountant is missing from Team Status");
  assert.equal(rows.find((r) => r.id === "acct")?.roleLabel, "Accountant");
  assert.ok(!rows.some((r) => ["stu", "boss"].includes(r.id)));
});

test("each row carries name, role label, branch names and the two statuses", () => {
  const row = buildTeamList({ ...base, scope: everything }).find((r) => r.id === "h1");
  assert.equal(row.name, "h1");
  assert.equal(row.roleLabel, "Branch Head");
  assert.deepEqual(row.branches, [{ id: A, name: "Hyderabad" }]);
  assert.equal(row.account, "enabled");
  assert.equal(row.working, "unknown");
});

test("a person known by two records (login + profile) is listed once", () => {
  const dupes = [user("login-1", "counselor", [A], { email: "same@x.test" }), user("profile-1", "counselor", [], { email: "SAME@x.test" })];
  const rows = buildTeamList({ ...base, users: dupes, scope: everything });
  assert.equal(rows.length, 1);
  assert.equal(rows[0].id, "login-1", "the record that carries the branches wins");
});

test("super admin sees every branch; a scoped viewer sees only people wholly inside their branches", () => {
  const ids = (scope) => buildTeamList({ ...base, scope }).map((r) => r.id).sort();
  assert.deepEqual(ids(everything), ["acct", "ad1", "ad2", "adx", "c1", "c2", "h1", "noBranch", "t1"]);
  assert.deepEqual(ids(only(A)), ["acct", "ad1", "c1", "h1", "t1"], "adx spans A and B; noBranch has none: both withheld");
  assert.deepEqual(ids(only(A, B)), ["acct", "ad1", "ad2", "adx", "c1", "c2", "h1", "t1"]);
  assert.deepEqual(ids(only()), [], "a viewer with no branch sees nobody");
});

test("account status and working status are independent", () => {
  const rows = buildTeamList({ ...base, users: [user("off", "telecaller", [A], { is_active: false })], scope: everything });
  assert.equal(rows[0].account, "disabled");
  assert.equal(rows[0].working, "unknown", "a disabled account is not 'not working' either: there is simply no data");
  const enabled = buildTeamList({ ...base, users: [user("on", "telecaller", [A])], scope: everything });
  assert.equal(enabled[0].account, "enabled");
  assert.notEqual(enabled[0].working, "working", "an enabled account never means working");
});

test("working status comes only from real rows; no data is Unknown, never assumed", () => {
  const emp = buildEmployees({ users: [user("c1", "counselor", [A])], counselors: [{ id: "profile-c1", email: "c1@x.test" }], branches })[0];
  const status = (ctx) => workingStatus(emp, { today: TODAY, attendance: [], leave: [], everClocked: new Set(), ...ctx }).state;
  assert.equal(status({}), "unknown");
  assert.equal(status({ attendance: [{ counselor_id: "c1", date: TODAY, clock_in: "09:00:00", clock_out: null }] }), "working");
  assert.equal(status({ attendance: [{ counselor_id: "profile-c1", date: TODAY, clock_in: "09:00:00", clock_out: "17:00:00" }] }), "finished", "attendance filed under the profile id still counts");
  assert.equal(status({ leave: [{ counselor_id: "c1", status: "approved", start_date: "2026-11-01", end_date: "2026-11-05", leave_type: "sick" }] }), "leave");
  assert.equal(status({ leave: [{ counselor_id: "c1", status: "pending", start_date: "2026-11-01", end_date: "2026-11-05" }] }), "unknown", "unapproved leave is not data about today");
  assert.equal(status({ everClocked: new Set(["profile-c1"]) }), "not_clocked_in", "clocked in before, not today");
  assert.equal(status({ attendance: [{ counselor_id: "c1", date: "2026-11-02", clock_in: "09:00:00", clock_out: null }], everClocked: new Set(["c1"]) }), "not_clocked_in", "yesterday's open row is not today");
});

test("employeeVisible is the one rule for list and detail", () => {
  const [adx] = buildEmployees({ users: [user("adx", "admin", [A, B])], branches });
  assert.equal(employeeVisible(only(A), adx), false);
  assert.equal(employeeVisible(only(A, B), adx), true);
  assert.equal(employeeVisible(everything, adx), true);
});

// ---------- the real route handlers ----------

const route = (path) => core.stack.find((l) => l.route?.path === path && l.route.methods.get).route.stack.at(-1).handle;
const LIST = route("/api/team-status");
const ONE = route("/api/team-status/:id");

function world({ accounts, profiles = [], attendance = [] }) {
  const original = pool.query.bind(pool);
  pool.query = async (sql, params = []) => {
    const text = String(sql).replace(/\s+/g, " ").trim();
    if (/^SELECT id, email, user_metadata, created_at FROM auth_users/.test(text)) {
      return { rows: Object.keys(accounts).map((id) => ({ id, email: `${id}@x.test`, user_metadata: { first_name: id }, created_at: "2026-01-01" })) };
    }
    if (/FROM user_roles/.test(text)) {
      return { rows: Object.entries(accounts).map(([id, a]) => ({ user_id: id, role: a.role, branch_id: a.branches?.[0] ?? null, is_active: true, created_at: "2026-01-01" })) };
    }
    if (/^SELECT user_id, branch_id FROM user_branches$/.test(text)) {
      return { rows: Object.entries(accounts).flatMap(([id, a]) => (a.branches || []).map((b) => ({ user_id: id, branch_id: b }))) };
    }
    if (/FROM branches/.test(text)) return { rows: [{ id: A, name: "Hyderabad" }, { id: B, name: "Vizag" }] };
    if (/FROM counselor_attendance WHERE date >=/.test(text)) return { rows: attendance };
    if (/SELECT DISTINCT counselor_id/.test(text)) return { rows: [...new Set(attendance.map((r) => r.counselor_id))].map((counselor_id) => ({ counselor_id })) };
    if (/FROM app_records WHERE table_name = \$1/.test(text) && params[0] === "profiles") {
      return { rows: profiles.map((p) => ({ id: p.user_id, data: p, branch_id: null, created_at: "2026-01-01" })) };
    }
    return { rows: [], rowCount: 0 };
  };
  return { restore() { pool.query = original; } };
}

async function call(handler, { scope, params = {}, role = "admin" }) {
  const res = { code: 200, body: null, status(c) { this.code = c; return this; }, json(b) { this.body = b; return this; } };
  await handler({ user: { id: "caller", role }, scope, params, headers: {} }, res);
  return res;
}
const accounts = {
  c1: { role: "counselor", branches: [A] }, t1: { role: "telecaller", branches: [A] }, h1: { role: "branch_head", branches: [A] },
  ad1: { role: "admin", branches: [A] }, c2: { role: "counselor", branches: [B] }, adx: { role: "admin", branches: [A, B] },
};
const withWorld = async (setup, fn) => { const w = world(setup); try { return await fn(); } finally { w.restore(); } };

test("GET /api/team-status: Super Admin gets every employee of all four roles", async () => {
  await withWorld({ accounts }, async () => {
    const r = await call(LIST, { scope: everything, role: "super_admin" });
    assert.equal(r.code, 200);
    assert.deepEqual(r.body.employees.map((e) => e.id).sort(), ["ad1", "adx", "c1", "c2", "h1", "t1"]);
    assert.deepEqual([...new Set(r.body.employees.map((e) => e.roleLabel))].sort(), ["Admin", "Branch Head", "Counselor", "Telecaller"]);
  });
});

test("GET /api/team-status: a scoped caller's list is limited to their branch", async () => {
  await withWorld({ accounts }, async () => {
    const r = await call(LIST, { scope: only(A) });
    assert.deepEqual(r.body.employees.map((e) => e.id).sort(), ["ad1", "c1", "h1", "t1"]);
    assert.ok(r.body.branches.every((b) => b.id === A), "the branch filter offers only their own branch");
  });
});

test("GET /api/team-status: empty result for a caller with no branches, and Unknown when there is no attendance data", async () => {
  await withWorld({ accounts }, async () => {
    assert.deepEqual((await call(LIST, { scope: only() })).body.employees, []);
    const all = await call(LIST, { scope: everything });
    assert.ok(all.body.employees.every((e) => e.working === "unknown"));
  });
});

test("GET /api/team-status: shows a disabled account as disabled, and working only from a real clock-in", async () => {
  await withWorld({ accounts, profiles: [{ user_id: "t1", is_active: false }], attendance: [{ counselor_id: "c1", date: new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" }), clock_in: "09:00:00", clock_out: null, total_hours: null }] }, async () => {
    const r = await call(LIST, { scope: everything });
    const byId = Object.fromEntries(r.body.employees.map((e) => [e.id, e]));
    assert.equal(byId.t1.account, "disabled");
    assert.equal(byId.c1.working, "working");
    assert.equal(byId.h1.working, "unknown", "no data for a Branch Head: not assumed active");
  });
});

test("GET /api/team-status/:id: an in-scope person opens; the same request for an out-of-scope person is refused", async () => {
  await withWorld({ accounts }, async () => {
    const ok = await call(ONE, { scope: only(A), params: { id: "h1" } });
    assert.equal(ok.code, 200);
    assert.equal(ok.body.employee.roleLabel, "Branch Head");
    for (const id of ["c2", "adx"]) {
      const no = await call(ONE, { scope: only(A), params: { id } });
      assert.equal(no.code, 403, id);
      assert.equal(no.body.code, "OUT_OF_SCOPE");
      assert.equal(no.body.employee, undefined, "nothing about the person leaks in the refusal");
    }
    assert.equal((await call(ONE, { scope: only(A), params: { id: "nobody" } })).code, 404);
  });
});

test("GET /api/team-status/:id: Super Admin opens any of the four roles", async () => {
  await withWorld({ accounts }, async () => {
    for (const id of ["c1", "t1", "h1", "ad1", "adx"]) {
      const r = await call(ONE, { scope: everything, role: "super_admin", params: { id } });
      assert.equal(r.code, 200, id);
      assert.equal(r.body.employee.id, id);
    }
  });
});
