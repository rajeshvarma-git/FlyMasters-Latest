import test from "node:test";
import assert from "node:assert/strict";
import { isStaffOnlyDocumentType, staffOnlyDocumentTypes } from "../server/lib/documentTargeting.mjs";
import { uploadDecision, anyUploadAllowed } from "../server/lib/documentUploadAuthorization.mjs";

const staffOnly = { id: "dc-1", document_type: "Internal Assessment", staff_only: true, is_active: true, student_ids: ["stu-a"], audience: "students" };
const ordinary = { id: "dc-2", document_type: "Passport", staff_only: false, is_active: true, student_ids: ["stu-a"], audience: "students" };
const sameNameForB = { id: "dc-3", document_type: "Internal Assessment", staff_only: false, is_active: true, student_ids: ["stu-b"], audience: "students" };
const items = [staffOnly, ordinary, sameNameForB];
const A = { ids: ["stu-a"] };
const B = { ids: ["stu-b"] };

test("a staff-only name is staff-only for the student it is aimed at, in any spelling", () => {
  assert.equal(isStaffOnlyDocumentType(items, A, "Internal Assessment"), true);
  assert.equal(isStaffOnlyDocumentType(items, A, "  internal ASSESSMENT "), true);
  assert.equal(isStaffOnlyDocumentType(items, A, "Passport"), false);
  assert.equal(isStaffOnlyDocumentType(items, A, ""), false);
});

test("an ordinary document with the same name that applies to the student wins", () => {
  assert.equal(isStaffOnlyDocumentType(items, B, "Internal Assessment"), false);
  assert.deepEqual([...staffOnlyDocumentTypes(items, A)], ["internal assessment"]);
  assert.deepEqual([...staffOnlyDocumentTypes(items, B)], []);
});

test("an inactive ordinary sibling does not make a staff-only name visible", () => {
  const inactive = { ...sameNameForB, student_ids: ["stu-a"], is_active: false };
  assert.equal(isStaffOnlyDocumentType([staffOnly, inactive], A, "Internal Assessment"), true);
});

test("blanket upload permission never allows a staff-only type", () => {
  const authorization = { enabled: true, scope: "all", document_types: [] };
  const base = { authorization, ids: new Set(["stu-a"]), checklistItems: items, student: A };
  assert.equal(uploadDecision({ ...base, documentType: "Internal Assessment" }).allowed, false);
  assert.equal(uploadDecision({ ...base, documentType: "internal assessment " }).allowed, false);
  assert.equal(uploadDecision({ ...base, documentType: "Passport" }).allowed, true);
  assert.equal(uploadDecision({ ...base, documentType: "Something not on any list" }).allowed, true);
});

test("a selected-documents permission that lists the staff-only type does not allow it either", () => {
  const authorization = { enabled: true, scope: "selected", document_types: ["Internal Assessment", "Passport"] };
  const base = { authorization, ids: new Set(["stu-a"]), checklistItems: items, student: A };
  assert.equal(uploadDecision({ ...base, documentType: "Internal Assessment" }).allowed, false);
  assert.equal(uploadDecision({ ...base, documentType: "Passport" }).allowed, true);
});

test("an open request for a staff-only type does not allow it", () => {
  const requests = [{ student_id: "stu-a", document_type: "Internal Assessment", status: "pending" }];
  const decision = uploadDecision({ authorization: null, ids: new Set(["stu-a"]), checklistItems: items, requests, documentType: "Internal Assessment", student: A });
  assert.equal(decision.allowed, false);
});

test("the same name that is ordinary for another student is still uploadable by that student", () => {
  const decision = uploadDecision({ authorization: null, ids: new Set(["stu-b"]), checklistItems: items, documentType: "Internal Assessment", student: B });
  assert.equal(decision.allowed, true);
  assert.equal(decision.source, "named_document");
});

test("without a student shape the ids alone are used (staff-only still refused)", () => {
  const decision = uploadDecision({ authorization: { enabled: true, scope: "all" }, ids: new Set(["stu-a"]), checklistItems: items, documentType: "Internal Assessment" });
  assert.equal(decision.allowed, false);
});

test("a student whose only named document is staff-only has no upload permission from it", () => {
  assert.equal(anyUploadAllowed({ authorization: null, ids: new Set(["stu-a"]), checklistItems: [staffOnly], requests: [] }), false);
});
