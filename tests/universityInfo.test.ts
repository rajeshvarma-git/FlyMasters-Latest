import test from "node:test";
import assert from "node:assert/strict";
import { fieldOfStudy, keyFacts, locationLine, overview, programTitle, tuition } from "../src/portals/student/lib/universityInfo";

const row = { course_name: "MSc Data · Data · Analytics", location: "Leeds, UK", estimated_fees: null, application_deadline: null, university_name: "U" };

test("university information never invents missing values", () => {
  assert.deepEqual(keyFacts(row, null), []);
  assert.equal(overview(null), "");
  assert.equal(tuition(row, null), "");
  assert.equal(fieldOfStudy(null), "");
});

test("falls back to what the recommendation itself holds", () => {
  assert.equal(locationLine(row, null), "Leeds, UK");
  assert.equal(programTitle(row, null), "MSc Data · Data · Analytics");
  assert.equal(tuition({ ...row, estimated_fees: 12000 }, null), "Estimated 12,000");
  assert.deepEqual(keyFacts({ ...row, application_deadline: "2027-01-15" }, null).map((f) => f.label), ["Application deadline"]);
});

test("uses the catalogue record when it was found", () => {
  const details = {
    matched_by: "id" as const,
    university: { name: "Fictional U", city: "Testville", state_province: "Ontario", country: "Canada", description: "About it", ranking: 77 },
    program: { program_name: "MSc Fictional Data", course: "Data", specialization: "Analytics", fee: "CAD 20,000", duration: "2 years", eligibility: "Degree", deadline: "1 Feb" },
    programs: [],
  };
  assert.equal(locationLine(row, details), "Testville, Ontario, Canada");
  assert.equal(programTitle(row, details), "MSc Fictional Data");
  assert.equal(fieldOfStudy(details), "Data · Analytics");
  assert.equal(overview(details), "About it");
  assert.deepEqual(keyFacts(row, details).map((f) => f.label), ["Tuition fees", "Duration", "Application deadline", "Admission requirements", "Ranking"]);
});
