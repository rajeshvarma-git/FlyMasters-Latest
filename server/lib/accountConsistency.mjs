// ACCESS-02A: pure comparison of account identity records.
//
// No database, no I/O: scripts/audit-accounts.mjs reads one snapshot and hands the
// rows in. Every finding carries a stable code, the account id, the evidence and
// whether a human must review it. Nothing here proposes or applies a correction.

export const SCOPED_ROLES = ["branch_head", "counselor", "telecaller", "accountant"];
export const ADMIN_ROLES = ["admin", "super_admin"];
// Roles that are expected to have a home branch. Students register without one and
// super admins are global, so neither is reported for lacking it.
export const HOME_BRANCH_ROLES = ["admin", ...SCOPED_ROLES];

export const CODES = {
  A1: ["high", "Account has no SQL role"],
  A2: ["medium", "SQL role has no account"],
  B1: ["high", "SQL role differs from legacy JSON role"],
  B2: ["high", "Legacy JSON role has no SQL role"],
  B3: ["medium", "More than one legacy JSON role record for one account"],
  C1: ["high", "Profile inactive but SQL access enabled"],
  C2: ["medium", "Profile carries a role different from SQL"],
  D1: ["high", "Branch-scoped role has no branch memberships"],
  D2: ["medium", "Branch membership has no account"],
  D3: ["high", "Home branch is not among assigned memberships"],
  D4: ["low", "SQL role has no home branch"],
  D5: ["info", "Account disabled in SQL"],
  D6: ["high", "Home branch or membership points to a branch that does not exist"],
  D7: ["medium", "Home branch or membership points to an inactive branch"],
  E1: ["medium", "SQL counselor has no counselors record"],
  E2: ["high", "Counselors record belongs to an account that is not a SQL counselor"],
  E3: ["medium", "More than one counselors record for one account"],
  E4: ["medium", "Counselor login has no matching account"],
  F1: ["medium", "Account emails differ only by case or whitespace"],
};

const norm = (email) => String(email ?? "").trim().toLowerCase();
const group = (items, key) => {
  const map = new Map();
  for (const item of items) {
    const k = key(item);
    if (k) map.set(k, [...(map.get(k) || []), item]);
  }
  return map;
};

/**
 * snapshot = {
 *   accounts:        [{ id, email }],
 *   sqlRoles:        [{ user_id, role, branch_id, is_active }],
 *   jsonRoles:       [{ record_id, user_id, role }],
 *   memberships:     [{ user_id, branch_id }],
 *   branches:        [{ id, is_active }],        // optional; branch checks are skipped without it
 *   profiles:        [{ user_id, is_active, disabled, role }],   // is_active/disabled as text
 *   counselorRecords:[{ id, user_id }],
 *   counselorLogins: [{ id, email }],
 * }
 * Returns an array of { code, severity, title, user_id?, evidence, needs_review }.
 */
