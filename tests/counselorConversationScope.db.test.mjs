// Counselor conversation, message, WhatsApp and attachment access against a real PostgreSQL.
//
// One rule, the same one the telecaller routes already follow (tests/telecallerQueue.db.test.mjs):
// a student's thread, messages and files are the counselor's only when the lead is assigned to them
// NOW and sits in a branch they belong to NOW. A stale assignment must not reach a lead in another
// branch, and a refused request must expose no message or attachment, write nothing and send nothing.
//
// Opt-in, so a plain `npm test` needs no database:
//   $env:TEST_DATABASE_URL = "postgresql://user:pass@localhost:5432/anydb"     (PowerShell)
//   npm test

import test from "node:test";
import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import pg from "pg";

const URL = process.env.TEST_DATABASE_URL;
const skip = URL ? false : "set TEST_DATABASE_URL to run the PostgreSQL checks";
const schema = `ccs_${randomBytes(4).toString("hex")}`;

let pool;
let h;
let B1;
let B2;
let C1; // counselor in branch 1
let C2; // another counselor in branch 1

if (!skip) {
  const admin = new pg.Pool({ connectionString: URL });
  await admin.query(`CREATE SCHEMA ${schema}`);
  await admin.end();
  process.env.DATABASE_URL = `${URL}${URL.includes("?") ? "&" : "?"}options=-c%20search_path%3D${schema}`;
  delete process.env.ADMIN_SIGNUP_CODE;
  delete process.env.ADMIN_SIGNUP_OPEN;
  ({ pool } = await import("../server/lib/db.mjs"));
  const { migrate } = await import("../server/lib/migrate.mjs");
  await migrate();
  const core = (await import("../server/routes/core.mjs")).default;
  const counselor = (await import("../server/routes/counselor.mjs")).default;
  const last = (router, path, method) => {
    const layer = router.stack.find((l) => l.route?.path === path && l.route.methods[method]);
    assert.ok(layer, `route not found: ${method.toUpperCase()} ${path}`);
    return layer.route.stack.at(-1).handle;
  };
  h = {
    createUser: last(core, "/api/users", "post"),
    state: last(counselor, "/api/counselor/state", "get"),
    openChat: last(counselor, "/api/counselor/conversations", "post"),
    chatSend: last(counselor, "/api/counselor/messages", "post"),
    chatEdit: last(counselor, "/api/counselor/messages/:id", "patch"),
    chatRead: last(counselor, "/api/counselor/conversations/:id/read", "post"),
    docFile: last(counselor, "/api/counselor/documents/:id/file", "get"),
    waList: last(core, "/api/whatsapp/conversations", "get"),
    waMessages: last(core, "/api/whatsapp/conversations/:id/messages", "get"),
    waSend: last(core, "/api/whatsapp/messages", "post"),
    waRead: last(core, "/api/whatsapp/conversations/:id/read", "post"),
  };
  B1 = (await pool.query("INSERT INTO branches (name, code) VALUES ('Hyderabad', 'HYD') RETURNING id")).rows[0].id;
  B2 = (await pool.query("INSERT INTO branches (name, code) VALUES ('Vizag', 'VIZ') RETURNING id")).rows[0].id;
}

test.after(async () => {
  if (skip) return;
  await pool.end();
  const admin = new pg.Pool({ connectionString: URL });
  await admin.query(`DROP SCHEMA ${schema} CASCADE`);
  await admin.end();
});

const SUPER = { id: "boss", role: "super_admin", email: "boss@x.test", scope: { allBranches: true, branchIds: [] } };
const scopeOf = (...branchIds) => ({ allBranches: false, branchIds });
const asC = (id, scope) => ({ id, role: "counselor", email: `${id}@x.test`, scope });

async function run(handler, { body = {}, params = {}, query = {}, actor }) {
  const res = {
    code: 200, body: null,
    status(c) { this.code = c; return this; },
    json(b) { this.body = b; return this; },
  };
  const req = {
    body, headers: {}, ip: `c-${Math.random()}`, params, query,
    user: { id: actor.id, role: actor.role, email: actor.email },
    scope: actor.scope,
  };
  await handler(req, res);
  return res;
}

