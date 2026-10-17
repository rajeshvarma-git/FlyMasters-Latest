import test from "node:test";
import assert from "node:assert/strict";
import { documentAppliesToStudent, studentForTargeting, isStudentAudience } from "../server/lib/documentTargeting.mjs";

const canada = (id, extra = []) => studentForTargeting({ id: `lead-${id}`, user_id: `u-${id}`, preferred_countries: ["Canada"] }, extra);
const uk = (id) => studentForTargeting({ id: `lead-${id}`, user_id: `u-${id}`, preferred_countries: ["UK"] });

const doc = (over = {}) => ({
  id: "d1", document_type: "GIC letter", is_active: true,
  countries: ["Canada"], country: "Canada", audience: "students",
  student_ids: ["u-a", "lead-a", "u-b", "lead-b"], ...over,
});

test("Canada document aimed at two students reaches only those two", () => {
  const d = doc();
  assert.equal(documentAppliesToStudent(d, canada("a")), true);
  assert.equal(documentAppliesToStudent(d, canada("b")), true);
});

test("another Canada student does not get a student-specific document", () => {
  assert.equal(documentAppliesToStudent(doc(), canada("c")), false);
});

test("a student from another country gets it only when explicitly targeted", () => {
  assert.equal(documentAppliesToStudent(doc(), uk("d")), false);
  assert.equal(documentAppliesToStudent(doc({ student_ids: ["u-d", "lead-d"] }), uk("d")), true);
});

test("a student document that has lost all its students applies to nobody (never the whole country)", () => {
  const d = doc({ student_ids: [] });
  assert.equal(isStudentAudience(d), true);
  assert.equal(documentAppliesToStudent(d, canada("a")), false);
  assert.equal(documentAppliesToStudent(d, canada("c")), false);
});

test("existing country-wide rows (no audience, no students) behave exactly as before", () => {
  const legacy = { id: "old", document_type: "Passport", is_active: true, countries: ["Canada"], student_ids: [], counselor_scope_ids: [] };
  assert.equal(documentAppliesToStudent(legacy, canada("c")), true);
  assert.equal(documentAppliesToStudent(legacy, uk("d")), false);
  const all = { ...legacy, countries: ["All"], audience: "all" };
  assert.equal(documentAppliesToStudent(all, uk("d")), true);
});

test("staff-only and inactive documents are never asked of a student", () => {
  assert.equal(documentAppliesToStudent(doc({ staff_only: true }), canada("a")), false);
  assert.equal(documentAppliesToStudent(doc({ staff_only: true }), canada("a"), { includeStaffOnly: true }), true);
  assert.equal(documentAppliesToStudent(doc({ is_active: false }), canada("a")), false);
});
