// ACCESS-03B follow-up: routes that act on a person or a lead by id respect the caller's branches.
// The real route handlers run; only the database is replaced. A refused request must write nothing.
process.env.DATABASE_URL = process.env.DATABASE_URL || "postgresql://nobody:nothing@127.0.0.1:1/none";

import test from "node:test";
import assert from "node:assert/strict";
import { branchInScope, allInScope, checkStaffInScope, checkLeadInScope } from "../server/lib/scopeGuards.mjs";
import core from "../server/routes/core.mjs";
import { pool } from "../server/lib/db.mjs";

const A = "aaaaaaaa-0000-0000-0000-000000000001";
const B = "bbbbbbbb-0000-0000-0000-000000000002";
const scoped = (...ids) => ({ allBranches: false, branchIds: ids });
const everything = { allBranches: true, branchIds: [] };

// ---------- the pure rules ----------

test("branchInScope / allInScope: unrestricted passes; limited needs every branch, and an unknown branch fails", () => {
  assert.equal(branchInScope(everything, undefined), true);
  assert.equal(branchInScope(scoped(A), A), true);
  assert.equal(branchInScope(scoped(A), B), false);
  assert.equal(branchInScope(scoped(A), null), false, "a record with no branch cannot be judged");
  assert.equal(allInScope(scoped(A), [A]), true);
  assert.equal(allInScope(scoped(A), [A, B]), false, "one outside branch is enough to refuse");
  assert.equal(allInScope(scoped(A), []), false, "no branch on record is refused, not guessed");
  assert.equal(allInScope(everything, []), true);
});

// ---------- the real route handlers ----------

const route = (path, method) => core.stack.find((l) => l.route?.path === path && l.route.methods[method]).route.stack.at(-1).handle;
const H = {
  counselorTransfer: route("/api/counselors/:id/transfer", "post"),
  telecallerTransfer: route("/api/telecallers/:id/transfer", "post"),
  telecallerRemove: route("/api/telecallers/:id/remove", "post"),
  counselorRemove: route("/api/counselors/:id/remove", "post"),
  bulkAssign: route("/api/leads/bulk-assign", "post"),
  bulkTelecaller: route("/api/leads/bulk-assign-telecaller", "post"),
  leadPatch: route("/api/leads/:id", "patch"),
  leadBranch: route("/api/leads/:id/branch", "post"),
  branchCreate: route("/api/branches", "post"),
  branchUpdate: route("/api/branches/:id", "patch"),
};

/** accounts: id -> { branches: [] }.  leads: id -> branchId.  Records every write with its parameters. */
function world({ accounts = {}, leads = {} } = {}) {
  const writes = [];
  const originalQuery = pool.query.bind(pool);
  const originalConnect = pool.connect.bind(pool);
  const answer = (sql, params = []) => {
    const text = String(sql).replace(/\s+/g, " ").trim();
    if (/^(INSERT|UPDATE|DELETE)/.test(text)) { writes.push({ text: text.slice(0, 60), params }); return { rows: /RETURNING/i.test(text) ? [{ id: params[0], data: {} }] : [], rowCount: 1 }; }
    if (/^SELECT id FROM auth_users WHERE id::text/.test(text)) return { rows: accounts[params[0]] ? [{ id: params[0] }] : [] };
    if (/^SELECT a\.id FROM counselor_users/.test(text)) return { rows: [] };
    if (/^SELECT id, lower\(email\)/.test(text)) return { rows: accounts[params[0]] ? [{ id: params[0], email: `${params[0]}@x.test` }] : [] };
    if (/^SELECT role, branch_id FROM user_roles/.test(text)) { const a = accounts[params[0]]; return { rows: a ? [{ role: a.role || "counselor", branch_id: a.branches?.[0] ?? null }] : [] }; }
    if (/^SELECT branch_id FROM user_branches WHERE user_id/.test(text)) return { rows: (accounts[params[0]]?.branches || []).map((b) => ({ branch_id: b })) };
    if (/^SELECT branch_id FROM app_records WHERE table_name = 'student_leads' AND id::text/.test(text)) return { rows: params[0] in leads ? [{ branch_id: leads[params[0]] }] : [] };
    if (/^SELECT DISTINCT branch_id FROM app_records/.test(text)) return { rows: [] };
    if (/^SELECT id, data, branch_id, created_at FROM app_records WHERE table_name = \$1/.test(text) && params[0] === "student_leads") {
      return { rows: Object.entries(leads).map(([id, branch_id]) => ({ id, data: { id, entity_type: "student", lead_status: "converted" }, branch_id, created_at: "2026-01-01" })) };
    }
    if (/FROM branches/.test(text)) return { rows: [{ id: A }, { id: B }] };
    return { rows: [], rowCount: 0 };
  };
  pool.query = async (sql, params) => answer(sql, params);
  pool.connect = async () => ({ query: async (sql, params) => (/^(BEGIN|COMMIT|ROLLBACK)/.test(String(sql).trim()) ? { rows: [] } : answer(sql, params)), release() {} });
  return { writes, restore() { pool.query = originalQuery; pool.connect = originalConnect; } };
}