async function makeCounselor(email, branchId) {
  const r = await run(h.createUser, {
    actor: SUPER,
    body: { email, password: "secret12", firstName: "Couns", lastName: email.split("@")[0], role: "counselor", branchId },
  });
  assert.equal(r.code, 200, JSON.stringify(r.body));
  return r.body.id;
}

let seq = 0;
/** A converted lead with a student portal id, stored the way the app stores it. */
async function addStudentLead({ branchId, counselorId }) {
  const id = `clead-${++seq}`;
  const userId = randomUUID(); // private_conversations is UUID-typed, so the student id must be a real UUID
  const data = {
    id, user_id: userId, first_name: "Student", last_name: String(seq),
    email: `cstu${seq}@x.test`, phone: `80000000${seq}`,
    entity_type: "student", lead_status: "converted", status: "converted",
    assigned_counselor_id: counselorId, branch_id: branchId,
  };
  await pool.query(
    "INSERT INTO app_records (id, table_name, data, branch_id) VALUES ($1, 'student_leads', $2::jsonb, $3)",
    [id, JSON.stringify(data), branchId],
  );
  return { leadId: id, studentId: userId, phone: data.phone, email: data.email };
}

const reassign = (leadId, counselorId) =>
  pool.query(
    "UPDATE app_records SET data = jsonb_set(data, '{assigned_counselor_id}', to_jsonb($2::text)) WHERE id = $1",
    [leadId, counselorId],
  );
const moveToBranch = (leadId, branchId) =>
  pool.query(
    "UPDATE app_records SET branch_id = $2::uuid, data = jsonb_set(data, '{branch_id}', to_jsonb($3::text)) WHERE id = $1",
    [leadId, branchId, String(branchId)],
  );

/** A WhatsApp thread for a lead, assigned to the counselor the way the app assigns it. */
async function addWhatsAppThread({ lead, counselorId, branchId }) {
  const id = `cwa-${++seq}`;
  const row = {
    id, lead_id: lead.leadId, phone_number: lead.phone,
    assigned_staff_id: counselorId, staff_role: "counselor",
    last_message_at: new Date().toISOString(), unread_count: 1,
  };
  await pool.query(
    "INSERT INTO app_records (id, table_name, data, branch_id) VALUES ($1, 'whatsapp_conversations', $2::jsonb, $3)",
    [id, JSON.stringify(row), branchId],
  );
  const messageId = `cwam-${seq}`;
  await pool.query(
    "INSERT INTO app_records (id, table_name, data, branch_id) VALUES ($1, 'whatsapp_messages', $2::jsonb, $3)",
    [messageId, JSON.stringify({
      id: messageId, conversation_id: id, direction: "inbound",
      body: "SECRET-WHATSAPP-BODY", is_read: false, created_at: new Date().toISOString(),
    }), branchId],
  );
  return { threadId: id, messageId };
}

/** A document (attachment) belonging to the student. */
async function addDocument({ lead, branchId }) {
  const id = `cdoc-${++seq}`;
  const path = `storage/${id}.pdf`;
  await pool.query("INSERT INTO app_storage (path, data_url) VALUES ($1, $2)", [path, "data:application/pdf;base64,U0VDUkVU"]);
  await pool.query(
    "INSERT INTO app_records (id, table_name, data, branch_id) VALUES ($1, 'documents', $2::jsonb, $3)",
    [id, JSON.stringify({
      id, user_id: lead.studentId, file_name: "passport.pdf", file_path: path,
      status: "pending", created_at: new Date().toISOString(),
    }), branchId],
  );
  return id;
}

