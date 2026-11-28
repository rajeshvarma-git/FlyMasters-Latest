// Who may move a record between branches, and who may take a lead off a colleague.
//
// Both controls were missing from the product entirely until 14 Nov 2026 - the routes existed, no
// screen called them - so these rules have never been exercised by anything but the API. The screens
// added alongside this file hide what a person may not do; the rules below are what actually stops
// them, because a hidden control is not a permission.
//
//   branch assignment     Super Admin only. A branch Admin cannot move a record in or out.
//   telecaller reassign   Super Admin anywhere; a branch Admin only between their own telecallers;
//                         nobody may put a telecaller on a lead from a branch they do not work in.
//
// Opt-in, so a plain `npm test` needs no database:
//   $env:TEST_DATABASE_URL = "postgresql://user:pass@localhost:5432/anydb"     (PowerShell)
//   npm test

import test from "node:test";
import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import pg from "pg";

const URL = process.env.TEST_DATABASE_URL;
const skip = URL ? false : "set TEST_DATABASE_URL to run the PostgreSQL checks";
const schema = `authz_${randomBytes(4).toString("hex")}`;

let pool;
let jsonUpsert;
let core;
let h;
let A;
let B;

if (!skip) {
  const admin = new pg.Pool({ connectionString: URL });
  await admin.query(`CREATE SCHEMA ${schema}`);
  await admin.end();
  process.env.DATABASE_URL = `${URL}${URL.includes("?") ? "&" : "?"}options=-c%20search_path%3D${schema}`;
  process.env.JWT_SECRET = process.env.JWT_SECRET || `authz-test-${randomBytes(8).toString("hex")}`;
  delete process.env.ADMIN_SIGNUP_CODE;
  delete process.env.ADMIN_SIGNUP_OPEN;
  ({ pool, jsonUpsert } = await import("../server/lib/db.mjs"));
  const { migrate } = await import("../server/lib/migrate.mjs");
  await migrate();
  core = (await import("../server/routes/core.mjs")).default;
  A = (await pool.query("INSERT INTO branches (name, code) VALUES ('Hyderabad', 'HYD') RETURNING id")).rows[0].id;
  B = (await pool.query("INSERT INTO branches (name, code) VALUES ('Vizag', 'VIZ') RETURNING id")).rows[0].id;
  h = {
    branch: layerFor("/api/leads/:id/branch", "post"),
    patch: layerFor("/api/leads/:id", "patch"),
    createUser: lastFor("/api/users", "post"),
  };
}

/**
 * The route's stack WITHOUT `session` and `branchScope`.
 *
 * `session` verifies a token, which is not what these tests are about (sessionExpiry.db.test.mjs
 * covers that) and would reject every call with 401. `branchScope` rebuilds req.scope from the
 * database for a real signed-in account; here the scope is the fixture, so rebuilding it would throw
 * the test's own setup away. Everything that decides permission - `requireRole` and the handler's own
 * scope checks - is kept and is what runs below.
 */
function layerFor(path, method) {
  const layer = core.stack.find((l) => l.route?.path === path && l.route.methods[method]);
  assert.ok(layer, `route not found: ${method.toUpperCase()} ${path}`);
  const named = new Set(["session", "branchScope"]);
  return layer.route.stack.map((s) => s.handle).filter((fn) => !named.has(fn.name));
}
function lastFor(path, method) {
  return layerFor(path, method).at(-1);
}

test.after(async () => {
  if (skip) return;
  await pool.end();
  const admin = new pg.Pool({ connectionString: URL });
  await admin.query(`DROP SCHEMA ${schema} CASCADE`);
  await admin.end();
});

const SUPER = { id: "boss", role: "super_admin", email: "boss@x.test", scope: { allBranches: true, branchIds: [] } };
const adminOf = (...ids) => ({ id: `admin-${ids.join("-")}`, role: "admin", email: "admin@x.test", scope: { allBranches: false, branchIds: ids.map(String) } });
const telecallerActor = { id: "tc", role: "telecaller", email: "tc@x.test", scope: { allBranches: false, branchIds: [] } };

