// Role-change authorization (ACCESS-01A).
//
// Kept free of Express and the database so the rules can be tested directly:
// the route hands in a `store`, and a denied request never touches it.

export const ASSIGNABLE_ROLES = ["student", "telecaller", "counselor", "admin", "super_admin"];

const deny = (status, error) => ({ ok: false, status, error });

/**
 * Decide whether `actor` may set `targetId` to `newRole`.
 * Pure: no reads, no writes.
 */
export function decideRoleChange({ actor, targetId, newRole, currentRole }) {
  if (!ASSIGNABLE_ROLES.includes(newRole)) return deny(400, "Invalid role.");

  // Nobody changes their own role: it locks admins out and is a promotion path.
  if (String(targetId) === String(actor.id)) return deny(400, "You cannot change your own role.");

  // Only a super admin may grant the super admin role.
  if (newRole === "super_admin" && actor.role !== "super_admin") {
    return deny(403, "Only a super admin can grant the Super Admin role.");
  }

  // Only a super admin may change an existing super admin's role.
  if (currentRole === "super_admin" && actor.role !== "super_admin") {
    return deny(403, "Only a super admin can change a Super Admin account's role.");
  }

  return { ok: true };
}

/**
 * Check, then write. `store` supplies the three side effects:
 *   getRole(targetId) -> current role row or null
 *   setRole(targetId, role, existingRow?) -> persists the role
 *   audit(details) -> best-effort audit record
 * Nothing in `store` is called for a denied request except the read.
 */
export async function applyRoleChange({ actor, targetId, newRole, store }) {
  const early = decideRoleChange({ actor, targetId, newRole, currentRole: null });
  // Reject on request-only rules before reading anything.
  if (!early.ok) return early;

  const current = await store.getRole(targetId);
  const decision = decideRoleChange({ actor, targetId, newRole, currentRole: current?.role ?? null });
  if (!decision.ok) return decision;

  await store.setRole(targetId, newRole, current);
  await store.audit({ previousRole: current?.role ?? null, newRole });
  return { ok: true, previousRole: current?.role ?? null };
}