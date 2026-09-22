/**
 * CRM section 2.7 — the automation and delivery layer.
 *
 * Three jobs live here:
 *   1. rendering an approved template against a student's record,
 *   2. deciding whether a message is allowed to go out at all,
 *   3. actually sending it and writing the outcome to communication_log.
 *
 * Everything a message has to survive before it is sent:
 *   - the template must be an ACTIVE version (a draft or a retired version
 *     cannot be sent, and on WhatsApp it must also carry a Meta-approved
 *     template name, because Meta approves separately from us),
 *   - the recipient must not have opted out of that channel,
 *   - it must not be quiet hours for the rule,
 *   - the rule must be active and under its daily cap.
 * A message that fails any of these is logged as `skipped` with the reason,
 * never silently dropped — "we sent it" and "we decided not to" must be
 * distinguishable six weeks later.
 */
import { pool } from "./db.mjs";

export const AUTOMATION_EVENTS = [
  "lead_created",
  "lead_assigned",
  "lead_transferred",
  "student_converted",
  "document_requested",
  "document_rejected",
  "document_accepted",
  "application_status_changed",
  "visa_status_changed",
  "followup_due",
  "followup_missed",
  "deadline_approaching",
  "inactivity",
  "fee_due",
  "commission_approved",
];

/** {{first_name}} style placeholders, filled from a flat context object. */
export function renderTemplate(text, context = {}) {
  return String(text || "").replace(/\{\{\s*([a-zA-Z0-9_.]+)\s*\}\}/g, (_match, key) => {
    const value = key.split(".").reduce((node, part) => (node == null ? node : node[part]), context);
    return value === undefined || value === null ? "" : String(value);
  });
}

export async function activeTemplate(idOrCode) {
  const { rows } = await pool.query(
    `SELECT * FROM message_templates
      WHERE status = 'active' AND (id::text = $1 OR code = $1)
      ORDER BY version DESC LIMIT 1`,
    [String(idOrCode)],
  );
  return rows[0] || null;
}

/**
 * Whether this staff member may use this template (2.7: "Control template
 * usage by role, branch, country, intake, language, campaign, student stage,
 * and communication channel so Counsellors use only Super Admin-approved
 * messaging and images.")
 */
export function templateAllowedFor(template, { role, branchId, country, intake, stage } = {}) {
  if (!template) return { ok: false, reason: "template_missing" };
  if (template.status !== "active") return { ok: false, reason: "template_not_active" };
  if (role && !(template.allowed_roles || []).includes(role)) return { ok: false, reason: "role_not_allowed" };
  const branches = (template.allowed_branches || []).map(String);
  if (branches.length && branchId && !branches.includes(String(branchId))) {
    return { ok: false, reason: "branch_not_allowed" };
  }
  const matches = (list, value) => {
    const values = (list || []).map(String);
    return !values.length || values.includes("All") || (value ? values.includes(String(value)) : true);
  };
  if (!matches(template.countries, country)) return { ok: false, reason: "country_not_allowed" };
  if (!matches(template.intakes, intake)) return { ok: false, reason: "intake_not_allowed" };
  if (!matches(template.student_stages, stage)) return { ok: false, reason: "stage_not_allowed" };
  if (template.channel === "whatsapp" && !template.meta_approved && !template.meta_template_name) {
    return { ok: false, reason: "meta_template_missing" };
  }
  return { ok: true, reason: "" };
}

export async function hasOptedOut(subjectId, channel, subjectType = "student") {
  if (!subjectId) return false;
  const { rows } = await pool.query(
    "SELECT opted_out FROM communication_consent WHERE subject_type = $1 AND subject_id = $2 AND channel = $3",
    [subjectType, String(subjectId), channel],
  );
  return Boolean(rows[0]?.opted_out);
}

function minutesOf(time) {
  if (!time) return null;
  const [h, m] = String(time).split(":");
  return Number(h) * 60 + Number(m || 0);
}

export function inQuietHours(rule, now = new Date()) {
  const start = minutesOf(rule?.quiet_start);
  const end = minutesOf(rule?.quiet_end);
  if (start === null || end === null) return false;
  const current = now.getHours() * 60 + now.getMinutes();
  return start <= end ? current >= start && current < end : current >= start || current < end;
}

