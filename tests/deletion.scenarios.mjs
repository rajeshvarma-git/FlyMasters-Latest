// Shared scenarios for the Super Admin delete. Used by the PostgreSQL test (opt-in) and runnable
// against any pg-compatible pool: pool.connect() -> { query(sql, params), release() }.
import assert from "node:assert/strict";
import { runDelete, DeleteRefused } from "../server/lib/deletion.mjs";

export const SCHEMA = `
  CREATE TABLE partners (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id text UNIQUE, type text DEFAULT 'agent',
    referral_code text UNIQUE NOT NULL, full_name text NOT NULL, email text, phone text);
  CREATE TABLE partner_commissions (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), partner_id uuid NOT NULL REFERENCES partners(id),
    lead_id uuid, status text NOT NULL DEFAULT 'pending');
  CREATE TABLE referral_events (id serial PRIMARY KEY, lead_id uuid, partner_id uuid REFERENCES partners(id));
  CREATE TABLE app_records (id text PRIMARY KEY, table_name text NOT NULL, data jsonb NOT NULL DEFAULT '{}'::jsonb,
    referred_by_partner_id uuid REFERENCES partners(id));
  CREATE TABLE auth_users (id text PRIMARY KEY, email text UNIQUE NOT NULL, password text NOT NULL DEFAULT 'h', user_metadata jsonb DEFAULT '{}'::jsonb);
  CREATE TABLE auth_sessions (token text PRIMARY KEY, user_id text NOT NULL);
  CREATE TABLE user_roles (user_id text PRIMARY KEY, role text NOT NULL);
  CREATE TABLE user_branches (user_id text NOT NULL, branch_id uuid);
  CREATE TABLE counselor_users (id uuid PRIMARY KEY, email text);
  CREATE TABLE student_leads (id uuid PRIMARY KEY, user_id uuid, email text, assigned_counselor_id uuid, assigned_telecaller_id uuid);
  CREATE TABLE university_shortlists (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), student_id uuid);
  CREATE TABLE counselor_attendance (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), counselor_id uuid);
`;

const U1 = "11111111-1111-4111-8111-111111111111"; // student account + SQL lead
const L1 = "22222222-2222-4222-8222-222222222222";
const SECOND_STAFF = "user-aaaaaaaa-0000-4000-8000-000000000001"; // telecaller id shape: not a UUID
const ADMIN = "user-aaaaaaaa-0000-4000-8000-000000000002";

const one = async (pool, sql, params = []) => (await pool.query(sql, params)).rows[0];
const refused = async (promise, status) => {
  await assert.rejects(promise, (e) => e instanceof DeleteRefused && (status ? e.status === status : true));
};

export async function runScenarios(pool) {
  const q = (sql, p) => pool.query(sql, p);
  const real = {
    connect: async () => ({ query: (s, p) => pool.query(s, p), release() {} }),
  };
  const pgPool = pool.connect ? pool : real;

  // --- a student: SQL lead + JSON lead + account + related rows -----------------------------
  await q("INSERT INTO auth_users (id, email) VALUES ($1,'s@x.test')", [U1]);
  await q("INSERT INTO user_roles VALUES ($1,'student')", [U1]);
  await q("INSERT INTO student_leads (id, user_id, email) VALUES ($1,$2,'s@x.test')", [L1, U1]);
  await q("INSERT INTO university_shortlists (student_id) VALUES ($1)", [U1]);
  await q("INSERT INTO app_records (id, table_name, data) VALUES ('p1','profiles',$1), ('m1','case_messages',$2), ('keep','universities',$3)",
    [JSON.stringify({ user_id: U1 }), JSON.stringify({ lead_id: L1 }), JSON.stringify({ name: "MIT" })]);

  // commission on record blocks the delete and changes nothing
  await q("INSERT INTO partners (id, referral_code, full_name) VALUES ('99999999-9999-4999-8999-999999999999','AAAA-1','Agent One')");
  await q("INSERT INTO partner_commissions (partner_id, lead_id, status) VALUES ('99999999-9999-4999-8999-999999999999',$1,'pending')", [L1]);
  await refused(runDelete(pgPool, "student", L1, { actorId: ADMIN }), 409);
  assert.equal((await one(q ? { query: q } : pool, "SELECT count(*)::int n FROM student_leads")).n, 1, "refused delete must not remove anything");

  // once the commission is rejected the delete goes through, and ONLY this person's data goes
  await q("UPDATE partner_commissions SET status='rejected'");
  const result = await runDelete(pgPool, "student", L1, { actorId: ADMIN });
  assert.ok(result.removed.leadRows >= 1);
  assert.equal((await one({ query: q }, "SELECT count(*)::int n FROM student_leads")).n, 0);
  assert.equal((await one({ query: q }, "SELECT count(*)::int n FROM auth_users WHERE id=$1", [U1])).n, 0, "student login removed");
  assert.equal((await one({ query: q }, "SELECT count(*)::int n FROM university_shortlists")).n, 0);
  assert.deepEqual((await q("SELECT id FROM app_records ORDER BY id")).rows.map((r) => r.id), ["keep"], "shared catalogue rows survive");

  // deleting something that is gone is a clean 404
  await refused(runDelete(pgPool, "student", L1, { actorId: ADMIN }), 404);

  // --- staff -------------------------------------------------------------------------------
  await q("INSERT INTO auth_users (id, email) VALUES ($1,'t@x.test'), ($2,'a@x.test')", [SECOND_STAFF, ADMIN]);
  await q("INSERT INTO user_roles VALUES ($1,'telecaller'), ($2,'super_admin')", [SECOND_STAFF, ADMIN]);
  await q("INSERT INTO counselor_attendance (counselor_id) VALUES ('33333333-3333-4333-8333-333333333333')");

  await refused(runDelete(pgPool, "staff", ADMIN, { actorId: ADMIN }), 400); // yourself
  await refused(runDelete(pgPool, "staff", ADMIN, { actorId: "someone-else" }), 403); // another super admin

  // a telecaller who still owns a lead (JSON store, non-UUID id) cannot be deleted
  await q("INSERT INTO app_records (id, table_name, data) VALUES ('lead-x','student_leads',$1)", [JSON.stringify({ assigned_telecaller_id: SECOND_STAFF })]);
  await refused(runDelete(pgPool, "staff", SECOND_STAFF, { actorId: ADMIN }), 409);
  await q("DELETE FROM app_records WHERE id = 'lead-x'");

  await runDelete(pgPool, "staff", SECOND_STAFF, { actorId: ADMIN });
  assert.equal((await one({ query: q }, "SELECT count(*)::int n FROM auth_users WHERE id=$1", [SECOND_STAFF])).n, 0);
  assert.equal((await one({ query: q }, "SELECT count(*)::int n FROM counselor_attendance")).n, 1, "payroll history is kept");

  // --- partners ----------------------------------------------------------------------------
  await q("INSERT INTO partners (referral_code, full_name) VALUES ('BBBB-2','Agent Two')");
  const withHistory = "99999999-9999-4999-8999-999999999999"; // has a (rejected) commission row
  await refused(runDelete(pgPool, "partner", withHistory, { actorId: ADMIN }), 409);
  const clean = (await one({ query: q }, "SELECT id FROM partners WHERE referral_code='BBBB-2'")).id;
  await runDelete(pgPool, "partner", clean, { actorId: ADMIN });
  assert.equal((await one({ query: q }, "SELECT count(*)::int n FROM partners WHERE id=$1", [clean])).n, 0);
}
