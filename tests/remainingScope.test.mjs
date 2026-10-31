// ACCESS-03B batch 3: the last recorded scope gaps (checklist, leave, salary, notifications, broadcast,
// system alerts/auto-assign, partners, referral, finance payments). Real handlers; only the database is replaced.
// A refused request must write nothing; an allowed one must return and save the right thing.
process.env.DATABASE_URL = process.env.DATABASE_URL || "postgresql://nobody:nothing@127.0.0.1:1/none";

import test from "node:test";
import assert from "node:assert/strict";
import { checkRowInScope, checkLeaveInScope } from "../server/lib/scopeGuards.mjs";
import core from "../server/routes/core.mjs";
import finance from "../server/routes/finance.mjs";
import { pool } from "../server/lib/db.mjs";

const A = "aaaaaaaa-0000-0000-0000-000000000001";
const B = "bbbbbbbb-0000-0000-0000-000000000002";
const CA = "cccccccc-0000-4000-8000-00000000000a"; // counselor in A
const CB = "cccccccc-0000-4000-8000-00000000000b"; // counselor in B
const scoped = (...ids) => ({ allBranches: false, branchIds: ids });
const everything = { allBranches: true, branchIds: [] };

const handler = (router, path, method) => router.stack.find((l) => l.route?.path === path && l.route.methods[method]).route.stack.at(-1).handle;
const H = {
  checklist: handler(core, "/api/students/:id/checklist", "get"),
  leave: handler(core, "/api/leave/:id", "patch"),
  salary: handler(core, "/api/salary", "post"),
  notify: handler(core, "/api/notifications", "post"),
  broadcast: handler(core, "/api/notifications/broadcast", "post"),
  alertsGet: handler(core, "/api/system/alerts", "get"),
  alertsRun: handler(core, "/api/system/alerts/run", "post"),
  autoAssign: handler(core, "/api/system/auto-assign", "post"),
  partner: handler(core, "/api/partners/:id", "patch"),
  referral: handler(core, "/api/leads/:id/referral", "post"),
  payment: handler(finance, "/api/finance/payments/:id", "patch"),
};

