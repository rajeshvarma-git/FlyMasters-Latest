import { createHash, createHmac, randomInt, timingSafeEqual } from "crypto";
import type { IncomingMessage, ServerResponse } from "http";
import { mutateAppState, readAppState } from "./postgres";
import { getSessionByToken, readBearerToken, type PublicUser } from "./studentAuth";

const CODE_TTL_MS = 10 * 60 * 1000;
const MAX_VERIFY_ATTEMPTS = 5;
const RESEND_COOLDOWN_MS = 60 * 1000;
const DEFAULT_GRAPH_VERSION = "v21.0";

export function isWhatsAppPath(pathname: string) {
  return pathname === "/api/whatsapp" || pathname.startsWith("/api/whatsapp/");
}

function normalizeSecret(value: string) {
  return String(value || "")
    .trim()
    .replace(/^['"]+|['"]+$/g, "")
    .replace(/\s+/g, "");
}

function getAccessToken() {
  return normalizeSecret(process.env.WHATSAPP_API_KEY || process.env.WHATSAPP_ACCESS_TOKEN || "");
}

function getPhoneNumberId() {
  return normalizeSecret(process.env.WHATSAPP_PHONE_NUMBER_ID || "");
}

function getVerifyToken() {
  return normalizeSecret(process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN || "");
}

function getAppSecret() {
  return normalizeSecret(process.env.WHATSAPP_APP_SECRET || "");
}

function getGraphVersion() {
  return normalizeSecret(process.env.WHATSAPP_API_VERSION || "") || DEFAULT_GRAPH_VERSION;
}

function getOtpTemplateName() {
  return normalizeSecret(process.env.WHATSAPP_OTP_TEMPLATE_NAME || "") || "flymasters_otp";
}

function getOtpTemplateLanguage() {
  return normalizeSecret(process.env.WHATSAPP_OTP_TEMPLATE_LANGUAGE || "") || "en";
}

export function isWhatsAppConfigured() {
  return Boolean(getAccessToken() && getPhoneNumberId());
}

function sendJson(res: ServerResponse, status: number, payload: unknown) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json");
  res.end(JSON.stringify(payload));
}

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on("data", (chunk: Buffer) => chunks.push(chunk));
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

function readRawBody(req: IncomingMessage): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on("data", (chunk: Buffer) => chunks.push(chunk));
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}

export function normalizeWhatsAppPhone(input: string): string | null {
  const digits = String(input || "").replace(/\D/g, "");
  if (!digits) return null;
  if (/^[6-9]\d{9}$/.test(digits)) return `91${digits}`;
  if (/^91[6-9]\d{9}$/.test(digits)) return digits;
  if (/^0[6-9]\d{9}$/.test(digits)) return `91${digits.slice(1)}`;
  if (digits.length >= 10 && digits.length <= 15) return digits;
  return null;
}

function formatDisplayPhone(phone: string) {
  const normalized = normalizeWhatsAppPhone(phone) || phone;
  if (/^91\d{10}$/.test(normalized)) return `+${normalized.slice(0, 2)} ${normalized.slice(2)}`;
  return `+${normalized}`;
}

function hashCode(phone: string, code: string) {
  return createHash("sha256").update(`${phone}:${code}`).digest("hex");
}

function generateCode() {
  return String(randomInt(100000, 999999));
}

function safeEqual(a: string, b: string) {
  const left = Buffer.from(String(a || ""));
  const right = Buffer.from(String(b || ""));
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}

async function loadTable(table: string): Promise<any[]> {
  const state = await readAppState({ table, includeStorage: false });
  return state.tables[table] || [];
}

async function insertRow(table: string, row: Record<string, any>) {
  const result = await mutateAppState({ action: "insert", table, rows: [row] });
  const data = result.data;
  return Array.isArray(data) ? data[0] : data;
}

async function updateRow(table: string, id: string, payload: Record<string, any>) {
  const result = await mutateAppState({
    action: "update",
    table,
    payload,
    filters: [{ op: "eq", column: "id", value: id }],
  });
  const data = result.data;
  return Array.isArray(data) ? data[0] : data;
}

