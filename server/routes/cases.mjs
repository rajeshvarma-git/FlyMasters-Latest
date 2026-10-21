/**
 * One conversation per student — the "case chat".
 *
 * Flow the client asked for:
 *   1. AI intake: on first open the AI greets with what the profile already
 *      says ("I've loaded your profile …") and asks only what's missing,
 *      one question at a time — same questions and wording as the old AI
 *      wizard. When everything is known it posts university recommendation
 *      cards and saves the answers to the student's profile and lead.
 *   2. Admin assigns a telecaller → a notice appears in the chat ("X has been
 *      assigned and will assist you further"). The telecaller mostly calls;
 *      they can reply here too.
 *   3. After conversion a counselor is assigned → same notice for them.
 *   4. After intake, when the student asks something, the AI answers ONLY
 *      from the admin-managed FAQ/policy articles (knowledge_articles). Those
 *      answers are marked for the assigned person to approve or correct.
 *      Anything the articles don't cover goes to the assigned person; the AI
 *      just says so.
 *
 * WhatsApp is the same conversation: a message to the Fly Masters number
 * lands here (a new number becomes a new lead), gets the same AI intake and
 * FAQ answers, and replies — AI, staff and assignment notices — go back to
 * the student's WhatsApp while Meta's 24-hour reply window is open. A lead
 * who starts on WhatsApp has a conversation before they have a portal
 * account (id case-lead-<leadId>); it becomes theirs when they sign up.
 *
 * Storage: case_conversations + case_messages, JSONB in app_records, no
 * migration. Older chat stores (private_messages, telecaller_messages,
 * ai_chat_messages, whatsapp_messages) are copied in on open, keyed by
 * source_id, so nothing earlier is lost.
 */
import express from "express";
import { whatsappWindowOpen } from "../lib/waDelivery.mjs";
import { getReminderSettings, reminderHoursOpen, templateAllowance } from "../lib/reminders.mjs";
import crypto from "crypto";
import { pool, jsonTable, jsonFind, jsonUpsert } from "../lib/db.mjs";
import { anySession, branchScope, ROLES } from "../lib/auth.mjs";
import { geminiJson, geminiConfigured } from "../lib/gemini.mjs";
import { sendWhatsAppText, sendWhatsAppOutreach, outreachTemplateName, outreachButtonText, whatsappSendConfigured, normalizeWaPhone } from "../lib/waSend.mjs";
import { applicationNotificationId, buildApplicationEvent, shortlistApplicationPatch, STUDENT_WITHDRAWABLE } from "../lib/applicationWorkflow.mjs";

const router = express.Router();

const SHARED_COUNSELOR_ID = "local-counselor-1";
const STAFF_ROLES = new Set([
  ROLES.SUPER_ADMIN, ROLES.ADMIN, ROLES.BRANCH_HEAD, ROLES.COUNSELOR, ROLES.TELECALLER,
]);
const ADMIN_ROLES = new Set([ROLES.SUPER_ADMIN, ROLES.ADMIN]);
const MAX_MESSAGE = 2000;
const AI_NAME = "AI Advisor";
const CLIENT_MESSAGE_ID = /^[A-Za-z0-9_-]{16,128}$/;

/**
 * A browser-generated id makes a retry safe when the request timed out after
 * the database write. It is namespaced by the authenticated sender, so an id
 * supplied by one account can never refer to another account's message.
 */
export function caseMessageSourceId(senderRole, senderId, clientMessageId) {
  const id = String(clientMessageId || "").trim();
  if (!CLIENT_MESSAGE_ID.test(id)) return null;
  return `portal:${senderRole}:${String(senderId)}:${id}`;
}

// ------------------------------------------------------------ intake steps

// Same questions (and order) as the old AI wizard in chatContext.ts.
const STEPS = [
  { key: "country", ask: "Which country would you love to study in? (For example: USA, UK, Canada, Australia, Germany, or Nepal)" },
  { key: "qualification", ask: "What is your highest qualification? (for example 12th, Bachelor's, or Master's)" },
  { key: "field", ask: "Which field or program are you most interested in? (for example Computer Science, Business, or Nursing)" },
  { key: "score", ask: "What is your academic score — percentage or GPA?" },
  { key: "budget", ask: "What is your estimated study budget? (for example 20 lakhs or $25,000)" },
  // Only asked when we don't already have a number (a chat that started on the web app).
  // Chats that start on WhatsApp already have one, so they never see this question.
  { key: "phone", ask: "Last one: what is your mobile number? Your Fly Masters advisor will call or WhatsApp you on it. (10 digits, or with country code)" },
];

const ACK = {
  country: (v) => `Great choice — ${v}!`,
  qualification: (v) => `Got it, ${v}.`,
  field: (v) => `${v} is a strong path.`,
  score: (v) => `Thanks, ${v} noted.`,
  budget: (v) => `Budget noted: ${v}.`,
  phone: () => "Thanks, I've saved your number.",
};

const SUPPORTED_COUNTRIES = ["USA", "UK", "Canada", "Australia", "Germany", "Ireland", "New Zealand", "India", "Nepal", "France", "Netherlands"];
const COUNTRY_ALIASES = {
  nepal: "Nepal", usa: "USA", us: "USA", america: "USA", "united states": "USA", "united states of america": "USA",
  uk: "UK", britain: "UK", england: "UK", "united kingdom": "UK", canada: "Canada", australia: "Australia",
  germany: "Germany", ireland: "Ireland", "new zealand": "New Zealand", india: "India", france: "France",
  netherlands: "Netherlands", holland: "Netherlands", "the netherlands": "Netherlands",
  "u.s.": "USA", "u.s.a.": "USA", "u.s.a": "USA", "united states (usa)": "USA",
  "great britain": "UK", scotland: "UK", wales: "UK", "northern ireland": "UK", "u.k.": "UK",
  uae: "UAE", "united arab emirates": "UAE", "south korea": "South Korea", korea: "South Korea", "republic of korea": "South Korea",
};

/** Same country however each side spells it ("USA" vs the catalogue's "United States"). */
function sameCountry(a, b) {
  const x = normalizeCountry(a).toLowerCase();
  const y = normalizeCountry(b).toLowerCase();
  if (!x || !y) return false;
  if (x === y) return true;
  const word = (hay, needle) => new RegExp(`\\b${needle.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`).test(hay);
  return word(x, y) || word(y, x);
}
const GIBBERISH = /^[bcdfghjklmnpqrstvwxyz\d]{5,}$/i;

function normalizeCountry(input) {
  const raw = String(input || "").trim();
  if (!raw) return "";
  return COUNTRY_ALIASES[raw.toLowerCase()] || raw.replace(/\b\w/g, (c) => c.toUpperCase());
}

function isValidCountry(input) {
  const trimmed = String(input || "").trim();
  if (!trimmed) return false;
  return SUPPORTED_COUNTRIES.includes(normalizeCountry(trimmed)) || trimmed.toLowerCase() in COUNTRY_ALIASES;
}

/** Same rules as the old wizard's validateChatStep. */
function validateStep(key, value) {
  const t = String(value || "").trim();
  if (!t) return { error: "Please enter an answer before continuing." };
  if (key === "country") {
    return isValidCountry(t)
      ? { value: normalizeCountry(t) }
      : { error: "Please enter a supported study destination such as USA, UK, Canada, Australia, Germany, Ireland, New Zealand, India, or Nepal." };
  }
  if (key === "qualification" && (!/[a-zA-Z]/.test(t) || GIBBERISH.test(t.replace(/\s/g, "")))) {
    return { error: "Please enter your qualification (for example 12th, Bachelor's, or Master's)." };
  }
  if (key === "field" && (t.length < 3 || !/[a-zA-Z]{3,}/.test(t) || GIBBERISH.test(t.replace(/\s/g, "")))) {
    return { error: "Please enter a real field of study (for example Computer Science, Business, or Nursing)." };
  }
  if (key === "score") return validateScore(t);
  if (key === "budget") return validateBudget(t);
  if (key === "phone") return validatePhone(t);
  return { value: t };
}

/**
 * Scores and budgets become lead facts staff act on, so a bare "7" or "32"
 * is not accepted as-is: the AI asks what it means instead of guessing.
 */
function firstNumber(t) {
  const m = String(t).replace(/,/g, "").match(/\d+(\.\d+)?/);
  return m ? Number(m[0]) : NaN;
}

function validateScore(t) {
  const n = firstNumber(t);
  const example = "for example 78%, 8.2 CGPA, or 3.4 GPA";
  if (!Number.isFinite(n) || n <= 0) return { error: `Please enter your score with numbers (${example}).` };
  if (/%|percent/i.test(t)) return n <= 100 ? { value: t } : { error: `A percentage can't be above 100 — please check it (${example}).` };
  if (/cgpa|\/\s*10\b|out of 10/i.test(t)) return n <= 10 ? { value: t } : { error: `A CGPA is out of 10 — please check it (${example}).` };
  if (/gpa|\/\s*4\b|out of 4/i.test(t)) return n <= 5 ? { value: t } : { error: `A GPA is usually out of 4 — please check it (${example}).` };
  if (/^\d+(\.\d+)?$/.test(t.trim())) {
    if (n >= 35 && n <= 100) return { value: `${n}%` };
    if (n <= 10 && /\./.test(t)) return { value: `${n} CGPA` };
    return { error: `Is ${t.trim()} a CGPA (out of 10) or a percentage? Please write it like "${n <= 10 ? `${n} CGPA` : `${n}%`}" (${example}).` };
  }
  return n <= 100 ? { value: t } : { error: `Please check your score (${example}).` };
}

function validatePhone(t) {
  const digits = String(t).replace(/\D/g, "");
  const example = "for example 9876543210 or +91 98765 43210";
  const bad = { error: `Please enter a valid mobile number (${example}).` };
  if (/^(\d)\1+$/.test(digits)) return bad;
  if (digits.length === 10) return /^[6-9]/.test(digits) ? { value: digits } : bad;
  if (digits.length === 12 && digits.startsWith("91")) return /^[6-9]/.test(digits.slice(2)) ? { value: digits } : bad;
  if (digits.length >= 11 && digits.length <= 15) return { value: digits };
  return bad;
}

function validateBudget(t) {
  const n = firstNumber(t);
  const example = "for example 20 lakhs, ₹15,00,000, or $25,000";
  if (!Number.isFinite(n) || n <= 0) return { error: `Please enter your budget with an amount (${example}).` };
  if (/lakh|lac|crore|\bcr\b|\bk\b|thousand|\$|usd|₹|inr|\brs\.?|rupee|€|eur|£|gbp|aud|cad|nzd|\d\s*[lk]\b/i.test(t)) return { value: t };
  if (n >= 10000) return { value: t };
  return { error: `Is that ${n} lakhs? Please add the unit, like "${n} lakhs" or "$${n},000" (${example}).` };
}

const UNI_INTENT = /\b(universit(y|ies)|colleges?|courses?|programs?|programmes?|shortlist|options)\b/i;
const ACK_ONLY = /^(ok+(ay)?|k+|thanks?( you)?|thank u|thx|ty|yes|yeah|yep|no|nope|fine|cool|great|sure|got it|👍|🙏|😊|👌)[\s!.]*$/i;
const GREETING = /^(hi+|hello+|hey+|hii+|good (morning|afternoon|evening)|namaste|hai)\b[\s!.,]*(there|team|sir|madam|mam)?[\s!.,]*$/i;

function looksLikeQuestion(text) {
  const t = String(text || "").trim().toLowerCase();
  return t.endsWith("?") ||
    /^(what|how|which|when|where|why|who|can|could|do|does|did|is|are|will|would|should|shall|may|tell me|explain|please tell)\b/.test(t);
}

// ---------------------------------------------------------------- data access

async function rowsWhere(table, field, values) {
  const list = (Array.isArray(values) ? values : [values]).filter((v) => v != null && v !== "").map(String);
  if (!list.length) return [];
  const { rows } = await pool.query(
    `SELECT id, data, branch_id, created_at FROM app_records
      WHERE table_name = $1 AND data->>$2 = ANY($3::text[])`,
    [table, field, list],
  );
  return rows.map((r) => ({ ...r.data, id: r.id, branch_id: r.branch_id, _created_at: r.created_at }));
}

// Mirrors src/portals/student/lib/studentShortlists.ts's sameMailbox(): two
// addresses are the same person only if they're the same mailbox (Gmail
// ignores dots and "+tags"), not just the same local part across domains.
function sameMailbox(value) {
  const email = String(value || "").trim().toLowerCase();
  const at = email.lastIndexOf("@");
  if (at < 1) return "";
  let local = email.slice(0, at);
  let domain = email.slice(at + 1);
  if (domain === "googlemail.com") domain = "gmail.com";
  if (domain === "gmail.com") local = local.split("+")[0].replace(/\./g, "");
  return `${local}@${domain}`;
}

async function leadForStudent(userId) {
  const leads = await rowsWhere("student_leads", "user_id", userId);
  // A lead a counselor created from the student's email before the
  // student's account existed/was linked won't carry this user_id yet — the
  // student portal's own shortlist matching already falls back to email for
  // exactly this reason (collectStudentShortlistKeys); without the same
  // fallback here, a student in that state hits a 404 on endpoints keyed by
  // leadForStudent (e.g. posting a case notification) even though the
  // portal itself can see their shortlist/lead just fine.
  if (!leads.length) {
    const { rows } = await pool.query("SELECT email FROM auth_users WHERE id::text = $1", [String(userId)]).catch(() => ({ rows: [] }));
    const mailbox = sameMailbox(rows[0]?.email);
    if (mailbox) {
      const { rows: leadRows } = await pool.query(
        `SELECT id, data, branch_id FROM app_records WHERE table_name = 'student_leads' AND data->>'email' IS NOT NULL`,
      );
      for (const row of leadRows) {
        if (sameMailbox(row.data?.email) === mailbox) {
          leads.push({ ...row.data, id: row.id, branch_id: row.branch_id });
        }
      }
    }
  }
  leads.sort((a, b) => String(b.updated_at || "").localeCompare(String(a.updated_at || "")));
  return leads[0] || null;
}

async function leadById(leadId) {
  const { rows } = await pool.query(
    "SELECT id, data, branch_id FROM app_records WHERE table_name = 'student_leads' AND id = $1",
    [String(leadId)],
  );
  return rows[0] ? { ...rows[0].data, id: rows[0].id, branch_id: rows[0].branch_id } : null;
}

