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

/** Operations that touch every branch at once (syncs, bulk jobs) need unrestricted authority. */
export function requireGlobalScope(scope) {
  return scope?.allBranches
    ? { ok: true }
    : deny("NEEDS_HIGHER_AUTHORITY", "This runs across every branch, so it needs Super Admin.");
}

/**
 * A conversation row (WhatsApp, telecaller, student chat) is in scope when its own branch, or failing
 * that its lead's branch, is one the caller manages. Unknown branch => refused for a limited caller.
 */
export function conversationBranch(conversation, leads = []) {
  if (conversation?.branch_id) return String(conversation.branch_id);
  const lead = (leads || []).find((row) => String(row.id) === String(conversation?.lead_id));
  return lead?.branch_id ? String(lead.branch_id) : null;
}

const ASSIGNMENT_GOVERNED = new Set(["counselor", "telecaller"]);

/**
 * WhatsApp: counselors/telecallers are already limited to their own assigned chats; managers
 * (Admin, Branch Head) are limited to chats in their branches.
 */
export function managerSeesConversation(user, scope, conversation, leads = []) {
  if (scope?.allBranches || ASSIGNMENT_GOVERNED.has(user?.role)) return true;
  return branchInScope(scope, conversationBranch(conversation, leads));
}

const CONVERSATION_TABLES = {
  whatsapp: "whatsapp_conversations",
  telecaller: "telecaller_conversations",
  student: "private_conversations",
};

/** Supervision routes: the conversation (by kind and id) must sit in the caller's branches. */
export async function checkConversationInScope(db, scope, kind, id) {
  if (scope?.allBranches) return { ok: true };
  const table = CONVERSATION_TABLES[kind];
  if (!table) return deny("BAD_REQUEST", "Unknown conversation type.", 400);
  const row = await db.query(
    "SELECT branch_id FROM app_records WHERE table_name = $1 AND id::text = $2",
    [table, String(id)],
  );
  if (row.rows[0]) return branchInScope(scope, row.rows[0].branch_id) ? { ok: true } : OUT("That conversation");
  if (kind === "student") {
    const sql = await db.query("SELECT counselor_id FROM private_conversations WHERE id::text = $1", [String(id)]);
    if (sql.rows[0]) return checkStaffInScope(db, scope, sql.rows[0].counselor_id).then((r) => (r.ok ? r : OUT("That conversation")));
  }
  return deny("NOT_FOUND", "That conversation could not be found.", 404);
}

/** Escalations carry their own branch; none recorded => refused for a limited caller. */
export async function checkEscalationInScope(db, scope, id) {
  if (scope?.allBranches) return { ok: true };
  const row = await db.query("SELECT branch_id FROM chat_escalations WHERE id::text = $1", [String(id)]);
  if (!row.rows[0]) return deny("NOT_FOUND", "Escalation not found.", 404);
  return branchInScope(scope, row.rows[0].branch_id) ? { ok: true } : OUT("That escalation");
}

/** Consent subject (a student or lead id): every matching lead must be in scope. */
export async function checkSubjectInScope(db, scope, subjectId) {
  if (scope?.allBranches) return { ok: true };
  const rows = await db.query(
    "SELECT branch_id FROM app_records WHERE table_name = 'student_leads' AND (data->>'user_id' = $1 OR id::text = $1)",
    [String(subjectId)],
  );
  if (!rows.rows.length) return deny("NOT_FOUND", "That person could not be found.", 404);
  return allInScope(scope, rows.rows.map((r) => r.branch_id)) ? { ok: true } : OUT("That person");
}

const BRANCH_ROWS = { partners: "Partner", student_payments: "Payment" };

/** A row in one of the known branch-owned SQL tables: its own branch_id must be in scope. */
export async function checkRowInScope(db, scope, table, id) {
  if (scope?.allBranches) return { ok: true };
  const label = BRANCH_ROWS[table];
  if (!label) throw new Error(`checkRowInScope: unknown table ${table}`);
  const row = await db.query(`SELECT branch_id FROM ${table} WHERE id::text = $1`, [String(id)]);
  if (!row.rows[0]) return deny("NOT_FOUND", `${label} not found.`, 404);
  return branchInScope(scope, row.rows[0].branch_id) ? { ok: true } : OUT(`That ${label.toLowerCase()}`);
}

/** A leave request belongs to a counselor; that counselor must be inside the caller's branches. */
export async function checkLeaveInScope(db, scope, id) {
  if (scope?.allBranches) return { ok: true };
  const row = await db.query("SELECT counselor_id FROM counselor_leave_requests WHERE id::text = $1", [String(id)]);
  if (!row.rows[0]) return deny("NOT_FOUND", "Leave request not found.", 404);
  return checkStaffInScope(db, scope, row.rows[0].counselor_id);
}