async function getUserRole(userId: string): Promise<string> {
  const roles = (await loadTable("user_roles")).filter((row) => String(row.user_id) === String(userId));
  const hierarchy = ["super_admin", "admin", "counselor", "telecaller", "student"];
  for (const role of hierarchy) {
    if (roles.some((row) => row.role === role)) return role;
  }
  return "student";
}

function isStaffRole(role: string) {
  return role === "admin" || role === "super_admin" || role === "counselor" || role === "telecaller";
}

function personName(row: any) {
  const full = String(row?.full_name || "").trim();
  if (full) return full;
  const parts = [row?.first_name, row?.last_name].filter(Boolean).join(" ").trim();
  return parts || "";
}

function phonesMatch(a: string | null | undefined, b: string | null | undefined) {
  const left = normalizeWhatsAppPhone(String(a || ""));
  const right = normalizeWhatsAppPhone(String(b || ""));
  return Boolean(left && right && left === right);
}

async function findLeadForUserOrPhone(userId?: string | null, phone?: string | null) {
  const leads = await loadTable("student_leads");
  if (userId) {
    const byUser = leads.find((lead) => String(lead.user_id) === String(userId));
    if (byUser) return byUser;
  }
  if (phone) {
    const byPhone = leads.find(
      (lead) => phonesMatch(lead.whatsapp_number, phone) || phonesMatch(lead.phone, phone)
    );
    if (byPhone) return byPhone;
  }
  return null;
}

async function findProfileForUserOrPhone(userId?: string | null, phone?: string | null) {
  const profiles = await loadTable("profiles");
  if (userId) {
    const byUser = profiles.find((profile) => String(profile.user_id) === String(userId));
    if (byUser) return byUser;
  }
  if (phone) {
    const byPhone = profiles.find(
      (profile) => phonesMatch(profile.whatsapp_number, phone) || phonesMatch(profile.phone, phone)
    );
    if (byPhone) return byPhone;
  }
  return null;
}

function graphUrl(path: string) {
  return `https://graph.facebook.com/${getGraphVersion()}/${path}`;
}