async function personName(userId, fallback) {
  if (!userId) return fallback;
  const profile = await jsonFind("profiles", "user_id", userId).catch(() => null);
  const name =
    profile?.full_name?.trim() ||
    [profile?.first_name, profile?.last_name].filter(Boolean).join(" ").trim();
  if (name) return name;
  const counselor = (await rowsWhere("counselors", "auth_user_id", userId).catch(() => []))[0]
    || (await rowsWhere("counselors", "id", userId).catch(() => []))[0];
  const cName = counselor && (counselor.name || [counselor.first_name, counselor.last_name].filter(Boolean).join(" "));
  if (cName) return cName;
  const { rows } = await pool.query("SELECT email FROM auth_users WHERE id::text = $1", [String(userId)]).catch(() => ({ rows: [] }));
  return rows[0]?.email ? String(rows[0].email).split("@")[0] : fallback;
}

function studentNameFromLead(lead, fallback = "Student") {
  const name = [lead?.first_name, lead?.last_name].filter(Boolean).join(" ").trim();
  return name || lead?.email || fallback;
}

async function ownerOf(lead) {
  const counselorId = lead?.assigned_counselor_id ? String(lead.assigned_counselor_id) : "";
  if (counselorId && counselorId !== SHARED_COUNSELOR_ID) {
    const name = await personName(counselorId, "Your counselor");
    return { role: "counselor", id: counselorId, name };
  }
  const telecallerId = lead?.assigned_telecaller_id ? String(lead.assigned_telecaller_id) : "";
  if (telecallerId) {
    return { role: "telecaller", id: telecallerId, name: await personName(telecallerId, "Your advisor") };
  }
  return { role: "ai", id: null, name: AI_NAME };
}

const ownerKey = (owner) => (owner.role === "ai" ? "ai" : `${owner.role}:${owner.id}`);

async function conversationFor(studentUserId, leadId, { phone = null } = {}) {
  if (studentUserId) {
    const existing = (await rowsWhere("case_conversations", "student_user_id", studentUserId))[0];
    if (existing) {
      if (leadId && String(existing.lead_id || "") !== String(leadId)) {
        return jsonUpsert("case_conversations", { id: existing.id, lead_id: String(leadId) });
      }
      return existing;
    }
  }
  // A conversation that started on WhatsApp before the student had an
  // account: it becomes theirs once the lead is linked to their account.
  if (leadId) {
    const forLead = await rowsWhere("case_conversations", "lead_id", leadId);
    const byLead = forLead.find((c) => !c.student_user_id);
    if (byLead) {
      if (studentUserId) return jsonUpsert("case_conversations", { id: byLead.id, student_user_id: String(studentUserId) });
      return byLead;
    }
    // Already joined to the student's account on this same WhatsApp number:
    // the next message lands in that same thread. (This used to re-create the
    // "case-lead-…" row with no student, flipping the thread between the
    // account and the bare number on every message.)
    if (!studentUserId && phone) {
      const same = forLead.find((c) => c.whatsapp_phone && normalizeWaPhone(c.whatsapp_phone) === phone);
      if (same) return same;
    }
    // A different number on the same lead gets its own thread, never the
    // account's (and never an id that would un-join the account's thread).
    if (!studentUserId && forLead.some((c) => c.id === `case-lead-${leadId}`)) {
      return jsonUpsert("case_conversations", {
        id: `case-lead-${leadId}-${phone || "app"}`,
        student_user_id: null,
        lead_id: String(leadId),
        last_message_at: new Date().toISOString(),
      });
    }
  }
  // Deterministic ids: two requests racing to create it land on the same row.
  if (studentUserId) {
    return jsonUpsert("case_conversations", {
      id: `case-${studentUserId}`,
      student_user_id: String(studentUserId),
      lead_id: leadId ? String(leadId) : null,
      last_message_at: new Date().toISOString(),
    });
  }
  return jsonUpsert("case_conversations", {
    id: `case-lead-${leadId}`,
    student_user_id: null,
    lead_id: String(leadId),
    last_message_at: new Date().toISOString(),
  });
}

async function patchConversation(conversation, patch) {
  Object.assign(conversation, patch);
  await jsonUpsert("case_conversations", { id: conversation.id, ...patch });
}

// jsonUpsert keeps created_at in its own column (insert time), so the time a
// message was actually sent — which differs for imported history — is sent_at.
function sentAt(row) {
  return String(row.sent_at || row.created_at || (row._created_at ? new Date(row._created_at).toISOString() : ""));
}

async function rawMessages(conversationId) {
  const rows = await rowsWhere("case_messages", "conversation_id", conversationId);
  rows.sort((a, b) => sentAt(a).localeCompare(sentAt(b)) || String(a.seq || 0).localeCompare(String(b.seq || 0)));
  return rows;
}

function publicMessage(row, { staff = false } = {}) {
  const msg = {
    id: row.id,
    conversation_id: row.conversation_id,
    kind: row.kind || "text",
    sender_role: row.sender_role,
    sender_id: row.sender_id || null,
    sender_name: row.sender_name || null,
    body: row.body,
    data: row.data || null,
    channel: row.channel || "app",
    source: row.source || null,
    sources: row.sources || [],
    review_status: row.review_status || null,
    reviewed_by_name: row.reviewed_by_name || null,
    created_at: sentAt(row),
  };
  if (staff) {
    msg.original_body = row.original_body || null;
    msg.wa_status = row.wa_status || null;
    msg.wa_via = row.wa_via || null;
    msg.wa_error = row.wa_error || null;
  }
  return msg;
}

let seqCounter = 0;

async function addMessage(conversation, fields) {
  const {
    senderRole, senderId = null, senderName = null, body, kind = "text", data = null,
    channel = "app", sourceId = null, createdAt = null, extra = {},
  } = fields;
  const sent_at = createdAt || new Date().toISOString();
  // Imported rows get an id derived from their source so a repeat or racing
  // import overwrites instead of duplicating.
  const id = sourceId
    ? `cm-${crypto.createHash("sha1").update(sourceId).digest("hex")}`
    : crypto.randomUUID();
  const row = await jsonUpsert("case_messages", {
    id,
    conversation_id: String(conversation.id),
    kind,
    sender_role: senderRole,
    sender_id: senderId ? String(senderId) : null,
    sender_name: senderName,
    body: String(body || "").slice(0, MAX_MESSAGE * 4),
    data,
    channel,
    source_id: sourceId,
    sent_at,
    // Several messages written in the same millisecond keep their order.
    seq: String(Date.now()).padStart(15, "0") + String(++seqCounter % 1000).padStart(3, "0"),
    ...extra,
  });
  if (!conversation.last_message_at || sent_at > String(conversation.last_message_at)) {
    await patchConversation(conversation, { last_message_at: sent_at });
  }
  return row;
}

const aiSay = (conversation, body, opts = {}) =>
  addMessage(conversation, { senderRole: "ai", senderName: AI_NAME, body, ...opts });

// ------------------------------------------------------- import older stores

async function importLegacy(conversation, studentUserId) {
  const existing = await rowsWhere("case_messages", "conversation_id", conversation.id);
  const seen = new Set(existing.map((m) => m.source_id).filter(Boolean));
  const incoming = [];

  const privConvs = await rowsWhere("private_conversations", "student_id", studentUserId);
  for (const m of await rowsWhere("private_messages", "conversation_id", privConvs.map((c) => c.id))) {
    const mine = String(m.sender_id) === String(studentUserId);
    incoming.push({ sourceId: `private_messages:${m.id}`, senderRole: mine ? "student" : "counselor", senderId: m.sender_id, body: m.message, createdAt: m.created_at || m._created_at });
  }

  const teleConvs = await rowsWhere("telecaller_conversations", "student_id", studentUserId);
  for (const m of await rowsWhere("telecaller_messages", "conversation_id", teleConvs.map((c) => c.id))) {
    const mine = String(m.sender_id) === String(studentUserId);
    incoming.push({ sourceId: `telecaller_messages:${m.id}`, senderRole: mine ? "student" : "telecaller", senderId: m.sender_id, body: m.message, createdAt: m.created_at || m._created_at });
  }

  for (const m of await rowsWhere("ai_chat_messages", "user_id", studentUserId)) {
    incoming.push({ sourceId: `ai_chat_messages:${m.id}`, senderRole: m.role === "user" ? "student" : "ai", body: m.content, createdAt: m.created_at || m._created_at });
  }

  const waConvs = await rowsWhere("whatsapp_conversations", "user_id", studentUserId);
  for (const m of await rowsWhere("whatsapp_messages", "conversation_id", waConvs.map((c) => c.id))) {
    const conv = waConvs.find((c) => String(c.id) === String(m.conversation_id));
    const inbound = m.direction === "inbound";
    incoming.push({
      sourceId: `whatsapp_messages:${m.id}`,
      senderRole: inbound ? "student" : (conv?.staff_role === "telecaller" ? "telecaller" : "counselor"),
      senderId: inbound ? studentUserId : m.staff_id,
      body: m.body,
      channel: inbound && m.channel === "app" ? "app" : "whatsapp",
      createdAt: m.created_at || m._created_at,
    });
  }

  const names = new Map();
  let added = 0;
  for (const item of incoming) {
    if (seen.has(item.sourceId) || !String(item.body || "").trim()) continue;
    let senderName = item.senderRole === "ai" ? AI_NAME : null;
    if (item.senderRole === "counselor" || item.senderRole === "telecaller") {
      const key = String(item.senderId || item.senderRole);
      if (!names.has(key)) names.set(key, await personName(item.senderId, item.senderRole === "counselor" ? "Counselor" : "Telecaller"));
      senderName = names.get(key);
    }
    await addMessage(conversation, {
      ...item,
      senderName,
      createdAt: item.createdAt ? new Date(item.createdAt).toISOString() : null,
    });
    added += 1;
  }
  return added;
}

// ------------------------------------------------------------ profile facts

function firstOf(value) {
  if (Array.isArray(value)) return value.find(Boolean) || "";
  return value || "";
}

function budgetFromNotes(notes) {
  const matches = [...String(notes || "").matchAll(/Study budget \(AI chat\):\s*(.+)/g)];
  return matches.length ? matches[matches.length - 1][1].trim() : "";
}

/** Profile first, lead as fallback — same precedence as the old wizard. */
function knownProfile(profile, lead) {
  const prefs = lead?.preferences || {};
  const country = [firstOf(profile?.interested_countries), profile?.country, firstOf(lead?.preferred_countries), firstOf(prefs.interested_countries)]
    .find((c) => c && isValidCountry(c));
  return {
    country: country ? normalizeCountry(country) : "",
    qualification:
      profile?.degree_level?.trim() ||
      (profile?.masters_degree?.trim() ? "Master's" : "") ||
      (profile?.bachelors_degree?.trim() ? "Bachelor's" : "") ||
      (profile?.twelfth_grade_score?.trim() ? "12th" : "") ||
      lead?.current_qualification || lead?.qualification_level || "",
    field:
      profile?.course_preferences?.trim() || profile?.masters_degree?.trim() || profile?.bachelors_degree?.trim() ||
      lead?.field_of_interest || lead?.stream_or_program || "",
    score:
      profile?.masters_score?.trim() || profile?.bachelors_score?.trim() || profile?.twelfth_grade_score?.trim() ||
      profile?.tenth_grade_score?.trim() || lead?.academic_score || "",
    budget: profile?.study_budget || prefs.study_budget || budgetFromNotes(profile?.student_notes) || budgetFromNotes(lead?.notes),
    phone: [profile?.whatsapp_number, profile?.phone, lead?.whatsapp_number, lead?.phone]
      .map((v) => String(v || "").replace(/\D/g, "")).find((d) => d.length >= 10) || "",
  };
}

const LABELS = { country: "destination", qualification: "qualification", field: "field", score: "score", budget: "budget" };

function mapQualification(q) {
  const lower = q.toLowerCase();
  if (lower.includes("phd") || lower.includes("doctor")) return "PhD";
  if (lower.includes("master")) return "Masters";
  if (lower.includes("bachelor") || lower.includes("b.tech") || lower.includes("b.sc") || lower.includes("undergrad")) return "Bachelors";
  if (lower.includes("diploma")) return "Diploma";
  if (lower.includes("certificate")) return "Certificate";
  if (lower.includes("12") || lower.includes("twelfth") || lower.includes("+2")) return "Bachelors";
  return q;
}

function scoreField(qualification) {
  const lower = String(qualification || "").toLowerCase();
  if (lower.includes("master")) return "masters_score";
  if (lower.includes("bachelor") || lower.includes("b.") || lower.includes("undergrad")) return "bachelors_score";
  if (lower.includes("10") || lower.includes("tenth")) return "tenth_grade_score";
  return "twelfth_grade_score";
}

function mergeList(existing, value) {
  const list = Array.isArray(existing) ? existing.map(String) : existing ? [String(existing)] : [];
  if (value && !list.some((v) => v.toLowerCase() === String(value).toLowerCase())) list.unshift(String(value));
  return list;
}

/** Saves one intake answer to profile + lead so staff see it and nobody re-asks. */
async function saveAnswer(studentUserId, lead, key, value, known) {
  const now = new Date().toISOString();
  // A WhatsApp-only lead has no portal account yet, so no profile to write.
  if (studentUserId) {
    const profile = await jsonFind("profiles", "user_id", studentUserId).catch(() => null);
    const p = { id: profile?.id || crypto.randomUUID(), user_id: String(studentUserId), updated_at: now };
    if (key === "country") p.interested_countries = mergeList(profile?.interested_countries, value);
    if (key === "qualification") p.degree_level = mapQualification(value);
    if (key === "field") p.course_preferences = value;
    if (key === "score") p[scoreField(known.qualification)] = value;
    if (key === "budget") p.study_budget = value;
    if (key === "phone") p.phone = value;
    await jsonUpsert("profiles", p);
  }

  if (lead) {
    const prefs = { ...(lead.preferences || {}), ai_chat_updated_at: now };
    const l = { id: lead.id, updated_at: now, last_activity_at: now };
    if (key === "country") {
      l.preferred_countries = mergeList(lead.preferred_countries, value);
      prefs.interested_countries = mergeList(prefs.interested_countries, value);
    }
    if (key === "qualification") {
      l.current_qualification = value;
      l.qualification_level = mapQualification(value);
    }
    if (key === "field") {
      l.field_of_interest = value;
      l.stream_or_program = value;
    }
    if (key === "score") l.academic_score = value;
    if (key === "budget") prefs.study_budget = value;
    if (key === "phone") l.phone = value;
    l.preferences = prefs;
    Object.assign(lead, l);
    await jsonUpsert("student_leads", l);
  }
}

// ------------------------------------------------------- recommendations

