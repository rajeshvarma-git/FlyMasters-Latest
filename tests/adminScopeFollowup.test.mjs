// ACCESS-03B follow-up (reviewer findings on 2c95f01), with ADMIN_SCOPE_ENFORCED=true:
//   1. a scoped Admin must not read or act on another branch's case inbox / thread / reply / review;
//   2. a scoped Admin must be able to notify a legitimate student (lead in their branch, no staff membership);
//   3. the student portal's generic data API gives a scoped Admin their own branch's students, and only those.
// Real handlers and the real policy functions run; only the database is replaced.
// A refused request must write nothing; an allowed one must return and save the right thing.
process.env.DATABASE_URL = process.env.DATABASE_URL || "postgresql://nobody:nothing@127.0.0.1:1/none";

import test from "node:test";
import assert from "node:assert/strict";
import cases from "../server/routes/cases.mjs";
import core from "../server/routes/core.mjs";
import { pool } from "../server/lib/db.mjs";
import { checkRecipientInScope } from "../server/lib/scopeGuards.mjs";
import { getPool as studentPool } from "../server/student/postgres.ts";
import { branchAdminFolders, canUseFile, checkMutation, isBranchAdmin, visibleRows, visibleStorageListing } from "../server/student/dataPolicy.ts";

const A = "aaaaaaaa-0000-0000-0000-000000000001";
const B = "bbbbbbbb-0000-0000-0000-000000000002";
const norm = (sql) => String(sql).replace(/\s+/g, " ").trim();

async function withEnforced(value, fn) {
  const before = process.env.ADMIN_SCOPE_ENFORCED;
  process.env.ADMIN_SCOPE_ENFORCED = value;
  try { return await fn(); } finally { if (before === undefined) delete process.env.ADMIN_SCOPE_ENFORCED; else process.env.ADMIN_SCOPE_ENFORCED = before; }
}

// ------------------------------------------------------------------------------------ 1. case routes

const routeStack = (path, method) => cases.stack.find((l) => l.route?.path === path && l.route.methods[method]).route.stack;
const ROUTES = {
  inbox: routeStack("/api/case/inbox", "get"),
  detail: routeStack("/api/case/lead/:leadId", "get"),
  send: routeStack("/api/case/lead/:leadId/messages", "post"),
  review: routeStack("/api/case/lead/:leadId/messages/:messageId/review", "post"),
};

