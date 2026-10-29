// ACCESS-02D against a real PostgreSQL: rollbacks, constraints and the exact rows left behind.
//
// Opt-in, so a plain `npm test` needs no database:
//   set TEST_DATABASE_URL=postgresql://user:pass@localhost:5432/anydb   (cmd)
//   npm test
// It creates a throwaway schema with the four tables it needs, never touches your own tables,
// and drops the schema when it finishes.

import test from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import pg from "pg";
import { assignRole, setAccountBranches, createAccount, upsertUserRole } from "../server/lib/accountWrites.mjs";

const URL = process.env.TEST_DATABASE_URL;
const skip = URL ? false : "set TEST_DATABASE_URL to run the PostgreSQL checks";
const schema = `t02d_${randomBytes(4).toString("hex")}`;
let pool;
let B;

const rows = async (sql, params) => (await pool.query(sql, params)).rows;
const code = async (id) => (id ? (await rows("SELECT code FROM branches WHERE id = $1", [id]))[0]?.code : null);
async function state(userId) {
  const r = (await rows("SELECT role, branch_id FROM user_roles WHERE user_id = $1", [userId]))[0];
  const m = (await rows("SELECT b.code FROM user_branches ub JOIN branches b ON b.id = ub.branch_id WHERE ub.user_id = $1 ORDER BY 1", [userId])).map((x) => x.code);
  return { role: r?.role, home: r ? await code(r.branch_id) : undefined, memberships: m };
}
const addAccount = (id) => pool.query("INSERT INTO auth_users (id, email, password) VALUES ($1, $2, 'h')", [id, `${id}@x.test`]);

test.before(async () => {
  if (skip) return;
  const admin = new pg.Pool({ connectionString: URL });
  await admin.query(`CREATE SCHEMA ${schema}`);
  await admin.end();
  pool = new pg.Pool({ connectionString: URL, options: `-c search_path=${schema}` });
  await pool.query(`
    CREATE TABLE branches (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), name text, code text UNIQUE NOT NULL);
    INSERT INTO branches (name, code) VALUES ('Head Office','HO'), ('Hyderabad','HYD'), ('Vizag','VIZ');
    CREATE TABLE auth_users (id text PRIMARY KEY, email text UNIQUE, password text, user_metadata jsonb DEFAULT '{}', created_at timestamptz DEFAULT now());
    CREATE TABLE user_roles (user_id text PRIMARY KEY, role text NOT NULL DEFAULT 'student', branch_id uuid REFERENCES branches(id), is_active boolean NOT NULL DEFAULT true, assigned_by text, created_at timestamptz DEFAULT now(), updated_at timestamptz DEFAULT now(),
      CONSTRAINT user_roles_role_valid CHECK (role IN ('super_admin','admin','branch_head','counselor','telecaller','accountant','partner','student')));
    CREATE TABLE user_branches (user_id text NOT NULL, branch_id uuid NOT NULL REFERENCES branches(id) ON DELETE CASCADE, assigned_by text, created_at timestamptz DEFAULT now(), PRIMARY KEY (user_id, branch_id));`);
  B = Object.fromEntries((await rows("SELECT id, code FROM branches")).map((r) => [r.code, r.id]));
});

test.after(async () => {
  if (skip) return;
  await pool.end();
  const admin = new pg.Pool({ connectionString: URL });
  await admin.query(`DROP SCHEMA ${schema} CASCADE`);
  await admin.end();
});

test("a role change keeps the person's branch", { skip }, async () => {
  await createAccount(pool, { id: "k1", email: "k1@x.test", passwordHash: "h", role: "telecaller", branchIds: [B.HYD] });
  await assignRole(pool, { userId: "k1", role: "counselor" });
  assert.deepEqual(await state("k1"), { role: "counselor", home: "HYD", memberships: ["HYD"] });
});

