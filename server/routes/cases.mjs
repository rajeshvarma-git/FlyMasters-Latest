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
import crypto from "crypto";
import { pool, jsonTable, jsonFind, jsonUpsert } from "../lib/db.mjs";
import { anySession, branchScope, ROLES } from "../lib/auth.mjs";
import { geminiJson, geminiConfigured } from "../lib/gemini.mjs";
import { sendWhatsAppText, sendWhatsAppOutreach, outreachTemplateName, outreachButtonText, whatsappSendConfigured, normalizeWaPhone } from "../lib/waSend.mjs";

const router = express.Router();

const SHARED_COUNSELOR_ID = "local-counselor-1";
const STAFF_ROLES = new Set([
  ROLES.SUPER_ADMIN, ROLES.ADMIN, ROLES.BRANCH_HEAD, ROLES.COUNSELOR, ROLES.TELECALLER,
]);
const ADMIN_ROLES = new Set([ROLES.SUPER_ADMIN, ROLES.ADMIN]);
const MAX_MESSAGE = 2000;
const AI_NAME = "AI Advisor";

// ------------------------------------------------------------ intake steps

// Same questions (and order) as the old AI wizard in chatContext.ts.
const STEPS = [
  { key: "country", ask: "Which country would you love to study in? (For example: USA, UK, Canada, Australia, Germany, or Nepal)" },
  { key: "qualification", ask: "What is your highest qualification? (for example 12th, Bachelor's, or Master's)" },
  { key: "field", ask: "Which field or program are you most interested in? (for example Computer Science, Business, or Nursing)" },
  { key: "score", ask: "What is your academic score — percentage or GPA?" },
  { key: "budget", ask: "What is your estimated study budget? (for example 20 lakhs or $25,000)" },
];