async function call(handler, { role = "admin", scope, params = {}, body = {} }) {
  const res = { code: 200, body: null, status(c) { this.code = c; return this; }, json(b) { this.body = b; return this; } };
  try {
    await handler({ user: { id: "caller", role }, scope, params, body, headers: {}, ip: "t" }, res);
  } catch (error) {
    res.code = 599; res.body = { thrown: error.message }; // got past the guard and failed later on the empty fake database
  }
  return res;
}
const withWorld = async (setup, fn) => { const w = world(setup); try { return await fn(w); } finally { w.restore(); } };
const refused = (r) => r.code === 403 && r.body?.code;

test("staff transfer/remove: a person from another branch, or one who also works in another branch, is refused and nothing is written", async () => {
  const accounts = { cA: { branches: [A] }, cA2: { branches: [A] }, cB: { branches: [B] }, cAB: { branches: [A, B] }, tA: { role: "telecaller", branches: [A] }, tB: { role: "telecaller", branches: [B] } };
  await withWorld({ accounts }, async (w) => {
    const me = { scope: scoped(A) };
    assert.ok(refused(await call(H.counselorTransfer, { ...me, params: { id: "cB" }, body: { targetCounselorId: "cA" } })), "source in B");
    assert.ok(refused(await call(H.counselorTransfer, { ...me, params: { id: "cA" }, body: { targetCounselorId: "cB" } })), "target in B");
    assert.ok(refused(await call(H.counselorTransfer, { ...me, params: { id: "cAB" }, body: { targetCounselorId: "cA" } })), "source also belongs to B");
    assert.ok(refused(await call(H.telecallerTransfer, { ...me, params: { id: "tB" }, body: { targetTelecallerId: "tA" } })));
    assert.ok(refused(await call(H.telecallerRemove, { ...me, params: { id: "tB" }, body: {} })));
    assert.ok(refused(await call(H.telecallerRemove, { ...me, params: { id: "tA" }, body: { targetTelecallerId: "tB" } })), "removal target in B");
    assert.ok(refused(await call(H.counselorRemove, { ...me, params: { id: "cB" }, body: {} })));
    assert.deepEqual(w.writes, []);
  });
});

test("staff transfer/remove: people entirely inside the caller's branches get past the check; unrestricted callers are not looked up at all", async () => {
  const accounts = { cA: { branches: [A] }, cA2: { branches: [A] }, cB: { branches: [B] } };
  await withWorld({ accounts }, async () => {
    const ok = await call(H.counselorTransfer, { scope: scoped(A), params: { id: "cA" }, body: { targetCounselorId: "cA2" } });
    assert.ok(!refused(ok), JSON.stringify(ok.body));
    const everyone = await call(H.counselorTransfer, { role: "super_admin", scope: everything, params: { id: "cB" }, body: { targetCounselorId: "cA" } });
    assert.ok(!refused(everyone), "Super Admin / enforcement off: unchanged");
  });
});

test("a limited caller with no branches is refused, never given everything", async () => {
  await withWorld({ accounts: { cA: { branches: [A] } } }, async () => {
    assert.ok(refused(await call(H.counselorTransfer, { scope: scoped(), params: { id: "cA" }, body: { targetCounselorId: "cA" } })));
  });
});

