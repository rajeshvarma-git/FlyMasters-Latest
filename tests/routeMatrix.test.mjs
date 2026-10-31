// ACCESS-03A completion gate: every route has a reviewed action and target-scope rule, and the
// recorded verdicts match what the code actually does.
import test from "node:test";
import assert from "node:assert/strict";
import { readRoutes, callEnd } from "../scripts/access-route-inventory.mjs";
import { classifyAll, SCOPES, VERDICTS } from "../server/lib/routeAccessMatrix.mjs";
import { ACTIONS } from "../server/lib/accessPolicy.mjs";

const routes = readRoutes();
const matrix = classifyAll(routes);
const byKey = new Map(matrix.map((m) => [m.key, m]));

test("the inventory finds the routes (guards against the parser silently finding none)", () => {
  assert.ok(routes.length > 200, `found ${routes.length}`);
  assert.ok(routes.some((r) => r.path === "/__local_db"), "the student app's data API is included");
  assert.ok(routes.some((r) => r.path.startsWith("/api/document-setup")), "array-path routes are included");
  assert.equal(new Set(routes.map((r) => `${r.file} ${r.key}`)).size, routes.length, "no duplicate route in one file");
});

test("every route has an action, a known scope, a known verdict and a note", () => {
  for (const m of matrix) {
    assert.match(m.action, /^[a-z-]+(\.[a-z-]+)+$/, m.key);
    assert.ok(SCOPES.includes(m.scope), `${m.key}: scope ${m.scope}`);
    assert.ok(VERDICTS.includes(m.verdict), `${m.key}: verdict ${m.verdict}`);
    assert.ok(m.note && m.note.length > 8, `${m.key}: note`);
    assert.ok(Array.isArray(m.who) && m.who.length, `${m.key}: who`);
  }
});

test("no route is left unclassified", () => {
  const open = matrix.filter((m) => m.verdict === "needs-review").map((m) => m.key);
  assert.deepEqual(open, [], "review these routes and classify them in server/lib/routeAccessMatrix.mjs");
});

test("every account-management action named by the policy is a real action, and routes use them", () => {
  const used = matrix.map((m) => m.action).filter((a) => a.startsWith("staff.create") || ACTIONS.includes(a));
  for (const a of ACTIONS) assert.ok(used.includes(a), `no route is mapped to ${a}`);
});

test("'enforced' is only claimed where the code applies scope (or the account policy / Super Admin guard does)", () => {
  const policyKeys = new Set(["PUT /api/users/:id/role", "PUT /api/users/:id/password", "PUT /api/users/:id/branches", "POST /api/users"]);
  for (const m of matrix.filter((x) => x.verdict === "enforced")) {
    const r = routes.find((x) => x.key === m.key);
    const ok = r.scoped || policyKeys.has(m.key) || m.scope === "super-only" || m.scope === "viewer-policy";
    assert.ok(ok, `${m.key} is marked enforced but no scope check was found in its handler`);
  }
});

test("'gap' routes really lack a check: when one is fixed this test fails until the matrix is updated", () => {
  for (const m of matrix.filter((x) => x.verdict === "gap")) {
    const r = routes.find((x) => x.key === m.key);
    assert.equal(r.scoped, false, `${m.key} now applies scope: change its verdict to 'enforced' in routeAccessMatrix.mjs`);
  }
});

test("each gap names the problem so it can be fixed, and the count is the known backlog", () => {
  const gaps = matrix.filter((m) => m.verdict === "gap");
  assert.ok(gaps.every((g) => g.note.length > 15));
  assert.equal(gaps.length, 22, "the 03B follow-up backlog changed: update this number together with the matrix");
});

test("Super Admin-only routes are limited to Super Admin by their guard", () => {
  for (const m of matrix.filter((x) => x.scope === "super-only")) assert.deepEqual(m.who, ["super_admin"], m.key);
});

test("routes reachable without sign-in are exactly the known public ones", () => {
  const open = matrix.filter((m) => m.who.length === 1 && m.who[0] === "public").map((m) => m.key).sort();
  assert.deepEqual(open, [
    "GET /__auth", "GET /__public_media", "GET /api/health", "GET /api/health", "GET /api/referral/:code",
    "POST /__auth", "POST /api/auth/signin", "POST /api/auth/signup", "POST /api/auth/telecaller-signup",
    "POST /api/counselor/auth/send-verification-code", "POST /api/counselor/auth/signup",
  ].sort());
});

// ---------- regression: a neighbouring helper must never decide a route's classification ----------

test("callEnd stops at the route's own closing parenthesis, through strings, comments and templates", () => {
  const src = 'router.post("/a)", auth, async (req, res) => {\n  // ) not a close\n  const q = `x ${fn(1, "(")} )`;\n  res.json({ s: "}" });\n});\nfunction helper(req) { return req.scope; }\n';
  const end = callEnd(src, 0);
  assert.equal(src.slice(end), ";\nfunction helper(req) { return req.scope; }\n");
});

test("POST /api/salary has no branch check, and a scope-aware helper defined right after it does not change that", () => {
  const salary = routes.find((r) => r.key === "POST /api/salary");
  assert.equal(salary.scoped, false, "the helper below the route was counted as part of it");
  assert.equal(byKey.get("POST /api/salary").verdict, "gap");
  assert.equal(byKey.get("POST /api/leads/bulk-assign-telecaller").verdict, "enforced", "scoped in the first 03B follow-up batch");
});