test("F1: an account with no role is never given Head Office; the move into a scoped role is refused", { skip }, async () => {
  await addAccount("f1");
  await assert.rejects(() => assignRole(pool, { userId: "f1", role: "telecaller" }), (e) => e.status === 400);
  assert.deepEqual(await state("f1"), { role: undefined, home: undefined, memberships: [] });
});

test("F2: a named home branch is also a membership; a disagreeing account is refused, not widened", { skip }, async () => {
  await createAccount(pool, { id: "f2", email: "f2@x.test", passwordHash: "h", role: "telecaller", branchIds: [B.HYD] });
  await upsertUserRole(pool, { userId: "f2", role: "telecaller", branchId: B.VIZ });
  const s = await state("f2");
  assert.ok(s.memberships.includes(s.home), JSON.stringify(s));

  await addAccount("f2b");
  await pool.query("INSERT INTO user_roles (user_id, role, branch_id) VALUES ('f2b', 'student', $1)", [B.VIZ]);
  await pool.query("INSERT INTO user_branches (user_id, branch_id) VALUES ('f2b', $1)", [B.HYD]);
  await assert.rejects(() => assignRole(pool, { userId: "f2b", role: "counselor" }), (e) => e.status === 409);
  assert.deepEqual(await state("f2b"), { role: "student", home: "VIZ", memberships: ["HYD"] });
});

test("F3: a missing account is refused everywhere and leaves no orphan rows", { skip }, async () => {
  for (const run of [
    () => assignRole(pool, { userId: "ghost", role: "admin" }),
    () => upsertUserRole(pool, { userId: "ghost", role: "student" }),
    () => setAccountBranches(pool, { userId: "ghost", branchIds: [B.HYD] }),
  ]) await assert.rejects(run, (e) => e.status === 404);
  assert.equal((await rows("SELECT 1 FROM user_roles WHERE user_id = 'ghost'")).length, 0);
  assert.equal((await rows("SELECT 1 FROM user_branches WHERE user_id = 'ghost'")).length, 0);
});

test("F4: self-registered telecaller has account and role but no branch; an admin assignment completes it", { skip }, async () => {
  await createAccount(pool, { id: "f4", email: "f4@x.test", passwordHash: "h", role: "telecaller", allowUnassigned: true });
  assert.deepEqual(await state("f4"), { role: "telecaller", home: null, memberships: [] });
  await setAccountBranches(pool, { userId: "f4", branchIds: [B.HYD] });
  assert.deepEqual(await state("f4"), { role: "telecaller", home: "HYD", memberships: ["HYD"] });
});

test("branch updates are atomic: a bad branch rolls everything back", { skip }, async () => {
  await createAccount(pool, { id: "a1", email: "a1@x.test", passwordHash: "h", role: "telecaller", branchIds: [B.VIZ, B.HYD] });
  await assert.rejects(() => setAccountBranches(pool, { userId: "a1", branchIds: [B.HYD, "00000000-0000-0000-0000-000000000000"] }));
  assert.deepEqual(await state("a1"), { role: "telecaller", home: "VIZ", memberships: ["HYD", "VIZ"] });
  await assert.rejects(() => setAccountBranches(pool, { userId: "a1", branchIds: [] }), (e) => e.status === 400);
  assert.equal((await state("a1")).memberships.length, 2);
});

test("account creation is atomic: duplicate email or invalid role leaves no login and no role", { skip }, async () => {
  await assert.rejects(() => createAccount(pool, { id: "c2", email: "a1@x.test", passwordHash: "h", role: "admin" }), (e) => e.status === 400);
  assert.equal((await rows("SELECT 1 FROM user_roles WHERE user_id = 'c2'")).length, 0);
  await assert.rejects(() => createAccount(pool, { id: "c3", email: "c3@x.test", passwordHash: "h", role: "wizard" }));
  assert.equal((await rows("SELECT 1 FROM auth_users WHERE id = 'c3'")).length, 0);
});