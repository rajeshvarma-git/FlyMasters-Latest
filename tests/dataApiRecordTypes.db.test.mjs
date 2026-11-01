// ACCESS-03B, whole path against a real PostgreSQL: signed-in request -> /__local_db policy -> database.
//
// A record id is unique across ALL record types, so a write may only replace a record of its own type.
// These tests send real HTTP requests as a Branch A Admin and a Super Admin, then read the stored rows
// back (type, branch, data) to prove what actually happened.
//
// Opt-in, so a plain `npm test` needs no database:
//   set TEST_DATABASE_URL=postgresql://user:pass@localhost:5432/anydb   (cmd)
//   npm test
// Works in a throwaway schema and drops it afterwards; your own tables are never touched.

import test from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { randomBytes } from "node:crypto";
import pg from "pg";

const URL = process.env.TEST_DATABASE_URL;
const skip = URL ? false : "set TEST_DATABASE_URL to run the PostgreSQL checks";
const schema = `t03r_${randomBytes(4).toString("hex")}`;
let admin, pool, server, base, ensureSchema, mutateAppState, RecordTypeConflictError, A, B, C;

const stored = async (id) => (await pool.query("SELECT table_name, branch_id, data, updated_at FROM app_records WHERE id = $1", [id])).rows[0] || null;
const total = async () => Number((await pool.query("SELECT count(*) FROM app_records")).rows[0].count);
async function post(token, body) {
  const res = await fetch(`${base}/__local_db`, { method: "POST", headers: { authorization: `Bearer ${token}`, "content-type": "application/json" }, body: JSON.stringify(body) });
  return { status: res.status, body: await res.json().catch(() => ({})) };
}

test.before(async () => {
  if (skip) return;
  admin = new pg.Pool({ connectionString: URL });
  await admin.query(`CREATE SCHEMA ${schema}`);
  process.env.DATABASE_URL = `${URL}${URL.includes("?") ? "&" : "?"}options=-c%20search_path%3D${schema}`;
  process.env.ADMIN_SCOPE_ENFORCED = "true";
  pool = new pg.Pool({ connectionString: URL, options: `-c search_path=${schema}` });
  await pool.query(`
    CREATE TABLE branches (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), name text, code text UNIQUE NOT NULL, is_active boolean NOT NULL DEFAULT true);
    INSERT INTO branches (name, code) VALUES ('A','A'), ('B','B'), ('C','C');
    CREATE TABLE app_records (
      id TEXT PRIMARY KEY, table_name TEXT NOT NULL, data JSONB NOT NULL DEFAULT '{}'::jsonb,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(), updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      branch_id UUID REFERENCES branches(id));
    CREATE TABLE auth_users (id TEXT PRIMARY KEY, email TEXT UNIQUE NOT NULL, password TEXT NOT NULL,
      user_metadata JSONB NOT NULL DEFAULT '{}'::jsonb, created_at TIMESTAMPTZ NOT NULL DEFAULT now());
    CREATE TABLE user_roles (user_id text PRIMARY KEY, role text NOT NULL DEFAULT 'student', branch_id uuid REFERENCES branches(id), is_active boolean NOT NULL DEFAULT true, assigned_by text, created_at timestamptz DEFAULT now(), updated_at timestamptz DEFAULT now());
    CREATE TABLE user_branches (user_id text NOT NULL, branch_id uuid NOT NULL REFERENCES branches(id) ON DELETE CASCADE, assigned_by text, created_at timestamptz DEFAULT now(), PRIMARY KEY (user_id, branch_id));`);
  const id = async (code) => (await pool.query("SELECT id FROM branches WHERE code = $1", [code])).rows[0].id;
  [A, B, C] = [await id("A"), await id("B"), await id("C")];
  await pool.query("INSERT INTO auth_users (id, email, password) VALUES ('adminA','adminA@x.test','h'), ('superX','superX@x.test','h')");
  await pool.query("INSERT INTO user_roles (user_id, role, branch_id) VALUES ('adminA','admin',$1), ('superX','super_admin',NULL)", [A]);
  await pool.query("INSERT INTO user_branches (user_id, branch_id) VALUES ('adminA',$1)", [A]);
  ({ mutateAppState, RecordTypeConflictError, ensureSchema } = await import("../server/student/postgres.ts"));
  const { handleApiRequest } = await import("../server/student/httpApi.ts");
  await ensureSchema();
  await pool.query("INSERT INTO auth_sessions (token, user_id, expires_at) VALUES ('tokA','adminA', now() + interval '1 hour'), ('tokS','superX', now() + interval '1 hour')");
  await pool.query(
    "INSERT INTO app_records (id, table_name, data, branch_id) VALUES ('lead-A','student_leads',$1::jsonb,$2), ('lead-B','student_leads',$3::jsonb,$4)",
    [JSON.stringify({ id: "lead-A", user_id: "stuA", email: "stuA@x.test", branch_id: A }), A, JSON.stringify({ id: "lead-B", user_id: "stuB", email: "stuB@x.test", branch_id: B }), B],
  );
  server = http.createServer((req, res) => { handleApiRequest(req, res).catch((e) => { res.statusCode = 500; res.end(String(e)); }); });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  base = `http://127.0.0.1:${server.address().port}`;
});

test.after(async () => {
  if (skip) return;
  await new Promise((r) => server?.close(r));
  await pool?.end();
  await admin.query(`DROP SCHEMA ${schema} CASCADE`);
  await admin.end();
});

