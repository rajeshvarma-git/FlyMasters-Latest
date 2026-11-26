// The student's first chat asks which branch is easiest to visit. Optional; skipping means Head Office.
//
//   $env:TEST_DATABASE_URL = "postgresql://user:pass@localhost:5432/anydb"   (PowerShell)
//   npm test

import test from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import pg from "pg";

const URL = process.env.TEST_DATABASE_URL;
const skip = URL ? false : "set TEST_DATABASE_URL to run the PostgreSQL checks";
const schema = `sbc_${randomBytes(4).toString("hex")}`;

let pool;
let api;
let HO;
let AMP;
let OFF;

if (!skip) {
  const admin = new pg.Pool({ connectionString: URL });
  await admin.query(`CREATE SCHEMA ${schema}`);
  await admin.end();
  process.env.DATABASE_URL = `${URL}${URL.includes("?") ? "&" : "?"}options=-c%20search_path%3D${schema}`;
  process.env.JWT_SECRET = process.env.JWT_SECRET || `sbc-test-${randomBytes(8).toString("hex")}`;
  ({ pool } = await import("../server/lib/db.mjs"));
  const { migrate } = await import("../server/lib/migrate.mjs");
  await migrate();
  api = await import("../server/lib/studentBranchChoice.mjs");
  HO = (await pool.query("SELECT id FROM branches WHERE is_head_office LIMIT 1")).rows[0].id;
  AMP = (await pool.query("INSERT INTO branches (name, code, area, city) VALUES ('Ameerpet', 'AMP', 'Ameerpet', 'Hyderabad') RETURNING id")).rows[0].id;
  OFF = (await pool.query("INSERT INTO branches (name, code, is_active) VALUES ('Closed', 'CLS', false) RETURNING id")).rows[0].id;
}

test.after(async () => {
  if (skip) return;
  await pool.end();
  const admin = new pg.Pool({ connectionString: URL });
  await admin.query(`DROP SCHEMA ${schema} CASCADE`);
  await admin.end();
});

let n = 0;
async function student(extra = {}, branchId = null) {
  const userId = `user-${++n}-${randomBytes(3).toString("hex")}`;
  const leadId = `lead-${n}-${randomBytes(3).toString("hex")}`;
  await pool.query(
    "INSERT INTO app_records (id, table_name, data, branch_id) VALUES ($1, 'student_leads', $2::jsonb, $3::uuid)",
    [leadId, JSON.stringify({ id: leadId, user_id: userId, email: `${userId}@x.test`, ...extra }), branchId],
  );
  await pool.query(
    "INSERT INTO app_records (id, table_name, data) VALUES ($1, 'profiles', $2::jsonb)",
    [`prof-${leadId}`, JSON.stringify({ user_id: userId })],
  );
  return { viewer: { userId, email: `${userId}@x.test`, role: "student" }, leadId };
}
const branchOf = async (leadId) => (await pool.query("SELECT branch_id, data FROM app_records WHERE id = $1", [leadId])).rows[0];

test("the list offers only active branches, Head Office first", { skip }, async () => {
  const list = await api.listChoosableBranches(pool);
  const names = list.map((b) => b.name);
  assert.equal(names[0], "Head Office");
  assert.ok(names.includes("Ameerpet"));
  assert.ok(!names.includes("Closed"), "an inactive branch was offered");
  assert.equal(list.find((b) => b.name === "Ameerpet").area, "Ameerpet");
});

test("a student picks a branch: the lead and the profile carry it, and the choice is on record", { skip }, async () => {
  const { viewer, leadId } = await student();
  const r = await api.chooseBranchForStudent(pool, viewer, String(AMP));
  assert.equal(r.status, 200, JSON.stringify(r.body));
  const row = await branchOf(leadId);
  assert.equal(String(row.branch_id), String(AMP));
  assert.equal(row.data.branch_choice, "chosen");
  const profile = (await pool.query("SELECT branch_id, data FROM app_records WHERE id = $1", [`prof-${leadId}`])).rows[0];
  assert.equal(String(profile.branch_id), String(AMP));
  assert.equal(profile.data.branch_choice, "chosen");
});

test("skipping puts the student in Head Office", { skip }, async () => {
  const { viewer, leadId } = await student();
  const r = await api.chooseBranchForStudent(pool, viewer, null);
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.equal(r.body.skipped, true);
  const row = await branchOf(leadId);
  assert.equal(String(row.branch_id), String(HO));
  assert.equal(row.data.branch_choice, "skipped");
});

test("an inactive or unknown branch is refused, and nothing changes", { skip }, async () => {
  const { viewer, leadId } = await student();
  const closed = await api.chooseBranchForStudent(pool, viewer, String(OFF));
  assert.equal(closed.status, 400);
  const unknown = await api.chooseBranchForStudent(pool, viewer, "00000000-0000-0000-0000-000000000000");
  assert.equal(unknown.status, 400);
  assert.equal((await branchOf(leadId)).branch_id, null);
});

test("a student cannot pull a case out of a branch whose staff already have it", { skip }, async () => {
  const { viewer, leadId } = await student({ assigned_telecaller_id: "someone" }, HO);
  const r = await api.chooseBranchForStudent(pool, viewer, String(AMP));
  assert.equal(r.status, 200);
  assert.equal(r.body.changed, 0);
  assert.equal(String((await branchOf(leadId)).branch_id), String(HO), "a worked case was moved by the student");
});

test("only a student can use it; with no lead yet it asks them to finish the earlier questions", { skip }, async () => {
  const { viewer } = await student();
  const staff = await api.chooseBranchForStudent(pool, { ...viewer, role: "telecaller" }, String(AMP));
  assert.equal(staff.status, 403);
  const nobody = await api.chooseBranchForStudent(pool, { userId: "ghost", email: "ghost@x.test", role: "student" }, String(AMP));
  assert.equal(nobody.status, 404);
});