/** An in-memory app_records table behind the few queries the case routes make. */
function caseWorld() {
  const store = [
    { id: "LA", table: "student_leads", branch_id: A, data: { user_id: "uA", first_name: "Student", last_name: "A", email: "a@x.test" } },
    { id: "LB", table: "student_leads", branch_id: B, data: { user_id: "uB", first_name: "Student", last_name: "B", email: "b@x.test" } },
    { id: "cA", table: "case_conversations", branch_id: null, data: { student_user_id: "uA", lead_id: "LA", flow_version: 2 } },
    { id: "cB", table: "case_conversations", branch_id: null, data: { student_user_id: "uB", lead_id: "LB", flow_version: 2 } },
    { id: "mA", table: "case_messages", branch_id: null, data: { conversation_id: "cA", sender_role: "student", body: "hello from A", sent_at: "2026-01-01T10:00:00Z" } },
    { id: "mB", table: "case_messages", branch_id: null, data: { conversation_id: "cB", sender_role: "student", body: "private preview of B", sent_at: "2026-01-01T11:00:00Z" } },
    { id: "aiA", table: "case_messages", branch_id: null, data: { conversation_id: "cA", sender_role: "ai", source: "faq", review_status: "pending", body: "AI answer A", sent_at: "2026-01-01T10:05:00Z" } },
    { id: "aiB", table: "case_messages", branch_id: null, data: { conversation_id: "cB", sender_role: "ai", source: "faq", review_status: "pending", body: "AI answer B", sent_at: "2026-01-01T11:05:00Z" } },
  ];
  const writes = [];
  const original = pool.query.bind(pool);
  const shape = (r) => ({ id: r.id, data: r.data, branch_id: r.branch_id, created_at: "2026-01-01T00:00:00Z" });
  pool.query = async (sql, params = []) => {
    const text = norm(sql);
    let m;
    if (/^SELECT id, data, branch_id, created_at FROM app_records WHERE table_name = \$1 AND data->>\$2 = ANY\(\$3::text\[\]\)/.test(text)) {
      const [table, field, list] = params;
      return { rows: store.filter((r) => r.table === table && list.includes(String(r.data[field]))).map(shape) };
    }
    if (/^SELECT id, data, branch_id, created_at FROM app_records WHERE table_name = \$1/.test(text)) {
      return { rows: store.filter((r) => r.table === params[0]).map(shape) };
    }
    if (/^SELECT id, data, branch_id FROM app_records WHERE table_name = 'student_leads' AND id = \$1/.test(text)) {
      return { rows: store.filter((r) => r.table === "student_leads" && r.id === params[0]).map(shape) };
    }
    if (/^SELECT id, data FROM app_records WHERE table_name = 'case_messages' AND id = \$1/.test(text)) {
      return { rows: store.filter((r) => r.table === "case_messages" && r.id === params[0]).map(shape) };
    }
    if (/^SELECT id, data, created_at FROM app_records WHERE table_name = \$1 AND data->>\$2 = \$3 LIMIT 1/.test(text)) {
      return { rows: store.filter((r) => r.table === params[0] && String(r.data[params[1]]) === params[2]).slice(0, 1).map(shape) };
    }
    if (/^INSERT INTO app_records \(id, table_name, data, branch_id\)/.test(text)) {
      const [id, table, json, branch] = params;
      const data = JSON.parse(json);
      const existing = store.find((r) => r.id === id);
      writes.push({ id, table, data });
      if (existing) { Object.assign(existing.data, data); return { rows: [shape(existing)] }; }
      const row = { id: id || `new-${store.length}`, table, branch_id: branch, data };
      store.push(row);
      return { rows: [shape(row)] };
    }
    if (/^(INSERT|UPDATE|DELETE)/.test(text)) { writes.push({ text: text.slice(0, 60), params }); return { rows: [], rowCount: 1 }; }
    return { rows: [], rowCount: 0 };
  };
  return { store, writes, restore() { pool.query = original; } };
}

/** Runs the scope middleware and the handler of a staff case route, as Express would. */
async function runCase(stack, { user, params = {}, body = {} }) {
  const res = { code: 200, body: null, status(c) { this.code = c; return this; }, json(b) { this.body = b; return this; } };
  const req = { user, params, body, query: {}, headers: {}, ip: "t" };
  let proceed = false;
  await stack.at(-2).handle(req, res, () => { proceed = true; });
  if (proceed) await stack.at(-1).handle(req, res);
  return res;
}

const adminA = { id: "adm-a", role: "admin", branch_id: A, branch_ids: [A] };
const adminNone = { id: "adm-0", role: "admin", branch_id: null, branch_ids: [] };
const superAdmin = { id: "sup", role: "super_admin", branch_id: null, branch_ids: [] };
const headA = { id: "head-a", role: "branch_head", branch_id: A, branch_ids: [A] };

test("case inbox: a scoped Admin sees their branch's conversations and never another branch's lead or message preview", async () => {
  await withEnforced("true", async () => {
    const w = caseWorld();
    try {
      const res = await runCase(ROUTES.inbox, { user: adminA });
      assert.equal(res.code, 200, JSON.stringify(res.body));
      assert.deepEqual(res.body.conversations.map((c) => c.lead_id), ["LA"]);
      assert.equal(res.body.conversations[0].student_name, "Student A");
      assert.equal(res.body.conversations[0].last_message.body, "AI answer A");
      const raw = JSON.stringify(res.body);
      assert.ok(!raw.includes("LB") && !raw.includes("Student B") && !raw.includes("private preview of B"), "nothing of branch B leaks");
    } finally { w.restore(); }
  });
});

test("case inbox: Super Admin sees every branch; Admin sees every branch while the rollout switch is off; Branch Head stays in their branch", async () => {
  const seen = async (user) => {
    const w = caseWorld();
    try { return (await runCase(ROUTES.inbox, { user })).body.conversations.map((c) => c.lead_id).sort(); } finally { w.restore(); }
  };
  await withEnforced("true", async () => {
    assert.deepEqual(await seen(superAdmin), ["LA", "LB"]);
    assert.deepEqual(await seen(headA), ["LA"]);
  });
  await withEnforced("false", async () => {
    assert.deepEqual(await seen(adminA), ["LA", "LB"], "switch off keeps today's unrestricted Admin");
  });
});

