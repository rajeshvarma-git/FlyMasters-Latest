// Telecaller access against a real PostgreSQL. One rule for the queue AND for every direct-id action (contact,
// patch, convert, WhatsApp send, chats): a lead is the telecaller's only when it is assigned to them NOW and it is
// in a branch they belong to NOW. A stale or wrong assignment must not reach a lead in another branch, and a
// refused action must change nothing in the database and send nothing.
//
// Opt-in, so a plain `npm test` needs no database:
//   $env:TEST_DATABASE_URL = "postgresql://user:pass@localhost:5432/anydb"     (PowerShell)
//   npm test

import test from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import pg from "pg";

const URL = process.env.TEST_DATABASE_URL;
const skip = URL ? false : "set TEST_DATABASE_URL to run the PostgreSQL checks";
const schema = `ttq_${randomBytes(4).toString("hex")}`;

let pool;
let handlers;
let B1;
let B2;
let T1; // telecaller in B1
let T2; // another telecaller in B1

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
  const finalHandler = (path, method) => core.stack.find((l) => l.route?.path === path && l.route.methods[method]).route.stack.at(-1).handle;
  handlers = {
    createUser: finalHandler("/api/users", "post"),
    queue: finalHandler("/api/telecaller/state", "get"),
    contact: finalHandler("/api/telecaller/leads/:id/contact", "post"),
    patch: finalHandler("/api/telecaller/leads/:id", "patch"),
    convert: finalHandler("/api/telecaller/leads/:id/convert", "post"),
    waSend: finalHandler("/api/telecaller/whatsapp/messages", "post"),
    openChat: finalHandler("/api/telecaller/conversations", "post"),
    chatSend: finalHandler("/api/telecaller/messages", "post"),
    chatRead: finalHandler("/api/telecaller/conversations/:id/read", "post"),
    createLead: finalHandler("/api/telecaller/leads", "post"),
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

async function run(handler, { body = {}, params = {}, actor }) {
  const res = { code: 200, body: null, status(c) { this.code = c; return this; }, json(b) { this.body = b; return this; } };
  const req = { body, headers: {}, ip: `t-${Math.random()}`, params, query: {}, user: { id: actor.id, role: actor.role, email: actor.email }, scope: actor.scope };
  await handler(req, res);
  return res;
}

async function makeTelecaller(email, branchId) {
  const r = await run(handlers.createUser, { actor: SUPER, body: { email, password: "secret12", firstName: "Tele", lastName: email.split("@")[0], role: "telecaller", branchId } });
  assert.equal(r.code, 200, JSON.stringify(r.body));
  return r.body.id;
}

let seq = 0;
// A lead stored the way the app stores it: JSON in app_records, with the branch in the SQL column.
async function addLead({ branchId, telecallerId, status = "new" }) {
  const id = `lead-${++seq}`;
  const data = { id, user_id: `stu-${seq}`, first_name: "Lead", last_name: String(seq), email: `lead${seq}@x.test`, phone: `90000000${seq}`, entity_type: "lead", lead_status: status, assigned_telecaller_id: telecallerId, branch_id: branchId };
  await pool.query("INSERT INTO app_records (id, table_name, data, branch_id) VALUES ($1, 'student_leads', $2::jsonb, $3)", [id, JSON.stringify(data), branchId]);
  return id;
}
const reassign = (leadId, telecallerId) =>
  pool.query("UPDATE app_records SET data = jsonb_set(data, '{assigned_telecaller_id}', to_jsonb($2::text)) WHERE id = $1", [leadId, telecallerId]);

const scopeOf = (...branchIds) => ({ allBranches: false, branchIds });
const queueFor = async (id, scope) => {
  const res = await run(handlers.queue, { actor: { id, role: "telecaller", email: `${id}@x.test`, scope } });
  assert.equal(res.code, 200, JSON.stringify(res.body));
  return res.body.leads.map((lead) => String(lead.id)).sort();
};

test.before(async () => {
  if (skip) return;
  T1 = await makeTelecaller("tq.one@x.test", B1);
  T2 = await makeTelecaller("tq.two@x.test", B1);
});

test("a lead assigned to the telecaller in their own branch is in their queue", { skip }, async () => {
  const mine = await addLead({ branchId: B1, telecallerId: T1 });
  assert.ok((await queueFor(T1, scopeOf(B1))).includes(mine));
});

test("a stale assignment: a lead in another branch assigned to this telecaller is NOT in their queue", { skip }, async () => {
  const stale = await addLead({ branchId: B2, telecallerId: T1 });
  assert.ok(!(await queueFor(T1, scopeOf(B1))).includes(stale), "a lead from Branch 2 leaked into a Branch 1 telecaller's queue");
});

test("a lead with no branch is not in a branch-scoped queue, even when assigned to the telecaller", { skip }, async () => {
  const unbranched = await addLead({ branchId: null, telecallerId: T1 });
  assert.ok(!(await queueFor(T1, scopeOf(B1))).includes(unbranched));
});

test("a lead in the telecaller's branch that is assigned to someone else is not in their queue", { skip }, async () => {
  const theirs = await addLead({ branchId: B1, telecallerId: T2 });
  assert.ok(!(await queueFor(T1, scopeOf(B1))).includes(theirs));
  assert.ok((await queueFor(T2, scopeOf(B1))).includes(theirs));
});

test("reassignment: the lead leaves the first telecaller's queue and appears in the new one's", { skip }, async () => {
  const lead = await addLead({ branchId: B1, telecallerId: T1 });
  assert.ok((await queueFor(T1, scopeOf(B1))).includes(lead));
  await reassign(lead, T2);
  assert.ok(!(await queueFor(T1, scopeOf(B1))).includes(lead), "still in the old telecaller's queue");
  assert.ok((await queueFor(T2, scopeOf(B1))).includes(lead), "not in the new telecaller's queue");
});

test("moving the telecaller to another branch: leads in the old branch drop out, leads in the new branch come in", { skip }, async () => {
  const inB1 = await addLead({ branchId: B1, telecallerId: T1 });
  const inB2 = await addLead({ branchId: B2, telecallerId: T1 });
  const before = await queueFor(T1, scopeOf(B1));
  assert.ok(before.includes(inB1) && !before.includes(inB2));
  const after = await queueFor(T1, scopeOf(B2));
  assert.ok(after.includes(inB2) && !after.includes(inB1));
  const both = await queueFor(T1, scopeOf(B1, B2));
  assert.ok(both.includes(inB1) && both.includes(inB2));
});

test("a telecaller with no branch at all sees an empty queue", { skip }, async () => {
  await addLead({ branchId: B1, telecallerId: T1 });
  assert.deepEqual(await queueFor(T1, scopeOf()), []);
});

test("an all-branches account working leads sees every lead assigned to them", { skip }, async () => {
  const a = await addLead({ branchId: B1, telecallerId: T1 });
  const b = await addLead({ branchId: B2, telecallerId: T1 });
  const c = await addLead({ branchId: null, telecallerId: T1 });
  const queue = await queueFor(T1, { allBranches: true, branchIds: [] });
  for (const id of [a, b, c]) assert.ok(queue.includes(id), `${id} missing`);
});


// ---- direct-id actions: the same rule as the queue ---------------------------------------------------------------------

const asT = (id, scope) => ({ id, role: "telecaller", email: `${id}@x.test`, scope });
const moveToBranch = (leadId, branchId) =>
  pool.query("UPDATE app_records SET branch_id = $2::uuid, data = jsonb_set(data, '{branch_id}', to_jsonb($3::text)) WHERE id = $1", [leadId, branchId, String(branchId)]);

// Everything a refused action must leave alone: every stored record, notifications, and the SQL lead table.
const fingerprint = async () => (await pool.query(`SELECT
  (SELECT md5(coalesce(string_agg(id || ':' || table_name || ':' || data::text || ':' || coalesce(branch_id::text, ''), '|' ORDER BY id), '')) FROM app_records) AS records,
  (SELECT count(*)::int FROM notifications) AS notifications,
  (SELECT count(*)::int FROM student_leads) AS sql_leads`)).rows[0];

async function withNoOutbound(fn) {
  const outbound = [];
  const realFetch = globalThis.fetch;
  globalThis.fetch = async (...args) => { outbound.push(args); throw new Error("no network in tests"); };
  try { return await fn(outbound); } finally { globalThis.fetch = realFetch; }
}

const ACTIONS = {
  contact: (id, actor) => run(handlers.contact, { actor, params: { id }, body: { outcome: "connected", note: "called" } }),
  patch: (id, actor) => run(handlers.patch, { actor, params: { id }, body: { notes: "edited" } }),
  convert: (id, actor) => run(handlers.convert, { actor, params: { id }, body: {} }),
  whatsapp: (id, actor) => run(handlers.waSend, { actor, body: { leadId: id, message: "hello" } }),
};

const REFUSED_SITUATIONS = {
  "a lead assigned to another telecaller": () => addLead({ branchId: B1, telecallerId: T2 }),
  "a stale assignment to a lead in another branch": () => addLead({ branchId: B2, telecallerId: T1 }),
  "a lead with no branch": () => addLead({ branchId: null, telecallerId: T1 }),
};

for (const [action, act] of Object.entries(ACTIONS)) {
  for (const [situation, makeLead] of Object.entries(REFUSED_SITUATIONS)) {
    test(`${action}: refused for ${situation}; the database is unchanged and nothing is sent`, { skip }, async () => {
      const leadId = await makeLead();
      const before = await fingerprint();
      await withNoOutbound(async (outbound) => {
        const res = await act(leadId, asT(T1, scopeOf(B1)));
        assert.equal(res.code, 403, JSON.stringify(res.body));
        assert.deepEqual(outbound, [], "something was sent");
      });
      assert.deepEqual(await fingerprint(), before, "something was written");
    });
  }

  test(`${action}: allowed for a lead assigned to the telecaller in their own branch (passes the access check)`, { skip }, async () => {
    const leadId = await addLead({ branchId: B1, telecallerId: T1 });
    const res = await withNoOutbound(() => act(leadId, asT(T1, scopeOf(B1))));
    assert.notEqual(res.code, 403, `refused: ${JSON.stringify(res.body)}`);
  });
}

test("contact and patch really save for an allowed lead", { skip }, async () => {
  const leadId = await addLead({ branchId: B1, telecallerId: T1 });
  // patch replaces the notes; contact appends a call entry to them, so patch first.
  assert.equal((await ACTIONS.patch(leadId, asT(T1, scopeOf(B1)))).code, 200);
  assert.equal((await ACTIONS.contact(leadId, asT(T1, scopeOf(B1)))).code, 200);
  const notes = (await pool.query("SELECT data->>'notes' AS notes FROM app_records WHERE id = $1", [leadId])).rows[0].notes;
  assert.match(notes, /called/);
  assert.match(notes, /edited/);
});

test("reassignment by direct id: the first telecaller is refused at once, the new one is allowed", { skip }, async () => {
  const leadId = await addLead({ branchId: B1, telecallerId: T1 });
  assert.equal((await ACTIONS.contact(leadId, asT(T1, scopeOf(B1)))).code, 200);
  await reassign(leadId, T2);
  const before = await fingerprint();
  assert.equal((await ACTIONS.contact(leadId, asT(T1, scopeOf(B1)))).code, 403);
  assert.deepEqual(await fingerprint(), before);
  assert.equal((await ACTIONS.contact(leadId, asT(T2, scopeOf(B1)))).code, 200);
});

test("branch change by direct id: moving the lead out of the telecaller's branch refuses them; their new branch allows it", { skip }, async () => {
  const leadId = await addLead({ branchId: B1, telecallerId: T1 });
  assert.equal((await ACTIONS.contact(leadId, asT(T1, scopeOf(B1)))).code, 200);
  await moveToBranch(leadId, B2);
  const before = await fingerprint();
  assert.equal((await ACTIONS.contact(leadId, asT(T1, scopeOf(B1)))).code, 403, "still allowed after the lead left the branch");
  assert.deepEqual(await fingerprint(), before);
  assert.equal((await ACTIONS.contact(leadId, asT(T1, scopeOf(B2)))).code, 200, "allowed once the telecaller belongs to the new branch");
  assert.equal((await ACTIONS.contact(leadId, asT(T1, scopeOf()))).code, 403, "a telecaller with no branch can act on nothing");
});

test("an all-branches account working a lead assigned to it is allowed in any branch", { skip }, async () => {
  const leadId = await addLead({ branchId: B2, telecallerId: T1 });
  assert.equal((await ACTIONS.contact(leadId, asT(T1, { allBranches: true, branchIds: [] }))).code, 200);
});

// ---- chats -------------------------------------------------------------------------------------------------------------

const openChat = async (leadId, actor) => {
  const studentId = (await pool.query("SELECT data->>'user_id' AS u FROM app_records WHERE id = $1", [leadId])).rows[0].u;
  return run(handlers.openChat, { actor, body: { studentId } });
};

test("chats: open, send and mark read work for an allowed lead", { skip }, async () => {
  const leadId = await addLead({ branchId: B1, telecallerId: T1 });
  const chat = await openChat(leadId, asT(T1, scopeOf(B1)));
  assert.equal(chat.code, 200, JSON.stringify(chat.body));
  const sent = await run(handlers.chatSend, { actor: asT(T1, scopeOf(B1)), body: { conversationId: chat.body.id, message: "hi there" } });
  assert.equal(sent.code, 200, JSON.stringify(sent.body));
  const read = await run(handlers.chatRead, { actor: asT(T1, scopeOf(B1)), params: { id: chat.body.id } });
  assert.equal(read.code, 200, JSON.stringify(read.body));
});

for (const [label, lose] of Object.entries({
  "the lead is reassigned": (leadId) => reassign(leadId, T2),
  "the lead moves to another branch": (leadId) => moveToBranch(leadId, B2),
})) {
  test(`chats: when ${label}, the old telecaller cannot send, mark read or open a chat, the chat leaves their queue, and nothing is written`, { skip }, async () => {
    const leadId = await addLead({ branchId: B1, telecallerId: T1 });
    const chat = await openChat(leadId, asT(T1, scopeOf(B1)));
    assert.equal(chat.code, 200, JSON.stringify(chat.body));
    const before = (await run(handlers.queue, { actor: asT(T1, scopeOf(B1)) })).body;
    assert.ok(before.conversations.some((c) => c.id === chat.body.id), "the chat is listed while the lead is theirs");

    await lose(leadId);
    const fp = await fingerprint();
    const me = asT(T1, scopeOf(B1));
    assert.equal((await run(handlers.chatSend, { actor: me, body: { conversationId: chat.body.id, message: "still me" } })).code, 404);
    assert.equal((await run(handlers.chatRead, { actor: me, params: { id: chat.body.id } })).code, 404);
    assert.equal((await openChat(leadId, me)).code, 403);
    assert.deepEqual(await fingerprint(), fp, "something was written or the student was notified");

    const after = (await run(handlers.queue, { actor: me })).body;
    assert.ok(!after.conversations.some((c) => c.id === chat.body.id), "the chat is still listed");
    assert.ok(!after.messages.some((m) => String(m.conversation_id) === String(chat.body.id)), "its messages are still listed");
  });
}

// ---- creating a lead ---------------------------------------------------------------------------------------------------

test("a telecaller with no branch cannot add a lead (it would be invisible to everyone, including them)", { skip }, async () => {
  const before = await fingerprint();
  const res = await run(handlers.createLead, { actor: asT(T1, { allBranches: false, branchIds: [], branchId: null }), body: { email: "nobranch@x.test", first_name: "No", last_name: "Branch" } });
  assert.equal(res.code, 403, JSON.stringify(res.body));
  assert.deepEqual(await fingerprint(), before);
});

test("a lead a telecaller adds lands in their branch and shows up in their own queue", { skip }, async () => {
  const scope = { allBranches: false, branchIds: [B1], branchId: B1 };
  const res = await run(handlers.createLead, { actor: asT(T1, scope), body: { email: "mine@x.test", first_name: "Mine", last_name: "Lead", phone: "9000000099" } });
  assert.equal(res.code, 200, JSON.stringify(res.body));
  const row = (await pool.query("SELECT branch_id FROM app_records WHERE id = $1", [res.body.id])).rows[0];
  assert.equal(String(row.branch_id), String(B1));
  assert.ok((await queueFor(T1, scopeOf(B1))).includes(res.body.id));
});
