// ACCESS-02B: turns an audit report into a reviewable correction plan.
//
// Pure: no database, no writes. Nothing here chooses a role, a branch or an
// identity. Every entry starts "unresolved" with no proposed values, and a human
// has to fill them in. validatePlan() refuses to accept an approval that lacks
// evidence, a reason, a reviewer or the values ACCESS-02E must re-check.

// How each discrepancy is to be handled (from the ACCESS-02 plan). `never` lists
// shortcuts that must not be taken.
export const HANDLING = {
  A1: { guidance: "Missing SQL role. Propose Student only with clear evidence of a verified student registration. Unclear staff identity: review, do not guess.", never: "assume Student; copy a JSON role" },
  A2: { guidance: "SQL role with no account. Confirm whether the account was deleted before removing or keeping the role.", never: "delete without confirming" },
  B1: { guidance: "SQL and legacy JSON roles differ. SQL is authoritative; the JSON record must not grant access. If privilege_conflict is true, flag it and confirm the SQL role is the intended one.", never: "take the highest role" },
  B2: { guidance: "JSON role with no SQL role. Decide the intended SQL role from evidence; the JSON role is evidence only.", never: "copy the JSON role automatically" },
  B3: { guidance: "Several JSON records for one account. They are migration evidence only; confirm the intended role.", never: "pick the newest or highest" },
  C1: { guidance: "Profile says inactive but SQL access is enabled. Confirm the intended account state.", never: "automatically reactivate or disable" },
  C2: { guidance: "Profile role differs from SQL. The profile never grants permissions; confirm SQL is correct.", never: "let the profile override SQL" },
  D1: { guidance: "Branch-scoped staff with no memberships. Confirm the intended branch assignment before changing either the role or the memberships.", never: "assign Head Office by default" },
  D2: { guidance: "Membership for an account that does not exist. Confirm and remove only after approval.", never: "keep access for a missing account" },
  D3: { guidance: "Home branch is not among memberships. Confirm which is intended before changing either.", never: "widen memberships to match the home branch" },
  D4: { guidance: "Staff account without a home branch. Confirm the intended default branch.", never: "assign Head Office by default" },
  D5: { guidance: "Account is disabled in SQL. Informational; confirm it is intended.", never: "re-enable automatically" },
  D6: { guidance: "References a branch that does not exist. Confirm the correct branch.", never: "guess a branch" },
  D7: { guidance: "References an inactive branch. Confirm whether the branch or the assignment should change.", never: "reactivate the branch automatically" },
  E1: { guidance: "SQL counselor with no counselors record. Confirm whether a profile should exist.", never: "create a profile that grants a role" },
  E2: { guidance: "Counselors record belongs to an account that is not a SQL counselor. Resolve ownership first.", never: "restore the counselor role from the profile" },
  E3: { guidance: "Duplicate counselors records for one account. Confirm which is authoritative.", never: "merge by name similarity" },
  E4: { guidance: "Counselor login with no matching account. Resolve ownership before linking.", never: "link by similar name or email fragment" },
  F1: { guidance: "Emails differ only by case or whitespace. Resolve ownership before linking or merging.", never: "merge accounts by resemblance" },
};

export const STATUSES = ["unresolved", "proposed", "approved", "rejected"];

/** Fields from a finding's evidence that describe the account's current state. */
const CURRENT_KEYS = ["sql_role", "json_role", "json_roles", "profile_role", "role", "home_branch",
  "memberships", "missing_branches", "inactive_branches", "branches", "record_ids", "account_ids", "privilege_conflict"];

const entryKey = (f) => f.user_id ?? `${f.code}:${JSON.stringify(f.evidence.account_ids ?? f.evidence.counselor_user_id ?? f.evidence.email ?? "")}`;

export function buildPlan(report) {
  const byKey = new Map();
  for (const f of report.findings || []) {
    const key = entryKey(f);
    if (!byKey.has(key)) {
      byKey.set(key, {
        id: key,
        account_id: f.user_id,
        discrepancies: [],
        current: {},
        proposed: null,        // to be filled by a human: { role?, home_branch?, memberships?, is_active?, action }
        reason: null,
        evidence: [],
        status: "unresolved",
        reviewer: null,
        approved_at: null,
        expected_before: null, // what ACCESS-02E must find immediately before applying
      });
    }
    const e = byKey.get(key);
    e.discrepancies.push({ code: f.code, severity: f.severity, title: f.title, guidance: HANDLING[f.code]?.guidance ?? "", never: HANDLING[f.code]?.never ?? "" });
    for (const k of CURRENT_KEYS) if (f.evidence[k] !== undefined) e.current[k] = f.evidence[k];
    e.evidence.push({ code: f.code, ...f.evidence });
  }
  return {
    source: { generated_at: report.generated_at, database: report.database, code_commit: report.code_commit },
    entries: [...byKey.values()],
  };
}

const blank = (v) => v === null || v === undefined || (typeof v === "string" && v.trim() === "");

/** Returns a list of problems; an empty list means the plan is ready for ACCESS-02E. */
export function validatePlan(plan) {
  const problems = [];
  const add = (entry, msg) => problems.push({ id: entry.id, problem: msg });
  for (const e of plan.entries || []) {
    if (!STATUSES.includes(e.status)) { add(e, `unknown status "${e.status}"`); continue; }
    if (e.status === "unresolved") { add(e, "still unresolved"); continue; }
    if (e.status === "rejected") continue;
    if (blank(e.proposed) || typeof e.proposed !== "object") add(e, "no proposed values");
    if (blank(e.reason)) add(e, "no reason recorded");
    if (!e.evidence?.length) add(e, "no supporting evidence");
    if (e.status === "approved") {
      if (blank(e.reviewer)) add(e, "approved without a reviewer");
      if (blank(e.approved_at)) add(e, "approved without a date");
      if (blank(e.expected_before) || typeof e.expected_before !== "object") add(e, "no expected starting values for ACCESS-02E to re-check");
      if (blank(e.account_id)) add(e, "approved correction has no account id (resolve ownership first)");
    }
  }
  return problems;
}

export function summarizePlan(plan) {
  const count = (s) => plan.entries.filter((e) => e.status === s).length;
  return { total: plan.entries.length, unresolved: count("unresolved"), proposed: count("proposed"), approved: count("approved"), rejected: count("rejected") };
}