test("case inbox and thread: a scoped Admin with no branch is refused, not given everything", async () => {
  await withEnforced("true", async () => {
    const w = caseWorld();
    try {
      for (const stack of [ROUTES.inbox, ROUTES.detail]) {
        const res = await runCase(stack, { user: adminNone, params: { leadId: "LA" } });
        assert.equal(res.code, 403);
        assert.equal(res.body.code, "NO_BRANCH_SCOPE");
      }
      assert.deepEqual(w.writes, []);
    } finally { w.restore(); }
  });
});

test("case thread: another branch's conversation is not found and nothing is written; own branch loads the right messages", async () => {
  await withEnforced("true", async () => {
    const w = caseWorld();
    try {
      const other = await runCase(ROUTES.detail, { user: adminA, params: { leadId: "LB" } });
      assert.equal(other.code, 404);
      assert.ok(!JSON.stringify(other.body).includes("private preview"));
      assert.deepEqual(w.writes, [], "a refused read must not even mark the thread as read");

      const own = await runCase(ROUTES.detail, { user: adminA, params: { leadId: "LA" } });
      assert.equal(own.code, 200, JSON.stringify(own.body));
      assert.equal(own.body.conversation_id, "cA");
      assert.equal(own.body.student.lead_id, "LA");
      assert.ok(own.body.messages.some((m) => m.body === "hello from A"));
      assert.ok(!JSON.stringify(own.body).includes("private preview of B"));

      const sup = await runCase(ROUTES.detail, { user: superAdmin, params: { leadId: "LB" } });
      assert.equal(sup.code, 200, JSON.stringify(sup.body));
      assert.ok(sup.body.messages.some((m) => m.body === "private preview of B"));
    } finally { w.restore(); }
  });
});

test("case reply: a scoped Admin cannot reply into another branch's chat (nothing saved); own branch saves the reply", async () => {
  await withEnforced("true", async () => {
    const w = caseWorld();
    try {
      const other = await runCase(ROUTES.send, { user: adminA, params: { leadId: "LB" }, body: { message: "hi B" } });
      assert.equal(other.code, 404);
      assert.deepEqual(w.writes, []);

      const own = await runCase(ROUTES.send, { user: adminA, params: { leadId: "LA" }, body: { message: "hi A" } });
      assert.equal(own.code, 200, JSON.stringify(own.body));
      assert.equal(own.body.message.body, "hi A");
      assert.equal(own.body.message.conversation_id, "cA");
      assert.ok(w.writes.some((x) => x.table === "case_messages" && x.data.body === "hi A" && x.data.conversation_id === "cA"));
      assert.ok(!w.writes.some((x) => x.data?.conversation_id === "cB"));
    } finally { w.restore(); }
  });
});

test("AI answer review: a scoped Admin cannot approve or correct another branch's message; own branch is reviewed and saved", async () => {
  await withEnforced("true", async () => {
    const w = caseWorld();
    try {
      for (const action of [{ action: "approve" }, { action: "correct", body: "edited" }]) {
        const other = await runCase(ROUTES.review, { user: adminA, params: { leadId: "LB", messageId: "aiB" }, body: action });
        assert.equal(other.code, 404);
      }
      assert.deepEqual(w.writes, []);
      assert.equal(w.store.find((r) => r.id === "aiB").data.review_status, "pending");

      const own = await runCase(ROUTES.review, { user: adminA, params: { leadId: "LA", messageId: "aiA" }, body: { action: "approve" } });
      assert.equal(own.code, 200, JSON.stringify(own.body));
      assert.equal(own.body.message.review_status, "approved");
      assert.equal(w.store.find((r) => r.id === "aiA").data.review_status, "approved");
      assert.equal(w.store.find((r) => r.id === "aiA").data.reviewed_by, "adm-a");
    } finally { w.restore(); }
  });
});

// ------------------------------------------------------------------------------------ 2. notifications

