// Referral attribution survives a failure and can be recovered, against a real PostgreSQL.
//
// A referral decides whether a partner gets paid, so losing one is not a cosmetic bug. Sign-up
// attributes the code AFTER the account is committed, and deliberately so: a bad or expired code must
// never block a sign-up. The gap is what happens when that attribution fails for an infrastructure
// reason rather than a bad code. The submitted code must survive the failure so the referral can be
// attributed afterwards, and a captured attribution must never exist without its referral_events row.
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
const schema = `ref_${randomBytes(4).toString("hex")}`;

let pool;
let signUpUser;
let attachReferral;
let recoverPendingReferrals;
let B1;

if (!skip) {
  const admin = new pg.Pool({ connectionString: URL });
  await admin.query(`CREATE SCHEMA ${schema}`);
  await admin.end();
  const dsn = `${URL}${URL.includes("?") ? "&" : "?"}options=-c%20search_path%3D${schema}`;
  process.env.DATABASE_URL = dsn;
  process.env.STUDENT_DATABASE_URL = dsn;
  delete process.env.ADMIN_SIGNUP_CODE;
  delete process.env.ADMIN_SIGNUP_OPEN;
  ({ pool } = await import("../server/lib/db.mjs"));
  const { migrate } = await import("../server/lib/migrate.mjs");
  await migrate();
  ({ attachReferral, recoverPendingReferrals } = await import("../server/lib/partners.mjs"));
  ({ signUpUser } = await import("../server/student/studentAuth.ts"));
  B1 = (await pool.query("INSERT INTO branches (name, code) VALUES ('Hyderabad', 'HYD') RETURNING id")).rows[0].id;
}

test.after(async () => {
  if (skip) return;
  await pool.end();
  const admin = new pg.Pool({ connectionString: URL });
  await admin.query(`DROP SCHEMA ${schema} CASCADE`);
  await admin.end();
});

let seq = 0;
async function addPartner({ code, branchId = B1 }) {
  const { rows } = await pool.query(
    `INSERT INTO partners (full_name, business_name, email, phone, type, referral_code, is_active, verification_status, branch_id)
     VALUES ($1, $2, $3, $4, 'agent', $5, TRUE, 'verified', $6) RETURNING id`,
    [`Partner ${++seq}`, `Biz ${seq}`, `partner${seq}@x.test`, `99000000${seq}`, code, branchId],
  );
  return rows[0].id;
}

const signUp = (email, referral_code) =>
  signUpUser({ email, password: "secret12", user_metadata: { first_name: "Stu", last_name: "Dent" }, referral_code });

const leadFor = async (email) => (await pool.query(
  `SELECT id, data, referred_by_partner_id, referral_code_entered, branch_id
     FROM app_records WHERE table_name = 'student_leads' AND data->>'email' = $1`, [email],
)).rows[0];

const eventsFor = async (leadId) => (await pool.query(
  "SELECT outcome, code, source, partner_id FROM referral_events WHERE lead_id = $1::uuid ORDER BY id", [leadId],
)).rows;

/** Breaks partnerByCode the way a real outage would, without touching the code under test. */
async function withPartnersUnreachable(fn) {
  await pool.query(`ALTER TABLE partners RENAME TO partners_hidden_for_test`);
  try { return await fn(); } finally {
    await pool.query(`ALTER TABLE partners_hidden_for_test RENAME TO partners`);
  }
}

// ---- the behaviour that must not change -------------------------------------------------------

test("a sign-up with a good code is attributed, and the lead moves to the partner's branch", { skip }, async () => {
  const partnerId = await addPartner({ code: "REFGOOD1" });
  const email = `ref.good1@x.test`;
  const res = await signUp(email, "refgood1");
  assert.ok(res.session, `sign-up failed: ${JSON.stringify(res)}`);
  const lead = await leadFor(email);
  assert.equal(String(lead.referred_by_partner_id), String(partnerId));
  assert.equal(lead.referral_code_entered, "REFGOOD1");
  assert.equal(String(lead.branch_id), String(B1));
  const events = await eventsFor(lead.id);
  assert.equal(events.length, 1, JSON.stringify(events));
  assert.equal(events[0].outcome, "captured");
});

test("an unknown code never blocks the sign-up, and the attempt is recorded", { skip }, async () => {
  const email = `ref.unknown@x.test`;
  const res = await signUp(email, "NOSUCHCODE");
  assert.ok(res.session, `an unknown code blocked the sign-up: ${JSON.stringify(res)}`);
  const lead = await leadFor(email);
  assert.equal(lead.referred_by_partner_id, null);
  const events = await eventsFor(lead.id);
  assert.equal(events.length, 1, JSON.stringify(events));
  assert.equal(events[0].outcome, "rejected_unknown");
});

