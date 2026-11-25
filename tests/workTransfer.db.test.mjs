// Transfer work between colleagues in one branch, against a real PostgreSQL.
//
//   $env:TEST_DATABASE_URL = "postgresql://user:pass@localhost:5432/anydb"   (PowerShell)
//   npm test

import test from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import pg from "pg";

const URL = process.env.TEST_DATABASE_URL;
const skip = URL ? false : "set TEST_DATABASE_URL to run the PostgreSQL checks";
const schema = `xfer_${randomBytes(4).toString("hex")}`;

let pool;
let h;
let db;
let B1;
let B2;

if (!skip) {
  const admin = new pg.Pool({ connectionString: URL });
  await admin.query(`CREATE SCHEMA ${schema}`);
  await admin.end();
  process.env.DATABASE_URL = `${URL}${URL.includes("?") ? "&" : "?"}options=-c%20search_path%3D${schema}`;
  process.env.JWT_SECRET = process.env.JWT_SECRET || `xfer-test-${randomBytes(8).toString("hex")}`;
  delete process.env.ADMIN_SIGNUP_CODE;
  delete process.env.ADMIN_SIGNUP_OPEN;
  db = await import("../server/lib/db.mjs");
  ({ pool } = db);
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
    transfer: last("/api/transfer-work/:id", "post"),
    items: last("/api/transfer-work/:id/items", "get"),
    people: last("/api/transfer-work/people", "get"),
    receivers: last("/api/transfer-work/:id/receivers", "get"),
    suspend: last("/api/users/:id/suspend", "post"),
    oldTelecallerTransfer: last("/api/telecallers/:id/transfer", "post"),
  };
  B1 = (await pool.query("INSERT INTO branches (name, code) VALUES ('Ameerpet', 'AMP') RETURNING id")).rows[0].id;
  B2 = (await pool.query("INSERT INTO branches (name, code) VALUES ('Kompally', 'KMP') RETURNING id")).rows[0].id;
}

test.after(async () => {
  if (skip) return;
  await pool.end();
  const admin = new pg.Pool({ connectionString: URL });
  await admin.query(`DROP SCHEMA ${schema} CASCADE`);
  await admin.end();
});

const SUPER = { id: "boss", role: "super_admin", email: "boss@x.test", scope: { allBranches: true, branchIds: [] } };
const branchAdmin = () => ({ id: "adm-1", role: "admin", email: "adm@x.test", scope: { allBranches: false, branchIds: [String(B1)] } });

async function run(handler, { body = {}, params = {}, query = {}, actor }) {
  const res = {
    code: 200, body: null,
    status(c) { this.code = c; return this; },
    json(b) { this.body = b; return this; },
    set() { return this; },
  };
  const req = {
    body, headers: {}, ip: `x-${Math.random()}`, params, query,
    user: { id: actor.id, role: actor.role, email: actor.email }, scope: actor.scope,
  };
  await handler(req, res);
  return res;
}

let seq = 0;
async function makeStaff(role, branchId) {
  const email = `xfer${++seq}.${role}@x.test`;
  const r = await run(h.createUser, {
    actor: SUPER,
    body: { email, password: "xfer-test-pass", firstName: "X", lastName: `${role}${seq}`, role, branchId },
  });
  assert.equal(r.code, 200, JSON.stringify(r.body));
  return { id: String(r.body.id), counselorId: r.body.counselorId ? String(r.body.counselorId) : null, email };
}

async function lead(id, fields) {
  await db.jsonUpsert("student_leads", { id, first_name: id, lead_status: "warm", entity_type: "lead", ...fields });
}
const leadRow = async (id) => (await db.jsonTable("student_leads")).find((l) => String(l.id) === id);
const audits = async (action) => (await pool.query("SELECT entity_id, detail FROM audit_log WHERE action = $1", [action])).rows;

test("a branch admin moves a leaver's leads to a colleague in the same branch, with the reason on record", { skip }, async () => {
  const leaver = await makeStaff("telecaller", B1);
  const colleague = await makeStaff("telecaller", B1);
  await lead("T-1", { assigned_telecaller_id: leaver.id, branch_id: String(B1) });
  await lead("T-2", { assigned_telecaller_id: leaver.id, branch_id: String(B1) });
  await lead("T-3", { assigned_telecaller_id: leaver.id, branch_id: String(B2) }); // odd record in another branch

  const listed = await run(h.items, { actor: branchAdmin(), params: { id: leaver.id }, query: { kind: "telecalling" } });
  assert.equal(listed.code, 200, JSON.stringify(listed.body));
  assert.equal(listed.body.items.length, 2, "a branch admin should see only their branch's records");

  const r = await run(h.transfer, {
    actor: branchAdmin(), params: { id: leaver.id },
    body: { toUserId: colleague.id, kind: "telecalling", reason: "Resigned" },
  });
  assert.equal(r.code, 200, JSON.stringify(r.body));
  assert.equal(r.body.moved, 2);
  assert.deepEqual(r.body.skipped, [], "a record outside the admin's branch should be invisible to them, not listed");
  assert.equal((await leadRow("T-1")).assigned_telecaller_id, colleague.id);
  assert.equal((await leadRow("T-3")).assigned_telecaller_id, leaver.id, "a lead from another branch was moved");

  const trail = await audits("lead.transfer");
  assert.ok(trail.some((row) => row.entity_id === "T-1" && JSON.stringify(row.detail).includes("Resigned")), "the reason was not kept on the lead's history");
  assert.equal((await audits("staff.transfer_work")).length >= 1, true);
});

