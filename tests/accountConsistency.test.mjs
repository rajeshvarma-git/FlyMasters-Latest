import test from "node:test";
import assert from "node:assert/strict";
import { analyzeAccounts, summarize } from "../server/lib/accountConsistency.mjs";

const HO = "branch-ho", B2 = "branch-b2";
const clean = () => ({
  accounts: [{ id: "adm", email: "adm@x.com" }, { id: "ctr", email: "ctr@x.com" }, { id: "stu", email: "stu@x.com" }],
  sqlRoles: [
    { user_id: "adm", role: "admin", branch_id: HO, is_active: true },
    { user_id: "ctr", role: "counselor", branch_id: HO, is_active: true },
    { user_id: "stu", role: "student", branch_id: HO, is_active: true },
  ],
  jsonRoles: [], memberships: [{ user_id: "ctr", branch_id: HO }], profiles: [],
  counselorRecords: [{ id: "c1", user_id: "ctr" }], counselorLogins: [{ id: "l1", email: "CTR@x.com" }],
});
const codes = (snap) => analyzeAccounts(snap).map((f) => f.code);
const one = (snap, code) => analyzeAccounts(snap).filter((f) => f.code === code);

test("a consistent set of accounts produces no findings", () => {
  assert.deepEqual(analyzeAccounts(clean()), []);
});

test("SQL student with stale JSON admin is a flagged privilege conflict", () => {
  const s = clean();
  s.jsonRoles = [{ record_id: "j", user_id: "stu", role: "admin" }];
  const [f] = one(s, "B1");
  assert.equal(f.user_id, "stu");
  assert.equal(f.evidence.privilege_conflict, true);
  assert.equal(f.severity, "high");
});

test("a JSON role that merely differs between non-admin roles is not a privilege conflict", () => {
  const s = clean();
  s.jsonRoles = [{ record_id: "j", user_id: "ctr", role: "student" }];
  assert.equal(one(s, "B1")[0].evidence.privilege_conflict, false);
});

test("an account with no SQL role is reported with any JSON role as evidence", () => {
  const s = clean();
  s.accounts.push({ id: "new", email: "n@x.com" });
  s.jsonRoles = [{ record_id: "j", user_id: "new", role: "admin" }];
  assert.equal(one(s, "A1")[0].evidence.json_role, "admin");
  assert.equal(one(s, "B2").length, 1);
});

test("orphaned SQL roles and memberships are reported", () => {
  const s = clean();
  s.sqlRoles.push({ user_id: "ghost", role: "student", branch_id: HO, is_active: true });
  s.memberships.push({ user_id: "ghost2", branch_id: HO });
  assert.equal(one(s, "A2")[0].user_id, "ghost");
  assert.equal(one(s, "D2")[0].user_id, "ghost2");
});

test("branch-scoped staff without memberships is flagged; students and admins are not", () => {
  const s = clean();
  s.memberships = [];
  assert.deepEqual(one(s, "D1").map((f) => f.user_id), ["ctr"]);
});

test("home branch outside assigned memberships is flagged", () => {
  const s = clean();
  s.memberships = [{ user_id: "ctr", branch_id: B2 }];
  const [f] = one(s, "D3");
  assert.deepEqual(f.evidence.memberships, [B2]);
  assert.equal(f.evidence.home_branch, HO);
});

test("missing home branch is reported except for super admins", () => {
  const s = clean();
  s.accounts.push({ id: "sa", email: "sa@x.com" });
  s.sqlRoles.push({ user_id: "sa", role: "super_admin", branch_id: null, is_active: true });
  s.sqlRoles[0].branch_id = null;
  assert.deepEqual(one(s, "D4").map((f) => f.user_id), ["adm"]);
});

test("profile inactive while SQL is enabled is flagged; a disabled SQL account is informational", () => {
  const s = clean();
  s.profiles = [{ user_id: "ctr", is_active: "false" }, { user_id: "adm", disabled: "true" }];
  s.sqlRoles[1].is_active = false;
  assert.deepEqual(one(s, "C1").map((f) => f.user_id), ["adm"]);
  const info = one(s, "D5")[0];
  assert.equal(info.needs_review, false);
});

test("profile role disagreeing with SQL is flagged", () => {
  const s = clean();
  s.profiles = [{ user_id: "stu", role: "admin" }];
  assert.equal(one(s, "C2")[0].evidence.profile_role, "admin");
});

test("counselor mapping problems: no record, wrong role, duplicates, orphan login", () => {
  const s = clean();
  s.counselorRecords = [{ id: "c1", user_id: "stu" }, { id: "c2", user_id: "stu" }];
  s.counselorLogins = [{ id: "l9", email: "nobody@x.com" }];
  assert.deepEqual(one(s, "E1").map((f) => f.user_id), ["ctr"]);
  assert.equal(one(s, "E2")[0].user_id, "stu");
  assert.deepEqual(one(s, "E3")[0].evidence.record_ids, ["c1", "c2"]);
  assert.equal(one(s, "E4").length, 1);
});

test("emails differing only by case or whitespace are reported as one collision", () => {
  const s = clean();
  s.accounts.push({ id: "dup", email: " ADM@x.com " });
  s.sqlRoles.push({ user_id: "dup", role: "student", branch_id: HO, is_active: true });
  assert.deepEqual(one(s, "F1")[0].evidence.account_ids, ["adm", "dup"]);
});

test("emails are masked through the supplied function and passwords are never read", () => {
  const s = clean();
  s.jsonRoles = [{ record_id: "j", user_id: "stu", role: "admin" }];
  const [f] = analyzeAccounts(s, { maskEmail: () => "***" }).filter((x) => x.code === "B1");
  assert.equal(f.evidence.email, "***");
  assert.doesNotMatch(JSON.stringify(analyzeAccounts(s)), /password/i);
});

test("the analysis does not mutate its input", () => {
  const s = clean();
  s.jsonRoles = [{ record_id: "j", user_id: "stu", role: "admin" }];
  const before = JSON.stringify(s);
  analyzeAccounts(s);
  assert.equal(JSON.stringify(s), before);
});

test("summary lists every code, including those with no findings", () => {
  const rows = summarize(analyzeAccounts(clean()));
  assert.ok(rows.length >= 17);
  assert.ok(rows.every((r) => r.count === 0));
  assert.ok(codes({ ...clean(), accounts: [] }).length > 0);
});