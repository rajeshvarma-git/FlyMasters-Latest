process.env.DATABASE_URL = process.env.DATABASE_URL || "postgresql://nobody:nothing@127.0.0.1:1/none";

import test from "node:test";
import assert from "node:assert/strict";
import { decideAccountAction } from "../server/lib/accessPolicy.mjs";
import core from "../server/routes/core.mjs";
import { pool } from "../server/lib/db.mjs";

const A = "aaaaaaaa-0000-0000-0000-000000000001";
const B = "bbbbbbbb-0000-0000-0000-000000000002";
const scoped = (...ids) => ({ allBranches: false, branchIds: ids });
const actor = (role, scope, id = "actor") => ({ id, role, scope });
const decide = (o) => decideAccountAction(o);

// ---------- the pure policy ----------

test("self-expansion: nobody changes their own role or branches, super admin included", () => {
  for (const [role, scope] of [["admin", scoped(A)], ["branch_head", scoped(A)], ["super_admin", { allBranches: true }]]) {
    for (const action of ["staff.role.change", "staff.branches.change"]) {
      const r = decide({ actor: actor(role, scope), action, target: { id: "actor", role, branchIds: [A] }, requested: { role: "admin", branchIds: [A, B] } });
      assert.equal(r.code, "SELF_CHANGE", `${role} ${action}`);
    }
  }
});

test("Admin A cannot hand out Branch B, and cannot change someone who also belongs to B", () => {
  const me = actor("admin", scoped(A));
  assert.equal(decide({ actor: me, action: "staff.branches.change", target: { id: "t", role: "telecaller", branchIds: [A] }, requested: { branchIds: [A, B] } }).code, "OUT_OF_SCOPE");
  const shared = { id: "t", role: "telecaller", branchIds: [A, B] };
  assert.equal(decide({ actor: me, action: "staff.role.change", target: shared, requested: { role: "counselor" } }).code, "OUT_OF_SCOPE");
  assert.equal(decide({ actor: me, action: "staff.password.reset", target: shared }).code, "OUT_OF_SCOPE");
  assert.equal(decide({ actor: me, action: "staff.branches.change", target: { id: "t", role: "telecaller", branchIds: [A] }, requested: { branchIds: [A] } }).ok, true);
});

test("Admin may create and manage ordinary employees in their branches, but not privileged roles", () => {
  const me = actor("admin", scoped(A));
  for (const role of ["counselor", "telecaller", "accountant", "student"]) assert.equal(decide({ actor: me, action: "staff.create", requested: { role, branchIds: [A] } }).ok, true, role);
  for (const role of ["admin", "branch_head", "super_admin"]) assert.equal(decide({ actor: me, action: "staff.create", requested: { role, branchIds: [A] } }).code, "NEEDS_HIGHER_AUTHORITY", role);
  assert.equal(decide({ actor: me, action: "staff.create", requested: { role: "telecaller", branchIds: [B] } }).code, "OUT_OF_SCOPE");
  for (const role of ["admin", "branch_head", "super_admin"]) assert.equal(decide({ actor: me, action: "staff.password.reset", target: { id: "t", role, branchIds: [A] } }).code, "NEEDS_HIGHER_AUTHORITY", role);
  assert.equal(decide({ actor: me, action: "staff.role.change", target: { id: "t", role: "telecaller", branchIds: [A] }, requested: { role: "admin" } }).code, "NEEDS_HIGHER_AUTHORITY");
});

test("a student is judged by their lead's branch; one with no branch cannot be judged by a scoped Admin", () => {
  const me = actor("admin", scoped(A));
  assert.equal(decide({ actor: me, action: "staff.password.reset", target: { id: "s", role: null, branchIds: [], leadBranchIds: [A] } }).ok, true);
  assert.equal(decide({ actor: me, action: "staff.password.reset", target: { id: "s", role: null, branchIds: [], leadBranchIds: [B] } }).code, "OUT_OF_SCOPE");
  assert.equal(decide({ actor: me, action: "staff.password.reset", target: { id: "s", role: "student", branchIds: [], leadBranchIds: [] } }).code, "OUT_OF_SCOPE");
  assert.equal(decide({ actor: actor("admin", { allBranches: true }), action: "staff.password.reset", target: { id: "s", role: null, branchIds: [], leadBranchIds: [] } }).ok, true, "enforcement off: unchanged");
});

