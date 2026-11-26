// WhatsApp code as the second step of sign-in (staff and students).

import test from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import pg from "pg";

const URL = process.env.TEST_DATABASE_URL;
const skip = URL ? false : "set TEST_DATABASE_URL to run the PostgreSQL checks";
const schema = `mfa_${randomBytes(4).toString("hex")}`;

let pool;
let m;
const sent = [];
const send = async (number, code) => { sent.push({ number, code }); };

if (!skip) {
  const admin = new pg.Pool({ connectionString: URL });
  await admin.query(`CREATE SCHEMA ${schema}`);
  await admin.end();
  process.env.DATABASE_URL = `${URL}${URL.includes("?") ? "&" : "?"}options=-c%20search_path%3D${schema}`;
  process.env.JWT_SECRET = process.env.JWT_SECRET || `mfa-test-${randomBytes(8).toString("hex")}`;
  ({ pool } = await import("../server/lib/db.mjs"));
  const { migrate } = await import("../server/lib/migrate.mjs");
  await migrate();
  m = await import("../server/lib/loginMfa.mjs");
}

test.after(async () => {
  if (skip) return;
  await pool.end();
  const admin = new pg.Pool({ connectionString: URL });
  await admin.query(`DROP SCHEMA ${schema} CASCADE`);
  await admin.end();
});

const profile = (userId, data) =>
  pool.query("INSERT INTO app_records (id, table_name, data) VALUES ($1, 'profiles', $2::jsonb)", [`p-${userId}-${randomBytes(3).toString("hex")}`, JSON.stringify({ user_id: userId, ...data })]);

test("switch off: sign-in is untouched and nothing is sent", { skip }, async () => {
  delete process.env.LOGIN_WHATSAPP_MFA;
  sent.length = 0;
  const r = await m.beginLoginMfa({ pool, userId: "u0", role: "admin", send });
  assert.deepEqual(r, { required: false });
  assert.equal(sent.length, 0);
});

test("switch on: the code goes to the number on the profile, never anywhere else", { skip }, async () => {
  process.env.LOGIN_WHATSAPP_MFA = "on";
  sent.length = 0;
  await profile("u1", { whatsapp_number: "98765 43210", phone: "9111111111" });
  const r = await m.beginLoginMfa({ pool, userId: "u1", role: "counselor", send });
  assert.equal(r.required, true);
  assert.equal(sent.length, 1);
  assert.equal(sent[0].number, "919876543210");
  assert.match(r.masked, /43210$/);
  assert.match(sent[0].code, /^\d{6}$/);
});

test("the right code releases the sign-in once; a second use is refused", { skip }, async () => {
  process.env.LOGIN_WHATSAPP_MFA = "on";
  sent.length = 0;
  await profile("u2", { phone: "9876501234" });
  const r = await m.beginLoginMfa({ pool, userId: "u2", role: "admin", send });
  const ok = await m.checkLoginCode({ pool, challengeId: r.challengeId, code: sent[0].code });
  assert.deepEqual(ok, { ok: true, userId: "u2" });
  const again = await m.checkLoginCode({ pool, challengeId: r.challengeId, code: sent[0].code });
  assert.equal(again.ok, undefined);
});

test("wrong codes are counted and lock the challenge after 5", { skip }, async () => {
  process.env.LOGIN_WHATSAPP_MFA = "on";
  sent.length = 0;
  await profile("u3", { whatsapp_number: "9876509999" });
  const r = await m.beginLoginMfa({ pool, userId: "u3", role: "admin", send });
  const wrong = sent[0].code === "111111" ? "222222" : "111111";
  for (let i = 0; i < m.MAX_TRIES; i += 1) {
    const x = await m.checkLoginCode({ pool, challengeId: r.challengeId, code: wrong });
    assert.equal(x.status, 400);
  }
  const locked = await m.checkLoginCode({ pool, challengeId: r.challengeId, code: sent[0].code });
  assert.equal(locked.status, 429, "even the right code fails after too many wrong ones");
});

test("an expired code is refused", { skip }, async () => {
  process.env.LOGIN_WHATSAPP_MFA = "on";
  sent.length = 0;
  await profile("u4", { whatsapp_number: "9876508888" });
  const r = await m.beginLoginMfa({ pool, userId: "u4", role: "admin", send });
  await pool.query(`UPDATE app_records SET data = jsonb_set(data, '{expires_at}', to_jsonb($2::text)) WHERE id = $1`, [`login_challenges:${r.challengeId}`, new Date(Date.now() - 1000).toISOString()]);
  const x = await m.checkLoginCode({ pool, challengeId: r.challengeId, code: sent[0].code });
  assert.equal(x.ok, undefined);
  assert.match(x.error, /expired/i);
});

test("a new code cannot be asked for within 30 seconds, and replaces the old one after", { skip }, async () => {
  process.env.LOGIN_WHATSAPP_MFA = "on";
  sent.length = 0;
  await profile("u5", { whatsapp_number: "9876507777" });
  const r = await m.beginLoginMfa({ pool, userId: "u5", role: "admin", send });
  const soon = await m.resendLoginCode({ pool, challengeId: r.challengeId, send });
  assert.equal(soon.status, 429);
  await pool.query(`UPDATE app_records SET data = jsonb_set(data, '{sent_at}', to_jsonb($2::text)) WHERE id = $1`, [`login_challenges:${r.challengeId}`, new Date(Date.now() - 60000).toISOString()]);
  const again = await m.resendLoginCode({ pool, challengeId: r.challengeId, send });
  assert.equal(again.required, true);
  assert.equal(sent.length, 2);
  const old = await m.checkLoginCode({ pool, challengeId: r.challengeId, code: sent[0].code });
  const fresh = await m.checkLoginCode({ pool, challengeId: r.challengeId, code: sent[1].code });
  assert.equal(fresh.ok, true);
  assert.ok(sent[0].code === sent[1].code ? old.ok : !old.ok, "the first code stops working once a new one is sent");
});

test("staff with no number are stopped; a student with none gets in once so the first chat can collect it", { skip }, async () => {
  process.env.LOGIN_WHATSAPP_MFA = "on";
  sent.length = 0;
  const staff = await m.beginLoginMfa({ pool, userId: "nobody1", role: "admin", send });
  assert.equal(staff.status, 403);
  const student = await m.beginLoginMfa({ pool, userId: "nobody2", role: "student", send });
  assert.deepEqual(student, { required: false, noNumber: true });
  assert.equal(sent.length, 0);
});

test("if WhatsApp cannot send, nobody is let in and no challenge is left", { skip }, async () => {
  process.env.LOGIN_WHATSAPP_MFA = "on";
  await profile("u6", { whatsapp_number: "9876506666" });
  const before = (await pool.query("SELECT count(*) FROM app_records WHERE table_name='login_challenges'")).rows[0].count;
  const r = await m.beginLoginMfa({ pool, userId: "u6", role: "admin", send: async () => { throw new Error("Meta down"); } });
  assert.equal(r.status, 502);
  const after = (await pool.query("SELECT count(*) FROM app_records WHERE table_name='login_challenges'")).rows[0].count;
  assert.equal(after, before);
});
