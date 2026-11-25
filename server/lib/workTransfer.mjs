/**
 * Moving one employee's work to a colleague in the SAME branch (CRM brief 2.4.1 and 3.2).
 *
 * Two kinds of work:
 *  - "telecalling": open leads where the employee is the telecalling person. The new owner may be a
 *    Telecaller, or a Counselor (counselors can be given telecalling work).
 *  - "counseling": converted students the employee counsels. The new owner must be a Counselor.
 *
 * Rules, all enforced here so no screen can skip them:
 *  - the two people must share a branch, and every record moved must belong to a branch the new owner
 *    works in; anything else is skipped with a reason, never moved across branches;
 *  - records with no branch on file are skipped (moving them would decide their branch by accident);
 *  - the new owner must be active and must not be the same person;
 *  - a reason is required and kept on every moved record's history;
 *  - only records the employee actually owns can be moved, even if other ids are sent.
 *
 * This module only decides. The route applies the moves through the normal assignment path, so chat
 * threads, alerts and the audit trail behave exactly as for a single reassignment.
 */

export const TRANSFER_KINDS = ["telecalling", "counseling"];
export const MAX_REASON = 500;

const str = (v) => (v == null ? "" : String(v));
const isConverted = (lead) => lead?.entity_type === "student" || lead?.lead_status === "converted";

const fail = (status, code, error) => ({ ok: false, status, code, error });

/**
 * @param {object} input
 * @param {"telecalling"|"counseling"} input.kind
 * @param {{id:string, keys:string[], branchIds:string[], name?:string}} input.from  keys: every id this
 *        person's records may carry (login id, counselor row id).
 * @param {{id:string, role:string, isActive:boolean, branchIds:string[], name?:string}} input.to
 * @param {object[]} input.leads  all lead records visible to the caller
 * @param {string[]|null} input.leadIds  only these (null or empty = all of this person's work)
 * @param {string} input.reason
 */
export function planWorkTransfer({ kind, from, to, leads, leadIds, reason }) {
  if (!TRANSFER_KINDS.includes(kind)) return fail(400, "BAD_KIND", "Choose leads or students to transfer.");
  const why = str(reason).trim();
  if (!why) return fail(400, "REASON_REQUIRED", "Say why this work is being transferred.");
  if (why.length > MAX_REASON) return fail(400, "REASON_TOO_LONG", `The reason is limited to ${MAX_REASON} characters.`);
  if (!from?.id) return fail(404, "NOT_FOUND", "That employee could not be found.");
  if (!to?.id) return fail(400, "NO_TARGET", "Choose who should receive the work.");

  const fromKeys = new Set([from.id, ...(from.keys || [])].map(str).filter(Boolean));
  if (fromKeys.has(str(to.id))) return fail(400, "SAME_PERSON", "Choose a different person to receive the work.");
  if (to.isActive === false) return fail(400, "TARGET_INACTIVE", "That person's access is suspended. Choose an active colleague.");

  const okRole = kind === "counseling" ? to.role === "counselor" : to.role === "telecaller" || to.role === "counselor";
  if (!okRole) {
    return fail(400, "WRONG_ROLE", kind === "counseling"
      ? "Students can only be transferred to a Counselor."
      : "Leads can only be transferred to a Telecaller or a Counselor.");
  }

  const toBranches = new Set((to.branchIds || []).map(str));
  const shared = (from.branchIds || []).map(str).filter((b) => toBranches.has(b));
  if (!shared.length) {
    return fail(403, "CROSS_BRANCH", "These two people do not work in the same branch. Work can only move between colleagues in one branch.");
  }

  const owns = (lead) => kind === "counseling"
    ? isConverted(lead) && fromKeys.has(str(lead.assigned_counselor_id))
    : !isConverted(lead) && fromKeys.has(str(lead.assigned_telecaller_id));

  const theirs = (leads || []).filter(owns);
  const wanted = leadIds && leadIds.length ? new Set(leadIds.map(str)) : null;

  const move = [];
  const skipped = [];
  if (wanted) {
    const owned = new Set(theirs.map((l) => str(l.id)));
    for (const id of wanted) if (!owned.has(id)) skipped.push({ id, reason: "not_theirs" });
  }
  for (const lead of theirs) {
    if (wanted && !wanted.has(str(lead.id))) continue;
    if (!lead.branch_id) { skipped.push({ id: str(lead.id), reason: "no_branch" }); continue; }
    if (!toBranches.has(str(lead.branch_id))) { skipped.push({ id: str(lead.id), reason: "other_branch" }); continue; }
    move.push(lead);
  }
  return { ok: true, kind, reason: why, move, skipped, sharedBranchIds: shared };
}

/** Words for each skip reason, for the screen. */
export const SKIP_REASONS = {
  not_theirs: "Not assigned to this employee",
  no_branch: "Has no branch on file. Set its branch first.",
  other_branch: "Belongs to a branch the new owner does not work in",
};