// Everything a refused request must leave alone: threads, messages, files, leads and notifications.
//
// `counselors` and `profiles` are deliberately left out. Every WhatsApp route calls loadCounselors(),
// which re-syncs the counselor directory into those two tables before it reads anything, so they change
// on an allowed and a refused request alike. That sync is housekeeping and carries no message or file.
// Everything a refusal could leak or alter is watched below.
const WATCHED = [
  "student_leads", "documents", "private_conversations", "private_messages",
  "whatsapp_conversations", "whatsapp_messages", "notifications", "document_notifications",
];
const fingerprint = async () => (await pool.query(`SELECT
  (SELECT md5(coalesce(string_agg(id || ':' || table_name || ':' || data::text || ':' || coalesce(branch_id::text, ''), '|' ORDER BY id), ''))
     FROM app_records WHERE table_name = ANY($1)) AS records,
  (SELECT count(*)::int FROM notifications) AS notifications,
  (SELECT count(*)::int FROM private_messages) AS private_messages,
  (SELECT count(*)::int FROM private_conversations) AS private_conversations`, [WATCHED])).rows[0];

async function withNoOutbound(fn) {
  const outbound = [];
  const realFetch = globalThis.fetch;
  globalThis.fetch = async (...args) => { outbound.push(args); throw new Error("no network in tests"); };
  try { return await fn(outbound); } finally { globalThis.fetch = realFetch; }
}

test.before(async () => {
  if (skip) return;
  C1 = await makeCounselor("ccs.one@x.test", B1);
  C2 = await makeCounselor("ccs.two@x.test", B1);
});

// ---- the allowed case must keep working -------------------------------------------------------

test("a student assigned to the counselor in their own branch: chat opens, a message sends, the file is served", { skip }, async () => {
  const lead = await addStudentLead({ branchId: B1, counselorId: C1 });
  const chat = await run(h.openChat, { actor: asC(C1, scopeOf(B1)), body: { studentId: lead.studentId } });
  assert.equal(chat.code, 200, JSON.stringify(chat.body));
  const sent = await run(h.chatSend, {
    actor: asC(C1, scopeOf(B1)),
    body: { conversationId: chat.body.id, receiverId: lead.studentId, message: "hello there" },
  });
  assert.equal(sent.code, 200, JSON.stringify(sent.body));
  const docId = await addDocument({ lead, branchId: B1 });
  const file = await run(h.docFile, { actor: asC(C1, scopeOf(B1)), params: { id: docId } });
  assert.equal(file.code, 200, JSON.stringify(file.body));
  assert.ok(file.body.dataUrl, "the allowed counselor got no file");
});

test("the counselor's own state lists the thread for a student in their branch", { skip }, async () => {
  const lead = await addStudentLead({ branchId: B1, counselorId: C1 });
  const chat = await run(h.openChat, { actor: asC(C1, scopeOf(B1)), body: { studentId: lead.studentId } });
  assert.equal(chat.code, 200);
  const state = await run(h.state, { actor: asC(C1, scopeOf(B1)) });
  assert.equal(state.code, 200, JSON.stringify(state.body));
  assert.ok(
    state.body.conversations.some((row) => String(row.student_id) === String(lead.studentId)),
    "the counselor cannot see their own student's thread",
  );
});

// ---- the refused cases ------------------------------------------------------------------------

const REFUSED = {
  "a student assigned to another counselor": () => addStudentLead({ branchId: B1, counselorId: C2 }),
  "a stale assignment to a student in another branch": () => addStudentLead({ branchId: B2, counselorId: C1 }),
  "a student whose lead has no branch": () => addStudentLead({ branchId: null, counselorId: C1 }),
};

const ACTIONS = {
  "open the chat": (lead, actor) => run(h.openChat, { actor, body: { studentId: lead.studentId } }),
  "send a message": (lead, actor) =>
    run(h.chatSend, { actor, body: { conversationId: `conv-${lead.leadId}`, receiverId: lead.studentId, message: "hello" } }),
};

for (const [action, act] of Object.entries(ACTIONS)) {
  for (const [situation, makeLead] of Object.entries(REFUSED)) {
    test(`${action}: refused for ${situation}; nothing is written and nothing is sent`, { skip }, async () => {
      const lead = await makeLead();
      const before = await fingerprint();
      await withNoOutbound(async (outbound) => {
        const res = await act(lead, asC(C1, scopeOf(B1)));
        assert.equal(res.code, 403, JSON.stringify(res.body));
        assert.deepEqual(outbound, [], "something was sent");
      });
      assert.deepEqual(await fingerprint(), before, "something was written");
    });
  }
}