const ACK = {
  country: (v) => `Great choice — ${v}!`,
  qualification: (v) => `Got it, ${v}.`,
  field: (v) => `${v} is a strong path.`,
  score: (v) => `Thanks, ${v} noted.`,
  budget: (v) => `Budget noted: ${v}.`,
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

function validateBudget(t) {
  const n = firstNumber(t);
  const example = "for example 20 lakhs, ₹15,00,000, or $25,000";
  if (!Number.isFinite(n) || n <= 0) return { error: `Please enter your budget with an amount (${example}).` };
  if (/lakh|lac|crore|\bcr\b|\bk\b|thousand|\$|usd|₹|inr|\brs\.?|rupee|€|eur|£|gbp|aud|cad|nzd|\d\s*[lk]\b/i.test(t)) return { value: t };
  if (n >= 10000) return { value: t };
  return { error: `Is that ${n} lakhs? Please add the unit, like "${n} lakhs" or "$${n},000" (${example}).` };
}

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

async function leadForStudent(userId) {
  const leads = await rowsWhere("student_leads", "user_id", userId);
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

async function conversationFor(studentUserId, leadId) {
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
    const byLead = (await rowsWhere("case_conversations", "lead_id", leadId)).find((c) => !c.student_user_id);
    if (byLead) {
      if (studentUserId) return jsonUpsert("case_conversations", { id: byLead.id, student_user_id: String(studentUserId) });
      return byLead;
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
async function finishIntake(conversation, known, once = null) {
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
    await finishIntake(conversation, known, `${once}:finish`);
    return;
  }
  await aiSay(conversation, `${greeting}${note}\n\n${step.ask}`, { sourceId: once });
  await patchConversation(conversation, { intake_field: step.key, intake_complete: false });
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
    const body = owner.role === "telecaller"
      ? `📞 ${owner.name} from Fly Masters has been assigned to you and will assist you further. They may call you on your registered number.`
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
async function prepareThread(studentUserId, lead) {
  const owner = await ownerOf(lead);
  const conversation = await conversationFor(studentUserId, lead?.id);
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

/**
 * Sends the non-student messages among `rows` to the student's WhatsApp,
 * if this conversation is on WhatsApp and the 24-hour window is open.
 * Each message records the outcome (wa_status) so staff can see it.
 */
async function deliverToWhatsApp(conversation, rows) {
  const to = conversation.whatsapp_phone;
  if (!to || !rows.length) return;
  const windowOpen = whatsappWindowOpen(conversation.whatsapp_last_inbound_at);
  for (const row of rows) {
    if (!row || row.sender_role === "student" || !String(row.body || "").trim()) continue;
    let patch;
    if (!whatsappSendConfigured()) patch = { wa_status: "not_configured" };
    else if (!windowOpen && !outreachTemplateName()) patch = { wa_status: "window_closed" };
    else if (!windowOpen) {
      // Window closed: reach the student with the approved template instead.
      try {
        const lead = conversation.lead_id ? await leadById(conversation.lead_id) : null;
        const first = String(lead?.first_name || "").trim();
        patch = { wa_status: "accepted", wa_via: "template", wa_message_id: await sendWhatsAppOutreach(to, first, whatsappText(row)) };
      } catch (error) {
        console.error("[case-wa] template send failed:", error.message || error);
        patch = { wa_status: "window_closed", wa_error: String(error.message || error).slice(0, 200) };
      }
    } else {
      try {
        patch = { wa_status: "accepted", wa_message_id: await sendWhatsAppText(to, whatsappText(row)) };
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
  const isNewLead = !lead;
  if (!lead) lead = await createWhatsAppLead(phone, contactName, userId);
  if (lead.user_id) userId = lead.user_id;
  if (!lead.whatsapp_number) {
    await jsonUpsert("student_leads", { id: lead.id, whatsapp_number: phone });
    lead.whatsapp_number = phone;
  }

  const conversation = await conversationFor(userId || null, lead.id);
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

  // A brand-new conversation's reply is the intake greeting and first question.
  const { owner, conversation: thread } = await prepareThread(userId || null, lead);
  // (With a person already assigned there is no intake, so the message is handled normally.)
  if (!fresh || owner.role !== "ai") await handleStudentMessage(thread, userId || null, lead, owner, text);

  const created = (await rawMessages(thread.id)).filter((m) => !before.has(m.id));
  const replies = created.filter((m) => m.sender_role !== "system" && m.sender_role !== "student");
  await deliverToWhatsApp(thread, replies);
  const counts = replies.reduce((acc, m) => ({ ...acc, [m.wa_status || "?"]: (acc[m.wa_status || "?"] || 0) + 1 }), {});
  const summary = [
    isNewLead ? "new lead created" : `existing ${userId ? "student" : "lead"}`,
    replies.length
      ? `replies: ${Object.entries(counts).map(([k, v]) => `${v} ${k}`).join(", ")}`
      : `no reply needed (now with ${owner.role === "ai" ? "AI" : owner.name})`,
  ].join(" · ");
  return { leadId: String(lead.id), summary };
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
    const assigned = String(lead.assigned_counselor_id || "");
    if (!assigned) return false;
    return (await counselorAliases(req.user)).has(assigned);
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
    const lead = await leadForStudent(req.user.id);
    const { owner, conversation } = await prepareThread(req.user.id, lead);
    await patchConversation(conversation, { student_last_read_at: new Date().toISOString() });
    res.json({
      conversation_id: conversation.id,
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
    const missing = STEPS.filter((s) => !String(known[s.key] || "").trim()).map((s) => LABELS[s.key]);
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
  if (resumeTap || attachment) {
    const step = !conversation.intake_complete && conversation.intake_field ? STEPS.find((s) => s.key === conversation.intake_field) : null;
    const who = owner.role === "ai"
      ? "Ask me about universities, visas, documents or fees"
      : `${owner.name}, your ${owner.role}, will reply here`;
    if (resumeTap) {
      await aiSay(conversation, step ? `Welcome back! 👋 Let's continue.\n\n${step.ask}` : `Welcome back! 👋 ${who}.`);
    } else {
      const note = "I can only read text messages on WhatsApp. To share documents, please upload them in the Documents section of your Fly Masters student portal.";
      await aiSay(conversation, step ? `${note}\n\n${step.ask}` : `${note} ${owner.role === "ai" ? "" : `${owner.name} can see your message.`}`.trim());
      if (owner.role !== "ai") await routeToStaff(conversation, owner, await rawMessages(conversation.id));
    }
    return;
  }
  // 1. Still in the guided questions.
  if (!conversation.intake_complete && conversation.intake_field) {
    const step = STEPS.find((s) => s.key === conversation.intake_field) || STEPS[0];
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
      await finishIntake(conversation, known);
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
    await aiSay(conversation, `Hi! 👋 ${who}.`);
    return;
  }
  if (!looksLikeQuestion(text) && text.split(/\s+/).length < 4) return;
  await routeToStaff(conversation, owner, messages);
}

// Student events go to the assigned advisor, or Admin's allocation queue.
// Recipient selection is server-side; an unassigned case is never broadcast.
router.post("/api/case/me/notifications", anySession, requireStudent, async (req, res) => {
  try {
    const lead = await leadForStudent(req.user.id);
    if (!lead) return res.status(404).json({ error: "Student case not found." });
    const counselorId = String(lead.assigned_counselor_id || "");
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
    const title = cleanText(req.body?.title).slice(0, 160) || "Student case needs attention";
    const message = cleanText(req.body?.message);
    if (!message) return res.status(400).json({ error: "Notification message required." });
    const now = new Date().toISOString();
    for (const userId of targets) {
      await jsonUpsert("notifications", { id: crypto.randomUUID(), user_id: userId, title, message, type: "info",
        action_url: queuedForAdmin ? `/admin/leads/${lead.id}` : "/counselor/student-chat", is_read: false,
        additional_data: { student_id: req.user.id, lead_id: lead.id }, created_at: now });
      await jsonUpsert("document_notifications", { id: crypto.randomUUID(), user_id: userId, title, message,
        notification_type: "info", is_read: false, additional_data: { student_id: req.user.id, lead_id: lead.id }, created_at: now });
    }
    res.json({ ok: true, queued_for_admin: queuedForAdmin });
  } catch (error) {
    console.error("[case] event notification failed:", error);
    res.status(500).json({ error: "Could not notify the assigned staff." });
  }
});

router.post("/api/case/me/messages", anySession, requireStudent, async (req, res) => {
  const text = cleanText(req.body?.message ?? req.body?.text);
  if (!text) return res.status(400).json({ error: "Message cannot be empty." });
  try {
    const lead = await leadForStudent(req.user.id);
    const { owner, conversation } = await prepareThread(req.user.id, lead);
    const before = new Set((await rawMessages(conversation.id)).map((m) => m.id));
    await addMessage(conversation, { senderRole: "student", senderId: req.user.id, body: text });
    await handleStudentMessage(conversation, req.user.id, lead, owner, text);
    await patchConversation(conversation, { student_last_read_at: new Date().toISOString() });
    const newMessages = (await rawMessages(conversation.id)).filter((m) => !before.has(m.id));
    await deliverToWhatsApp(conversation, newMessages);
    const created = newMessages.map((m) => publicMessage(m));
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
      leads = await rowsWhere("student_leads", "assigned_counselor_id", [...(await counselorAliases(req.user))]);
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
      const list = (conv && byConv.get(String(conv.id))) || [];
      list.sort((a, b) => sentAt(a).localeCompare(sentAt(b)));
      const last = list[list.length - 1];
      const readAt = String(conv?.staff_last_read_at || "");
      return {
        lead_id: String(lead.id),
        student_user_id: lead.user_id ? String(lead.user_id) : null,
        student_name: studentNameFromLead(lead),
        channel: conv?.whatsapp_phone ? "whatsapp" : "app",
        owner: await ownerOf(lead),
        last_message: last ? { body: last.body, sender_role: last.sender_role, created_at: sentAt(last) } : null,
        last_message_at: last ? sentAt(last) : null,
        unread: list.filter((m) => m.sender_role === "student" && sentAt(m) > readAt).length,
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
    await patchConversation(conversation, { staff_last_read_at: new Date().toISOString() });
    const profile = lead.user_id ? await jsonFind("profiles", "user_id", lead.user_id).catch(() => null) : null;
    res.json({
      conversation_id: conversation.id,
      owner,
      whatsapp: conversation.whatsapp_phone
        ? { phone: conversation.whatsapp_phone, last_inbound_at: conversation.whatsapp_last_inbound_at || null }
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
      messages: (await rawMessages(conversation.id)).map((m) => publicMessage(m, { staff: true })),
    });
  } catch (error) {
    console.error("[case] staff load failed:", error);
    res.status(500).json({ error: "Could not load the conversation." });
  }
});

function staffSenderRole(role) {
  return role === ROLES.COUNSELOR || role === ROLES.TELECALLER ? role : "admin";
}

router.post("/api/case/lead/:leadId/messages", anySession, requireStaff, scopeBranchHead, async (req, res) => {
  const text = cleanText(req.body?.message ?? req.body?.text);
  if (!text) return res.status(400).json({ error: "Message cannot be empty." });
  try {
    const lead = await staffLead(req, res);
    if (!lead) return;
    const conversation = await conversationFor(lead.user_id || null, lead.id);
    const senderRole = staffSenderRole(req.user.role);
    const message = await addMessage(conversation, {
      senderRole,
      senderId: req.user.id,
      senderName: await personName(req.user.id, senderRole === "admin" ? "Fly Masters" : senderRole),
      body: text,
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
