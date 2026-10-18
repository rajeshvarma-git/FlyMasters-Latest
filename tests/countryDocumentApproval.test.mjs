import test from "node:test";
import assert from "node:assert/strict";
import { commonCountryDocumentsFor, isCountryWiseCommonDocument } from "../server/lib/countryDocumentApproval.mjs";

const student = { id: "student-a", user_id: "student-a", preferred_countries: ["Canada"], assigned_counselor_id: "c-1" };

test("only common country-scoped documents require counselor approval", () => {
  assert.equal(isCountryWiseCommonDocument({ countries: ["Canada"], student_ids: [], counselor_scope_ids: [] }), true);
  assert.equal(isCountryWiseCommonDocument({ countries: ["Canada"], student_ids: ["student-a"] }), false);
  assert.equal(isCountryWiseCommonDocument({ countries: ["Canada"], counselor_scope_ids: ["c-1"] }), true);
  assert.equal(isCountryWiseCommonDocument({ countries: ["All"] }), false);
});

test("country approval candidates remain isolated to the intended student's country", () => {
  const items = [
    { id: "ca", document_type: "Passport", countries: ["Canada"] },
    { id: "au", document_type: "Visa form", countries: ["Australia"] },
    { id: "named", document_type: "Transcript", countries: ["Canada"], student_ids: ["student-a"] },
  ];
  assert.deepEqual(commonCountryDocumentsFor(student, items).map((item) => item.id), ["ca"]);
});
