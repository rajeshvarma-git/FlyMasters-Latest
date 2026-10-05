import { createHash, createHmac, randomInt, timingSafeEqual } from "crypto";
import type { IncomingMessage, ServerResponse } from "http";
import jwt from "jsonwebtoken";
import { getPool, mutateAppState, readAppState } from "./postgres";
import { getSessionByToken, readBearerToken, type PublicUser } from "./studentAuth";
import { deliveryStatusPatch, whatsappWindowOpen, latestWhatsAppInbound } from "../lib/waDelivery.mjs";
import { sendWhatsAppOutreach, outreachTemplateName } from "../lib/waSend.mjs";
import { JWT_SECRET, IS_PRODUCTION } from "../lib/env.mjs";

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

/**
 * Same fix as server/student/httpApi.ts's readBody (see its comment): this
 * handler runs inside Express, and express.json() drains the request stream
 * before it ever gets here, so every POST (verify-otp, send reply,
 * app-message, send document, ...) sat here waiting for a "data" event that
 * would never arrive — a silent hang, not an error. When Express already
 * parsed the body, use it; only fall through to reading the raw stream for
 * requests it left untouched.
 */
function readBody(req: IncomingMessage): Promise<string> {
  const parsed = (req as IncomingMessage & { body?: unknown }).body;
  if (parsed !== undefined && parsed !== null) {
    if (typeof parsed === "string") return Promise.resolve(parsed);
    if (Buffer.isBuffer(parsed)) return Promise.resolve(parsed.toString("utf8"));
    if (typeof parsed === "object") {
      const keys = Object.keys(parsed as Record<string, unknown>);
      if (keys.length > 0) return Promise.resolve(JSON.stringify(parsed));
      if (!req.readable) return Promise.resolve("");
    }
  }
  if (!req.readable) return Promise.resolve("");

  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on("data", (chunk: Buffer) => chunks.push(chunk));
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

function readRawBody(req: IncomingMessage): Promise<Buffer> {
  // Inside Express, express.json() has already consumed the stream (waiting
  // for it here hung every webhook call forever); it keeps the bytes as
  // req.rawBody for exactly this.
  const kept = (req as IncomingMessage & { rawBody?: Buffer }).rawBody;
  if (Buffer.isBuffer(kept)) return Promise.resolve(kept);
  if (!req.readable) {
    const parsed = (req as IncomingMessage & { body?: unknown }).body;
    return Promise.resolve(Buffer.from(parsed ? JSON.stringify(parsed) : "", "utf8"));
  }
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
      (lead) => (!lead.user_id || lead.whatsapp_verified === true) &&
        (phonesMatch(lead.whatsapp_number, phone) || phonesMatch(lead.phone, phone))
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
      (profile) => profile.whatsapp_verified === true && phonesMatch(profile.whatsapp_number, phone)
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
    signal: AbortSignal.timeout(10000),
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
    // Retry without the button ONLY when Meta says the components don't match the template
    // (param count / format). Never retry on timeouts, auth, or recipient errors — that can
    // double-send, and it hides the real first error. If the retry also fails, report the first.
    const metaCode = Number(error?.details?.error?.code);
    const componentMismatch = [132000, 132001, 132012, 132015, 132016, 100].includes(metaCode) && Number(error?.status) >= 400 && Number(error?.status) < 500;
    if (!includeButton || !componentMismatch) throw error;
    const fallbackTemplate = {
      ...template,
      components: template.components.filter((component: any) => component.type !== "button"),
    };
    try {
      return await graphPost(`${phoneNumberId}/messages`, {
        messaging_product: "whatsapp",
        to,
        type: "template",
        template: fallbackTemplate,
      });
    } catch {
      throw error;
    }
  }
}

