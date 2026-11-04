// ACCESS-03C: who may issue which delegation grant. Pure: no database, no Express.
//
// Chain of authority (nothing combines, nothing passes onward):
//   Super Admin --grants.manage--> Admin --staff.create--> Branch Head
//   Super Admin ------------------staff.create-----------> Branch Head   (directly)
//
// Rules:
//  - A grant names ONE action, a set of ordinary employee roles and a set of branches. Never Admin,
//    Branch Head or Super Admin as a role.
//  - Nobody grants to themselves.
//  - staff.create goes to a Branch Head, grants.manage to an Admin, and the grant's branches must be
//    branches the grantee actually works in.
//  - Only a Super Admin issues grants.manage. An Admin issues staff.create only, and only inside ONE
//    of their own grants.manage grants that fully covers the roles and the branches (grants are never
//    added together), inside their own branches, and never beyond that grant's expiry.
//  - A Branch Head, or anyone else, issues nothing.

import { ORDINARY_STAFF } from "./accessPolicy.mjs";

export const GRANT_ACTIONS = ["staff.create", "grants.manage"];
const GRANTEE_ROLE = { "staff.create": "branch_head", "grants.manage": "admin" };

const deny = (status, code, error) => ({ ok: false, status, code, error });
const ids = (list) => [...new Set((list || []).map(String).filter(Boolean))];
const within = (list, allowed) => list.every((x) => allowed.includes(x));
const time = (value) => (value == null || value === "" ? null : new Date(value).getTime());

/** Is this grant usable right now (not revoked, not expired)? Parent-chain checks belong to the loader. */
export function grantIsLive(grant, now = Date.now()) {
  if (!grant || grant.revoked_at) return false;
  const end = time(grant.expires_at);
  return end === null || (Number.isFinite(end) && end > now);
}

/**
 * actor:        { id, role, branchIds }   branchIds = the actor's canonical memberships read from SQL.
 *                An Admin's delegation power is bounded by THESE, whatever the rollout switch says:
 *                scope.allBranches (Admin unrestricted while ADMIN_SCOPE_ENFORCED is off) is never consulted.
 * grantee:      { id, role, branchIds }                 (loaded from SQL)
 * requested:    { action, roles, branchIds, reason, expiresAt? }
 * parentGrants: the actor's own grants.manage grants     (loaded from SQL)
 * Returns { ok:true, parentGrantId, expiresAt } or { ok:false, status, code, error }.
 */
export function decideGrantIssue({ actor, grantee, requested = {}, parentGrants = [], now = Date.now() }) {
  const action = requested.action;
  if (!GRANT_ACTIONS.includes(action)) return deny(400, "UNKNOWN_ACTION", "Unknown grant type.");

  const reason = String(requested.reason ?? "").trim();
  if (!reason) return deny(400, "REASON_REQUIRED", "Say why this authority is being granted.");
  if (reason.length > 500) return deny(400, "REASON_TOO_LONG", "The reason is limited to 500 characters.");

  const roles = ids(requested.roles);
  const branchIds = ids(requested.branchIds);
  if (!roles.length) return deny(400, "NO_ROLES", "Choose at least one role.");
  if (!branchIds.length) return deny(400, "NO_BRANCHES", "Choose at least one branch.");
  if (!within(roles, ORDINARY_STAFF)) return deny(403, "ROLE_NOT_GRANTABLE", "Only Counselor, Telecaller and Accountant can be delegated.");

  let expiresAt = null;
  if (requested.expiresAt != null && requested.expiresAt !== "") {
    expiresAt = time(requested.expiresAt);
    if (!Number.isFinite(expiresAt) || expiresAt <= now) return deny(400, "BAD_EXPIRY", "The expiry must be a date in the future.");
  }

  if (!actor?.id || !grantee?.id) return deny(400, "UNKNOWN_PERSON", "Both people must exist.");
  if (String(actor.id) === String(grantee.id)) return deny(403, "SELF_GRANT", "You cannot grant authority to yourself.");
  if (grantee.role !== GRANTEE_ROLE[action]) {
    return deny(403, "WRONG_GRANTEE_ROLE", action === "staff.create" ? "Creation grants go to a Branch Head." : "Grant-management authority goes to an Admin.");
  }
  if (!within(branchIds, ids(grantee.branchIds))) return deny(403, "GRANTEE_OUT_OF_SCOPE", "That person does not work in all of those branches.");

  if (actor.role === "super_admin") return { ok: true, parentGrantId: null, reason, expiresAt: expiresAt === null ? null : new Date(expiresAt).toISOString() };

  if (actor.role !== "admin") return deny(403, "FORBIDDEN", "You cannot issue delegations.");
  if (action !== "staff.create") return deny(403, "NEEDS_HIGHER_AUTHORITY", "Only a Super Admin can give grant-management authority.");
  // Always the Admin's own memberships. A missing list means no branches, never every branch.
  if (!within(branchIds, ids(actor.branchIds))) {
    return deny(403, "OUT_OF_SCOPE", "You can only delegate inside the branches you manage.");
  }

  // ONE parent grant must cover everything asked for; several grants are never added together.
  const parent = (parentGrants || []).find((g) =>
    g.action === "grants.manage" &&
    g.grantee_id != null && String(g.grantee_id) === String(actor.id) &&   // must name THIS Admin exactly
    grantIsLive(g, now) &&
    within(roles, ids(g.roles)) &&
    within(branchIds, ids(g.branch_ids)));
  if (!parent) return deny(403, "NEEDS_DELEGATION", "You have no grant-management authority covering those roles and branches.");

  // The child never outlives its parent.
  const parentEnd = time(parent.expires_at);
  if (parentEnd !== null) expiresAt = expiresAt === null ? parentEnd : Math.min(expiresAt, parentEnd);
  return { ok: true, parentGrantId: parent.id, reason, expiresAt: expiresAt === null ? null : new Date(expiresAt).toISOString() };
}
