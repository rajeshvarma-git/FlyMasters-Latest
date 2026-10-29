import test from "node:test";
import assert from "node:assert/strict";
import { applyRoleChange, decideRoleChange } from "../server/lib/roleChange.mjs";

// A store that records every call, so "denied" can be proven to mean "nothing written".
function fakeStore(rolesByUser = {}) {
  const calls = { getRole: 0, setRole: 0, audit: 0 };
  return {
    calls,
    getRole: async (id) => {
      calls.getRole += 1;
      return rolesByUser[id] ? { id: `role-${id}`, role: rolesByUser[id] } : null;
    },
    setRole: async () => { calls.setRole += 1; },
    audit: async () => { calls.audit += 1; },
  };
}

const admin = { id: "admin-1", role: "admin" };
const branchHead = { id: "bh-1", role: "branch_head" };
const superAdmin = { id: "super-1", role: "super_admin" };

async function denied(actor, targetId, newRole, roles, status) {
  const store = fakeStore(roles);
  const result = await applyRoleChange({ actor, targetId, newRole, store });
  assert.equal(result.ok, false);
  assert.equal(result.status, status);
  assert.equal(store.calls.setRole, 0, "a denied request must not write the role");
  assert.equal(store.calls.audit, 0, "a denied request must not audit a change that never happened");
  return result;
}

test("an admin cannot grant Super Admin", async () => {
  const r = await denied(admin, "u1", "super_admin", { u1: "telecaller" }, 403);
  assert.match(r.error, /only a super admin can grant/i);
});

test("a branch head cannot grant Super Admin", async () => {
  await denied(branchHead, "u1", "super_admin", { u1: "telecaller" }, 403);
});

test("an admin cannot change an existing Super Admin's role", async () => {
  const r = await denied(admin, "boss", "student", { boss: "super_admin" }, 403);
  assert.match(r.error, /only a super admin can change/i);
});

test("a branch head cannot change an existing Super Admin's role", async () => {
  await denied(branchHead, "boss", "telecaller", { boss: "super_admin" }, 403);
});

test("nobody can change their own role, super admins included", async () => {
  await denied(admin, "admin-1", "super_admin", { "admin-1": "admin" }, 400);
  await denied(admin, "admin-1", "student", { "admin-1": "admin" }, 400);
  await denied(superAdmin, "super-1", "student", { "super-1": "super_admin" }, 400);
});

test("an unknown role is rejected before anything is read", async () => {
  const store = fakeStore({ u1: "student" });
  const result = await applyRoleChange({ actor: admin, targetId: "u1", newRole: "root", store });
  assert.deepEqual([result.ok, result.status], [false, 400]);
  assert.deepEqual(store.calls, { getRole: 0, setRole: 0, audit: 0 });
});

test("a super admin may grant Super Admin and the change is audited", async () => {
  const store = fakeStore({ u1: "telecaller" });
  const result = await applyRoleChange({ actor: superAdmin, targetId: "u1", newRole: "super_admin", store });
  assert.equal(result.ok, true);
  assert.equal(result.previousRole, "telecaller");
  assert.deepEqual(store.calls, { getRole: 1, setRole: 1, audit: 1 });
});

test("a super admin may change another super admin's role", async () => {
  const store = fakeStore({ boss: "super_admin" });
  const result = await applyRoleChange({ actor: superAdmin, targetId: "boss", newRole: "admin", store });
  assert.equal(result.ok, true);
  assert.equal(store.calls.setRole, 1);
});

test("an admin can still make an ordinary role change on an ordinary account", async () => {
  const store = fakeStore({ u1: "student" });
  const result = await applyRoleChange({ actor: admin, targetId: "u1", newRole: "telecaller", store });
  assert.equal(result.ok, true);
  assert.deepEqual(store.calls, { getRole: 1, setRole: 1, audit: 1 });
});

test("decideRoleChange is pure and compares ids as strings", () => {
  assert.equal(decideRoleChange({ actor: { id: 7, role: "admin" }, targetId: "7", newRole: "student", currentRole: "admin" }).ok, false);
});