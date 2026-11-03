// Launch contract rules 6 and 7: company-wide data is changed by Super Admin only.
// The real route guards run here: the role check in front of each handler.

process.env.DATABASE_URL = process.env.DATABASE_URL || "postgresql://nobody:nothing@127.0.0.1:1/none";

import test from "node:test";
import assert from "node:assert/strict";
import core from "../server/routes/core.mjs";

// [method, path] of every route in server/routes/core.mjs that must be Super Admin only.
const SUPER_ADMIN_ONLY = [
  ["post", "/api/universities/import-csv"],
  ["delete", "/api/universities/catalog"],
  ["patch", "/api/universities/:id"],
  ["delete", "/api/universities/:id"],
];

// The role check is the one guard in the stack that answers 403 for a role it does not allow.
function roleOutcome(method, path, role) {
  const layer = core.stack.find((l) => l.route?.path === path && l.route.methods[method]);
  assert.ok(layer, `${method} ${path} not found`);
  const res = { code: null, body: null, status(c) { this.code = c; return this; }, json(b) { this.body = b; return this; } };
  let passed = false;
  for (const { handle } of layer.route.stack.slice(0, -1)) {
    if (handle.length < 3 || handle.name === "session" || handle.name === "branchScope") continue; // those need a database
    handle({ user: { id: "u", role } }, res, () => { passed = true; });
    if (res.code) break;
  }
  return { code: res.code, passed };
}

for (const [method, path] of SUPER_ADMIN_ONLY) {
  const label = `${method.toUpperCase()} ${path}`;
  test(`${label}: Super Admin passes the role check`, () => {
    const r = roleOutcome(method, path, "super_admin");
    assert.deepEqual([r.code, r.passed], [null, true]);
  });
  for (const role of ["admin", "branch_head", "counselor", "telecaller", "accountant", "student"]) {
    test(`${label}: ${role} is refused`, () => {
      const r = roleOutcome(method, path, role);
      assert.equal(r.code, 403);
      assert.equal(r.passed, false);
    });
  }
}