function studyLevel(qualification) {
  return /(12|twelfth|high school|\+2|plus two|intermediate|a[- ]?level|bachelor|b\.?tech|b\.?sc|undergraduate|ug\b)/i.test(qualification || "") ? "UG" : "PG";
}

/** Same matching and card fields as the old wizard's getRecommendationsForProfile. */
async function recommendations(known) {
  const country = normalizeCountry(known.country);
  if (!country) return [];
  const rows = await jsonTable("universities").catch(() => []);
  return rows
    .filter((u) => u.is_active !== false)
    .filter((u) => sameCountry(u.country, country))
    // Best-ranked first; unranked partners after them.
    .sort((a, b) => (Number(a.ranking) || 9999) - (Number(b.ranking) || 9999))
    .slice(0, 6)
    .map((u) => ({
      id: String(u.id),
      name: u.name,
      location: [u.city, u.country].filter(Boolean).join(", "),
      programs: ["Course availability needs confirmation"],
      tuitionFee: "Contact for fees",
      duration: "Duration to be confirmed",
      deadline: "Deadline to be confirmed",
      languageReq: "Entry requirements to be confirmed",
      postStudyVisa: "Check official visa guidance for your nationality and course",
      ranking: u.ranking ? `Ranked #${u.ranking}` : "University catalogue",
      website: u.website_url || undefined,
      imageUrl: u.campus_image_url || u.logo_url || null,
    }));
}

function nextMissing(known) {
  return STEPS.find((s) => !String(known[s.key] || "").trim()) || null;
}

// `once` gives the messages fixed ids, so a finish triggered from two
// requests at the same moment writes each message once.
async function finishIntake(conversation, known, once = null, lead = null) {
  const sid = (n) => (once ? `${once}:${n}` : null);
  await aiSay(conversation, "Perfect — I have everything I need. Let me find universities that match your profile.", { sourceId: sid(1) });
  const unis = await recommendations(known);
  await addMessage(conversation, {
    senderRole: "ai",
    senderName: AI_NAME,
    sourceId: sid(2),
    kind: "recommendations",
    data: { universities: unis, country: known.country },
    body: unis.length
      ? `🎓 Here are universities in ${known.country} that match your profile. A counselor can help you apply.`
      : `I couldn't find matching universities for ${known.country}. Our counselors can still build a shortlist for you.`,
  });
  await aiSay(conversation, "✅ Your chat answers have been saved to your student profile. A Fly Masters advisor will be assigned to you soon — you can keep asking questions here any time.", { sourceId: sid(3) });
  await patchConversation(conversation, { intake_field: null, intake_complete: true });
  await askContact(conversation, lead);
}

