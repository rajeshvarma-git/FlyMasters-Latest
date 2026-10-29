// ACCESS-02D: the only code that writes who an account is.
//
// Role (user_roles), home branch (user_roles.branch_id) and memberships (user_branches) must
// always change together, or the account ends up in a state the audit (02A) reports as a
// discrepancy. Every write here either completes fully or leaves the account untouched.
//
// Rules, each enforced here and covered by tests:
//  - The account must exist. Nothing is written for an unknown id.
//  - No branch is ever assigned by default. A branch is either named by the caller or kept
//    from what the person already has; "Head Office" is never a silent fallback.
//  - Home branch and memberships agree: naming a home branch also makes it a membership, and a
//    role change never papers over a disagreement that was already there.
//  - A branch-scoped role needs a branch, unless the caller says the assignment is pending
//    (allowUnassigned): the person then has no branch access at all until an admin assigns one.
//
// `db` is a pg Pool or an already-open client (for callers that own a transaction).
// `pool` arguments are anything with connect(): they open and finish their own transaction.

import { HOME_BRANCH_ROLES, SCOPED_ROLES } from "./accountConsistency.mjs";

/** Roles whose every query is limited to their branches; they cannot work without one. */
export const needsBranch = (role) => SCOPED_ROLES.includes(String(role));

export class AccountWriteError extends Error {
  constructor(status, message) {
    super(message);
    this.name = "AccountWriteError";
    this.status = status;
  }
}

async function requireAccount(db, userId) {
  const { rows } = await db.query("SELECT 1 FROM auth_users WHERE id = $1", [String(userId)]);
  if (!rows[0]) throw new AccountWriteError(404, "That account does not exist.");
}

async function addMembership(db, userId, branchId, assignedBy) {
  await db.query(
    `INSERT INTO user_branches (user_id, branch_id, assigned_by) VALUES ($1, $2::uuid, $3) ON CONFLICT DO NOTHING`,
    [String(userId), branchId, assignedBy],
  );
}

/**
 * Inserts or updates the role row for an existing account.
 * - branchId given: becomes the home branch, and (for roles that work at a branch) also a membership.
 * - branchId omitted: an existing home branch is KEPT; a new row simply has none.
 */
export async function upsertUserRole(db, { userId, role, branchId = null, assignedBy = null, syncMembership = true }) {
  const id = String(userId || "");
  if (!id) throw new AccountWriteError(400, "user_roles requires user_id");
  await requireAccount(db, id);
  const { rows } = await db.query(
    `INSERT INTO user_roles (user_id, role, branch_id, assigned_by)
     VALUES ($1, $2, $3::uuid, $4::text)
     ON CONFLICT (user_id) DO UPDATE
       SET role = EXCLUDED.role,
           branch_id = COALESCE($3::uuid, user_roles.branch_id),
           assigned_by = COALESCE($4::text, user_roles.assigned_by),
           updated_at = now()
     RETURNING user_id, role, branch_id, is_active, created_at`,
    [id, String(role || "student"), branchId || null, assignedBy],
  );
  if (syncMembership && branchId && HOME_BRANCH_ROLES.includes(String(role))) await addMembership(db, id, branchId, assignedBy);
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
const scopedMessage = (role) => `A ${String(role).replace("_", " ")} must be assigned to at least one branch.`;

/**
 * Changes a role without changing where the person works. Moving into a branch-scoped role
 * needs a branch they already have; this never picks one for them and never widens access:
 *  - no branch at all: refused (assign branches first);
 *  - a home branch but no memberships: the home branch becomes their one membership;
 *  - memberships that do not include the home branch: refused, because choosing between
 *    them is a decision for an admin, not a side effect of a role change.
 */
export async function assignRole(pool, { userId, role, branchId = null, assignedBy = null }) {
  return inTransaction(pool, async (client) => {
    const row = await upsertUserRole(client, { userId, role, branchId, assignedBy });
    if (needsBranch(role)) {
      if (!row.branch_id) {
        throw new AccountWriteError(400, "This person has no branch yet. Assign a branch first, then set the role.");
      }
      const { rows: memberships } = await client.query("SELECT branch_id FROM user_branches WHERE user_id = $1", [String(userId)]);
      const ids = memberships.map((m) => String(m.branch_id));
      if (!ids.length) {
        await addMembership(client, userId, row.branch_id, assignedBy);
      } else if (!ids.includes(String(row.branch_id))) {
        throw new AccountWriteError(409, "This person's home branch is not among their assigned branches. Fix their branches first, then set the role.");
      }
    }
    return row;
  });
}

/** Replaces memberships and the home branch (the first one) in one step. */
export async function setAccountBranches(pool, { userId, branchIds, assignedBy = null }) {
  const ids = unique(branchIds);
  return inTransaction(pool, async (client) => {
    await requireAccount(client, userId);
    const { rows } = await client.query("SELECT role FROM user_roles WHERE user_id = $1 FOR UPDATE", [String(userId)]);
    if (!rows[0]) throw new AccountWriteError(409, "This account has no role yet. Set its role first.");
    if (needsBranch(rows[0].role) && !ids.length) throw new AccountWriteError(400, scopedMessage(rows[0].role));
    await replaceMemberships(client, userId, ids, assignedBy);
    await client.query("UPDATE user_roles SET branch_id = $2::uuid, updated_at = now() WHERE user_id = $1", [String(userId), ids[0] || null]);
    return ids;
  });
}

/**
 * Creates the login, its role and its branches together, or nothing.
 * allowUnassigned: for self-registration, where the person cannot choose their own branch. The
 * account exists with its role but no branch and no branch access until an admin assigns one.
 */
export async function createAccount(pool, { id, email, passwordHash, metadata = {}, role, branchIds = [], assignedBy = null, allowUnassigned = false }) {
  const ids = unique(branchIds);
  if (needsBranch(role) && !ids.length && !allowUnassigned) throw new AccountWriteError(400, scopedMessage(role));
  try {
    return await inTransaction(pool, async (client) => {
      await client.query(
        "INSERT INTO auth_users (id, email, password, user_metadata) VALUES ($1,$2,$3,$4::jsonb)",
        [id, email, passwordHash, JSON.stringify(metadata)],
      );
      // Memberships are written in full just below, so the single-membership sync is skipped.
      await upsertUserRole(client, { userId: id, role, branchId: ids[0] || null, assignedBy, syncMembership: false });
      await replaceMemberships(client, id, ids, assignedBy);
      return { id, branchIds: ids };
    });
  } catch (error) {
    if (String(error?.code) === "23505") throw new AccountWriteError(400, "An account with this email already exists.");
    throw error;
  }
}