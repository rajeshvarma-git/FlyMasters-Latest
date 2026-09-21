import crypto, { randomBytes, scryptSync, timingSafeEqual } from "crypto";

const OTP_EXPIRY_MINUTES = 10;
const OTP_RATE_LIMIT_MS = 60_000;
const OTP_MAX_ATTEMPTS = 5;

function normalizePhone(value) {
  let digits = String(value || "").replace(/\D/g, "");
  if (digits.length === 10) digits = `91${digits}`;
  return digits;
}

function phonesMatch(left, right) {
  const a = normalizePhone(left);
  const b = normalizePhone(right);
  if (!a || !b) return false;
  if (a === b) return true;
  return a.slice(-10) === b.slice(-10);
}

function hashOtp(code) {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(String(code), salt, 32).toString("hex");
  return `scrypt:${salt}:${hash}`;
}

function verifyOtpHash(code, stored) {
  if (!stored?.startsWith("scrypt:")) return false;
  const [, salt, hash] = stored.split(":");
  if (!salt || !hash) return false;
  const next = scryptSync(String(code), salt, 32);
  const prev = Buffer.from(hash, "hex");
  return next.length === prev.length && timingSafeEqual(next, prev);
}

function isConvertedLead(lead) {
  return lead?.entity_type === "student" || lead?.lead_status === "converted";
}

