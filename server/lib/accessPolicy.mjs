// ACCESS-03: one place that decides whether an actor may manage an account.
//
// Pure: no database, no Express. Routes load the target's facts (accountTargets.mjs) and ask here
// BEFORE writing anything; a denied request writes nothing.
//
// Contract (from the ACCESS-03 plan):
//  - Super Admin: may manage anyone, except changing their own role or branches.
//  - Admin: manages ordinary employees (Counselor, Telecaller, Accountant) and students, only
//    inside the branches assigned to them. Granting or managing Admin, Branch Head or Super Admin
//    needs Super Admin (or, later, an explicit delegation).
//  - Branch Head: manages nobody unless an explicit delegation (`grants`) allows that action, for
//    those roles, in those branches. Delegations never cover privileged roles and never let a
//    Branch Head delegate onward.
//  - Nobody changes their own role or branches.
//  - The WHOLE affected scope counts: a person who also belongs to a branch the actor does not
//    manage cannot be changed by that actor, even though one branch overlaps.
//  - "Associate" does not exist yet and is deliberately not listed.

export const ACTIONS = ["staff.create", "staff.role.change", "staff.branches.change", "staff.password.reset"];
export const ORDINARY_STAFF = ["counselor", "telecaller", "accountant"];
export const MANAGEABLE = [...ORDINARY_STAFF, "student"];
export const PRIVILEGED = ["admin", "branch_head", "super_admin"];

const deny = (status, code, error) => ({ ok: false, status, code, error });
const ok = () => ({ ok: true });
const ids = (list) => [...new Set((list || []).map(String).filter(Boolean))];
const inside = (list, allowed) => allowed === null || ids(list).every((b) => allowed.includes(b));

const NOT_PRIVILEGED = (what) => deny(403, "NEEDS_HIGHER_AUTHORITY", `${what} needs a Super Admin.`);
const OUT_OF_SCOPE = deny(403, "OUT_OF_SCOPE", "That is outside the branches you manage.");

/**
 * actor:     { id, role, scope: { allBranches, branchIds } }
 * target:    { id, role|null, branchIds: [], leadBranchIds: [] }   (not needed for staff.create)
 * requested: { role?, branchIds? }
 * grants:    [{ action, roles: [], branch_ids: [] }]  active delegations held by the actor
 */
export function decideAccountAction({ actor, action, target = {}, requested = {}, grants = [] }) {
  if (!ACTIONS.includes(action)) return deny(400, "UNKNOWN_ACTION", "Unknown action.");
  const role = actor?.role;
  if (!["super_admin", "admin", "branch_head"].includes(role)) return deny(403, "FORBIDDEN", "You cannot manage accounts.");

  const self = target.id && String(target.id) === String(actor.id);
  if (self && (action === "staff.role.change" || action === "staff.branches.change")) {
    return deny(403, "SELF_CHANGE", "You cannot change your own role or branches.");
  }
  if (role === "super_admin") return ok();

  // What this actor may touch: which roles, and which branches (null = every branch).
  let allowedRoles, allowedBranches;
  if (role === "admin") {
    allowedRoles = MANAGEABLE;
    allowedBranches = actor.scope?.allBranches ? null : ids(actor.scope?.branchIds);
  } else {
    const grant = grants.find((g) => g.action === action);
    if (!grant) return deny(403, "NEEDS_DELEGATION", "A Branch Head can only do this with an explicit delegation from a Super Admin.");
    allowedRoles = ids(grant.roles).filter((r) => ORDINARY_STAFF.includes(r)); // never privileged roles
    const mine = actor.scope?.allBranches ? null : ids(actor.scope?.branchIds);
    const granted = ids(grant.branch_ids);
    allowedBranches = mine === null ? granted : granted.filter((b) => mine.includes(b));
  }

  const requestedBranches = ids(requested.branchIds);
  if (!inside(requestedBranches, allowedBranches)) return deny(403, "OUT_OF_SCOPE", "You can only assign branches you manage.");

  if (action === "staff.create") {
    if (!allowedRoles.includes(requested.role)) return PRIVILEGED.includes(requested.role) ? NOT_PRIVILEGED("Creating this role") : deny(403, "ROLE_NOT_ALLOWED", "You cannot create that role.");
    return ok();
  }

  // Existing accounts: judge the target as it is now.
  const current = target.role || "student";
  if (PRIVILEGED.includes(current)) return NOT_PRIVILEGED("Managing this account");
  if (!allowedRoles.includes(current)) return deny(403, "ROLE_NOT_ALLOWED", "You cannot manage that kind of account.");

  if (action === "staff.role.change" && !allowedRoles.includes(requested.role)) {
    return PRIVILEGED.includes(requested.role) ? NOT_PRIVILEGED("Granting this role") : deny(403, "ROLE_NOT_ALLOWED", "You cannot assign that role.");
  }
  if (action === "staff.branches.change" && !ORDINARY_STAFF.includes(current)) {
    return deny(403, "ROLE_NOT_ALLOWED", "Branches can only be assigned to employees.");
  }

  // The complete scope the change affects: memberships, home branch and, for students, their lead's branch.
  const affected = ids([...(target.branchIds || []), ...(target.leadBranchIds || [])]);
  if (allowedBranches !== null) {
    if (!affected.length) {
      // A pending employee (no branch yet) can be completed by an admin; a student with no branch cannot be judged.
      if (!ORDINARY_STAFF.includes(current)) return OUT_OF_SCOPE;
    } else if (!inside(affected, allowedBranches)) {
      return deny(403, "OUT_OF_SCOPE", "This person also belongs to a branch you do not manage, so you cannot change them.");
    }
  }
  return ok();
}