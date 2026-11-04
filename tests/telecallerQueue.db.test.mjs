// The telecaller queue (GET /api/telecaller/state) against a real PostgreSQL: a lead is in a telecaller's
// queue only when it is assigned to them AND it is in a branch they currently belong to.
// A stale or wrong assignment must not expose a lead from another branch.
//
// Opt-in, so a plain `npm test` needs no database:
//   $env:TEST_DATABASE_URL = "postgresql://user:pass@localhost:5432/anydb"     (PowerShell)
//   npm test

import test from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import pg from "pg";

const URL = process.env.TEST_DATABASE_URL;
const skip = URL ? false : "set TEST_DATABASE_URL to run the PostgreSQL checks";
const schema = `ttq_${randomBytes(4).toString("hex")}`;

let pool;
let handlers;
let B1;
let B2;
let T1; // telecaller in B1
let T2; // another telecaller in B1

if (!skip) {
  const admin = new pg.Pool({ connectionString: URL });
  await admin.query(`CREATE SCHEMA ${schema}`);
  await admin.end();
  process.env.DATABASE_URL = `${URL}${URL.includes("?") ? "&" : "?"}options=-c%20search_path%3D${schema}`;
  delete process.env.ADMIN_SIGNUP_CODE;
  delete process.env.ADMIN_SIGNUP_OPEN;
  ({ pool } = await import("../server/lib/db.mjs"));
  const { migrate } = await import("../server/lib/migrate.mjs");
  await migrate();
  const core = (await import("../server/routes/core.mjs")).default;
  const finalHandler = (path, method) => core.stack.find((l) => l.route?.path === path && l.route.methods[method]).route.stack.at(-1).handle;
  handlers = { createUser: finalHandler("/api/users", "post"), queue: finalHandler("/api/telecaller/state", "get") };
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

async function run(handler, { body = {}, actor }) {
  const res = { code: 200, body: null, status(c) { this.code = c; return this; }, json(b) { this.body = b; return this; } };
  const req = { body, headers: {}, ip: `t-${Math.random()}`, params: {}, query: {}, user: { id: actor.id, role: actor.role, email: actor.email }, scope: actor.scope };
  await handler(req, res);
  return res;
}

async function makeTelecaller(email, branchId) {
  const r = await run(handlers.createUser, { actor: SUPER, body: { email, password: "secret12", firstName: "Tele", lastName: email.split("@")[0], role: "telecaller", branchId } });
  assert.equal(r.code, 200, JSON.stringify(r.body));
  return r.body.id;
}

let seq = 0;
// A lead stored the way the app stores it: JSON in app_records, with the branch in the SQL column.
async function addLead({ branchId, telecallerId, status = "new" }) {
  const id = `lead-${++seq}`;
  const data = { id, first_name: "Lead", last_name: String(seq), email: `lead${seq}@x.test`, phone: `90000000${seq}`, entity_type: "lead", lead_status: status, assigned_telecaller_id: telecallerId, branch_id: branchId };
  await pool.query("INSERT INTO app_records (id, table_name, data, branch_id) VALUES ($1, 'student_leads', $2::jsonb, $3)", [id, JSON.stringify(data), branchId]);
  return id;
}
const reassign = (leadId, telecallerId) =>
  pool.query("UPDATE app_records SET data = jsonb_set(data, '{assigned_telecaller_id}', to_jsonb($2::text)) WHERE id = $1", [leadId, telecallerId]);

const scopeOf = (...branchIds) => ({ allBranches: false, branchIds });
const queueFor = async (id, scope) => {
  const res = await run(handlers.queue, { actor: { id, role: "telecaller", email: `${id}@x.test`, scope } });
  assert.equal(res.code, 200, JSON.stringify(res.body));
  return res.body.leads.map((lead) => String(lead.id)).sort();
};

test.before(async () => {
  if (skip) return;
  T1 = await makeTelecaller("tq.one@x.test", B1);
  T2 = await makeTelecaller("tq.two@x.test", B1);
});

test("a lead assigned to the telecaller in their own branch is in their queue", { skip }, async () => {
  const mine = await addLead({ branchId: B1, telecallerId: T1 });
  assert.ok((await queueFor(T1, scopeOf(B1))).includes(mine));
});

test("a stale assignment: a lead in another branch assigned to this telecaller is NOT in their queue", { skip }, async () => {
  const stale = await addLead({ branchId: B2, telecallerId: T1 });
  assert.ok(!(await queueFor(T1, scopeOf(B1))).includes(stale), "a lead from Branch 2 leaked into a Branch 1 telecaller's queue");
});

test("a lead with no branch is not in a branch-scoped queue, even when assigned to the telecaller", { skip }, async () => {
  const unbranched = await addLead({ branchId: null, telecallerId: T1 });
  assert.ok(!(await queueFor(T1, scopeOf(B1))).includes(unbranched));
});

test("a lead in the telecaller's branch that is assigned to someone else is not in their queue", { skip }, async () => {
  const theirs = await addLead({ branchId: B1, telecallerId: T2 });
  assert.ok(!(await queueFor(T1, scopeOf(B1))).includes(theirs));
  assert.ok((await queueFor(T2, scopeOf(B1))).includes(theirs));
});

test("reassignment: the lead leaves the first telecaller's queue and appears in the new one's", { skip }, async () => {
  const lead = await addLead({ branchId: B1, telecallerId: T1 });
  assert.ok((await queueFor(T1, scopeOf(B1))).includes(lead));
  await reassign(lead, T2);
  assert.ok(!(await queueFor(T1, scopeOf(B1))).includes(lead), "still in the old telecaller's queue");
  assert.ok((await queueFor(T2, scopeOf(B1))).includes(lead), "not in the new telecaller's queue");
});

test("moving the telecaller to another branch: leads in the old branch drop out, leads in the new branch come in", { skip }, async () => {
  const inB1 = await addLead({ branchId: B1, telecallerId: T1 });
  const inB2 = await addLead({ branchId: B2, telecallerId: T1 });
  const before = await queueFor(T1, scopeOf(B1));
  assert.ok(before.includes(inB1) && !before.includes(inB2));
  const after = await queueFor(T1, scopeOf(B2));
  assert.ok(after.includes(inB2) && !after.includes(inB1));
  const both = await queueFor(T1, scopeOf(B1, B2));
  assert.ok(both.includes(inB1) && both.includes(inB2));
});

test("a telecaller with no branch at all sees an empty queue", { skip }, async () => {
  await addLead({ branchId: B1, telecallerId: T1 });
  assert.deepEqual(await queueFor(T1, scopeOf()), []);
});

test("an all-branches account working leads sees every lead assigned to them", { skip }, async () => {
  const a = await addLead({ branchId: B1, telecallerId: T1 });
  const b = await addLead({ branchId: B2, telecallerId: T1 });
  const c = await addLead({ branchId: null, telecallerId: T1 });
  const queue = await queueFor(T1, { allBranches: true, branchIds: [] });
  for (const id of [a, b, c]) assert.ok(queue.includes(id), `${id} missing`);
});
