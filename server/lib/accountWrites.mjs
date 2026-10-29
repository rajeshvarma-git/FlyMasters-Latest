// ACCESS-02D: the only code that writes who an account is.
//
// Role (user_roles), home branch (user_roles.branch_id) and memberships (user_branches) must
// always change together, or the account ends up in a state the audit (02A) reports as a
// discrepancy. Every write here either completes fully or leaves the account untouched.
//
// `db` is a pg Pool or an already-open client (for callers that own a transaction).
// `pool` arguments are anything with connect(): they open and finish their own transaction.

import { SCOPED_ROLES } from "./accountConsistency.mjs";

/** Roles whose every query is limited to their branches; they cannot exist without one. */
export const needsBranch = (role) => SCOPED_ROLES.includes(String(role));

export class AccountWriteError extends Error {
  constructor(status, message) {
    super(message);
    this.name = "AccountWriteError";
    this.status = status;
  }
}

/**
 * Inserts or updates the role row.
 * - branchId given: becomes the home branch.
 * - branchId omitted: an existing home branch is KEPT; only a brand-new row may default to
 *   Head Office (defaultToHeadOffice), and students may opt out so they carry no branch.
 */
export async function upsertUserRole(db, { userId, role, branchId = null, assignedBy = null, defaultToHeadOffice = true }) {
  const id = String(userId || "");
  if (!id) throw new AccountWriteError(400, "user_roles requires user_id");
  const { rows } = await db.query(
    `INSERT INTO user_roles (user_id, role, branch_id, assigned_by)
     VALUES ($1, $2,
             COALESCE($3::uuid, CASE WHEN $5::boolean THEN (SELECT id FROM branches WHERE code = 'HO') END),
             $4::text)
     ON CONFLICT (user_id) DO UPDATE
       SET role = EXCLUDED.role,
           branch_id = COALESCE($3::uuid, user_roles.branch_id),
           assigned_by = COALESCE($4::text, user_roles.assigned_by),
           updated_at = now()
     RETURNING user_id, role, branch_id, is_active, created_at`,
    [id, String(role || "student"), branchId || null, assignedBy, defaultToHeadOffice],
  );
  return rows[0];
}

async function inTransaction(pool, work) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await work(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}

async function replaceMemberships(db, userId, branchIds, assignedBy) {
  await db.query("DELETE FROM user_branches WHERE user_id = $1", [String(userId)]);
  if (!branchIds.length) return;
  await db.query(
    `INSERT INTO user_branches (user_id, branch_id, assigned_by)
     SELECT $1, unnest($2::uuid[]), $3 ON CONFLICT DO NOTHING`,
    [String(userId), branchIds, assignedBy],
  );
}

const unique = (ids) => [...new Set((ids || []).map(String).filter(Boolean))];

/**
 * Changes a role without touching where the person works. Moving into a branch-scoped role
 * needs a branch: the one they already have, which also becomes a membership if they had none.
 */
export async function assignRole(pool, { userId, role, branchId = null, assignedBy = null }) {
  return inTransaction(pool, async (client) => {
    const row = await upsertUserRole(client, { userId, role, branchId, assignedBy });
    if (needsBranch(role)) {
      if (!row.branch_id) {
        throw new AccountWriteError(400, "This person has no branch yet. Assign a branch first, then set the role.");
      }
      await client.query(
        `INSERT INTO user_branches (user_id, branch_id, assigned_by)
         SELECT $1, $2::uuid, $3
          WHERE NOT EXISTS (SELECT 1 FROM user_branches WHERE user_id = $1)
         ON CONFLICT DO NOTHING`,
        [String(userId), row.branch_id, assignedBy],
      );
    }
    return row;
  });
}

/** Replaces memberships and the home branch (the first one) in one step. */
export async function setAccountBranches(pool, { userId, branchIds, assignedBy = null }) {
  const ids = unique(branchIds);
  return inTransaction(pool, async (client) => {
    const { rows } = await client.query("SELECT role FROM user_roles WHERE user_id = $1 FOR UPDATE", [String(userId)]);
    if (!rows[0]) throw new AccountWriteError(409, "This account has no role yet. Set its role first.");
    if (needsBranch(rows[0].role) && !ids.length) {
      throw new AccountWriteError(400, `A ${String(rows[0].role).replace("_", " ")} must be assigned to at least one branch.`);
    }
    await replaceMemberships(client, userId, ids, assignedBy);
    await client.query("UPDATE user_roles SET branch_id = $2::uuid, updated_at = now() WHERE user_id = $1", [String(userId), ids[0] || null]);
    return ids;
  });
}

/** Creates the login, its role and its branches together, or nothing. */
export async function createAccount(pool, { id, email, passwordHash, metadata = {}, role, branchIds = [], assignedBy = null }) {
  const ids = unique(branchIds);
  if (needsBranch(role) && !ids.length) {
    throw new AccountWriteError(400, `A ${String(role).replace("_", " ")} must be assigned to at least one branch.`);
  }
  try {
    return await inTransaction(pool, async (client) => {
      await client.query(
        "INSERT INTO auth_users (id, email, password, user_metadata) VALUES ($1,$2,$3,$4::jsonb)",
        [id, email, passwordHash, JSON.stringify(metadata)],
      );
      await upsertUserRole(client, { userId: id, role, branchId: ids[0] || null, assignedBy });
      await replaceMemberships(client, id, ids, assignedBy);
      return { id, branchIds: ids };
    });
  } catch (error) {
    if (String(error?.code) === "23505") throw new AccountWriteError(400, "An account with this email already exists.");
    throw error;
  }
}