/**
 * Walks the real middleware chain, stopping where a guard stops it. `session` is replaced because
 * these tests are about ROLE and SCOPE, not about tokens, which sessionExpiry.db.test.mjs covers.
 */
async function call(handlers, { body = {}, params = {}, actor }) {
  const res = {
    code: 200, body: null, headersSent: false,
    status(c) { this.code = c; return this; },
    json(b) { this.body = b; this.headersSent = true; return this; },
  };
  const req = { body, params, query: {}, headers: {}, ip: `a-${Math.random()}`, user: { id: actor.id, role: actor.role, email: actor.email }, scope: actor.scope };
  for (const handle of handlers) {
    if (res.headersSent) break;
    let goOn = false;
    await new Promise((resolve, reject) => {
      const next = (err) => { if (err) return reject(err); goOn = true; resolve(); };
      Promise.resolve(handle(req, res, next)).then(() => { if (!goOn) resolve(); }, reject);
    });
    if (!goOn) break;
  }
  return res;
}

let seq = 0;
async function staff(role, branchId) {
  seq += 1;
  const email = `authz.${role}.${seq}@x.test`;
  const made = await call([h.createUser], {
    actor: SUPER,
    body: { email, password: "authz-test-pass", firstName: "A", lastName: `${role}${seq}`, role, branchId },
  });
  assert.equal(made.code, 200, JSON.stringify(made.body));
  return made.body.id;
}

async function lead({ branchId = A, telecallerId = null } = {}) {
  const id = randomUUID();
  await jsonUpsert("student_leads", {
    id, first_name: "QA", last_name: "Authz", email: `authz.${id.slice(0, 8)}@x.test`,
    phone: "9000000000", branch_id: branchId, entity_type: "lead", lead_status: "warm",
    assigned_telecaller_id: telecallerId, created_at: new Date().toISOString(),
  }, { branchId: branchId || null });
  // A portal signup genuinely has no branch on either side of the row, so make the fixture match.
  if (!branchId) {
    await pool.query("UPDATE app_records SET branch_id = NULL WHERE table_name = 'student_leads' AND id::text = $1", [id]);
  }
  return id;
}

const branchOf = async (id) => (await pool.query(
  "SELECT branch_id::text AS branch FROM app_records WHERE table_name = 'student_leads' AND id::text = $1", [id],
)).rows[0]?.branch || null;
const telecallerOf = async (id) => (await pool.query(
  "SELECT data->>'assigned_telecaller_id' AS tc FROM app_records WHERE table_name = 'student_leads' AND id::text = $1", [id],
)).rows[0]?.tc || null;
const auditRows = async (action, entityId) => (await pool.query(
  "SELECT * FROM audit_log WHERE action = $1 AND entity_id = $2 ORDER BY created_at DESC", [action, String(entityId)],
).catch(() => ({ rows: [] }))).rows;
const detailsOf = (entry) => (typeof entry.detail === "string" ? JSON.parse(entry.detail) : entry.detail);

// ---- branch assignment: Super Admin only -------------------------------------------------------

test("a Super Admin places a branch-less signup, and the move is audited with both ends", { skip }, async () => {
  const id = await lead({ branchId: null });
  assert.equal(await branchOf(id), null, "the fixture already has a branch");

  const r = await call(h.branch, { actor: SUPER, params: { id }, body: { branchId: A } });

  assert.equal(r.code, 200, JSON.stringify(r.body));
  assert.equal(await branchOf(id), String(A));
  const [entry] = await auditRows("lead.branch", id);
  assert.ok(entry, "moving a record between branches was not audited");
  const details = detailsOf(entry);
  assert.equal(details.to, String(A));
  assert.equal(details.from, null, "the trail does not record where it came from");
  assert.equal(details.wasUnplaced, true);
});