function world({ leads = [], accounts = {}, partners = {}, payments = {}, leaves = {}, checklist = [] } = {}) {
  const writes = [];
  const original = pool.query.bind(pool);
  const answer = (sql, params = []) => {
    const text = String(sql).replace(/\s+/g, " ").trim();
    if (/^UPDATE counselor_leave_requests/.test(text)) { writes.push({ text: text.slice(0, 40), params }); return { rows: [{ id: params[0], status: params[1], counselor_id: leaves[params[0]] }] }; }
    if (/^UPDATE partners/.test(text)) { writes.push({ text: text.slice(0, 40), params }); return { rows: [{ id: params[0], ...partners[params[0]], full_name: params[1] }] }; }
    if (/^UPDATE student_payments/.test(text)) { writes.push({ text: text.slice(0, 40), params }); return { rows: [{ id: params[0], ...payments[params[0]], status: params[1] }] }; }
    if (/^INSERT INTO counselor_salary_records/.test(text)) { writes.push({ text: text.slice(0, 40), params }); return { rows: [{ counselor_id: params[0], month: params[1], year: params[2], net_salary: params[3] }] }; }
    if (/^INSERT INTO app_records \(id, table_name, data, branch_id\)/.test(text)) { writes.push({ text: text.slice(0, 40), params }); return { rows: [{ id: params[0], data: JSON.parse(params[2]), branch_id: params[3], created_at: "2026-01-01" }] }; }
    if (/^(INSERT|UPDATE|DELETE)/.test(text)) { writes.push({ text: text.slice(0, 40), params }); return { rows: [], rowCount: 1 }; }
    if (/^SELECT id, data, branch_id, created_at FROM app_records WHERE table_name = \$1/.test(text)) {
      if (params[0] === "student_leads") return { rows: leads.map(({ id, branch_id, ...d }) => ({ id, data: { id, ...d }, branch_id, created_at: "2026-01-01" })) };
      if (params[0] === "document_checklists") return { rows: checklist.map(({ id, ...d }) => ({ id, data: { id, ...d }, branch_id: null, created_at: "2026-01-01" })) };
      return { rows: [] };
    }
    if (/^SELECT branch_id FROM app_records WHERE table_name = 'student_leads' AND id::text/.test(text)) {
      const l = leads.find((x) => String(x.id) === String(params[0])); return { rows: l ? [{ branch_id: l.branch_id }] : [] };
    }
    if (/^SELECT branch_id FROM partners WHERE id::text/.test(text)) return { rows: params[0] in partners ? [{ branch_id: partners[params[0]].branch_id ?? null }] : [] };
    if (/^SELECT branch_id FROM student_payments WHERE id::text/.test(text)) return { rows: params[0] in payments ? [{ branch_id: payments[params[0]].branch_id ?? null }] : [] };
    if (/^SELECT counselor_id FROM counselor_leave_requests WHERE id::text/.test(text)) return { rows: params[0] in leaves ? [{ counselor_id: leaves[params[0]] }] : [] };
    if (/^SELECT id FROM auth_users WHERE id::text/.test(text)) return { rows: accounts[params[0]] ? [{ id: params[0] }] : [] };
    if (/^SELECT a\.id FROM counselor_users/.test(text)) return { rows: [] };
    if (/^SELECT id, lower\(email\)/.test(text)) return { rows: accounts[params[0]] ? [{ id: params[0], email: `${params[0]}@x.test` }] : [] };
    if (/^SELECT role, branch_id FROM user_roles/.test(text)) { const a = accounts[params[0]]; return { rows: a ? [{ role: a.role || "counselor", branch_id: a.branches?.[0] ?? null }] : [] }; }
    if (/^SELECT branch_id FROM user_branches WHERE user_id/.test(text)) return { rows: (accounts[params[0]]?.branches || []).map((b) => ({ branch_id: b })) };
    if (/^SELECT DISTINCT branch_id FROM app_records/.test(text)) return { rows: [] };
    return { rows: [], rowCount: 0 };
  };
  pool.query = async (sql, params) => answer(sql, params);
  return { writes, restore() { pool.query = original; } };
}
const withWorld = async (setup, fn) => { const w = world(setup); try { return await fn(w); } finally { w.restore(); } };

async function call(fn, { role = "admin", scope, params = {}, body = {}, query = {} }) {
  const res = { code: 200, body: null, status(c) { this.code = c; return this; }, json(b) { this.body = b; return this; } };
  try { await fn({ user: { id: "caller", role, email: "me@x.test" }, scope, params, body, query, headers: {}, ip: "t" }, res); }
  catch (error) { res.code = 599; res.body = { thrown: error.message }; }
  return res;
}
const refused = (r, code = "OUT_OF_SCOPE") => r.code === 403 && r.body?.code === code;
const accounts = { [CA]: { branches: [A] }, [CB]: { branches: [B] } };

test("checkRowInScope / checkLeaveInScope: unknown table throws, missing is 404, other branch is refused, unrestricted is not looked up", async () => {
  await withWorld({ partners: { p1: { branch_id: A } }, leaves: { l1: CA }, accounts }, async () => {
    await assert.rejects(() => checkRowInScope(pool, scoped(A), "users; DROP", "x"));
    assert.equal((await checkRowInScope(pool, scoped(A), "partners", "nope")).status, 404);
    assert.equal((await checkRowInScope(pool, scoped(B), "partners", "p1")).code, "OUT_OF_SCOPE");
    assert.equal((await checkRowInScope(pool, scoped(A), "partners", "p1")).ok, true);
    assert.equal((await checkLeaveInScope(pool, scoped(B), "l1")).code, "OUT_OF_SCOPE");
    assert.equal((await checkLeaveInScope(pool, scoped(A), "l1")).ok, true);
  });
  await withWorld({}, async (w) => { assert.equal((await checkRowInScope(pool, everything, "partners", "x")).ok, true); assert.deepEqual(w.writes, []); });
});

