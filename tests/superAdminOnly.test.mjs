// Launch contract rules 6 and 7: company-wide data is changed by Super Admin only.
// The real route guards run here: the role check in front of each handler.

process.env.DATABASE_URL = process.env.DATABASE_URL || "postgresql://nobody:nothing@127.0.0.1:1/none";

import test from "node:test";
import assert from "node:assert/strict";
import core from "../server/routes/core.mjs";
import config from "../server/routes/config.mjs";
import comms from "../server/routes/comms.mjs";

// [router, method, path] of every route that must be Super Admin only.
const SUPER_ADMIN_ONLY = [
  [core, "post", "/api/universities/import-csv"],
  [core, "delete", "/api/universities/catalog"],
  [core, "patch", "/api/universities/:id"],
  [core, "delete", "/api/universities/:id"],
  [config, "post", "/api/config/documents"],
  [config, "patch", "/api/config/documents/:id"],
  [config, "post", "/api/config/reasons"],
  [config, "patch", "/api/config/reasons/:id"],
  [config, "post", "/api/config/statuses"],
  [config, "patch", "/api/config/statuses/:id"],
  [config, "post", "/api/config/checklists"],
  [config, "put", "/api/config/checklists/version/:id/items"],
  [config, "post", "/api/config/checklists/version/:id/publish"],
  [config, "post", "/api/config/checklists/:familyId/revise"],
  [config, "post", "/api/config/checklists/:familyId/retire"],
  [comms, "post", "/api/comms/templates/version/:id/approve"],
  [comms, "post", "/api/comms/templates/:familyId/retire"],
  [comms, "put", "/api/comms/reminders"],
  [comms, "post", "/api/comms/reminders/run"],
  [comms, "post", "/api/comms/rules"],
  [comms, "patch", "/api/comms/rules/:id"],
  [comms, "post", "/api/comms/events/:event"],
];

// The role check is the one guard in the stack that answers 403 for a role it does not allow.
function roleOutcome(router, method, path, role) {
  const layer = router.stack.find((l) => l.route?.path === path && l.route.methods[method]);
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

for (const [router, method, path] of SUPER_ADMIN_ONLY) {
  const label = `${method.toUpperCase()} ${path}`;
  test(`${label}: Super Admin passes the role check`, () => {
    const r = roleOutcome(router, method, path, "super_admin");
    assert.deepEqual([r.code, r.passed], [null, true]);
  });
  for (const role of ["admin", "branch_head", "counselor", "telecaller", "accountant", "student"]) {
    test(`${label}: ${role} is refused`, () => {
      const r = roleOutcome(router, method, path, role);
      assert.equal(r.code, 403);
      assert.equal(r.passed, false);
    });
  }
}