export function createWhatsAppService(deps) {
  const { jsonTable, jsonUpsert, config, notify, pool, notifyAdmins } = deps;

  async function allLeads() {
    const jsonLeads = await jsonTable("student_leads");
    if (!pool) return jsonLeads;
    const sql = await pool.query("SELECT * FROM student_leads").catch(() => ({ rows: [] }));
    const byId = new Map(jsonLeads.map((row) => [String(row.id), row]));
    for (const row of sql.rows) {
      const id = String(row.id);
      const json = byId.get(id) || {};
      byId.set(id, {
        ...row,
        ...json,
        id,
        phone: json.phone || row.phone || "",
        whatsapp_number: json.whatsapp_number || row.whatsapp_number || "",
        assigned_telecaller_id: json.assigned_telecaller_id || row.assigned_telecaller_id || null,
        assigned_counselor_id: json.assigned_counselor_id || row.assigned_counselor_id || null,
      });
    }
    return [...byId.values()];
  }

  function leadPhoneMatches(lead, phone) {
    return phonesMatch(lead?.phone, phone) || phonesMatch(lead?.whatsapp_number, phone);
  }

  function pickBestLeadForPhone(matches) {
    if (!matches.length) return null;
    const openAssigned = matches.find(
      (row) => !isConvertedLead(row) && (row.assigned_telecaller_id || row.assigned_counselor_id),
    );
    if (openAssigned) return openAssigned;
    const convertedAssigned = matches.find((row) => isConvertedLead(row) && row.assigned_counselor_id);
    return convertedAssigned || matches[0];
  }

  async function findLeadByPhone(phone) {
    const leads = await allLeads();
    return pickBestLeadForPhone(leads.filter((row) => leadPhoneMatches(row, phone)));
  }

  async function findLeadForUser(userId) {
    const leads = await allLeads();
    return (
      leads.find(
        (row) =>
          String(row.user_id || "") === String(userId) ||
          String(row.id) === String(userId),
      ) || null
    );
  }

  async function createLeadFromWhatsApp({ phone, profileName, firstMessage }) {
    const phoneNumber = normalizePhone(phone);
    const id = crypto.randomUUID();
    const now = new Date().toISOString();
    const nameParts = String(profileName || "").trim().split(/\s+/).filter(Boolean);
    const first_name = nameParts[0] || "WhatsApp";
    const last_name = nameParts.slice(1).join(" ") || "Lead";
    const localPhone = phoneNumber.slice(-10);
    const email = `whatsapp+${localPhone}@lead.flymasters.local`;

    const lead = {
      id,
      user_id: null,
      email,
      phone: localPhone,
      whatsapp_number: phoneNumber,
      whatsapp_verified: true,
      whatsapp_verified_at: now,
      first_name,
      last_name,
      preferred_countries: [],
      field_of_interest: "",
      academic_score: "",
      lead_status: "hot",
      lead_stage: "hot",
      lead_source: "whatsapp",
      entity_type: "lead",
      status: "unassigned",
      assigned_telecaller_id: null,
      assigned_counselor_id: null,
      priority: "high",
      notes: firstMessage ? `[WhatsApp first message] ${firstMessage.slice(0, 500)}` : "",
      created_at: now,
    };

    if (pool) {
      await pool
        .query(
          `INSERT INTO student_leads (
            id, user_id, email, phone, first_name, last_name, lead_status, lead_stage,
            lead_source, entity_type, status, created_at
          ) VALUES ($1,NULL,$2,$3,$4,$5,'hot','hot','whatsapp','lead','unassigned',$6)
          ON CONFLICT (id) DO NOTHING`,
          [id, email, localPhone, first_name, last_name, now],
        )
        .catch(() => {});
    }

    await jsonUpsert("student_leads", lead);
    return lead;
  }

  function isSystemMessage(row) {
    return row?.kind === "system" || String(row?.staff_id || "") === "system";
  }

  function isCustomerCareWindowOpen(messages, conversationId) {
    const inbound = (messages || [])
      .filter(
        (row) =>
          String(row.conversation_id) === String(conversationId) &&
          row.direction === "inbound" &&
          !isSystemMessage(row),
      )
      .sort((a, b) => String(a.created_at || "").localeCompare(String(b.created_at || "")));
    const last = inbound[inbound.length - 1];
    if (!last?.created_at) return false;
    return Date.now() - new Date(last.created_at).getTime() < 24 * 3600 * 1000;
  }

  async function recordSeatChange(conversation, nextStaff, reason) {
    const prevId = String(conversation.assigned_staff_id || "");
    const prevRole = String(conversation.staff_role || "");
    const nextId = String(nextStaff?.staffId || "");
    const nextRole = String(nextStaff?.staffRole || "");
    if (prevId === nextId && prevRole === nextRole) return;

    const now = new Date().toISOString();
    const inferred = reason || (nextId ? (prevId ? "reassigned" : "assigned") : "unassigned");
    const seats = await jsonTable("whatsapp_seat_history");
    const open = seats.filter(
      (row) => String(row.conversation_id) === String(conversation.id) && !row.ended_at,
    );
    for (const seat of open) {
      await jsonUpsert("whatsapp_seat_history", { ...seat, ended_at: now, end_reason: inferred });
    }
    if (nextId) {
      await jsonUpsert("whatsapp_seat_history", {
        id: crypto.randomUUID(),
        conversation_id: conversation.id,
        lead_id: conversation.lead_id || "",
        staff_id: nextId,
        staff_role: nextRole,
        started_at: now,
        ended_at: null,
        reason: inferred,
      });
    }
  }

  function resolveStaffForLead(lead) {
    if (!lead) return null;
    if (isConvertedLead(lead)) {
      const staffId = String(lead.assigned_counselor_id || "");
      if (!staffId) return null;
      return { staffId, staffRole: "counselor" };
    }
    const staffId = String(lead.assigned_telecaller_id || "");
    if (!staffId) return null;
    return { staffId, staffRole: "telecaller" };
  }

  async function syncConversationStaff(conversation, lead, reason) {
    const staff = resolveStaffForLead(lead);
    const phoneNumber = normalizePhone(conversation.phone_number || lead.whatsapp_number || lead.phone);
    const inferred =
      reason ||
      (isConvertedLead(lead) && (!staff || staff.staffRole === "counselor") ? "converted" : undefined);
    await recordSeatChange(conversation, staff, inferred);
    return jsonUpsert("whatsapp_conversations", {
      ...conversation,
      lead_id: String(lead.id),
      user_id: lead.user_id ? String(lead.user_id) : conversation.user_id || "",
      phone_number: phoneNumber,
      assigned_staff_id: staff?.staffId || "",
      staff_role: staff?.staffRole || "",
    });
  }

  async function getOrCreateConversation(lead, phone) {
    const phoneNumber = normalizePhone(phone || lead.whatsapp_number || lead.phone);
    const conversations = await jsonTable("whatsapp_conversations");
    const existing = conversations.find(
      (row) =>
        String(row.lead_id) === String(lead.id) ||
        phonesMatch(row.phone_number, phoneNumber),
    );
    if (existing) {
      return syncConversationStaff(existing, lead);
    }

    const now = new Date().toISOString();
    const created = await jsonUpsert("whatsapp_conversations", {
      id: crypto.randomUUID(),
      lead_id: String(lead.id),
      user_id: lead.user_id ? String(lead.user_id) : "",
      phone_number: phoneNumber,
      assigned_staff_id: "",
      staff_role: "",
      last_message_at: now,
      created_at: now,
    });
    return syncConversationStaff(created, lead);
  }

  async function syncConversationForLead(lead) {
    if (!lead) return 0;
    const conversations = await jsonTable("whatsapp_conversations");
    const phoneNumber = normalizePhone(lead.whatsapp_number || lead.phone);
    const matches = conversations.filter(
      (row) =>
        String(row.lead_id) === String(lead.id) ||
        (phoneNumber && phonesMatch(row.phone_number, phoneNumber)),
    );
    if (!matches.length) {
      if (!phoneNumber) return 0;
      await getOrCreateConversation(lead, phoneNumber);
      return 1;
    }
    for (const conv of matches) {
      await syncConversationStaff({ ...conv, lead_id: String(lead.id) }, lead);
    }
    return matches.length;
  }

  async function syncConversationsForLeads(leads) {
    let updated = 0;
    for (const lead of leads || []) {
      updated += await syncConversationForLead(lead);
    }
    return updated;
  }

  async function syncAllConversationStaff() {
    const leads = await allLeads();
    return syncConversationsForLeads(leads);
  }

  function conversationOwnedByTelecaller(conversation, user, leads) {
    const userId = String(user?.id || "");
    if (!userId) return false;
    if (
      String(conversation.assigned_staff_id) === userId &&
      conversation.staff_role !== "counselor"
    ) {
      const lead = (leads || []).find((row) => String(row.id) === String(conversation.lead_id));
      if (lead && isConvertedLead(lead)) return false;
      return true;
    }
    return (leads || []).some((lead) => {
      if (isConvertedLead(lead)) return false;
      if (String(lead.assigned_telecaller_id || "") !== userId) return false;
      return (
        String(lead.id) === String(conversation.lead_id) ||
        leadPhoneMatches(lead, conversation.phone_number)
      );
    });
  }

  async function storeInboundMessage({ from, text, waMessageId, profileName }) {
    if (waMessageId) {
      const existingMessages = await jsonTable("whatsapp_messages");
      const duplicate = existingMessages.find((row) => String(row.wa_message_id || "") === String(waMessageId));
      if (duplicate) return { message: duplicate, isNewLead: false, lead: null, duplicate: true };
    }

    let lead = await findLeadByPhone(from);
    let isNewLead = false;

    if (!lead) {
      lead = await createLeadFromWhatsApp({ phone: from, profileName, firstMessage: text });
      isNewLead = true;
      console.log(`WhatsApp lead created from ${from}: ${lead.id}`);
    }

    const phoneNumber = normalizePhone(from);
    const freshLead = {
      ...lead,
      whatsapp_number: phoneNumber,
      phone: lead.phone || phoneNumber.slice(-10),
      lead_source: lead.lead_source || "whatsapp",
    };
    await jsonUpsert("student_leads", freshLead);

    let conversation = await getOrCreateConversation(freshLead, from);
    conversation = await syncConversationStaff(conversation, freshLead);
    const staff = resolveStaffForLead(freshLead);
    const now = new Date().toISOString();
    const name = `${freshLead.first_name || "Lead"} ${freshLead.last_name || ""}`.trim() || phoneNumber.slice(-10);
    const path = isConvertedLead(freshLead) ? `/admin/students/${freshLead.id}` : `/admin/leads/${freshLead.id}`;

    const created = await jsonUpsert("whatsapp_messages", {
      id: crypto.randomUUID(),
      conversation_id: conversation.id,
      direction: "inbound",
      body: text,
      wa_message_id: waMessageId || "",
      staff_id: "",
      is_read: false,
      created_at: now,
    });

    await jsonUpsert("whatsapp_conversations", { ...conversation, last_message_at: now });

    if (isNewLead && notifyAdmins) {
      await notifyAdmins(
        "New WhatsApp lead",
        `${name} (+${phoneNumber.slice(-10)}) messaged on WhatsApp. Assign a telecaller from Lead alerts.`,
        "/admin/alerts",
      );
    } else if (staff?.staffId && notify) {
      await notify(
        staff.staffId,
        "New WhatsApp message",
        `${name}: ${text.slice(0, 140)}`,
        "info",
        staff.staffRole === "telecaller" ? `/whatsapp?lead=${freshLead.id}` : path,
      );
    } else if (notifyAdmins) {
      await notifyAdmins(
        "WhatsApp needs assignment",
        `${name} messaged on WhatsApp but has no assigned ${isConvertedLead(freshLead) ? "counselor" : "telecaller"}.`,
        "/admin/alerts",
      );
    }

    return { message: created, isNewLead, lead: freshLead };
  }

  async function storeOutboundMessage({ conversationId, body, staffId, waMessageId }) {
    const now = new Date().toISOString();
    const created = await jsonUpsert("whatsapp_messages", {
      id: crypto.randomUUID(),
      conversation_id: conversationId,
      direction: "outbound",
      body,
      wa_message_id: waMessageId || "",
      staff_id: staffId || "",
      is_read: true,
      created_at: now,
    });

    const conversations = await jsonTable("whatsapp_conversations");
    const conversation = conversations.find((row) => String(row.id) === String(conversationId));
    if (conversation) {
      await jsonUpsert("whatsapp_conversations", { ...conversation, last_message_at: now });
    }
    return created;
  }

  async function sendViaMeta({ to, text, templateName, templateParams }) {
    const token = config.accessToken;
    const phoneNumberId = config.phoneNumberId;
    if (!token || !phoneNumberId) {
      throw new Error("WhatsApp API is not configured. Set WHATSAPP_ACCESS_TOKEN and WHATSAPP_PHONE_NUMBER_ID.");
    }

    const payload = templateName
      ? {
          messaging_product: "whatsapp",
          to: normalizePhone(to),
          type: "template",
          template: {
            name: templateName,
            language: { code: "en" },
            ...((templateParams || []).length
              ? {
                  components: [
                    {
                      type: "body",
                      parameters: templateParams.map((value) => ({ type: "text", text: String(value) })),
                    },
                  ],
                }
              : {}),
          },
        }
      : {
          messaging_product: "whatsapp",
          to: normalizePhone(to),
          type: "text",
          text: { body: text },
        };

    const res = await fetch(`https://graph.facebook.com/v21.0/${phoneNumberId}/messages`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const error = new Error(data?.error?.message || "WhatsApp send failed");
      error.status = res.status >= 400 && res.status < 500 ? 400 : 502;
      error.code = data?.error?.code;
      throw error;
    }
    return data?.messages?.[0]?.id || "";
  }

  async function sendTextMessage(to, text) {
    return sendViaMeta({ to, text });
  }

  function isOutsideWindowError(error) {
    const code = Number(error?.code);
    const message = String(error?.message || "");
    return code === 131047 || /24 hour|#131047|re-engag|not in the allowed window/i.test(message);
  }

  async function sendLeadMessage({ lead, staffId, text }) {
    const body = String(text || "").trim();
    if (!body) {
      throw Object.assign(new Error("Message cannot be empty."), { status: 400 });
    }
    const phone = normalizePhone(lead.whatsapp_number || lead.phone);
    if (phone.length < 12) {
      throw Object.assign(new Error("This lead needs a valid 10-digit WhatsApp number before you can send."), { status: 400 });
    }

    const freshLead = {
      ...lead,
      whatsapp_number: phone,
      phone: lead.phone || phone.slice(-10),
    };
    await jsonUpsert("student_leads", freshLead);
    const conversation = await getOrCreateConversation(freshLead, phone);

    let waMessageId = "";
    let usedTemplate = false;
    try {
      waMessageId = await sendTextMessage(phone, body);
    } catch (error) {
      const templateName = config.outreachTemplateName;
      if (isOutsideWindowError(error) && templateName) {
        waMessageId = await sendViaMeta({
          to: phone,
          templateName,
          templateParams: [freshLead.first_name || "there", body].filter(Boolean).slice(0, 2),
        });
        usedTemplate = true;
      } else if (isOutsideWindowError(error)) {
        throw Object.assign(
          new Error(
            "WhatsApp only allows a free message for 24 hours after the lead writes first. Wait for their reply, or ask admin to set WHATSAPP_OUTREACH_TEMPLATE_NAME.",
          ),
          { status: 400 },
        );
      } else {
        throw Object.assign(error, { status: error.status || 400 });
      }
    }

    const created = await storeOutboundMessage({
      conversationId: conversation.id,
      body,
      staffId,
      waMessageId,
    });
    return { message: created, conversation, usedTemplate };
  }

  async function sendOtpMessage(to, code) {
    if (config.otpTemplateName) {
      return sendViaMeta({
        to,
        templateName: config.otpTemplateName,
        templateParams: [code],
      });
    }
    return sendViaMeta({
      to,
      text: `Your Fly Masters verification code is ${code}. Valid for ${OTP_EXPIRY_MINUTES} minutes.`,
    });
  }

  async function sendOtp({ userId, phone }) {
    const normalized = normalizePhone(phone);
    if (normalized.length < 12) {
      throw Object.assign(new Error("Enter a valid 10-digit mobile number."), { status: 400 });
    }

    const lead = await findLeadForUser(userId);
    if (!lead) {
      throw Object.assign(new Error("No lead record found for your account."), { status: 404 });
    }

    const verifications = await jsonTable("whatsapp_verifications");
    const recent = verifications
      .filter((row) => phonesMatch(row.phone_number, normalized) && !row.verified_at)
      .sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)))[0];

    if (recent?.created_at) {
      const elapsed = Date.now() - new Date(recent.created_at).getTime();
      if (elapsed < OTP_RATE_LIMIT_MS) {
        throw Object.assign(new Error("Please wait a minute before requesting another code."), { status: 429 });
      }
    }

    const code = String(Math.floor(100000 + Math.random() * 900000));
    const expiresAt = new Date(Date.now() + OTP_EXPIRY_MINUTES * 60_000).toISOString();
    const now = new Date().toISOString();

    await jsonUpsert("whatsapp_verifications", {
      id: crypto.randomUUID(),
      phone_number: normalized,
      user_id: String(userId),
      code_hash: hashOtp(code),
      attempts: 0,
      expires_at: expiresAt,
      verified_at: null,
      created_at: now,
    });

    await sendOtpMessage(normalized, code);

    await jsonUpsert("student_leads", {
      ...lead,
      whatsapp_number: normalized,
    });

    return { ok: true, phone: normalized.slice(-10), expiresInMinutes: OTP_EXPIRY_MINUTES };
  }

  async function verifyOtp({ userId, phone, code }) {
    const normalized = normalizePhone(phone);
    const verifications = await jsonTable("whatsapp_verifications");
    const record = verifications
      .filter(
        (row) =>
          String(row.user_id) === String(userId) &&
          phonesMatch(row.phone_number, normalized) &&
          !row.verified_at,
      )
      .sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)))[0];

    if (!record) {
      throw Object.assign(new Error("No active verification code. Request a new one."), { status: 400 });
    }

    if (new Date(record.expires_at).getTime() < Date.now()) {
      throw Object.assign(new Error("Code expired. Request a new one."), { status: 400 });
    }

    const attempts = Number(record.attempts || 0) + 1;
    if (attempts > OTP_MAX_ATTEMPTS) {
      throw Object.assign(new Error("Too many attempts. Request a new code."), { status: 429 });
    }

    if (!verifyOtpHash(code, record.code_hash)) {
      await jsonUpsert("whatsapp_verifications", { ...record, attempts });
      throw Object.assign(new Error("Incorrect code. Try again."), { status: 400 });
    }

    const now = new Date().toISOString();
    await jsonUpsert("whatsapp_verifications", { ...record, attempts, verified_at: now });

    const lead = await findLeadForUser(userId);
    if (lead) {
      await jsonUpsert("student_leads", {
        ...lead,
        whatsapp_number: normalized,
        whatsapp_verified: true,
        whatsapp_verified_at: now,
        phone: lead.phone || normalized.slice(-10),
      });
      await getOrCreateConversation({ ...lead, whatsapp_number: normalized }, normalized);
    }

    return { ok: true, verified: true };
  }

  async function getVerificationStatus(userId) {
    const lead = await findLeadForUser(userId);
    return {
      verified: Boolean(lead?.whatsapp_verified),
      phone: lead?.whatsapp_number ? String(lead.whatsapp_number).slice(-10) : "",
      verifiedAt: lead?.whatsapp_verified_at || null,
    };
  }

  function staffCanViewConversation(conversation, user, counselors, leads = []) {
    const role = user.role;
    if (role === "admin" || role === "super_admin") return true;
    return staffCanReplyConversation(conversation, user, counselors, leads);
  }

  function staffCanReplyConversation(conversation, user, counselors, leads = []) {
    const role = user.role;
    if (role === "admin" || role === "super_admin") return false;
    if (role === "telecaller") {
      return conversationOwnedByTelecaller(conversation, user, leads);
    }
    if (role === "counselor") {
      const counselor = counselors.find(
        (row) => String(row.auth_user_id || "") === String(user.id) || String(row.id) === String(user.id),
      );
      const counselorIds = new Set(
        [counselor?.id, counselor?.auth_user_id, user.id].filter(Boolean).map(String),
      );
      if (counselorIds.has(String(conversation.assigned_staff_id)) && conversation.staff_role === "counselor") {
        return true;
      }
      return (leads || []).some(
        (lead) =>
          isConvertedLead(lead) &&
          counselorIds.has(String(lead.assigned_counselor_id || "")) &&
          (String(lead.id) === String(conversation.lead_id) || leadPhoneMatches(lead, conversation.phone_number)),
      );
    }
    return false;
  }

  async function filterConversationsForStaff(user, counselors, leads = []) {
    const conversations = await jsonTable("whatsapp_conversations");
    return conversations.filter((row) => staffCanViewConversation(row, user, counselors, leads));
  }

  return {
    normalizePhone,
    phonesMatch,
    findLeadByPhone,
    findLeadForUser,
    createLeadFromWhatsApp,
    resolveStaffForLead,
    getOrCreateConversation,
    syncConversationForLead,
    syncConversationsForLeads,
    syncAllConversationStaff,
    storeInboundMessage,
    storeOutboundMessage,
    isCustomerCareWindowOpen,
    isSystemMessage,
    sendTextMessage,
    sendLeadMessage,
    sendOtp,
    verifyOtp,
    getVerificationStatus,
    staffCanViewConversation,
    staffCanReplyConversation,
    filterConversationsForStaff,
  };
}
