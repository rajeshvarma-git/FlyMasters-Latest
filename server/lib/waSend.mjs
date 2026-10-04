/**
 * Minimal WhatsApp Cloud API sender for the student case chat.
 *
 * Reads the same environment variables as server/student/whatsapp.ts
 * (WHATSAPP_API_KEY or WHATSAPP_ACCESS_TOKEN, WHATSAPP_PHONE_NUMBER_ID,
 * WHATSAPP_API_VERSION). WHATSAPP_GRAPH_BASE exists only so tests can point
 * at a stub instead of graph.facebook.com.
 */

const clean = (value) => String(value || "").trim().replace(/^['"]+|['"]+$/g, "").replace(/\s+/g, "");

const token = () => clean(process.env.WHATSAPP_API_KEY || process.env.WHATSAPP_ACCESS_TOKEN);
const phoneNumberId = () => clean(process.env.WHATSAPP_PHONE_NUMBER_ID);
const version = () => clean(process.env.WHATSAPP_API_VERSION) || "v21.0";
const base = () => String(process.env.WHATSAPP_GRAPH_BASE || "https://graph.facebook.com").replace(/\/$/, "");

// Last outbound attempts, newest first — shown on the admin WhatsApp page.
const sendLog = [];
const mask = (to) => (to ? `…${String(to).slice(-4)}` : "");
export function recentSends() {
  return sendLog.slice();
}
function logSend(entry) {
  sendLog.unshift({ at: new Date().toISOString(), ...entry });
  sendLog.length = Math.min(sendLog.length, 30);
}

export function whatsappSendConfigured() {
  return Boolean(token() && phoneNumberId());
}

/** Digits only, Indian 10-digit numbers get the 91 prefix. Null if unusable. */
export function normalizeWaPhone(input) {
  const digits = String(input || "").replace(/\D/g, "");
  if (!digits) return null;
  if (/^[6-9]\d{9}$/.test(digits)) return `91${digits}`;
  if (/^0[6-9]\d{9}$/.test(digits)) return `91${digits.slice(1)}`;
  if (digits.length >= 10 && digits.length <= 15) return digits;
  return null;
}

/** Sends a plain text message. Returns the WhatsApp message id; throws on failure. */
export async function sendWhatsAppText(to, text) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10000);
  try {
    const res = await fetch(`${base()}/${version()}/${phoneNumberId()}/messages`, {
      method: "POST",
      signal: controller.signal,
      headers: { Authorization: `Bearer ${token()}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        to,
        type: "text",
        text: { preview_url: false, body: String(text).slice(0, 4000) },
      }),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      const error = new Error(body?.error?.message || `WhatsApp API failed (${res.status})`);
      error.code = body?.error?.code;
      throw error;
    }
    const messageId = body?.messages?.[0]?.id;
    if (!messageId) throw new Error("WhatsApp API did not return a message id");
    logSend({ to: mask(to), ok: true });
    return messageId;
  } catch (error) {
    if (!error?.logged) logSend({ to: mask(to), ok: false, error: String(error?.message || error).slice(0, 200) });
    throw error;
  } finally {
    clearTimeout(timer);
  }
}
