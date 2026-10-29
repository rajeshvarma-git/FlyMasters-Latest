// ACCESS-02C: one place that decides who an account is.
//
// Role, enabled state and branches come only from SQL: auth_users, user_roles and
// user_branches. Legacy JSON role records (app_records 'user_roles') are never read here.
// A profile describes a person; it never grants permission.
//
// Two modes, so provisioning can be repaired before anything is rejected:
//   compatible (default)  today's behaviour, but every fallback is reported in `warnings`
//   strict (IDENTITY_STRICT=true)  a missing role is an explicit error, and a branch-scoped
//                                   account with no memberships has no branch access
// A database failure is never turned into access: resolveAccountIdentity() throws and
// the caller must answer with a service error.

// Every role the database accepts (user_roles_role_valid). A role outside this list is refused.
export const KNOWN_ROLES = ["super_admin", "admin", "branch_head", "counselor", "telecaller", "accountant", "partner", "student"];

export const isStrict = () => String(process.env.IDENTITY_STRICT || "").toLowerCase() === "true";

const fail = (status, code, error) => ({ ok: false, status, code, error });

/**
 * Pure decision over one joined row (see QUERY below). No I/O.
 * row = { id, email, has_role, role, branch_id, is_active, membership_ids }
 */
export function decideIdentity(row, { strict = false, knownRoles = null } = {}) {
  if (!row) return fail(401, "ACCOUNT_NOT_FOUND", "Account no longer exists.");
  if (row.has_role && row.is_active === false) return fail(403, "ACCOUNT_DISABLED", "Account is disabled.");

  const warnings = [];
  let role = row.has_role ? String(row.role || "") : "";
  if (!role) {
    if (strict) return fail(403, "ROLE_NOT_CONFIGURED", "Account access is not configured. Ask an admin.");
    role = "student";
    warnings.push("missing_role");
  }
  if (knownRoles && !knownRoles.includes(role)) {
    return fail(403, "ROLE_INVALID", "Account access is not configured. Ask an admin.");
  }

  const homeBranch = row.branch_id ? String(row.branch_id) : null;
  let branchIds = (row.membership_ids || []).map(String).filter(Boolean);
  if (!branchIds.length && homeBranch && !strict) {
    // Today's behaviour: the home branch stands in for missing memberships.
    branchIds = [homeBranch];
    warnings.push("home_branch_fallback");
  }

  return {
    ok: true,
    identity: { id: String(row.id), email: row.email, role, branch_id: homeBranch, branch_ids: branchIds, warnings },
  };
}

const QUERY = `
  SELECT u.id,
         u.email,
         (r.user_id IS NOT NULL) AS has_role,
         r.role,
         r.branch_id,
         r.is_active,
         COALESCE((SELECT array_agg(ub.branch_id::text) FROM user_branches ub WHERE ub.user_id = u.id), '{}') AS membership_ids
    FROM auth_users u
    LEFT JOIN user_roles r ON r.user_id = u.id
   WHERE u.id = $1`;

/** Reads the account from SQL and decides. Throws on a database error: never a permissive fallback. */
export async function resolveAccountIdentity(db, userId, options = {}) {
  const { rows } = await db.query(QUERY, [String(userId)]);
  return decideIdentity(rows[0] || null, { strict: isStrict(), knownRoles: KNOWN_ROLES, ...options });
}

const warned = new Set();
/** Logs each fallback once per account per process, so the audit and logs agree without flooding. */
export function noteWarnings(identity) {
  for (const w of identity.warnings || []) {
    const key = `${identity.id}:${w}`;
    if (warned.has(key)) continue;
    warned.add(key);
    console.warn(`[identity] account ${identity.id}: ${w}`);
  }
}