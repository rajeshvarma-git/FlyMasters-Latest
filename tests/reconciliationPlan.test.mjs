import test from "node:test";
import assert from "node:assert/strict";
import { HANDLING, buildPlan, summarizePlan, validatePlan } from "../server/lib/reconciliationPlan.mjs";
import { CODES } from "../server/lib/accountConsistency.mjs";

const report = {
  generated_at: "2026-10-29T00:00:00Z", database: "staging", code_commit: "abc",
  findings: [
    { code: "B1", severity: "high", title: "t", user_id: "u1", evidence: { email: "u***@x.com", sql_role: "student", json_role: "admin", privilege_conflict: true } },
    { code: "D1", severity: "high", title: "t", user_id: "u1", evidence: { role: "counselor", home_branch: "b1" } },
    { code: "A1", severity: "high", title: "t", user_id: "u2", evidence: { json_role: null } },
    { code: "F1", severity: "medium", title: "t", user_id: null, evidence: { email: "d***@x.com", account_ids: ["u3", "u4"] } },
  ],
};

test("one entry per account, merging that account's discrepancies", () => {
  const plan = buildPlan(report);
  const u1 = plan.entries.find((e) => e.account_id === "u1");
  assert.deepEqual(u1.discrepancies.map((d) => d.code), ["B1", "D1"]);
  assert.equal(plan.entries.length, 3);
  assert.deepEqual(plan.source, { generated_at: report.generated_at, database: "staging", code_commit: "abc" });
});

test("nothing is guessed: every entry starts unresolved with no proposed values", () => {
  for (const e of buildPlan(report).entries) {
    assert.equal(e.status, "unresolved");
    assert.equal(e.proposed, null);
    assert.equal(e.reason, null);
    assert.equal(e.approved_at, null);
  }
});

test("a privilege conflict is carried into the plan and its guidance forbids 'highest role'", () => {
  const u1 = buildPlan(report).entries.find((e) => e.account_id === "u1");
  assert.equal(u1.current.privilege_conflict, true);
  assert.match(u1.discrepancies[0].never, /highest role/);
});

test("accounts sharing a duplicate email are not given an account id or merged", () => {
  const f1 = buildPlan(report).entries.find((e) => e.discrepancies[0].code === "F1");
  assert.equal(f1.account_id, null);
  assert.deepEqual(f1.current.account_ids, ["u3", "u4"]);
});

test("every audit code has handling guidance", () => {
  for (const code of Object.keys(CODES)) assert.ok(HANDLING[code]?.guidance, `missing guidance for ${code}`);
});

test("a fresh plan is not ready: every entry is reported as unresolved", () => {
  const problems = validatePlan(buildPlan(report));
  assert.equal(problems.length, 3);
  assert.ok(problems.every((p) => p.problem === "still unresolved"));
});

const approved = () => {
  const plan = buildPlan(report);
  Object.assign(plan.entries[0], {
    status: "approved", proposed: { role: "student", action: "retire JSON role record" }, reason: "SQL student is the intended role (confirmed with owner)",
    reviewer: "shiva", approved_at: "2026-10-30", expected_before: { sql_role: "student", home_branch: "b1" },
  });
  return plan;
};

test("a complete approval passes validation", () => {
  const plan = approved();
  plan.entries = [plan.entries[0]];
  assert.deepEqual(validatePlan(plan), []);
});

test("an approval missing reviewer, reason, date, proposal or expected values is refused", () => {
  for (const field of ["reviewer", "reason", "approved_at", "proposed", "expected_before"]) {
    const plan = approved();
    plan.entries = [plan.entries[0]];
    plan.entries[0][field] = null;
    assert.equal(validatePlan(plan).length >= 1, true, `${field} should be required`);
  }
});

test("an approval for an entry with no account id is refused", () => {
  const plan = buildPlan(report);
  const f1 = plan.entries.find((e) => e.account_id === null);
  Object.assign(f1, { status: "approved", proposed: { action: "link" }, reason: "r", reviewer: "x", approved_at: "d", expected_before: {} });
  assert.ok(validatePlan({ entries: [f1] }).some((p) => /no account id/.test(p.problem)));
});

test("a rejected entry needs no values, and unknown statuses are refused", () => {
  const plan = buildPlan(report);
  plan.entries[0].status = "rejected";
  plan.entries[1].status = "maybe";
  const problems = validatePlan({ entries: plan.entries.slice(0, 2) });
  assert.deepEqual(problems.map((p) => p.problem), ['unknown status "maybe"']);
});

test("summary counts statuses", () => {
  const plan = approved();
  assert.deepEqual(summarizePlan(plan), { total: 3, unresolved: 2, proposed: 0, approved: 1, rejected: 0 });
});

test("building a plan does not mutate the report", () => {
  const before = JSON.stringify(report);
  buildPlan(report);
  assert.equal(JSON.stringify(report), before);
});