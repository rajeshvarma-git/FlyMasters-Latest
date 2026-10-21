import { jsonTable } from "./db.mjs";
import { isStaffOnlyDocumentType, staffOnlyDocumentTypes, studentForTargeting } from "./documentTargeting.mjs";

/**
 * Server-side helpers for "Staff only (students don't see it)" documents.
 * The rule itself lives in documentTargeting.mjs; these load the data it
 * needs, so every route that could hand a staff-only document to a student
 * asks the same question the same way.
 */

export const typeKey = (value) => String(value || "").trim().toLowerCase();

/** Lower-cased names of the document types that are staff-only for this student (a lead row). */
export async function staffOnlyTypesForStudent(student, extraIds = []) {
  const items = await jsonTable("document_checklists").catch(() => []);
  if (!items.some((item) => item?.staff_only)) return new Set();
  return staffOnlyDocumentTypes(items, studentForTargeting(student, extraIds));
}

/**
 * Same question for a student known only by id (a user id or a lead id). The
 * lead is looked up when it can be found; when it cannot, the answer errs on
 * the side of "staff only" (the sibling-document exception needs the lead).
 */
export async function staffOnlyForStudentRef(studentRef, documentType) {
  const ref = String(studentRef || "");
  const [items, leads] = await Promise.all([
    jsonTable("document_checklists").catch(() => []),
    jsonTable("student_leads").catch(() => []),
  ]);
  if (!items.some((item) => item?.staff_only)) return false;
  const lead = leads.find((row) => String(row.id) === ref || String(row.user_id) === ref) || { id: ref, user_id: ref };
  return isStaffOnlyDocumentType(items, studentForTargeting(lead), documentType);
}
