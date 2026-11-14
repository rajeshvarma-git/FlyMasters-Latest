// Assigning students to a counselor in bulk: what it does, and what it says when it does nothing.
//
// Found by Journey 5.2 of the release walkthrough. POST /api/leads/bulk-assign answered
// 200 {"ok":true,"count":0} when every record in the batch was skipped - an unconverted lead was
// dropped by a bare `continue` - so the caller was told the assignment had happened when it had not,
// and nothing mentioned that conversion is what was missing. A screen built on that answer would show
// a success message and no change.
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
const schema = `bulk_${randomBytes(4).toString("hex")}`;

let pool;
let h;
let jsonUpsert;
let B1;
let B2;

if (!skip) {
  const admin = new pg.Pool({ connectionString: URL });
  await admin.query(`CREATE SCHEMA ${schema}`);
  await admin.end();
  process.env.DATABASE_URL = `${URL}${URL.includes("?") ? "&" : "?"}options=-c%20search_path%3D${schema}`;
  process.env.JWT_SECRET = process.env.JWT_SECRET || `bulk-test-${randomBytes(8).toString("hex")}`;
  delete process.env.ADMIN_SIGNUP_CODE;
  delete process.env.ADMIN_SIGNUP_OPEN;
  ({ pool, jsonUpsert } = await import("../server/lib/db.mjs"));
  const { migrate } = await import("../server/lib/migrate.mjs");
  await migrate();
  const core = (await import("../server/routes/core.mjs")).default;
  const last = (path, method) => {
    const layer = core.stack.find((l) => l.route?.path === path && l.route.methods[method]);
    assert.ok(layer, `route not found: ${method.toUpperCase()} ${path}`);
    return layer.route.stack.at(-1).handle;
  };
  h = {
    createUser: last("/api/users", "post"),
    bulkAssign: last("/api/leads/bulk-assign", "post"),
  };
  B1 = (await pool.query("INSERT INTO branches (name, code) VALUES ('Hyderabad', 'HYD') RETURNING id")).rows[0].id;
  B2 = (await pool.query("INSERT INTO branches (name, code) VALUES ('Vizag', 'VIZ') RETURNING id")).rows[0].id;
}

test.after(async () => {
  if (skip) return;
  await pool.end();
  const admin = new pg.Pool({ connectionString: URL });
  await admin.query(`DROP SCHEMA ${schema} CASCADE`);
  await admin.end();
});

const SUPER = { id: "boss", role: "super_admin", email: "boss@x.test", scope: { allBranches: true, branchIds: [] } };

async function run(handler, { body = {}, params = {}, actor = SUPER } = {}) {
  const res = { code: 200, body: null, status(c) { this.code = c; return this; }, json(b) { this.body = b; return this; } };
  const req = { body, params, query: {}, headers: {}, ip: `b-${Math.random()}`, user: { id: actor.id, role: actor.role, email: actor.email }, scope: actor.scope };
  await handler(req, res);
  return res;
}

let seq = 0;
async function counselor(branchId = B1) {
  seq += 1;
  const email = `bulk.counselor.${seq}@x.test`;
  const made = await run(h.createUser, {
    body: { email, password: "bulk-test-pass", firstName: "Cee", lastName: `Counselor${seq}`, role: "counselor", branchId },
  });
  assert.equal(made.code, 200, JSON.stringify(made.body));
  return made.body.id;
}

async function lead({ converted, branchId = B1 }) {
  const id = randomUUID();
  await jsonUpsert("student_leads", {
    id,
    first_name: "QA",
    last_name: converted ? "Converted" : "Unconverted",
    email: `bulk.${id.slice(0, 8)}@x.test`,
    phone: "9000000000",
    branch_id: branchId,
    entity_type: converted ? "student" : "lead",
    lead_status: converted ? "converted" : "warm",
    created_at: new Date().toISOString(),
  }, { branchId });
  return id;
}

const assignedTo = async (id) => (await pool.query(
  "SELECT data->>'assigned_counselor_id' AS counselor FROM app_records WHERE table_name = 'student_leads' AND id::text = $1", [id],
)).rows[0]?.counselor || null;

// ---- the defect ---------------------------------------------------------------------------------

test("an unconverted lead is refused, and the reason names conversion", { skip }, async () => {
  const target = await counselor();
  const id = await lead({ converted: false });

  const r = await run(h.bulkAssign, { body: { ids: [id], counselorId: target } });

  assert.notEqual(r.code, 200, "assigning nobody answered 200: a caller cannot tell this apart from success");
  assert.equal(r.code, 409);
  assert.equal(r.body.ok, false, "it still reports ok while having assigned nobody");
  assert.equal(r.body.count, 0);
  assert.match(String(r.body.error), /convert/i, `the reason does not mention conversion: "${r.body.error}"`);
  assert.equal(r.body.skipped?.[0]?.reason, "not_converted");
  assert.equal(await assignedTo(id), null, "an unconverted lead was assigned anyway");
});

test("a converted student is assigned, and the answer says so", { skip }, async () => {
  const target = await counselor();
  const id = await lead({ converted: true });

  const r = await run(h.bulkAssign, { body: { ids: [id], counselorId: target } });

  assert.equal(r.code, 200, JSON.stringify(r.body));
  assert.equal(r.body.ok, true);
  assert.equal(r.body.count, 1);
  assert.equal(String(await assignedTo(id)), String(target));
});

test("a mixed batch assigns what it can and names what it skipped", { skip }, async () => {
  const target = await counselor();
  const good = await lead({ converted: true });
  const bad = await lead({ converted: false });

  const r = await run(h.bulkAssign, { body: { ids: [good, bad], counselorId: target } });

  assert.equal(r.code, 200, "a batch that did some work should not fail outright");
  assert.equal(r.body.count, 1);
  assert.equal(r.body.skipped.length, 1, "the skipped record is not reported, so it is silently lost");
  assert.equal(r.body.skipped[0].id, bad);
  assert.match(String(r.body.skipped[0].message), /convert/i);
  assert.equal(String(await assignedTo(good)), String(target));
  assert.equal(await assignedTo(bad), null);
});

test("a record that no longer exists is reported, not ignored", { skip }, async () => {
  const target = await counselor();
  const r = await run(h.bulkAssign, { body: { ids: [randomUUID()], counselorId: target } });
  assert.equal(r.code, 409);
  assert.equal(r.body.skipped[0].reason, "no_such_lead");
});

test("a counselor from another branch is refused with that as the reason", { skip }, async () => {
  const target = await counselor(B2);          // counselor works in Vizag
  const id = await lead({ converted: true, branchId: B1 });  // student is in Hyderabad

  const r = await run(h.bulkAssign, { body: { ids: [id], counselorId: target } });

  assert.equal(r.code, 409, "a cross-branch assignment reported success");
  assert.equal(r.body.skipped[0].reason, "counselor_other_branch");
  assert.match(String(r.body.error), /branch/i);
  assert.equal(await assignedTo(id), null);
});

test("the empty and missing cases still answer 400, not 409", { skip }, async () => {
  const target = await counselor();
  assert.equal((await run(h.bulkAssign, { body: { ids: [], counselorId: target } })).code, 400);
  assert.equal((await run(h.bulkAssign, { body: { ids: [randomUUID()] } })).code, 400);
});