const notify = core.stack.find((l) => l.route?.path === "/api/notifications" && l.route.methods.post).route.stack.at(-1).handle;
const STUDENT_A = "11111111-0000-4000-8000-00000000000a"; // lead in A, no staff membership
const STUDENT_B = "11111111-0000-4000-8000-00000000000b"; // lead in B
const STUDENT_AB = "11111111-0000-4000-8000-0000000000ab"; // leads in A and B
const STUDENT_NONE = "11111111-0000-4000-8000-000000000000"; // account, no lead, no membership
const STAFF_A = "22222222-0000-4000-8000-00000000000a";
const STAFF_B = "22222222-0000-4000-8000-00000000000b";
const people = {
  [STUDENT_A]: { leads: [A], staff: [] },
  [STUDENT_B]: { leads: [B], staff: [] },
  [STUDENT_AB]: { leads: [A, B], staff: [] },
  [STUDENT_NONE]: { leads: [], staff: [] },
  [STAFF_A]: { leads: [], staff: [A] },
  [STAFF_B]: { leads: [], staff: [B] },
};

function notifyWorld() {
  const writes = [];
  const original = pool.query.bind(pool);
  pool.query = async (sql, params = []) => {
    const text = norm(sql);
    if (/^INSERT INTO app_records \(id, table_name, data, branch_id\)/.test(text)) {
      writes.push({ table: params[1], data: JSON.parse(params[2]) });
      return { rows: [{ id: params[0] || "n1", data: JSON.parse(params[2]), branch_id: params[3], created_at: "2026-01-01" }] };
    }
    if (/^(INSERT|UPDATE|DELETE)/.test(text)) { writes.push({ text: text.slice(0, 50), params }); return { rows: [], rowCount: 1 }; }
    if (/^SELECT id FROM auth_users WHERE id::text/.test(text)) return { rows: people[params[0]] ? [{ id: params[0] }] : [] };
    if (/^SELECT a\.id FROM counselor_users/.test(text)) return { rows: [] };
    if (/^SELECT id, lower\(email\)/.test(text)) return { rows: people[params[0]] ? [{ id: params[0], email: `${params[0]}@x.test` }] : [] };
    if (/^SELECT role, branch_id FROM user_roles/.test(text)) {
      const p = people[params[0]];
      return { rows: p ? [{ role: p.staff.length ? "counselor" : "student", branch_id: p.staff[0] ?? null }] : [] };
    }
    if (/^SELECT branch_id FROM user_branches WHERE user_id/.test(text)) return { rows: (people[params[0]]?.staff || []).map((b) => ({ branch_id: b })) };
    if (/^SELECT DISTINCT branch_id FROM app_records/.test(text)) return { rows: (people[params[0]]?.leads || []).map((b) => ({ branch_id: b })) };
    return { rows: [], rowCount: 0 };
  };
  return { writes, restore() { pool.query = original; } };
}

async function callNotify(scope, userId, role = "admin") {
  const res = { code: 200, body: null, status(c) { this.code = c; return this; }, json(b) { this.body = b; return this; } };
  await notify({ user: { id: "caller", role }, scope, body: { userId, title: "Fee reminder", message: "please pay" }, headers: {}, ip: "t" }, res);
  return res;
}
const scopedA = { allBranches: false, branchIds: [A] };

test("notifications: a scoped Admin can notify a student whose lead is in their branch, though the student has no staff membership", async () => {
  const w = notifyWorld();
  try {
    const res = await callNotify(scopedA, STUDENT_A);
    assert.equal(res.code, 200, JSON.stringify(res.body));
    assert.deepEqual(res.body, { ok: true });
    const saved = w.writes.find((x) => x.table === "notifications" || JSON.stringify(x.data || {}).includes("Fee reminder"));
    assert.ok(saved, "the notification was stored");
    assert.equal(saved.data.user_id, STUDENT_A);
    assert.equal(saved.data.title, "Fee reminder");
  } finally { w.restore(); }
});

test("notifications: out-of-scope students, mixed-branch students and students with no known branch are refused and nothing is written", async () => {
  const w = notifyWorld();
  try {
    for (const id of [STUDENT_B, STUDENT_AB, STUDENT_NONE, STAFF_B]) {
      const res = await callNotify(scopedA, id);
      assert.equal(res.code, 403, `${id}: ${JSON.stringify(res.body)}`);
      assert.equal(res.body.code, "OUT_OF_SCOPE");
    }
    assert.equal((await callNotify(scopedA, "11111111-0000-4000-8000-ffffffffffff")).code, 404);
    assert.deepEqual(w.writes, []);
  } finally { w.restore(); }
});