test("a Super Admin moves a record from one branch to another", { skip }, async () => {
  const id = await lead({ branchId: A });
  const r = await call(h.branch, { actor: SUPER, params: { id }, body: { branchId: B } });
  assert.equal(r.code, 200, JSON.stringify(r.body));
  assert.equal(await branchOf(id), String(B));
  const details = detailsOf((await auditRows("lead.branch", id))[0]);
  assert.equal(details.from, String(A));
  assert.equal(details.to, String(B));
});

test("a branch Admin cannot move a record, not even inside their own branch", { skip }, async () => {
  const id = await lead({ branchId: A });
  const r = await call(h.branch, { actor: adminOf(A), params: { id }, body: { branchId: A } });
  assert.equal(r.code, 403, `a branch Admin was allowed to set a branch: ${r.code} ${JSON.stringify(r.body)}`);
  assert.equal(await branchOf(id), String(A), "the record moved anyway");
});

test("a branch Admin cannot pull a record out of another branch into their own", { skip }, async () => {
  const id = await lead({ branchId: B });
  const r = await call(h.branch, { actor: adminOf(A), params: { id }, body: { branchId: A } });
  assert.equal(r.code, 403);
  assert.equal(await branchOf(id), String(B), "a branch Admin helped themselves to another branch's record");
  assert.equal((await auditRows("lead.branch", id)).length, 0, "a refused move still wrote an audit entry");
});

test("a telecaller cannot move a record at all", { skip }, async () => {
  const id = await lead({ branchId: A });
  const r = await call(h.branch, { actor: telecallerActor, params: { id }, body: { branchId: B } });
  assert.equal(r.code, 403);
  assert.equal(await branchOf(id), String(A));
});

test("an unknown branch is refused before anything is written", { skip }, async () => {
  const id = await lead({ branchId: A });
  const r = await call(h.branch, { actor: SUPER, params: { id }, body: { branchId: randomUUID() } });
  assert.equal(r.code, 400);
  assert.equal(await branchOf(id), String(A));
});

// ---- telecaller reassignment -------------------------------------------------------------------

test("a branch Admin reassigns between two telecallers in their own branch, and it is audited", { skip }, async () => {
  const first = await staff("telecaller", A);
  const second = await staff("telecaller", A);
  const id = await lead({ branchId: A, telecallerId: first });

  const r = await call(h.patch, { actor: adminOf(A), params: { id }, body: { assigned_telecaller_id: second } });

  assert.equal(r.code, 200, JSON.stringify(r.body));
  assert.equal(await telecallerOf(id), String(second));
  const [entry] = await auditRows("lead.telecaller", id);
  assert.ok(entry, "taking a lead off one colleague and giving it to another was not audited");
  const details = detailsOf(entry);
  assert.equal(String(details.from), String(first));
  assert.equal(String(details.to), String(second));
});

test("a branch Admin cannot hand a lead to a telecaller in another branch", { skip }, async () => {
  const outsider = await staff("telecaller", B);
  const mine = await staff("telecaller", A);
  const id = await lead({ branchId: A, telecallerId: mine });

  const r = await call(h.patch, { actor: adminOf(A), params: { id }, body: { assigned_telecaller_id: outsider } });

  assert.equal(r.code, 403, `cross-branch reassignment was allowed: ${r.code} ${JSON.stringify(r.body)}`);
  assert.equal(await telecallerOf(id), String(mine), "the lead moved to someone outside the branch");
});

test("a branch Admin cannot touch a lead that is not in their branch", { skip }, async () => {
  const theirs = await staff("telecaller", B);
  const id = await lead({ branchId: B, telecallerId: null });
  const r = await call(h.patch, { actor: adminOf(A), params: { id }, body: { assigned_telecaller_id: theirs } });
  assert.equal(r.code, 403);
  assert.equal(await telecallerOf(id), null);
});

