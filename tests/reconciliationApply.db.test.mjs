// ACCESS-02E against a real PostgreSQL (opt-in, same throwaway-schema pattern as the 02D checks):
//   set TEST_DATABASE_URL=postgresql://user:pass@localhost:5432/anydb
import test from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import pg from "pg";
import { applyPlan } from "../server/lib/reconciliationApply.mjs";

const TARGET = { host: "localhost", port: "5432", database: "t", fingerprint: "fp" };
const journal = { prepared: async () => {}, committed: async () => {} };
const real = { dryRun: false, target: TARGET, journal };
const dry = { target: TARGET };
const P = (...entries) => ({ source: { target: TARGET }, entries });

const URL = process.env.TEST_DATABASE_URL;
const skip = URL ? false : "set TEST_DATABASE_URL to run the PostgreSQL checks";
const schema = `t02e_${randomBytes(4).toString("hex")}`;
let pool, B;
const rows = async (sql, p) => (await pool.query(sql, p)).rows;

test.before(async () => {
  if (skip) return;
  const admin = new pg.Pool({ connectionString: URL });
  await admin.query(`CREATE SCHEMA ${schema}`);
  await admin.end();
  pool = new pg.Pool({ connectionString: URL, options: `-c search_path=${schema}` });
  await pool.query(`
    CREATE TABLE branches (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), code text UNIQUE NOT NULL, is_active boolean NOT NULL DEFAULT true);
    INSERT INTO branches (code, is_active) VALUES ('HYD', true), ('VIZ', true), ('OLD', false);
    CREATE TABLE auth_users (id text PRIMARY KEY, email text UNIQUE, password text);
    CREATE TABLE user_roles (user_id text PRIMARY KEY, role text NOT NULL DEFAULT 'student', branch_id uuid REFERENCES branches(id), is_active boolean NOT NULL DEFAULT true, assigned_by text, updated_at timestamptz DEFAULT now(),
      CONSTRAINT valid CHECK (role IN ('super_admin','admin','branch_head','counselor','telecaller','accountant','partner','student')));
    CREATE TABLE user_branches (user_id text NOT NULL, branch_id uuid NOT NULL REFERENCES branches(id), assigned_by text, PRIMARY KEY (user_id, branch_id));
    INSERT INTO auth_users VALUES ('a1','a1@x.test','h'), ('a2','a2@x.test','h');
    INSERT INTO user_roles (user_id, role) VALUES ('a1','telecaller'), ('a2','telecaller'), ('ghost','counselor');`);
  B = Object.fromEntries((await rows("SELECT id, code FROM branches")).map((r) => [r.code, r.id]));
});
test.after(async () => {
  if (skip) return;
  await pool.end();
  const admin = new pg.Pool({ connectionString: URL });
  await admin.query(`DROP SCHEMA ${schema} CASCADE`);
  await admin.end();
});

const entry = (id, proposed, before) => ({ id, account_id: id, status: "approved", reviewer: "r", approved_at: "2026-10-30", reason: "ok", evidence: [{ code: "D1" }], expected_before: before, proposed });

test("dry run changes nothing; apply writes role, home and memberships; a second run is a no-op", { skip }, async () => {
  const p = P(entry("a1", { action: "set_access", role: "telecaller", home_branch: B.HYD, memberships: [B.HYD, B.VIZ] }, { role: "telecaller", home_branch: null, memberships: [] }));
  assert.equal((await applyPlan(pool, p, dry)).results[0].outcome, "would_apply");
  assert.equal((await rows("SELECT * FROM user_branches WHERE user_id='a1'")).length, 0);
  assert.equal((await applyPlan(pool, p, real)).results[0].outcome, "applied");
  assert.equal((await rows("SELECT branch_id FROM user_roles WHERE user_id='a1'"))[0].branch_id, B.HYD);
  assert.equal((await rows("SELECT * FROM user_branches WHERE user_id='a1'")).length, 2);
  assert.equal((await applyPlan(pool, p, real)).results[0].outcome, "already_applied");
});

test("an inactive branch is refused and the account is left exactly as it was", { skip }, async () => {
  const p = P(entry("a2", { action: "set_access", role: "telecaller", home_branch: B.OLD, memberships: [B.OLD] }, { role: "telecaller", home_branch: null, memberships: [] }));
  assert.equal((await applyPlan(pool, p, real)).results[0].outcome, "invalid");
  assert.deepEqual(await rows("SELECT role, branch_id FROM user_roles WHERE user_id='a2'"), [{ role: "telecaller", branch_id: null }]);
});

test("a changed account is stale; an orphan role is removed only because its account is gone", { skip }, async () => {
  const stale = P(entry("a2", { action: "set_access", role: "counselor", home_branch: B.VIZ, memberships: [B.VIZ] }, { role: "admin", home_branch: null, memberships: [] }));
  assert.equal((await applyPlan(pool, stale, real)).results[0].outcome, "stale");
  const orphan = P(entry("ghost", { action: "remove_orphan" }, { exists: false }));
  assert.equal((await applyPlan(pool, orphan, real)).results[0].outcome, "applied");
  assert.equal((await rows("SELECT * FROM user_roles WHERE user_id='ghost'")).length, 0);
});