import test from "node:test";
import assert from "node:assert/strict";
import { planWorkTransfer } from "../server/lib/workTransfer.mjs";

const AMEERPET = "b-ameerpet";
const KOMPALLY = "b-kompally";
const leaver = { id: "tc-1", keys: ["tc-1"], branchIds: [AMEERPET] };
const colleague = { id: "tc-2", role: "telecaller", isActive: true, branchIds: [AMEERPET] };
const counselorSameBranch = { id: "c-2", role: "counselor", isActive: true, branchIds: [AMEERPET] };
const otherBranch = { id: "tc-9", role: "telecaller", isActive: true, branchIds: [KOMPALLY] };

const leads = [
  { id: "L1", assigned_telecaller_id: "tc-1", branch_id: AMEERPET, lead_status: "warm" },
  { id: "L2", assigned_telecaller_id: "tc-1", branch_id: AMEERPET, lead_status: "hot" },
  { id: "L3", assigned_telecaller_id: "tc-1", branch_id: KOMPALLY, lead_status: "cold" },   // odd legacy record
  { id: "L4", assigned_telecaller_id: "tc-1", branch_id: null, lead_status: "new" },          // no branch yet
  { id: "L5", assigned_telecaller_id: "tc-1", branch_id: AMEERPET, lead_status: "converted" }, // already a student
  { id: "L6", assigned_telecaller_id: "tc-7", branch_id: AMEERPET, lead_status: "warm" },    // someone else's
  { id: "S1", assigned_counselor_id: "c-1", branch_id: AMEERPET, entity_type: "student" },
];
const reason = "Resigned on 25 Nov";
const ids = (plan) => plan.move.map((l) => l.id);

test("moves only the leaver's open leads in the shared branch", () => {
  const plan = planWorkTransfer({ kind: "telecalling", from: leaver, to: colleague, leads, reason });
  assert.equal(plan.ok, true);
  assert.deepEqual(ids(plan), ["L1", "L2"]);
  assert.deepEqual(plan.skipped, [{ id: "L3", reason: "other_branch" }, { id: "L4", reason: "no_branch" }]);
});

test("refuses a transfer to someone in another branch", () => {
  const plan = planWorkTransfer({ kind: "telecalling", from: leaver, to: otherBranch, leads, reason });
  assert.equal(plan.ok, false);
  assert.equal(plan.code, "CROSS_BRANCH");
  assert.equal(plan.status, 403);
});

test("the Super Admin is not limited: leads follow the work into the new owner's branch", () => {
  const plan = planWorkTransfer({ kind: "telecalling", from: leaver, to: otherBranch, leads, reason, allowCrossBranch: true });
  assert.equal(plan.ok, true);
  assert.deepEqual(ids(plan), ["L1", "L2", "L3", "L4"], "nothing should be skipped for the owner");
  assert.deepEqual(plan.skipped, []);
  const rebranch = Object.fromEntries(plan.move.map((l) => [l.id, l.newBranchId || null]));
  assert.deepEqual(rebranch, { L1: KOMPALLY, L2: KOMPALLY, L3: null, L4: KOMPALLY },
    "records outside the receiver's branch should move into it; one already there stays put");
});

test("a counselor in the same branch can take telecalling leads; only a counselor can take students", () => {
  assert.deepEqual(ids(planWorkTransfer({ kind: "telecalling", from: leaver, to: counselorSameBranch, leads, reason })), ["L1", "L2"]);
  const counselorLeaver = { id: "c-1", keys: ["c-1", "auth-c-1"], branchIds: [AMEERPET] };
  assert.deepEqual(ids(planWorkTransfer({ kind: "counseling", from: counselorLeaver, to: counselorSameBranch, leads, reason })), ["S1"]);
  const toTelecaller = planWorkTransfer({ kind: "counseling", from: counselorLeaver, to: colleague, leads, reason });
  assert.equal(toTelecaller.code, "WRONG_ROLE");
});

test("only the selected records move, and ids that are not theirs are reported, not moved", () => {
  const plan = planWorkTransfer({ kind: "telecalling", from: leaver, to: colleague, leads, reason, leadIds: ["L2", "L6"] });
  assert.deepEqual(ids(plan), ["L2"]);
  assert.deepEqual(plan.skipped, [{ id: "L6", reason: "not_theirs" }]);
});

test("needs a reason, an active receiver, and a different person", () => {
  assert.equal(planWorkTransfer({ kind: "telecalling", from: leaver, to: colleague, leads, reason: "  " }).code, "REASON_REQUIRED");
  assert.equal(planWorkTransfer({ kind: "telecalling", from: leaver, to: { ...colleague, isActive: false }, leads, reason }).code, "TARGET_INACTIVE");
  assert.equal(planWorkTransfer({ kind: "telecalling", from: leaver, to: { ...colleague, id: "tc-1" }, leads, reason }).code, "SAME_PERSON");
  assert.equal(planWorkTransfer({ kind: "nonsense", from: leaver, to: colleague, leads, reason }).code, "BAD_KIND");
});
