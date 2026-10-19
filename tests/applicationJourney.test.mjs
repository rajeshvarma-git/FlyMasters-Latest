import test from "node:test";
import assert from "node:assert/strict";
import {
  buildTimeline, checkTransition, journeyStepIndex, nextAction, statusInfo, universitySubmitted, STUDENT_WITHDRAWABLE,
} from "../src/shared/applicationJourney.ts";
import { applyApplicationStatus, buildApplicationEvent } from "../server/lib/applicationWorkflow.mjs";

const counselor = { id: "counselor-1", role: "counselor", name: "" };
const started = { id: "app-1", user_id: "student-1", shortlist_id: "sl-1", status: "in_progress", created_at: "2026-10-01T09:00:00.000Z", started_by: "counselor" };

test("internal approval is not a university submission", () => {
  const { next } = applyApplicationStatus(started, "counselor_approved", { actor: counselor, at: "2026-10-02T09:00:00.000Z" });
  assert.equal(next.status, "counselor_approved");
  assert.equal(next.submitted_at, undefined);
  assert.equal(universitySubmitted(next), false);
  assert.match(statusInfo(next.status).summary, /not been submitted/);
});

test("the legacy student-sent status is never treated as a submission", () => {
  for (const status of ["pending_counselor", "submitted"]) {
    assert.equal(universitySubmitted({ status }), false);
    assert.equal(journeyStepIndex(status), 0);
  }
});

test("only a recorded submission stamps submitted_at, and the first time is kept", () => {
  const first = applyApplicationStatus(started, "submitted_to_university", { actor: counselor, at: "2026-10-03T09:00:00.000Z" }).next;
  assert.equal(first.submitted_at, "2026-10-03T09:00:00.000Z");
  assert.equal(first.submitted_by, "counselor-1");
  const later = applyApplicationStatus(first, "offer_received", { actor: counselor, at: "2026-10-09T09:00:00.000Z" }).next;
  assert.equal(later.submitted_at, "2026-10-03T09:00:00.000Z");
});

test("a university decision needs a recorded submission", () => {
  for (const status of ["offer_received", "offer_accepted", "enrolled", "rejected", "waitlisted"]) {
    assert.equal(applyApplicationStatus(started, status, { actor: counselor, at: "now" }).error?.length > 0, true, status);
  }
  const submitted = { ...started, status: "submitted_to_university", submitted_at: "2026-10-03T09:00:00.000Z" };
  assert.equal(checkTransition(submitted, "offer_received").ok, true);
  // Older rows that already hold a post-submission status keep working.
  assert.equal(checkTransition({ status: "offer_received" }, "offer_accepted").ok, true);
  assert.equal(checkTransition(started, "withdrawn").ok, true);
  assert.equal(checkTransition(started, "made_up_status").ok, false);
});

test("progress steps follow the stored status", () => {
  assert.deepEqual(
    ["in_progress", "counselor_approved", "submitted_to_university", "offer_received", "enrolled", "withdrawn"].map(journeyStepIndex),
    [0, 1, 2, 3, 4, -1],
  );
});

test("a student can only withdraw before anything is sent to the university", () => {
  assert.equal(STUDENT_WITHDRAWABLE.has("in_progress"), true);
  assert.equal(STUDENT_WITHDRAWABLE.has("counselor_approved"), false);
  assert.equal(STUDENT_WITHDRAWABLE.has("submitted_to_university"), false);
});

test("events carry who, when, and the owning student; the started event is idempotent", () => {
  const a = buildApplicationEvent({ application: started, status: "in_progress", type: "started", key: "started", actor: counselor, at: "2026-10-01T09:00:00.000Z" });
  const b = buildApplicationEvent({ application: started, status: "in_progress", type: "started", key: "started", actor: counselor, at: "2026-10-01T09:00:05.000Z" });
  assert.equal(a.id, b.id);
  assert.equal(a.student_id, "student-1");
  assert.equal(a.updated_by_role, "counselor");
  assert.equal(a.is_visible_to_student, true);
});

test("the timeline is chronological, hides staff-only entries from the student, and rebuilds old records", () => {
  const events = [
    buildApplicationEvent({ application: started, fromStatus: "in_progress", status: "submitted_to_university", actor: counselor, at: "2026-10-03T09:00:00.000Z" }),
    buildApplicationEvent({ application: started, fromStatus: "in_progress", status: "counselor_approved", actor: counselor, at: "2026-10-02T09:00:00.000Z" }),
    buildApplicationEvent({ application: started, fromStatus: "in_progress", status: "counselor_approved", note: "staff only", actor: counselor, at: "2026-10-02T10:00:00.000Z", visible: false }),
  ];
  const forStudent = buildTimeline(started, events, { forStudent: true });
  assert.deepEqual(forStudent.map((item) => item.title), ["Application started", "Approved by counselor", "Submitted to university"]);
  assert.equal(forStudent[0].derived, true);
  assert.equal(forStudent.some((item) => item.detail.includes("staff only")), false);
  assert.equal(buildTimeline(started, events).some((item) => item.detail.includes("staff only")), true);
  const other = buildTimeline({ ...started, id: "app-2" }, events, { forStudent: true });
  assert.equal(other.length, 1, "another application's events never appear");
});

test("what's next names who acts and prefers the counselor's own words", () => {
  assert.equal(nextAction({ status: "returned" }).owner, "student");
  assert.equal(nextAction({ status: "submitted_to_university" }).owner, "university");
  assert.equal(nextAction({ status: "withdrawn" }), null);
  assert.notEqual(nextAction({ status: "counselor_approved" }).text, statusInfo("counselor_approved").summary);
  const latest = { id: "e", status: "returned", next_action_required: "Upload your transcript" };
  assert.equal(nextAction({ status: "returned" }, latest).text, "Upload your transcript");
});