test("an employee with no branch yet can be completed by an Admin", () => {
  assert.equal(decide({ actor: actor("admin", scoped(A)), action: "staff.branches.change", target: { id: "t", role: "telecaller", branchIds: [] }, requested: { branchIds: [A] } }).ok, true);
});

test("Branch Head can do nothing without an explicit delegation, and a delegation stays inside its roles and branches", () => {
  const bh = actor("branch_head", scoped(A, B));
  for (const action of ["staff.create", "staff.role.change", "staff.branches.change", "staff.password.reset"]) {
    assert.equal(decide({ actor: bh, action, target: { id: "t", role: "telecaller", branchIds: [A] }, requested: { role: "admin", branchIds: [A] } }).code, "NEEDS_DELEGATION", action);
  }
  const grants = [{ action: "staff.create", roles: ["telecaller", "admin"], branch_ids: [A] }];
  assert.equal(decide({ actor: bh, action: "staff.create", requested: { role: "telecaller", branchIds: [A] }, grants }).ok, true);
  assert.notEqual(decide({ actor: bh, action: "staff.create", requested: { role: "admin", branchIds: [A] }, grants }).ok, true, "a grant never covers a privileged role");
  assert.equal(decide({ actor: bh, action: "staff.create", requested: { role: "telecaller", branchIds: [B] }, grants }).code, "OUT_OF_SCOPE");
  assert.equal(decide({ actor: bh, action: "staff.create", requested: { role: "counselor", branchIds: [A] }, grants }).code, "ROLE_NOT_ALLOWED");
  assert.equal(decide({ actor: bh, action: "staff.role.change", target: { id: "t", role: "telecaller", branchIds: [A] }, requested: { role: "counselor" }, grants }).code, "NEEDS_DELEGATION", "a create grant does not grant role changes");
});

test("Super Admin keeps global authority", () => {
  const sa = actor("super_admin", { allBranches: true });
  assert.equal(decide({ actor: sa, action: "staff.create", requested: { role: "admin", branchIds: [] } }).ok, true);
  assert.equal(decide({ actor: sa, action: "staff.role.change", target: { id: "t", role: "admin", branchIds: [A, B] }, requested: { role: "branch_head" } }).ok, true);
});

// ---------- the real route handlers: forbidden requests must fail and write nothing ----------

const route = (path, method) => core.stack.find((l) => l.route?.path === path && l.route.methods[method]).route.stack.at(-1).handle;
const H = { role: route("/api/users/:id/role", "put"), password: route("/api/users/:id/password", "put"), branches: route("/api/users/:id/branches", "put"), create: route("/api/users", "post") };

function world(accounts) {
  const writes = [];
  const originalQuery = pool.query.bind(pool);
  const originalConnect = pool.connect.bind(pool);
  const answer = (sql, params) => {
    const text = String(sql).replace(/\s+/g, " ").trim();
    if (/^INSERT INTO user_roles/.test(text)) { writes.push(text.slice(0, 40)); return { rows: [{ user_id: params[0], role: params[1], branch_id: A }], rowCount: 1 }; }
    if (/^(INSERT|UPDATE|DELETE)/.test(text)) { writes.push(text.slice(0, 40)); return { rows: [], rowCount: 1 }; }
    if (/^SELECT 1 FROM auth_users/.test(text)) return { rows: accounts[params[0]] ? [{}] : [] };
    if (/^SELECT id, lower\(email\)/.test(text)) return { rows: accounts[params[0]] ? [{ id: params[0], email: `${params[0]}@x.test` }] : [] };
    if (/^SELECT role, branch_id FROM user_roles/.test(text)) { const a = accounts[params[0]]; return { rows: a?.role ? [{ role: a.role, branch_id: a.branches?.[0] ?? null }] : [] }; }
    if (/^SELECT branch_id FROM user_branches/.test(text)) return { rows: (accounts[params[0]]?.branches || []).map((b) => ({ branch_id: b })) };
    if (/FROM app_records/.test(text) && /student_leads/.test(text)) return { rows: (accounts[params[0]]?.leads || []).map((b) => ({ branch_id: b })) };
    if (/FROM branches/.test(text)) return { rows: [{ id: A }, { id: B }] };
    return { rows: [], rowCount: 0 };
  };
  pool.query = async (sql, params) => answer(sql, params);
  pool.connect = async () => ({ query: async (sql, params) => { const t = String(sql).trim(); if (/^(BEGIN|COMMIT|ROLLBACK)/.test(t)) { if (t === "COMMIT") writes.push("COMMIT"); return { rows: [] }; } return answer(sql, params); }, release() {} });
  return { writes, restore() { pool.query = originalQuery; pool.connect = originalConnect; } };
}
async function call(handler, user, scope, { id, body = {} }) {
  const res = { code: 200, body: null, status(c) { this.code = c; return this; }, json(b) { this.body = b; return this; } };
  await handler({ user, scope, params: { id }, body, headers: {}, ip: "t" }, res);
  return res;
}
const withWorld = async (accounts, fn) => { const w = world(accounts); try { return await fn(w); } finally { w.restore(); } };