test("notifications: staff in the branch and Super Admin behave as before", async () => {
  const w = notifyWorld();
  try {
    assert.equal((await callNotify(scopedA, STAFF_A)).code, 200);
    assert.equal((await callNotify({ allBranches: true, branchIds: [] }, STUDENT_B, "super_admin")).code, 200);
    assert.equal((await checkRecipientInScope(null, { allBranches: true }, STUDENT_B)).ok, true, "unrestricted callers need no lookup");
  } finally { w.restore(); }
});

// ------------------------------------------------------------------------------------ 3. student data API

const leadRows = [
  { id: "LA", branch_id: A, user_id: "uA", email: "a@x.test" },
  { id: "LB", branch_id: B, user_id: "uB", email: "b@x.test" },
  { id: "LM1", branch_id: A, user_id: "uM", email: "m@x.test" }, // uM is in A ...
  { id: "LM2", branch_id: B, user_id: "uM", email: "m@x.test" }, // ... and in B
  { id: "LN", branch_id: null, user_id: "uN", email: "n@x.test" }, // no branch at all
];

function dataWorld(extra = {}) {
  const db = studentPool();
  const original = db.query.bind(db);
  db.query = async (sql, params = []) => {
    const text = norm(sql);
    if (/branch_id = ANY\(\$1::uuid\[\]\)/.test(text) && /^SELECT id,/.test(text)) {
      return { rows: leadRows.filter((l) => l.branch_id && params[0].includes(l.branch_id)).map((l) => ({ id: l.id, user_id: l.user_id, email: l.email })) };
    }
    if (/branch_id IS NULL OR NOT/.test(text)) {
      return { rows: leadRows.filter((l) => !l.branch_id || !params[0].includes(l.branch_id)).map((l) => ({ user_id: l.user_id, email: l.email })) };
    }
    if (/FROM user_roles WHERE user_id = ANY/.test(text)) return { rows: [] };
    if (/data->>'file_path' = ANY/.test(text)) return { rows: (extra.fileRows || []).filter((r) => params[0].includes(r.data.file_path)) };
    return { rows: [], rowCount: 0 };
  };
  return { restore() { db.query = original; } };
}
const viewerFor = (branchIds) => ({ userId: "adm-a", email: "adm@x.test", role: "admin", admin: false, keys: new Set(["adm-a"]), branchIds });
const ids = (rows) => rows.map((r) => r.id).sort();

test("student data API: a scoped Admin is recognised, Super Admin and students are not", () => {
  assert.equal(isBranchAdmin(viewerFor([A])), true);
  assert.equal(isBranchAdmin({ ...viewerFor([A]), role: "super_admin", admin: true, branchIds: undefined }), false);
  assert.equal(isBranchAdmin({ userId: "s", email: "", role: "student", admin: false, keys: new Set(["s"]) }), false);
});

test("student data API: a scoped Admin sees their own branch's students' records and none of another branch's", async () => {
  const w = dataWorld();
  try {
    const v = viewerFor([A]);
    assert.deepEqual(ids(await visibleRows(v, "student_leads", leadRows)), ["LA"], "only the unambiguous in-branch lead");
    const docs = [
      { id: "dA", user_id: "uA" }, { id: "dB", user_id: "uB" }, { id: "dM", user_id: "uM" }, { id: "dN", user_id: "uN" },
      { id: "dAmail", student_email: "A@X.test" }, { id: "dBmail", email: "b@x.test" }, { id: "dAlead", student_id: "LA" }, { id: "dBlead", student_id: "LB" },
    ];
    assert.deepEqual(ids(await visibleRows(v, "documents", docs)), ["dA", "dAlead", "dAmail"]);
    assert.deepEqual(ids(await visibleRows(v, "notifications", docs)), ["dA", "dAlead", "dAmail"]);
  } finally { w.restore(); }
});

