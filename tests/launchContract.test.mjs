// Launch contract: one test per rule in docs/release/permission-matrix.md (contract v1).
//
// Tests without `todo` describe behaviour that already holds at the release baseline and must never regress.
// Tests marked `todo` describe the agreed launch target that Stream 1 step 4 still has to implement. A todo test
// that fails is reported but does not fail the run; when its change lands, delete the `todo` option so the rule is
// enforced from then on.
//
// Routes are read from the source by the repository's own inventory (scripts/access-route-inventory.mjs), so these
// checks follow the real route guards instead of a hand-kept list. Run from the repository root (npm test does).

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { decideAccountAction } from "../server/lib/accessPolicy.mjs";
import { readRoutes } from "../scripts/access-route-inventory.mjs";

const A = "aaaaaaaa-0000-0000-0000-000000000001";
const B = "bbbbbbbb-0000-0000-0000-000000000002";
const scoped = (...ids) => ({ allBranches: false, branchIds: ids });
const actor = (role, scope, id = "actor") => ({ id, role, scope });
const create = (a, role, branchIds = [A], grants = []) =>
  decideAccountAction({ actor: a, action: "staff.create", requested: { role, branchIds }, grants });

const routes = readRoutes();
const route = (key) => {
  const r = routes.find((x) => x.key === key);
  assert.ok(r, `route not found in source: ${key}`);
  return r;
};
const read = (file) => readFileSync(file, "utf8");
const block = (src, startMarker) => {
  const start = src.indexOf(startMarker);
  assert.ok(start >= 0, `marker not found: ${startMarker}`);
  const next = src.indexOf("\nrouter.", start + startMarker.length);
  return src.slice(start, next < 0 ? src.length : next);
};

// ---- Rule 1: Super Admin creates Admins ------------------------------------------------------------------

test("rule 1: an Admin cannot create Admin, Branch Head or Super Admin accounts", () => {
  const admin = actor("admin", scoped(A));
  for (const role of ["admin", "branch_head", "super_admin"]) {
    const r = create(admin, role);
    assert.equal(r.ok, false, role);
    assert.equal(r.code, "NEEDS_HIGHER_AUTHORITY", role);
  }
});

test("rule 1: a Super Admin can create an Admin", () => {
  assert.equal(create(actor("super_admin", { allBranches: true }), "admin", []).ok, true);
});

// ---- Rule 2: Admin creates ordinary employees inside assigned branches -----------------------------------

test("rule 2: an Admin creates counselors, telecallers and accountants in their own branch only", () => {
  const admin = actor("admin", scoped(A));
  for (const role of ["counselor", "telecaller", "accountant"]) {
    assert.equal(create(admin, role, [A]).ok, true, `${role} in own branch`);
    const outside = create(admin, role, [B]);
    assert.equal(outside.ok, false, `${role} in another branch`);
    assert.equal(outside.code, "OUT_OF_SCOPE", `${role} in another branch`);
  }
});

// ---- Rule 3: Branch Head employee creation disabled ------------------------------------------------------

test("rule 3: a Branch Head cannot create any account without a delegation grant", () => {
  const head = actor("branch_head", scoped(A));
  for (const role of ["counselor", "telecaller", "accountant", "student"]) {
    const r = create(head, role);
    assert.equal(r.ok, false, role);
    assert.equal(r.code, "NEEDS_DELEGATION", role);
  }
});

test("rule 3: a delegation grant never covers privileged roles", () => {
  const head = actor("branch_head", scoped(A));
  const grants = [{ action: "staff.create", roles: ["admin", "branch_head", "super_admin"], branch_ids: [A] }];
  for (const role of ["admin", "branch_head", "super_admin"]) assert.equal(create(head, role, [A], grants).ok, false, role);
});

