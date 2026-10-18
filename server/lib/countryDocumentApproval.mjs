import crypto from "crypto";
import { jsonTable, jsonUpsert } from "./db.mjs";
import { documentAppliesToStudent, documentCountries, studentForTargeting } from "./documentTargeting.mjs";

// A country-wise common document is deliberately distinct from a document
// assigned to named students. A counsellor-scoped country requirement is still
// common to that counsellor's students, so it also waits for explicit approval.
export function isCountryWiseCommonDocument(item) {
  const ids = Array.isArray(item?.student_ids) ? item.student_ids : [];
  return !item?.staff_only && !ids.length && documentCountries(item).length > 0;
}

function idsFor(student) {
  return new Set([student?.id, student?.user_id, student?.lead_id].filter(Boolean).map(String));
}

function approvalFor(rows, student) {
  const ids = idsFor(student);
  return rows.find((row) => ids.has(String(row.student_id || "")) || ids.has(String(row.lead_id || "")));
}

export async function countryDocumentsEnabled(student) {
  const rows = await jsonTable("student_country_document_approvals").catch(() => []);
  return Boolean(approvalFor(rows, student)?.enabled === true);
}

export async function countryDocumentApproval(student) {
  const rows = await jsonTable("student_country_document_approvals").catch(() => []);
  return approvalFor(rows, student) || null;
}

export function commonCountryDocumentsFor(student, items) {
  const target = studentForTargeting(student);
  return items.filter((item) => isCountryWiseCommonDocument(item) && documentAppliesToStudent(item, target));
}

export async function canStudentUseCountryDocument(student, documentType, items) {
  const relevant = commonCountryDocumentsFor(student, items).some(
    (item) => String(item.document_type || "").trim().toLowerCase() === String(documentType || "").trim().toLowerCase(),
  );
  return !relevant || countryDocumentsEnabled(student);
}

export async function setCountryDocumentsEnabled(student, enabled, approvedBy) {
  const existing = await countryDocumentApproval(student);
  const now = new Date().toISOString();
  const row = {
    ...(existing || {}),
    id: existing?.id || crypto.randomUUID(),
    student_id: String(student?.user_id || student?.id || ""),
    lead_id: student?.id && student?.user_id ? String(student.id) : existing?.lead_id || null,
    enabled: Boolean(enabled),
    approved_by: String(approvedBy || ""),
    approved_at: enabled ? now : null,
    updated_at: now,
    created_at: existing?.created_at || now,
  };
  await jsonUpsert("student_country_document_approvals", row);
  return row;
}
