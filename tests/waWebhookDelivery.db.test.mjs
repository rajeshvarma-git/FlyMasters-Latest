// Delivery outcomes as they actually arrive: a Meta status webhook, through the real handler.
//
// Milestone 2.3's gate is that enabled channels "show delivery outcomes". waDelivery.test.mjs pins the
// ordering rule, but the staff-portal webhook did not use it: it wrote whatever status arrived straight
// onto the message. Meta does not guarantee the order of status webhooks, so a late "sent" arriving
// after "delivered" would move a message backwards and show staff an outcome it had already passed.
//
// These tests post real webhook payloads at the route and read the row back, so they cover the wiring
// rather than the rule in isolation. A live provider is still needed to prove Meta sends these; nothing
// here replaces that.
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
const schema = `wah_${randomBytes(4).toString("hex")}`;

let pool;
let webhook;

if (!skip) {
  const admin = new pg.Pool({ connectionString: URL });
  await admin.query(`CREATE SCHEMA ${schema}`);
  await admin.end();
  process.env.DATABASE_URL = `${URL}${URL.includes("?") ? "&" : "?"}options=-c%20search_path%3D${schema}`;
  ({ pool } = await import("../server/lib/db.mjs"));
  const { migrate } = await import("../server/lib/migrate.mjs");
  await migrate();

  // The routes are registered on an app-like object, so the handler can be captured without a server.
  const { mountWhatsAppRoutes } = await import("../server/lib/whatsappRoutes.mjs");
  const routes = new Map();
  const app = {
    get: (path, ...handlers) => routes.set(`GET ${path}`, handlers.at(-1)),
    post: (path, ...handlers) => routes.set(`POST ${path}`, handlers.at(-1)),
  };
  mountWhatsAppRoutes(app, { pool, verifyJwt: () => null, notify: async () => {} });
  webhook = routes.get("POST /api/whatsapp/webhook");
  assert.ok(webhook, "the webhook route was not registered");
}

test.after(async () => {
  if (skip) return;
  await pool.end();
  const admin = new pg.Pool({ connectionString: URL });
  await admin.query(`DROP SCHEMA ${schema} CASCADE`);
  await admin.end();
});

/** A status receipt shaped the way Meta sends one. */
const receipt = (waMessageId, status, secondsSinceEpoch, errors) => ({
  object: "whatsapp_business_account",
  entry: [{
    changes: [{
      value: {
        metadata: { phone_number_id: "biz-1" },
        statuses: [{
          id: waMessageId, status, timestamp: String(secondsSinceEpoch),
          recipient_id: "919800000111", ...(errors ? { errors } : {}),
        }],
      },
    }],
  }],
});

async function post(body) {
  const res = { code: 200, body: null, status(c) { this.code = c; return this; }, json(b) { this.body = b; return this; } };
  await webhook({ body, headers: {}, query: {} }, res);
  return res;
}

let seq = 0;
async function addOutboundMessage() {
  const id = `wah-msg-${++seq}`;
  const waId = `wamid.${randomBytes(6).toString("hex")}`;
  await pool.query(
    "INSERT INTO app_records (id, table_name, data) VALUES ($1, 'whatsapp_messages', $2::jsonb)",
    [id, JSON.stringify({
      id, conversation_id: `wah-conv-${seq}`, direction: "outbound",
      body: "hello", wa_message_id: waId, created_at: new Date().toISOString(),
    })],
  );
  return { id, waId };
}
const read = async (id) => (await pool.query(
  "SELECT data->>'delivery_status' AS delivery_status, data->>'wa_status' AS wa_status FROM app_records WHERE id = $1",
  [id],
)).rows[0];

const T = Math.floor(Date.parse("2026-11-09T10:00:00Z") / 1000);

test("a receipt advances the message through sent, delivered and read", { skip }, async () => {
  const msg = await addOutboundMessage();
  for (const [status, at] of [["sent", T], ["delivered", T + 10], ["read", T + 20]]) {
    assert.equal((await post(receipt(msg.waId, status, at))).code, 200);
    const row = await read(msg.id);
    assert.equal(row.delivery_status, status, `after a ${status} receipt`);
    assert.equal(row.wa_status, status);
  }
});

test("a late 'sent' arriving after 'delivered' does not move the message backwards", { skip }, async () => {
  const msg = await addOutboundMessage();
  await post(receipt(msg.waId, "delivered", T + 10));
  assert.equal((await read(msg.id)).delivery_status, "delivered");

  // Meta does not guarantee ordering: this is the receipt that used to overwrite the row.
  await post(receipt(msg.waId, "sent", T));
  const row = await read(msg.id);
  assert.equal(row.delivery_status, "delivered", "a stale receipt regressed the delivery status");
  assert.equal(row.wa_status, "delivered");
});

test("'read' still wins after 'delivered', and nothing after it moves it back", { skip }, async () => {
  const msg = await addOutboundMessage();
  await post(receipt(msg.waId, "delivered", T));
  await post(receipt(msg.waId, "read", T + 5));
  assert.equal((await read(msg.id)).delivery_status, "read");
  await post(receipt(msg.waId, "delivered", T + 1));
  assert.equal((await read(msg.id)).delivery_status, "read", "a stale 'delivered' overwrote 'read'");
});

test("a failure after delivery is ignored, because the message did arrive", { skip }, async () => {
  const msg = await addOutboundMessage();
  await post(receipt(msg.waId, "delivered", T));
  await post(receipt(msg.waId, "failed", T + 5, [{ message: "Generic error" }]));
  assert.equal((await read(msg.id)).delivery_status, "delivered", "a failure receipt overrode a real delivery");
});

test("a failure before delivery is recorded, with the provider's reason", { skip }, async () => {
  const msg = await addOutboundMessage();
  await post(receipt(msg.waId, "failed", T, [{ message: "Re-engagement message" }]));
  const row = await read(msg.id);
  assert.match(row.delivery_status, /^failed: Re-engagement message$/, "the reason staff need is missing");
  assert.equal(row.wa_status, "failed");
});

test("a receipt for an unknown message id changes nothing and still answers 200", { skip }, async () => {
  const before = (await pool.query("SELECT count(*)::int AS n FROM app_records WHERE table_name = 'whatsapp_messages'")).rows[0].n;
  const res = await post(receipt("wamid.nothing-here", "delivered", T));
  assert.equal(res.code, 200, JSON.stringify(res.body));
  const after = (await pool.query("SELECT count(*)::int AS n FROM app_records WHERE table_name = 'whatsapp_messages'")).rows[0].n;
  assert.equal(after, before, "an unknown receipt created or changed a row");
});

test("a malformed receipt is ignored rather than written", { skip }, async () => {
  const msg = await addOutboundMessage();
  await post(receipt(msg.waId, "delivered", T));
  for (const bad of [["delivered", 0], ["delivered", NaN], ["nonsense", T + 50]]) {
    await post(receipt(msg.waId, bad[0], bad[1]));
  }
  assert.equal((await read(msg.id)).delivery_status, "delivered", "a malformed receipt changed the status");
});
