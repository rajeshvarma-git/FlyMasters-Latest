import crypto from "crypto";
import { jsonTable, jsonUpsert } from "./db.mjs";
import { isStaffOnlyDocumentType, studentForTargeting } from "./documentTargeting.mjs";

/**
 * Who may upload documents, and which ones.
 *
 * A student starts with NO permission to upload anything. The counsellor must
 * first review the student's profile and then explicitly authorise uploads —
 * for every applicable document ("all") or for chosen document types
 * ("selected"). The authorisation is stored in the JSON table
 * `student_document_upload_authorizations`, one row per student.
 *
 * It is deliberately separate from the country-wise approval
 * (lib/countryDocumentApproval.mjs): approving the country-wise common
 * documents makes that group *visible*, it never grants the right to upload.
 *
 * A staff-only document ("Hidden from students") is never uploadable by a
 * student, whatever else they have been allowed: not under "all", not when
 * listed under "selected", not through a request. That check comes first.
 *
 * Two other counsellor actions are already explicit and per-student, so they
 * also let the student upload exactly the document they name, and nothing more:
 *   - a document request the counsellor sent (`document_requests`, still open)
 *   - a document aimed at named students (`document_checklists.student_ids`)
 */

export const UPLOAD_AUTHORIZATION_TABLE = "student_document_upload_authorizations";

const norm = (value) => String(value || "").trim().toLowerCase();
const CLOSED_REQUEST = new Set(["approved", "cancelled", "canceled", "completed", "closed"]);

export function studentIds(student, extra = []) {
  return new Set([student?.id, student?.user_id, student?.lead_id, ...extra].filter(Boolean).map(String));
}

function rowFor(rows, student, extra) {
  const ids = studentIds(student, extra);
  return rows.find((row) => ids.has(String(row.student_id || "")) || ids.has(String(row.lead_id || ""))) || null;
}

export async function documentUploadAuthorization(student, extraIds = []) {
  const rows = await jsonTable(UPLOAD_AUTHORIZATION_TABLE).catch(() => []);
  return rowFor(rows, student, extraIds);
}

/**
 * @param documentTypes  null/undefined → every applicable document ("all");
 *                       a list → only those document types ("selected").
 */
export async function setDocumentUploadAuthorization(student, { enabled, documentTypes }, authorizedBy) {
  const existing = await documentUploadAuthorization(student);
  const now = new Date().toISOString();
  const types = Array.isArray(documentTypes)
    ? [...new Set(documentTypes.map((item) => String(item || "").trim()).filter(Boolean))]
    : null;
  const row = {
    ...(existing || {}),
    id: existing?.id || crypto.randomUUID(),
    student_id: String(student?.user_id || student?.id || ""),
    lead_id: student?.id && student?.user_id ? String(student.id) : existing?.lead_id || null,
    enabled: Boolean(enabled),
    scope: enabled && types && types.length ? "selected" : "all",
    document_types: enabled && types && types.length ? types : [],
    authorized_by: String(authorizedBy || ""),
    authorized_at: enabled ? now : existing?.authorized_at || null,
    updated_at: now,
    created_at: existing?.created_at || now,
  };
  await jsonUpsert(UPLOAD_AUTHORIZATION_TABLE, row);
  return row;
}

/**
 * The single rule. Pure, so the server gate and the tests use the same code.
 *
 * @param student  optional targeting shape ({ ids, countries, ... }); needed so a
 *                 same-named ordinary document aimed at this student is recognised.
 * @returns {{ allowed: boolean, source: "authorization"|"request"|"named_document"|null, reason?: string }}
 */
export function uploadDecision({ authorization, ids, checklistItems = [], requests = [], documentType, student }) {
  const type = norm(documentType);
  if (!type) return { allowed: false, source: null, reason: "Document type is required." };
  const mine = ids instanceof Set ? ids : new Set([...(ids || [])].map(String));

  if (isStaffOnlyDocumentType(checklistItems, student || { ids: [...mine] }, documentType)) {
    return { allowed: false, source: null, reason: "This document type is not available for upload." };
  }

  const request = requests.find(
    (row) =>
      mine.has(String(row?.student_id || "")) &&
      !CLOSED_REQUEST.has(norm(row?.status)) &&
      norm(row?.document_type) === type,
  );
  if (request) return { allowed: true, source: "request" };

  const named = checklistItems.find((item) => {
    if (!item || item.staff_only || item.is_active === false || norm(item.document_type) !== type) return false;
    const targets = (Array.isArray(item.student_ids) ? item.student_ids : []).map(String);
    return targets.some((id) => mine.has(id));
  });
  if (named) return { allowed: true, source: "named_document" };

  if (authorization?.enabled === true) {
    if (authorization.scope === "selected") {
      const selected = (Array.isArray(authorization.document_types) ? authorization.document_types : []).map(norm);
      if (selected.includes(type)) return { allowed: true, source: "authorization" };
      return { allowed: false, source: null, reason: "Your counselor has not enabled uploads for this document yet." };
    }
    return { allowed: true, source: "authorization" };
  }
  return {
    allowed: false,
    source: null,
    reason: "Document uploads are not enabled yet. Your counselor must review your profile and enable them first.",
  };
}

/** Whether the student may upload anything at all (used for the storage write gate). */
export function anyUploadAllowed({ authorization, ids, checklistItems = [], requests = [] }) {
  if (authorization?.enabled === true) {
    return authorization.scope !== "selected" || (authorization.document_types || []).length > 0;
  }
  const mine = ids instanceof Set ? ids : new Set([...(ids || [])].map(String));
  if (requests.some((row) => mine.has(String(row?.student_id || "")) && !CLOSED_REQUEST.has(norm(row?.status)))) return true;
  return checklistItems.some(
    (item) =>
      item && !item.staff_only && item.is_active !== false &&
      (Array.isArray(item.student_ids) ? item.student_ids : []).some((id) => mine.has(String(id))),
  );
}

export async function canStudentUploadDocument(student, documentType, { extraIds = [] } = {}) {
  const [authorization, checklistItems, requests] = await Promise.all([
    documentUploadAuthorization(student, extraIds),
    jsonTable("document_checklists").catch(() => []),
    jsonTable("document_requests").catch(() => []),
  ]);
  return uploadDecision({
    authorization, ids: studentIds(student, extraIds), checklistItems, requests, documentType,
    student: studentForTargeting(student, extraIds),
  });
}

export async function canStudentUploadAnything(student, extraIds = []) {
  const [authorization, checklistItems, requests] = await Promise.all([
    documentUploadAuthorization(student, extraIds),
    jsonTable("document_checklists").catch(() => []),
    jsonTable("document_requests").catch(() => []),
  ]);
  return anyUploadAllowed({ authorization, ids: studentIds(student, extraIds), checklistItems, requests });
}