/**
 * Staff (counselor/telecaller/admin/super_admin) carry a signed JWT from
 * server/lib/auth.mjs's signUser(); the student portal still carries an
 * opaque token in auth_sessions (see server/routes/student.mjs's comment —
 * unifying the two realms is tracked, not done). This whole file is mounted
 * ahead of core.mjs and claims every /api/whatsapp/* path unconditionally
 * (see isWhatsAppPath below), so it's the ONLY place either realm's request
 * for a WhatsApp route actually lands — it has to accept both token kinds
 * itself rather than delegate to one realm's session lookup. Mirrors
 * server/lib/auth.mjs's anySession(): try the JWT first, fall back to the
 * opaque session lookup.
 */
async function staffFromJwt(token: string): Promise<{ user: PublicUser; role: string } | null> {
  let claims: any;
  try {
    claims = jwt.verify(token, JWT_SECRET);
  } catch {
    return null;
  }
  if (!claims?.id) return null;
  const result = await getPool().query(
    `SELECT u.id, u.email, u.user_metadata, COALESCE(r.role, 'student') AS role, r.is_active
       FROM auth_users u
       LEFT JOIN user_roles r ON r.user_id = u.id
      WHERE u.id = $1`,
    [String(claims.id)]
  );
  const row = result.rows[0];
  if (!row || row.is_active === false) return null;
  return {
    user: { id: String(row.id), email: String(row.email || ""), user_metadata: row.user_metadata || {} },
    role: String(row.role || "student"),
  };
}

