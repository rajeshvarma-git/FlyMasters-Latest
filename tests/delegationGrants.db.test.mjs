// ACCESS-03C-1 against a real PostgreSQL: the grants table itself refuses what policy forbids, so a
// bug in application code cannot store a privileged role, a self-grant, onward delegation, a person
// or branch that does not exist, or a grant without a reason and an audit record.
//
// Opt-in, so a plain `npm test` needs no database:
//   set TEST_DATABASE_URL=postgresql://user:pass@localhost:5432/anydb   (cmd)
//   npm test
// Works in a throwaway schema and drops it afterwards; your own tables are never touched.

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { randomBytes } from "node:crypto";
import pg from "pg";

const URL = process.env.TEST_DATABASE_URL;
const skip = URL ? false : "set TEST_DATABASE_URL to run the PostgreSQL checks";
const schema = `t03c_${randomBytes(4).toString("hex")}`;
const MIGRATION = new globalThis.URL("../server/migrations/008_delegation_grants.sql", import.meta.url);
let pool, A, B, GONE;

const audit = async (action) => (await pool.query("INSERT INTO audit_log (actor_id, action, entity) VALUES ('sa', $1, 'delegation_grant') RETURNING id", [action])).rows[0].id;
async function grant(over = {}) {
  const g = { action: "staff.create", grantee: "bh", grantor: "sa", parent: null, roles: ["counselor"], branches: [A], reason: "covers hiring", expires: null, audit: await audit("issue"), ...over };
  const r = await pool.query(
    "INSERT INTO delegation_grants (action, grantee_id, grantor_id, parent_grant_id, roles, branch_ids, reason, expires_at, issue_audit_id) VALUES ($1,$2,$3,$4,$5,$6::uuid[],$7,$8,$9) RETURNING id",
    [g.action, g.grantee, g.grantor, g.parent, g.roles, g.branches, g.reason, g.expires, g.audit],
  );
  return r.rows[0].id;
}
const refusedBy = (promise, constraint) => assert.rejects(promise, (e) => ["23514", "23503", "23502", "23505"].includes(e.code) && (!constraint || e.constraint === constraint), `expected refusal by ${constraint || "the table"}`);
const count = async () => Number((await pool.query("SELECT count(*) FROM delegation_grants")).rows[0].count);

test.before(async () => {
  if (skip) return;
  const admin = new pg.Pool({ connectionString: URL });
  await admin.query(`CREATE SCHEMA ${schema}`);
  await admin.end();
  pool = new pg.Pool({ connectionString: URL, options: `-c search_path=${schema}` });
  await pool.query(`
    CREATE TABLE branches (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), name text, code text UNIQUE NOT NULL, is_active boolean NOT NULL DEFAULT true);
    CREATE TABLE auth_users (id text PRIMARY KEY, email text UNIQUE, password text);
    CREATE TABLE audit_log (id BIGSERIAL PRIMARY KEY, actor_id text, actor_role text, branch_id uuid, action text NOT NULL, entity text NOT NULL, entity_id text, detail jsonb NOT NULL DEFAULT '{}'::jsonb, ip text, created_at timestamptz NOT NULL DEFAULT now());
    INSERT INTO branches (name, code, is_active) VALUES ('A','A',true), ('B','B',true), ('Closed','X',false);
    INSERT INTO auth_users (id, email, password) VALUES ('sa','sa@x.test','h'), ('adminA','adminA@x.test','h'), ('adminX','adminX@x.test','h'),
      ('adminY','adminY@x.test','h'), ('bh','bh@x.test','h'), ('bhA','bhA@x.test','h'), ('bhB','bhB@x.test','h'), ('bhR','bhR@x.test','h');`);
  A = (await pool.query("SELECT id FROM branches WHERE code='A'")).rows[0].id;
  B = (await pool.query("SELECT id FROM branches WHERE code='B'")).rows[0].id;
  GONE = (await pool.query("SELECT id FROM branches WHERE code='X'")).rows[0].id;
  await pool.query(readFileSync(MIGRATION, "utf8"));
});

test.after(async () => {
  if (skip) return;
  await pool.end();
  const admin = new pg.Pool({ connectionString: URL });
  await admin.query(`DROP SCHEMA ${schema} CASCADE`);
  await admin.end();
});

test("the migration can be applied twice (additive, idempotent)", { skip }, async () => {
  await pool.query(readFileSync(MIGRATION, "utf8"));
});

test("valid grants are stored with reason and audit linkage: creation, management, and creation under a management parent", { skip }, async () => {
  const manage = await grant({ action: "grants.manage", grantee: "adminA", roles: ["counselor", "telecaller"], branches: [A, B], reason: "Vizag + HYD hiring" });
  const child = await grant({ grantee: "bhA", grantor: "adminA", parent: manage });
  const row = (await pool.query("SELECT * FROM delegation_grants WHERE id = $1", [child])).rows[0];
  assert.deepEqual([row.action, row.parent_grant_id, row.roles, row.branch_ids, row.reason, row.revoked_at], ["staff.create", manage, ["counselor"], [A], "covers hiring", null]);
  assert.ok(row.issue_audit_id);
  await grant({ grantee: "bhB", branches: [B], roles: ["telecaller", "accountant"] });
});