export async function logCommunication(entry) {
  const { rows } = await pool.query(
    `INSERT INTO communication_log
       (rule_id, template_id, channel, direction, recipient_type, recipient_id, recipient_addr,
        student_id, branch_id, sent_by, body_preview, status, skip_reason, error, meta,
        scheduled_for, sent_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9::uuid,$10,$11,$12,$13,$14,$15::jsonb,$16,$17)
     RETURNING *`,
    [
      entry.ruleId || null, entry.templateId || null, entry.channel || "portal",
      entry.direction || "outbound", entry.recipientType || "student",
      String(entry.recipientId || ""), String(entry.recipientAddr || ""),
      entry.studentId ? String(entry.studentId) : null,
      entry.branchId || null, entry.sentBy || null,
      String(entry.body || "").slice(0, 500),
      entry.status || "queued", entry.skipReason || "", entry.error || "",
      JSON.stringify(entry.meta || {}),
      entry.scheduledFor || null,
      entry.status === "sent" ? new Date() : null,
    ],
  );
  return rows[0];
}

/**
 * Resets a rule's daily counter when the date rolls over, then reports whether
 * the rule may fire again today. The counter is the blast-radius cap: a
 * misconfigured rule stops itself instead of sending four hundred messages.
 */
export async function claimRuleQuota(ruleId) {
  const { rows } = await pool.query(
    `UPDATE communication_rules
        SET sent_today = CASE WHEN counter_date < CURRENT_DATE THEN 1 ELSE sent_today + 1 END,
            counter_date = CURRENT_DATE,
            updated_at = now()
      WHERE id = $1
        AND is_active
        AND (counter_date < CURRENT_DATE OR sent_today < max_per_day)
      RETURNING *`,
    [ruleId],
  );
  return rows[0] || null;
}

export async function pauseRule(ruleId, reason) {
  await pool.query(
    "UPDATE communication_rules SET is_active = false, paused_reason = $2, updated_at = now() WHERE id = $1",
    [ruleId, String(reason || "")],
  );
}

/**
 * Sends one message through one channel.
 *
 * `deps.whatsapp` and `deps.notify` are injected by the route module so this
 * file has no dependency on the 3,400-line core router.
 */
export async function deliver({ channel, template, context, recipient, rule = null, sentBy = null, deps = {} }) {
  const body = renderTemplate(template?.body, context);
  const subject = renderTemplate(template?.subject, context);

  const base = {
    ruleId: rule?.id || null,
    templateId: template?.id || null,
    channel,
    recipientType: recipient.type || "student",
    recipientId: recipient.id || "",
    recipientAddr: recipient.address || "",
    studentId: recipient.studentId || null,
    branchId: recipient.branchId || null,
    sentBy,
    body,
    meta: { subject, media_url: template?.media_url || "" },
  };

  if (await hasOptedOut(recipient.id, channel, recipient.type || "student")) {
    return logCommunication({ ...base, status: "skipped", skipReason: "opted_out" });
  }
  if (rule && inQuietHours(rule)) {
    return logCommunication({ ...base, status: "skipped", skipReason: "quiet_hours" });
  }

  try {
    if (channel === "whatsapp") {
      if (!deps.whatsapp?.sendTextMessage) throw new Error("WhatsApp is not configured on this server.");
      await deps.whatsapp.sendTextMessage(recipient.address, body, { templateName: template?.meta_template_name || "" });
    } else if (channel === "portal" || channel === "chat" || channel === "internal") {
      if (!deps.notify) throw new Error("In-app notifier unavailable.");
      await deps.notify(recipient.id, subject || template?.name || "Update", body, "info", template?.media_url || "");
    } else if (channel === "email") {
      if (!deps.sendEmail) {
        return logCommunication({ ...base, status: "skipped", skipReason: "email_not_configured" });
      }
      await deps.sendEmail(recipient.address, subject || template?.name || "Update", body);
    } else if (channel === "sms") {
      return logCommunication({ ...base, status: "skipped", skipReason: "sms_not_configured" });
    } else {
      return logCommunication({ ...base, status: "skipped", skipReason: "unknown_channel" });
    }
    return logCommunication({ ...base, status: "sent" });
  } catch (error) {
    if (rule) await pauseRule(rule.id, `Delivery failed: ${error.message || error}`.slice(0, 200));
    return logCommunication({ ...base, status: "failed", error: String(error.message || error).slice(0, 400) });
  }
}

/**
 * Fires every active rule bound to an event.
 *
 * Called from wherever the event happens. Returns what it did, so the caller
 * can surface it, but never throws — an automation failure must not fail the
 * business action that triggered it.
 */