test("rule 3: POST /api/users never loads delegation grants, so Branch Head creation stays off", () => {
  const handler = block(read("server/routes/core.mjs"), 'router.post("/api/users"');
  assert.match(handler, /decideAccountAction\(/);
  assert.doesNotMatch(handler, /grants/, "POST /api/users must not pass delegation grants in this release");
});

// ---- Rule 4: only a Super Admin changes Admin accounts and branch scope ----------------------------------

test("rule 4: nobody changes their own role or branches; an Admin cannot manage Admin or Branch Head accounts", () => {
  const self = decideAccountAction({
    actor: actor("super_admin", { allBranches: true }), action: "staff.role.change",
    target: { id: "actor", role: "super_admin", branchIds: [] }, requested: { role: "admin" },
  });
  assert.equal(self.code, "SELF_CHANGE");
  for (const role of ["admin", "branch_head"]) {
    const r = decideAccountAction({
      actor: actor("admin", scoped(A)), action: "staff.branches.change",
      target: { id: "t", role, branchIds: [A] }, requested: { branchIds: [A] },
    });
    assert.equal(r.ok, false, role);
    assert.equal(r.code, "NEEDS_HIGHER_AUTHORITY", role);
  }
});

// ---- Rule 5: sign-up paths -------------------------------------------------------------------------------

test("rule 5: public admin sign-up is closed in production unless a code is set or it is opened explicitly", () => {
  const handler = block(read("server/routes/core.mjs"), 'router.post("/api/auth/signup"');
  assert.match(handler, /IS_PRODUCTION && !ADMIN_SIGNUP_OPEN/);
  assert.match(handler, /Admin signup is closed on this server/);
});

test("rule 5: telecaller self sign-up is off unless TELECALLER_SIGNUP_CODE is set", () => {
  const handler = block(read("server/routes/core.mjs"), 'router.post("/api/auth/telecaller-signup"');
  assert.match(handler, /if \(!TELECALLER_SIGNUP_CODE\)/);
  assert.match(handler, /Self signup is switched off/);
});

test("rule 5: only a Super Admin can attach a partner login", () => {
  assert.deepEqual(route("PUT /api/partners/:id/login").who, ["super_admin"]);
});

test("rule 5: no default password when POST /api/users gets none", () => {
  assert.doesNotMatch(read("server/routes/core.mjs"), /changeme123/);
});

test("account creation is all-or-nothing and cannot hang the request", () => {
  const src = read("server/routes/core.mjs");
  const users = block(src, 'router.post("/api/users"');
  assert.match(users, /safely\(async/, "POST /api/users must answer a thrown error with a 500, not hang");
  assert.match(users, /discardAccount\(pool, \{ id \}\)/, "a failed profile or counselor write must remove the new account");
  assert.ok(users.indexOf("discardAccount") < users.indexOf('audit(req, "user.create"'), "audit only after every write succeeded");
  for (const marker of ['router.post("/api/auth/signup"', 'router.post("/api/auth/telecaller-signup"']) {
    assert.match(block(src, marker), /discardAccount\(pool, \{ id \}\)/, `${marker} must remove the account if the profile write fails`);
  }
});

test("rule 5 (target): public counselor sign-up cannot create a new counselor account", { todo: "stream 1 step 4" }, () => {
  const handler = block(read("server/routes/counselor.mjs"), 'router.post("/api/counselor/auth/signup"');
  assert.doesNotMatch(handler, /INSERT INTO counselor_users/);
});

// ---- Rule 6: delete and remove are not for Branch Head, destructive company data is Super Admin only -----

test("rule 6 (target): Branch Head cannot remove or transfer staff", { todo: "stream 1 step 4" }, () => {
  for (const key of [
    "POST /api/telecallers/:id/remove", "POST /api/counselors/:id/remove",
    "POST /api/telecallers/:id/transfer", "POST /api/counselors/:id/transfer",
  ]) assert.ok(!route(key).who.includes("branch_head"), `${key} is still open to Branch Head`);
});

test("rule 6 (target): university delete, catalog clear, edit and CSV import are Super Admin only", { todo: "stream 1 step 4" }, () => {
  for (const key of [
    "DELETE /api/universities/:id", "DELETE /api/universities/catalog",
    "PATCH /api/universities/:id", "POST /api/universities/import-csv",
  ]) assert.deepEqual(route(key).who, ["super_admin"], key);
});

// ---- Rule 7: company-wide configuration -----------------------------------------------------------------

test("rule 7 (target): writes to /api/config/* are Super Admin only", { todo: "stream 1 step 4" }, () => {
  const writes = routes.filter((r) => r.path.startsWith("/api/config/") && r.method !== "GET");
  assert.ok(writes.length >= 11, "expected the config write routes to be found");
  for (const r of writes) assert.deepEqual(r.who, ["super_admin"], r.key);
});

test("rule 7 (target): comms rules, reminders, approve and retire are Super Admin only", { todo: "stream 1 step 4" }, () => {
  for (const key of [
    "POST /api/comms/rules", "PATCH /api/comms/rules/:id", "PUT /api/comms/reminders",
    "POST /api/comms/reminders/run", "POST /api/comms/events/:event",
    "POST /api/comms/templates/:familyId/retire", "POST /api/comms/templates/version/:id/approve",
  ]) assert.deepEqual(route(key).who, ["super_admin"], key);
});

test("rule 7 (target): checklist writes are not open to Branch Head", { todo: "stream 1 step 4" }, () => {
  for (const key of ["POST /api/checklists", "PATCH /api/checklists/:id"]) assert.ok(!route(key).who.includes("branch_head"), key);
});

// ---- Rule 8: HR is out of this release --------------------------------------------------------------------

test("rule 8 (target): HR routes are disabled unless HR_ENABLED=true", { todo: "stream 1 step 4" }, () => {
  const src = read("server/routes/core.mjs") + read("server/routes/counselor.mjs");
  assert.match(src, /HR_ENABLED/);
});

// ---- Guard on the contract itself ------------------------------------------------------------------------

test("the route list is still found in the source (a silent empty list would make every check above meaningless)", () => {
  assert.ok(routes.length > 200, `only ${routes.length} routes found`);
});