test("student checklist: own-branch student returns the checklist; another branch's, or a student with no branch, is refused", async () => {
  const leads = [{ id: "sA", branch_id: A, user_id: "uA" }, { id: "sB", branch_id: B, user_id: "uB" }, { id: "sN", branch_id: null }];
  const checklist = [{ id: "c1", document_type: "Passport", is_active: true, is_required: true }];
  await withWorld({ leads, checklist }, async () => {
    const ok = await call(H.checklist, { scope: scoped(A), params: { id: "sA" } });
    assert.equal(ok.code, 200, JSON.stringify(ok.body));
    assert.equal(ok.body.student_id, "sA");
    assert.deepEqual(ok.body.items.map((i) => i.document_type), ["Passport"]);
    assert.ok(refused(await call(H.checklist, { scope: scoped(A), params: { id: "sB" } })));
    assert.ok(refused(await call(H.checklist, { scope: scoped(A), params: { id: "uB" } })), "also by the student's user id");
    assert.ok(refused(await call(H.checklist, { scope: scoped(A), params: { id: "sN" } })));
    assert.equal((await call(H.checklist, { role: "super_admin", scope: everything, params: { id: "sB" } })).code, 200);
  });
});

test("leave decision: only for a counselor inside the caller's branches; the saved status and notification are right", async () => {
  await withWorld({ leaves: { lA: CA, lB: CB }, accounts }, async (w) => {
    assert.ok(refused(await call(H.leave, { scope: scoped(A), params: { id: "lB" }, body: { status: "approved" } })));
    assert.equal((await call(H.leave, { scope: scoped(A), params: { id: "ghost" }, body: { status: "approved" } })).code, 404);
    assert.deepEqual(w.writes, []);
    const ok = await call(H.leave, { scope: scoped(A), params: { id: "lA" }, body: { status: "approved", comments: "enjoy" } });
    assert.equal(ok.code, 200, JSON.stringify(ok.body));
    assert.equal(ok.body.row.status, "approved");
    assert.ok(w.writes.some((x) => /counselor_leave_requests/.test(x.text) && x.params[0] === "lA" && x.params[1] === "approved"));
    assert.ok(w.writes.some((x) => /app_records/.test(x.text) && String(x.params[2]).includes("enjoy")), "the counselor is told");
  });
});

test("salary: posting for another branch's counselor writes nothing; for an own-branch counselor saves the amount", async () => {
  await withWorld({ accounts }, async (w) => {
    assert.ok(refused(await call(H.salary, { scope: scoped(A), body: { counselorId: CB, month: "May", year: 2026, netSalary: 50000 } })));
    assert.deepEqual(w.writes, []);
    const ok = await call(H.salary, { scope: scoped(A), body: { counselorId: CA, month: "May", year: 2026, netSalary: 50000 } });
    assert.equal(ok.code, 200, JSON.stringify(ok.body));
    assert.equal(ok.body.net_salary, 50000);
    const saved = w.writes.find((x) => /counselor_salary_records/.test(x.text));
    assert.deepEqual(saved.params.slice(0, 4), [CA, "May", 2026, 50000]);
    assert.equal((await call(H.salary, { role: "super_admin", scope: everything, body: { counselorId: CB, month: "May", year: 2026, netSalary: 1 } })).code, 200);
  });
});

test("notifications: a limited caller can notify people in their branches only", async () => {
  await withWorld({ accounts }, async (w) => {
    assert.ok(refused(await call(H.notify, { scope: scoped(A), body: { userId: CB, title: "Hi", message: "x" } })));
    assert.deepEqual(w.writes, []);
    const ok = await call(H.notify, { scope: scoped(A), body: { userId: CA, title: "Hello team", message: "welcome" } });
    assert.deepEqual(ok.body, { ok: true });
    const saved = w.writes.find((x) => /app_records/.test(x.text));
    assert.ok(saved && String(saved.params[2]).includes("Hello team") && String(saved.params[2]).includes(CA));
    assert.equal((await call(H.notify, { role: "super_admin", scope: everything, body: { userId: CB, title: "T" } })).code, 200);
  });
});