test("bulk assign: a counselor/telecaller from another branch is refused; leads outside the caller's branches are skipped, not changed", async () => {
  const accounts = { cA: { branches: [A] }, cB: { branches: [B] }, tA: { role: "telecaller", branches: [A] }, tB: { role: "telecaller", branches: [B] } };
  const leads = { leadA: A, leadB: B };
  await withWorld({ accounts, leads }, async (w) => {
    assert.ok(refused(await call(H.bulkAssign, { scope: scoped(A), body: { ids: ["leadA"], counselorId: "cB" } })));
    assert.ok(refused(await call(H.bulkTelecaller, { scope: scoped(A), body: { ids: ["leadA"], telecallerId: "tB" } })));
    assert.deepEqual(w.writes, []);
    const r = await call(H.bulkTelecaller, { scope: scoped(A), body: { ids: ["leadA", "leadB"], telecallerId: "tA" } });
    assert.equal(r.body?.skippedScope, 1, JSON.stringify(r.body));
    assert.ok(w.writes.length > 0, "the in-scope lead is still assigned");
    assert.ok(!w.writes.some((x) => JSON.stringify(x.params).includes("leadB")), "the Branch B lead is never written");
    w.writes.length = 0;
    const c = await call(H.bulkAssign, { scope: scoped(A), body: { ids: ["leadA", "leadB"], counselorId: "cA" } });
    assert.equal(c.body?.skippedScope, 1, JSON.stringify(c.body));
    assert.ok(!w.writes.some((x) => JSON.stringify(x.params).includes("leadB")));
  });
});

test("lead edits: another branch's lead, or an assignee from another branch, is refused and writes nothing", async () => {
  const accounts = { cA: { branches: [A] }, cB: { branches: [B] } };
  await withWorld({ accounts, leads: { leadA: A, leadB: B } }, async (w) => {
    assert.ok(refused(await call(H.leadPatch, { scope: scoped(A), params: { id: "leadB" }, body: { notes: "x" } })));
    assert.ok(refused(await call(H.leadPatch, { scope: scoped(A), params: { id: "leadA" }, body: { assigned_counselor_id: "cB" } })));
    assert.equal((await call(H.leadPatch, { scope: scoped(A), params: { id: "missing" }, body: { notes: "x" } })).code, 404);
    assert.deepEqual(w.writes, []);
    assert.ok(!refused(await call(H.leadPatch, { scope: scoped(A), params: { id: "leadA" }, body: { notes: "x" } })), "own branch still works");
  });
});

test("moving a lead needs both its current branch and the destination inside the caller's branches", async () => {
  await withWorld({ leads: { leadA: A, leadB: B } }, async (w) => {
    assert.ok(refused(await call(H.leadBranch, { scope: scoped(A), params: { id: "leadB" }, body: { branchId: A } })), "from a foreign branch");
    assert.ok(refused(await call(H.leadBranch, { scope: scoped(A), params: { id: "leadA" }, body: { branchId: B } })), "into a foreign branch");
    assert.deepEqual(w.writes, []);
    const ok = await call(H.leadBranch, { scope: scoped(A, B), params: { id: "leadA" }, body: { branchId: B } });
    assert.equal(ok.code, 200, JSON.stringify(ok.body));
    assert.ok(w.writes.length > 0);
  });
});

test("branches: only an unrestricted caller creates one; updates only touch the caller's own branches", async () => {
  await withWorld({}, async (w) => {
    assert.ok(refused(await call(H.branchCreate, { scope: scoped(A), body: { name: "New" } })));
    assert.ok(refused(await call(H.branchUpdate, { scope: scoped(A), params: { id: B }, body: { name: "x" } })));
    assert.deepEqual(w.writes, []);
    assert.ok(!refused(await call(H.branchUpdate, { scope: scoped(A), params: { id: A }, body: { name: "x" } })), "own branch still works");
    assert.ok(!refused(await call(H.branchCreate, { role: "super_admin", scope: everything, body: { name: "New" } })));
  });
});

test("checkStaffInScope / checkLeadInScope report why", async () => {
  await withWorld({ accounts: { cB: { branches: [B] } }, leads: { leadB: B } }, async () => {
    assert.equal((await checkStaffInScope(pool, scoped(A), "cB")).code, "OUT_OF_SCOPE");
    assert.equal((await checkStaffInScope(pool, scoped(A), "ghost")).code, "NOT_FOUND");
    assert.equal((await checkLeadInScope(pool, scoped(A), "leadB")).code, "OUT_OF_SCOPE");
    assert.equal((await checkLeadInScope(pool, scoped(A), "ghost")).code, "NOT_FOUND");
    assert.equal((await checkLeadInScope(pool, everything, "ghost")).ok, true);
  });
});