import test from 'node:test';
import assert from 'node:assert/strict';
import { whatsappWindowOpen, WA_WINDOW_MS, deliveryStatusPatch } from '../server/lib/waDelivery.mjs';
const now = Date.parse('2026-10-04T10:00:00Z');
test('reply window excludes old, future and invalid timestamps', () => {
  assert.equal(whatsappWindowOpen(new Date(now - WA_WINDOW_MS + 1).toISOString(), now), true);
  for (const at of [new Date(now - WA_WINDOW_MS).toISOString(), new Date(now + 1).toISOString(), '', 'invalid'])
    assert.equal(whatsappWindowOpen(at, now), false);
});
test('Meta receipts advance acceptance through device delivery and reading', () => {
  const sent = deliveryStatusPatch({wa_status:'accepted'}, {status:'sent',timestamp:100});
  assert.equal(sent.wa_status, 'sent');
  const delivered = deliveryStatusPatch(sent, {status:'delivered',timestamp:101});
  assert.equal(delivered.wa_status, 'delivered');
  assert.equal(deliveryStatusPatch(delivered, {status:'sent',timestamp:102}), null);
  assert.equal(deliveryStatusPatch(delivered, {status:'failed',timestamp:102}), null);
  assert.equal(deliveryStatusPatch(delivered, {status:'read',timestamp:102}).wa_status, 'read');
});
test('invalid, stale and unknown receipts cannot overwrite a status', () => {
  const current={wa_status:'sent',wa_status_at:new Date(200000).toISOString()};
  for(const event of [{status:'delivered',timestamp:199},{status:'garbage',timestamp:201},{status:'read',timestamp:'invalid'}])
    assert.equal(deliveryStatusPatch(current,event),null);
  assert.equal(deliveryStatusPatch(current,{status:'failed',timestamp:201,errors:[{message:'Recipient unavailable'}]}).wa_error,'Recipient unavailable');
});

test('second-resolution receipt following millisecond API acceptance is retained',()=>{
 assert.equal(deliveryStatusPatch({wa_status:'accepted',wa_status_at:new Date(100999).toISOString()},{status:'sent',timestamp:100}).wa_status,'sent');
});

test('app messages cannot reopen the WhatsApp reply window', async()=>{
 const { latestWhatsAppInbound } = await import('../server/lib/waDelivery.mjs');
 const old = new Date(now-WA_WINDOW_MS-1).toISOString();
 const at=latestWhatsAppInbound([
  {conversation_id:'c1',direction:'inbound',wa_message_id:'real',created_at:old},
  {conversation_id:'c1',direction:'inbound',channel:'app',created_at:new Date(now).toISOString()},
  {conversation_id:'c2',direction:'inbound',wa_message_id:'other',created_at:new Date(now).toISOString()},
 ],'c1');
 assert.equal(at,old);assert.equal(whatsappWindowOpen(at,now),false);
});
