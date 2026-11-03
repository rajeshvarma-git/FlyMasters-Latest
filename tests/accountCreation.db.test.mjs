// Launch contract, account creation: a half-created account is removed again.
// Opt-in like accountWrites.db.test.mjs:  set TEST_DATABASE_URL=postgresql://user:pass@localhost:5432/anydb
// Uses a throwaway schema and drops it afterwards.

import test from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import pg from "pg";
import { createAccount, discardAccount } from "../server/lib/accountWrites.mjs";

const URL = process.env.TEST_DATABASE_URL;
const skip = URL ? false : "set TEST_DATABASE_URL to run the PostgreSQL checks";
const schema = `tcreate_${randomBytes(4).toString("hex")}`;
let pool;
let HYD;

const count = async (sql, params) => Number((await pool.query(sql, params)).rows[0].n);
const leftovers = (id) => count(
  `SELECT (SELECT count(*) FROM auth_users WHERE id = $1)
        + (SELECT count(*) FROM user_roles WHERE user_id = $1)
        + (SELECT count(*) FROM user_branches WHERE user_id = $1)
        + (SELECT count(*) FROM app_records WHERE data->>'user_id' = $1) AS n`,
  [id],
);
const addProfile = (id) => pool.query(
  "INSERT INTO app_records (id, table_name, data) VALUES ($1, 'profiles', $2::jsonb)",
  [`profile-${id}`, JSON.stringify({ user_id: id, first_name: "A" })],
);

test.before(async () => {
  if (skip) return;
  const admin = new pg.Pool({ connectionString: URL });
  await admin.query(`CREATE SCHEMA ${schema}`);
  await admin.end();
  pool = new pg.Pool({ connectionString: URL, options: `-c search_path=${schema}` });
  await pool.query(`
    CREATE TABLE branches (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), name text, code text UNIQUE NOT NULL);
    INSERT INTO branches (name, code) VALUES ('Hyderabad','HYD');
    CREATE TABLE auth_users (id text PRIMARY KEY, email text UNIQUE, password text, user_metadata jsonb DEFAULT '{}', created_at timestamptz DEFAULT now());
    CREATE TABLE user_roles (user_id text PRIMARY KEY, role text NOT NULL DEFAULT 'student', branch_id uuid REFERENCES branches(id), is_active boolean NOT NULL DEFAULT true, assigned_by text, created_at timestamptz DEFAULT now(), updated_at timestamptz DEFAULT now());
    CREATE TABLE user_branches (user_id text NOT NULL, branch_id uuid NOT NULL REFERENCES branches(id) ON DELETE CASCADE, assigned_by text, created_at timestamptz DEFAULT now(), PRIMARY KEY (user_id, branch_id));
    CREATE TABLE app_records (id text PRIMARY KEY, table_name text NOT NULL, data jsonb NOT NULL DEFAULT '{}', created_at timestamptz DEFAULT now(), updated_at timestamptz DEFAULT now());`);
  HYD = (await pool.query("SELECT id FROM branches WHERE code = 'HYD'")).rows[0].id;
});

test.after(async () => {
  if (skip) return;
  await pool.end();
  const admin = new pg.Pool({ connectionString: URL });
  await admin.query(`DROP SCHEMA ${schema} CASCADE`);
  await admin.end();
});

test("discardAccount leaves no login, role, branch or profile row behind", { skip }, async () => {
  await createAccount(pool, { id: "c1", email: "c1@x.test", passwordHash: "h", role: "counselor", branchIds: [HYD] });
  await addProfile("c1");
  assert.equal(await leftovers("c1"), 4);
  await discardAccount(pool, { id: "c1" });
  assert.equal(await leftovers("c1"), 0);
});

test("after a discard the same email can be used again (no 'already exists' trap)", { skip }, async () => {
  await createAccount(pool, { id: "c2", email: "c2@x.test", passwordHash: "h", role: "telecaller", branchIds: [HYD] });
  await discardAccount(pool, { id: "c2" });
  await createAccount(pool, { id: "c2b", email: "c2@x.test", passwordHash: "h", role: "telecaller", branchIds: [HYD] });
  assert.equal(await count("SELECT count(*) AS n FROM auth_users WHERE email = 'c2@x.test'"), 1);
});

test("discardAccount touches only the named account", { skip }, async () => {
  await createAccount(pool, { id: "keep", email: "keep@x.test", passwordHash: "h", role: "counselor", branchIds: [HYD] });
  await addProfile("keep");
  await createAccount(pool, { id: "gone", email: "gone@x.test", passwordHash: "h", role: "counselor", branchIds: [HYD] });
  await addProfile("gone");
  await discardAccount(pool, { id: "gone" });
  assert.equal(await leftovers("keep"), 4);
  assert.equal(await leftovers("gone"), 0);
});

test("discardAccount refuses an empty id instead of deleting everything", { skip }, async () => {
  await assert.rejects(() => discardAccount(pool, { id: "" }), /requires an id/);
});