test("a sign-up with no code is untouched by any of this", { skip }, async () => {
  const email = `ref.none@x.test`;
  assert.ok((await signUp(email, undefined)).session);
  const lead = await leadFor(email);
  assert.equal(lead.referred_by_partner_id, null);
  assert.equal(lead.data.referral_code_submitted, undefined);
  assert.deepEqual(await eventsFor(lead.id), []);
});

// ---- the defect: a failed attribution loses the code for good ---------------------------------

test("the submitted code is stored with the lead, so a failed attribution can still be traced", { skip }, async () => {
  await addPartner({ code: "REFKEEP1" });
  const email = `ref.keep1@x.test`;
  await withPartnersUnreachable(async () => {
    const res = await signUp(email, "refkeep1");
    assert.ok(res.session, `the sign-up failed instead of carrying on: ${JSON.stringify(res)}`);
  });
  const lead = await leadFor(email);
  assert.equal(lead.referred_by_partner_id, null, "attribution somehow succeeded; this test proves nothing");
  assert.equal(
    String(lead.data.referral_code_submitted || "").toUpperCase(), "REFKEEP1",
    "the code the person signed up with is gone, so this referral can never be attributed or paid",
  );
});

test("recovery attributes a lead whose attribution failed at sign-up", { skip }, async () => {
  const partnerId = await addPartner({ code: "REFRECOV" });
  const email = `ref.recover@x.test`;
  await withPartnersUnreachable(async () => {
    assert.ok((await signUp(email, "refrecov")).session);
  });
  let lead = await leadFor(email);
  assert.equal(lead.referred_by_partner_id, null);

  const report = await recoverPendingReferrals();
  assert.ok(report.captured >= 1, `nothing was recovered: ${JSON.stringify(report)}`);

  lead = await leadFor(email);
  assert.equal(String(lead.referred_by_partner_id), String(partnerId), "the referral was not attributed on recovery");
  const events = await eventsFor(lead.id);
  assert.equal(events.filter((e) => e.outcome === "captured").length, 1, JSON.stringify(events));
  assert.equal(events.find((e) => e.outcome === "captured").source, "recovery");
});

test("recovery is safe to run twice: it does not attribute a lead a second time", { skip }, async () => {
  const partnerId = await addPartner({ code: "REFTWICE" });
  const email = `ref.twice@x.test`;
  await withPartnersUnreachable(async () => {
    assert.ok((await signUp(email, "reftwice")).session);
  });
  await recoverPendingReferrals();
  const after = await recoverPendingReferrals();
  const lead = await leadFor(email);
  assert.equal(String(lead.referred_by_partner_id), String(partnerId));
  const captured = (await eventsFor(lead.id)).filter((e) => e.outcome === "captured");
  assert.equal(captured.length, 1, `attributed ${captured.length} times`);
  assert.equal(after.captured, 0, `the second run captured ${after.captured} again`);
});

test("recovery leaves a lead that a human already attributed by hand alone", { skip }, async () => {
  const first = await addPartner({ code: "REFHAND1" });
  await addPartner({ code: "REFHAND2" });
  const email = `ref.hand@x.test`;
  await withPartnersUnreachable(async () => {
    assert.ok((await signUp(email, "refhand2")).session);
  });
  const lead = await leadFor(email);
  const manual = await attachReferral(lead.id, "REFHAND1", { source: "manual" });
  assert.equal(manual.outcome, "captured", JSON.stringify(manual));
  await recoverPendingReferrals();
  const after = await leadFor(email);
  assert.equal(
    String(after.referred_by_partner_id), String(first),
    "recovery overwrote an attribution a person had already made by hand",
  );
});

// ---- a captured attribution must never exist without its event row ----------------------------

test("if the captured event cannot be written, the attribution does not stand", { skip }, async () => {
  await addPartner({ code: "REFATOM1" });
  const email = `ref.atomic@x.test`;
  assert.ok((await signUp(email, undefined)).session);
  const lead = await leadFor(email);
  await pool.query(
    "ALTER TABLE referral_events ADD CONSTRAINT ref_block_captured CHECK (outcome <> 'captured') NOT VALID",
  );
  try {
    await assert.rejects(() => attachReferral(lead.id, "REFATOM1", { source: "manual" }));
    const after = await leadFor(email);
    assert.equal(
      after.referred_by_partner_id, null,
      "the lead was attributed with no referral_events row, so the partner has a claim with no trail",
    );
  } finally {
    await pool.query("ALTER TABLE referral_events DROP CONSTRAINT ref_block_captured");
  }
});