// ---- name + email: asked once, at the end, only of a student who started on WhatsApp
// (a web sign-up already gave both, so the web chat never asks).
const looksLikeName = (t) => /^[\p{L}][\p{L} .'-]{1,58}$/u.test(t) && t.split(/\s+/).length <= 5 && !GREETING.test(t) && !ACK_ONLY.test(t) && !UNI_INTENT.test(t) && !looksLikeQuestion(t);
const EMAIL_RE = /[^\s@<>]+@[^\s@<>]+\.[^\s@<>]{2,}/;
const hasName = (lead) => { const f = String(lead?.first_name || "").trim().toLowerCase(); return Boolean(f) && f !== "whatsapp"; };
const hasEmail = (lead) => EMAIL_RE.test(String(lead?.email || ""));
const CONTACT_ASK = {
  name: "One last thing so your advisor can save your shortlist: what's your full name?",
  email: "Thanks! And your email address? (Your advisor will send documents and updates there too.)",
};

async function askContact(conversation, lead) {
  if (!lead || conversation.student_user_id || conversation.contact_done) return;
  const field = !hasName(lead) ? "name" : !hasEmail(lead) ? "email" : null;
  if (!field) return;
  await aiSay(conversation, CONTACT_ASK[field], { sourceId: `contact-ask:${conversation.id}:${field}` });
  await patchConversation(conversation, { contact_field: field });
}

/** Handles a reply while the AI is waiting for the name or email. Returns true when it used the message. */
async function handleContactAnswer(conversation, lead, text) {
  const field = conversation.contact_field;
  if (!field || !lead) return false;
  const t = text.trim();
  if (/^(skip|later|no|nope|not now|don'?t want to)\b/i.test(t)) {
    await patchConversation(conversation, { contact_field: null, contact_done: true });
    await aiSay(conversation, "No problem — you can share your name and email any time and your advisor will add them.");
    return true;
  }
  const now = new Date().toISOString();
  if (field === "name") {
    if (!looksLikeName(t)) {
      if (looksLikeQuestion(t) || UNI_INTENT.test(t)) return false; // let the normal answer happen
      await aiSay(conversation, `Sorry, I didn't catch that. ${CONTACT_ASK.name} (or say "later")`);
      return true;
    }
    const [first, ...rest] = t.replace(/\s+/g, " ").split(" ");
    const patch = { id: lead.id, first_name: first, last_name: rest.join(" "), updated_at: now };
    await jsonUpsert("student_leads", patch);
    await pool.query("UPDATE student_leads SET first_name = $2, last_name = $3 WHERE id = $1", [String(lead.id), patch.first_name, patch.last_name]).catch(() => {});
    Object.assign(lead, patch);
    if (!hasEmail(lead)) {
      await aiSay(conversation, `Nice to meet you, ${first}! ${CONTACT_ASK.email}`);
      await patchConversation(conversation, { contact_field: "email" });
      return true;
    }
  } else {
    const match = t.match(EMAIL_RE);
    if (!match) {
      if (looksLikeQuestion(t) || UNI_INTENT.test(t)) return false;
      await aiSay(conversation, `That doesn't look like an email address. ${CONTACT_ASK.email} (or say "later")`);
      return true;
    }
    const patch = { id: lead.id, email: match[0].toLowerCase(), updated_at: now };
    await jsonUpsert("student_leads", patch);
    await pool.query("UPDATE student_leads SET email = $2 WHERE id = $1", [String(lead.id), patch.email]).catch(() => {});
    Object.assign(lead, patch);
  }
  const portalUrl = String(process.env.PUBLIC_APP_URL || "").trim().replace(/\/$/, "");
  await patchConversation(conversation, { contact_field: null, contact_done: true });
  await aiSay(conversation, `Thank you${hasName(lead) ? `, ${lead.first_name}` : ""}! ✅ Your advisor now has your details.${portalUrl ? ` You can also continue on the web — sign up at ${portalUrl}/student with this same number and this chat will be waiting for you.` : ""}`);
  return true;
}

/** First message the AI sends: greeting + what's known + first missing question. */
async function startIntake(conversation, profile, lead) {
  const known = knownProfile(profile, lead);
  const first = String(profile?.first_name || lead?.first_name || "").trim().split(/\s+/)[0];
  const greeting = `Hi ${first || "there"}! 👋 I'm your AI study abroad advisor from Fly Masters.`;
  const facts = Object.keys(LABELS).filter((k) => known[k]).map((k) => `${LABELS[k]}: ${known[k]}`);
  const note = facts.length ? ` I've loaded your profile (${facts.join(", ")}).` : "";
  const step = nextMissing(known);
  const once = `intake-start:${conversation.id}`;
  if (!step) {
    await aiSay(conversation, `${greeting}${note} Let me find universities that match you.`, { sourceId: once });
    await finishIntake(conversation, known, `${once}:finish`, lead);
    return;
  }
  await aiSay(conversation, `${greeting}${note}\n\n${step.ask}`, { sourceId: once });
  await patchConversation(conversation, { intake_field: step.key, intake_complete: false });
}

/**
 * Keeps the guided questions in step with what is already known, wherever it was answered
 * (web chat, WhatsApp, profile page). A question answered elsewhere is never asked again;
 * when the thread is waiting on one that is now known, it moves to the next missing one
 * (and says so, unless `quiet`). Returns "skip" | "same" | "moved" | "done".
 */
async function syncIntake(conversation, studentUserId, lead, owner, { quiet = false } = {}) {
  if (conversation.intake_complete || owner.role !== "ai") return "skip";
  const profile = studentUserId ? await jsonFind("profiles", "user_id", studentUserId).catch(() => null) : null;
  const known = { ...knownProfile(profile, lead), ...(conversation.intake_answers || {}) };
  const step = nextMissing(known);
  if (!step) {
    if (quiet) {
      await patchConversation(conversation, { intake_field: null, intake_complete: true, intake_answers: null });
    } else {
      await aiSay(conversation, "I already have your details from your profile — let me find universities that match you.", { sourceId: `intake-sync:${conversation.id}:done` });
      await finishIntake(conversation, known, `intake-sync:${conversation.id}:finish`, lead);
      await patchConversation(conversation, { intake_answers: null });
    }
    return "done";
  }
  if (step.key === conversation.intake_field) return "same";
  if (!quiet) {
    await aiSay(conversation, `Let's pick up where we left off.\n\n${step.ask}`, { sourceId: `intake-sync:${conversation.id}:${step.key}` });
  }
  await patchConversation(conversation, { intake_field: step.key, intake_complete: false });
  return "moved";
}

/** The profile follows what the chat learned: answers kept on a lead (e.g. from WhatsApp) fill gaps in the student's own profile. */
async function fillProfileFromLead(studentUserId, lead) {
  if (!studentUserId || !lead) return;
  const profile = await jsonFind("profiles", "user_id", studentUserId).catch(() => null);
  const have = knownProfile(profile, null);
  const known = knownProfile(profile, lead);
  for (const s of STEPS) {
    if (s.key === "phone" || have[s.key] || !known[s.key]) continue;
    await saveAnswer(studentUserId, null, s.key, known[s.key], known);
  }
}

// ----------------------------------------------- FAQ / policy answers

async function activeArticles() {
  const rows = await jsonTable("knowledge_articles").catch(() => []);
  return rows.filter((a) => a.is_active && !a.deleted && String(a.content || "").trim());
}

const ANSWER_SCHEMA = {
  type: "OBJECT",
  properties: {
    answerable: { type: "BOOLEAN" },
    reply: { type: "STRING" },
    sources: { type: "ARRAY", items: { type: "STRING" } },
  },
  required: ["answerable", "reply"],
};

/**
 * Answers a question strictly from the FAQ/policy articles. Returns
 * { reply, sources } or null when the articles don't cover it (or no AI).
 */
async function answerFromKnowledge(question, recent) {
  if (!geminiConfigured()) return null;
  const articles = await activeArticles();
  if (!articles.length) return null;
  let corpus = "";
  for (const a of articles) {
    const block = `### ${a.title} [${a.category === "policy" ? "Policy" : "FAQ"}]\n${String(a.content).trim()}\n\n`;
    if (corpus.length + block.length > 40000) break;
    corpus += block;
  }
  const systemPrompt = `You answer students' questions for Fly Masters, an Indian study-abroad consultancy.

Use ONLY the Fly Masters articles below. Do not use outside knowledge, do not guess, do not add facts, numbers, fees, dates or promises that are not written in the articles.
- If the articles clearly answer the question: answerable=true, reply in at most about 80 words, plain text, friendly, in the student's language; list the titles of the articles you used in "sources".
- If they don't, or only partly: answerable=false and reply="".
- Greetings, thanks or small talk are not questions: answerable=false.

ARTICLES:
${corpus}`;
  const history = [...recent.slice(-6).map((m) => ({ role: m.sender_role === "student" ? "user" : "model", text: m.body })), { role: "user", text: question }];
  try {
    const out = await geminiJson({ systemPrompt, history, schema: ANSWER_SCHEMA, temperature: 0.1 });
    const reply = String(out?.reply || "").trim();
    if (!out?.answerable || !reply) return null;
    const titles = new Set(articles.map((a) => a.title));
    const sources = (Array.isArray(out.sources) ? out.sources : []).map(String).filter((t) => titles.has(t));
    return { reply, sources };
  } catch (error) {
    console.error("[case-ai] FAQ answer failed:", error.message || error);
    return null;
  }
}

/** One "passed to X" note per unanswered stretch — no repeats after every message. */
async function routeToStaff(conversation, owner, messages) {
  let lastStaff = -1;
  messages.forEach((m, i) => {
    // A staff reply or a new assignment notice starts a fresh stretch.
    if (["telecaller", "counselor", "admin", "system"].includes(m.sender_role)) lastStaff = i;
  });
  if (messages.slice(lastStaff + 1).some((m) => m.routed)) return null;
  const body = owner.role === "ai"
    ? "Thanks! I've noted this. A Fly Masters advisor will be assigned to you soon and will reply here."
    : `I've shared this with ${owner.name}, your ${owner.role}. They'll reply here soon.`;
  return aiSay(conversation, body, { extra: { routed: true } });
}

// ------------------------------------------------ assignment notices

async function announceOwner(conversation, owner) {
  const key = ownerKey(owner);
  if (conversation.announced_owner === key) return;
  if (owner.role !== "ai") {
    // Only promise a call when we actually hold a number for this student.
    const lead = conversation.lead_id ? await leadById(conversation.lead_id).catch(() => null) : null;
    const profile = conversation.student_user_id ? await jsonFind("profiles", "user_id", conversation.student_user_id).catch(() => null) : null;
    const hasNumber = Boolean(knownProfile(profile, lead).phone);
    const body = owner.role === "telecaller"
      ? `📞 ${owner.name} from Fly Masters has been assigned to you and will assist you further.${hasNumber ? " They may call you on your registered number." : " Please share your mobile number here so they can reach you."}`
      : `🎓 ${owner.name} is now your Fly Masters counselor and will assist you further with universities, applications and documents.`;
    const notice = await addMessage(conversation, {
      senderRole: "system",
      kind: "system",
      body,
      sourceId: `announce:${conversation.id}:${key}`,
      extra: { owner_role: owner.role, owner_id: owner.id },
    });
    await deliverToWhatsApp(conversation, [notice]);
  }
  const patch = { announced_owner: key };
  // A person has taken over: the AI stops asking intake questions.
  if (owner.role !== "ai" && !conversation.intake_complete) Object.assign(patch, { intake_complete: true, intake_field: null });
  await patchConversation(conversation, patch);
}

/** Everything that should happen when a thread is opened, by anyone. */
async function prepareThread(studentUserId, lead, { sync = false, phone = null } = {}) {
  const owner = await ownerOf(lead);
  const conversation = await conversationFor(studentUserId, lead?.id, { phone });
  if (studentUserId) await importLegacy(conversation, studentUserId);
  // flow_version 2 = guided intake. Threads from before it (none, or the
  // short-lived free-chat version) start the intake once, if the AI still
  // owns the student; with a human already assigned there's no questionnaire.
  if (conversation.flow_version !== 2) {
    await patchConversation(conversation, { flow_version: 2 });
    // The short-lived free-chat version opened with a generic greeting; the
    // intake greeting below replaces it.
    await pool.query(
      "DELETE FROM app_records WHERE table_name = 'case_messages' AND data->>'conversation_id' = $1 AND data->>'source_id' = $2",
      [String(conversation.id), `greeting:${conversation.id}`],
    );
    if (owner.role === "ai" && !conversation.intake_complete) {
      const profile = studentUserId ? await jsonFind("profiles", "user_id", studentUserId).catch(() => null) : null;
      await startIntake(conversation, profile, lead);
    } else {
      await patchConversation(conversation, { intake_complete: true, intake_field: null });
    }
  }
  // Answered somewhere else since the last question? Move on instead of asking it again.
  if (sync) await syncIntake(conversation, studentUserId, lead, owner);
  await announceOwner(conversation, owner);
  return { owner, conversation };
}

// ---------------------------------------------------------------- WhatsApp

// Meta only accepts free-form replies within 24 hours of the student's last
// WhatsApp message; outside it a pre-approved template is required. We stop
// a few minutes early so a reply isn't rejected mid-flight.


function whatsappText(row) {
  if (row.kind === "recommendations") {
    const unis = row.data?.universities || [];
    if (!unis.length) return row.body;
    const lines = unis.map((u, i) => `${i + 1}. ${u.name}${u.location ? ` — ${u.location}` : ""}`);
    return [row.body, "", ...lines, "", "Sign in to the Fly Masters student portal to save them and see details."].join("\n");
  }
  if (["counselor", "telecaller", "admin"].includes(row.sender_role) && row.sender_name) {
    return `${row.sender_name} (Fly Masters): ${row.body}`;
  }
  return row.body;
}

/** True when a paid template already went out recently and the student hasn't written back since. */
async function templateSentSinceReply(conversation) {
  const lastIn = Date.parse(conversation.whatsapp_last_inbound_at || "") || 0;
  const holdHours = (await getReminderSettings()).whatsapp.holdHours;
  const cutoff = Math.max(lastIn, Date.now() - holdHours * 3600000);
  return (await rawMessages(conversation.id)).some(
    (m) => m.wa_via === "template" && ["accepted", "sent", "delivered", "read"].includes(String(m.wa_status)) && (Date.parse(m.wa_attempted_at || "") || 0) > cutoff,
  );
}

/** The student wrote back (window open again): send what was held for them, newest few only. */
async function releaseWaiting(conversation) {
  const held = (await rawMessages(conversation.id)).filter((m) => m.wa_status === "waiting").slice(-5);
  if (held.length) await deliverToWhatsApp(conversation, held);
  return held.length;
}

/**
 * Sends the non-student messages among `rows` to the student's WhatsApp,
 * if this conversation is on WhatsApp and the 24-hour window is open.
 * Each message records the outcome (wa_status) so staff can see it.
 */
/**
 * Whether replies in this thread may go to its WhatsApp number. A thread that
 * belongs to a portal account only sends to WhatsApp once that number was
 * OTP-verified for the account — otherwise anyone who typed (or mistyped)
 * that number would receive the counsellor's messages for that student.
 * A thread that is just a WhatsApp lead (no account) is the person on that
 * number, so it always may.
 */
export async function whatsappTrusted(conversation) {
  if (!conversation?.whatsapp_phone) return false;
  if (!conversation.student_user_id) return true;
  const digits = normalizeWaPhone(conversation.whatsapp_phone);
  const lead = conversation.lead_id ? await leadById(conversation.lead_id).catch(() => null) : null;
  const profile = await jsonFind("profiles", "user_id", conversation.student_user_id).catch(() => null);
  const verified = (rec) => Boolean(rec)
    && (rec.whatsapp_verified === true || rec.whatsapp_verified === "true")
    && [rec.whatsapp_number, rec.phone].some((n) => n && normalizeWaPhone(n) === digits);
  return verified(lead) || verified(profile);
}

async function deliverToWhatsApp(conversation, rows) {
  const to = conversation.whatsapp_phone;
  if (!to || !rows.length) return;
  if (!(await whatsappTrusted(conversation))) {
    // Kept in the app; staff see "app only — number not verified".
    for (const row of rows) {
      if (!row || row.sender_role === "student" || !String(row.body || "").trim()) continue;
      const patch = { wa_status: "unverified", wa_attempted_at: new Date().toISOString() };
      Object.assign(row, patch);
      await jsonUpsert("case_messages", { id: row.id, ...patch });
    }
    return;
  }
  const windowOpen = whatsappWindowOpen(conversation.whatsapp_last_inbound_at);
  // Cost guard: each template message is paid. While the student hasn't replied, only ONE goes out
  // (per 72 hours); everything after it waits in the chat and is sent free as soon as they reply or tap the button.
  let allowance = null;
  let templateOut = !windowOpen && outreachTemplateName() ? await templateSentSinceReply(conversation) : false;
  for (const row of rows) {
    if (!row || row.sender_role === "student" || !String(row.body || "").trim()) continue;
    let patch;
    if (!whatsappSendConfigured()) patch = { wa_status: "not_configured" };
    else if (!windowOpen && !outreachTemplateName()) patch = { wa_status: "window_closed" };
    else if (!windowOpen && templateOut) patch = { wa_status: "waiting" };
    else if (!windowOpen && !(allowance = await templateAllowance()).ok) patch = { wa_status: "waiting", wa_error: allowance.reason };
    else if (!windowOpen) {
      // Window closed: reach the student with the approved template instead.
      try {
        const lead = conversation.lead_id ? await leadById(conversation.lead_id) : null;
        const first = String(lead?.first_name || "").trim();
        patch = { wa_status: "accepted", wa_error: null, wa_via: "template", wa_message_id: await sendWhatsAppOutreach(to, first, whatsappText(row)) };
        templateOut = true;
      } catch (error) {
        console.error("[case-wa] template send failed:", error.message || error);
        patch = { wa_status: "window_closed", wa_error: String(error.message || error).slice(0, 200) };
      }
    } else {
      try {
        patch = { wa_status: "accepted", wa_error: null, wa_message_id: await sendWhatsAppText(to, whatsappText(row)) };
      } catch (error) {
        console.error("[case-wa] send failed:", error.message || error);
        patch = { wa_status: "failed", wa_error: String(error.message || error).slice(0, 200) };
      }
    }
    patch.wa_attempted_at = new Date().toISOString();
    Object.assign(row, patch);
    await jsonUpsert("case_messages", { id: row.id, ...patch });
  }
}

// The same phone number, not just the same last ten digits: a stored number
// with its country code must equal the WhatsApp number exactly; a stored
// 10-digit number (no code, as Indian numbers are usually typed) matches
// only an Indian (+91) WhatsApp number.
const PHONE_MATCH = (col) => `(
  regexp_replace(coalesce(data->>'${col}',''), '[^0-9]', '', 'g') = $1
  OR (length(regexp_replace(coalesce(data->>'${col}',''), '[^0-9]', '', 'g')) = 10
      AND $1 = '91' || regexp_replace(coalesce(data->>'${col}',''), '[^0-9]', '', 'g'))
  OR (length(regexp_replace(coalesce(data->>'${col}',''), '[^0-9]', '', 'g')) = 11
      AND left(regexp_replace(coalesce(data->>'${col}',''), '[^0-9]', '', 'g'), 1) = '0'
      AND $1 = '91' || right(regexp_replace(coalesce(data->>'${col}',''), '[^0-9]', '', 'g'), 10))
)`;

async function leadByPhone(phone) {
  const digits = normalizeWaPhone(phone);
  if (!digits) return null;
  const { rows } = await pool.query(
    `SELECT id, data, branch_id FROM app_records
      WHERE table_name = 'student_leads'
        AND (coalesce(data->>'merged_into','') = ''
          OR NOT EXISTS (SELECT 1 FROM app_records t WHERE t.table_name = 'student_leads' AND t.id = app_records.data->>'merged_into'))
        AND (${PHONE_MATCH("whatsapp_number")} OR ${PHONE_MATCH("phone")})
        AND (coalesce(data->>'user_id', '') = '' OR data->>'whatsapp_verified' = 'true'
          OR data->>'user_id' IN (
            SELECT data->>'user_id' FROM app_records WHERE table_name = 'profiles'
              AND data->>'whatsapp_verified' = 'true' AND ${PHONE_MATCH("whatsapp_number")}
          ))
      ORDER BY (data->>'user_id' IS NOT NULL) DESC, coalesce(data->>'updated_at','') DESC
      LIMIT 1`,
    [digits],
  );
  return rows[0] ? { ...rows[0].data, id: rows[0].id, branch_id: rows[0].branch_id } : null;
}

// Same matching as leadByPhone, but without the whatsapp_verified gate.
// Used only to avoid minting a second, duplicate lead for someone who
// already has one on file under this phone number (e.g. they typed it on
// the web app and never finished WhatsApp OTP verification, then went and
// messaged WhatsApp from that same number) — see the caller for why this is
// safe to use for *which CRM record to attach the message to* while staying
// unsafe to use for *whose account to sign this sender in as*.
async function leadByPhoneAnyVerification(phone) {
  const digits = normalizeWaPhone(phone);
  if (!digits) return null;
  const { rows } = await pool.query(
    `SELECT id, data, branch_id FROM app_records
      WHERE table_name = 'student_leads'
        AND (coalesce(data->>'merged_into','') = ''
          OR NOT EXISTS (SELECT 1 FROM app_records t WHERE t.table_name = 'student_leads' AND t.id = app_records.data->>'merged_into'))
        AND (${PHONE_MATCH("whatsapp_number")} OR ${PHONE_MATCH("phone")})
      ORDER BY (data->>'user_id' IS NOT NULL) DESC, coalesce(data->>'updated_at','') DESC
      LIMIT 1`,
    [digits],
  );
  return rows[0] ? { ...rows[0].data, id: rows[0].id, branch_id: rows[0].branch_id } : null;
}

async function userIdByPhone(phone) {
  const digits = normalizeWaPhone(phone);
  if (!digits) return null;
  const { rows } = await pool.query(
    `SELECT data->>'user_id' AS user_id FROM app_records
      WHERE table_name = 'profiles' AND data->>'user_id' IS NOT NULL
        AND data->>'whatsapp_verified' = 'true'
        AND (${PHONE_MATCH("whatsapp_number")} OR ${PHONE_MATCH("phone")})
      LIMIT 1`,
    [digits],
  );
  return rows[0]?.user_id || null;
}

/** A first message from an unknown number becomes a hot lead, like a portal sign-up. */
async function createWhatsAppLead(phone, contactName, userId) {
  const now = new Date().toISOString();
  const [first, ...rest] = String(contactName || "").trim().split(/\s+/).filter(Boolean);
  const lead = {
    id: crypto.randomUUID(),
    user_id: userId ? String(userId) : null,
    first_name: first || "WhatsApp",
    last_name: rest.join(" ") || (first ? "" : `+${phone}`),
    email: "",
    phone: String(phone).slice(-10),
    whatsapp_number: phone,
    lead_source: "whatsapp",
    lead_status: "hot",
    lead_stage: "hot",
    entity_type: "lead",
    status: "new",
    notes: "Started on WhatsApp.",
    created_at: now,
    updated_at: now,
    last_activity_at: now,
  };
  // Mirror into the SQL table too, like portal sign-ups, for screens that read it.
  await pool.query(
    `INSERT INTO student_leads (id, user_id, email, phone, first_name, last_name, lead_status, lead_stage,
       lead_source, entity_type, status, created_at)
     VALUES ($1,$2,$3,$4,$5,$6,'hot','hot','whatsapp','lead','new',$7)
     ON CONFLICT (id) DO NOTHING`,
    [lead.id, lead.user_id, lead.email, lead.phone, lead.first_name, lead.last_name, now],
  ).catch(() => {});
  return jsonUpsert("student_leads", lead);
}

/**
 * A WhatsApp message from a student (called by the webhook after it has been
 * stored). `sourceId` must be `whatsapp_messages:<row id>` — the same key the
 * portal's history import uses, so the message is never added twice.
 * Returns the lead id it was filed under.
 */
const inboundQueues = new Map();

export function handleWhatsAppInbound(input) {
  // One number's messages are handled one after another, so two quick
  // messages can't both answer the same intake question.
  const key = normalizeWaPhone(input?.phone) || "invalid";
  const run = (inboundQueues.get(key) || Promise.resolve()).then(() => processWhatsAppInbound(input));
  const tail = run.catch(() => {});
  inboundQueues.set(key, tail);
  tail.then(() => { if (inboundQueues.get(key) === tail) inboundQueues.delete(key); });
  return run;
}

async function processWhatsAppInbound({ phone: rawPhone, contactName, body, sourceId, sentAt }) {
  const phone = normalizeWaPhone(rawPhone);
  const text = cleanText(body);
  if (!phone || !text) return { leadId: null, summary: "empty message or unusable number" };

  const messageId = `cm-${crypto.createHash("sha1").update(sourceId).digest("hex")}`;
  const { rows: dup } = await pool.query(
    "SELECT 1 FROM app_records WHERE table_name = 'case_messages' AND id = $1",
    [messageId],
  );
  if (dup.length) return { leadId: null, summary: "already handled (Meta retry)" }; // Meta retried a message we already handled.

  let lead = await leadByPhone(phone);
  let userId = lead?.user_id || (await userIdByPhone(phone));
  if (!lead && userId) lead = await leadForStudent(userId);
  // Before minting a brand-new lead, see if one already exists on file for
  // this phone number that the verified-only lookups above couldn't see
  // (one person, one record — don't let an unverified web signup leave a
  // second "ghost" lead/conversation behind the first time they text in).
  let reusedUnverifiedLead = false;
  if (!lead) {
    lead = await leadByPhoneAnyVerification(phone);
    reusedUnverifiedLead = Boolean(lead);
  }
  const isNewLead = !lead;
  if (!lead) lead = await createWhatsAppLead(phone, contactName, userId);
  // Only treat the lead's user_id as *this sender's* authenticated identity
  // when it came from a verified match. A lead reused above only via the lax
  // phone match may have had this number typed in by mistake (possibly
  // someone else's real number), so adopting its account here could leak
  // that other person's profile/chat into this conversation. The lead
  // record itself is still reused (so the CRM doesn't fork), but the sender
  // stays anonymous on the WhatsApp side until normal OTP verification
  // confirms the number is really theirs (see linkWhatsAppLeads).
  if (lead.user_id && !reusedUnverifiedLead) userId = lead.user_id;
  if (!lead.whatsapp_number) {
    await jsonUpsert("student_leads", { id: lead.id, whatsapp_number: phone });
    lead.whatsapp_number = phone;
  }

  const conversation = await conversationFor(userId || null, lead.id, { phone });
  const fresh = conversation.flow_version !== 2;
  const before = new Set((await rawMessages(conversation.id)).map((m) => m.id));
  await addMessage(conversation, {
    senderRole: "student",
    senderId: userId || null,
    body: text,
    channel: "whatsapp",
    sourceId,
    createdAt: sentAt || null,
  });
  await patchConversation(conversation, {
    whatsapp_phone: phone,
    whatsapp_last_inbound_at: (() => {
      const at = Date.parse(sentAt || "");
      const prior = Date.parse(conversation.whatsapp_last_inbound_at || "");
      const valid = Number.isFinite(at) ? Math.min(at, Date.now()) : Date.now();
      return new Date(Math.max(valid, Number.isFinite(prior) ? prior : 0)).toISOString();
    })(),
  });

  void notifyStaffOfChat(conversation, lead, text);

  // A brand-new conversation's reply is the intake greeting and first question.
  const { owner, conversation: thread } = await prepareThread(userId || null, lead, { phone });
  // (With a person already assigned there is no intake, so the message is handled normally.)
  if (!fresh || owner.role !== "ai") await handleStudentMessage(thread, userId || null, lead, owner, text);

  // They are back inside the 24-hour window: first anything we held while they were away, then the reply.
  await releaseWaiting(thread);
  const created = (await rawMessages(thread.id)).filter((m) => !before.has(m.id));
  const replies = created.filter((m) => m.sender_role !== "system" && m.sender_role !== "student");
  await deliverToWhatsApp(thread, replies);
  // This number is on a portal account but was never verified for it: replies
  // stay in the portal. Tell the person on WhatsApp why (at most once a day).
  const unverifiedForAccount = thread.student_user_id
    ? !(await whatsappTrusted(thread))
    : Boolean(lead.user_id) && !numberVerifiedForLead(lead, phone);
  if (unverifiedForAccount && whatsappSendConfigured()) {
    const last = Date.parse(thread.wa_verify_nudged_at || "") || 0;
    if (Date.now() - last > 24 * 3600000) {
      await sendWhatsAppText(phone, "Thanks for your message. To keep chatting with Fly Masters here, please verify this WhatsApp number in your student portal (Profile → WhatsApp). Until then, our replies appear in the portal's Messages.")
        .then(() => patchConversation(thread, { wa_verify_nudged_at: new Date().toISOString() }))
        .catch((error) => console.error("[case-wa] verify nudge failed:", error.message || error));
    }
  }
  const counts = replies.reduce((acc, m) => ({ ...acc, [m.wa_status || "?"]: (acc[m.wa_status || "?"] || 0) + 1 }), {});
  const summary = [
    isNewLead ? "new lead created" : `existing ${userId ? "student" : "lead"}`,
    replies.length
      ? `replies: ${Object.entries(counts).map(([k, v]) => `${v} ${k}`).join(", ")}`
      : `no reply needed (now with ${owner.role === "ai" ? "AI" : owner.name})`,
  ].join(" · ");
  return { leadId: String(lead.id), summary };
}

/**
 * One person, one record. When a web-app student verifies their WhatsApp number,
 * any lead that started on WhatsApp from that same number is folded into the
 * student's own lead: answers, chat history and the WhatsApp thread move over,
 * and the WhatsApp-only lead is hidden (kept, marked `merged_into`, never deleted).
 * Only runs after the number is verified, so typing someone else's number can't
 * pull their chat into your account.
 */
export async function linkWhatsAppLeads(studentUserId, rawPhone, { notify = true } = {}) {
  const phone = normalizeWaPhone(rawPhone);
  if (!studentUserId || !phone) return { merged: 0 };
  const keep = await leadForStudent(studentUserId);
  if (!keep) return { merged: 0 };
  // A verified number is where this student's chat can reach WhatsApp from now on, and (once) the
  // student hears about it there: the follow-up template when the 24-hour window is closed.
  try {
    const own = await conversationFor(studentUserId, keep.id);
    if (own.whatsapp_phone !== phone) await patchConversation(own, { whatsapp_phone: phone });
    const sourceId = `wa-verified:${own.id}:${phone}`;
    const noticeId = `cm-${crypto.createHash("sha1").update(sourceId).digest("hex")}`;
    const { rows: sent } = await pool.query("SELECT 1 FROM app_records WHERE table_name = 'case_messages' AND id = $1", [noticeId]);
    if (notify && !sent.length) {
      const notice = await addMessage(own, {
        senderRole: "system",
        kind: "system",
        body: "✅ WhatsApp verified. Your advisor's replies and updates will reach you on WhatsApp too — reply here any time.",
        sourceId,
      });
      await deliverToWhatsApp(own, [notice]);
    }
  } catch (error) {
    console.error("[case] verified-number link failed:", error?.message || error);
  }
  const { rows } = await pool.query(
    `SELECT id, data FROM app_records
      WHERE table_name = 'student_leads' AND id <> $2
        AND coalesce(data->>'merged_into','') = ''
        AND (coalesce(data->>'user_id','') = '' OR data->>'user_id' = id)
        AND (${PHONE_MATCH("whatsapp_number")} OR ${PHONE_MATCH("phone")})`,
    [phone, String(keep.id)],
  );
  if (!rows.length) return { merged: 0 };

  const now = new Date().toISOString();
  const keepConv = await conversationFor(studentUserId, keep.id);
  for (const row of rows) {
    const dup = { ...row.data, id: row.id };
    // Fill only what the student's own record is missing.
    const fill = { id: keep.id, updated_at: now };
    for (const f of ["preferred_countries", "current_qualification", "qualification_level", "field_of_interest", "stream_or_program", "academic_score"]) {
      const empty = keep[f] == null || keep[f] === "" || (Array.isArray(keep[f]) && !keep[f].length);
      if (empty && dup[f]) fill[f] = dup[f];
    }
    fill.preferences = { ...(dup.preferences || {}), ...(keep.preferences || {}) };
    fill.whatsapp_number = phone;
    await jsonUpsert("student_leads", fill);
    Object.assign(keep, fill);

    // Move the WhatsApp chat into the student's one conversation.
    const dupConvs = await rowsWhere("case_conversations", "lead_id", dup.id);
    for (const dc of dupConvs) {
      if (String(dc.id) === String(keepConv.id)) continue;
      await pool.query(
        `UPDATE app_records SET data = jsonb_set(data, '{conversation_id}', to_jsonb($2::text))
          WHERE table_name = 'case_messages' AND data->>'conversation_id' = $1`,
        [String(dc.id), String(keepConv.id)],
      );
      const later = (a, b) => (String(a || "") > String(b || "") ? a : b);
      await patchConversation(keepConv, {
        whatsapp_phone: phone,
        whatsapp_last_inbound_at: later(dc.whatsapp_last_inbound_at, keepConv.whatsapp_last_inbound_at) || null,
        ...(dc.intake_complete && !keepConv.intake_complete ? { intake_complete: true, intake_field: null } : {}),
        ...(dc.intake_answers ? { intake_answers: { ...dc.intake_answers, ...(keepConv.intake_answers || {}) } } : {}),
        ...(!dc.intake_complete && !keepConv.intake_complete && !keepConv.intake_field && dc.intake_field ? { intake_field: dc.intake_field } : {}),
      });
      await jsonUpsert("case_conversations", { id: dc.id, merged_into: String(keepConv.id) });
    }
    // The older staff WhatsApp screens follow the same lead.
    await pool.query(
      `UPDATE app_records SET data = jsonb_set(data, '{lead_id}', to_jsonb($2::text))
        WHERE table_name = 'whatsapp_conversations' AND data->>'lead_id' = $1`,
      [String(dup.id), String(keep.id)],
    );
    await jsonUpsert("student_leads", { id: dup.id, merged_into: String(keep.id), merged_at: now, lead_status: "merged", updated_at: now });
    await pool.query("UPDATE student_leads SET lead_status = 'merged' WHERE id = $1", [String(dup.id)]).catch(() => {});
  }
  // What the WhatsApp chat learned now lives on the student's own profile, and the questions carry on from there.
  try {
    await fillProfileFromLead(studentUserId, keep);
    await syncIntake(keepConv, studentUserId, keep, await ownerOf(keep), { quiet: true });
  } catch (error) {
    console.error("[case] profile fill after merge failed:", error?.message || error);
  }
  return { merged: rows.length };
}

/**
 * A short message from the system into the student's one chat. It shows in the web chat and,
 * when the student's number is verified or they came from WhatsApp, goes to WhatsApp too
 * (the approved template when the 24-hour window is closed). `studentRef` is the portal
 * user id, or the lead id for a WhatsApp-only student. `key` makes it send once.
 */
export async function notifyStudentChat(studentRef, body, key) {
  try {
    let lead = await leadForStudent(studentRef);
    let userId = lead ? String(studentRef) : null;
    if (!lead) {
      lead = await leadById(studentRef);
      userId = lead?.user_id && String(lead.user_id) !== String(lead.id) ? String(lead.user_id) : null;
    }
    if (!lead) return false;
    const conversation = userId
      ? await conversationFor(userId, lead.id)
      : (await rowsWhere("case_conversations", "lead_id", lead.id))[0] || (await conversationFor(null, lead.id));
    const message = await addMessage(conversation, { senderRole: "system", kind: "system", body, sourceId: key });
    await deliverToWhatsApp(conversation, [message]);
    return true;
  } catch (error) {
    console.error("[case] student chat notice failed:", error?.message || error);
    return false;
  }
}


const lastMergeCheck = new Map();
/** A student who verified their number before merging existed (or whose WhatsApp chat started
 *  later) is folded into one record the next time their chat loads. Quiet: sends nothing. */
async function mergeIfVerified(userId, profile, lead) {
  const phone = [profile?.whatsapp_verified ? profile.whatsapp_number : null, lead?.whatsapp_verified ? lead.whatsapp_number : null]
    .find(Boolean);
  if (!phone) return;
  const key = String(userId);
  if (Date.now() - (lastMergeCheck.get(key) || 0) < 60_000) return;
  lastMergeCheck.set(key, Date.now());
  await linkWhatsAppLeads(userId, phone, { notify: false }).catch((error) => console.error("[case] merge check failed:", error?.message || error));
}

/** Once at start-up: fold every already-verified student's WhatsApp chat into their one record. */
export async function sweepVerifiedMerges() {
  const { rows } = await pool.query(
    `SELECT DISTINCT data->>'user_id' AS user_id, coalesce(data->>'whatsapp_number', data->>'phone') AS phone
       FROM app_records
      WHERE table_name = 'profiles' AND data->>'whatsapp_verified' = 'true'
        AND coalesce(data->>'user_id','') <> ''`,
  );
  let merged = 0;
  for (const row of rows) {
    const result = await linkWhatsAppLeads(row.user_id, row.phone, { notify: false }).catch(() => ({ merged: 0 }));
    merged += result.merged || 0;
  }
  if (merged) console.log(`[case] start-up sweep folded ${merged} WhatsApp chat(s) into verified students`);
}

/**
 * A student who stopped in the middle of the questions gets the same question again on WhatsApp
 * (the follow-up template when the 24-hour window is closed; the tap on "Continue Chat" resumes
 * it). At most two nudges (hours set on the Automation screen, default 3 then 48), only 9am-8pm India
 * time, only while the AI still owns the student.
 */
export async function nudgeStalledIntakes(now = new Date(), { settings = null, ignoreHours = false } = {}) {
  const cfg = (settings || (await getReminderSettings())).intake;
  if (!cfg.enabled || String(process.env.INTAKE_NUDGE || "").toLowerCase() === "off") return 0;
  if (!ignoreHours && !reminderHoursOpen(now, (settings || (await getReminderSettings())).whatsapp)) return 0;
  const NUDGE_AFTER_HOURS = [cfg.firstHours, cfg.secondHours];
  const convs = (await jsonTable("case_conversations")).filter(
    (c) => c.whatsapp_phone && c.intake_field && !c.intake_complete && !c.merged_into && Number(c.intake_nudges || 0) < NUDGE_AFTER_HOURS.length,
  );
  let sent = 0;
  for (const conv of convs) {
    try {
      const hoursSince = (iso) => (now.getTime() - Date.parse(iso || "")) / 3600000;
      const n = Number(conv.intake_nudges || 0);
      const messages = await rawMessages(conv.id);
      const lastStudent = [...messages].reverse().find((m) => m.sender_role === "student");
      const lastAny = messages[messages.length - 1];
      // Only if the student is the one who went quiet (the last thing in the thread is our question).
      if (!lastAny || lastAny.sender_role === "student") continue;
      const quiet = hoursSince(lastStudent ? sentAt(lastStudent) : sentAt(messages[0]));
      if (!(quiet >= NUDGE_AFTER_HOURS[n])) continue;
      if (conv.intake_nudged_at && hoursSince(conv.intake_nudged_at) < 20) continue;
      const lead = conv.lead_id ? await leadById(conv.lead_id) : null;
      if (!lead || lead.entity_type === "student" || lead.lead_status === "converted" || lead.merged_into) continue;
      const owner = await ownerOf(lead);
      if (owner.role !== "ai") continue;
      const step = STEPS.find((x) => x.key === conv.intake_field);
      if (!step) continue;
      const first = String(lead.first_name || "").trim().split(/\s+/)[0];
      const msg = await aiSay(conv, `${first && first !== "WhatsApp" ? `Hi ${first}! ` : "Hi! "}You were in the middle of your Fly Masters study-abroad profile. ${step.ask}`, { sourceId: `intake-nudge:${conv.id}:${n + 1}` });
      await deliverToWhatsApp(conv, [msg]);
      await patchConversation(conv, { intake_nudges: n + 1, intake_nudged_at: now.toISOString() });
      sent += 1;
    } catch (error) {
      console.error("[case] intake nudge failed:", error?.message || error);
    }
  }
  return sent;
}

/** Called when admin assigns a telecaller or counselor: the notice appears (and reaches WhatsApp) right away. */
export async function announceCaseOwner(leadId) {
  const lead = await leadById(leadId);
  if (!lead) return;
  const conversation = lead.user_id
    ? (await rowsWhere("case_conversations", "student_user_id", lead.user_id))[0]
    : (await rowsWhere("case_conversations", "lead_id", lead.id))[0];
  if (!conversation) return; // No chat yet; the notice is posted when one starts.
  await announceOwner(conversation, await ownerOf(lead));
}

// -------------------------------------------------------------- permissions

async function counselorAliases(user) {
  const ids = new Set([String(user.id)]);
  const byAuth = await rowsWhere("counselors", "auth_user_id", user.id).catch(() => []);
  byAuth.forEach((c) => ids.add(String(c.id)));
  if (user.email) {
    const email = String(user.email).toLowerCase();
    const { rows } = await pool.query("SELECT id FROM counselor_users WHERE lower(email) = $1", [email]).catch(() => ({ rows: [] }));
    rows.forEach((r) => ids.add(String(r.id)));
  }
  return ids;
}

async function canStaffAccess(req, lead) {
  const role = req.user.role;
  if (ADMIN_ROLES.has(role)) return true;
  if (role === ROLES.BRANCH_HEAD) {
    return req.scope?.allBranches || (req.scope?.branchIds || []).map(String).includes(String(lead.branch_id || ""));
  }
  if (role === ROLES.TELECALLER) return String(lead.assigned_telecaller_id || "") === String(req.user.id);
  if (role === ROLES.COUNSELOR) {
    const aliases = await counselorAliases(req.user);
    // Theirs as counsellor, or as the telecaller on it (a counsellor can be
    // given telecalling work).
    return [lead.assigned_counselor_id, lead.assigned_telecaller_id]
      .some((id) => id && aliases.has(String(id)));
  }
  return false;
}

function requireStaff(req, res, next) {
  if (!STAFF_ROLES.has(req.user?.role)) return res.status(403).json({ error: "Staff only" });
  next();
}

// Telecallers and counselors reach a case by assignment, not by branch, so
// only branch heads go through branch scoping here.
function scopeBranchHead(req, res, next) {
  if (req.user?.role === ROLES.BRANCH_HEAD) return branchScope(req, res, next);
  next();
}

function requireStudent(req, res, next) {
  if (req.user?.role !== ROLES.STUDENT) return res.status(403).json({ error: "Students only" });
  next();
}

function cleanText(value) {
  return String(value || "").trim().slice(0, MAX_MESSAGE);
}

// ------------------------------------------------------------------ student

/**
 * Badge count for the chat button / Messages icon. Read-only: unlike
 * GET /api/case/me it doesn't open the thread or mark anything read.
 * A student who has never opened the chat gets 1, so the AI's first
 * question is waiting for them.
 */
router.get("/api/case/me/unread", anySession, requireStudent, async (req, res) => {
  try {
    const conv = (await rowsWhere("case_conversations", "student_user_id", req.user.id))[0];
    if (!conv) return res.json({ unread: 1 });
    const readAt = String(conv.student_last_read_at || "");
    const msgs = await rowsWhere("case_messages", "conversation_id", conv.id);
    const unread = msgs.filter((m) => m.sender_role !== "student" && sentAt(m) > readAt).length;
    res.json({ unread });
  } catch (error) {
    console.error("[case] unread failed:", error);
    res.json({ unread: 0 });
  }
});

router.get("/api/case/me", anySession, requireStudent, async (req, res) => {
  try {
    let lead = await leadForStudent(req.user.id);
    const profile = await jsonFind("profiles", "user_id", req.user.id).catch(() => null);
    await mergeIfVerified(req.user.id, profile, lead);
    lead = await leadForStudent(req.user.id);
    const { owner, conversation } = await prepareThread(req.user.id, lead, { sync: true });
    await patchConversation(conversation, { student_last_read_at: new Date().toISOString() });
    res.json({
      conversation_id: conversation.id,
      can_reply: !telecallerLocked(req, lead),
      owner,
      intake_complete: Boolean(conversation.intake_complete),
      messages: (await rawMessages(conversation.id)).map((m) => publicMessage(m)),
    });
  } catch (error) {
    console.error("[case] load failed:", error);
    res.status(500).json({ error: "Could not load your conversation." });
  }
});

/**
 * The same university matches the AI shows in the chat, for the dashboard:
 * computed from the student's current profile, so editing the profile
 * updates them. `saved` marks the ones in the student's saved list.
 */
router.get("/api/case/me/recommendations", anySession, requireStudent, async (req, res) => {
  try {
    const [profile, lead, favorites, conv] = await Promise.all([
      jsonFind("profiles", "user_id", req.user.id).catch(() => null),
      leadForStudent(req.user.id),
      rowsWhere("user_favorites", "user_id", req.user.id).catch(() => []),
      rowsWhere("case_conversations", "student_user_id", req.user.id).then((r) => r[0] || null),
    ]);
    const known = knownProfile(profile, lead);
    const saved = new Set(favorites.map((f) => String(f.university_id)));
    const missing = STEPS.filter((s) => !String(known[s.key] || "").trim()).map((s) => LABELS[s.key] || s.key);
    const universities = (await recommendations(known)).map((u) => ({ ...u, saved: saved.has(u.id) }));
    res.json({
      known,
      missing,
      chat_started: Boolean(conv),
      intake_complete: Boolean(conv?.intake_complete),
      universities,
    });
  } catch (error) {
    console.error("[case] recommendations failed:", error);
    res.status(500).json({ error: "Could not load your recommendations." });
  }
});

async function handleStudentMessage(conversation, studentUserId, lead, owner, text) {
  // Not an answer: the tap on the follow-up template's button, or a photo/file/voice note.
  const resumeTap = text.trim().toLowerCase() === outreachButtonText().toLowerCase();
  const attachment = /^\[[^\]]+\]/.test(text.trim());
  // Something was answered on the other side (web profile / WhatsApp) since the last question.
  // When it moved on, the AI has just said what comes next, so this message isn't treated as an answer.
  const synced = attachment ? "skip" : await syncIntake(conversation, studentUserId, lead, owner);
  if (synced === "moved" || synced === "done") return;
  if (resumeTap || attachment) {
    const step = !conversation.intake_complete && conversation.intake_field ? STEPS.find((s) => s.key === conversation.intake_field) : null;
    const who = owner.role === "ai"
      ? "Ask me about universities, visas, documents or fees"
      : `${owner.name}, your ${owner.role}, will reply here`;
    if (resumeTap) {
      await aiSay(conversation, step ? `Hi! 👋 I'm your Fly Masters AI assistant. Let's continue.\n\n${step.ask}` : `Hi! 👋 I'm your Fly Masters AI assistant. ${who}.`);
    } else {
      const note = "I can only read text messages on WhatsApp. To share documents, please upload them in the Documents section of your Fly Masters student portal.";
      await aiSay(conversation, step ? `${note}\n\n${step.ask}` : `${note} ${owner.role === "ai" ? "" : `${owner.name} can see your message.`}`.trim());
      if (owner.role !== "ai") await routeToStaff(conversation, owner, await rawMessages(conversation.id));
    }
    return;
  }
  // 0. Waiting for the name / email (asked once, after the recommendations, of a WhatsApp-first student).
  if (conversation.contact_field && (await handleContactAnswer(conversation, lead, text))) return;

  // 1. Still in the guided questions.
  if (!conversation.intake_complete && conversation.intake_field) {
    const step = STEPS.find((s) => s.key === conversation.intake_field) || STEPS[0];
    // A bare "hi" in the middle of the questions: say hello and ask the same question again.
    if (GREETING.test(text.trim())) {
      await aiSay(conversation, `Hi! 👋 I'm your Fly Masters AI assistant. Let's continue.\n\n${step.ask}`);
      return;
    }
    if (looksLikeQuestion(text)) {
      const answer = await answerFromKnowledge(text, await rawMessages(conversation.id));
      const lead_in = answer ? answer.reply : "Good question — your Fly Masters advisor will help you with that once you're assigned.";
      await aiSay(conversation, `${lead_in}\n\n${step.ask}`, answer ? { extra: { source: "faq", sources: answer.sources, review_status: "pending" } } : {});
      return;
    }
    const checked = validateStep(step.key, text);
    if (checked.error) {
      await aiSay(conversation, checked.error);
      return;
    }
    const profile = studentUserId ? await jsonFind("profiles", "user_id", studentUserId).catch(() => null) : null;
    // The chat keeps its own copy of the answers it has collected. If saving to the
    // profile or lead is delayed or fails, the AI still never re-asks a question.
    const before = { ...knownProfile(profile, lead), ...(conversation.intake_answers || {}) };
    await saveAnswer(studentUserId, lead, step.key, checked.value, before);
    const answers = { ...(conversation.intake_answers || {}), [step.key]: checked.value };
    const known = { ...before, [step.key]: checked.value };
    const next = nextMissing(known);
    if (next) {
      await aiSay(conversation, `${ACK[step.key](checked.value)} ${next.ask}`);
      await patchConversation(conversation, { intake_field: next.key, intake_answers: answers });
    } else {
      await aiSay(conversation, ACK[step.key](checked.value));
      await finishIntake(conversation, known, null, lead);
      await patchConversation(conversation, { intake_answers: null });
    }
    return;
  }

  // 2. After intake: FAQ/policy answer if the articles cover it, else the assigned person.
  const messages = await rawMessages(conversation.id);
  const answer = looksLikeQuestion(text) || text.split(/\s+/).length >= 4
    ? await answerFromKnowledge(text, messages)
    : null;
  if (answer) {
    await aiSay(conversation, answer.reply, { extra: { source: "faq", sources: answer.sources, review_status: "pending" } });
    return;
  }
  // A greeting gets a short hello (on WhatsApp silence looks broken);
  // "ok" / "thanks" need nothing, so no reply.
  if (GREETING.test(text)) {
    const who = owner.role === "ai"
      ? "Ask me about universities, visas, documents or fees"
      : `Ask me anything — ${owner.name}, your ${owner.role}, will also reply here`;
    await aiSay(conversation, `Hi! 👋 I'm your Fly Masters AI assistant. ${who}.`);
    return;
  }
  // Asking for universities / courses: show real matches right here (a country in the message wins).
  if (UNI_INTENT.test(text)) {
    const profile = studentUserId ? await jsonFind("profiles", "user_id", studentUserId).catch(() => null) : null;
    const known = { ...knownProfile(profile, lead), ...(conversation.intake_answers || {}) };
    const named = text.toLowerCase().split(/[^a-z]+/).map((w) => COUNTRY_ALIASES[w]).find(Boolean);
    const country = named || known.country;
    const unis = country ? (await recommendations({ ...known, country })).slice(0, 4) : [];
    if (unis.length) {
      const list = unis.map((u, i) => `${i + 1}. ${u.name}${u.location ? ` (${u.location})` : ""}${u.ranking && u.ranking !== "University catalogue" ? ` — ${u.ranking}` : ""}`).join("\n");
      await aiSay(conversation, `🎓 Top matches in ${country}:\n${list}\n\nWant fees, intakes or help applying? Tell me which one, and your advisor will confirm the details.`);
      return;
    }
  }
  // Only a bare "ok" / "thanks" / emoji needs no reply — on WhatsApp silence looks like a broken bot.
  if (ACK_ONLY.test(text.trim())) return;
  const routed = await routeToStaff(conversation, owner, messages);
  if (!routed && owner.role === "ai" && text.split(/\s+/).length >= 2) {
    await aiSay(conversation, "Noted 👍 An advisor will reply here soon. Meanwhile, ask me about universities, visas, documents or fees.");
  }
}

// Student events go to the assigned advisor, or Admin's allocation queue.
// Recipient selection is server-side; an unassigned case is never broadcast.
/**
 * Who should hear about something a student did: their assigned counsellor,
 * or every active admin when nobody is assigned yet. One notification per
 * person (it used to be written twice — once in `notifications` and once in
 * `document_notifications` with a different id — which showed up as two
 * entries in the counsellor bell and could not be cleared together).
 */
export async function notifyStaffAboutStudent(studentUserId, lead, { title, message, counselorUrl = "/counselor/chat", adminUrl = null, notificationKey = null }) {
  const counselorId = String(lead?.assigned_counselor_id || "");
  let targets = [];
  if (counselorId && counselorId !== SHARED_COUNSELOR_ID) {
    const directory = await jsonTable("counselors");
    const counselor = directory.find((c) => String(c.id) === counselorId || String(c.auth_user_id || c.user_id) === counselorId);
    const targetId = counselor?.auth_user_id || counselor?.user_id || counselorId;
    const { rows } = await pool.query("SELECT user_id FROM user_roles WHERE user_id = $1 AND role = 'counselor' AND is_active IS DISTINCT FROM false", [targetId]);
    targets = rows.map((r) => String(r.user_id));
  }
  const queuedForAdmin = !targets.length;
  if (queuedForAdmin) {
    const { rows } = await pool.query("SELECT user_id FROM user_roles WHERE role IN ('admin', 'super_admin') AND is_active IS DISTINCT FROM false");
    targets = rows.map((r) => String(r.user_id));
  }
  const now = new Date().toISOString();
  for (const userId of targets) {
    const id = notificationKey ? applicationNotificationId(notificationKey, userId) : crypto.randomUUID();
    await jsonUpsert("notifications", { id, user_id: userId, title, message, type: "info",
      action_url: queuedForAdmin ? (adminUrl || (lead?.id ? `/admin/leads/${lead.id}` : "/admin")) : counselorUrl, is_read: false,
      additional_data: { student_id: studentUserId, lead_id: lead?.id || null, ...(notificationKey ? { event_key: notificationKey } : {}) }, created_at: now });
  }
  return { queuedForAdmin, targets };
}

/**
 * A student wrote in the chat (portal or WhatsApp): the person who owns the
 * case gets a bell notification. One per conversation while unread — later
 * messages update it ("3 new messages") instead of piling up. Nothing is sent
 * while the AI still owns the case; it answers on its own.
 */
async function notifyStaffOfChat(conversation, lead, text) {
  try {
    const owner = await ownerOf(lead);
    if (owner.role === "ai" || !owner.id) return;
    let targetId = owner.id;
    if (owner.role === "counselor") {
      const directory = await jsonTable("counselors");
      const counselor = directory.find((c) => String(c.id) === owner.id || String(c.auth_user_id || c.user_id) === owner.id);
      targetId = counselor?.auth_user_id || counselor?.user_id || owner.id;
    }
    const name = studentNameFromLead(lead);
    const preview = String(text || "").slice(0, 140);
    const now = new Date().toISOString();
    const { rows } = await pool.query(
      `SELECT id, data FROM app_records
        WHERE table_name = 'notifications' AND data->>'user_id' = $1
          AND coalesce(data->>'is_read', 'false') <> 'true'
          AND data->'additional_data'->>'conversation_id' = $2
        LIMIT 1`,
      [String(targetId), String(conversation.id)],
    );
    const existing = rows[0] ? { ...rows[0].data, id: rows[0].id } : null;
    const count = Number(existing?.additional_data?.count || 0) + 1;
    await jsonUpsert("notifications", {
      ...(existing || {}),
      id: existing?.id || crypto.randomUUID(),
      user_id: String(targetId),
      title: count > 1 ? `${count} new messages from ${name}` : `New message from ${name}`,
      message: preview,
      type: "chat",
      category: "chat",
      action_url: owner.role === "telecaller" ? "/telecaller/chat" : "/counselor/chat",
      is_read: false,
      additional_data: { conversation_id: String(conversation.id), lead_id: lead?.id ? String(lead.id) : null, count },
      created_at: now,
      updated_at: now,
    });
  } catch (error) {
    console.error("[case] chat notification failed:", error.message || error);
  }
}

router.post("/api/case/me/notifications", anySession, requireStudent, async (req, res) => {
  try {
    const lead = await leadForStudent(req.user.id);
    if (!lead) return res.status(404).json({ error: "Student case not found." });
    const title = cleanText(req.body?.title).slice(0, 160) || "Student case needs attention";
    const message = cleanText(req.body?.message);
    if (!message) return res.status(400).json({ error: "Notification message required." });
    const { queuedForAdmin } = await notifyStaffAboutStudent(req.user.id, lead, { title, message });
    res.json({ ok: true, queued_for_admin: queuedForAdmin });
  } catch (error) {
    console.error("[case] event notification failed:", error);
    res.status(500).json({ error: "Could not notify the assigned staff." });
  }
});

// ------------------------------------------------------ shortlist decisions
//
// The student no longer runs an application themselves. Every university on
// "My Shortlists" — the counsellor's recommendations and the student's own
// picks — gets a green tick (go ahead) or a red cross (not interested). A
// tick hands it to the counsellor, who starts and runs the application from
// the counsellor portal.

async function studentEmailFor(userId) {
  const { rows } = await pool.query("SELECT email FROM auth_users WHERE id::text = $1", [String(userId)]).catch(() => ({ rows: [] }));
  return String(rows[0]?.email || "").trim().toLowerCase();
}

async function shortlistOwnedBy(userId, shortlistId) {
  const { rows } = await pool.query(
    "SELECT id, data FROM app_records WHERE table_name = 'university_shortlists' AND id = $1",
    [String(shortlistId)],
  );
  if (!rows[0]) return { row: null, owned: false };
  const row = { ...rows[0].data, id: rows[0].id };
  const lead = await leadForStudent(userId);
  const keys = new Set([String(userId), lead?.id ? String(lead.id) : ""].filter(Boolean));
  const email = await studentEmailFor(userId);
  const owned = keys.has(String(row.student_id || ""))
    || Boolean(email && sameMailbox(row.student_email || row.email) === sameMailbox(email));
  return { row, owned, lead };
}

function shortlistLabel(row) {
  return [row.university_name, row.course_name].filter(Boolean).join(" — ") || "a university";
}

// Applications are started by the student's counselor, never by the student:
// a saved or recommended university is only an interest. The student's tick on
// My Shortlists tells the counselor, who starts the application through
// POST /api/counselor/shortlists/:id/start-application. This route is kept only
// so an old browser tab gets a clear answer instead of a silent 404.
router.post("/api/case/me/applications", anySession, requireStudent, (_req, res) => {
  res.status(403).json({ error: "Your counselor starts applications. Tick the university on My Shortlists and they will take it forward." });
});

// A student can only withdraw their own still-open application.  Counselor
// and final-submission status transitions remain counselor-controlled.
router.patch("/api/case/me/applications/:id", anySession, requireStudent, async (req, res) => {
  try {
    if (String(req.body?.status || "") !== "withdrawn") {
      return res.status(403).json({ error: "Students can only withdraw an application." });
    }
    const applications = await jsonTable("applications");
    const application = applications.find((row) => String(row.id) === String(req.params.id));
    if (!application || String(application.user_id || "") !== String(req.user.id)) {
      return res.status(404).json({ error: "Application not found." });
    }
    if (!STUDENT_WITHDRAWABLE.has(String(application.status || ""))) {
      return res.status(409).json({ error: "This application can no longer be withdrawn." });
    }
    const now = new Date().toISOString();
    const updated = { ...application, status: "withdrawn", status_changed_at: now, updated_at: now };
    await jsonUpsert("applications", updated);
    await jsonUpsert("application_status_updates", buildApplicationEvent({
      application: updated, fromStatus: application.status, status: "withdrawn",
      note: "Withdrawn by the student.", actor: { id: req.user.id, role: "student", name: "" }, at: now,
    }));
    const shortlists = await jsonTable("university_shortlists");
    const shortlist = shortlists.find((row) => String(row.id) === String(application.shortlist_id || ""))
      || shortlists.find((row) => String(row.application_id || "") === String(application.id));
    if (shortlist) await jsonUpsert("university_shortlists", shortlistApplicationPatch(shortlist, updated, now));
    const lead = await leadForStudent(req.user.id).catch(() => null);
    await notifyStaffAboutStudent(req.user.id, lead, {
      title: "Student withdrew an application",
      message: `${[lead?.first_name, lead?.last_name].filter(Boolean).join(" ") || "A student"} withdrew the application to ${application.university_name || "a university"}.`,
      counselorUrl: "/counselor/applications",
      notificationKey: `${application.id}:withdrawn`,
    }).catch(() => null);
    res.json({ ok: true, application: updated });
  } catch (error) {
    console.error("[application] withdraw failed:", error);
    res.status(500).json({ error: "Could not withdraw the application." });
  }
});

router.post("/api/case/me/shortlists/:id/decision", anySession, requireStudent, async (req, res) => {
  try {
    const decision = String(req.body?.decision || "");
    if (!["accept", "decline", "undo"].includes(decision)) {
      return res.status(400).json({ error: "Choose accept or decline." });
    }
    const { row, owned, lead } = await shortlistOwnedBy(req.user.id, req.params.id);
    if (!row || !owned) return res.status(404).json({ error: "That shortlist entry was not found." });
    if (String(row.status || "") === "applied") {
      return res.status(409).json({ error: "Your counsellor has already started this application." });
    }
    const now = new Date().toISOString();
    const accepted = decision === "accept";
    const next = {
      ...row,
      student_consent: accepted,
      student_consent_date: accepted ? now : null,
      student_decision: decision === "undo" ? null : decision === "accept" ? "accepted" : "declined",
      student_decision_at: decision === "undo" ? null : now,
      status: accepted ? "consented" : decision === "decline" ? "declined" : "recommended",
      // Withdrawing consent also withdraws a pending "please start my application".
      application_start_requested_at: accepted ? row.application_start_requested_at || null : null,
      updated_at: now,
    };
    await jsonUpsert("university_shortlists", next);
    if (decision !== "undo") {
      const email = await studentEmailFor(req.user.id);
      const who = [lead?.first_name, lead?.last_name].filter(Boolean).join(" ") || email || "A student";
      await notifyStaffAboutStudent(req.user.id, lead, accepted
        ? { title: "Student accepted a university", message: `${who} accepted ${shortlistLabel(row)}. Start the application from Shortlists.`, counselorUrl: "/counselor/shortlists" }
        : { title: "Student declined a university", message: `${who} is not interested in ${shortlistLabel(row)}.`, counselorUrl: "/counselor/shortlists" },
      ).catch((error) => console.error("[shortlist] staff notify failed:", error));
    }
    res.json({ ok: true, shortlist: next });
  } catch (error) {
    console.error("[shortlist] decision failed:", error);
    res.status(500).json({ error: "Could not save your choice." });
  }
});

// What the student may ask of their counselor about a university they have
// agreed to: "please start my application". It records the request and tells
// the counselor — it never creates an application. Only the assigned
// counselor can do that (POST /api/counselor/shortlists/:id/start-application).
router.post("/api/case/me/shortlists/:id/request-application", anySession, requireStudent, async (req, res) => {
  try {
    const { row, owned, lead } = await shortlistOwnedBy(req.user.id, req.params.id);
    if (!row || !owned) return res.status(404).json({ error: "That shortlist entry was not found." });
    if (String(row.status || "") === "applied" || row.application_id) {
      return res.status(409).json({ error: "Your counsellor has already started this application." });
    }
    if (!row.student_consent || String(row.student_decision || "") === "declined" || String(row.status || "") === "declined") {
      return res.status(409).json({ error: "Please give your consent for this university first. Your counselor can start the application once you have." });
    }
    if (row.application_start_requested_at) {
      return res.json({ ok: true, shortlist: row, already: true });
    }
    const now = new Date().toISOString();
    const next = { ...row, application_start_requested_at: now, updated_at: now };
    await jsonUpsert("university_shortlists", next);
    const email = await studentEmailFor(req.user.id);
    const who = [lead?.first_name, lead?.last_name].filter(Boolean).join(" ") || email || "A student";
    await notifyStaffAboutStudent(req.user.id, lead, {
      title: "Student asked to start an application",
      message: `${who} gave consent and asked you to start the application for ${shortlistLabel(row)}.`,
      counselorUrl: "/counselor/shortlists",
    }).catch((error) => console.error("[shortlist] staff notify failed:", error));
    res.json({ ok: true, shortlist: next });
  } catch (error) {
    console.error("[shortlist] application request failed:", error);
    res.status(500).json({ error: "Could not send your request." });
  }
});

const UNIVERSITY_FIELDS = ["id", "name", "country", "city", "state_province", "description", "established_year", "ranking", "university_type", "website_url", "is_tie_up", "logo_url"];
const PROGRAM_FIELDS = ["id", "university_id", "university_name", "program_name", "country", "degree", "course", "specialization", "location", "city", "region", "duration", "fee", "language", "program_description", "eligibility", "career", "deadline"];
const pick = (source, fields) => Object.fromEntries(fields.filter((key) => source?.[key] != null && source[key] !== "").map((key) => [key, source[key]]));
const lowered = (value) => String(value || "").trim().toLowerCase();

/**
 * The real university and programme behind each of this student's shortlist
 * entries, read from the catalogue the counselor chose them from. A shortlist
 * row's university_id is the id of the catalogue programme (or of a
 * `universities` row for a student's own pick); we resolve it, fall back to the
 * exact university name, and otherwise return nothing rather than guess.
 * Only the caller's own entries are resolved.
 */
router.get("/api/case/me/shortlist-details", anySession, requireStudent, async (req, res) => {
  try {
    const lead = await leadForStudent(req.user.id);
    const email = await studentEmailFor(req.user.id);
    const keys = new Set([String(req.user.id), lead?.id ? String(lead.id) : ""].filter(Boolean));
    const mine = (await jsonTable("university_shortlists")).filter((row) =>
      keys.has(String(row.student_id || "")) || (email && sameMailbox(row.student_email || row.email) === sameMailbox(email)));
    if (!mine.length) return res.json({ details: {} });

    const ids = [...new Set(mine.map((row) => String(row.university_id || "")).filter(Boolean))];
    const names = [...new Set(mine.map((row) => lowered(row.university_name)).filter(Boolean))];
    const [programRows, universityRows] = await Promise.all([
      pool.query(
        `SELECT id, data FROM app_records WHERE table_name = 'university_programs'
           AND (id = ANY($1::text[]) OR data->>'university_id' = ANY($1::text[]) OR lower(data->>'university_name') = ANY($2::text[]))`,
        [ids, names],
      ),
      pool.query(
        `SELECT id, data FROM app_records WHERE table_name = 'universities'
           AND (id = ANY($1::text[]) OR lower(data->>'name') = ANY($2::text[]))`,
        [ids, names],
      ),
    ]);
    const programs = programRows.rows.map((r) => ({ ...(r.data || {}), id: r.data?.id || r.id })).filter((r) => r.is_active !== false);
    const universities = universityRows.rows.map((r) => ({ ...(r.data || {}), id: r.data?.id || r.id })).filter((r) => r.is_active !== false);

    const details = {};
    for (const row of mine) {
      const byId = programs.find((program) => String(program.id) === String(row.university_id || ""));
      const course = lowered(row.course_name);
      const byName = !byId
        ? programs.find((program) => lowered(program.university_name) === lowered(row.university_name)
            && lowered(program.program_name) && (course === lowered(program.program_name) || course.startsWith(lowered(program.program_name))))
        : null;
      const program = byId || byName || null;
      const university = universities.find((u) => String(u.id) === String(program?.university_id || row.university_id || ""))
        || universities.find((u) => lowered(u.name) === lowered(row.university_name))
        || null;
      const universityId = String(university?.id || program?.university_id || "");
      const siblings = (universityId || row.university_name)
        ? programs
            .filter((candidate) => (universityId && String(candidate.university_id || "") === universityId)
              || lowered(candidate.university_name) === lowered(row.university_name))
            .slice(0, 40)
            .map((candidate) => pick(candidate, PROGRAM_FIELDS))
        : [];
      details[String(row.id)] = {
        matched_by: byId ? "id" : byName ? "name" : university ? "university" : null,
        university: university ? pick(university, UNIVERSITY_FIELDS) : null,
        program: program ? pick(program, PROGRAM_FIELDS) : null,
        programs: siblings,
      };
    }
    res.json({ details });
  } catch (error) {
    console.error("[shortlist] details failed:", error);
    res.status(500).json({ error: "Could not load the university details." });
  }
});

// A university the student picked themselves (Universities page, or a saved
// one). It lands on the counsellor's Shortlists already accepted.
router.post("/api/case/me/shortlists", anySession, requireStudent, async (req, res) => {
  try {
    const universityName = cleanText(req.body?.university_name).slice(0, 200);
    if (!universityName) return res.status(400).json({ error: "Choose a university." });
    const universityId = cleanText(req.body?.university_id).slice(0, 120) || null;
    const lead = await leadForStudent(req.user.id);
    const email = await studentEmailFor(req.user.id);
    const keys = new Set([String(req.user.id), lead?.id ? String(lead.id) : ""].filter(Boolean));
    const mine = (await jsonTable("university_shortlists")).filter((row) =>
      keys.has(String(row.student_id || "")) || (email && sameMailbox(row.student_email) === sameMailbox(email)));
    const now = new Date().toISOString();
    const existing = mine.find((row) =>
      (universityId && String(row.university_id || "") === universityId)
      || String(row.university_name || "").trim().toLowerCase() === universityName.toLowerCase());
    if (existing && String(existing.status || "") === "applied") {
      return res.json({ ok: true, shortlist: existing, already: true });
    }
    const next = existing
      ? { ...existing, student_consent: true, student_consent_date: now, student_decision: "accepted", student_decision_at: now, status: "consented", updated_at: now }
      : {
          id: crypto.randomUUID(),
          student_id: String(req.user.id),
          student_email: email,
          counselor_id: SHARED_COUNSELOR_ID,
          source: "student",
          university_id: universityId,
          university_name: universityName,
          course_name: cleanText(req.body?.course_name).slice(0, 200),
          location: cleanText(req.body?.location).slice(0, 200),
          counselor_notes: "",
          status: "consented",
          priority_level: "medium",
          student_consent: true,
          student_consent_date: now,
          student_decision: "accepted",
          student_decision_at: now,
          shortlisted_at: now,
          created_at: now,
          updated_at: now,
        };
    await jsonUpsert("university_shortlists", next);
    const who = [lead?.first_name, lead?.last_name].filter(Boolean).join(" ") || email || "A student";
    await notifyStaffAboutStudent(req.user.id, lead, {
      title: "Student shortlisted a university",
      message: `${who} wants to apply to ${shortlistLabel(next)}. Start the application from Shortlists.`,
      counselorUrl: "/counselor/shortlists",
    }).catch((error) => console.error("[shortlist] staff notify failed:", error));
    res.json({ ok: true, shortlist: next });
  } catch (error) {
    console.error("[shortlist] student pick failed:", error);
    res.status(500).json({ error: "Could not add it to your shortlist." });
  }
});

router.post("/api/case/me/messages", anySession, requireStudent, async (req, res) => {
  const text = cleanText(req.body?.message ?? req.body?.text);
  if (!text) return res.status(400).json({ error: "Message cannot be empty." });
  try {
    const lead = await leadForStudent(req.user.id);
    const { owner, conversation } = await prepareThread(req.user.id, lead);
    const sourceId = caseMessageSourceId("student", req.user.id, req.body?.client_message_id);
    const existing = sourceId && (await rawMessages(conversation.id)).find((m) => m.source_id === sourceId);
    if (existing) {
      if (existing.body !== text) return res.status(409).json({ error: "This retry id was already used for a different message." });
      return res.json({ owner, intake_complete: Boolean(conversation.intake_complete), messages: [publicMessage(existing)] });
    }
    const before = new Set((await rawMessages(conversation.id)).map((m) => m.id));
    const message = await addMessage(conversation, { senderRole: "student", senderId: req.user.id, body: text, sourceId });
    void notifyStaffOfChat(conversation, lead, text);
    await handleStudentMessage(conversation, req.user.id, lead, owner, text);
    await patchConversation(conversation, { student_last_read_at: new Date().toISOString() });
    const newMessages = (await rawMessages(conversation.id)).filter((m) => !before.has(m.id));
    await deliverToWhatsApp(conversation, newMessages);
    const created = [message, ...newMessages.filter((m) => m.id !== message.id)].map((m) => publicMessage(m));
    res.json({ owner, intake_complete: Boolean(conversation.intake_complete), messages: created });
  } catch (error) {
    console.error("[case] send failed:", error);
    res.status(500).json({ error: "Could not send your message." });
  }
});

// -------------------------------------------------------------------- staff

router.get("/api/case/inbox", anySession, requireStaff, scopeBranchHead, async (req, res) => {
  try {
    const role = req.user.role;
    let leads;
    if (role === ROLES.TELECALLER) {
      leads = await rowsWhere("student_leads", "assigned_telecaller_id", req.user.id);
    } else if (role === ROLES.COUNSELOR) {
      const aliases = [...(await counselorAliases(req.user))];
      const asCounselor = await rowsWhere("student_leads", "assigned_counselor_id", aliases);
      const asTelecaller = await rowsWhere("student_leads", "assigned_telecaller_id", aliases);
      leads = [...new Map([...asCounselor, ...asTelecaller].map((l) => [String(l.id), l])).values()];
    } else {
      const all = await jsonTable("case_conversations");
      const byUser = await rowsWhere("student_leads", "user_id", all.map((c) => c.student_user_id));
      const byId = await rowsWhere("student_leads", "id", all.filter((c) => !c.student_user_id).map((c) => c.lead_id));
      leads = [...new Map([...byUser, ...byId].map((l) => [String(l.id), l])).values()];
      if (role === ROLES.BRANCH_HEAD && !req.scope?.allBranches) {
        const allowed = new Set((req.scope?.branchIds || []).map(String));
        leads = leads.filter((l) => allowed.has(String(l.branch_id || "")));
      }
    }

    const convs = [
      ...(await rowsWhere("case_conversations", "student_user_id", leads.map((l) => l.user_id))),
      ...(await rowsWhere("case_conversations", "lead_id", leads.map((l) => l.id))).filter((c) => !c.student_user_id),
    ];
    const convFor = (lead) =>
      (lead.user_id && convs.find((c) => String(c.student_user_id) === String(lead.user_id)))
      || convs.find((c) => !c.student_user_id && String(c.lead_id) === String(lead.id));
    // Portal accounts always have a thread (it opens on first visit); a lead
    // without an account appears once they message on WhatsApp.
    leads = leads.filter((l) => l.user_id || convFor(l));
    const msgs = await rowsWhere("case_messages", "conversation_id", convs.map((c) => c.id));
    const byConv = new Map();
    for (const m of msgs) {
      const list = byConv.get(String(m.conversation_id)) || [];
      list.push(m);
      byConv.set(String(m.conversation_id), list);
    }

    const items = await Promise.all(leads.map(async (lead) => {
      const conv = convFor(lead);
      // A portal student can also have a separate WhatsApp thread from a
      // number never verified for their account; it is shown in the same
      // conversation (one person, one chat) and flagged.
      const side = sideThreads(convs, lead, conv);
      const readAt = String(conv?.staff_last_read_at || "");
      const list = [conv, ...side].filter(Boolean).flatMap((c) => byConv.get(String(c.id)) || []);
      list.sort((a, b) => sentAt(a).localeCompare(sentAt(b)));
      const last = list[list.length - 1];
      const unverifiedSide = side.some((c) => !numberVerifiedForLead(lead, c.whatsapp_phone));
      return {
        lead_id: String(lead.id),
        student_user_id: lead.user_id ? String(lead.user_id) : null,
        student_name: studentNameFromLead(lead),
        channel: conv?.whatsapp_phone || side.length ? "whatsapp" : "app",
        // A portal student's WhatsApp number that was never OTP-verified:
        // replies stay in the app until they verify it.
        whatsapp_unverified: unverifiedSide || (Boolean(conv?.whatsapp_phone) && !(await whatsappTrusted(conv))),
        owner: await ownerOf(lead),
        last_message: last ? { body: last.body, sender_role: last.sender_role, created_at: sentAt(last) } : null,
        last_message_at: last ? sentAt(last) : null,
        unread: list.filter((m) => m.sender_role === "student"
          && sentAt(m) > String((m.conversation_id === conv?.id ? readAt : convs.find((c) => c.id === m.conversation_id)?.staff_last_read_at) || "")).length,
        needs_review: list.filter((m) => m.source === "faq" && m.review_status === "pending").length,
      };
    }));
    items.sort((a, b) => String(b.last_message_at || "").localeCompare(String(a.last_message_at || "")));
    res.json({ conversations: items, ai_enabled: geminiConfigured() });
  } catch (error) {
    console.error("[case] inbox failed:", error);
    res.status(500).json({ error: "Could not load conversations." });
  }
});

/** WhatsApp threads of this lead other than its main one (a number not tied to the account). */
function sideThreads(convs, lead, main) {
  if (!lead?.user_id) return [];
  return convs.filter((c) => !c.student_user_id && String(c.lead_id) === String(lead.id)
    && c.whatsapp_phone && String(c.id) !== String(main?.id || ""));
}

function numberVerifiedForLead(lead, phone) {
  const digits = normalizeWaPhone(phone);
  return Boolean(digits) && (lead?.whatsapp_verified === true || lead?.whatsapp_verified === "true")
    && normalizeWaPhone(lead?.whatsapp_number || lead?.phone) === digits;
}

async function staffLead(req, res) {
  const lead = await leadById(req.params.leadId);
  if (!lead || !(await canStaffAccess(req, lead))) {
    res.status(404).json({ error: "Conversation not found." });
    return null;
  }
  return lead;
}

router.get("/api/case/lead/:leadId", anySession, requireStaff, scopeBranchHead, async (req, res) => {
  try {
    const lead = await staffLead(req, res);
    if (!lead) return;
    const { owner, conversation } = await prepareThread(lead.user_id || null, lead);
    const readNow = new Date().toISOString();
    await patchConversation(conversation, { staff_last_read_at: readNow });
    const side = sideThreads(await rowsWhere("case_conversations", "lead_id", lead.id), lead, conversation);
    for (const c of side) await patchConversation(c, { staff_last_read_at: readNow });
    const sideMessages = (await Promise.all(side.map((c) => rawMessages(c.id)))).flat();
    const unverifiedSide = side.find((c) => !numberVerifiedForLead(lead, c.whatsapp_phone));
    const profile = lead.user_id ? await jsonFind("profiles", "user_id", lead.user_id).catch(() => null) : null;
    res.json({
      conversation_id: conversation.id,
      owner,
      whatsapp: unverifiedSide
        ? { phone: unverifiedSide.whatsapp_phone, last_inbound_at: unverifiedSide.whatsapp_last_inbound_at || null, verified: false }
        : conversation.whatsapp_phone
          ? {
              phone: conversation.whatsapp_phone,
              last_inbound_at: conversation.whatsapp_last_inbound_at || null,
              verified: await whatsappTrusted(conversation),
            }
          : null,
      student: { lead_id: String(lead.id), user_id: lead.user_id ? String(lead.user_id) : null, name: studentNameFromLead(lead), email: lead.email || "", phone: lead.phone || "" },
      known: knownProfile(profile, lead),
      // Answers that wouldn't pass today's checks (e.g. a bare "32" budget
      // from before): shown to staff as "check this" instead of fact.
      unclear: (() => {
        const k = knownProfile(profile, lead);
        const out = {};
        if (k.score && validateScore(k.score).error) out.score = true;
        if (k.budget && validateBudget(k.budget).error) out.budget = true;
        return out;
      })(),
      messages: [...(await rawMessages(conversation.id)), ...sideMessages]
        .sort((a, b) => sentAt(a).localeCompare(sentAt(b)) || String(a.seq || 0).localeCompare(String(b.seq || 0)))
        .map((m) => publicMessage(m, { staff: true })),
    });
  } catch (error) {
    console.error("[case] staff load failed:", error);
    res.status(500).json({ error: "Could not load the conversation." });
  }
});

/** Once a lead is converted the chat belongs to the counselor and admin; the telecaller can read it but not reply. */
function telecallerLocked(req, lead) {
  return req.user.role === ROLES.TELECALLER && (lead.entity_type === "student" || lead.lead_status === "converted");
}

function staffSenderRole(role) {
  return role === ROLES.COUNSELOR || role === ROLES.TELECALLER ? role : "admin";
}

router.post("/api/case/lead/:leadId/messages", anySession, requireStaff, scopeBranchHead, async (req, res) => {
  const text = cleanText(req.body?.message ?? req.body?.text);
  if (!text) return res.status(400).json({ error: "Message cannot be empty." });
  try {
    const lead = await staffLead(req, res);
    if (!lead) return;
    if (telecallerLocked(req, lead)) {
      return res.status(403).json({ error: "This student has been converted, so the chat now belongs to the counselor and admin." });
    }
    const conversation = await conversationFor(lead.user_id || null, lead.id);
    const senderRole = staffSenderRole(req.user.role);
    const sourceId = caseMessageSourceId(senderRole, req.user.id, req.body?.client_message_id);
    const existing = sourceId && (await rawMessages(conversation.id)).find((m) => m.source_id === sourceId);
    if (existing) {
      if (existing.body !== text) return res.status(409).json({ error: "This retry id was already used for a different message." });
      return res.json({ message: publicMessage(existing, { staff: true }) });
    }
    const message = await addMessage(conversation, {
      senderRole,
      senderId: req.user.id,
      senderName: await personName(req.user.id, senderRole === "admin" ? "Fly Masters" : senderRole),
      body: text,
      sourceId,
    });
    await patchConversation(conversation, { staff_last_read_at: new Date().toISOString() });
    await deliverToWhatsApp(conversation, [message]);
    res.json({ message: publicMessage(message, { staff: true }) });
  } catch (error) {
    console.error("[case] staff send failed:", error);
    res.status(500).json({ error: "Could not send the message." });
  }
});

/** Approve an AI FAQ answer as-is, or correct its text. The student sees the correction. */
router.post("/api/case/lead/:leadId/messages/:messageId/review", anySession, requireStaff, scopeBranchHead, async (req, res) => {
  try {
    const lead = await staffLead(req, res);
    if (!lead) return;
    const action = String(req.body?.action || "");
    if (!["approve", "correct"].includes(action)) return res.status(400).json({ error: "action must be approve or correct" });
    const { rows } = await pool.query(
      "SELECT id, data FROM app_records WHERE table_name = 'case_messages' AND id = $1",
      [String(req.params.messageId)],
    );
    const msg = rows[0] ? { ...rows[0].data, id: rows[0].id } : null;
    const conversation = await conversationFor(lead.user_id || null, lead.id);
    if (!msg || msg.conversation_id !== conversation.id || msg.sender_role !== "ai") {
      return res.status(404).json({ error: "Message not found." });
    }
    const reviewer = await personName(req.user.id, "Fly Masters");
    const patch = { id: msg.id, reviewed_by: req.user.id, reviewed_by_name: reviewer, reviewed_at: new Date().toISOString() };
    if (action === "approve") {
      patch.review_status = "approved";
    } else {
      const body = cleanText(req.body?.body);
      if (!body) return res.status(400).json({ error: "Corrected text cannot be empty." });
      patch.review_status = "corrected";
      patch.original_body = msg.original_body || msg.body;
      patch.body = body;
    }
    const saved = await jsonUpsert("case_messages", patch);
    // The wrong answer already reached WhatsApp, so the correction goes there too.
    if (action === "correct") {
      await deliverToWhatsApp(conversation, [{ ...saved, body: `Correction from ${reviewer} (Fly Masters): ${saved.body}` }]);
    }
    res.json({ message: publicMessage(saved, { staff: true }) });
  } catch (error) {
    console.error("[case] review failed:", error);
    res.status(500).json({ error: "Could not save the review." });
  }
});

export default router;
