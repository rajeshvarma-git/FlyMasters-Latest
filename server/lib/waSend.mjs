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

/** Approved template used to reach a lead after Meta's 24-hour reply window (empty = not set up). */
export const outreachTemplateName = () => clean(process.env.WHATSAPP_OUTREACH_TEMPLATE_NAME);
const outreachLanguage = () => clean(process.env.WHATSAPP_OUTREACH_TEMPLATE_LANGUAGE) || "en";

// Template variables may not hold line breaks, tabs or runs of spaces.
const templateParam = (value) =>
  String(value ?? "").replace(/[\r\n\t]+/g, " ").replace(/ {4,}/g, "   ").trim().slice(0, 900) || "-";

/** Sends the approved outreach template ({{1}} = first name, {{2}} = message). Returns the message id. */
export async function sendWhatsAppOutreach(to, firstName, text) {
  const name = outreachTemplateName();
  if (!name) throw new Error("No outreach template configured");
  const res = await fetch(`${base()}/${version()}/${phoneNumberId()}/messages`, {
    method: "POST",
    signal: AbortSignal.timeout(10000),
    headers: { Authorization: `Bearer ${token()}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      to,
      type: "template",
      template: {
        name,
        language: { code: outreachLanguage() },
        components: [{ type: "body", parameters: [templateParam(firstName || "there"), templateParam(text)].map((t) => ({ type: "text", text: t })) }],
      },
    }),
  });
  const body = await res.json().catch(() => ({}));
  const messageId = body?.messages?.[0]?.id;
  if (!res.ok || !messageId) {
    const error = new Error(body?.error?.message || `WhatsApp template failed (${res.status})`);
    error.code = body?.error?.code;
    logSend({ to: mask(to), ok: false, template: true, error: String(error.message).slice(0, 200) });
    throw error;
  }
  logSend({ to: mask(to), ok: true, template: true });
  return messageId;
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
