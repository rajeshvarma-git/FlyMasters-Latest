// Launch contract rule 6: only Admin and Super Admin can remove or transfer counselors and telecallers.
// The real route guards run here: the role check that sits in front of each handler.

process.env.DATABASE_URL = process.env.DATABASE_URL || "postgresql://nobody:nothing@127.0.0.1:1/none";

import test from "node:test";
import assert from "node:assert/strict";
import core from "../server/routes/core.mjs";

const ROUTES = [
  "/api/counselors/:id/transfer", "/api/telecallers/:id/transfer",
  "/api/counselors/:id/remove", "/api/telecallers/:id/remove",
];

// The role check is the one guard in the stack that answers 403 for a role it does not allow.
function roleOutcome(path, role) {
  const layer = core.stack.find((l) => l.route?.path === path && l.route.methods.post);
  assert.ok(layer, `${path} not found`);
  const handlers = layer.route.stack.map((s) => s.handle);
  const res = { code: null, body: null, status(c) { this.code = c; return this; }, json(b) { this.body = b; return this; } };
  let passed = false;
  for (const handle of handlers.slice(0, -1)) {
    if (handle.length < 3 || handle.name === "session") continue; // session needs a database; the role check does not
    if (handle.name === "branchScope") continue;
    handle({ user: { id: "u", role } }, res, () => { passed = true; });
    if (res.code) break;
  }
  return { code: res.code, passed };
}

for (const path of ROUTES) {
  test(`${path}: Branch Head is refused`, () => {
    const r = roleOutcome(path, "branch_head");
    assert.equal(r.code, 403);
    assert.equal(r.passed, false);
  });
  for (const role of ["admin", "super_admin"]) {
    test(`${path}: ${role} passes the role check`, () => {
      const r = roleOutcome(path, role);
      assert.equal(r.code, null);
      assert.equal(r.passed, true);
    });
  }
  for (const role of ["counselor", "telecaller", "accountant", "student"]) {
    test(`${path}: ${role} is refused`, () => {
      assert.equal(roleOutcome(path, role).code, 403);
    });
  }
}