async function graphPost(path: string, payload: Record<string, any>) {
  const token = getAccessToken();
  const response = await fetch(graphUrl(path), {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message =
      body?.error?.message || body?.error?.error_user_msg || `WhatsApp API failed (${response.status})`;
    const error = new Error(message) as Error & { status?: number; details?: any };
    error.status = response.status;
    error.details = body;
    throw error;
  }
  return body;
}

async function sendWhatsAppText(to: string, text: string) {
  const phoneNumberId = getPhoneNumberId();
  return graphPost(`${phoneNumberId}/messages`, {
    messaging_product: "whatsapp",
    to,
    type: "text",
    text: { preview_url: false, body: text },
  });
}

async function sendWhatsAppOtpTemplate(to: string, code: string) {
  const phoneNumberId = getPhoneNumberId();
  const includeButton = String(process.env.WHATSAPP_OTP_TEMPLATE_BUTTON || "true").toLowerCase() !== "false";
  const buttonType = normalizeSecret(process.env.WHATSAPP_OTP_BUTTON_TYPE || "url").toLowerCase();
  const template: Record<string, any> = {
    name: getOtpTemplateName(),
    language: { code: getOtpTemplateLanguage() },
    components: [
      {
        type: "body",
        parameters: [{ type: "text", text: code }],
      },
    ],
  };
  if (includeButton) {
    template.components.push(
      buttonType === "copy_code"
        ? {
            type: "button",
            sub_type: "copy_code",
            index: "0",
            parameters: [{ type: "coupon_code", coupon_code: code }],
          }
        : {
            type: "button",
            sub_type: "url",
            index: "0",
            parameters: [{ type: "text", text: code }],
          }
    );
  }

  try {
    return await graphPost(`${phoneNumberId}/messages`, {
      messaging_product: "whatsapp",
      to,
      type: "template",
      template,
    });
  } catch (error: any) {
    if (!includeButton) throw error;
    const fallbackTemplate = {
      ...template,
      components: template.components.filter((component: any) => component.type !== "button"),
    };
    return graphPost(`${phoneNumberId}/messages`, {
      messaging_product: "whatsapp",
      to,
      type: "template",
      template: fallbackTemplate,
    });
  }
}

async function requireSession(req: IncomingMessage) {
  const session = await getSessionByToken(readBearerToken(req));
  if (!session?.user) {
    const error = new Error("Please sign in to continue.") as Error & { status?: number };
    error.status = 401;
    throw error;
  }
  const role = await getUserRole(session.user.id);
  return { session, role, user: session.user };
}

async function requireStaff(req: IncomingMessage) {
  const auth = await requireSession(req);
  if (!isStaffRole(auth.role)) {
    const error = new Error("Staff access required.") as Error & { status?: number };
    error.status = 403;
    throw error;
  }
  return auth;
}

function canAccessConversation(role: string, userId: string, conversation: any, lead: any) {
  if (role === "admin" || role === "super_admin") return true;
  if (role === "counselor") {
    return (
      String(lead?.assigned_counselor_id || "") === String(userId) ||
      String(conversation?.assigned_staff_id || "") === String(userId)
    );
  }
  if (role === "telecaller") {
    return (
      String(lead?.assigned_telecaller_id || "") === String(userId) ||
      String(conversation?.assigned_staff_id || "") === String(userId)
    );
  }
  return false;
}

async function ensureConversation(options: {
  phone: string;
  userId?: string | null;
  leadId?: string | null;
  contactName?: string | null;
}) {
  const conversations = await loadTable("whatsapp_conversations");
  const existing = conversations.find((row) => phonesMatch(row.phone_number, options.phone));
  const lead = await findLeadForUserOrPhone(options.userId, options.phone);
  const profile = await findProfileForUserOrPhone(options.userId, options.phone);
  const payload = {
    phone_number: options.phone,
    user_id: options.userId || existing?.user_id || profile?.user_id || lead?.user_id || null,
    lead_id: options.leadId || existing?.lead_id || lead?.id || null,
    contact_name: options.contactName || existing?.contact_name || personName(profile) || personName(lead) || null,
    assigned_staff_id: existing?.assigned_staff_id || lead?.assigned_counselor_id || lead?.assigned_telecaller_id || null,
    staff_role: existing?.staff_role || (lead?.assigned_counselor_id ? "counselor" : lead?.assigned_telecaller_id ? "telecaller" : null),
  };

  if (existing) {
    const next = {
      ...payload,
      last_message_at: existing.last_message_at,
    };
    await updateRow("whatsapp_conversations", existing.id, next);
    return { ...existing, ...next };
  }

  return insertRow("whatsapp_conversations", {
    ...payload,
    last_message_at: null,
  });
}

async function markVerified(user: PublicUser, phone: string) {
  const now = new Date().toISOString();
  const profile = await findProfileForUserOrPhone(user.id, phone);
  if (profile) {
    await updateRow("profiles", profile.id, {
      whatsapp_number: phone,
      whatsapp_verified: true,
      whatsapp_verified_at: now,
      phone: profile.phone || formatDisplayPhone(phone),
    });
  }

  const lead = await findLeadForUserOrPhone(user.id, phone);
  if (lead) {
    await updateRow("student_leads", lead.id, {
      whatsapp_number: phone,
      whatsapp_verified: true,
      whatsapp_verified_at: now,
      is_otp_verified: true,
      phone: lead.phone || formatDisplayPhone(phone),
    });
  }

  await ensureConversation({
    phone,
    userId: user.id,
    leadId: lead?.id,
    contactName: personName(profile) || personName(lead) || user.email,
  });
}

function publicVerification(userId: string, profile: any, lead: any) {
  const verified = Boolean(profile?.whatsapp_verified || lead?.whatsapp_verified);
  const phone = profile?.whatsapp_number || lead?.whatsapp_number || profile?.phone || lead?.phone || null;
  return {
    verified,
    phone_number: phone ? formatDisplayPhone(String(phone)) : null,
    verified_at: profile?.whatsapp_verified_at || lead?.whatsapp_verified_at || null,
    user_id: userId,
  };
}

function verificationWasSent(row: any) {
  return row?.status === "sent" || Boolean(row?.sent_at);
}

const otpInFlight = new Map<string, number>();

async function handleSendOtp(req: IncomingMessage, res: ServerResponse) {
  const { user } = await requireSession(req);
  if (!isWhatsAppConfigured()) {
    sendJson(res, 503, {
      error: "WhatsApp is not configured. Set WHATSAPP_API_KEY and WHATSAPP_PHONE_NUMBER_ID.",
    });
    return;
  }

  const body = JSON.parse((await readBody(req)) || "{}");
  const phone = normalizeWhatsAppPhone(body.phone_number || body.phone || "");
  if (!phone || !/^91[6-9]\d{9}$/.test(phone)) {
    sendJson(res, 400, { error: "Enter a valid 10-digit Indian mobile number." });
    return;
  }

  const lockKey = `${user.id}:${phone}`;
  const lockStarted = otpInFlight.get(lockKey);
  if (lockStarted && Date.now() - lockStarted < 15000) {
    sendJson(res, 429, {
      error: "We're already sending a code to this number. Please wait a few seconds.",
      retry_after_seconds: Math.max(1, Math.ceil((15000 - (Date.now() - lockStarted)) / 1000)),
      code_pending: true,
      phone_number: formatDisplayPhone(phone),
    });
    return;
  }

  const verifications = await loadTable("whatsapp_verifications");
  const recent = verifications
    .filter((row) => phonesMatch(row.phone_number, phone) && String(row.user_id || "") === String(user.id))
    .sort((a, b) => String(b.created_at || "").localeCompare(String(a.created_at || "")))[0];
  const sentAt = recent ? new Date(recent.sent_at || (verificationWasSent(recent) ? recent.created_at : 0)).getTime() : 0;
  if (recent && verificationWasSent(recent) && Date.now() - sentAt < RESEND_COOLDOWN_MS) {
    const waitSec = Math.max(1, Math.ceil((RESEND_COOLDOWN_MS - (Date.now() - sentAt)) / 1000));
    sendJson(res, 429, {
      error: `A code was already sent to WhatsApp. Enter it below, or wait ${waitSec} seconds to resend.`,
      retry_after_seconds: waitSec,
      code_pending: !recent.verified_at && new Date(recent.expires_at).getTime() > Date.now(),
      phone_number: formatDisplayPhone(phone),
    });
    return;
  }

  otpInFlight.set(lockKey, Date.now());
  const code = generateCode();
  const now = new Date();
  let verification: any;
  try {
    verification = await insertRow("whatsapp_verifications", {
      phone_number: phone,
      user_id: user.id,
      code_hash: hashCode(phone, code),
      attempts: 0,
      status: "pending",
      expires_at: new Date(now.getTime() + CODE_TTL_MS).toISOString(),
      verified_at: null,
      sent_at: null,
    });
    await sendWhatsAppOtpTemplate(phone, code);
    await updateRow("whatsapp_verifications", verification.id, {
      status: "sent",
      sent_at: new Date().toISOString(),
    });
  } catch (error: any) {
    if (verification?.id) {
      await updateRow("whatsapp_verifications", verification.id, { status: "failed" }).catch(() => null);
    }
    sendJson(res, error.status && error.status < 500 ? 400 : 502, {
      error: error.message || "Could not send the WhatsApp OTP template.",
    });
    return;
  } finally {
    otpInFlight.delete(lockKey);
  }

  sendJson(res, 200, {
    ok: true,
    phone_number: formatDisplayPhone(phone),
    expires_in_seconds: CODE_TTL_MS / 1000,
  });
}

async function handleVerifyOtp(req: IncomingMessage, res: ServerResponse) {
  const { user } = await requireSession(req);
  const body = JSON.parse((await readBody(req)) || "{}");
  const phone = normalizeWhatsAppPhone(body.phone_number || body.phone || "");
  const code = String(body.code || "").trim();
  if (!phone || !/^\d{6}$/.test(code)) {
    sendJson(res, 400, { error: "Enter the 6-digit code sent to WhatsApp." });
    return;
  }

  const verifications = await loadTable("whatsapp_verifications");
  const latest = verifications
    .filter(
      (row) =>
        phonesMatch(row.phone_number, phone) &&
        String(row.user_id || "") === String(user.id) &&
        !row.verified_at &&
        row.status !== "failed" &&
        row.status !== "pending"
    )
    .sort((a, b) => String(b.created_at || "").localeCompare(String(a.created_at || "")))[0];

  if (!latest) {
    sendJson(res, 400, { error: "No verification code found. Request a new code." });
    return;
  }
  if (new Date(latest.expires_at).getTime() <= Date.now()) {
    sendJson(res, 400, { error: "That code has expired. Request a new one." });
    return;
  }

  const attempts = Number(latest.attempts || 0) + 1;
  await updateRow("whatsapp_verifications", latest.id, { attempts });
  if (attempts > MAX_VERIFY_ATTEMPTS) {
    sendJson(res, 429, { error: "Too many attempts. Request a new code." });
    return;
  }
  if (!safeEqual(String(latest.code_hash || ""), hashCode(phone, code))) {
    sendJson(res, 400, { error: "Incorrect code. Try again." });
    return;
  }

  await updateRow("whatsapp_verifications", latest.id, {
    attempts,
    verified_at: new Date().toISOString(),
  });
  await markVerified(user, phone);
  sendJson(res, 200, { ok: true, verified: true, phone_number: formatDisplayPhone(phone) });
}

async function handleVerificationStatus(req: IncomingMessage, res: ServerResponse) {
  const { user } = await requireSession(req);
  const profile = await findProfileForUserOrPhone(user.id);
  const lead = await findLeadForUserOrPhone(user.id);
  sendJson(res, 200, publicVerification(user.id, profile, lead));
}

function displayNameForConversation(conversation: any, lead: any, profile: any) {
  return (
    personName(profile) ||
    personName(lead) ||
    conversation.contact_name ||
    formatDisplayPhone(conversation.phone_number)
  );
}

async function enrichConversations(role: string, userId: string) {
  const [conversations, messages, leads, profiles] = await Promise.all([
    loadTable("whatsapp_conversations"),
    loadTable("whatsapp_messages"),
    loadTable("student_leads"),
    loadTable("profiles"),
  ]);

  return conversations
    .map((conversation) => {
      const lead =
        leads.find((row) => String(row.id) === String(conversation.lead_id)) ||
        leads.find((row) => String(row.user_id) === String(conversation.user_id)) ||
        leads.find((row) => phonesMatch(row.whatsapp_number || row.phone, conversation.phone_number));
      const profile =
        profiles.find((row) => String(row.user_id) === String(conversation.user_id || lead?.user_id || "")) ||
        profiles.find((row) => phonesMatch(row.whatsapp_number || row.phone, conversation.phone_number));
      if (!canAccessConversation(role, userId, conversation, lead)) return null;

      const thread = messages
        .filter((row) => String(row.conversation_id) === String(conversation.id))
        .sort((a, b) => String(a.created_at || "").localeCompare(String(b.created_at || "")));
      const last = thread[thread.length - 1];
      const unread = thread.filter((row) => row.direction === "inbound" && row.is_read !== true).length;

      return {
        id: conversation.id,
        lead_id: conversation.lead_id || lead?.id || null,
        user_id: conversation.user_id || profile?.user_id || lead?.user_id || null,
        phone_number: formatDisplayPhone(conversation.phone_number),
        assigned_staff_id: conversation.assigned_staff_id || lead?.assigned_counselor_id || lead?.assigned_telecaller_id || null,
        staff_role: conversation.staff_role || null,
        student_name: displayNameForConversation(conversation, lead, profile),
        last_message: last?.body || "",
        last_message_at: conversation.last_message_at || last?.created_at || conversation.created_at,
        unread_count: unread,
        whatsapp_verified: Boolean(profile?.whatsapp_verified || lead?.whatsapp_verified),
        created_at: conversation.created_at,
      };
    })
    .filter(Boolean)
    .sort((a: any, b: any) => String(b.last_message_at || "").localeCompare(String(a.last_message_at || "")));
}

async function handleListConversations(req: IncomingMessage, res: ServerResponse) {
  const { user, role } = await requireStaff(req);
  sendJson(res, 200, { conversations: await enrichConversations(role, user.id) });
}

async function loadAccessibleConversation(role: string, userId: string, conversationId: string) {
  const conversations = await loadTable("whatsapp_conversations");
  const conversation = conversations.find((row) => String(row.id) === String(conversationId));
  if (!conversation) return null;
  const lead = await findLeadForUserOrPhone(conversation.user_id, conversation.phone_number);
  if (!canAccessConversation(role, userId, conversation, lead)) return null;
  return { conversation, lead };
}

async function handleGetMessages(req: IncomingMessage, res: ServerResponse, conversationId: string) {
  const { user, role } = await requireStaff(req);
  const access = await loadAccessibleConversation(role, user.id, conversationId);
  if (!access) {
    sendJson(res, 404, { error: "Conversation not found." });
    return;
  }
  const messages = (await loadTable("whatsapp_messages"))
    .filter((row) => String(row.conversation_id) === String(conversationId))
    .sort((a, b) => String(a.created_at || "").localeCompare(String(b.created_at || "")));
  sendJson(res, 200, { messages });
}

async function handleSendReply(req: IncomingMessage, res: ServerResponse) {
  const { user, role } = await requireStaff(req);
  if (!isWhatsAppConfigured()) {
    sendJson(res, 503, { error: "WhatsApp is not configured on the server." });
    return;
  }
  const body = JSON.parse((await readBody(req)) || "{}");
  const conversationId = String(body.conversation_id || "");
  const text = String(body.body || body.message || "").trim();
  if (!conversationId || !text) {
    sendJson(res, 400, { error: "Message text is required." });
    return;
  }
  const access = await loadAccessibleConversation(role, user.id, conversationId);
  if (!access) {
    sendJson(res, 404, { error: "Conversation not found." });
    return;
  }

  const sent = await sendWhatsAppText(access.conversation.phone_number, text);
  const now = new Date().toISOString();
  const message = await insertRow("whatsapp_messages", {
    conversation_id: conversationId,
    direction: "outbound",
    body: text,
    wa_message_id: sent?.messages?.[0]?.id || null,
    staff_id: user.id,
    is_read: true,
    created_at: now,
  });
  await updateRow("whatsapp_conversations", conversationId, {
    last_message_at: now,
    assigned_staff_id: user.id,
    staff_role: role === "super_admin" ? "admin" : role,
  });
  sendJson(res, 200, { ok: true, message });
}

async function handleMarkRead(req: IncomingMessage, res: ServerResponse, conversationId: string) {
  const { user, role } = await requireStaff(req);
  const access = await loadAccessibleConversation(role, user.id, conversationId);
  if (!access) {
    sendJson(res, 404, { error: "Conversation not found." });
    return;
  }
  const messages = (await loadTable("whatsapp_messages")).filter(
    (row) => String(row.conversation_id) === String(conversationId) && row.direction === "inbound" && row.is_read !== true
  );
  for (const message of messages) {
    await updateRow("whatsapp_messages", message.id, { is_read: true });
  }
  sendJson(res, 200, { ok: true, count: messages.length });
}

function extractInboundBody(message: any) {
  if (!message) return "";
  if (message.type === "text") return String(message.text?.body || "");
  if (message.type === "button") return String(message.button?.text || message.button?.payload || "");
  if (message.type === "interactive") {
    return String(
      message.interactive?.button_reply?.title ||
        message.interactive?.list_reply?.title ||
        message.interactive?.nfm_reply?.response_json ||
        ""
    );
  }
  if (message.image) return message.image.caption || "[Image]";
  if (message.video) return message.video.caption || "[Video]";
  if (message.document) return message.document.caption || message.document.filename || "[Document]";
  if (message.audio) return "[Audio]";
  if (message.sticker) return "[Sticker]";
  if (message.location) return "[Location]";
  return `[${message.type || "message"}]`;
}

function verifyWebhookSignature(rawBody: Buffer, headerValue: string | string[] | undefined) {
  const secret = getAppSecret();
  const provided = Array.isArray(headerValue) ? headerValue[0] : headerValue || "";
  if (!secret) {
    if (process.env.NODE_ENV === "production") return false;
    return true;
  }
  const expected = `sha256=${createHmac("sha256", secret).update(rawBody).digest("hex")}`;
  try {
    return safeEqual(expected, provided);
  } catch {
    return false;
  }
}

async function handleWebhookVerify(parsed: URL, res: ServerResponse) {
  const mode = parsed.searchParams.get("hub.mode");
  const token = parsed.searchParams.get("hub.verify_token");
  const challenge = parsed.searchParams.get("hub.challenge");
  if (mode === "subscribe" && token && getVerifyToken() && safeEqual(token, getVerifyToken())) {
    res.statusCode = 200;
    res.setHeader("Content-Type", "text/plain");
    res.end(challenge || "");
    return;
  }
  res.statusCode = 403;
  res.end("Forbidden");
}

async function storeInboundMessage(value: any) {
  const messages = Array.isArray(value?.messages) ? value.messages : [];
  if (!messages.length) return;
  const contacts = Array.isArray(value?.contacts) ? value.contacts : [];
  const existingMessages = await loadTable("whatsapp_messages");

  for (const message of messages) {
    const waId = String(message.id || "");
    if (waId && existingMessages.some((row) => row.wa_message_id === waId)) continue;
    const phone = normalizeWhatsAppPhone(message.from || contacts[0]?.wa_id || "");
    if (!phone) continue;
    const contactName = contacts[0]?.profile?.name || null;
    const conversation = await ensureConversation({ phone, contactName });
    const now = message.timestamp
      ? new Date(Number(message.timestamp) * 1000).toISOString()
      : new Date().toISOString();
    await insertRow("whatsapp_messages", {
      conversation_id: conversation.id,
      direction: "inbound",
      body: extractInboundBody(message) || "",
      wa_message_id: waId || null,
      staff_id: null,
      is_read: false,
      created_at: now,
    });
    await updateRow("whatsapp_conversations", conversation.id, {
      last_message_at: now,
      contact_name: contactName || conversation.contact_name,
    });
  }
}

async function handleWebhookIncoming(req: IncomingMessage, res: ServerResponse) {
  const raw = await readRawBody(req);
  if (!verifyWebhookSignature(raw, req.headers["x-hub-signature-256"])) {
    sendJson(res, 403, { error: "Invalid webhook signature." });
    return;
  }
  const payload = JSON.parse(raw.toString("utf8") || "{}");
  const entries = Array.isArray(payload.entry) ? payload.entry : [];
  for (const entry of entries) {
    const changes = Array.isArray(entry.changes) ? entry.changes : [];
    for (const change of changes) {
      if (change?.field && change.field !== "messages") continue;
      await storeInboundMessage(change?.value || {});
    }
  }
  sendJson(res, 200, { ok: true });
}

export async function handleWhatsAppRequest(req: IncomingMessage, res: ServerResponse) {
  const parsed = new URL(req.url || "/", "http://localhost");
  const url = parsed.pathname.replace(/\/$/, "") || "/";
  const method = String(req.method || "GET").toUpperCase();

  try {
    if (url === "/api/whatsapp/webhook" && method === "GET") {
      await handleWebhookVerify(parsed, res);
      return;
    }
    if (url === "/api/whatsapp/webhook" && method === "POST") {
      await handleWebhookIncoming(req, res);
      return;
    }
    if (url === "/api/whatsapp/send-otp" && method === "POST") {
      await handleSendOtp(req, res);
      return;
    }
    if (url === "/api/whatsapp/verify-otp" && method === "POST") {
      await handleVerifyOtp(req, res);
      return;
    }
    if (url === "/api/whatsapp/verification-status" && method === "GET") {
      await handleVerificationStatus(req, res);
      return;
    }
    if (url === "/api/whatsapp/conversations" && method === "GET") {
      await handleListConversations(req, res);
      return;
    }
    if (url === "/api/whatsapp/messages" && method === "POST") {
      await handleSendReply(req, res);
      return;
    }

    const messageMatch = url.match(/^\/api\/whatsapp\/conversations\/([^/]+)\/messages$/);
    if (messageMatch && method === "GET") {
      await handleGetMessages(req, res, decodeURIComponent(messageMatch[1]));
      return;
    }
    const readMatch = url.match(/^\/api\/whatsapp\/conversations\/([^/]+)\/read$/);
    if (readMatch && method === "POST") {
      await handleMarkRead(req, res, decodeURIComponent(readMatch[1]));
      return;
    }

    sendJson(res, 404, { error: "Unknown WhatsApp route." });
  } catch (error: any) {
    sendJson(res, error.status || 500, { error: error.message || "WhatsApp request failed." });
  }
}