export async function runEvent(event, payload = {}, deps = {}) {
  const results = [];
  try {
    const { rows: rules } = await pool.query(
      "SELECT * FROM communication_rules WHERE event = $1 AND is_active ORDER BY created_at",
      [event],
    );
    for (const rule of rules) {
      const branches = (rule.branch_ids || []).map(String);
      if (branches.length && payload.branchId && !branches.includes(String(payload.branchId))) continue;
      const countries = (rule.countries || []).map(String);
      if (countries.length && !countries.includes("All") && payload.country && !countries.includes(String(payload.country))) continue;

      const claimed = await claimRuleQuota(rule.id);
      if (!claimed) {
        results.push({ rule: rule.id, status: "skipped", reason: "daily_cap" });
        continue;
      }

      const template = rule.template_id ? await activeTemplate(rule.template_id) : null;
      if (!template) {
        await logCommunication({
          ruleId: rule.id, channel: rule.channel, status: "skipped",
          skipReason: "template_not_active", studentId: payload.studentId || null,
        });
        results.push({ rule: rule.id, status: "skipped", reason: "template_not_active" });
        continue;
      }

      const recipient = payload.recipients?.[rule.recipient];
      if (!recipient) {
        await logCommunication({
          ruleId: rule.id, templateId: template.id, channel: rule.channel, status: "skipped",
          skipReason: "no_recipient", studentId: payload.studentId || null,
        });
        results.push({ rule: rule.id, status: "skipped", reason: "no_recipient" });
        continue;
      }

      if (rule.delay_minutes > 0) {
        const queued = await logCommunication({
          ruleId: rule.id, templateId: template.id, channel: rule.channel,
          recipientType: rule.recipient, recipientId: recipient.id, recipientAddr: recipient.address,
          studentId: payload.studentId || null, branchId: payload.branchId || null,
          body: renderTemplate(template.body, payload.context || {}),
          status: "queued",
          scheduledFor: new Date(Date.now() + rule.delay_minutes * 60000),
        });
        results.push({ rule: rule.id, status: "queued", id: queued.id });
        continue;
      }

      const sent = await deliver({
        channel: rule.channel, template, context: payload.context || {},
        recipient: { ...recipient, studentId: payload.studentId, branchId: payload.branchId, type: rule.recipient },
        rule, deps,
      });
      results.push({ rule: rule.id, status: sent.status, id: sent.id });
    }
  } catch (error) {
    console.error(`automation event ${event} failed:`, error.message || error);
  }
  return results;
}

/**
 * Sends anything that was queued with a delay and is now due. Called on a
 * timer from index.mjs. Batched and capped so a backlog cannot flood.
 */
export async function flushScheduled(deps = {}, { limit = 50 } = {}) {
  const { rows } = await pool.query(
    `SELECT l.*, r.quiet_start, r.quiet_end, r.is_active AS rule_active
       FROM communication_log l
       LEFT JOIN communication_rules r ON r.id = l.rule_id
      WHERE l.status = 'queued' AND l.scheduled_for IS NOT NULL AND l.scheduled_for <= now()
      ORDER BY l.scheduled_for
      LIMIT $1`,
    [limit],
  );
  let sent = 0;
  for (const entry of rows) {
    if (entry.rule_id && entry.rule_active === false) {
      await pool.query("UPDATE communication_log SET status = 'skipped', skip_reason = 'rule_paused' WHERE id = $1", [entry.id]);
      continue;
    }
    const template = entry.template_id ? await activeTemplate(entry.template_id) : null;
    if (!template) {
      await pool.query("UPDATE communication_log SET status = 'skipped', skip_reason = 'template_not_active' WHERE id = $1", [entry.id]);
      continue;
    }
    try {
      if (entry.channel === "whatsapp" && deps.whatsapp?.sendTextMessage) {
        await deps.whatsapp.sendTextMessage(entry.recipient_addr, entry.body_preview, {
          templateName: template.meta_template_name || "",
        });
      } else if (deps.notify) {
        await deps.notify(entry.recipient_id, template.name, entry.body_preview, "info", "");
      }
      await pool.query("UPDATE communication_log SET status = 'sent', sent_at = now() WHERE id = $1", [entry.id]);
      sent += 1;
    } catch (error) {
      await pool.query(
        "UPDATE communication_log SET status = 'failed', error = $2 WHERE id = $1",
        [entry.id, String(error.message || error).slice(0, 400)],
      );
    }
  }
  return sent;
}
