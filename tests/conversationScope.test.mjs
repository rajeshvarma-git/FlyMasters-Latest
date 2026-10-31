// ACCESS-03B follow-up: WhatsApp conversations, chat supervision, escalations and communication consent
// respect the caller's branches. The real route handlers run; only the database is replaced.
// A refused request must write nothing, and an allowed one must return and save the right thing.
process.env.DATABASE_URL = process.env.DATABASE_URL || "postgresql://nobody:nothing@127.0.0.1:1/none";

import test from "node:test";
import assert from "node:assert/strict";
import {
  checkConversationInScope, checkEscalationInScope, checkSubjectInScope, conversationBranch,
  managerSeesConversation, requireGlobalScope,
} from "../server/lib/scopeGuards.mjs";
import core from "../server/routes/core.mjs";
import comms from "../server/routes/comms.mjs";
import { pool } from "../server/lib/db.mjs";

const A = "aaaaaaaa-0000-0000-0000-000000000001";
const B = "bbbbbbbb-0000-0000-0000-000000000002";
const scoped = (...ids) => ({ allBranches: false, branchIds: ids });
const everything = { allBranches: true, branchIds: [] };

const handler = (router, path, method) => router.stack.find((l) => l.route?.path === path && l.route.methods[method]).route.stack.at(-1).handle;
const W = {
  list: handler(core, "/api/whatsapp/conversations", "get"),
  messages: handler(core, "/api/whatsapp/conversations/:id/messages", "get"),
  send: handler(core, "/api/whatsapp/messages", "post"),
  read: handler(core, "/api/whatsapp/conversations/:id/read", "post"),
  sync: handler(core, "/api/whatsapp/sync-staff", "post"),
};
const C = {
  view: handler(comms, "/api/comms/supervision/:kind/:id", "get"),
  join: handler(comms, "/api/comms/supervision/:kind/:id/join", "post"),
  say: handler(comms, "/api/comms/supervision/:kind/:id/message", "post"),
  escList: handler(comms, "/api/comms/escalations", "get"),
  escPatch: handler(comms, "/api/comms/escalations/:id", "patch"),
  consentGet: handler(comms, "/api/comms/consent", "get"),
  consentPut: handler(comms, "/api/comms/consent", "put"),
};

/**
 * records: table -> [{ id, branch_id, ...data }].   escalations: id -> { branch_id, status }.
 * privateConv: id -> counselor account id.   accounts: id -> { branches }.
 */
