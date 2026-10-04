// Shared delivery rules. API acceptance is not proof of device delivery.
export const WA_WINDOW_MS = 24 * 60 * 60 * 1000 - 5 * 60 * 1000;
export function whatsappWindowOpen(lastInbound, now = Date.now()) {
  const last = Date.parse(lastInbound || "");
  return Number.isFinite(last) && last <= now && now - last < WA_WINDOW_MS;
}
const rank = { accepted: 0, sent: 1, delivered: 2, read: 3 };
export function deliveryStatusPatch(current, event) {
  const status = String(event?.status || "");
  if (!["sent", "delivered", "read", "failed"].includes(status)) return null;
  const seconds = Number(event.timestamp);
  if (!Number.isFinite(seconds) || seconds <= 0) return null;
  const at = new Date(seconds * 1000).toISOString();
  const previousAt = Date.parse(current?.wa_status_at || "");
  if (["sent", "delivered", "read", "failed"].includes(current?.wa_status) && Number.isFinite(previousAt) && Date.parse(at) < previousAt) return null;
  const previous = current?.wa_status;
  if (status === "failed" && ["delivered", "read"].includes(previous)) return null;
  if (status !== "failed" && previous in rank && rank[status] < rank[previous]) return null;
  return {
    wa_status: status,
    wa_status_at: at,
    wa_error: status === "failed"
      ? String(event.errors?.[0]?.message || event.errors?.[0]?.title || "WhatsApp delivery failed").slice(0, 200)
      : null,
  };
}

export function latestWhatsAppInbound(messages, conversationId) {
  return messages.filter((row) => String(row.conversation_id) === String(conversationId)
    && row.direction === "inbound" && row.channel !== "app" && row.wa_message_id)
    .map((row) => row.created_at).filter((at) => Number.isFinite(Date.parse(at || "")))
    .sort((a, b) => Date.parse(b) - Date.parse(a))[0] || null;
}
