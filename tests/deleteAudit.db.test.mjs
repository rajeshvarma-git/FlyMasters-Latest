// A permanent delete and its audit entry are one unit, against a real PostgreSQL.
//
// Nothing here is soft-deleted, so audit_log holds the only copy of what was removed (see the design
// note at the top of server/lib/deletion.mjs). That makes the audit row part of the delete, not a
// courtesy afterwards: if the audit entry cannot be written, the delete must not stand, and a delete
// that stands must always have left exactly one audit row carrying the snapshot.
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
const schema = `dla_${randomBytes(4).toString("hex")}`;

let pool;
let runDelete;
let deleteHandler;
let B1;

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
  ({ runDelete } = await import("../server/lib/deletion.mjs"));
  const core = (await import("../server/routes/core.mjs")).default;
  const layer = core.stack.find((l) => l.route?.path === "/api/admin/delete/:kind/:id" && l.route.methods.post);
  deleteHandler = layer.route.stack.at(-1).handle;
  B1 = (await pool.query("INSERT INTO branches (name, code) VALUES ('Hyderabad', 'HYD') RETURNING id")).rows[0].id;
}

test.after(async () => {
  if (skip) return;
  await pool.end();
  const admin = new pg.Pool({ connectionString: URL });
  await admin.query(`DROP SCHEMA ${schema} CASCADE`);
  await admin.end();
});

const SUPER = { id: "boss", role: "super_admin", email: "boss@x.test", scope: { allBranches: true, branchIds: [] } };

async function callDelete({ kind, id, actor = SUPER, confirm = "DELETE", reason = "cleanup" }) {
  const res = {
    code: 200, body: null,
    status(c) { this.code = c; return this; },
    json(b) { this.body = b; return this; },
  };
  const req = {
    body: { confirm, reason }, headers: {}, ip: "10.0.0.9", params: { kind, id }, query: {},
    user: { id: actor.id, role: actor.role, email: actor.email }, scope: actor.scope,
  };
  await deleteHandler(req, res);
  return res;
}

let seq = 0;
/** A lead the way the app stores it: JSON in app_records, branch in the column. */
async function addLead() {
  const id = `dla-lead-${++seq}`;
  const data = {
    id, user_id: randomUUID(), first_name: "Doomed", last_name: String(seq),
    email: `dla${seq}@x.test`, phone: `70000000${seq}`, entity_type: "lead",
    lead_status: "new", branch_id: B1,
  };
  await pool.query(
    "INSERT INTO app_records (id, table_name, data, branch_id) VALUES ($1, 'student_leads', $2::jsonb, $3)",
    [id, JSON.stringify(data), B1],
  );
  return id;
}

const leadExists = async (id) =>
  Number((await pool.query(
    "SELECT count(*)::int AS n FROM app_records WHERE table_name = 'student_leads' AND id = $1", [id],
  )).rows[0].n) > 0;

const auditRowsFor = async (id) => (await pool.query(
  "SELECT action, entity, entity_id, detail, actor_id FROM audit_log WHERE entity_id = $1 ORDER BY id", [id],
)).rows;

// ---- what must hold on the happy path ---------------------------------------------------------

test("a delete that succeeds leaves exactly one audit row carrying the snapshot", { skip }, async () => {
  const id = await addLead();
  const res = await callDelete({ kind: "lead", id });
  assert.equal(res.code, 200, JSON.stringify(res.body));
  assert.equal(await leadExists(id), false, "the lead is still there");
  const rows = await auditRowsFor(id);
  assert.equal(rows.length, 1, `expected one audit row, got ${rows.length}`);
  assert.equal(rows[0].action, "lead.delete");
  assert.equal(rows[0].actor_id, SUPER.id);
  assert.ok(rows[0].detail?.snapshot, "the audit row carries no snapshot, so the delete is unrecoverable");
  assert.equal(rows[0].detail?.reason, "cleanup");
});

test("a refused delete (no confirmation) removes nothing and writes no audit row", { skip }, async () => {
  const id = await addLead();
  const res = await callDelete({ kind: "lead", id, confirm: "" });
  assert.equal(res.code, 400, JSON.stringify(res.body));
  assert.equal(await leadExists(id), true, "the lead was deleted without confirmation");
  assert.deepEqual(await auditRowsFor(id), []);
});

// ---- the defect: the audit row is written after the delete has already committed ---------------

test("if the audit entry cannot be written, the delete does not stand", { skip }, async () => {
  const id = await addLead();
  // The audit row is the only record of what was removed. Make that write fail the way a real
  // failure would (a constraint the row cannot satisfy) and the delete must roll back with it.
  // NOT VALID so the constraint applies to new rows only; earlier tests already wrote lead.delete rows.
  await pool.query("ALTER TABLE audit_log ADD CONSTRAINT dla_block_delete_audit CHECK (action <> 'lead.delete') NOT VALID");
  try {
    const res = await callDelete({ kind: "lead", id });
    assert.notEqual(res.code, 200, "the request reported success even though nothing was audited");
    assert.equal(
      await leadExists(id), true,
      "the lead was permanently deleted with no audit row: the snapshot is gone and the delete cannot be undone",
    );
    assert.deepEqual(await auditRowsFor(id), []);
  } finally {
    await pool.query("ALTER TABLE audit_log DROP CONSTRAINT dla_block_delete_audit");
  }
});

test("after a failed audit write the record is still deletable, and then it is audited", { skip }, async () => {
  const id = await addLead();
  await pool.query("ALTER TABLE audit_log ADD CONSTRAINT dla_block_delete_audit CHECK (action <> 'lead.delete') NOT VALID");
  try {
    await callDelete({ kind: "lead", id });
  } finally {
    await pool.query("ALTER TABLE audit_log DROP CONSTRAINT dla_block_delete_audit");
  }
  const res = await callDelete({ kind: "lead", id });
  assert.equal(res.code, 200, `the retry failed: ${JSON.stringify(res.body)}`);
  assert.equal(await leadExists(id), false);
  const rows = await auditRowsFor(id);
  assert.equal(rows.length, 1, `expected one audit row after the retry, got ${rows.length}`);
  assert.ok(rows[0].detail?.snapshot);
});

// ---- the same rule inside runDelete itself ----------------------------------------------------

test("runDelete gives the audit write the transaction, so a throwing writer rolls the delete back", { skip }, async () => {
  const id = await addLead();
  await assert.rejects(
    () => runDelete(pool, "lead", id, {
      actorId: SUPER.id,
      writeAudit: async () => { throw new Error("audit writer failed"); },
    }),
    /audit writer failed/,
  );
  assert.equal(await leadExists(id), true, "the delete committed even though the audit writer threw");
});

test("runDelete passes the transaction client and the snapshot to the audit writer before committing", { skip }, async () => {
  const id = await addLead();
  let sawSnapshot = null;
  let leadStillVisibleInsideTransaction = null;
  await runDelete(pool, "lead", id, {
    actorId: SUPER.id,
    writeAudit: async (db, result) => {
      sawSnapshot = result?.snapshot || null;
      const inside = await db.query(
        "SELECT count(*)::int AS n FROM app_records WHERE table_name = 'student_leads' AND id = $1", [id],
      );
      leadStillVisibleInsideTransaction = Number(inside.rows[0].n) > 0;
    },
  });
  assert.ok(sawSnapshot, "the audit writer was not given the snapshot");
  assert.equal(leadStillVisibleInsideTransaction, false, "the audit writer did not run inside the delete transaction");
  assert.equal(await leadExists(id), false);
});