function world({ records = {}, escalations = {}, privateConv = {}, accounts = {}, consent = [] } = {}) {
  const writes = [];
  const queries = [];
  const original = pool.query.bind(pool);
  const answer = (sql, params = []) => {
    const text = String(sql).replace(/\s+/g, " ").trim();
    queries.push({ text, params });
    if (/^UPDATE chat_escalations/.test(text)) {
      writes.push({ text: text.slice(0, 40), params });
      return { rows: [{ ...escalations[params[0]], id: params[0], status: params[1], resolution_note: params[3] }] };
    }
    if (/^INSERT INTO communication_consent/.test(text)) {
      writes.push({ text: text.slice(0, 40), params });
      return { rows: [{ id: "consent-1", subject_id: params[1], channel: params[2], opted_out: params[3] }] };
    }
    if (/^INSERT INTO app_records \(id, table_name, data, branch_id\)/.test(text)) {
      writes.push({ text: text.slice(0, 40), params });
      return { rows: [{ id: params[0], data: JSON.parse(params[2]), branch_id: params[3], created_at: "2026-01-01" }] };
    }
    if (/^(INSERT|UPDATE|DELETE)/.test(text)) { writes.push({ text: text.slice(0, 40), params }); return { rows: [], rowCount: 1 }; }
    if (/^SELECT id, data, branch_id, created_at FROM app_records WHERE table_name = \$1/.test(text)) {
      return { rows: (records[params[0]] || []).map(({ id, branch_id, ...data }) => ({ id, data: { id, ...data }, branch_id: branch_id ?? null, created_at: "2026-01-01" })) };
    }
    if (/^SELECT branch_id FROM app_records WHERE table_name = \$1 AND id::text = \$2/.test(text)) {
      const row = (records[params[0]] || []).find((r) => String(r.id) === String(params[1]));
      return { rows: row ? [{ branch_id: row.branch_id ?? null }] : [] };
    }
    if (/^SELECT counselor_id FROM private_conversations WHERE id::text/.test(text)) {
      return { rows: params[0] in privateConv ? [{ counselor_id: privateConv[params[0]] }] : [] };
    }
    if (/^SELECT id, counselor_id, student_id, last_message_at, created_at FROM private_conversations/.test(text)) {
      return { rows: Object.entries(privateConv).map(([id, counselor_id]) => ({ id, counselor_id, student_id: "s1", last_message_at: null, created_at: "2026-01-01" })) };
    }
    if (/^SELECT branch_id FROM chat_escalations WHERE id::text/.test(text)) {
      return { rows: params[0] in escalations ? [{ branch_id: escalations[params[0]].branch_id ?? null }] : [] };
    }
    if (/^SELECT \* FROM chat_escalations WHERE id = \$1/.test(text)) {
      return { rows: params[0] in escalations ? [{ id: params[0], status: "open", ...escalations[params[0]] }] : [] };
    }
    if (/^SELECT branch_id FROM app_records WHERE table_name = 'student_leads' AND \(data->>'user_id'/.test(text)) {
      return { rows: (records.student_leads || []).filter((r) => String(r.user_id) === String(params[0]) || String(r.id) === String(params[0])).map((r) => ({ branch_id: r.branch_id ?? null })) };
    }
    if (/^SELECT \* FROM communication_consent/.test(text)) return { rows: consent.filter((c) => !params[0] || c.subject_id === params[0]) };
    if (/^SELECT id FROM auth_users WHERE id::text/.test(text)) return { rows: accounts[params[0]] ? [{ id: params[0] }] : [] };
    if (/^SELECT a\.id FROM counselor_users/.test(text)) return { rows: [] };
    if (/^SELECT id, lower\(email\)/.test(text)) return { rows: accounts[params[0]] ? [{ id: params[0], email: `${params[0]}@x.test` }] : [] };
    if (/^SELECT role, branch_id FROM user_roles/.test(text)) { const a = accounts[params[0]]; return { rows: a ? [{ role: "counselor", branch_id: a.branches?.[0] ?? null }] : [] }; }
    if (/^SELECT branch_id FROM user_branches WHERE user_id/.test(text)) return { rows: (accounts[params[0]]?.branches || []).map((b) => ({ branch_id: b })) };
    if (/^SELECT DISTINCT branch_id FROM app_records/.test(text)) return { rows: [] };
    return { rows: [], rowCount: 0 };
  };
  pool.query = async (sql, params) => answer(sql, params);
  return { writes, queries, restore() { pool.query = original; } };
}
const withWorld = async (setup, fn) => { const w = world(setup); try { return await fn(w); } finally { w.restore(); } };

async function call(fn, { role = "admin", scope, params = {}, body = {}, query = {}, id = "caller" }) {
  const res = { code: 200, body: null, status(c) { this.code = c; return this; }, json(b) { this.body = b; return this; } };
  try {
    await fn({ user: { id, role, email: "me@x.test" }, scope, params, body, query, headers: {}, ip: "t" }, res);
  } catch (error) {
    res.code = 599; res.body = { thrown: error.message };
  }
  return res;
}
const refused = (r, code = "OUT_OF_SCOPE") => r.code === 403 && r.body?.code === code;

// ---------- the pure rules ----------

test("conversationBranch: own branch first, then the lead's; unknown stays unknown", () => {
  assert.equal(conversationBranch({ branch_id: A }, []), A);
  assert.equal(conversationBranch({ lead_id: "L", branch_id: null }, [{ id: "L", branch_id: B }]), B);
  assert.equal(conversationBranch({ lead_id: "X" }, [{ id: "L", branch_id: B }]), null);
});

test("managerSeesConversation: managers need an in-scope branch; counselors/telecallers stay governed by assignment; unrestricted passes", () => {
  const conv = { branch_id: B };
  assert.equal(managerSeesConversation({ role: "admin" }, scoped(A), conv), false);
  assert.equal(managerSeesConversation({ role: "admin" }, scoped(A, B), conv), true);
  assert.equal(managerSeesConversation({ role: "admin" }, scoped(A), { branch_id: null }), false, "unknown branch is refused");
  assert.equal(managerSeesConversation({ role: "counselor" }, scoped(A), { branch_id: null }), true, "assignment already limits them");
  assert.equal(managerSeesConversation({ role: "admin" }, everything, conv), true);
  assert.equal(requireGlobalScope(everything).ok, true);
  assert.equal(requireGlobalScope(scoped(A)).code, "NEEDS_HIGHER_AUTHORITY");
});

test("unrestricted callers are never looked up", async () => {
  await withWorld({}, async (w) => {
    assert.equal((await checkConversationInScope(pool, everything, "whatsapp", "x")).ok, true);
    assert.equal((await checkEscalationInScope(pool, everything, "x")).ok, true);
    assert.equal((await checkSubjectInScope(pool, everything, "x")).ok, true);
    assert.deepEqual(w.queries, []);
  });
});

test("checkConversationInScope: unknown kind 400, missing 404, wrong branch refused", async () => {
  await withWorld({ records: { whatsapp_conversations: [{ id: "cA", branch_id: A }, { id: "cB", branch_id: B }] } }, async () => {
    assert.equal((await checkConversationInScope(pool, scoped(A), "email", "cA")).status, 400);
    assert.equal((await checkConversationInScope(pool, scoped(A), "whatsapp", "nope")).status, 404);
    assert.equal((await checkConversationInScope(pool, scoped(A), "whatsapp", "cB")).code, "OUT_OF_SCOPE");
    assert.equal((await checkConversationInScope(pool, scoped(A), "whatsapp", "cA")).ok, true);
  });
});

// ---------- WhatsApp ----------

const waWorld = () => ({
  records: {
    whatsapp_conversations: [
      { id: "convA", branch_id: A, phone_number: "111", assigned_staff_id: "tel1", staff_role: "telecaller" },
      { id: "convB", branch_id: B, phone_number: "222" },
      { id: "convViaLead", branch_id: null, lead_id: "leadA", phone_number: "333" },
      { id: "convNowhere", branch_id: null, phone_number: "444" },
    ],
    student_leads: [{ id: "leadA", branch_id: A, entity_type: "lead" }],
    whatsapp_messages: [
      { id: "m1", conversation_id: "convA", direction: "inbound", body: "hi", is_read: false, created_at: "2026-01-01T01:00:00Z" },
      { id: "m2", conversation_id: "convA", direction: "inbound", body: "again", is_read: false, created_at: "2026-01-01T02:00:00Z" },
      { id: "m3", conversation_id: "convB", direction: "inbound", body: "secret", is_read: false, created_at: "2026-01-01T03:00:00Z" },
    ],
  },
});

test("WhatsApp list: a branch-limited Admin sees only conversations of their branches (own branch, or the lead's)", async () => {
  await withWorld(waWorld(), async () => {
    const r = await call(W.list, { scope: scoped(A) });
    assert.equal(r.code, 200, JSON.stringify(r.body));
    assert.deepEqual(r.body.map((c) => c.id).sort(), ["convA", "convViaLead"]);
    const all = await call(W.list, { role: "super_admin", scope: everything });
    assert.equal(all.body.length, 4, "Super Admin / enforcement off still sees everything");
    const b = await call(W.list, { scope: scoped(B) });
    assert.deepEqual(b.body.map((c) => c.id), ["convB"]);
  });
});

test("WhatsApp messages: in-scope conversation returns exactly its messages; other branches and unknown branches are refused", async () => {
  await withWorld(waWorld(), async () => {
    const ok = await call(W.messages, { scope: scoped(A), params: { id: "convA" } });
    assert.equal(ok.code, 200, JSON.stringify(ok.body));
    assert.deepEqual(ok.body.map((m) => m.id), ["m1", "m2"]);
    assert.ok(refused(await call(W.messages, { scope: scoped(A), params: { id: "convB" } })));
    assert.ok(refused(await call(W.messages, { scope: scoped(A), params: { id: "convNowhere" } })));
    assert.equal((await call(W.messages, { scope: scoped(A), params: { id: "ghost" } })).code, 404);
  });
});

test("WhatsApp mark-read: marks only the in-scope conversation's unread messages and reports the count; other branches write nothing", async () => {
  await withWorld(waWorld(), async (w) => {
    assert.ok(refused(await call(W.read, { scope: scoped(A), params: { id: "convB" } })));
    assert.deepEqual(w.writes, []);
    const ok = await call(W.read, { scope: scoped(A), params: { id: "convA" } });
    assert.equal(ok.code, 200, JSON.stringify(ok.body));
    assert.deepEqual(ok.body, { ok: true, count: 2 });
    assert.equal(w.writes.length, 2);
    assert.ok(w.writes.every((x) => JSON.stringify(x.params).includes("convA")), "only convA messages are updated");
    assert.ok(!w.writes.some((x) => JSON.stringify(x.params).includes("secret")));
  });
});

test("WhatsApp send: an Admin cannot reply into another branch's conversation (scope refusal), and still cannot reply in their own (monitor only)", async () => {
  await withWorld(waWorld(), async (w) => {
    assert.ok(refused(await call(W.send, { scope: scoped(A), body: { conversationId: "convB", message: "hello" } })));
    const own = await call(W.send, { scope: scoped(A), body: { conversationId: "convA", message: "hello" } });
    assert.equal(own.code, 403);
    assert.notEqual(own.body.code, "OUT_OF_SCOPE", "monitor-only rule, not a scope problem");
    assert.deepEqual(w.writes, []);
  });
});

test("WhatsApp: an assigned telecaller's own conversation is unaffected, even with no branch recorded", async () => {
  await withWorld(waWorld(), async () => {
    const r = await call(W.list, { role: "telecaller", id: "tel1", scope: scoped(A) });
    assert.equal(r.code, 200, JSON.stringify(r.body));
    assert.ok(r.body.some((c) => c.id === "convA"));
    const m = await call(W.messages, { role: "telecaller", id: "tel1", scope: scoped(A), params: { id: "convA" } });
    assert.equal(m.code, 200);
  });
});

test("WhatsApp sync-staff: a branch-limited caller is refused (it re-routes every branch); Super Admin runs it", async () => {
  await withWorld(waWorld(), async () => {
    assert.ok(refused(await call(W.sync, { scope: scoped(A) }), "NEEDS_HIGHER_AUTHORITY"));
    const ok = await call(W.sync, { role: "super_admin", scope: everything });
    assert.equal(ok.code, 200, JSON.stringify(ok.body));
    assert.equal(ok.body.ok, true);
  });
});

// ---------- chat supervision ----------

const chatWorld = () => ({
  records: {
    whatsapp_conversations: [{ id: "wA", branch_id: A }, { id: "wB", branch_id: B }, { id: "wNone", branch_id: null }],
    whatsapp_messages: [
      { id: "x1", conversation_id: "wA", body: "hello from A", sender_id: "s", created_at: "2026-01-01T01:00:00Z" },
      { id: "x2", conversation_id: "wB", body: "secret from B", sender_id: "s", created_at: "2026-01-01T02:00:00Z" },
    ],
  },
  privateConv: { pA: "cA", pB: "cB" },
  accounts: { cA: { branches: [A] }, cB: { branches: [B] } },
});

test("supervision view: an in-scope conversation returns its messages and records the view; others return nothing and record nothing", async () => {
  await withWorld(chatWorld(), async (w) => {
    assert.ok(refused(await call(C.view, { scope: scoped(A), params: { kind: "whatsapp", id: "wB" } })));
    assert.ok(refused(await call(C.view, { scope: scoped(A), params: { kind: "whatsapp", id: "wNone" } })));
    assert.deepEqual(w.writes, []);
    const ok = await call(C.view, { scope: scoped(A), params: { kind: "whatsapp", id: "wA" } });
    assert.equal(ok.code, 200, JSON.stringify(ok.body));
    assert.deepEqual(ok.body.messages.map((m) => m.body), ["hello from A"]);
    assert.ok(w.writes.some((x) => /chat_supervision_events/.test(x.text) || JSON.stringify(x.params).includes("view")), "the view is recorded");
  });
});

test("supervision view: a student chat stored only in SQL is judged by its counselor's branches", async () => {
  await withWorld(chatWorld(), async () => {
    assert.equal((await call(C.view, { scope: scoped(A), params: { kind: "student", id: "pA" } })).code, 200);
    assert.ok(refused(await call(C.view, { scope: scoped(A), params: { kind: "student", id: "pB" } })));
    assert.equal((await call(C.view, { scope: scoped(A), params: { kind: "student", id: "ghost" } })).code, 404);
  });
});

test("supervision join/message: in scope writes the visible system/supervisor message; out of scope writes nothing", async () => {
  await withWorld(chatWorld(), async (w) => {
    assert.ok(refused(await call(C.join, { scope: scoped(A), params: { kind: "whatsapp", id: "wB" }, body: { reason: "x" } })));
    assert.ok(refused(await call(C.say, { scope: scoped(A), params: { kind: "whatsapp", id: "wB" }, body: { message: "hi" } })));
    assert.deepEqual(w.writes, []);

    const j = await call(C.join, { scope: scoped(A), params: { kind: "whatsapp", id: "wA" }, body: { reason: "quality check" } });
    assert.deepEqual(j.body, { ok: true, joined: true });
    const joinRow = w.writes.find((x) => /app_records/.test(x.text));
    assert.ok(joinRow && String(joinRow.params[1]).includes("quality check") && String(joinRow.params[1]).includes('"conversation_id":"wA"'), "join message saved into conversation wA");

    w.writes.length = 0;
    const m = await call(C.say, { scope: scoped(A), params: { kind: "whatsapp", id: "wA" }, body: { message: "please follow up" } });
    assert.deepEqual(m.body, { ok: true });
    const msgRow = w.writes.find((x) => /app_records/.test(x.text));
    assert.ok(msgRow && String(msgRow.params[1]).includes("please follow up") && String(msgRow.params[1]).includes('"is_supervisor":true'));
  });
});

test("supervision: unrestricted callers are unchanged and not looked up", async () => {
  await withWorld(chatWorld(), async (w) => {
    const r = await call(C.view, { role: "super_admin", scope: everything, params: { kind: "whatsapp", id: "wB" } });
    assert.equal(r.code, 200);
    assert.deepEqual(r.body.messages.map((m) => m.body), ["secret from B"]);
    assert.ok(!w.queries.some((q) => /SELECT branch_id FROM app_records WHERE table_name = \$1 AND id::text/.test(q.text)));
  });
});

// ---------- escalations ----------

test("escalation update: in-scope changes status and saves; other branches and branch-less ones are refused with no write; the list no longer includes branch-less rows", async () => {
  const escalations = { eA: { branch_id: A }, eB: { branch_id: B }, eNone: { branch_id: null } };
  await withWorld({ escalations }, async (w) => {
    assert.ok(refused(await call(C.escPatch, { scope: scoped(A), params: { id: "eB" }, body: { status: "resolved" } })));
    assert.ok(refused(await call(C.escPatch, { scope: scoped(A), params: { id: "eNone" }, body: { status: "resolved" } })));
    assert.equal((await call(C.escPatch, { scope: scoped(A), params: { id: "ghost" }, body: { status: "resolved" } })).code, 404);
    assert.deepEqual(w.writes.filter((x) => /chat_escalations/.test(x.text)), []);

    const ok = await call(C.escPatch, { scope: scoped(A), params: { id: "eA" }, body: { status: "resolved", resolution_note: "sorted" } });
    assert.equal(ok.code, 200, JSON.stringify(ok.body));
    assert.equal(ok.body.status, "resolved");
    assert.equal(ok.body.resolution_note, "sorted");
    assert.ok(w.writes.some((x) => /chat_escalations/.test(x.text) && x.params[0] === "eA"));

    await call(C.escList, { scope: scoped(A), query: {} });
    const listSql = w.queries.find((q) => /FROM chat_escalations\s*(WHERE|ORDER)/.test(q.text) && /ORDER BY CASE status/.test(q.text));
    assert.ok(listSql && /branch_id = ANY/.test(listSql.text) && !/IS NULL/.test(listSql.text));
  });
});

// ---------- consent ----------

const consentWorld = () => ({
  records: { student_leads: [{ id: "leadA", user_id: "stuA", branch_id: A }, { id: "leadB", user_id: "stuB", branch_id: B }] },
  consent: [{ subject_id: "stuA", channel: "whatsapp", opted_out: true }, { subject_id: "stuB", channel: "sms", opted_out: true }],
});

test("consent read: a limited caller must name one person in their branches; the all-branches list and other branches are refused", async () => {
  await withWorld(consentWorld(), async () => {
    assert.ok(refused(await call(C.consentGet, { scope: scoped(A), query: {} }), "NEEDS_HIGHER_AUTHORITY"));
    assert.ok(refused(await call(C.consentGet, { scope: scoped(A), query: { subject_id: "stuB" } })));
    const ok = await call(C.consentGet, { scope: scoped(A), query: { subject_id: "stuA" } });
    assert.equal(ok.code, 200, JSON.stringify(ok.body));
    assert.deepEqual(ok.body.consent.map((c) => c.channel), ["whatsapp"]);
    const all = await call(C.consentGet, { role: "super_admin", scope: everything, query: {} });
    assert.equal(all.body.consent.length, 2, "Super Admin still gets the whole list");
  });
});

test("consent change: in scope saves the opt-out; another branch or an unknown person is refused and nothing is saved", async () => {
  await withWorld(consentWorld(), async (w) => {
    assert.ok(refused(await call(C.consentPut, { scope: scoped(A), body: { subject_id: "stuB", channel: "sms", opted_out: true } })));
    assert.equal((await call(C.consentPut, { scope: scoped(A), body: { subject_id: "nobody", channel: "sms", opted_out: true } })).code, 404);
    assert.deepEqual(w.writes.filter((x) => /communication_consent/.test(x.text)), []);

    const ok = await call(C.consentPut, { scope: scoped(A), body: { subject_id: "stuA", channel: "sms", opted_out: true, reason: "asked" } });
    assert.equal(ok.code, 200, JSON.stringify(ok.body));
    assert.equal(ok.body.subject_id, "stuA");
    assert.equal(ok.body.opted_out, true);
    const saved = w.writes.find((x) => /communication_consent/.test(x.text));
    assert.deepEqual([saved.params[1], saved.params[2], saved.params[3], saved.params[4]], ["stuA", "sms", true, "asked"]);

    const everyone = await call(C.consentPut, { role: "super_admin", scope: everything, body: { subject_id: "stuB", channel: "sms", opted_out: false } });
    assert.equal(everyone.code, 200, "Super Admin unchanged");
  });
});
