/**
 * One conversation per student — the "case chat".
 *
 * AI advisor → telecaller → counselor all write into the same thread
 * (case_conversations + case_messages, JSONB in app_records, no migration).
 * The student never picks who to message: whoever currently owns the lead
 * answers.
 *
 *   owner = assigned counselor  ?  counselor
 *         : assigned telecaller ?  telecaller
 *         : AI advisor (Gemini)
 *
 * The AI only replies while it owns the case. Once a telecaller or counselor
 * is assigned, they see the full history (AI included) and reply here.
 *
 * Older chat stores (private_messages, telecaller_messages, ai_chat_messages,
 * whatsapp_messages) are copied into the thread when it is opened, keyed by
 * source_id, so nothing said before this existed is lost and anything a
 * staff member still sends from an old screen still reaches the student.
 */
import express from "express";
import crypto from "crypto";
import { pool, jsonTable, jsonFind, jsonUpsert } from "../lib/db.mjs";
import { anySession, branchScope, ROLES } from "../lib/auth.mjs";
import { geminiChat, geminiConfigured } from "../lib/gemini.mjs";

const router = express.Router();

const SHARED_COUNSELOR_ID = "local-counselor-1";
const STAFF_ROLES = new Set([
  ROLES.SUPER_ADMIN, ROLES.ADMIN, ROLES.BRANCH_HEAD, ROLES.COUNSELOR, ROLES.TELECALLER,
]);
const ADMIN_ROLES = new Set([ROLES.SUPER_ADMIN, ROLES.ADMIN]);
const HISTORY_FOR_AI = 30;
const MAX_MESSAGE = 2000;
const AI_FALLBACK =
  "Thanks, I've noted that. Someone from the Fly Masters team will reply here shortly.";

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
  if (counselorId) {
    const name = counselorId === SHARED_COUNSELOR_ID ? "Your Counselor" : await personName(counselorId, "Your Counselor");
    return { role: "counselor", id: counselorId, name };
  }
  const telecallerId = lead?.assigned_telecaller_id ? String(lead.assigned_telecaller_id) : "";
  if (telecallerId) {
    return { role: "telecaller", id: telecallerId, name: await personName(telecallerId, "Your Advisor") };
  }
  return { role: "ai", id: null, name: "AI Advisor" };
}

async function conversationFor(studentUserId, leadId) {
  const existing = (await rowsWhere("case_conversations", "student_user_id", studentUserId))[0];
  if (existing) {
    if (leadId && String(existing.lead_id || "") !== String(leadId)) {
      return jsonUpsert("case_conversations", { id: existing.id, lead_id: String(leadId) });
    }
    return existing;
  }
  const now = new Date().toISOString();
  // Deterministic id: two requests racing to create it land on the same row.
  return jsonUpsert("case_conversations", {
    id: `case-${studentUserId}`,
    student_user_id: String(studentUserId),
    lead_id: leadId ? String(leadId) : null,
    created_at: now,
    last_message_at: now,
    staff_last_read_at: null,
    student_last_read_at: null,
  });
}

async function loadMessages(conversationId) {
  const rows = await rowsWhere("case_messages", "conversation_id", conversationId);
  rows.sort((a, b) => sentAt(a).localeCompare(sentAt(b)));
  return rows.map(publicMessage);
}

// jsonUpsert keeps created_at in its own column (insert time), so the time a
// message was actually sent — which differs for imported history — is sent_at.
function sentAt(row) {
  return String(row.sent_at || row.created_at || (row._created_at ? new Date(row._created_at).toISOString() : ""));
}

function publicMessage(row) {
  return {
    id: row.id,
    conversation_id: row.conversation_id,
    sender_role: row.sender_role,
    sender_id: row.sender_id || null,
    sender_name: row.sender_name || null,
    body: row.body,
    channel: row.channel || "app",
    created_at: sentAt(row),
  };
}

