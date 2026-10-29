// ACCESS-02C: staff sign-in (POST /api/auth/signin) makes the same access decision as the
// session check that follows it. The real route handler runs here; only the database is replaced.

process.env.DATABASE_URL = process.env.DATABASE_URL || "postgresql://nobody:nothing@127.0.0.1:1/none";

import test from "node:test";
import assert from "node:assert/strict";
import { scryptSync, randomBytes } from "node:crypto";
import jwt from "jsonwebtoken";
import core from "../server/routes/core.mjs";
import { pool } from "../server/lib/db.mjs";

const handler = core.stack.find((l) => l.route?.path === "/api/auth/signin" && l.route.methods.post).route.stack[0].handle;

const PASSWORD = "correct horse";
const salt = randomBytes(16).toString("hex");
const stored = `scrypt:${salt}:${scryptSync(PASSWORD, salt, 64).toString("hex")}`;
const authRow = { id: "u1", email: "staff@x.com", password: stored, user_metadata: {} };
const identity = (over = {}) => ({ id: "u1", email: "staff@x.com", has_role: true, role: "telecaller", branch_id: "b1", is_active: true, membership_ids: ["b1"], ...over });

function withDb(state, fn) {
  const original = pool.query.bind(pool);
  pool.query = async (sql) => {
    const text = String(sql);
    if (text.includes("FROM auth_users u")) {
      if (state === "db-down") throw new Error("db down");
      return { rows: [state === "missing" ? identity({ has_role: false, role: null, is_active: null, branch_id: null, membership_ids: [] }) : state === "disabled" ? identity({ is_active: false }) : identity()] };
    }
    if (text.includes("FROM auth_users WHERE lower(email)")) return { rows: [authRow] };
    return { rows: [] };
  };
  return Promise.resolve(fn()).finally(() => { pool.query = original; });
}

async function signIn(password = PASSWORD) {
  const res = { code: 200, body: null, status(c) { this.code = c; return this; }, json(b) { this.body = b; return this; } };
  await handler({ body: { email: "staff@x.com", password }, ip: `t-${Math.random()}` }, res);
  return res;
}

test("a healthy staff account signs in and the token carries its SQL role", async () => {
  await withDb("ok", async () => {
    const r = await signIn();
    assert.equal(r.code, 200);
    assert.equal(r.body.user.role, "telecaller");
    assert.equal(jwt.decode(r.body.token).role, "telecaller");
  });
});

test("a disabled account gets no token", async () => {
  await withDb("disabled", async () => {
    const r = await signIn();
    assert.deepEqual([r.code, r.body.code, r.body.token], [403, "ACCOUNT_DISABLED", undefined]);
  });
});

test("missing role, strict mode: no token, the same 403 the session check gives", async () => {
  process.env.IDENTITY_STRICT = "true";
  try {
    await withDb("missing", async () => {
      const r = await signIn();
      assert.deepEqual([r.code, r.body.code, r.body.token], [403, "ROLE_NOT_CONFIGURED", undefined]);
    });
  } finally { delete process.env.IDENTITY_STRICT; }
});

test("missing role, compatible mode: signs in as a student, as the session check does", async () => {
  await withDb("missing", async () => {
    const r = await signIn();
    assert.equal(r.code, 200);
    assert.equal(r.body.user.role, "student");
  });
});

test("a database failure on the identity lookup is a 500 and issues no token", async () => {
  await withDb("db-down", async () => {
    const r = await signIn();
    assert.deepEqual([r.code, r.body.token], [500, undefined]);
  });
});

test("a wrong password never reaches the access decision", async () => {
  await withDb("ok", async () => {
    const r = await signIn("wrong");
    assert.equal(r.code, 401);
  });
});