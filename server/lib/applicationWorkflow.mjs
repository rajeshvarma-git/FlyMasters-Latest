import crypto from "crypto";

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
