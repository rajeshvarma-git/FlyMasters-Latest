// ACCESS-03B: who is limited to which branches.
//
// One pure decision shared by the staff API (branchScope middleware) and the student app's
// generic data API, so the two cannot disagree.
//
// Rollout switch ADMIN_SCOPE_ENFORCED:
//   off (default)  Admin keeps today's unrestricted branch view, so existing admins are not locked
//                  out before their branches have been audited and confirmed.
//   on             Admin is limited to the branches assigned to them (user_branches). An Admin with
//                  no assigned branch gets NO branch access: there is no global fallback and no
//                  Head Office default. Super Admin is always unrestricted.
// Branch Head, Counselor, Telecaller and Accountant are always limited to their branches.

const SCOPED_ALWAYS = ["branch_head", "counselor", "telecaller", "accountant"];

export const adminScopeEnforced = () => String(process.env.ADMIN_SCOPE_ENFORCED || "").toLowerCase() === "true";

/** Is this role limited to assigned branches? */
export function isBranchLimited(role, { enforced = adminScopeEnforced() } = {}) {
  if (SCOPED_ALWAYS.includes(role)) return true;
  return role === "admin" && enforced;
}

/**
 * Returns { allBranches:true } for unrestricted roles, otherwise { allBranches:false, branchIds, branchId }.
 * `branchIds` may be empty; the caller must then refuse access rather than widen it.
 */
export function scopeFor(user, options = {}) {
  if (!isBranchLimited(user?.role, options)) return { allBranches: true, branchIds: [], branchId: null };
  const branchIds = [...new Set((user?.branch_ids || []).map(String))];
  return { allBranches: false, branchIds, branchId: user?.branch_id ? String(user.branch_id) : branchIds[0] || null };
}