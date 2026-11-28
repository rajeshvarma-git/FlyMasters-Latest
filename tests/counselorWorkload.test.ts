import test from "node:test";
import assert from "node:assert/strict";
import { counselingStudents, telecallingConversionRate, telecallingLeads } from "../src/portals/counselor/lib/workload";
import { telecallerChoices } from "../src/portals/admin/lib/telecallerChoices";

const ME = "c-1";
const leads = [
  { id: "1", user_id: "s1", assigned_counselor_id: ME, entity_type: "student" },                       // I counsel
  { id: "2", user_id: "s2", assigned_telecaller_id: ME, lead_status: "converted" },                    // I only called; waiting for a counselor
  { id: "3", user_id: "s3", assigned_telecaller_id: ME, assigned_counselor_id: "c-2", lead_status: "converted" }, // I called, a colleague counsels
  { id: "4", user_id: "s4", assigned_telecaller_id: ME, lead_status: "warm" },                         // open lead I am calling
  { id: "5", user_id: "s1", assigned_counselor_id: ME, entity_type: "student" },                       // duplicate of 1
];

test("the dashboard's My students counts exactly what My Students lists", () => {
  const students = counselingStudents(leads, ME);
  assert.deepEqual(students.map((l) => l.id), ["1"], "a student this counselor only telecalled was counted as theirs");
});

test("telecalling leads are the open leads assigned to them for calling", () => {
  assert.deepEqual(telecallingLeads(leads, ME).map((l) => l.id), ["4"]);
});

test("conversion rate is measured on the leads they telecalled", () => {
  assert.equal(telecallingConversionRate(leads, ME), 67); // 2 of 3 called leads converted
  assert.equal(telecallingConversionRate(leads, "nobody"), 0);
  assert.equal(counselingStudents(leads, null).length, 0);
});

test("the telecaller picker offers only people from the lead's branch, and always keeps the current one", () => {
  const people = [
    { id: "t-a", first_name: "A", branch_ids: ["ameerpet"] },
    { id: "t-k", first_name: "K", branch_ids: ["kompally"] },
    { id: "c-a", first_name: "C", branch_ids: ["ameerpet"], can_telecall: true },
    { id: "t-old", first_name: "Old" },
  ] as any[];
  const ids = (rows: any[]) => rows.map((r) => r.id);
  assert.deepEqual(ids(telecallerChoices(people, { branch_id: "ameerpet" })), ["t-a", "c-a", "t-old"]);
  assert.deepEqual(ids(telecallerChoices(people, { branch_id: "ameerpet", assigned_telecaller_id: "t-k" })), ["t-a", "t-k", "c-a", "t-old"], "the current assignee vanished from the picker");
  assert.equal(telecallerChoices(people, { branch_id: null }).length, 4, "a lead with no branch yet should offer everyone");
});

test("a suspended person is never offered as someone to give work to, but a current holder stays visible", () => {
  const people = [
    { id: "t-on", first_name: "On", branch_ids: ["ameerpet"], is_active: true },
    { id: "t-off", first_name: "Off", branch_ids: ["ameerpet"], is_active: false },
    { id: "c-off", first_name: "Coun", branch_ids: ["ameerpet"], is_active: true, suspended: true },
  ] as any[];
  const ids = (rows: any[]) => rows.map((r) => r.id);
  assert.deepEqual(ids(telecallerChoices(people, { branch_id: "ameerpet" })), ["t-on"]);
  assert.deepEqual(ids(telecallerChoices(people, { branch_id: null })), ["t-on"], "a lead with no branch offered a suspended person");
  assert.deepEqual(ids(telecallerChoices(people, { branch_id: "ameerpet", assigned_telecaller_id: "t-off" })), ["t-on", "t-off"], "the current holder vanished from the picker");
});
