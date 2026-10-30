import test from "node:test";
import assert from "node:assert/strict";
import { checkProposal, mismatches, applyPlan } from "../server/lib/reconciliationApply.mjs";

const H = "11111111-1111-1111-1111-111111111111";
const V = "22222222-2222-2222-2222-222222222222";
const approved = (over = {}) => ({
  id: "u1", account_id: "u1", status: "approved", reviewer: "Shiva", approved_at: "2026-10-30", reason: "confirmed with branch head",
  evidence: [{ code: "D1" }], expected_before: { role: "telecaller", home_branch: null, memberships: [] },
  proposed: { action: "set_access", role: "telecaller", home_branch: H, memberships: [H] }, ...over,
});
const plan = (...entries) => ({ entries });

test("a proposal states the whole target: scoped roles need a home branch and membership, nothing is defaulted", () => {
  assert.deepEqual(checkProposal({ action: "set_access", role: "telecaller", home_branch: H, memberships: [H] }), []);
  assert.ok(checkProposal({ action: "set_access", role: "telecaller", home_branch: null, memberships: [] }).length);
  assert.ok(checkProposal({ action: "set_access", role: "counselor", home_branch: H, memberships: [] }).length);
  assert.ok(checkProposal({ action: "set_access", role: "telecaller", home_branch: H, memberships: [V] }).join().includes("one of the memberships"));
  assert.ok(checkProposal({ action: "set_access", role: "overlord", home_branch: null, memberships: [] }).length);
  assert.ok(checkProposal({ action: "set_access", role: "admin" }).length, "memberships must be stated");
  assert.deepEqual(checkProposal({ action: "set_access", role: "admin", home_branch: null, memberships: [] }), []);
  assert.ok(checkProposal({ action: "fix_it_somehow" })[0].includes("manually"));
});

test("expected_before is compared field by field; audit evidence names are understood", () => {
  const before = { exists: true, role: "student", home_branch: null, memberships: [H, V] };
  assert.deepEqual(mismatches(before, { sql_role: "student", memberships: [V, H] }), []);
  assert.equal(mismatches(before, { role: "admin" })[0].field, "role");
  assert.equal(mismatches(before, { memberships: [H] })[0].field, "memberships");
});

// A pool whose database is a tiny in-memory model, with real BEGIN/COMMIT/ROLLBACK semantics.
function memoryPool(initial) {
  let committed = structuredClone(initial);
  const log = [];
  const connect = async () => {
    let s = structuredClone(committed);
    return {
      release() {},
      async query(sql, params = []) {
        const t = String(sql).replace(/\s+/g, " ").trim();
        if (t === "BEGIN") { s = structuredClone(committed); log.push("BEGIN"); return { rows: [] }; }
        if (t === "COMMIT") { committed = s; log.push("COMMIT"); return { rows: [] }; }
        if (t === "ROLLBACK") { log.push("ROLLBACK"); return { rows: [] }; }
        const [id] = params;
        if (t.startsWith("SELECT 1 FROM auth_users")) return { rows: s.accounts.includes(id) ? [{}] : [] };
        if (t.startsWith("SELECT role, branch_id FROM user_roles")) return { rows: s.roles[id] ? [s.roles[id]] : [] };
        if (t.startsWith("SELECT branch_id FROM user_branches")) return { rows: (s.members[id] || []).map((b) => ({ branch_id: b })) };
        if (t.startsWith("SELECT id, is_active FROM branches")) return { rows: s.branches.filter((b) => params[0].includes(b.id)) };
        if (t.startsWith("INSERT INTO user_roles")) { s.roles[id] = { role: params[1], branch_id: params[2] }; return { rows: [] }; }
        if (t.startsWith("DELETE FROM user_branches")) { delete s.members[id]; return { rows: [] }; }
        if (t.startsWith("DELETE FROM user_roles")) { delete s.roles[id]; return { rows: [] }; }
        if (t.startsWith("INSERT INTO user_branches")) { s.members[id] = [...params[1]]; return { rows: [] }; }
        throw new Error("unexpected sql: " + t);
      },
    };
  };
  return { connect, log, state: () => committed };
}
const world = () => ({ accounts: ["u1"], roles: { u1: { role: "telecaller", branch_id: null } }, members: {}, branches: [{ id: H, is_active: true }, { id: V, is_active: false }] });

