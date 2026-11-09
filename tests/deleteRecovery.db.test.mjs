// Is a deleted record actually recoverable? (Milestone 3.3, recovery checks.)
//
// server/lib/deletion.mjs says, in its own design note, that nothing is soft-deleted and that "a delete
// is recoverable by hand from audit_log". The audit row is therefore the ONLY copy of what was removed —
// which is why the audit write was moved inside the delete transaction. This asks the next question:
// is what the snapshot holds enough to put the person back?
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
const schema = `rec_${randomBytes(4).toString("hex")}`;

let pool;
let runDelete;
let B1;

if (!skip) {
  const admin = new pg.Pool({ connectionString: URL });
  await admin.query(`CREATE SCHEMA ${schema}`);
  await admin.end();
  process.env.DATABASE_URL = `${URL}${URL.includes("?") ? "&" : "?"}options=-c%20search_path%3D${schema}`;
  ({ pool } = await import("../server/lib/db.mjs"));
  const { migrate } = await import("../server/lib/migrate.mjs");
  await migrate();
  ({ runDelete } = await import("../server/lib/deletion.mjs"));
  B1 = (await pool.query("INSERT INTO branches (name, code) VALUES ('Hyderabad','HYD') RETURNING id")).rows[0].id;
}

test.after(async () => {
  if (skip) return;
  await pool.end();
  const admin = new pg.Pool({ connectionString: URL });
  await admin.query(`DROP SCHEMA ${schema} CASCADE`);
  await admin.end();
});

let seq = 0;
/** A student with the things a real one accumulates: a profile, a document, an application, a chat. */
async function addStudentWithHistory() {
  const n = ++seq;
  const leadId = `rec-lead-${n}`;
  const userId = randomUUID();
  const add = (id, table, data) => pool.query(
    "INSERT INTO app_records (id, table_name, data, branch_id) VALUES ($1,$2,$3::jsonb,$4)",
    [id, table, JSON.stringify(data), B1],
  );
  await add(leadId, "student_leads", {
    id: leadId, user_id: userId, first_name: "Recover", last_name: String(n),
    email: `rec${n}@x.test`, phone: `76000000${n}`, entity_type: "student",
    lead_status: "converted", branch_id: B1,
  });
  await add(`rec-prof-${n}`, "profiles", { id: `rec-prof-${n}`, user_id: userId, first_name: "Recover", last_name: String(n) });
  await add(`rec-doc-${n}`, "documents", {
    id: `rec-doc-${n}`, user_id: userId, document_type: "passport",
    file_name: "passport.pdf", file_path: `${userId}/passport.pdf`, status: "approved",
  });
  await add(`rec-app-${n}`, "applications", {
    id: `rec-app-${n}`, student_id: leadId, university: "Imperial", status: "submitted",
  });
  await add(`rec-conv-${n}`, "whatsapp_conversations", { id: `rec-conv-${n}`, lead_id: leadId, phone_number: `76000000${n}` });
  await add(`rec-msg-${n}`, "whatsapp_messages", {
    id: `rec-msg-${n}`, conversation_id: `rec-conv-${n}`, direction: "inbound", body: "IMPORTANT-HISTORY",
  });
  await pool.query("INSERT INTO app_storage (path, data_url) VALUES ($1,$2)", [`${userId}/passport.pdf`, "data:application/pdf;base64,U0VDUkVU"]);
  await pool.query("INSERT INTO auth_users (id, email, password) VALUES ($1,$2,'x')", [userId, `rec${n}@x.test`]);
  await pool.query("INSERT INTO user_roles (user_id, role) VALUES ($1,'student')", [userId]);
  return { leadId, userId, n };
}

/**
 * Everything belonging to this person, including rows that reach them only through their conversation
 * — a whatsapp_messages row carries conversation_id and nothing else, which is how the app writes it.
 */
const rowsFor = async (userId, leadId) => Number((await pool.query(
  `SELECT count(*)::int AS n FROM app_records
     WHERE id = $2 OR data->>'user_id' = $1 OR data->>'student_id' = $2 OR data->>'lead_id' = $2
        OR data->>'conversation_id' IN (
             SELECT data->>'id' FROM app_records
              WHERE table_name = 'whatsapp_conversations' AND data->>'lead_id' = $2)`,
  [userId, leadId],
)).rows[0].n);

test("a student's whole history is removed by the delete", { skip }, async () => {
  const s = await addStudentWithHistory();
  assert.equal(await rowsFor(s.userId, s.leadId), 6, "the fixture did not create the history");
  await runDelete(pool, "student", s.leadId, { actorId: "boss" });
  // A message row reaches the person only through its conversation. If the delete matches rows by
  // lead, student or user id alone, the message bodies survive a "permanent" delete.
  const left = Number((await pool.query(
    "SELECT count(*)::int AS n FROM app_records WHERE table_name = 'whatsapp_messages' AND data->>'body' = 'IMPORTANT-HISTORY'",
  )).rows[0].n);
  assert.equal(left, 0, "the student's message bodies survived the delete, linked only by conversation_id");
  assert.equal(await rowsFor(s.userId, s.leadId), 0, "something was left behind");
  assert.equal(Number((await pool.query("SELECT count(*)::int AS n FROM auth_users WHERE id = $1", [s.userId])).rows[0].n), 0);
});

