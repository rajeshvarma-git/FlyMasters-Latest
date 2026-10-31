// ACCESS-03B: branch checks for routes that act on a person or a lead by id.
//
// Rule everywhere: a caller whose scope is unrestricted (Super Admin, or Admin while the rollout
// switch is off) passes without any lookup. A branch-limited caller needs EVERY branch of the
// target inside their own branches; a target whose branch cannot be determined is refused, never
// guessed. Facts come from SQL only. Results are { ok:true } or { ok:false, status, code, error }.
import { loadAccountTarget } from "./accountTargets.mjs";

const ids = (list) => [...new Set((list || []).map(String).filter(Boolean))];
const deny = (code, error, status = 403) => ({ ok: false, status, code, error });
const OUT = (what) => deny("OUT_OF_SCOPE", `${what} is outside the branches you manage.`);

export const branchInScope = (scope, branchId) =>
  Boolean(scope?.allBranches) || (branchId != null && branchId !== "" && ids(scope?.branchIds).includes(String(branchId)));

export const allInScope = (scope, branchIds) =>
  Boolean(scope?.allBranches) || (ids(branchIds).length > 0 && ids(branchIds).every((b) => branchInScope(scope, b)));

/** Resolves a staff id that may be an account id or a counselor profile id to the account id. */
export async function staffAuthId(db, id) {
  const direct = await db.query("SELECT id FROM auth_users WHERE id::text = $1", [String(id)]);
  if (direct.rows[0]) return String(direct.rows[0].id);
  const viaProfile = await db.query(
    "SELECT a.id FROM counselor_users c JOIN auth_users a ON lower(a.email) = lower(c.email) WHERE c.id::text = $1 LIMIT 1",
    [String(id)],
  );
  return viaProfile.rows[0] ? String(viaProfile.rows[0].id) : null;
}

/** The person (counselor, telecaller...) must belong only to branches the caller manages. */
export async function checkStaffInScope(db, scope, id) {
  if (scope?.allBranches) return { ok: true };
  const authId = id ? await staffAuthId(db, id) : null;
  if (!authId) return deny("NOT_FOUND", "That person could not be found.", 404);
  const target = await loadAccountTarget(db, authId);
  if (!target || !allInScope(scope, target.branchIds)) return OUT("That person");
  return { ok: true };
}

/** The lead's own branch must be one the caller manages. */
export async function checkLeadInScope(db, scope, leadId) {
  if (scope?.allBranches) return { ok: true };
  const row = await db.query("SELECT branch_id FROM app_records WHERE table_name = 'student_leads' AND id::text = $1", [String(leadId)]);
  if (!row.rows[0]) return deny("NOT_FOUND", "That lead could not be found.", 404);
  return branchInScope(scope, row.rows[0].branch_id) ? { ok: true } : OUT("That lead");
}

/** Express glue: sends the refusal itself and returns false, or returns true. */
export async function allow(res, pending) {
  let result;
  try {
    result = await pending;
  } catch (error) {
    res.status(500).json({ error: error.message || "Could not check permissions" });
    return false;
  }
  if (result.ok) return true;
  res.status(result.status).json({ error: result.error, code: result.code });
  return false;
}