test("a Super Admin can put a telecaller from another branch on a lead, and the lead follows them there", { skip }, async () => {
  // The Super Admin is the owner and is not limited by branch (client rule, 26 Nov 2026). The lead moves into
  // the telecaller's branch so it does not vanish from every queue.
  const outsider = await staff("telecaller", B);
  const id = await lead({ branchId: A });

  const r = await call(h.patch, { actor: SUPER, params: { id }, body: { assigned_telecaller_id: outsider } });

  assert.equal(r.code, 200, JSON.stringify(r.body));
  assert.equal(await telecallerOf(id), String(outsider));
});

test("a Super Admin reassigns freely within the lead's own branch", { skip }, async () => {
  const first = await staff("telecaller", A);
  const second = await staff("telecaller", A);
  const id = await lead({ branchId: A, telecallerId: first });
  const r = await call(h.patch, { actor: SUPER, params: { id }, body: { assigned_telecaller_id: second } });
  assert.equal(r.code, 200, JSON.stringify(r.body));
  assert.equal(await telecallerOf(id), String(second));
});

test("a telecaller cannot reassign a lead, including one of their own", { skip }, async () => {
  const mine = await staff("telecaller", A);
  const other = await staff("telecaller", A);
  const id = await lead({ branchId: A, telecallerId: mine });
  const r = await call(h.patch, { actor: { ...telecallerActor, id: mine }, params: { id }, body: { assigned_telecaller_id: other } });
  assert.equal(r.code, 403, `a telecaller reassigned a lead: ${r.code} ${JSON.stringify(r.body)}`);
  assert.equal(await telecallerOf(id), String(mine));
});

test("unassigning is allowed and audited, and a no-op writes no entry", { skip }, async () => {
  const mine = await staff("telecaller", A);
  const id = await lead({ branchId: A, telecallerId: mine });

  const same = await call(h.patch, { actor: adminOf(A), params: { id }, body: { assigned_telecaller_id: mine } });
  assert.equal(same.code, 200);
  assert.equal((await auditRows("lead.telecaller", id)).length, 0, "reassigning to the same person wrote an audit entry");

  const cleared = await call(h.patch, { actor: adminOf(A), params: { id }, body: { assigned_telecaller_id: "" } });
  assert.equal(cleared.code, 200, JSON.stringify(cleared.body));
  assert.equal(await telecallerOf(id), null);
  const [entry] = await auditRows("lead.telecaller", id);
  assert.ok(entry, "unassigning was not audited");
});

test("nobody, not even the Super Admin, can give a lead to someone whose access is suspended", { skip }, async () => {
  const active = await staff("telecaller", A);
  const suspended = await staff("telecaller", A);
  await pool.query("UPDATE user_roles SET is_active = false WHERE user_id = $1", [String(suspended)]);
  const id = await lead({ branchId: A, telecallerId: active });

  const r = await call(h.patch, { actor: SUPER, params: { id }, body: { assigned_telecaller_id: suspended } });
  assert.equal(r.code, 409, JSON.stringify(r.body));
  assert.equal(r.body.code, "ASSIGNEE_SUSPENDED");
  assert.equal(await telecallerOf(id), String(active), "the lead moved to a suspended person");
});

test("a lead already held by a suspended person can still be saved, and moved away from them", { skip }, async () => {
  const suspended = await staff("telecaller", A);
  const other = await staff("telecaller", A);
  const id = await lead({ branchId: A, telecallerId: suspended });
  await pool.query("UPDATE user_roles SET is_active = false WHERE user_id = $1", [String(suspended)]);

  const same = await call(h.patch, { actor: SUPER, params: { id }, body: { assigned_telecaller_id: suspended, priority: "high" } });
  assert.equal(same.code, 200, JSON.stringify(same.body));
  const away = await call(h.patch, { actor: SUPER, params: { id }, body: { assigned_telecaller_id: other } });
  assert.equal(away.code, 200, JSON.stringify(away.body));
  assert.equal(await telecallerOf(id), String(other));
});
