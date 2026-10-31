import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { scopeFor, isBranchLimited, adminScopeEnforced } from "../server/lib/accessScope.mjs";
import { branchScope, scopeClause, assertInScope, filterToScope } from "../server/lib/auth.mjs";

const A = "aaaaaaaa-0000-0000-0000-000000000001";
const B = "bbbbbbbb-0000-0000-0000-000000000002";
const user = (role, ids = [], home = ids[0] || null) => ({ id: "u", role, branch_id: home, branch_ids: ids });
const withFlag = async (value, fn) => {
  const old = process.env.ADMIN_SCOPE_ENFORCED;
  if (value === undefined) delete process.env.ADMIN_SCOPE_ENFORCED; else process.env.ADMIN_SCOPE_ENFORCED = value;
  try { return await fn(); } finally { if (old === undefined) delete process.env.ADMIN_SCOPE_ENFORCED; else process.env.ADMIN_SCOPE_ENFORCED = old; }
};
function run(u) {
  const req = { user: u }; let status = 200, body = null, nexted = false;
  const res = { status(s) { status = s; return this; }, json(b) { body = b; return this; } };
  branchScope(req, res, () => { nexted = true; });
  return { req, status, body, nexted };
}

test("flag off: Admin keeps today's unrestricted view (rollout switch, not a fallback)", async () => {
  await withFlag(undefined, () => {
    assert.equal(adminScopeEnforced(), false);
    assert.equal(scopeFor(user("admin", [A])).allBranches, true);
    assert.equal(run(user("admin", [])).nexted, true);
  });
});

test("flag on: Admin is limited to the branches assigned to them", async () => {
  await withFlag("true", () => {
    assert.deepEqual(scopeFor(user("admin", [A])), { allBranches: false, branchIds: [A], branchId: A });
    const r = run(user("admin", [A, B], B));
    assert.equal(r.nexted, true);
    assert.deepEqual(r.req.scope.branchIds, [A, B]);
    assert.equal(r.req.scope.branchId, B, "new records are stamped with the home branch");
  });
});

test("flag on: an Admin with no assigned branch gets no branch access, never everything", async () => {
  await withFlag("true", () => {
    const r = run(user("admin", [], null));
    assert.equal(r.nexted, false);
    assert.equal(r.status, 403);
    assert.equal(r.body.code, "NO_BRANCH_SCOPE");
    assert.equal(r.req.scope, undefined);
  });
});

test("Super Admin is never limited; the other branch roles are always limited, flag or not", async () => {
  for (const flag of [undefined, "true"]) await withFlag(flag, () => {
    assert.equal(scopeFor(user("super_admin", [])).allBranches, true);
    assert.equal(run(user("super_admin", [])).nexted, true);
    for (const role of ["branch_head", "counselor", "telecaller", "accountant"]) {
      assert.equal(isBranchLimited(role), true, role);
      assert.equal(run(user(role, [])).status, 403, role + " with no branch");
    }
  });
});

test("Admin A cannot read or touch Branch B rows once enforced", async () => {
  await withFlag("true", () => {
    const { req } = run(user("admin", [A]));
    const rows = [{ id: 1, branch_id: A }, { id: 2, branch_id: B }, { id: 3, branch_id: null }];
    assert.deepEqual(filterToScope(req.scope, rows).map((r) => r.id), [1]);
    assert.equal(assertInScope(req.scope, rows[1]), false);
    assert.equal(assertInScope(req.scope, rows[2]), false, "an unassigned row is not in anyone's scope but Super Admin's");
    const q = scopeClause(req.scope, "branch_id", []);
    assert.match(q.text, /branch_id = ANY\(\$1::uuid\[\]\)/);
    assert.deepEqual(q.params, [[A]]);
  });
});

test("scope is read from the account on every request, so a removed branch disappears at once", async () => {
  await withFlag("true", () => {
    assert.deepEqual(run(user("admin", [A, B])).req.scope.branchIds, [A, B]);
    assert.deepEqual(run(user("admin", [A])).req.scope.branchIds, [A]);
  });
});

test("the student app's data API applies the same rule: only Super Admin is a global viewer once enforced", () => {
  const s = readFileSync("server/student/dataPolicy.ts", "utf8");
  assert.match(s, /const admin = ADMIN_ROLES\.has\(role\) && !isBranchLimited\(role\)/);
});

test("nothing outside accessScope.mjs hands out unrestricted branch scope", () => {
  const offenders = [];
  const walk = (dir) => { for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = `${dir}/${e.name}`;
    if (e.isDirectory()) walk(p); else if (/\.(mjs|ts)$/.test(e.name) && !p.endsWith("accessScope.mjs") && /allBranches:\s*true/.test(readFileSync(p, "utf8").split("\n").filter((l) => !/^\s*(\*|\/\/|\/\*)/.test(l)).join("\n"))) offenders.push(p);
  } };
  walk("server");
  assert.deepEqual(offenders, []);
});