async function requireSession(req: IncomingMessage) {
  const token = readBearerToken(req);
  const staffAuth = token ? await staffFromJwt(token).catch(() => null) : null;
  if (staffAuth) {
    return { session: null as any, role: staffAuth.role, user: staffAuth.user };
  }

  const session = await getSessionByToken(token);
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
    const metaCode = error?.details?.error?.code;
    const metaDetail = error?.details?.error?.error_data?.details;
    console.error("[whatsapp] OTP send failed:", error?.message, metaCode ? `(Meta code ${metaCode})` : "", metaDetail || "");
    if (verification?.id) {
      await updateRow("whatsapp_verifications", verification.id, {
        status: "failed",
        error: String(error?.message || "").slice(0, 300),
      }).catch(() => null);
    }
    sendJson(res, error.status && error.status < 500 ? 400 : 502, {
      error: `${error.message || "Could not send the WhatsApp OTP template."}${metaCode ? ` (Meta code ${metaCode})` : ""}`,
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
  // Same person on the web app and WhatsApp: fold the WhatsApp-only lead into this account.
  await import("../routes/cases.mjs")
    .then(({ linkWhatsAppLeads }) => linkWhatsAppLeads(user.id, phone))
    .catch((error: any) => console.error("[whatsapp] linking WhatsApp lead failed:", error?.message || error));
  sendJson(res, 200, { ok: true, verified: true, phone_number: formatDisplayPhone(phone) });
}

/**
 * Unauthenticated status check the counselor WhatsApp screen polls to show
 * a "sending is not working" banner. (It's the same shape that check
 * expects — see src/portals/counselor/counselor/WhatsAppChat.tsx's
 * WhatsAppStatus interface — this route just never existed here before.)
 */
async function handleStatus(_req: IncomingMessage, res: ServerResponse) {
  const configured = isWhatsAppConfigured();
  sendJson(res, 200, {
    ok: true,
    whatsappApiConfigured: configured,
    credentialsValid: configured,
    // Verifying the URL needs the verify token; accepting messages in
    // production also needs the app secret (signature check).
    webhookReady: Boolean(getVerifyToken()) && (Boolean(getAppSecret()) || !IS_PRODUCTION),
    appSecretSet: Boolean(getAppSecret()),
    credentialError: configured ? null : "WHATSAPP_API_KEY/WHATSAPP_ACCESS_TOKEN and WHATSAPP_PHONE_NUMBER_ID are not set.",
    displayPhone: null,
  });
}

async function handleVerificationStatus(req: IncomingMessage, res: ServerResponse) {
  const { user } = await requireSession(req);
  const profile = await findProfileForUserOrPhone(user.id);
  const lead = await findLeadForUserOrPhone(user.id);
  sendJson(res, 200, publicVerification(user.id, profile, lead));
}

/**
 * The student's own read of their WhatsApp thread, for
 * src/portals/student/components/dashboard/student/StudentUnifiedChat.tsx —
 * folding WhatsApp into the same merged conversation as the counselor/
 * telecaller/AI channels there.
 */
async function handleMyThread(req: IncomingMessage, res: ServerResponse) {
  const { user } = await requireSession(req);
  const profile = await findProfileForUserOrPhone(user.id);
  const lead = await findLeadForUserOrPhone(user.id);
  const verified = Boolean(profile?.whatsapp_verified || lead?.whatsapp_verified);
  if (!verified) {
    sendJson(res, 200, { verified: false, conversation: null, messages: [] });
    return;
  }
  const phoneRaw = profile?.whatsapp_number || lead?.whatsapp_number || profile?.phone || lead?.phone || "";
  const phone = normalizeWhatsAppPhone(String(phoneRaw)) || String(phoneRaw);
  const conversation = await ensureConversation({
    phone,
    userId: user.id,
    leadId: lead?.id,
    contactName: personName(profile) || personName(lead) || user.email,
  });
  const messages = (await loadTable("whatsapp_messages"))
    .filter((row) => String(row.conversation_id) === String(conversation.id))
    .sort((a, b) => String(a.created_at || "").localeCompare(String(b.created_at || "")));
  sendJson(res, 200, { verified: true, conversation, messages });
}

/**
 * A message the student types inside the unified chat's WhatsApp tab. It
 * can't actually be dispatched as a WhatsApp send — the Cloud API only lets
 * the business number message the customer, never the reverse — so it's
 * stored the same way an inbound webhook message would be (direction:
 * "inbound", tagged channel: "app" so it can be told apart from a real
 * WhatsApp bubble), landing in the same conversation staff already watch.
 */
async function handleAppMessage(req: IncomingMessage, res: ServerResponse) {
  const { user } = await requireSession(req);
  const body = JSON.parse((await readBody(req)) || "{}");
  const text = String(body.message || body.text || "").trim();
  if (!text) {
    sendJson(res, 400, { error: "Message cannot be empty." });
    return;
  }
  const profile = await findProfileForUserOrPhone(user.id);
  const lead = await findLeadForUserOrPhone(user.id);
  const verified = Boolean(profile?.whatsapp_verified || lead?.whatsapp_verified);
  if (!verified) {
    sendJson(res, 400, { error: "Verify your WhatsApp number first." });
    return;
  }
  const phoneRaw = profile?.whatsapp_number || lead?.whatsapp_number || profile?.phone || lead?.phone || "";
  const phone = normalizeWhatsAppPhone(String(phoneRaw)) || String(phoneRaw);
  const conversation = await ensureConversation({
    phone,
    userId: user.id,
    leadId: lead?.id,
    contactName: personName(profile) || personName(lead) || user.email,
  });
  const now = new Date().toISOString();
  const message = await insertRow("whatsapp_messages", {
    conversation_id: conversation.id,
    direction: "inbound",
    body: text,
    wa_message_id: null,
    staff_id: null,
    channel: "app",
    is_read: false,
    created_at: now,
  });
  await updateRow("whatsapp_conversations", conversation.id, { last_message_at: now });
  sendJson(res, 200, { message, conversation });
}

function isConvertedLead(lead: any) {
  return Boolean(lead) && (lead.entity_type === "student" || lead.lead_status === "converted");
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
      const converted = isConvertedLead(lead);

      return {
        id: conversation.id,
        lead_id: conversation.lead_id || lead?.id || null,
        user_id: conversation.user_id || profile?.user_id || lead?.user_id || null,
        phone_number: formatDisplayPhone(conversation.phone_number),
        assigned_staff_id: conversation.assigned_staff_id || lead?.assigned_counselor_id || lead?.assigned_telecaller_id || null,
        staff_role: conversation.staff_role || null,
        student_name: displayNameForConversation(conversation, lead, profile),
        is_unknown: !lead,
        last_message: last?.body || "",
        last_message_at: conversation.last_message_at || last?.created_at || conversation.created_at,
        unread_count: unread,
        whatsapp_verified: Boolean(profile?.whatsapp_verified || lead?.whatsapp_verified),
        stage: lead ? (converted ? "student" : "lead") : (conversation.staff_role === "counselor" ? "student" : "lead"),
        canReply: canAccessConversation(role, userId, conversation, lead) && (role === "counselor" || role === "telecaller"),
        created_at: conversation.created_at,
      };
    })
    .filter(Boolean)
    .sort((a: any, b: any) => String(b.last_message_at || "").localeCompare(String(a.last_message_at || "")));
}

