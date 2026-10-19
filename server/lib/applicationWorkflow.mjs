import crypto from "crypto";
import { checkTransition, STUDENT_WITHDRAWABLE, universitySubmitted } from "../../src/shared/applicationJourney.ts";

export { STUDENT_WITHDRAWABLE, universitySubmitted };

const OPEN_APPLICATION_STATUSES = new Set([
  "draft", "in_progress", "pending_counselor", "counselor_approved", "returned", "submitted", "waitlisted",
]);

export function applicationKey(value) {
  return String(value || "").trim().toLowerCase();
}

/**
 * One active application per student and university.  A shortlist id is the
 * strongest identity; self-started applications fall back to the university.
 * This is deliberately data-only so the route and its tests use the same
 * duplicate rule.
 */
export function findExistingOpenApplication(applications, { userId, shortlistId, universityId, universityName }) {
  const wantedUniversityId = String(universityId || "");
  const wantedName = applicationKey(universityName);
  return (applications || []).find((application) => {
    if (String(application.user_id || "") !== String(userId || "")) return false;
    if (!OPEN_APPLICATION_STATUSES.has(String(application.status || "draft"))) return false;
    if (shortlistId && String(application.shortlist_id || "") === String(shortlistId)) return true;
    if (wantedUniversityId && String(application.university_id || "") === wantedUniversityId) return true;
    return Boolean(wantedName && applicationKey(application.university_name) === wantedName);
  }) || null;
}

export function counselorCanViewApplication(application, assignedStudentIds) {
  return Boolean(application?.user_id && assignedStudentIds?.has(String(application.user_id)));
}

export function applicationNotificationId(applicationId, recipientId) {
  return `application-started:${String(applicationId)}:${String(recipientId)}`;
}

/** Stable id makes simultaneous browser retries converge on one row at the DB. */
export function applicationIdFor({ userId, shortlistId, universityId, universityName }) {
  const identity = shortlistId
    ? `shortlist:${String(shortlistId)}`
    : `university:${String(universityId || "")}:${applicationKey(universityName)}`;
  return `application-${crypto.createHash("sha256").update(`${String(userId)}:${identity}`).digest("hex").slice(0, 32)}`;
}

/** Keep the shortlist as a denormalized, refresh-safe summary of its linked application. */
export function shortlistApplicationPatch(shortlist, application, updatedAt) {
  return {
    ...shortlist,
    status: "applied",
    application_id: String(application.id),
    application_status: String(application.status || "in_progress"),
    updated_at: updatedAt,
  };
}

/**
 * Prefer the canonical relationship. Older rows without it can be recovered
 * only through the stable university id; display-name matching is never used.
 */
export function applicationForShortlist(applications, shortlist) {
  const direct = (applications || []).find((application) =>
    (shortlist?.application_id && String(application.id) === String(shortlist.application_id))
    || (shortlist?.id && String(application.shortlist_id || "") === String(shortlist.id)));
  if (direct) return direct;
  const universityId = String(shortlist?.university_id || "");
  if (!universityId) return null;
  const matches = (applications || []).filter((application) => String(application.university_id || "") === universityId);
  if (matches.length !== 1) return null;
  return matches[0];
}

/**
 * Events live in `application_status_updates` (the table the admin shortlist
 * screen already writes status updates to). `student_id` is the owner column
 * the student data policy reads, so a student sees exactly their own events.
 */
export function applicationEventId(applicationId, key) {
  return `appevt-${crypto.createHash("sha1").update(`${String(applicationId)}:${String(key)}`).digest("hex").slice(0, 32)}`;
}

export function buildApplicationEvent({
  application, fromStatus = null, status, type = "status", note = "", actor, at,
  nextAction = "", documentsRequired = [], deadline = null, visible = true, key = null,
}) {
  return {
    id: key ? applicationEventId(application.id, key) : crypto.randomUUID(),
    application_id: String(application.id),
    shortlist_id: application.shortlist_id ? String(application.shortlist_id) : null,
    student_id: String(application.user_id),
    event_type: type,
    from_status: fromStatus,
    status,
    notes: String(note || ""),
    next_action_required: String(nextAction || ""),
    documents_required: Array.isArray(documentsRequired) ? documentsRequired.map(String) : [],
    deadline_date: deadline || null,
    is_visible_to_student: visible !== false,
    updated_by: actor?.id ? String(actor.id) : null,
    updated_by_role: actor?.role || "system",
    updated_by_name: actor?.name || "",
    updated_at: at,
    created_at: at,
  };
}

/**
 * Apply a counselor/admin status change to an application row.  Returns
 * { error } when the rule refuses it.  The first recorded submission stamps
 * submitted_at/submitted_by; internal approval never does.
 */
export function applyApplicationStatus(application, status, { comments = "", actor, at }) {
  const check = checkTransition(application, status);
  if (!check.ok) return { error: check.error };
  const next = {
    ...application,
    status,
    counselor_comments: comments,
    reviewed_by: actor?.id ? String(actor.id) : application.reviewed_by || null,
    reviewed_at: at,
    status_changed_at: status === application.status ? application.status_changed_at || at : at,
    updated_at: at,
  };
  if (status === "submitted_to_university" && !application.submitted_at) {
    next.submitted_at = at;
    next.submitted_by = actor?.id ? String(actor.id) : null;
  }
  return { next };
}
