// ACCESS-02E: applies an approved reconciliation plan (02B) to the database.
//
// Safety rules, each covered by tests:
//  - Only entries with status "approved" are touched, and only when the whole plan validates.
//  - Nothing is inferred. The plan states the complete target (role, home branch, memberships);
//    this code never fills a gap with a default, a "highest role" or Head Office.
//  - Each entry is re-checked against the live database first (expected_before). If the account
//    changed since it was approved, the entry is skipped as "stale", never forced.
//  - Each entry is one transaction, verified by re-reading before COMMIT; a dry run runs the same
//    statements and always ends in ROLLBACK.
//  - Re-running a plan is safe: an entry already in its target state is "already_applied".
//  - Legacy JSON role records are never read or written. SQL is the only authority.

import { KNOWN_ROLES } from "./accountIdentity.mjs";
import { SCOPED_ROLES } from "./accountConsistency.mjs";
import { validatePlan } from "./reconciliationPlan.mjs";

export const APPLY_ACTIONS = ["set_access", "remove_orphan"];

const sortedIds = (list) => [...new Set((list || []).map(String))].sort();
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

/** Problems with one approved entry's proposal; empty means it can be applied. */
export function checkProposal(proposed) {
  const p = proposed || {};
  const problems = [];
  if (!APPLY_ACTIONS.includes(p.action)) return [`unsupported action "${p.action}" (supported: ${APPLY_ACTIONS.join(", ")}); handle this one manually`];
  if (p.action === "remove_orphan") return problems;
  if (!KNOWN_ROLES.includes(p.role)) problems.push(`role "${p.role}" is not a known role`);
  if (p.home_branch !== null && typeof p.home_branch !== "string") problems.push("home_branch must be a branch id or null");
  if (!Array.isArray(p.memberships) || p.memberships.some((m) => typeof m !== "string")) problems.push("memberships must be a list of branch ids (empty list for none)");
  if (problems.length) return problems;
  const memberships = sortedIds(p.memberships);
  if (SCOPED_ROLES.includes(p.role) && !p.home_branch) problems.push(`a ${p.role} needs a home branch`);
  if (SCOPED_ROLES.includes(p.role) && !memberships.length) problems.push(`a ${p.role} needs at least one branch membership`);
  if (p.home_branch && !memberships.includes(String(p.home_branch))) problems.push("home_branch must be one of the memberships");
  if (!p.home_branch && memberships.length) problems.push("memberships need a home_branch");
  return problems;
}

/** Fields named in expected_before that no longer match the live state. */
export function mismatches(before, expected) {
  const want = { ...expected };
  if (want.sql_role !== undefined && want.role === undefined) want.role = want.sql_role; // audit evidence name
  const out = [];
  for (const key of ["exists", "role", "home_branch", "memberships"]) {
    if (want[key] === undefined) continue;
    const a = key === "memberships" ? sortedIds(want[key]) : want[key];
    const b = before[key];
    if (!same(a, b)) out.push({ field: key, expected: a, found: b });
  }
  return out;
}

async function readState(db, id) {
  const account = await db.query("SELECT 1 FROM auth_users WHERE id = $1", [id]);
  const role = await db.query("SELECT role, branch_id FROM user_roles WHERE user_id = $1 FOR UPDATE", [id]);
  const memberships = await db.query("SELECT branch_id FROM user_branches WHERE user_id = $1", [id]);
  return {
    exists: account.rows.length > 0,
    role: role.rows[0]?.role ?? null,
    home_branch: role.rows[0]?.branch_id ? String(role.rows[0].branch_id) : null,
    memberships: sortedIds(memberships.rows.map((r) => r.branch_id)),
  };
}

const target = (p) => ({ exists: true, role: p.role, home_branch: p.home_branch || null, memberships: sortedIds(p.memberships) });

