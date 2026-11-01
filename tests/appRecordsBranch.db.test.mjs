// ACCESS-03B against a real PostgreSQL: the generic data API must store the branch in the SQL column
// (the one permissions read), not only inside the JSON copy.
//
// Opt-in, so a plain `npm test` needs no database:
//   set TEST_DATABASE_URL=postgresql://user:pass@localhost:5432/anydb   (cmd)
//   npm test
// Works in a throwaway schema and drops it afterwards; your own tables are never touched.

import test from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import pg from "pg";

const URL = process.env.TEST_DATABASE_URL;
const skip = URL ? false : "set TEST_DATABASE_URL to run the PostgreSQL checks";
const schema = `t03b_${randomBytes(4).toString("hex")}`;
let admin, pool, mutateAppState, A, B, C;

const col = async (id) => (await pool.query("SELECT branch_id, data->>'branch_id' AS json FROM app_records WHERE id = $1", [id])).rows[0];
const count = async () => Number((await pool.query("SELECT count(*) FROM app_records WHERE table_name = 'student_leads'")).rows[0].count);

test.before(async () => {
  if (skip) return;
  admin = new pg.Pool({ connectionString: URL });
  await admin.query(`CREATE SCHEMA ${schema}`);
  const sep = URL.includes("?") ? "&" : "?";
  process.env.DATABASE_URL = `${URL}${sep}options=-c%20search_path%3D${schema}`;
  pool = new pg.Pool({ connectionString: URL, options: `-c search_path=${schema}` });
  await pool.query(`
    CREATE TABLE branches (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), name text, code text UNIQUE NOT NULL);
    INSERT INTO branches (name, code) VALUES ('A','A'), ('B','B'), ('C','C');
    CREATE TABLE app_records (
      id TEXT PRIMARY KEY, table_name TEXT NOT NULL, data JSONB NOT NULL DEFAULT '{}'::jsonb,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(), updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      branch_id UUID REFERENCES branches(id));
    CREATE TABLE auth_users (id TEXT PRIMARY KEY, email TEXT UNIQUE NOT NULL, password TEXT NOT NULL,
      user_metadata JSONB NOT NULL DEFAULT '{}'::jsonb, created_at TIMESTAMPTZ NOT NULL DEFAULT now());
    INSERT INTO auth_users (id, email, password) VALUES ('seed', 'seed@x.test', 'h');`);
  const id = async (code) => (await pool.query("SELECT id FROM branches WHERE code = $1", [code])).rows[0].id;
  [A, B, C] = [await id("A"), await id("B"), await id("C")];
  ({ mutateAppState } = await import("../server/student/postgres.ts"));
});

test.after(async () => {
  if (skip) return;
  await pool?.end();
  await admin.query(`DROP SCHEMA ${schema} CASCADE`);
  await admin.end();
});

test("insert: a lead created in a branch has that branch in the SQL column too", { skip }, async () => {
  await mutateAppState({ action: "insert", table: "student_leads", rows: [{ id: "L1", branch_id: C }] });
  assert.deepEqual(await col("L1"), { branch_id: C, json: C });
});

test("update: moving a lead changes the SQL column with the JSON; an update that says nothing about the branch keeps it", { skip }, async () => {
  await mutateAppState({ action: "insert", table: "student_leads", rows: [{ id: "L2", branch_id: A }] });
  await mutateAppState({ action: "update", table: "student_leads", payload: { branch_id: C }, filters: [{ column: "id", op: "eq", value: "L2" }] });
  assert.deepEqual(await col("L2"), { branch_id: C, json: C });
  await mutateAppState({ action: "update", table: "student_leads", payload: { note: "hi" }, filters: [{ column: "id", op: "eq", value: "L2" }] });
  assert.deepEqual(await col("L2"), { branch_id: C, json: C });
});

test("upsert: a new lead and a moved lead both land in the SQL column", { skip }, async () => {
  await mutateAppState({ action: "upsert", table: "student_leads", rows: [{ id: "L3", branch_id: B }] });
  assert.deepEqual(await col("L3"), { branch_id: B, json: B });
  await mutateAppState({ action: "upsert", table: "student_leads", rows: [{ id: "L3", branch_id: A }] });
  assert.deepEqual(await col("L3"), { branch_id: A, json: A });
});

test("a record with no branch stays without one, and clearing a branch clears the column", { skip }, async () => {
  await mutateAppState({ action: "insert", table: "student_leads", rows: [{ id: "L4" }] });
  assert.deepEqual(await col("L4"), { branch_id: null, json: null });
  await mutateAppState({ action: "insert", table: "student_leads", rows: [{ id: "L5", branch_id: A }] });
  await mutateAppState({ action: "update", table: "student_leads", payload: { branch_id: null }, filters: [{ column: "id", op: "eq", value: "L5" }] });
  assert.equal((await col("L5")).branch_id, null);
});

test("an unknown branch rolls the whole mutation back: nothing is stored, nothing is moved", { skip }, async () => {
  const before = await count();
  const bogus = "dddddddd-0000-4000-8000-000000000009";
  await assert.rejects(() => mutateAppState({ action: "insert", table: "student_leads", rows: [{ id: "L6", branch_id: A }, { id: "L7", branch_id: bogus }] }));
  assert.equal(await count(), before);
  await mutateAppState({ action: "insert", table: "student_leads", rows: [{ id: "L8", branch_id: A }] });
  await assert.rejects(() => mutateAppState({ action: "update", table: "student_leads", payload: { branch_id: bogus }, filters: [{ column: "id", op: "eq", value: "L8" }] }));
  assert.deepEqual(await col("L8"), { branch_id: A, json: A });
  await assert.rejects(() => mutateAppState({ action: "update", table: "student_leads", payload: { branch_id: "not-a-uuid" }, filters: [{ column: "id", op: "eq", value: "L8" }] }));
  assert.deepEqual(await col("L8"), { branch_id: A, json: A });
});
