import test from "node:test";
import assert from "node:assert/strict";
import { anyUploadAllowed, uploadDecision } from "../server/lib/documentUploadAuthorization.mjs";

const ids = new Set(["student-a", "lead-a"]);
const base = { ids, checklistItems: [], requests: [] };

test("a new student with no authorization may upload nothing", () => {
  const decision = uploadDecision({ ...base, authorization: null, documentType: "Passport" });
  assert.equal(decision.allowed, false);
  assert.match(decision.reason, /not enabled/i);
  assert.equal(anyUploadAllowed({ ...base, authorization: null }), false);
});

test("a disabled authorization is the same as none", () => {
  const authorization = { enabled: false, scope: "all", document_types: [] };
  assert.equal(uploadDecision({ ...base, authorization, documentType: "Passport" }).allowed, false);
  assert.equal(anyUploadAllowed({ ...base, authorization }), false);
});

test("approving the country-wise common documents does not grant upload permission", () => {
  // The country approval is a different table; with no upload authorization nothing is allowed,
  // whatever country-wise documents exist for the student.
  const checklistItems = [{ id: "ca", document_type: "Academic transcripts", countries: ["Canada"], student_ids: [] }];
  assert.equal(uploadDecision({ ...base, checklistItems, authorization: null, documentType: "Academic transcripts" }).allowed, false);
});

test("'all' authorization allows any document type, case-insensitively", () => {
  const authorization = { enabled: true, scope: "all", document_types: [] };
  assert.equal(uploadDecision({ ...base, authorization, documentType: "passport" }).allowed, true);
  assert.equal(anyUploadAllowed({ ...base, authorization }), true);
});

test("'selected' authorization allows only the chosen types", () => {
  const authorization = { enabled: true, scope: "selected", document_types: ["Passport"] };
  assert.equal(uploadDecision({ ...base, authorization, documentType: " PASSPORT " }).allowed, true);
  const other = uploadDecision({ ...base, authorization, documentType: "Bank statement" });
  assert.equal(other.allowed, false);
  assert.match(other.reason, /not enabled uploads for this document/i);
});

test("a counselor's open document request allows exactly that document", () => {
  const requests = [{ id: "r1", student_id: "student-a", document_type: "Bank statement", status: "pending" }];
  assert.equal(uploadDecision({ ...base, requests, authorization: null, documentType: "Bank statement" }).allowed, true);
  assert.equal(uploadDecision({ ...base, requests, authorization: null, documentType: "Passport" }).allowed, false);
  assert.equal(anyUploadAllowed({ ...base, requests, authorization: null }), true);
});

test("a closed request or another student's request allows nothing", () => {
  const closed = [{ id: "r1", student_id: "student-a", document_type: "Bank statement", status: "approved" }];
  const other = [{ id: "r2", student_id: "student-b", document_type: "Bank statement", status: "pending" }];
  assert.equal(uploadDecision({ ...base, requests: closed, authorization: null, documentType: "Bank statement" }).allowed, false);
  assert.equal(uploadDecision({ ...base, requests: other, authorization: null, documentType: "Bank statement" }).allowed, false);
  assert.equal(anyUploadAllowed({ ...base, requests: [...closed, ...other], authorization: null }), false);
});

test("a document aimed at named students allows only those students, only that document", () => {
  const checklistItems = [
    { id: "n1", document_type: "English test score", student_ids: ["lead-a"] },
    { id: "n2", document_type: "Visa form", student_ids: ["student-z"] },
    { id: "n3", document_type: "Staff note", student_ids: ["student-a"], staff_only: true },
  ];
  assert.equal(uploadDecision({ ...base, checklistItems, authorization: null, documentType: "English test score" }).allowed, true);
  assert.equal(uploadDecision({ ...base, checklistItems, authorization: null, documentType: "Visa form" }).allowed, false);
  assert.equal(uploadDecision({ ...base, checklistItems, authorization: null, documentType: "Staff note" }).allowed, false);
  assert.equal(uploadDecision({ ...base, checklistItems, authorization: null, documentType: "Passport" }).allowed, false);
});

test("an empty document type is never allowed", () => {
  const authorization = { enabled: true, scope: "all", document_types: [] };
  assert.equal(uploadDecision({ ...base, authorization, documentType: "" }).allowed, false);
});
