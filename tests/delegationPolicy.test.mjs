// ACCESS-03C-1: the fixed rules for issuing delegation grants, and the table that stores them.
import test from "node:test";
import assert from "node:assert/strict";
import { decideGrantIssue, grantIsLive } from "../server/lib/delegationPolicy.mjs";
import { decideAccountAction } from "../server/lib/accessPolicy.mjs";

const A = "aaaaaaaa-0000-0000-0000-000000000001";
const B = "bbbbbbbb-0000-0000-0000-000000000002";
const NOW = Date.parse("2026-11-01T00:00:00Z");
const HOUR = 3600e3;
const iso = (ms) => new Date(ms).toISOString();

const superAdmin = { id: "sa", role: "super_admin", scope: { allBranches: true, branchIds: [] } };
const adminA = { id: "adminA", role: "admin", scope: { allBranches: false, branchIds: [A] } };
const bhA = { id: "bhA", role: "branch_head", scope: { allBranches: false, branchIds: [A] } };
const headA = { id: "bhA", role: "branch_head", branchIds: [A] };
const manageA = { id: "g-manage", action: "grants.manage", grantee_id: "adminA", roles: ["counselor"], branch_ids: [A], expires_at: null, revoked_at: null };

const issue = (over) => decideGrantIssue({ now: NOW, actor: superAdmin, grantee: headA, requested: { action: "staff.create", roles: ["counselor"], branchIds: [A] }, parentGrants: [], ...over });

test("Super Admin issues a creation grant to a Branch Head directly, and grant-management to an Admin", () => {
  assert.deepEqual(issue({}), { ok: true, parentGrantId: null, expiresAt: null });
  const r = issue({ grantee: { id: "adminA", role: "admin", branchIds: [A, B] }, requested: { action: "grants.manage", roles: ["counselor"], branchIds: [A] } });
  assert.equal(r.ok, true);
});

test("roles: only ordinary employee roles can be delegated, and at least one is needed", () => {
  for (const role of ["admin", "branch_head", "super_admin", "student", "partner"]) {
    assert.equal(issue({ requested: { action: "staff.create", roles: ["counselor", role], branchIds: [A] } }).code, "ROLE_NOT_GRANTABLE", role);
  }
  assert.equal(issue({ requested: { action: "staff.create", roles: [], branchIds: [A] } }).code, "NO_ROLES");
  assert.equal(issue({ requested: { action: "staff.create", branchIds: [A] } }).code, "NO_ROLES");
});

test("branches: at least one, and all of them must be branches the grantee works in", () => {
  assert.equal(issue({ requested: { action: "staff.create", roles: ["counselor"], branchIds: [] } }).code, "NO_BRANCHES");
  assert.equal(issue({ requested: { action: "staff.create", roles: ["counselor"], branchIds: [A, B] } }).code, "GRANTEE_OUT_OF_SCOPE");
  assert.equal(issue({ requested: { action: "staff.create", roles: ["counselor"], branchIds: [B] } }).code, "GRANTEE_OUT_OF_SCOPE");
});

test("nobody grants to themselves, not even a Super Admin", () => {
  assert.equal(issue({ grantee: { ...headA, id: "sa" } }).code, "SELF_GRANT");
  assert.equal(issue({ actor: adminA, grantee: { id: "adminA", role: "admin", branchIds: [A] }, requested: { action: "grants.manage", roles: ["counselor"], branchIds: [A] } }).code, "SELF_GRANT");
});

test("the right kind of grantee: creation grants go to a Branch Head, management grants to an Admin", () => {
  assert.equal(issue({ grantee: { id: "x", role: "counselor", branchIds: [A] } }).code, "WRONG_GRANTEE_ROLE");
  assert.equal(issue({ grantee: { id: "x", role: "admin", branchIds: [A] } }).code, "WRONG_GRANTEE_ROLE");
  assert.equal(issue({ requested: { action: "grants.manage", roles: ["counselor"], branchIds: [A] } }).code, "WRONG_GRANTEE_ROLE");
  assert.equal(issue({ requested: { action: "staff.delete", roles: ["counselor"], branchIds: [A] } }).code, "UNKNOWN_ACTION");
});

test("an Admin issues a creation grant only inside ONE of their own management grants", () => {
  const ask = (over) => issue({ actor: adminA, parentGrants: [manageA], ...over });
  const ok = ask({});
  assert.equal(ok.ok, true);
  assert.equal(ok.parentGrantId, "g-manage");
  assert.equal(ask({ parentGrants: [] }).code, "NEEDS_DELEGATION");
  assert.equal(ask({ requested: { action: "staff.create", roles: ["telecaller"], branchIds: [A] } }).code, "NEEDS_DELEGATION", "the grant covers Counselor only");
  assert.equal(ask({ grantee: { id: "bhB", role: "branch_head", branchIds: [B] }, requested: { action: "staff.create", roles: ["counselor"], branchIds: [B] } }).code, "OUT_OF_SCOPE", "Branch B is not Admin A's branch");
});