test("privileged or unknown roles, empty lists and NULL elements in roles are refused", { skip }, async () => {
  const before = await count();
  for (const role of ["admin", "branch_head", "super_admin", "student", "partner", "nonsense"]) {
    await refusedBy(grant({ roles: ["counselor", role] }), "delegation_roles_valid");
  }
  await refusedBy(grant({ roles: [] }), "delegation_roles_valid");
  await refusedBy(grant({ roles: ["counselor", null] }), "delegation_roles_valid");
  assert.equal(await count(), before);
});

test("branches: at least one, no NULL elements, and every branch must exist and be active", { skip }, async () => {
  const before = await count();
  await refusedBy(grant({ branches: [] }), "delegation_branches_present");
  await refusedBy(grant({ branches: [null] }), "delegation_branches_present");
  await refusedBy(grant({ branches: [A, null] }), "delegation_branches_present");
  await refusedBy(grant({ branches: [A, "dddddddd-0000-4000-8000-000000000009"] }), "delegation_branches_exist");
  await refusedBy(grant({ branches: [GONE] }), "delegation_branches_exist");
  assert.equal(await count(), before);
});

test("both people must be real accounts: an unknown grantee or grantor is refused", { skip }, async () => {
  const before = await count();
  await refusedBy(grant({ grantee: "ghost" }), "delegation_grants_grantee_id_fkey");
  await refusedBy(grant({ grantor: "ghost" }), "delegation_grants_grantor_id_fkey");
  assert.equal(await count(), before);
});

test("no self-grants, and grant-management authority cannot have a parent", { skip }, async () => {
  const before = await count();
  await refusedBy(grant({ grantee: "sa", grantor: "sa" }), "delegation_no_self_grant");
  const manage = await grant({ action: "grants.manage", grantee: "adminX", grantor: "sa" });
  await refusedBy(grant({ action: "grants.manage", grantee: "adminY", grantor: "adminX", parent: manage }), "delegation_manage_has_no_parent");
  assert.equal(await count(), before + 1);
});

test("a reason is required, and so is the audit row of the issue", { skip }, async () => {
  const before = await count();
  for (const reason of ["", "   "]) await refusedBy(grant({ reason }), "delegation_reason_present");
  await refusedBy(grant({ reason: "x".repeat(501) }), "delegation_reason_present");
  await refusedBy(grant({ reason: null }));
  await refusedBy(grant({ audit: null }));
  await refusedBy(grant({ audit: 999999999 }), "delegation_grants_issue_audit_id_fkey");
  assert.equal(await count(), before);
});

test("missing parent and an expiry in the past are refused", { skip }, async () => {
  const before = await count();
  await refusedBy(grant({ parent: "dddddddd-0000-4000-8000-000000000009" }), "delegation_grants_parent_grant_id_fkey");
  await refusedBy(grant({ expires: "2000-01-01T00:00:00Z" }), "delegation_expiry_after_creation");
  assert.equal(await count(), before);
});

test("unknown action is refused", { skip }, async () => {
  await refusedBy(grant({ action: "staff.delete" }), "delegation_grants_action_check");
});

test("a revocation is complete or absent: when, by whom, why and its audit row", { skip }, async () => {
  const id = await grant({ grantee: "bhR" });
  const revoke = (set, params) => pool.query(`UPDATE delegation_grants SET ${set} WHERE id = $1`, [id, ...params]);
  await refusedBy(revoke("revoked_at = now()", []), "delegation_revocation_complete");
  await refusedBy(revoke("revoked_at = now(), revoked_by = 'sa'", []), "delegation_revocation_complete");
  await refusedBy(revoke("revoked_at = now(), revoked_by = 'sa', revocation_reason = '  '", []), "delegation_revocation_complete");
  await refusedBy(revoke("revoked_at = now(), revoked_by = 'sa', revocation_reason = 'left'", []), "delegation_revocation_complete");
  await refusedBy(revoke("revoked_at = now(), revoked_by = 'ghost', revocation_reason = 'left', revoke_audit_id = $2", [await audit("revoke")]), "delegation_grants_revoked_by_fkey");
  await revoke("revoked_at = now(), revoked_by = 'sa', revocation_reason = 'left the company', revoke_audit_id = $2", [await audit("revoke")]);
  const row = (await pool.query("SELECT revoked_by, revocation_reason, revoke_audit_id IS NOT NULL AS audited FROM delegation_grants WHERE id = $1", [id])).rows[0];
  assert.deepEqual(row, { revoked_by: "sa", revocation_reason: "left the company", audited: true });
});