test("an unready plan is refused as a whole and nothing is touched", async () => {
  const pool = memoryPool(world());
  const r = await applyPlan(pool, plan(approved({ status: "proposed" })), { dryRun: false });
  assert.equal(r.ok, false);
  assert.deepEqual(pool.log, []);
});

test("dry run reports what would change and changes nothing", async () => {
  const pool = memoryPool(world());
  const r = await applyPlan(pool, plan(approved()));
  assert.equal(r.results[0].outcome, "would_apply");
  assert.deepEqual(pool.state(), world());
  assert.ok(!pool.log.includes("COMMIT"));
});

test("apply writes role, home branch and memberships together, and re-running is a no-op", async () => {
  const pool = memoryPool(world());
  const r = await applyPlan(pool, plan(approved()), { dryRun: false });
  assert.equal(r.results[0].outcome, "applied");
  assert.deepEqual(pool.state().roles.u1, { role: "telecaller", branch_id: H });
  assert.deepEqual(pool.state().members.u1, [H]);
  const again = await applyPlan(pool, plan(approved()), { dryRun: false });
  assert.equal(again.results[0].outcome, "already_applied");
});

test("an account that changed since approval is skipped as stale, never forced", async () => {
  const w = world(); w.roles.u1.role = "admin";
  const pool = memoryPool(w);
  const r = await applyPlan(pool, plan(approved()), { dryRun: false });
  assert.equal(r.results[0].outcome, "stale");
  assert.deepEqual(pool.state(), w);
});

test("a missing or inactive branch, or a missing account, is invalid and writes nothing", async () => {
  for (const [entry, w] of [
    [approved({ proposed: { action: "set_access", role: "telecaller", home_branch: V, memberships: [V] } }), world()],
    [approved(), { ...world(), accounts: [] }],
  ]) {
    const pool = memoryPool(w);
    const r = await applyPlan(pool, plan(entry), { dryRun: false });
    assert.equal(r.results[0].outcome, "invalid");
    assert.deepEqual(pool.state(), w);
  }
});

test("remove_orphan deletes leftover rows only when the account really does not exist", async () => {
  const orphan = approved({ id: "g1", account_id: "g1", expected_before: { exists: false }, proposed: { action: "remove_orphan" } });
  const w = { ...world(), roles: { g1: { role: "counselor", branch_id: H } }, members: { g1: [H] }, accounts: [] };
  const pool = memoryPool(w);
  assert.equal((await applyPlan(pool, plan(orphan), { dryRun: false })).results[0].outcome, "applied");
  assert.deepEqual([pool.state().roles, pool.state().members], [{}, {}]);
  const live = memoryPool({ ...w, accounts: ["g1"] });
  const r = await applyPlan(live, plan({ ...orphan, expected_before: { exists: true } }), { dryRun: false });
  assert.equal(r.results[0].outcome, "invalid");
  assert.equal(Object.keys(live.state().roles).length, 1);
});

test("rejected entries are never applied", async () => {
  const pool = memoryPool(world());
  const r = await applyPlan(pool, plan({ id: "x", account_id: "u1", status: "rejected" }), { dryRun: false });
  assert.deepEqual(r.results, []);
  assert.deepEqual(pool.log, []);
});

test("legacy JSON roles are never consulted or written", async () => {
  const { readFileSync } = await import("node:fs");
  const s = readFileSync("server/lib/reconciliationApply.mjs", "utf8");
  assert.doesNotMatch(s, /app_records/);
});