test("two narrow management grants never add up to a broad one", () => {
  const narrowRole = { ...manageA, id: "g1", roles: ["counselor"], branch_ids: [A] };
  const narrowBranch = { ...manageA, id: "g2", roles: ["counselor", "telecaller"], branch_ids: [B] };
  const admin = { ...adminA, scope: { allBranches: false, branchIds: [A, B] } };
  const bh = { id: "bhAB", role: "branch_head", branchIds: [A, B] };
  const r = issue({ actor: admin, grantee: bh, parentGrants: [narrowRole, narrowBranch], requested: { action: "staff.create", roles: ["counselor", "telecaller"], branchIds: [A, B] } });
  assert.equal(r.code, "NEEDS_DELEGATION");
});

test("an Admin cannot give grant-management authority onward, and nobody else issues anything", () => {
  const r = issue({ actor: adminA, parentGrants: [manageA], grantee: { id: "adminC", role: "admin", branchIds: [A] }, requested: { action: "grants.manage", roles: ["counselor"], branchIds: [A] } });
  assert.equal(r.code, "NEEDS_HIGHER_AUTHORITY");
  for (const role of ["branch_head", "counselor", "telecaller", "accountant", "student", "partner"]) {
    assert.equal(issue({ actor: { id: "z", role, scope: { allBranches: false, branchIds: [A] } } }).code, "FORBIDDEN", role);
  }
});

test("expiry: past dates are refused, and a child grant never outlives its parent", () => {
  assert.equal(issue({ requested: { action: "staff.create", roles: ["counselor"], branchIds: [A], expiresAt: iso(NOW - HOUR) } }).code, "BAD_EXPIRY");
  assert.equal(issue({ requested: { action: "staff.create", roles: ["counselor"], branchIds: [A], expiresAt: "not a date" } }).code, "BAD_EXPIRY");
  const parent = { ...manageA, expires_at: iso(NOW + 24 * HOUR) };
  const capped = issue({ actor: adminA, parentGrants: [parent] });
  assert.equal(capped.expiresAt, parent.expires_at, "no expiry asked => the parent's expiry");
  const later = issue({ actor: adminA, parentGrants: [parent], requested: { action: "staff.create", roles: ["counselor"], branchIds: [A], expiresAt: iso(NOW + 72 * HOUR) } });
  assert.equal(later.expiresAt, parent.expires_at, "asking for longer is trimmed to the parent's");
  const shorter = issue({ actor: adminA, parentGrants: [parent], requested: { action: "staff.create", roles: ["counselor"], branchIds: [A], expiresAt: iso(NOW + 2 * HOUR) } });
  assert.equal(shorter.expiresAt, iso(NOW + 2 * HOUR));
});

test("a revoked or expired management grant gives an Admin nothing", () => {
  assert.equal(issue({ actor: adminA, parentGrants: [{ ...manageA, revoked_at: iso(NOW - HOUR) }] }).code, "NEEDS_DELEGATION");
  assert.equal(issue({ actor: adminA, parentGrants: [{ ...manageA, expires_at: iso(NOW - HOUR) }] }).code, "NEEDS_DELEGATION");
  assert.equal(issue({ actor: adminA, parentGrants: [{ ...manageA, grantee_id: "someoneElse" }] }).code, "NEEDS_DELEGATION", "someone else's grant is not mine");
  assert.equal(grantIsLive({ ...manageA }, NOW), true);
  assert.equal(grantIsLive(null, NOW), false);
});

test("account creation: several narrow creation grants are judged one at a time, never added together", () => {
  const bh = { ...bhA, scope: { allBranches: false, branchIds: [A, B] } };
  const grants = [
    { action: "staff.create", roles: ["counselor"], branch_ids: [A] },
    { action: "staff.create", roles: ["telecaller"], branch_ids: [B] },
  ];
  const create = (role, branchIds) => decideAccountAction({ actor: bh, action: "staff.create", requested: { role, branchIds }, grants });
  assert.equal(create("counselor", [A]).ok, true, "first grant alone");
  assert.equal(create("telecaller", [B]).ok, true, "second grant alone: the first denial must not hide it");
  assert.notEqual(create("counselor", [B]).ok, true, "counselor in B is in neither grant");
  assert.notEqual(create("telecaller", [A]).ok, true);
  assert.notEqual(create("counselor", [A, B]).ok, true, "A+B is not covered by either grant");
  assert.notEqual(create("accountant", [A]).ok, true);
});
