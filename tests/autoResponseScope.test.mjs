// Launch contract: PUT /api/comms/auto-response is open to every staff role, so the handler itself must
// keep a non-admin to their own auto-reply. The real handler runs; only the database is replaced.

process.env.DATABASE_URL = process.env.DATABASE_URL || "postgresql://nobody:nothing@127.0.0.1:1/none";

import test from "node:test";
import assert from "node:assert/strict";
import comms from "../server/routes/comms.mjs";
import { pool } from "../server/lib/db.mjs";

const layer = comms.stack.find((l) => l.route?.path === "/api/comms/auto-response" && l.route.methods.put);
const handler = layer.route.stack.at(-1).handle;

async function put(role, body) {
  const sql = [];
  const original = pool.query.bind(pool);
  pool.query = async (text) => {
    sql.push(String(text).replace(/\s+/g, " ").trim());
    return { rows: /^INSERT/.test(String(text).trim()) ? [{ id: "r1" }] : [] };
  };
  const res = { code: 200, body: null, status(c) { this.code = c; return this; }, json(b) { this.body = b; return this; } };
  try {
    await handler({ body, user: { id: "u1", email: "u1@x.test", role }, scope: { allBranches: false, branchIds: [] }, headers: {}, ip: "t" }, res);
  } catch {
    // a failure after the access check is not what this test looks at
  } finally {
    pool.query = original;
  }
  return { res, sql, wrote: sql.some((s) => /^INSERT INTO auto_response_rules/.test(s)) };
}

for (const role of ["counselor", "telecaller", "accountant", "branch_head"]) {
  test(`${role}: cannot change a global or branch auto-reply, and nothing is written`, async () => {
    for (const scope_type of ["global", "branch"]) {
      const r = await put(role, { scope_type, scope_id: "*", message: "hi" });
      assert.equal(r.res.code, 403, `${scope_type}`);
      assert.equal(r.wrote, false);
    }
  });

  test(`${role}: cannot change another person's auto-reply, and nothing is written`, async () => {
    const r = await put(role, { scope_type: "user", scope_id: "someone-else", message: "hi" });
    assert.equal(r.res.code, 403);
    assert.equal(r.wrote, false);
  });

  test(`${role}: can change their own auto-reply`, async () => {
    const r = await put(role, { scope_type: "user", scope_id: "u1", message: "hi" });
    assert.notEqual(r.res.code, 403);
    assert.equal(r.wrote, true);
  });
}

for (const role of ["admin", "super_admin"]) {
  test(`${role}: can change a global auto-reply`, async () => {
    const r = await put(role, { scope_type: "global", scope_id: "*", message: "hi" });
    assert.notEqual(r.res.code, 403);
    assert.equal(r.wrote, true);
  });
}
