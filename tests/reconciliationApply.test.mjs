import test from "node:test";
import assert from "node:assert/strict";
import { checkProposal, checkExpected, mismatches, applyPlan } from "../server/lib/reconciliationApply.mjs";

const H = "11111111-1111-1111-1111-111111111111";
const V = "22222222-2222-2222-2222-222222222222";
const approved = (over = {}) => ({
  id: "u1", account_id: "u1", status: "approved", reviewer: "Shiva", approved_at: "2026-10-30", reason: "confirmed with branch head",
  evidence: [{ code: "D1" }], expected_before: { role: "telecaller", home_branch: null, memberships: [] },
  proposed: { action: "set_access", role: "telecaller", home_branch: H, memberships: [H] }, ...over,
});
const TARGET = { host: "db.staging", port: "5432", database: "flymasters", fingerprint: "abc123" };
const plan = (...entries) => ({ source: { target: TARGET }, entries });
const mem = () => { const events = []; return { events, journal: { prepared: async (r) => events.push(["prepared", r.id]), committed: async (r) => events.push(["committed", r.id]) } }; };
const opts = (extra = {}) => ({ target: TARGET, ...extra });
const real = (extra = {}) => ({ dryRun: false, target: TARGET, journal: mem().journal, ...extra });

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
  const r = await applyPlan(pool, plan(approved({ status: "proposed" })), real());
  assert.equal(r.ok, false);
  assert.deepEqual(pool.log, []);
});

test("dry run reports what would change and changes nothing", async () => {
  const pool = memoryPool(world());
  const r = await applyPlan(pool, plan(approved()), opts());
  assert.equal(r.results[0].outcome, "would_apply");
  assert.deepEqual(pool.state(), world());
  assert.ok(!pool.log.includes("COMMIT"));
});

test("apply writes role, home branch and memberships together, and re-running is a no-op", async () => {
  const pool = memoryPool(world());
  const r = await applyPlan(pool, plan(approved()), real());
  assert.equal(r.results[0].outcome, "applied");
  assert.deepEqual(pool.state().roles.u1, { role: "telecaller", branch_id: H });
  assert.deepEqual(pool.state().members.u1, [H]);
  const again = await applyPlan(pool, plan(approved()), real());
  assert.equal(again.results[0].outcome, "already_applied");
});

test("an account that changed since approval is skipped as stale, never forced", async () => {
  const w = world(); w.roles.u1.role = "admin";
  const pool = memoryPool(w);
  const r = await applyPlan(pool, plan(approved()), real());
  assert.equal(r.results[0].outcome, "stale");
  assert.deepEqual(pool.state(), w);
});

test("a missing or inactive branch, or a missing account, is invalid and writes nothing", async () => {
  for (const [entry, w] of [
    [approved({ proposed: { action: "set_access", role: "telecaller", home_branch: V, memberships: [V] } }), world()],
    [approved(), { ...world(), accounts: [] }],
  ]) {
    const pool = memoryPool(w);
    const r = await applyPlan(pool, plan(entry), real());
    assert.equal(r.results[0].outcome, "invalid");
    assert.deepEqual(pool.state(), w);
  }
});

test("remove_orphan deletes leftover rows only when the account really does not exist", async () => {
  const orphan = approved({ id: "g1", account_id: "g1", expected_before: { exists: false }, proposed: { action: "remove_orphan" } });
  const w = { ...world(), roles: { g1: { role: "counselor", branch_id: H } }, members: { g1: [H] }, accounts: [] };
  const pool = memoryPool(w);
  assert.equal((await applyPlan(pool, plan(orphan), real())).results[0].outcome, "applied");
  assert.deepEqual([pool.state().roles, pool.state().members], [{}, {}]);
  const live = memoryPool({ ...w, accounts: ["g1"] });
  const r = await applyPlan(live, plan({ ...orphan, expected_before: { exists: true } }), real());
  assert.equal(r.results[0].outcome, "invalid");
  assert.equal(Object.keys(live.state().roles).length, 1);
});

test("rejected entries are never applied", async () => {
  const pool = memoryPool(world());
  const r = await applyPlan(pool, plan({ id: "x", account_id: "u1", status: "rejected" }), real());
  assert.deepEqual(r.results, []);
  assert.deepEqual(pool.log, []);
});

test("legacy JSON roles are never consulted or written", async () => {
  const { readFileSync } = await import("node:fs");
  const s = readFileSync("server/lib/reconciliationApply.mjs", "utf8");
  assert.doesNotMatch(s, /app_records/);
});
// ---------- regression: 02E review ----------
import { targetIdentity } from "../server/lib/targetIdentity.mjs";

