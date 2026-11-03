// Launch contract rule 5: nobody creates a counselor account from the public counselor page.
// The real route handlers run here; only the database is replaced, and every statement is recorded.

process.env.DATABASE_URL = process.env.DATABASE_URL || "postgresql://nobody:nothing@127.0.0.1:1/none";

import test from "node:test";
import assert from "node:assert/strict";
import counselor from "../server/routes/counselor.mjs";
import { pool } from "../server/lib/db.mjs";

const handlerFor = (path) => counselor.stack.find((l) => l.route?.path === path && l.route.methods.post).route.stack[0].handle;
const signup = handlerFor("/api/counselor/auth/signup");
const sendCode = handlerFor("/api/counselor/auth/send-verification-code");

async function call(handler, body, rows = () => []) {
  const sql = [];
  const original = pool.query.bind(pool);
  pool.query = async (text) => { sql.push(String(text).replace(/\s+/g, " ").trim()); return { rows: rows(String(text)) }; };
  const res = { code: 200, body: null, status(c) { this.code = c; return this; }, json(b) { this.body = b; return this; } };
  try {
    await handler({ body, ip: "t" }, res);
  } finally {
    pool.query = original;
  }
  return { res, sql };
}

const writes = (sql) => sql.filter((s) => /^(INSERT|UPDATE|DELETE|CREATE)/i.test(s));

test("a brand-new email cannot create a counselor account, and nothing is written", async () => {
  const { res, sql } = await call(signup, { email: "new@x.test", password: "secret12", firstName: "N", lastName: "M", verificationCode: "123456" });
  assert.equal(res.code, 403);
  assert.match(res.body.error, /created by an admin/);
  assert.equal(res.body.token, undefined);
  assert.deepEqual(writes(sql), []);
});

test("an email that only exists as a counselor_users row cannot be turned into a login either", async () => {
  const { res, sql } = await call(signup, { email: "old@x.test", password: "secret12", verificationCode: "123456" },
    (text) => (text.includes("FROM counselor_users") ? [{ id: "c1", email: "old@x.test", password_hash: "x" }] : []));
  assert.equal(res.code, 403);
  assert.deepEqual(writes(sql), []);
});

test("an account that belongs to another role is still refused with its own message", async () => {
  const { res, sql } = await call(signup, { email: "tc@x.test", password: "secret12" },
    (text) => (text.includes("FROM auth_users") ? [{ id: "u1", email: "tc@x.test", password: "x" }] : text.includes("FROM user_roles") ? [{ role: "telecaller" }] : []));
  assert.equal(res.code, 400);
  assert.match(res.body.error, /already in the admin portal/);
  assert.deepEqual(writes(sql), []);
});

test("a counselor who exists but types the wrong password is refused without a write", async () => {
  const { res, sql } = await call(signup, { email: "c@x.test", password: "wrong-pass" },
    (text) => (text.includes("FROM auth_users") ? [{ id: "u2", email: "c@x.test", password: "scrypt:aa:bb" }] : text.includes("FROM user_roles") ? [{ role: "counselor" }] : []));
  assert.equal(res.code, 401);
  assert.deepEqual(writes(sql), []);
});

test("no verification code is sent for sign-up any more", async () => {
  const { res, sql } = await call(sendCode, { email: "new@x.test" });
  assert.equal(res.code, 403);
  assert.match(res.body.error, /created by an admin/);
  assert.deepEqual(sql, []);
});