export function analyzeAccounts(snapshot, { maskEmail = (e) => e } = {}) {
  const { accounts = [], sqlRoles = [], jsonRoles = [], memberships = [], profiles = [],
    counselorRecords = [], counselorLogins = [], branches = null } = snapshot;

  const out = [];
  const add = (code, user_id, evidence = {}) =>
    out.push({ code, severity: CODES[code][0], title: CODES[code][1], user_id: user_id ?? null, evidence, needs_review: CODES[code][0] !== "info" });

  const sqlByUser = new Map(sqlRoles.map((r) => [r.user_id, r]));
  const accountById = new Map(accounts.map((a) => [a.id, a]));
  const who = (id) => ({ email: accountById.has(id) ? maskEmail(accountById.get(id).email) : null });
  const branchesOf = new Map();
  for (const m of memberships) branchesOf.set(m.user_id, [...(branchesOf.get(m.user_id) || []), m.branch_id]);

  for (const a of accounts) {
    if (!sqlByUser.has(a.id)) {
      add("A1", a.id, { ...who(a.id), json_role: jsonRoles.find((j) => j.user_id === a.id)?.role ?? null });
    }
  }
  for (const r of sqlRoles) {
    if (!accountById.has(r.user_id)) add("A2", r.user_id, { sql_role: r.role });
  }

  for (const j of jsonRoles) {
    if (!j.user_id) continue;
    const sql = sqlByUser.get(j.user_id);
    if (!sql) add("B2", j.user_id, { ...who(j.user_id), json_role: j.role });
    else if (sql.role !== j.role) {
      add("B1", j.user_id, {
        ...who(j.user_id), sql_role: sql.role, json_role: j.role,
        privilege_conflict: ADMIN_ROLES.includes(j.role) && !ADMIN_ROLES.includes(sql.role),
      });
    }
  }
  for (const [id, rows] of group(jsonRoles, (j) => j.user_id)) {
    if (rows.length > 1) add("B3", id, { ...who(id), json_roles: rows.map((r) => r.role) });
  }

  for (const p of profiles) {
    const sql = sqlByUser.get(p.user_id);
    if (!sql) continue;
    if ((p.is_active === "false" || p.disabled === "true") && sql.is_active) add("C1", p.user_id, { ...who(p.user_id), sql_role: sql.role });
    if (p.role && p.role !== sql.role) add("C2", p.user_id, { ...who(p.user_id), sql_role: sql.role, profile_role: p.role });
  }

  for (const r of sqlRoles) {
    const branches = branchesOf.get(r.user_id) || [];
    if (SCOPED_ROLES.includes(r.role) && !branches.length) add("D1", r.user_id, { ...who(r.user_id), role: r.role, home_branch: r.branch_id });
    if (r.branch_id && branches.length && !branches.includes(r.branch_id)) {
      add("D3", r.user_id, { ...who(r.user_id), role: r.role, home_branch: r.branch_id, memberships: branches });
    }
    if (!r.branch_id && HOME_BRANCH_ROLES.includes(r.role)) add("D4", r.user_id, { ...who(r.user_id), role: r.role });
    if (r.is_active === false) add("D5", r.user_id, { ...who(r.user_id), role: r.role });
  }
  // D2 asks whether the ACCOUNT exists. An account that merely lacks a role row is
  // already reported as A1, so it is not an orphan membership.
  for (const id of branchesOf.keys()) if (!accountById.has(id)) add("D2", id, { branches: branchesOf.get(id) });

  if (branches) {
    const branchById = new Map(branches.map((b) => [b.id, b]));
    const refs = new Map(); // user_id -> Set of referenced branch ids (home + memberships)
    const addRef = (id, b) => { if (b) refs.set(id, new Set([...(refs.get(id) || []), b])); };
    for (const r of sqlRoles) addRef(r.user_id, r.branch_id);
    for (const m of memberships) addRef(m.user_id, m.branch_id);
    for (const [id, set] of refs) {
      const missing = [...set].filter((b) => !branchById.has(b));
      const inactive = [...set].filter((b) => branchById.has(b) && branchById.get(b).is_active === false);
      if (missing.length) add("D6", id, { ...who(id), missing_branches: missing });
      if (inactive.length) add("D7", id, { ...who(id), inactive_branches: inactive });
    }
  }

  const recordsByUser = group(counselorRecords, (c) => c.user_id);
  for (const r of sqlRoles) {
    if (r.role === "counselor" && !recordsByUser.has(r.user_id)) add("E1", r.user_id, who(r.user_id));
  }
  for (const [id, rows] of recordsByUser) {
    const role = sqlByUser.get(id)?.role ?? null;
    if (role !== "counselor") add("E2", id, { ...who(id), sql_role: role, record_ids: rows.map((c) => c.id) });
    if (rows.length > 1) add("E3", id, { ...who(id), record_ids: rows.map((c) => c.id) });
  }
  const accountEmails = new Set(accounts.map((a) => norm(a.email)));
  for (const c of counselorLogins) {
    if (!accountEmails.has(norm(c.email))) add("E4", null, { counselor_user_id: c.id, email: maskEmail(norm(c.email)) });
  }

  for (const [key, rows] of group(accounts, (a) => norm(a.email))) {
    if (rows.length > 1) add("F1", null, { email: maskEmail(key), account_ids: rows.map((a) => a.id) });
  }

  return out;
}

/** Counts per code, including codes with zero findings, in code order. */
export function summarize(findings) {
  return Object.entries(CODES).map(([code, [severity, title]]) => ({
    code, severity, title, count: findings.filter((f) => f.code === code).length,
  }));
}