test("work never moves to someone in another branch, through either the new or the old screen", { skip }, async () => {
  const leaver = await makeStaff("telecaller", B1);
  const elsewhere = await makeStaff("telecaller", B2);
  await lead("X-1", { assigned_telecaller_id: leaver.id, branch_id: String(B1) });

  const viaNew = await run(h.transfer, {
    actor: SUPER, params: { id: leaver.id },
    body: { toUserId: elsewhere.id, kind: "telecalling", reason: "Moving" },
  });
  assert.equal(viaNew.code, 403, JSON.stringify(viaNew.body));
  assert.equal(viaNew.body.code, "CROSS_BRANCH");

  const viaOld = await run(h.oldTelecallerTransfer, { actor: SUPER, params: { id: leaver.id }, body: { targetTelecallerId: elsewhere.id } });
  assert.equal(viaOld.code, 403, JSON.stringify(viaOld.body));
  assert.equal((await leadRow("X-1")).assigned_telecaller_id, leaver.id);
});

test("a branch admin cannot open another branch's people", { skip }, async () => {
  const r = await run(h.people, { actor: branchAdmin(), query: { branchId: String(B2) } });
  assert.equal(r.code, 403);
  const own = await run(h.people, { actor: branchAdmin(), query: { branchId: String(B1) } });
  assert.equal(own.code, 200);
  assert.ok(own.body.people.length >= 2);
});

test("a counselor's students go only to another counselor in the branch", { skip }, async () => {
  const leaving = await makeStaff("counselor", B1);
  const next = await makeStaff("counselor", B1);
  const telecaller = await makeStaff("telecaller", B1);
  const owner = leaving.counselorId || leaving.id;
  await lead("S-1", { assigned_counselor_id: owner, entity_type: "student", lead_status: "converted", branch_id: String(B1) });

  const wrong = await run(h.transfer, {
    actor: branchAdmin(), params: { id: leaving.id },
    body: { toUserId: telecaller.id, kind: "counseling", reason: "Leave" },
  });
  assert.equal(wrong.code, 400);
  assert.equal(wrong.body.code, "WRONG_ROLE");

  const ok = await run(h.transfer, {
    actor: branchAdmin(), params: { id: leaving.id },
    body: { toUserId: next.id, kind: "counseling", reason: "Long leave" },
  });
  assert.equal(ok.code, 200, JSON.stringify(ok.body));
  assert.equal(ok.body.moved, 1);
  const moved = (await leadRow("S-1")).assigned_counselor_id;
  assert.ok([next.id, next.counselorId].includes(moved), `student went to ${moved}`);
});

test("even a Super Admin cannot move a record into a branch the new owner does not work in", { skip }, async () => {
  const leaver = await makeStaff("telecaller", B1);
  const colleague = await makeStaff("telecaller", B1);
  await lead("Y-1", { assigned_telecaller_id: leaver.id, branch_id: String(B1) });
  await lead("Y-2", { assigned_telecaller_id: leaver.id, branch_id: String(B2) });
  const r = await run(h.transfer, { actor: SUPER, params: { id: leaver.id }, body: { toUserId: colleague.id, kind: "telecalling", reason: "Rebalance" } });
  assert.equal(r.code, 200, JSON.stringify(r.body));
  assert.deepEqual(r.body.movedIds, ["Y-1"]);
  assert.deepEqual(r.body.skipped.map((s) => [s.id, s.reason]), [["Y-2", "other_branch"]]);
  assert.equal((await leadRow("Y-2")).assigned_telecaller_id, leaver.id);
});

test("the page's receiver list offers only active colleagues from the same branch, with the right role", { skip }, async () => {
  const leaver = await makeStaff("counselor", B1);
  const sameBranchCounselor = await makeStaff("counselor", B1);
  const sameBranchTelecaller = await makeStaff("telecaller", B1);
  const suspended = await makeStaff("counselor", B1);
  const elsewhere = await makeStaff("counselor", B2);
  const off = await run(h.suspend, { actor: SUPER, params: { id: suspended.id }, body: { reason: "left" } });
  assert.equal(off.code, 200, JSON.stringify(off.body));

  const students = await run(h.receivers, { actor: branchAdmin(), params: { id: leaver.id }, query: { kind: "counseling" } });
  assert.equal(students.code, 200, JSON.stringify(students.body));
  const ids = students.body.receivers.map((r) => r.id);
  assert.ok(ids.includes(sameBranchCounselor.id), "a same-branch counselor was not offered");
  assert.ok(!ids.includes(sameBranchTelecaller.id), "a telecaller was offered students");
  assert.ok(!ids.includes(suspended.id), "a suspended counselor was offered");
  assert.ok(!ids.includes(elsewhere.id), "a counselor from another branch was offered");
  assert.ok(!ids.includes(leaver.id), "the person was offered their own work");

  const leads = await run(h.receivers, { actor: branchAdmin(), params: { id: leaver.id }, query: { kind: "telecalling" } });
  const leadIds = leads.body.receivers.map((r) => r.id);
  assert.ok(leadIds.includes(sameBranchTelecaller.id) && leadIds.includes(sameBranchCounselor.id));
  assert.ok(!leadIds.includes(elsewhere.id));
});