test("the counselor's state hides a thread whose lead sits in another branch", { skip }, async () => {
  const lead = await addStudentLead({ branchId: B1, counselorId: C1 });
  const chat = await run(h.openChat, { actor: asC(C1, scopeOf(B1)), body: { studentId: lead.studentId } });
  assert.equal(chat.code, 200);
  await run(h.chatSend, {
    actor: asC(C1, scopeOf(B1)),
    body: { conversationId: chat.body.id, receiverId: lead.studentId, message: "SECRET-CHAT-BODY" },
  });
  await moveToBranch(lead.leadId, B2);
  const state = await run(h.state, { actor: asC(C1, scopeOf(B1)) });
  assert.equal(state.code, 200, JSON.stringify(state.body));
  assert.ok(
    !state.body.conversations.some((row) => String(row.student_id) === String(lead.studentId)),
    "a thread from another branch is still listed",
  );
  assert.ok(
    !JSON.stringify(state.body.messages || []).includes("SECRET-CHAT-BODY"),
    "the message body leaked after the lead moved branch",
  );
});

test("an attachment is refused once the student's lead sits outside the counselor's branches, and no file is returned", { skip }, async () => {
  const lead = await addStudentLead({ branchId: B1, counselorId: C1 });
  const docId = await addDocument({ lead, branchId: B1 });
  assert.equal((await run(h.docFile, { actor: asC(C1, scopeOf(B1)), params: { id: docId } })).code, 200);
  await moveToBranch(lead.leadId, B2);
  const before = await fingerprint();
  const res = await run(h.docFile, { actor: asC(C1, scopeOf(B1)), params: { id: docId } });
  assert.equal(res.code, 403, `the file was still served: ${JSON.stringify(res.body)}`);
  assert.ok(!res.body?.dataUrl, "the attachment leaked");
  assert.deepEqual(await fingerprint(), before);
});

test("an attachment for another counselor's student is refused", { skip }, async () => {
  const lead = await addStudentLead({ branchId: B1, counselorId: C2 });
  const docId = await addDocument({ lead, branchId: B1 });
  const res = await run(h.docFile, { actor: asC(C1, scopeOf(B1)), params: { id: docId } });
  assert.equal(res.code, 403, JSON.stringify(res.body));
  assert.ok(!res.body?.dataUrl, "the attachment leaked");
});

test("reassignment: the first counselor is refused at once, the new one is allowed", { skip }, async () => {
  const lead = await addStudentLead({ branchId: B1, counselorId: C1 });
  assert.equal((await run(h.openChat, { actor: asC(C1, scopeOf(B1)), body: { studentId: lead.studentId } })).code, 200);
  await reassign(lead.leadId, C2);
  const before = await fingerprint();
  assert.equal(
    (await run(h.openChat, { actor: asC(C1, scopeOf(B1)), body: { studentId: lead.studentId } })).code, 403,
    "the old counselor still has the thread",
  );
  assert.deepEqual(await fingerprint(), before);
  assert.equal((await run(h.openChat, { actor: asC(C2, scopeOf(B1)), body: { studentId: lead.studentId } })).code, 200);
});

test("branch change: the counselor is refused in the old branch and allowed once they belong to the new one", { skip }, async () => {
  const lead = await addStudentLead({ branchId: B1, counselorId: C1 });
  assert.equal((await run(h.openChat, { actor: asC(C1, scopeOf(B1)), body: { studentId: lead.studentId } })).code, 200);
  await moveToBranch(lead.leadId, B2);
  assert.equal(
    (await run(h.openChat, { actor: asC(C1, scopeOf(B1)), body: { studentId: lead.studentId } })).code, 403,
    "still allowed after the lead left the branch",
  );
  assert.equal(
    (await run(h.openChat, { actor: asC(C1, scopeOf(B2)), body: { studentId: lead.studentId } })).code, 200,
    "refused even though the counselor now belongs to the lead's branch",
  );
  assert.equal(
    (await run(h.openChat, { actor: asC(C1, scopeOf()), body: { studentId: lead.studentId } })).code, 403,
    "a counselor with no branch reached a student",
  );
});