test("HTTP: Admin A adding Branch B to their own memberships is refused and writes nothing", async () => {
  await withWorld({ adminA: { role: "admin", branches: [A] } }, async (w) => {
    const r = await call(H.branches, { id: "adminA", role: "admin", branch_ids: [A] }, scoped(A), { id: "adminA", body: { branchIds: [A, B] } });
    assert.equal(r.code, 403);
    assert.deepEqual(w.writes, []);
  });
});

test("HTTP: Branch Head promoting an employee in another branch to Admin is refused and writes nothing", async () => {
  await withWorld({ emp: { role: "telecaller", branches: [B] } }, async (w) => {
    const r = await call(H.role, { id: "bh", role: "branch_head", branch_ids: [A] }, scoped(A), { id: "emp", body: { role: "admin" } });
    assert.equal(r.code, 403);
    assert.equal(r.body.code, "NEEDS_DELEGATION");
    assert.deepEqual(w.writes, []);
  });
});

test("HTTP: Admin A resetting a Branch B student's password is refused and writes nothing", async () => {
  await withWorld({ stu: { role: null, leads: [B] } }, async (w) => {
    const r = await call(H.password, { id: "adminA", role: "admin", branch_ids: [A] }, scoped(A), { id: "stu", body: { password: "newpass1" } });
    assert.equal(r.code, 403);
    assert.deepEqual(w.writes, []);
  });
});

test("HTTP: the same Admin may reset a Branch A student, and a missing account is a 404", async () => {
  await withWorld({ stuA: { role: null, leads: [A] } }, async (w) => {
    const ok = await call(H.password, { id: "adminA", role: "admin", branch_ids: [A] }, scoped(A), { id: "stuA", body: { password: "newpass1" } });
    assert.equal(ok.code, 200);
    assert.ok(w.writes.some((x) => x.startsWith("UPDATE auth_users")));
    const missing = await call(H.password, { id: "adminA", role: "admin", branch_ids: [A] }, scoped(A), { id: "nobody", body: { password: "newpass1" } });
    assert.equal(missing.code, 404);
  });
});

test("HTTP: an Admin cannot create an Admin, a Branch Head cannot create anyone, and neither writes", async () => {
  await withWorld({}, async (w) => {
    const a = await call(H.create, { id: "adminA", role: "admin" }, scoped(A), { id: "-", body: { email: "n@x.test", password: "abcdef", role: "admin", branchIds: [A] } });
    assert.equal(a.code, 403);
    const b = await call(H.create, { id: "bh", role: "branch_head" }, scoped(A), { id: "-", body: { email: "n@x.test", password: "abcdef", role: "telecaller", branchIds: [A] } });
    assert.equal(b.code, 403);
    assert.equal(b.body.code, "NEEDS_DELEGATION");
    assert.deepEqual(w.writes, []);
  });
});

test("HTTP: an in-scope Admin can still do the allowed things (role change keeps working)", async () => {
  await withWorld({ emp: { role: "telecaller", branches: [A] } }, async (w) => {
    const r = await call(H.role, { id: "adminA", role: "admin", branch_ids: [A] }, scoped(A), { id: "emp", body: { role: "student" } });
    assert.equal(r.code, 200, JSON.stringify(r.body));
    assert.ok(w.writes.some((x) => x.startsWith("INSERT INTO user_roles")));
  });
});