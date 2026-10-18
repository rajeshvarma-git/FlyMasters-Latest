import test from "node:test";
import assert from "node:assert/strict";
import {
  applicationIdFor,
  applicationNotificationId,
  applicationForShortlist,
  counselorCanViewApplication,
  findExistingOpenApplication,
  shortlistApplicationPatch,
} from "../server/lib/applicationWorkflow.mjs";

const studentOne = "student-one";
const applications = [{
  id: "app-1", user_id: studentOne, shortlist_id: "shortlist-1", university_id: "uni-1",
  university_name: "Example University", status: "in_progress",
}];

test("starting the same application again reuses the existing student application", () => {
  assert.equal(findExistingOpenApplication(applications, {
    userId: studentOne, shortlistId: "shortlist-1", universityId: "uni-1", universityName: "Example University",
  })?.id, "app-1");
});

test("an application is not shared with a different student", () => {
  assert.equal(findExistingOpenApplication(applications, {
    userId: "student-two", shortlistId: "shortlist-1", universityId: "uni-1", universityName: "Example University",
  }), null);
});

test("only the counselor assigned to the application's student can view it", () => {
  assert.equal(counselorCanViewApplication(applications[0], new Set([studentOne])), true);
  assert.equal(counselorCanViewApplication(applications[0], new Set(["student-two"])), false);
});

test("the notification identifier is stable across a request retry", () => {
  assert.equal(applicationNotificationId("app-1", "counselor-1"), applicationNotificationId("app-1", "counselor-1"));
});

test("simultaneous retries use the same persisted application identity", () => {
  const input = { userId: studentOne, shortlistId: "shortlist-1", universityId: "uni-1", universityName: "Example University" };
  assert.equal(applicationIdFor(input), applicationIdFor(input));
  assert.notEqual(applicationIdFor(input), applicationIdFor({ ...input, userId: "student-two" }));
});

test("legacy submitted applications remain associated with the counselor review flow", () => {
  const submitted = [{ ...applications[0], status: "submitted" }];
  assert.equal(findExistingOpenApplication(submitted, {
    userId: studentOne, shortlistId: "shortlist-1", universityId: "uni-1", universityName: "Example University",
  })?.id, "app-1");
});

test("counselor approval updates only the linked shortlist summary", () => {
  const approved = { ...applications[0], status: "counselor_approved" };
  const first = { id: "shortlist-1", university_id: "uni-1", status: "applied" };
  const second = { id: "shortlist-2", university_id: "uni-2", status: "consented" };
  const updated = shortlistApplicationPatch(first, approved, "2026-10-18T00:00:00.000Z");
  assert.equal(updated.application_id, "app-1");
  assert.equal(updated.application_status, "counselor_approved");
  assert.deepEqual(second, { id: "shortlist-2", university_id: "uni-2", status: "consented" });
});

test("shortlist lookup uses the canonical relationship before stable university fallback", () => {
  const shortlist = { id: "shortlist-1", application_id: "app-1", university_id: "uni-1" };
  assert.equal(applicationForShortlist(applications, shortlist)?.id, "app-1");
  assert.equal(applicationForShortlist(applications, { id: "old-shortlist", university_id: "uni-1" })?.id, "app-1");
  assert.equal(applicationForShortlist([...applications, { ...applications[0], id: "app-2" }], { id: "old-shortlist", university_id: "uni-1" }), null);
});