// ---- WhatsApp: history, send and read, by direct thread id ------------------------------------

test("WhatsApp history: the counselor reads their own student's thread in their branch", { skip }, async () => {
  const lead = await addStudentLead({ branchId: B1, counselorId: C1 });
  const thread = await addWhatsAppThread({ lead, counselorId: C1, branchId: B1 });
  const res = await run(h.waMessages, { actor: asC(C1, scopeOf(B1)), params: { id: thread.threadId } });
  assert.equal(res.code, 200, JSON.stringify(res.body));
  assert.ok(Array.isArray(res.body) && res.body.length > 0, "the allowed counselor got no messages");
});

test("WhatsApp history by direct id: refused for a thread whose lead is in another branch, and no message body is returned", { skip }, async () => {
  const lead = await addStudentLead({ branchId: B2, counselorId: C1 });
  const thread = await addWhatsAppThread({ lead, counselorId: C1, branchId: B2 });
  const res = await run(h.waMessages, { actor: asC(C1, scopeOf(B1)), params: { id: thread.threadId } });
  assert.equal(res.code, 403, `the thread was served: ${JSON.stringify(res.body)}`);
  assert.ok(!JSON.stringify(res.body || "").includes("SECRET-WHATSAPP-BODY"), "a message body leaked");
});

test("WhatsApp history by direct id: refused for another counselor's thread", { skip }, async () => {
  const lead = await addStudentLead({ branchId: B1, counselorId: C2 });
  const thread = await addWhatsAppThread({ lead, counselorId: C2, branchId: B1 });
  const res = await run(h.waMessages, { actor: asC(C1, scopeOf(B1)), params: { id: thread.threadId } });
  assert.equal(res.code, 403, JSON.stringify(res.body));
  assert.ok(!JSON.stringify(res.body || "").includes("SECRET-WHATSAPP-BODY"), "a message body leaked");
});

test("WhatsApp list: a thread whose lead sits in another branch is not listed", { skip }, async () => {
  const lead = await addStudentLead({ branchId: B2, counselorId: C1 });
  const thread = await addWhatsAppThread({ lead, counselorId: C1, branchId: B2 });
  const res = await run(h.waList, { actor: asC(C1, scopeOf(B1)) });
  assert.equal(res.code, 200, JSON.stringify(res.body));
  assert.ok(
    !(res.body || []).some((row) => String(row.id) === String(thread.threadId)),
    "a cross-branch thread was listed",
  );
});

test("WhatsApp send and read by direct id: refused across branches; nothing written, nothing sent", { skip }, async () => {
  const lead = await addStudentLead({ branchId: B2, counselorId: C1 });
  const thread = await addWhatsAppThread({ lead, counselorId: C1, branchId: B2 });
  const before = await fingerprint();
  await withNoOutbound(async (outbound) => {
    const send = await run(h.waSend, {
      actor: asC(C1, scopeOf(B1)),
      body: { conversationId: thread.threadId, message: "hello" },
    });
    assert.equal(send.code, 403, JSON.stringify(send.body));
    const read = await run(h.waRead, { actor: asC(C1, scopeOf(B1)), params: { id: thread.threadId } });
    assert.equal(read.code, 403, JSON.stringify(read.body));
    assert.deepEqual(outbound, [], "something was sent");
  });
  assert.deepEqual(await fingerprint(), before, "something was written");
  const unread = (await pool.query(
    "SELECT data->>'is_read' AS is_read FROM app_records WHERE id = $1", [thread.messageId],
  )).rows[0];
  assert.equal(unread.is_read, "false", "the refused read still marked the message read");
});

// ---- an all-branches manager keeps the access the matrix gives them ---------------------------

test("a Super Admin still reads a thread in any branch (explicitly authorized access is preserved)", { skip }, async () => {
  const lead = await addStudentLead({ branchId: B2, counselorId: C1 });
  const thread = await addWhatsAppThread({ lead, counselorId: C1, branchId: B2 });
  const res = await run(h.waMessages, { actor: SUPER, params: { id: thread.threadId } });
  assert.equal(res.code, 200, `Super Admin lost cross-branch read: ${JSON.stringify(res.body)}`);
});