test("the snapshot carries every row the delete removed, not just the lead", { skip }, async () => {
  const s = await addStudentWithHistory();
  const result = await runDelete(pool, "student", s.leadId, { actorId: "boss" });
  const snap = result.snapshot;

  assert.ok(snap.lead, "the lead itself is missing from the snapshot");

  // Everything else the delete took. Without these the audit row cannot put the person back, and
  // deletion.mjs's own promise of "recoverable by hand from audit_log" does not hold.
  const records = snap.records || [];
  const tables = new Set(records.map((row) => row.table_name));
  for (const table of ["profiles", "documents", "applications", "whatsapp_conversations", "whatsapp_messages"]) {
    assert.ok(tables.has(table), `the snapshot has no ${table} row, so that part of the person cannot be restored`);
  }
  assert.ok(
    JSON.stringify(records).includes("IMPORTANT-HISTORY"),
    "the message bodies are gone from the snapshot, so the conversation history is unrecoverable",
  );
  assert.ok(
    JSON.stringify(records).includes(`${s.userId}/passport.pdf`),
    "no document row names its stored file, so the uploaded file is orphaned in app_storage with nothing to match it to",
  );
  assert.equal(String(snap.account?.id || ""), String(s.userId), "the login is not in the snapshot");
  assert.equal(snap.account?.email, `rec${s.n}@x.test`);
  assert.deepEqual(snap.roles?.map((r) => r.role), ["student"], "the role is not in the snapshot");
});

test("the snapshot is enough to put the student back: rebuilt from it alone", { skip }, async () => {
  const s = await addStudentWithHistory();
  const before = {
    rows: await rowsFor(s.userId, s.leadId),
    message: (await pool.query("SELECT data->>'body' AS body FROM app_records WHERE id = $1", [`rec-msg-${s.n}`])).rows[0].body,
  };
  const { snapshot } = await runDelete(pool, "student", s.leadId, { actorId: "boss" });
  assert.equal(await rowsFor(s.userId, s.leadId), 0);

  // The restore a person would do by hand, using nothing but the audit snapshot.
  for (const row of snapshot.records || []) {
    await pool.query(
      "INSERT INTO app_records (id, table_name, data, branch_id) VALUES ($1,$2,$3::jsonb,$4) ON CONFLICT (id) DO NOTHING",
      [row.id, row.table_name, JSON.stringify(row.data), row.branch_id],
    );
  }
  if (snapshot.account) {
    await pool.query(
      "INSERT INTO auth_users (id, email, password, user_metadata) VALUES ($1,$2,$3,$4::jsonb) ON CONFLICT (id) DO NOTHING",
      [snapshot.account.id, snapshot.account.email, snapshot.account.password || "x", JSON.stringify(snapshot.account.user_metadata || {})],
    );
    for (const role of snapshot.roles || []) {
      await pool.query(
        "INSERT INTO user_roles (user_id, role, branch_id) VALUES ($1,$2,$3) ON CONFLICT DO NOTHING",
        [snapshot.account.id, role.role, role.branch_id || null],
      );
    }
  }

  assert.equal(await rowsFor(s.userId, s.leadId), before.rows, "the rebuilt student is not the same size as the original");
  const message = (await pool.query("SELECT data->>'body' AS body FROM app_records WHERE id = $1", [`rec-msg-${s.n}`])).rows[0];
  assert.equal(message?.body, before.message, "the conversation history did not come back");
  const login = (await pool.query("SELECT email FROM auth_users WHERE id = $1", [s.userId])).rows[0];
  assert.equal(login?.email, `rec${s.n}@x.test`, "the login did not come back");
  const doc = (await pool.query("SELECT data->>'file_path' AS p FROM app_records WHERE id = $1", [`rec-doc-${s.n}`])).rows[0];
  const file = (await pool.query("SELECT data_url FROM app_storage WHERE path = $1", [doc.p])).rows[0];
  assert.ok(file?.data_url, "the restored document points at a file that is no longer in storage");
});

test("a snapshot that had to be truncated says so, instead of looking complete", { skip }, async () => {
  const s = await addStudentWithHistory();
  // More rows than any sane cap, so the limit is exercised.
  for (let i = 0; i < 40; i += 1) {
    await pool.query(
      "INSERT INTO app_records (id, table_name, data, branch_id) VALUES ($1,'whatsapp_messages',$2::jsonb,$3)",
      [`rec-bulk-${s.n}-${i}`, JSON.stringify({ id: `rec-bulk-${s.n}-${i}`, lead_id: s.leadId, body: `m${i}` }), B1],
    );
  }
  const { snapshot } = await runDelete(pool, "student", s.leadId, { actorId: "boss" });
  const kept = (snapshot.records || []).length;
  if (snapshot.truncated) {
    assert.ok(kept > 0, "a truncated snapshot kept nothing at all");
  } else {
    assert.ok(kept >= 46, `nothing was marked truncated, so every row must be present; got ${kept}`);
  }
});