test("global-only operations (broadcast, alerts, auto-assign) are refused for a limited caller and write nothing", async () => {
  await withWorld({}, async (w) => {
    const me = { scope: scoped(A) };
    assert.ok(refused(await call(H.broadcast, { ...me, body: { title: "All hands", audience: "all" } }), "NEEDS_HIGHER_AUTHORITY"));
    assert.ok(refused(await call(H.alertsGet, me), "NEEDS_HIGHER_AUTHORITY"));
    assert.ok(refused(await call(H.alertsRun, me), "NEEDS_HIGHER_AUTHORITY"));
    assert.ok(refused(await call(H.autoAssign, me), "NEEDS_HIGHER_AUTHORITY"));
    assert.deepEqual(w.writes, []);
    const status = await call(H.alertsGet, { role: "super_admin", scope: everything });
    assert.equal(status.code, 200);
    assert.ok("repeatHours" in status.body);
    const bc = await call(H.broadcast, { role: "super_admin", scope: everything, body: { title: "All hands", audience: "students" } });
    assert.equal(bc.code, 200, JSON.stringify(bc.body));
    assert.equal(bc.body.ok, true);
    assert.notEqual((await call(H.autoAssign, { role: "super_admin", scope: everything })).code, 403);
  });
});

test("partner edit: only a partner of the caller's branches; the saved change is returned", async () => {
  const partners = { pA: { branch_id: A }, pB: { branch_id: B }, pN: { branch_id: null } };
  await withWorld({ partners }, async (w) => {
    assert.ok(refused(await call(H.partner, { scope: scoped(A), params: { id: "pB" }, body: { fullName: "X" } })));
    assert.ok(refused(await call(H.partner, { scope: scoped(A), params: { id: "pN" }, body: { fullName: "X" } })));
    assert.equal((await call(H.partner, { scope: scoped(A), params: { id: "ghost" }, body: { fullName: "X" } })).code, 404);
    assert.deepEqual(w.writes.filter((x) => /partners/.test(x.text)), []);
    const ok = await call(H.partner, { scope: scoped(A), params: { id: "pA" }, body: { fullName: "Renamed" } });
    assert.equal(ok.code, 200, JSON.stringify(ok.body));
    assert.equal(ok.body.partner.full_name, "Renamed");
    assert.ok(w.writes.some((x) => /UPDATE partners/.test(x.text) && x.params[0] === "pA" && x.params[1] === "Renamed"));
  });
});

test("referral: another branch's lead is refused with no write; an own-branch lead reaches the referral logic and the attempt is recorded", async () => {
  const leads = [{ id: "lA", branch_id: A }, { id: "lB", branch_id: B }];
  await withWorld({ leads }, async (w) => {
    assert.ok(refused(await call(H.referral, { scope: scoped(A), params: { id: "lB" }, body: { code: "ABC123" } })));
    assert.deepEqual(w.writes, []);
    const ok = await call(H.referral, { scope: scoped(A), params: { id: "lA" }, body: { code: "NOSUCH" } });
    assert.equal(ok.code, 400, "reaches attachReferral, which rejects an unknown code");
    assert.equal(ok.body.outcome, "rejected_unknown");
    assert.ok(w.writes.some((x) => /referral_events/.test(x.text) && x.params.includes("NOSUCH")), "the attempt is recorded for lead lA");
  });
});

test("finance payment update: only a payment of the caller's branches; the saved status is returned", async () => {
  const payments = { yA: { branch_id: A, amount: 100 }, yB: { branch_id: B, amount: 200 } };
  await withWorld({ payments }, async (w) => {
    assert.ok(refused(await call(H.payment, { scope: scoped(A), params: { id: "yB" }, body: { status: "paid" } })));
    assert.deepEqual(w.writes.filter((x) => /student_payments/.test(x.text)), []);
    const ok = await call(H.payment, { scope: scoped(A), params: { id: "yA" }, body: { status: "paid" } });
    assert.equal(ok.code, 200, JSON.stringify(ok.body));
    assert.equal(ok.body.payment.status, "paid");
    assert.ok(w.writes.some((x) => /UPDATE student_payments/.test(x.text) && x.params[0] === "yA"));
    assert.equal((await call(H.payment, { role: "super_admin", scope: everything, params: { id: "yB" }, body: { status: "paid" } })).code, 200);
  });
});