async function handleListConversations(req: IncomingMessage, res: ServerResponse, stageFilter: string) {
  const { user, role } = await requireStaff(req);
  const all = await enrichConversations(role, user.id);
  const conversations = stageFilter ? all.filter((row: any) => row.stage === stageFilter) : all;
  sendJson(res, 200, { conversations });
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
  const windowOpen = whatsappWindowOpen(latestWhatsAppInbound(messages, conversationId));
  sendJson(res, 200, {
    messages,
    windowStatus: {
      open: windowOpen,
      reason: windowOpen ? undefined : "WhatsApp only allows a free reply within 24 hours of the student's last message. Your message will go out as an approved template; once the student taps Continue chat or replies, normal chat is open again.",
    },
  });
}

async function handleSendReply(req: IncomingMessage, res: ServerResponse) {
  const { user, role } = await requireStaff(req);
  const body = JSON.parse((await readBody(req)) || "{}");
  // Every portal client (admin/counselor/telecaller WhatsAppChat screens)
  // posts camelCase conversationId; only snake_case was read here, so the
  // send button silently 400'd ("Message text is required") on every portal.
  const conversationId = String(body.conversationId || body.conversation_id || "");
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

  const lastInbound = latestWhatsAppInbound(await loadTable("whatsapp_messages"), conversationId);
  // Window closed (24 hours since the student's last message): WhatsApp only lets us send an
  // approved template. Send the follow-up template carrying this message; once the student
  // taps "Continue chat" or replies, free chat is open again.
  const viaTemplate = !whatsappWindowOpen(lastInbound);
  if (viaTemplate && !outreachTemplateName()) {
    sendJson(res, 409, { error: "WhatsApp reply window closed, and no follow-up template is set up on the server yet. Ask an admin to set WHATSAPP_OUTREACH_TEMPLATE_NAME." });
    return;
  }
  // Checked after validating the request/access, not before (like
  // handleSendDocument below), so a bad id or a staff member without access
  // gets the real 404/403 instead of a generic "not configured" — and so
  // this stays testable without real WhatsApp credentials in every
  // environment.
  if (!isWhatsAppConfigured()) {
    sendJson(res, 503, { error: "WhatsApp is not configured on the server." });
    return;
  }

  let waMessageId: string | null;
  if (viaTemplate) {
    try {
      waMessageId = await sendWhatsAppOutreach(access.conversation.phone_number, access.lead?.first_name || "", text);
    } catch (error: any) {
      sendJson(res, 502, { error: `Could not send the follow-up template: ${String(error?.message || error).slice(0, 160)}` });
      return;
    }
  } else {
    const sent = await sendWhatsAppText(access.conversation.phone_number, text);
    waMessageId = sent?.messages?.[0]?.id || null;
  }
  const now = new Date().toISOString();
  const message = await insertRow("whatsapp_messages", {
    conversation_id: conversationId,
    direction: "outbound",
    body: text,
    wa_message_id: waMessageId,
    wa_status: "accepted",
    ...(viaTemplate ? { wa_via: "template" } : {}),
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

function decodeDataUrl(dataUrl: string) {
  const match = /^data:([^;]+);base64,(.+)$/s.exec(String(dataUrl || ""));
  if (!match) return null;
  return { mimeType: match[1], buffer: Buffer.from(match[2], "base64") };
}

/**
 * Lists the student's on-file documents (offer letters, checklist uploads —
 * see asDocument() in server/routes/counselor.mjs) behind a WhatsApp
 * conversation, so staff can pick one to send without leaving the chat
 * screen. `documents` and `app_storage` are shared with every other portal —
 * documents lives in the same JSONB app_records store as whatsapp_messages
 * etc. (loadTable works on it unchanged); app_storage is a real Postgres
 * table (path -> base64 data URL), read the same way
 * routes/counselor.mjs's GET /api/counselor/documents/:id/file does.
 */
async function handleListDocuments(req: IncomingMessage, res: ServerResponse, conversationId: string) {
  const { user, role } = await requireStaff(req);
  const access = await loadAccessibleConversation(role, user.id, conversationId);
  if (!access) {
    sendJson(res, 404, { error: "Conversation not found." });
    return;
  }
  const studentId = access.conversation.user_id || access.lead?.user_id;
  if (!studentId) {
    sendJson(res, 200, { documents: [] });
    return;
  }
  const docs = (await loadTable("documents"))
    .filter((row: any) => String(row.user_id || "") === String(studentId) && !row.archived && row.file_path)
    .map((row: any) => ({
      id: String(row.id),
      document_type: row.document_type || "",
      file_name: row.file_name || "document",
      status: row.status === "pending" ? "uploaded" : row.status || "uploaded",
      created_at: row.created_at || null,
    }))
    .sort((a: any, b: any) => String(b.created_at || "").localeCompare(String(a.created_at || "")));
  sendJson(res, 200, { documents: docs });
}

async function sendWhatsAppDocumentMessage(
  to: string,
  doc: { buffer: Buffer; mimeType: string; filename: string; caption?: string }
) {
  const phoneNumberId = getPhoneNumberId();
  const token = getAccessToken();
  const form = new FormData();
  form.append("messaging_product", "whatsapp");
  form.append("file", new Blob([doc.buffer], { type: doc.mimeType || "application/octet-stream" }), doc.filename || "document");

  const uploadRes = await fetch(graphUrl(`${phoneNumberId}/media`), {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: form as any,
  });
  const uploadBody = await uploadRes.json().catch(() => ({}));
  if (!uploadRes.ok || !uploadBody?.id) {
    const message = uploadBody?.error?.message || `WhatsApp media upload failed (${uploadRes.status})`;
    const error = new Error(message) as Error & { status?: number };
    error.status = uploadRes.status;
    throw error;
  }

  return graphPost(`${phoneNumberId}/messages`, {
    messaging_product: "whatsapp",
    to,
    type: "document",
    document: {
      id: uploadBody.id,
      filename: doc.filename || "document",
      ...(doc.caption ? { caption: String(doc.caption).slice(0, 1024) } : {}),
    },
  });
}

/**
 * Sends one of those on-file documents over WhatsApp — the feature this
 * whole unified-chat round exists for. Ownership/lookup validation runs
 * BEFORE the isWhatsAppConfigured() gate (unlike handleSendReply, which
 * checks configuration first) so a bad documentId or a staff member without
 * access to this thread gets the real 404/403, not a generic "not
 * configured" — and so this logic stays testable without real WhatsApp
 * credentials in every environment.
 */
async function handleSendDocument(req: IncomingMessage, res: ServerResponse, conversationId: string) {
  const { user, role } = await requireStaff(req);
  const body = JSON.parse((await readBody(req)) || "{}");
  const documentId = String(body.documentId || body.document_id || "");
  const caption = body.caption ? String(body.caption).trim() : "";
  if (!documentId) {
    sendJson(res, 400, { error: "documentId is required." });
    return;
  }

  const access = await loadAccessibleConversation(role, user.id, conversationId);
  if (!access) {
    sendJson(res, 404, { error: "Conversation not found." });
    return;
  }

  const lastInbound = latestWhatsAppInbound(await loadTable("whatsapp_messages"), conversationId);
  if (!whatsappWindowOpen(lastInbound)) {
    sendJson(res, 409, { error: "WhatsApp reply window closed. A student message or an approved template is required." });
    return;
  }
  const studentId = access.conversation.user_id || access.lead?.user_id;
  if (!studentId) {
    sendJson(res, 404, { error: "No student found for this conversation." });
    return;
  }

  const docs = await loadTable("documents");
  const doc = docs.find((row: any) => String(row.id) === documentId);
  if (!doc) {
    sendJson(res, 404, { error: "Document not found." });
    return;
  }
  // A document belongs to a specific student — never let staff on one
  // conversation send a file that was uploaded by a different student.
  if (String(doc.user_id || "") !== String(studentId)) {
    sendJson(res, 403, { error: "That document does not belong to this student." });
    return;
  }
  if (!doc.file_path) {
    sendJson(res, 404, { error: "File not found." });
    return;
  }

  const fileRow = await getPool().query("SELECT data_url FROM app_storage WHERE path = $1", [doc.file_path]);
  const decoded = decodeDataUrl(fileRow.rows[0]?.data_url);
  if (!decoded) {
    sendJson(res, 404, { error: "File not found in storage." });
    return;
  }

  if (!isWhatsAppConfigured()) {
    sendJson(res, 503, { error: "WhatsApp is not configured on the server." });
    return;
  }

  const fileName = doc.file_name || "document";
  let sent: any;
  try {
    sent = await sendWhatsAppDocumentMessage(access.conversation.phone_number, {
      buffer: decoded.buffer,
      mimeType: doc.mime_type || decoded.mimeType,
      filename: fileName,
      caption,
    });
  } catch (error: any) {
    sendJson(res, error.status && error.status < 500 ? 400 : 502, {
      error: error.message || "Could not send document.",
    });
    return;
  }

  const now = new Date().toISOString();
  const label = caption ? `📎 ${fileName} — ${caption}` : `📎 ${fileName}`;
  const message = await insertRow("whatsapp_messages", {
    conversation_id: conversationId,
    direction: "outbound",
    body: label,
    wa_message_id: sent?.messages?.[0]?.id || null,
    wa_status: "accepted",
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
  if (message.document) return message.document.caption || (message.document.filename ? `[Document: ${message.document.filename}]` : "[Document]");
  if (message.audio) return "[Audio]";
  if (message.sticker) return "[Sticker]";
  if (message.location) return "[Location]";
  if (message.type === "unsupported") return "[Unsupported message]";
  return `[${message.type || "message"}]`;
}

function verifyWebhookSignature(rawBody: Buffer, headerValue: string | string[] | undefined) {
  const secret = getAppSecret();
  const provided = Array.isArray(headerValue) ? headerValue[0] : headerValue || "";
  if (!secret) {
    if (IS_PRODUCTION) return false;
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

async function storeInboundMessage(value: any, logEntry?: { result: string; detail?: string }) {
  const messages = Array.isArray(value?.messages) ? value.messages : [];
  if (!messages.length) return;
  const contacts = Array.isArray(value?.contacts) ? value.contacts : [];
  const existingMessages = await loadTable("whatsapp_messages");

  for (const message of messages) {
    // Events, not messages from a student: someone opening the chat, a reaction, a system
    // notice. They must not create a lead or trigger the AI.
    if (["request_welcome", "reaction", "system", "ephemeral"].includes(String(message.type || ""))) continue;
    const waId = String(message.id || "");
    if (waId && existingMessages.some((row) => row.wa_message_id === waId)) {
      if (logEntry) logEntry.result = "duplicate";
      continue;
    }
    const phone = normalizeWhatsAppPhone(message.from || contacts[0]?.wa_id || "");
    if (!phone) continue;
    const contact = contacts.find((c: any) => String(c.wa_id || "") === String(message.from || ""));
    const contactName = contact?.profile?.name || null;
    const conversation = await ensureConversation({ phone, contactName });
    const now = message.timestamp
      ? new Date(Number(message.timestamp) * 1000).toISOString()
      : new Date().toISOString();
    const body = extractInboundBody(message) || "";
    const stored = await insertRow("whatsapp_messages", {
      id: waId ? `wa-in-${createHash("sha256").update(waId).digest("hex")}` : undefined,
      conversation_id: conversation.id,
      direction: "inbound",
      body,
      wa_message_id: waId || null,
      staff_id: null,
      is_read: false,
      created_at: now,
    });
    if (stored) existingMessages.push(stored);
    await updateRow("whatsapp_conversations", conversation.id, {
      last_message_at: now,
      contact_name: contactName || conversation.contact_name,
    });
    // Same conversation as the app: AI intake / FAQ answers / assigned staff,
    // with replies sent back to this WhatsApp number.
    // Not awaited: Meta wants a quick 200, and an AI reply can take seconds.
    // cases.mjs handles one number's messages in order.
    if (stored?.id) {
      void import("../routes/cases.mjs")
        .then(({ handleWhatsAppInbound }) =>
          handleWhatsAppInbound({ phone, contactName, body, sourceId: `whatsapp_messages:${stored.id}`, sentAt: now }),
        )
        .then((outcome: any) => {
          if (logEntry) {
            logEntry.result = outcome?.leadId ? "answered" : "skipped";
            logEntry.detail = outcome?.summary || "";
          }
          return outcome?.leadId && !conversation.lead_id
            ? updateRow("whatsapp_conversations", conversation.id, { lead_id: outcome.leadId })
            : null;
        })
        .catch((error: any) => {
          console.error("[whatsapp] case chat handling failed:", error?.message || error);
          if (logEntry) {
            logEntry.result = "error";
            logEntry.detail = String(error?.message || error).slice(0, 200);
          }
        });
    }
  }
}

// What the last webhook calls did — the admin WhatsApp page shows this so
// "I messaged and got no reply" can be traced without server logs.
type WebhookLogEntry = { at: string; result: string; messages: number; from?: string; detail?: string };
const webhookLog: WebhookLogEntry[] = [];
function logWebhook(entry: Omit<WebhookLogEntry, "at">) {
  const row = { at: new Date().toISOString(), ...entry };
  webhookLog.unshift(row);
  webhookLog.length = Math.min(webhookLog.length, 30);
  return row;
}

async function handleWebhookIncoming(req: IncomingMessage, res: ServerResponse) {
  const raw = await readRawBody(req);
  let payload: any = {};
  try {
    payload = JSON.parse(raw.toString("utf8") || "{}");
  } catch {
    payload = {};
  }
  const values = (Array.isArray(payload.entry) ? payload.entry : [])
    .flatMap((entry: any) => (Array.isArray(entry.changes) ? entry.changes : []))
    .filter((change: any) => !change?.field || change.field === "messages")
    .map((change: any) => change?.value || {});
  const inbound = values.flatMap((v: any) => (Array.isArray(v.messages) ? v.messages : []));
  const from = inbound[0]?.from ? `…${String(inbound[0].from).slice(-4)}` : undefined;
  if (!verifyWebhookSignature(raw, req.headers["x-hub-signature-256"])) {
    logWebhook({
      result: "rejected_signature",
      messages: inbound.length,
      from,
      detail: getAppSecret()
        ? "Signature did not match WHATSAPP_APP_SECRET — check it is the App Secret of the same Meta app."
        : "WHATSAPP_APP_SECRET is not set on the server, so every webhook is rejected in production.",
    });
    sendJson(res, 403, { error: "Invalid webhook signature." });
    return;
  }
  const entry = logWebhook({
    result: inbound.length ? "received" : "status_update",
    messages: inbound.length,
    from,
  });
  try {
    for (const value of values) {
      await storeDeliveryStatuses(value);
      await storeInboundMessage(value, entry);
    }
  } catch (error: any) {
    entry.result = "error";
    entry.detail = String(error?.message || error).slice(0, 200);
    sendJson(res, 503, { error: "Webhook persistence failed. Retry required." });
    return;
  }
  sendJson(res, 200, { ok: true });
}

async function storeDeliveryStatuses(value: any) {
  const statuses = Array.isArray(value?.statuses) ? value.statuses : [];
  for (const event of statuses) {
    if (!event?.id) continue;
    const pool = getPool();
    // Serialise receipts for this message, including out-of-order webhook calls.
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [`wa-status:${event.id}`]);
      const { rows } = await client.query(
        "SELECT id, table_name, data FROM app_records WHERE table_name IN ('case_messages', 'whatsapp_messages') AND data->>'wa_message_id' = $1 FOR UPDATE",
        [String(event.id)],
      );
      for (const row of rows) {
        const patch = deliveryStatusPatch(row.data, event);
        if (patch) await client.query(
          "UPDATE app_records SET data = data || $1::jsonb WHERE table_name = $2 AND id = $3",
          [JSON.stringify(patch), row.table_name, row.id],
        );
      }
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally { client.release(); }
  }
}

async function handleDiagnostics(req: IncomingMessage, res: ServerResponse) {
  const auth = await requireStaff(req);
  if (auth.role !== "admin" && auth.role !== "super_admin") {
    sendJson(res, 403, { error: "Admins only." });
    return;
  }
  const { recentSends, outreachTemplateName } = await import("../lib/waSend.mjs");
  const config = {
    access_token: Boolean(getAccessToken()),
    phone_number_id: Boolean(getPhoneNumberId()),
    verify_token: Boolean(getVerifyToken()),
    app_secret: Boolean(getAppSecret()),
    followup_template: Boolean(outreachTemplateName()),
    production: process.env.NODE_ENV === "production",
    graph_version: getGraphVersion(),
  };
  const problems: string[] = [];
  if (!config.access_token || !config.phone_number_id) problems.push("WHATSAPP_API_KEY (or WHATSAPP_ACCESS_TOKEN) and WHATSAPP_PHONE_NUMBER_ID must both be set, or no reply can be sent.");
  if (!config.verify_token) problems.push("WHATSAPP_WEBHOOK_VERIFY_TOKEN is not set, so Meta cannot verify the webhook URL.");
  if (!config.app_secret && config.production) problems.push("WHATSAPP_APP_SECRET is not set: in production every incoming message is rejected.");
  if (!config.followup_template) problems.push("No follow-up template is set (WHATSAPP_OUTREACH_TEMPLATE_NAME). Staff can only reply to students who messaged in the last 24 hours; after that replies stay in the app.");
  if (!webhookLog.length) problems.push("No webhook call has reached this server since it last started. Check the Callback URL in Meta (WhatsApp → Configuration) points to /api/whatsapp/webhook on this site and that 'messages' is subscribed.");
  sendJson(res, 200, {
    config,
    problems,
    webhook_url: "/api/whatsapp/webhook",
    recent_webhooks: webhookLog,
    recent_sends: recentSends(),
    since: SERVER_STARTED_AT,
  });
}

const SERVER_STARTED_AT = new Date().toISOString();

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
    if (url === "/api/whatsapp/diagnostics" && method === "GET") {
      await handleDiagnostics(req, res);
      return;
    }
    if (url === "/api/whatsapp/status" && method === "GET") {
      await handleStatus(req, res);
      return;
    }
    if (url === "/api/whatsapp/conversations" && method === "GET") {
      await handleListConversations(req, res, String(parsed.searchParams.get("stage") || "").trim());
      return;
    }
    if (url === "/api/whatsapp/messages" && method === "POST") {
      await handleSendReply(req, res);
      return;
    }
    if (url === "/api/whatsapp/my-thread" && method === "GET") {
      await handleMyThread(req, res);
      return;
    }
    if (url === "/api/whatsapp/app-message" && method === "POST") {
      await handleAppMessage(req, res);
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
    const documentsMatch = url.match(/^\/api\/whatsapp\/conversations\/([^/]+)\/documents$/);
    if (documentsMatch && method === "GET") {
      await handleListDocuments(req, res, decodeURIComponent(documentsMatch[1]));
      return;
    }
    const documentMatch = url.match(/^\/api\/whatsapp\/conversations\/([^/]+)\/document$/);
    if (documentMatch && method === "POST") {
      await handleSendDocument(req, res, decodeURIComponent(documentMatch[1]));
      return;
    }

    sendJson(res, 404, { error: "Unknown WhatsApp route." });
  } catch (error: any) {
    sendJson(res, error.status || 500, { error: error.message || "WhatsApp request failed." });
  }
}
