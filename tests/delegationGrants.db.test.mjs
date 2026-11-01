// ACCESS-03C-1 against a real PostgreSQL: the grants table itself refuses what policy forbids,
// so a bug in application code cannot store a privileged role, a self-grant or onward delegation.
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
const A = "aaaaaaaa-0000-4000-8000-000000000001";
const B = "bbbbbbbb-0000-4000-8000-000000000002";
let pool;

const grant = (over = {}) => ({ action: "staff.create", grantee: "bh", grantor: "sa", parent: null, roles: ["counselor"], branches: [A], expires: null, ...over });
async function insert(g) {
  const r = await pool.query(
    "INSERT INTO delegation_grants (action, grantee_id, grantor_id, parent_grant_id, roles, branch_ids, expires_at) VALUES ($1,$2,$3,$4,$5,$6::uuid[],$7) RETURNING id",
    [g.action, g.grantee, g.grantor, g.parent, g.roles, g.branches, g.expires],
  );
  return r.rows[0].id;
}
const refused = (g, constraint) => assert.rejects(() => insert(g), (e) => e.code === "23514" || e.code === "23503" ? (constraint ? e.constraint === constraint : true) : false, `expected refusal ${constraint || ""}`);
const count = async () => Number((await pool.query("SELECT count(*) FROM delegation_grants")).rows[0].count);

test.before(async () => {
  if (skip) return;
  const admin = new pg.Pool({ connectionString: URL });
  await admin.query(`CREATE SCHEMA ${schema}`);
  await admin.end();
  pool = new pg.Pool({ connectionString: URL, options: `-c search_path=${schema}` });
  await pool.query(readFileSync(new globalThis.URL("../server/migrations/008_delegation_grants.sql", import.meta.url), "utf8"));
});

test.after(async () => {
  if (skip) return;
  await pool.end();
  const admin = new pg.Pool({ connectionString: URL });
  await admin.query(`DROP SCHEMA ${schema} CASCADE`);
  await admin.end();
});

test("the migration can be applied twice (additive, idempotent)", { skip }, async () => {
  await pool.query(readFileSync(new globalThis.URL("../server/migrations/008_delegation_grants.sql", import.meta.url), "utf8"));
});

test("valid grants are stored: creation grant, management grant, and a creation grant under a management parent", { skip }, async () => {
  const manage = await insert(grant({ action: "grants.manage", grantee: "adminA", grantor: "sa", roles: ["counselor", "telecaller"], branches: [A, B] }));
  const child = await insert(grant({ grantee: "bhA", grantor: "adminA", parent: manage }));
  const row = (await pool.query("SELECT * FROM delegation_grants WHERE id = $1", [child])).rows[0];
  assert.deepEqual([row.action, row.parent_grant_id, row.roles, row.branch_ids, row.revoked_at], ["staff.create", manage, ["counselor"], [A], null]);
  await insert(grant({ grantee: "bhB", branches: [B], roles: ["telecaller", "accountant"] }));
});

test("privileged or unknown roles are refused by the table: admin, branch_head, super_admin, student", { skip }, async () => {
  const before = await count();
  for (const role of ["admin", "branch_head", "super_admin", "student", "partner", "nonsense"]) {
    await refused(grant({ roles: ["counselor", role] }), "delegation_roles_valid");
  }
  await refused(grant({ roles: [] }), "delegation_roles_valid");
  assert.equal(await count(), before);
});

test("a grant needs at least one branch, and cannot be granted to its own grantor", { skip }, async () => {
  const before = await count();
  await refused(grant({ branches: [] }), "delegation_branches_present");
  await refused(grant({ grantee: "sa", grantor: "sa" }), "delegation_no_self_grant");
  assert.equal(await count(), before);
});

test("grant-management authority cannot have a parent: it cannot be passed onward", { skip }, async () => {
  const manage = await insert(grant({ action: "grants.manage", grantee: "adminX", grantor: "sa" }));
  const before = await count();
  await refused(grant({ action: "grants.manage", grantee: "adminY", grantor: "adminX", parent: manage }), "delegation_manage_has_no_parent");
  assert.equal(await count(), before);
});

test("unknown action, missing parent, half-recorded revocation and an expiry in the past are refused", { skip }, async () => {
  const before = await count();
  await refused(grant({ action: "staff.delete" }), "delegation_grants_action_check");
  await refused(grant({ parent: "dddddddd-0000-4000-8000-000000000009" }));
  await refused(grant({ expires: "2000-01-01T00:00:00Z" }), "delegation_expiry_after_creation");
  await assert.rejects(() => pool.query("UPDATE delegation_grants SET revoked_at = now() WHERE id = (SELECT id FROM delegation_grants LIMIT 1)"), (e) => e.constraint === "delegation_revocation_complete");
  assert.equal(await count(), before);
});

test("revoking records who and when, together", { skip }, async () => {
  const id = await insert(grant({ grantee: "bhR" }));
  await pool.query("UPDATE delegation_grants SET revoked_at = now(), revoked_by = 'sa' WHERE id = $1", [id]);
  const row = (await pool.query("SELECT revoked_by, revoked_at IS NOT NULL AS done FROM delegation_grants WHERE id = $1", [id])).rows[0];
  assert.deepEqual(row, { revoked_by: "sa", done: true });
});