test("Admin A: a permitted document with a new id is created, and an update of the same record works", { skip }, async () => {
  const made = await post("tokA", { action: "insert", table: "documents", rows: [{ id: "doc-new", user_id: "stuA", document_type: "passport" }] });
  assert.equal(made.status, 200, JSON.stringify(made.body));
  const row = await stored("doc-new");
  assert.equal(row.table_name, "documents");
  assert.equal(row.data.user_id, "stuA");
  const changed = await post("tokA", { action: "update", table: "documents", payload: { note: "checked" }, filters: [{ op: "eq", column: "id", value: "doc-new" }] });
  assert.equal(changed.status, 200, JSON.stringify(changed.body));
  const after = await stored("doc-new");
  assert.equal(after.table_name, "documents");
  assert.equal(after.data.note, "checked");
  assert.equal(after.data.user_id, "stuA");
});

test("Admin A cannot change Branch B's lead, whether by update or by re-saving its id: 403 and the lead is unchanged", { skip }, async () => {
  const before = await stored("lead-B");
  const upd = await post("tokA", { action: "update", table: "student_leads", payload: { note: "mine" }, filters: [{ op: "eq", column: "id", value: "lead-B" }] });
  assert.equal(upd.status, 403);
  const over = await post("tokA", { action: "insert", table: "student_leads", rows: [{ id: "lead-B", branch_id: A, email: "x@x.test" }] });
  assert.equal(over.status, 403);
  const ups = await post("tokA", { action: "upsert", table: "student_leads", rows: [{ id: "lead-B", branch_id: A }] });
  assert.equal(ups.status, 403);
  assert.deepEqual(await stored("lead-B"), before);
});

test("a document using an existing lead's id is a 409 on insert and on upsert, and that lead is untouched (foreign and own)", { skip }, async () => {
  for (const leadId of ["lead-B", "lead-A"]) {
    const before = await stored(leadId);
    const total0 = await total();
    const ins = await post("tokA", { action: "insert", table: "documents", rows: [{ id: leadId, user_id: "stuA", branch_id: A }] });
    assert.equal(ins.status, 409, JSON.stringify(ins.body));
    assert.equal(ins.body.code, "RECORD_TYPE_CONFLICT");
    const ups = await post("tokA", { action: "upsert", table: "documents", rows: [{ id: leadId, user_id: "stuA", branch_id: A }] });
    assert.equal(ups.status, 409, JSON.stringify(ups.body));
    assert.deepEqual(await stored(leadId), before, `${leadId} must be exactly as it was (type, branch, data, updated_at)`);
    assert.equal(await total(), total0);
  }
});

test("the same collision from a Super Admin is refused too: the database rule does not depend on who asks", { skip }, async () => {
  const before = await stored("lead-B");
  const res = await post("tokS", { action: "insert", table: "documents", rows: [{ id: "lead-B", user_id: "x" }] });
  assert.equal(res.status, 409, JSON.stringify(res.body));
  assert.deepEqual(await stored("lead-B"), before);
});

test("a valid first item followed by a conflicting second item stores nothing from the whole batch", { skip }, async () => {
  const before = await stored("lead-B");
  for (const action of ["insert", "upsert"]) {
    const res = await post("tokA", { action, table: "documents", rows: [{ id: `doc-ok-${action}`, user_id: "stuA" }, { id: "lead-B", user_id: "stuA" }] });
    assert.equal(res.status, 409, JSON.stringify(res.body));
    assert.equal(await stored(`doc-ok-${action}`), null, `${action}: the valid first item must be rolled back`);
  }
  assert.deepEqual(await stored("lead-B"), before);
});

test("simultaneous writes using one id for different record types: exactly one wins and the other cannot overwrite it", { skip }, async () => {
  for (let i = 0; i < 12; i++) {
    const id = `race-${i}`;
    const tables = i % 2 ? ["documents", "document_notifications"] : ["document_notifications", "documents"];
    const settled = await Promise.allSettled([
      mutateAppState({ action: i % 3 ? "insert" : "upsert", table: tables[0], rows: [{ id, who: tables[0] }] }),
      mutateAppState({ action: i % 3 === 1 ? "upsert" : "insert", table: tables[1], rows: [{ id, who: tables[1] }] }),
    ]);
    const won = settled.map((s, k) => (s.status === "fulfilled" ? k : -1)).filter((k) => k >= 0);
    assert.equal(won.length, 1, `round ${i}: ${JSON.stringify(settled.map((s) => s.status))}`);
    const lost = settled[1 - won[0]];
    assert.ok(lost.reason instanceof RecordTypeConflictError, String(lost.reason));
    const row = await stored(id);
    assert.equal(row.table_name, tables[won[0]]);
    assert.equal(row.data.who, tables[won[0]]);
  }
});

test("branches through the API: a new lead in Branch A is stored in SQL and JSON; Admin A cannot move it to C; a Super Admin can, and SQL follows", { skip }, async () => {
  const made = await post("tokA", { action: "insert", table: "student_leads", rows: [{ id: "lead-new", branch_id: A, email: "new@x.test" }] });
  assert.equal(made.status, 200, JSON.stringify(made.body));
  let row = await stored("lead-new");
  assert.deepEqual([row.table_name, row.branch_id, row.data.branch_id], ["student_leads", A, A]);
  const denied = await post("tokA", { action: "update", table: "student_leads", payload: { branch_id: C }, filters: [{ op: "eq", column: "id", value: "lead-new" }] });
  assert.equal(denied.status, 403);
  row = await stored("lead-new");
  assert.deepEqual([row.branch_id, row.data.branch_id], [A, A]);
  const moved = await post("tokS", { action: "update", table: "student_leads", payload: { branch_id: C }, filters: [{ op: "eq", column: "id", value: "lead-new" }] });
  assert.equal(moved.status, 200, JSON.stringify(moved.body));
  row = await stored("lead-new");
  assert.deepEqual([row.table_name, row.branch_id, row.data.branch_id], ["student_leads", C, C]);
});