test("unknown expected_before fields are refused, and the starting state must be fully stated", async () => {
  assert.ok(checkExpected("set_access", { role: "telecaller", home_branch: null, memberships: [], colour: "red" }).join().includes("colour"));
  assert.ok(checkExpected("set_access", { role: "telecaller" }).join().includes("home_branch, memberships"));
  assert.deepEqual(checkExpected("set_access", { sql_role: "telecaller", home_branch: null, memberships: [] }), []);
  assert.ok(checkExpected("remove_orphan", {}).length);
  assert.ok(checkExpected("remove_orphan", { exists: true }).length);
  const pool = memoryPool(world());
  const r = await applyPlan(pool, plan(approved({ expected_before: { role: "telecaller", home_branch: null, memberships: [], colour: "red" } })), real());
  assert.equal(r.results[0].outcome, "invalid");
  assert.deepEqual(pool.state(), world());
  const partial = await applyPlan(pool, plan(approved({ expected_before: { role: "telecaller" } })), real());
  assert.equal(partial.results[0].outcome, "invalid");
});

test("is_active (or any field 02E does not perform) is refused, never reported as applied", async () => {
  const p = { action: "set_access", role: "telecaller", home_branch: H, memberships: [H], is_active: false };
  assert.ok(checkProposal(p).join().includes("is_active"));
  const pool = memoryPool(world());
  const r = await applyPlan(pool, plan(approved({ proposed: p })), real());
  assert.equal(r.results[0].outcome, "invalid");
  assert.deepEqual(pool.state(), world());
});

test("a plan made from a different database (or recording none) is refused whole", async () => {
  const pool = memoryPool(world());
  const other = { ...TARGET, host: "db.production", fingerprint: "zzz999" };
  const a = await applyPlan(pool, plan(approved()), real({ target: other }));
  assert.equal(a.ok, false);
  assert.match(a.refused, /db\.staging/);
  const b = await applyPlan(pool, { entries: [approved()] }, real());
  assert.equal(b.ok, false);
  assert.match(b.refused, /does not record/);
  assert.deepEqual(pool.log, []);
});

test("target identity separates hosts, ports and databases, and never contains credentials", () => {
  const a = targetIdentity({ url: "postgresql://u:secret@db1.example.com:5432/app", database: "app" });
  const b = targetIdentity({ url: "postgresql://u:secret@db2.example.com:5432/app", database: "app" });
  const c = targetIdentity({ url: "postgresql://u:secret@db1.example.com:6543/app", database: "app" });
  assert.equal(new Set([a.fingerprint, b.fingerprint, c.fingerprint]).size, 3);
  assert.doesNotMatch(JSON.stringify(a), /secret|u:/);
  assert.equal(a.fingerprint, targetIdentity({ url: "postgresql://other:pw@DB1.example.com/app", database: "app" }).fingerprint);
});

test("the journal is written before the commit, and a real run without a journal is refused", async () => {
  const order = [];
  const base = memoryPool(world());
  const pool = { connect: async () => { const c = await base.connect(); return { release: c.release, query: (sql, p) => { const t = String(sql).trim(); if (t === "COMMIT") order.push("COMMIT"); return c.query(sql, p); } }; } };
  const journal = { prepared: async () => order.push("prepared"), committed: async () => order.push("committed") };
  const r = await applyPlan(pool, plan(approved()), { dryRun: false, target: TARGET, journal });
  assert.equal(r.results[0].outcome, "applied");
  assert.deepEqual(order, ["prepared", "COMMIT", "committed"]);
  const none = await applyPlan(memoryPool(world()), plan(approved()), { dryRun: false, target: TARGET });
  assert.equal(none.ok, false);
  assert.match(none.refused, /journal/);
});

test("if the journal cannot be written the entry is rolled back and the run stops", async () => {
  const w = world(); w.accounts.push("u2"); w.roles.u2 = { role: "telecaller", branch_id: null };
  const pool = memoryPool(w);
  const two = plan(approved(), approved({ id: "u2", account_id: "u2" }));
  const journal = { prepared: async () => { throw new Error("disk full"); }, committed: async () => {} };
  const r = await applyPlan(pool, two, { dryRun: false, target: TARGET, journal });
  assert.equal(r.halted, true);
  assert.equal(r.results.length, 1, "nothing after the failure is attempted");
  assert.equal(r.results[0].outcome, "failed");
  assert.deepEqual(pool.state(), w);
  assert.ok(!pool.log.includes("COMMIT"));
});