async function addMessage(conversation, { senderRole, senderId = null, senderName = null, body, channel = "app", sourceId = null, createdAt = null }) {
  const created_at = createdAt || new Date().toISOString();
  // Imported rows get an id derived from their source so a repeat or racing
  // import overwrites instead of duplicating.
  const id = sourceId
    ? `cm-${crypto.createHash("sha1").update(sourceId).digest("hex")}`
    : crypto.randomUUID();
  const row = await jsonUpsert("case_messages", {
    id,
    conversation_id: String(conversation.id),
    sender_role: senderRole,
    sender_id: senderId ? String(senderId) : null,
    sender_name: senderName,
    body: String(body).slice(0, MAX_MESSAGE * 2),
    channel,
    source_id: sourceId,
    sent_at: created_at,
  });
  if (!conversation.last_message_at || created_at > String(conversation.last_message_at)) {
    await jsonUpsert("case_conversations", { id: conversation.id, last_message_at: created_at });
    conversation.last_message_at = created_at;
  }
  return publicMessage(row);
}

// ------------------------------------------------------- import older stores

async function importLegacy(conversation, studentUserId) {
  const existing = await rowsWhere("case_messages", "conversation_id", conversation.id);
  const seen = new Set(existing.map((m) => m.source_id).filter(Boolean));
  const incoming = [];

  const privConvs = await rowsWhere("private_conversations", "student_id", studentUserId);
  const privMsgs = await rowsWhere("private_messages", "conversation_id", privConvs.map((c) => c.id));
  for (const m of privMsgs) {
    const mine = String(m.sender_id) === String(studentUserId);
    incoming.push({ sourceId: `private_messages:${m.id}`, senderRole: mine ? "student" : "counselor", senderId: m.sender_id, body: m.message, createdAt: m.created_at || m._created_at });
  }

  const teleConvs = await rowsWhere("telecaller_conversations", "student_id", studentUserId);
  const teleMsgs = await rowsWhere("telecaller_messages", "conversation_id", teleConvs.map((c) => c.id));
  for (const m of teleMsgs) {
    const mine = String(m.sender_id) === String(studentUserId);
    incoming.push({ sourceId: `telecaller_messages:${m.id}`, senderRole: mine ? "student" : "telecaller", senderId: m.sender_id, body: m.message, createdAt: m.created_at || m._created_at });
  }

  const aiMsgs = await rowsWhere("ai_chat_messages", "user_id", studentUserId);
  for (const m of aiMsgs) {
    incoming.push({ sourceId: `ai_chat_messages:${m.id}`, senderRole: m.role === "user" ? "student" : "ai", body: m.content, createdAt: m.created_at || m._created_at });
  }

  const waConvs = await rowsWhere("whatsapp_conversations", "user_id", studentUserId);
  const waMsgs = await rowsWhere("whatsapp_messages", "conversation_id", waConvs.map((c) => c.id));
  for (const m of waMsgs) {
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
  for (const item of incoming) {
    if (seen.has(item.sourceId) || !String(item.body || "").trim()) continue;
    let senderName = null;
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
  }
}

// --------------------------------------------------------------- AI advisor

function firstOf(value) {
  if (Array.isArray(value)) return value.find(Boolean) || "";
  return value || "";
}

function budgetFromNotes(notes) {
  const matches = [...String(notes || "").matchAll(/Study budget \(AI chat\):\s*(.+)/g)];
  return matches.length ? matches[matches.length - 1][1].trim() : "";
}

function knownProfile(profile, lead) {
  const prefs = lead?.preferences || {};
  return {
    name: studentNameFromLead(lead, "") || profile?.full_name || profile?.first_name || "",
    country: firstOf(lead?.preferred_countries) || firstOf(profile?.interested_countries) || firstOf(prefs.interested_countries),
    qualification: lead?.current_qualification || lead?.qualification_level || profile?.degree_level || "",
    field: lead?.field_of_interest || profile?.course_preferences || "",
    score: lead?.academic_score || "",
    budget: profile?.study_budget || prefs.study_budget || budgetFromNotes(profile?.student_notes) || budgetFromNotes(lead?.notes),
    intake: prefs.intake || "",
  };
}

async function partnerUniversities(country) {
  if (!country) return [];
  const wanted = String(country).toLowerCase();
  const rows = await jsonTable("universities").catch(() => []);
  return rows
    .filter((u) => u.is_active !== false && String(u.country || "").toLowerCase().includes(wanted))
    .slice(0, 12)
    .map((u) => [u.name, u.city].filter(Boolean).join(" — "));
}

function systemPrompt(known, universities) {
  const facts = Object.entries(known)
    .filter(([, v]) => String(v || "").trim())
    .map(([k, v]) => `- ${k}: ${v}`)
    .join("\n") || "- nothing yet";
  const uniList = universities.length ? universities.map((u) => `- ${u}`).join("\n") : "- (none on file for this country)";
  return `You are the Fly Masters AI study-abroad advisor, chatting with a student inside the Fly Masters app. Fly Masters is an Indian study-abroad consultancy with human telecallers and counselors who take over after you.

Your job:
1. Answer the student's questions helpfully and briefly.
2. Collect, ONE question at a time, whatever is still missing from: destination country, highest qualification, field/course, academic score, study budget, intended intake. NEVER ask again for something listed under "Already known".
3. Once country and field are known, you may suggest 3-5 universities, ONLY from the partner list below. If the list is empty, say a counselor will build a shortlist.

Rules:
- Max about 90 words. Plain text, no markdown tables, friendly and clear.
- Do not invent fees, deadlines, scholarships, rankings or visa outcomes; say a counselor will confirm specifics.
- You are an AI; never claim to be human. If the student wants a call or a person, say a Fly Masters advisor will reach out soon.
- Reply in the same language the student writes in.
- In "profile", return only values the student has stated in this conversation (latest value wins); leave the rest empty.

Already known about this student:
${facts}

Partner universities for their country:
${uniList}`;
}

function aiHistory(messages) {
  return messages.slice(-HISTORY_FOR_AI).map((m) => {
    if (m.sender_role === "student") return { role: "user", text: m.body };
    if (m.sender_role === "ai") return { role: "model", text: m.body };
    return { role: "model", text: `[${m.sender_name || m.sender_role}, Fly Masters ${m.sender_role}]: ${m.body}` };
  });
}

function mergeList(existing, value) {
  const list = Array.isArray(existing) ? existing.map(String) : existing ? [String(existing)] : [];
  if (value && !list.some((v) => v.toLowerCase() === String(value).toLowerCase())) list.unshift(String(value));
  return list;
}

/** Writes what the AI learned back to the profile + lead so staff see it and nobody re-asks. */
async function saveLearned(studentUserId, lead, learned) {
  if (!Object.keys(learned).length) return;
  const now = new Date().toISOString();
  const profile = await jsonFind("profiles", "user_id", studentUserId).catch(() => null);
  if (profile) {
    const patch = { id: profile.id, updated_at: now };
    if (learned.budget) patch.study_budget = learned.budget;
    if (learned.field) patch.course_preferences = learned.field;
    if (learned.country) patch.interested_countries = mergeList(profile.interested_countries, learned.country);
    await jsonUpsert("profiles", patch);
  }
  if (lead) {
    const prefs = { ...(lead.preferences || {}) };
    if (learned.budget) prefs.study_budget = learned.budget;
    if (learned.intake) prefs.intake = learned.intake;
    prefs.ai_chat_updated_at = now;
    const patch = { id: lead.id, preferences: prefs, updated_at: now, last_activity_at: now };
    if (learned.country) patch.preferred_countries = mergeList(lead.preferred_countries, learned.country);
    if (learned.qualification) patch.current_qualification = learned.qualification;
    if (learned.field) patch.field_of_interest = learned.field;
    if (learned.score) patch.academic_score = learned.score;
    if (learned.budget && !String(lead.notes || "").includes(learned.budget)) {
      patch.notes = [String(lead.notes || "").trim(), `Study budget (AI chat): ${learned.budget}`].filter(Boolean).join("\n");
    }
    await jsonUpsert("student_leads", patch);
  }
}

async function aiReply(conversation, studentUserId, lead, messages) {
  const lastAi = [...messages].reverse().find((m) => m.sender_role === "ai");
  if (!geminiConfigured()) {
    if (lastAi?.body === AI_FALLBACK) return null;
    return addMessage(conversation, { senderRole: "ai", senderName: "AI Advisor", body: AI_FALLBACK });
  }
  try {
    const profile = await jsonFind("profiles", "user_id", studentUserId).catch(() => null);
    const known = knownProfile(profile, lead);
    const { reply, profile: learned } = await geminiChat({
      systemPrompt: systemPrompt(known, await partnerUniversities(known.country)),
      history: aiHistory(messages),
    });
    await saveLearned(studentUserId, lead, learned).catch((error) => console.warn("[case-ai] profile save skipped:", error.message));
    return addMessage(conversation, { senderRole: "ai", senderName: "AI Advisor", body: reply });
  } catch (error) {
    console.error("[case-ai] Gemini failed:", error.message || error);
    if (lastAi?.body === AI_FALLBACK) return null;
    return addMessage(conversation, { senderRole: "ai", senderName: "AI Advisor", body: AI_FALLBACK });
  }
}

async function greetIfEmpty(conversation, owner, name) {
  const existing = await rowsWhere("case_messages", "conversation_id", conversation.id);
  if (existing.length || owner.role !== "ai") return;
  const first = String(name || "").split(/\s+/)[0];
  await addMessage(conversation, {
    senderRole: "ai",
    senderName: "AI Advisor",
    sourceId: `greeting:${conversation.id}`,
    body: `Hi${first ? ` ${first}` : ""}! I'm the Fly Masters AI advisor. Tell me which country and course you're thinking about, or ask me anything about studying abroad. Your Fly Masters team will join this same chat as you move ahead.`,
  });
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
    if (assigned === SHARED_COUNSELOR_ID) return true;
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

router.get("/api/case/me", anySession, requireStudent, async (req, res) => {
  try {
    const lead = await leadForStudent(req.user.id);
    const owner = await ownerOf(lead);
    const conversation = await conversationFor(req.user.id, lead?.id);
    await importLegacy(conversation, req.user.id);
    await greetIfEmpty(conversation, owner, studentNameFromLead(lead, ""));
    await jsonUpsert("case_conversations", { id: conversation.id, student_last_read_at: new Date().toISOString() });
    res.json({
      conversation_id: conversation.id,
      owner,
      ai_enabled: geminiConfigured(),
      messages: await loadMessages(conversation.id),
    });
  } catch (error) {
    console.error("[case] load failed:", error);
    res.status(500).json({ error: "Could not load your conversation." });
  }
});

router.post("/api/case/me/messages", anySession, requireStudent, async (req, res) => {
  const text = cleanText(req.body?.message ?? req.body?.text);
  if (!text) return res.status(400).json({ error: "Message cannot be empty." });
  try {
    const lead = await leadForStudent(req.user.id);
    const owner = await ownerOf(lead);
    const conversation = await conversationFor(req.user.id, lead?.id);
    const sent = await addMessage(conversation, { senderRole: "student", senderId: req.user.id, body: text });
    const created = [sent];
    if (owner.role === "ai") {
      const history = await loadMessages(conversation.id);
      const reply = await aiReply(conversation, req.user.id, lead, history);
      if (reply) created.push(reply);
    }
    await jsonUpsert("case_conversations", { id: conversation.id, student_last_read_at: new Date().toISOString() });
    res.json({ owner, messages: created });
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
      leads = await rowsWhere("student_leads", "assigned_counselor_id", [...(await counselorAliases(req.user)), SHARED_COUNSELOR_ID]);
    } else {
      const convs = await jsonTable("case_conversations");
      leads = await rowsWhere("student_leads", "user_id", convs.map((c) => c.student_user_id));
      if (role === ROLES.BRANCH_HEAD && !req.scope?.allBranches) {
        const allowed = new Set((req.scope?.branchIds || []).map(String));
        leads = leads.filter((l) => allowed.has(String(l.branch_id || "")));
      }
    }
    leads = leads.filter((l) => l.user_id);

    const convs = await rowsWhere("case_conversations", "student_user_id", leads.map((l) => l.user_id));
    const convByStudent = new Map(convs.map((c) => [String(c.student_user_id), c]));
    const msgs = await rowsWhere("case_messages", "conversation_id", convs.map((c) => c.id));
    const byConv = new Map();
    for (const m of msgs) {
      const list = byConv.get(String(m.conversation_id)) || [];
      list.push(m);
      byConv.set(String(m.conversation_id), list);
    }

    const items = await Promise.all(leads.map(async (lead) => {
      const conv = convByStudent.get(String(lead.user_id));
      const list = (conv && byConv.get(String(conv.id))) || [];
      list.sort((a, b) => sentAt(a).localeCompare(sentAt(b)));
      const last = list[list.length - 1];
      const readAt = String(conv?.staff_last_read_at || "");
      const owner = await ownerOf(lead);
      return {
        lead_id: String(lead.id),
        student_user_id: String(lead.user_id),
        student_name: studentNameFromLead(lead),
        owner,
        last_message: last ? { body: last.body, sender_role: last.sender_role, created_at: sentAt(last) } : null,
        last_message_at: last ? sentAt(last) : null,
        unread: list.filter((m) => m.sender_role === "student" && sentAt(m) > readAt).length,
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
  if (!lead.user_id) {
    res.status(400).json({ error: "This lead has no student portal account yet, so there is no chat." });
    return null;
  }
  return lead;
}

router.get("/api/case/lead/:leadId", anySession, requireStaff, scopeBranchHead, async (req, res) => {
  try {
    const lead = await staffLead(req, res);
    if (!lead) return;
    const conversation = await conversationFor(lead.user_id, lead.id);
    await importLegacy(conversation, lead.user_id);
    await jsonUpsert("case_conversations", { id: conversation.id, staff_last_read_at: new Date().toISOString() });
    const profile = await jsonFind("profiles", "user_id", lead.user_id).catch(() => null);
    res.json({
      conversation_id: conversation.id,
      owner: await ownerOf(lead),
      student: { lead_id: String(lead.id), user_id: String(lead.user_id), name: studentNameFromLead(lead), email: lead.email || "", phone: lead.phone || "" },
      known: knownProfile(profile, lead),
      messages: await loadMessages(conversation.id),
    });
  } catch (error) {
    console.error("[case] staff load failed:", error);
    res.status(500).json({ error: "Could not load the conversation." });
  }
});

router.post("/api/case/lead/:leadId/messages", anySession, requireStaff, scopeBranchHead, async (req, res) => {
  const text = cleanText(req.body?.message ?? req.body?.text);
  if (!text) return res.status(400).json({ error: "Message cannot be empty." });
  try {
    const lead = await staffLead(req, res);
    if (!lead) return;
    const conversation = await conversationFor(lead.user_id, lead.id);
    const role = req.user.role;
    const senderRole = role === ROLES.COUNSELOR || role === ROLES.TELECALLER ? role : "admin";
    const message = await addMessage(conversation, {
      senderRole,
      senderId: req.user.id,
      senderName: await personName(req.user.id, senderRole === "admin" ? "Fly Masters" : senderRole),
      body: text,
    });
    await jsonUpsert("case_conversations", { id: conversation.id, staff_last_read_at: new Date().toISOString() });
    res.json({ message });
  } catch (error) {
    console.error("[case] staff send failed:", error);
    res.status(500).json({ error: "Could not send the message." });
  }
});

export default router;