test("student data API: a scoped Admin keeps public content, gets nothing from admin-only tables, and one with no branch sees no student", async () => {
  const w = dataWorld();
  try {
    const v = viewerFor([A]);
    const universities = [{ id: "u1" }, { id: "u2" }];
    assert.deepEqual(ids(await visibleRows(v, "universities", universities)), ["u1", "u2"]);
    assert.equal(await visibleRows(v, "audit_logs", [{ id: "x" }]), null);
    assert.deepEqual(await visibleRows(viewerFor([]), "documents", [{ id: "dA", user_id: "uA" }]), []);
    assert.deepEqual(await visibleRows({ ...viewerFor([A]), admin: true, branchIds: undefined }, "documents", [{ id: "dB", user_id: "uB" }]), [{ id: "dB", user_id: "uB" }], "Super Admin is unrestricted");
  } finally { w.restore(); }
});

test("student data API: a scoped Admin may change their own branch's records and is refused for other branches' or unknown ones", async () => {
  const w = dataWorld();
  try {
    const v = viewerFor([A]);
    const out = (r) => assert.match(String(r), /outside the branches you manage/);
    assert.equal(await checkMutation(v, { action: "update", table: "documents", payload: { status: "approved" } }, [{ id: "dA", user_id: "uA" }]), null);
    out(await checkMutation(v, { action: "update", table: "documents", payload: { status: "approved" } }, [{ id: "dB", user_id: "uB" }]));
    out(await checkMutation(v, { action: "update", table: "documents", payload: { status: "approved" } }, [{ id: "dN", user_id: "uN" }]));
    out(await checkMutation(v, { action: "update", table: "documents", payload: { user_id: "uB" } }, [{ id: "dA", user_id: "uA" }]));
    assert.equal(await checkMutation(v, { action: "delete", table: "documents" }, [{ id: "dA", user_id: "uA" }]), null);
    out(await checkMutation(v, { action: "delete", table: "documents" }, [{ id: "dM", user_id: "uM" }]));
    assert.equal(await checkMutation(v, { action: "insert", table: "documents", rows: [{ id: "n1", user_id: "uA" }] }, []), null);
    out(await checkMutation(v, { action: "insert", table: "documents", rows: [{ id: "n2", user_id: "uB" }] }, []));
    assert.equal(await checkMutation(v, { action: "insert", table: "student_leads", rows: [{ id: "new", branch_id: A }] }, []), null);
    out(await checkMutation(v, { action: "insert", table: "student_leads", rows: [{ id: "new", branch_id: B }] }, []));
    assert.equal(await checkMutation(v, { action: "update", table: "student_leads", payload: { assigned_counselor_id: "c1" } }, [{ id: "LA" }]), null);
    out(await checkMutation(v, { action: "update", table: "student_leads", payload: { branch_id: B } }, [{ id: "LA" }]));
    out(await checkMutation(v, { action: "update", table: "student_leads", payload: {} }, [{ id: "LB" }]));
    assert.equal(await checkMutation(v, { action: "update", table: "audit_logs", payload: {} }, []), "Not allowed.");
  } finally { w.restore(); }
});

test("student data API: stored files follow the same branches (folders and files their records point at)", async () => {
  const fileRows = [
    { data: { file_path: "legacy/a.pdf", user_id: "uA" } },
    { data: { file_path: "legacy/b.pdf", user_id: "uB" } },
  ];
  const w = dataWorld({ fileRows });
  try {
    const v = viewerFor([A]);
    assert.equal(await canUseFile(v, "uA/passport.pdf", "read"), true);
    assert.equal(await canUseFile(v, "uA/passport.pdf", "write"), true);
    assert.equal(await canUseFile(v, "uB/passport.pdf", "read"), false);
    assert.equal(await canUseFile(v, "uM/passport.pdf", "read"), false, "student in two branches");
    assert.equal(await canUseFile(v, "legacy/a.pdf", "read"), true);
    assert.equal(await canUseFile(v, "legacy/b.pdf", "read"), false);
    const listing = [{ path: "uA/x.pdf" }, { path: "uB/y.pdf" }, { path: "uM/z.pdf" }, { path: "legacy/a.pdf" }, { path: "legacy/b.pdf" }];
    assert.deepEqual((await visibleStorageListing(v, listing)).map((r) => r.path), ["uA/x.pdf", "legacy/a.pdf"]);
    assert.deepEqual(await branchAdminFolders(v), ["uA"]);
  } finally { w.restore(); }
});
