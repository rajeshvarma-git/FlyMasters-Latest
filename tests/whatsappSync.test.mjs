import test from "node:test";
import assert from "node:assert/strict";
import { createWhatsAppService } from "../server/lib/whatsappService.mjs";

function setup(leads) {
  const tables = { whatsapp_conversations: [], whatsapp_seat_history: [] };
  const log = { reads: 0, writes: 0 };
  const svc = createWhatsAppService({
    jsonTable: async (name) => { log.reads += 1; return structuredClone(tables[name] || []); },
    jsonUpsert: async (name, row) => {
      log.writes += 1;
      const list = (tables[name] ||= []);
      const at = list.findIndex((r) => String(r.id) === String(row.id));
      if (at >= 0) list[at] = { ...row }; else list.push({ ...row });
      return { ...row };
    },
    config: {}, notify: async () => {}, notifyAdmins: async () => {}, pool: null,
  });
  return { svc, log, tables, leads };
}

const leads = Array.from({ length: 40 }, (_, i) => ({
  id: `L${i}`, first_name: `Lead${i}`, phone: `+91900000${String(i).padStart(4, "0")}`,
  assigned_telecaller_id: "tele-1", lead_status: "warm", entity_type: "lead",
}));

test("the first poll links every lead's thread; a second poll with nothing changed writes nothing", async () => {
  const { svc, log } = setup(leads);
  await svc.syncConversationsForLeads(leads);
  assert.ok(log.writes >= leads.length, "threads were not created");
  const before = log.writes;
  const readsBefore = log.reads;
  await svc.syncConversationsForLeads(leads);
  assert.equal(log.writes, before, "a quiet poll rewrote rows");
  assert.equal(log.reads - readsBefore, 1, "a quiet poll should read the table once, not once per lead");
});

test("a lead handed to another telecaller moves its thread's owner on the next poll", async () => {
  const { svc, tables } = setup(leads);
  await svc.syncConversationsForLeads(leads);
  const moved = leads.map((l) => (l.id === "L3" ? { ...l, assigned_telecaller_id: "tele-2" } : l));
  await svc.syncConversationsForLeads(moved);
  const row = tables.whatsapp_conversations.find((r) => r.lead_id === "L3");
  assert.equal(row.assigned_staff_id, "tele-2");
});