async function applyOne(db, entry, appliedBy) {
  const p = entry.proposed;
  const id = String(entry.account_id);
  const before = await readState(db, id);

  const stale = mismatches(before, entry.expected_before);
  if (p.action === "set_access") {
    if (same(before, target(p))) return { outcome: "already_applied", before, after: before };
  } else if (!before.role && !before.memberships.length) {
    return { outcome: "already_applied", before, after: before };
  }
  if (stale.length) return { outcome: "stale", before, detail: stale };

  if (p.action === "remove_orphan") {
    if (before.exists) return { outcome: "invalid", before, detail: "the account exists; an orphan can only be removed when it does not" };
    await db.query("DELETE FROM user_branches WHERE user_id = $1", [id]);
    await db.query("DELETE FROM user_roles WHERE user_id = $1", [id]);
    const after = await readState(db, id);
    if (after.role || after.memberships.length) throw new Error("verification failed: rows remain after removal");
    return { outcome: "applied", before, after };
  }

  if (!before.exists) return { outcome: "invalid", before, detail: "the account does not exist; use remove_orphan or reject the entry" };
  const wanted = target(p);
  if (wanted.memberships.length) {
    const found = await db.query("SELECT id, is_active FROM branches WHERE id = ANY($1::uuid[])", [wanted.memberships]);
    const active = new Set(found.rows.filter((b) => b.is_active !== false).map((b) => String(b.id)));
    const bad = wanted.memberships.filter((b) => !active.has(b));
    if (bad.length) return { outcome: "invalid", before, detail: `branch missing or inactive: ${bad.join(", ")}` };
  }
  await db.query(
    `INSERT INTO user_roles (user_id, role, branch_id, assigned_by) VALUES ($1, $2, $3::uuid, $4)
     ON CONFLICT (user_id) DO UPDATE SET role = EXCLUDED.role, branch_id = EXCLUDED.branch_id, assigned_by = EXCLUDED.assigned_by, updated_at = now()`,
    [id, wanted.role, wanted.home_branch, appliedBy],
  );
  await db.query("DELETE FROM user_branches WHERE user_id = $1", [id]);
  if (wanted.memberships.length) {
    await db.query(
      "INSERT INTO user_branches (user_id, branch_id, assigned_by) SELECT $1, unnest($2::uuid[]), $3",
      [id, wanted.memberships, appliedBy],
    );
  }
  const after = await readState(db, id);
  if (!same(after, wanted)) throw new Error("verification failed: the account does not match the approved target after writing");
  return { outcome: "applied", before, after };
}

/**
 * Applies every approved entry. `pool` is anything with connect(). dryRun (the default) runs the
 * exact same statements and rolls each one back.
 */
export async function applyPlan(pool, plan, { dryRun = true, appliedBy = "access-02e" } = {}) {
  const problems = validatePlan(plan);
  if (problems.length) return { ok: false, refused: "the plan is not ready", problems, results: [] };
  const results = [];
  for (const entry of plan.entries.filter((e) => e.status === "approved")) {
    const base = { id: entry.id, account_id: entry.account_id, action: entry.proposed?.action };
    const bad = checkProposal(entry.proposed);
    if (bad.length) { results.push({ ...base, outcome: "invalid", detail: bad }); continue; }
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const r = await applyOne(client, entry, appliedBy);
      await client.query(dryRun || r.outcome !== "applied" ? "ROLLBACK" : "COMMIT");
      results.push({ ...base, ...r, outcome: dryRun && r.outcome === "applied" ? "would_apply" : r.outcome });
    } catch (error) {
      await client.query("ROLLBACK").catch(() => {});
      results.push({ ...base, outcome: "failed", detail: String(error?.message || error) });
    } finally {
      client.release();
    }
  }
  return { ok: true, dryRun, results, summary: summarizeResults(results) };
}

export function summarizeResults(results) {
  const out = {};
  for (const r of results) out[r.outcome] = (out[r.outcome] || 0) + 1;
  return out;
}