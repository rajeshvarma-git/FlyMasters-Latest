/**
 * CRM section 2.7 — Communication and Automation Control.
 *
 * Route map:
 *   /api/comms/templates      versioned, approved message templates
 *   /api/comms/rules          event-driven automation, with a kill switch
 *   /api/comms/log            delivery status, failures, opt-outs
 *   /api/comms/consent        per-student, per-channel opt-out
 *   /api/comms/auto-response  out-of-office and working-hours replies
 *   /api/comms/supervision    Super Admin reading and joining a chat
 *   /api/comms/escalations    what a student reports, and how it is handled
 *
 * Templates follow the same never-delete rule as the checklists in 2.6: a
 * template that changes becomes a new version, the previous one goes inactive
 * and keeps its rows, and config_change_log records the transition. A message
 * that was sent last March can still be traced back to the exact wording that
 * was live at the time.
 */
import { Router } from "express";
import { pool } from "../lib/db.mjs";
import {
  ROLES,
  ADMIN_ROLES,
  STAFF_ROLES,
  session,
  anySession,
  requireRole,
  branchScope,
  audit,
} from "../lib/auth.mjs";
import { logChange, diffOf } from "../lib/changelog.mjs";
import { raiseAlert } from "../lib/alerts.mjs";
import {
  AUTOMATION_EVENTS,
  activeTemplate,
  templateAllowedFor,
  renderTemplate,
  deliver,
  runEvent,
  logCommunication,
  flushScheduled,
} from "../lib/automation.mjs";
import { whatsapp, notify } from "./core.mjs";

const router = Router();

const staffAuth = [session, requireRole(STAFF_ROLES, "Staff"), branchScope];
const commsAdmin = [session, requireRole([...ADMIN_ROLES], "Admin"), branchScope];
const superOnly = [session, requireRole([ROLES.SUPER_ADMIN], "Super admin"), branchScope];

const deps = { whatsapp, notify };

const fail = (res, error) =>
  res.status(error?.status || 400).json({ error: error?.message || "Request failed" });

const arrayOf = (value, fallback = []) => {
  if (Array.isArray(value)) return value.map((item) => String(item).trim()).filter(Boolean);
  if (typeof value === "string" && value.trim()) return value.split(",").map((i) => i.trim()).filter(Boolean);
  return fallback;
};

const slug = (value) =>
  String(value || "").toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 60);

// ===========================================================================
// Templates
// ===========================================================================

/** One row per template family: the live version plus how many exist. */
router.get("/api/comms/templates", staffAuth, async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT DISTINCT ON (family_id) t.*,
              (SELECT count(*) FROM message_templates v WHERE v.family_id = t.family_id) AS version_count
         FROM message_templates t
        ORDER BY family_id,
                 CASE status WHEN 'active' THEN 0 WHEN 'pending' THEN 1 WHEN 'draft' THEN 2 ELSE 3 END,
                 version DESC`,
    );
    res.json({ templates: rows, categories: [...new Set(rows.map((row) => row.category))] });
  } catch (error) { fail(res, error); }
});

/**
 * What a counsellor or telecaller may actually pick from, right now, for this
 * student. Everything they are not allowed to use is filtered out server-side
 * rather than hidden in the UI.
 */
router.get("/api/comms/templates/usable", staffAuth, async (req, res) => {
  try {
    const { rows } = await pool.query(
      "SELECT * FROM message_templates WHERE status = 'active' ORDER BY category, name",
    );
    const context = {
      role: req.user.role,
      branchId: req.scope.branchId,
      country: req.query.country ? String(req.query.country) : null,
      intake: req.query.intake ? String(req.query.intake) : null,
      stage: req.query.stage ? String(req.query.stage) : null,
    };
    const channel = req.query.channel ? String(req.query.channel) : null;
    const usable = rows
      .filter((row) => !channel || row.channel === channel)
      .map((row) => ({ row, check: templateAllowedFor(row, context) }))
      .filter((entry) => entry.check.ok)
      .map((entry) => entry.row);
    res.json({ templates: usable });
  } catch (error) { fail(res, error); }
});

router.get("/api/comms/templates/:familyId/versions", staffAuth, async (req, res) => {
  try {
    const { rows } = await pool.query(
      "SELECT * FROM message_templates WHERE family_id = $1 ORDER BY version DESC",
      [req.params.familyId],
    );
    res.json({ versions: rows });
  } catch (error) { fail(res, error); }
});

router.post("/api/comms/templates", commsAdmin, async (req, res) => {
  try {
    const body = req.body || {};
    const name = String(body.name || "").trim();
    if (!name) throw new Error("Template name is required.");
    const code = slug(body.code || name);

    const clash = (await pool.query("SELECT 1 FROM message_templates WHERE code = $1 LIMIT 1", [code])).rows[0];
    if (clash) throw new Error("A template with that code already exists. Create a new version of it instead.");

    const { rows } = await pool.query(
      `INSERT INTO message_templates
         (family_id, code, name, category, channel, language, subject, body, media_url, media_kind,
          meta_template_name, meta_approved, version, status, change_note, allowed_roles,
          allowed_branches, countries, intakes, student_stages, is_bulk_allowed, created_by)
       VALUES (gen_random_uuid(), $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11, 1, 'draft', $12,
               $13,$14::uuid[],$15,$16,$17,$18,$19)
       RETURNING *`,
      [
        code, name, String(body.category || "general"), String(body.channel || "whatsapp"),
        String(body.language || "en"), String(body.subject || ""), String(body.body || ""),
        String(body.media_url || ""), String(body.media_kind || ""),
        String(body.meta_template_name || ""), Boolean(body.meta_approved),
        String(body.change_note || "First version."),
        arrayOf(body.allowed_roles, ["counselor", "telecaller", "admin", "super_admin", "branch_head"]),
        arrayOf(body.allowed_branches, []),
        arrayOf(body.countries, ["All"]),
        arrayOf(body.intakes, ["All"]),
        arrayOf(body.student_stages, ["All"]),
        Boolean(body.is_bulk_allowed),
        req.user.email || req.user.id,
      ],
    );
    await logChange(req, {
      entityType: "message_template", entityId: rows[0].family_id, entityLabel: name,
      action: "create", versionTo: 1, after: rows[0],
    });
    res.json(rows[0]);
  } catch (error) { fail(res, error); }
});

/** Edits a draft in place. Published versions are immutable. */
router.patch("/api/comms/templates/version/:id", commsAdmin, async (req, res) => {
  try {
    const before = (await pool.query("SELECT * FROM message_templates WHERE id = $1", [req.params.id])).rows[0];
    if (!before) throw Object.assign(new Error("Template version not found."), { status: 404 });
    if (!["draft", "pending"].includes(before.status)) {
      throw new Error("A published template cannot be edited. Create a new version instead.");
    }
    const body = req.body || {};
    const { rows } = await pool.query(
      `UPDATE message_templates
          SET name = COALESCE($2, name), category = COALESCE($3, category),
              channel = COALESCE($4, channel), language = COALESCE($5, language),
              subject = COALESCE($6, subject), body = COALESCE($7, body),
              media_url = COALESCE($8, media_url), media_kind = COALESCE($9, media_kind),
              meta_template_name = COALESCE($10, meta_template_name),
              meta_approved = COALESCE($11, meta_approved),
              change_note = COALESCE($12, change_note),
              allowed_roles = COALESCE($13, allowed_roles),
              allowed_branches = COALESCE($14::uuid[], allowed_branches),
              countries = COALESCE($15, countries), intakes = COALESCE($16, intakes),
              student_stages = COALESCE($17, student_stages),
              is_bulk_allowed = COALESCE($18, is_bulk_allowed),
              updated_at = now()
        WHERE id = $1 RETURNING *`,
      [
        req.params.id,
        body.name ?? null, body.category ?? null, body.channel ?? null, body.language ?? null,
        body.subject ?? null, body.body ?? null, body.media_url ?? null, body.media_kind ?? null,
        body.meta_template_name ?? null,
        typeof body.meta_approved === "boolean" ? body.meta_approved : null,
        body.change_note ?? null,
        body.allowed_roles ? arrayOf(body.allowed_roles) : null,
        body.allowed_branches ? arrayOf(body.allowed_branches) : null,
        body.countries ? arrayOf(body.countries) : null,
        body.intakes ? arrayOf(body.intakes) : null,
        body.student_stages ? arrayOf(body.student_stages) : null,
        typeof body.is_bulk_allowed === "boolean" ? body.is_bulk_allowed : null,
      ],
    );
    await logChange(req, {
      entityType: "message_template", entityId: before.family_id, entityLabel: rows[0].name,
      action: "edit_draft", versionTo: before.version, before, after: rows[0],
    });
    res.json(rows[0]);
  } catch (error) { fail(res, error); }
});

/** Submits a draft for approval (2.7: "Create, approve, categorize ..."). */
router.post("/api/comms/templates/version/:id/submit", staffAuth, async (req, res) => {
  try {
    const before = (await pool.query("SELECT * FROM message_templates WHERE id = $1", [req.params.id])).rows[0];
    if (!before) throw Object.assign(new Error("Template version not found."), { status: 404 });
    if (before.status !== "draft") throw new Error("Only a draft can be submitted for approval.");
    if (!String(before.body || "").trim()) throw new Error("Write the message before submitting it.");
    const { rows } = await pool.query(
      "UPDATE message_templates SET status = 'pending', updated_at = now() WHERE id = $1 RETURNING *",
      [req.params.id],
    );
    await logChange(req, {
      entityType: "message_template", entityId: before.family_id, entityLabel: before.name,
      action: "submit", versionTo: before.version,
    });
    res.json(rows[0]);
  } catch (error) { fail(res, error); }
});

/**
 * Approves and publishes. The previously live version goes inactive and points
 * at this one. Nothing is deleted.
 */
router.post("/api/comms/templates/version/:id/approve", commsAdmin, async (req, res) => {
  const client = await pool.connect();
  try {
    const template = (await client.query("SELECT * FROM message_templates WHERE id = $1", [req.params.id])).rows[0];
    if (!template) throw Object.assign(new Error("Template version not found."), { status: 404 });
    if (template.status === "active") throw new Error("This version is already live.");
    if (["inactive", "retired"].includes(template.status)) {
      throw new Error("A retired version cannot be republished. Create a new version from it.");
    }
    if (template.channel === "whatsapp" && !template.meta_template_name && !template.meta_approved) {
      throw new Error("WhatsApp templates need the Meta-approved template name before they can go live.");
    }

    await client.query("BEGIN");
    const previous = (await client.query(
      "SELECT * FROM message_templates WHERE family_id = $1 AND status = 'active' FOR UPDATE",
      [template.family_id],
    )).rows[0];
    if (previous) {
      await client.query(
        "UPDATE message_templates SET status = 'inactive', superseded_by = $2, updated_at = now() WHERE id = $1",
        [previous.id, template.id],
      );
    }
    const { rows } = await client.query(
      `UPDATE message_templates
          SET status = 'active', approved_by = $2, approved_at = now(), updated_at = now()
        WHERE id = $1 RETURNING *`,
      [template.id, req.user.email || req.user.id],
    );
    await client.query("COMMIT");

    await logChange(req, {
      entityType: "message_template", entityId: template.family_id, entityLabel: template.name,
      action: "approve", versionFrom: previous?.version ?? null, versionTo: template.version,
      diff: {
        live_version: { from: previous?.version ?? null, to: template.version },
        body: { from: previous?.body ?? null, to: template.body },
      },
    });
    await audit(req, "template.approve", "message_template", template.id, {
      family: template.family_id, version: template.version,
    });
    res.json(rows[0]);
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    fail(res, error);
  } finally {
    client.release();
  }
});

/** Clones the live version into a new draft. */
router.post("/api/comms/templates/:familyId/revise", commsAdmin, async (req, res) => {
  try {
    const source = (await pool.query(
      `SELECT * FROM message_templates WHERE family_id = $1
        ORDER BY CASE status WHEN 'active' THEN 0 ELSE 1 END, version DESC LIMIT 1`,
      [req.params.familyId],
    )).rows[0];
    if (!source) throw Object.assign(new Error("Template not found."), { status: 404 });

    const open = (await pool.query(
      "SELECT version FROM message_templates WHERE family_id = $1 AND status IN ('draft','pending') LIMIT 1",
      [req.params.familyId],
    )).rows[0];
    if (open) throw new Error(`Version ${open.version} is already open. Finish that one first.`);

    const nextVersion = Number(
      (await pool.query("SELECT COALESCE(max(version),0)+1 AS v FROM message_templates WHERE family_id = $1",
        [req.params.familyId])).rows[0].v,
    );
    const { rows } = await pool.query(
      `INSERT INTO message_templates
         (family_id, code, name, category, channel, language, subject, body, media_url, media_kind,
          meta_template_name, meta_approved, version, status, change_note, allowed_roles,
          allowed_branches, countries, intakes, student_stages, is_bulk_allowed, created_by)
       SELECT family_id, code, name, category, channel, language, subject, body, media_url, media_kind,
              meta_template_name, meta_approved, $2, 'draft', $3, allowed_roles,
              allowed_branches, countries, intakes, student_stages, is_bulk_allowed, $4
         FROM message_templates WHERE id = $1
       RETURNING *`,
      [source.id, nextVersion, String(req.body?.change_note || ""), req.user.email || req.user.id],
    );
    await logChange(req, {
      entityType: "message_template", entityId: source.family_id, entityLabel: source.name,
      action: "new_draft", versionFrom: source.version, versionTo: nextVersion,
    });
    res.json({ ...rows[0], copied_from_version: source.version });
  } catch (error) { fail(res, error); }
});

router.post("/api/comms/templates/:familyId/retire", commsAdmin, async (req, res) => {
  try {
    const { rows } = await pool.query(
      "UPDATE message_templates SET status = 'retired', updated_at = now() WHERE family_id = $1 AND status = 'active' RETURNING *",
      [req.params.familyId],
    );
    if (!rows[0]) throw new Error("This template has no live version to retire.");
    await logChange(req, {
      entityType: "message_template", entityId: req.params.familyId, entityLabel: rows[0].name,
      action: "retire", versionFrom: rows[0].version,
      diff: { reason: { from: null, to: String(req.body?.reason || "") } },
    });
    res.json(rows[0]);
  } catch (error) { fail(res, error); }
});

/** Preview with a student's data filled in, before anything is sent. */
router.post("/api/comms/templates/version/:id/preview", staffAuth, async (req, res) => {
  try {
    const template = (await pool.query("SELECT * FROM message_templates WHERE id = $1", [req.params.id])).rows[0];
    if (!template) throw Object.assign(new Error("Template not found."), { status: 404 });
    const context = req.body?.context || {};
    res.json({
      subject: renderTemplate(template.subject, context),
      body: renderTemplate(template.body, context),
      media_url: template.media_url,
      unresolved: [...String(template.body || "").matchAll(/\{\{\s*([a-zA-Z0-9_.]+)\s*\}\}/g)]
        .map((match) => match[1])
        .filter((key) => !(key in context)),
    });
  } catch (error) { fail(res, error); }
});

// ===========================================================================
// Sending an approved template by hand
// ===========================================================================

router.post("/api/comms/send", staffAuth, async (req, res) => {
  try {
    const body = req.body || {};
    const template = await activeTemplate(String(body.template || ""));
    if (!template) throw new Error("That template is not live.");

    const check = templateAllowedFor(template, {
      role: req.user.role,
      branchId: req.scope.branchId,
      country: body.country,
      intake: body.intake,
      stage: body.stage,
    });
    if (!check.ok) throw Object.assign(new Error(`You cannot use this template here (${check.reason}).`), { status: 403 });

    const recipients = Array.isArray(body.recipients) ? body.recipients : [];
    if (!recipients.length) throw new Error("Choose at least one recipient.");
    if (recipients.length > 1 && !template.is_bulk_allowed) {
      throw Object.assign(new Error("This template is not approved for bulk sending."), { status: 403 });
    }
    if (recipients.length > 1 && !ADMIN_ROLES.includes(req.user.role)) {
      throw Object.assign(new Error("Only an admin can send in bulk."), { status: 403 });
    }

    const results = [];
    for (const recipient of recipients) {
      const row = await deliver({
        channel: template.channel,
        template,
        context: recipient.context || body.context || {},
        recipient: {
          type: recipient.type || "student",
          id: recipient.id,
          address: recipient.address,
          studentId: recipient.student_id || recipient.id,
          branchId: req.scope.branchId,
        },
        sentBy: req.user.email || req.user.id,
        deps,
      });
      results.push({ recipient: recipient.id, status: row.status, reason: row.skip_reason || row.error || "" });
    }
    await audit(req, "comms.send", "message_template", template.id, {
      count: recipients.length, channel: template.channel,
    });
    res.json({ sent: results.filter((r) => r.status === "sent").length, results });
  } catch (error) { fail(res, error); }
});

// ===========================================================================
// Automation rules
// ===========================================================================

router.get("/api/comms/events", staffAuth, (_req, res) => {
  res.json({ events: AUTOMATION_EVENTS });
});

router.get("/api/comms/rules", commsAdmin, async (_req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT r.*, t.name AS template_name, t.channel AS template_channel,
              (SELECT count(*) FROM communication_log l
                WHERE l.rule_id = r.id AND l.created_at > now() - interval '24 hours') AS sent_24h
         FROM communication_rules r
         LEFT JOIN message_templates t ON t.id = r.template_id
        ORDER BY r.event, r.name`,
    );
    res.json({ rules: rows });
  } catch (error) { fail(res, error); }
});

router.post("/api/comms/rules", commsAdmin, async (req, res) => {
  try {
    const body = req.body || {};
    const event = String(body.event || "");
    if (!AUTOMATION_EVENTS.includes(event)) throw new Error("Unknown event.");
    const name = String(body.name || "").trim();
    if (!name) throw new Error("Give the rule a name.");

    const { rows } = await pool.query(
      `INSERT INTO communication_rules
         (name, event, template_id, channel, recipient, delay_minutes, branch_ids, countries,
          conditions, is_active, max_per_day, quiet_start, quiet_end, requires_approval, created_by)
       VALUES ($1,$2,$3::uuid,$4,$5,$6,$7::uuid[],$8,$9::jsonb,false,$10,$11,$12,$13,$14)
       RETURNING *`,
      [
        name, event, body.template_id || null, String(body.channel || "whatsapp"),
        String(body.recipient || "student"), Number(body.delay_minutes || 0),
        arrayOf(body.branch_ids, []), arrayOf(body.countries, ["All"]),
        JSON.stringify(body.conditions || {}),
        Number(body.max_per_day || 200),
        body.quiet_start || null, body.quiet_end || null,
        Boolean(body.requires_approval),
        req.user.email || req.user.id,
      ],
    );
    await logChange(req, {
      entityType: "communication_rule", entityId: rows[0].id, entityLabel: name,
      action: "create", after: rows[0],
    });
    // A new rule is born switched OFF. Someone has to look at it and turn it on.
    res.json(rows[0]);
  } catch (error) { fail(res, error); }
});

router.patch("/api/comms/rules/:id", commsAdmin, async (req, res) => {
  try {
    const before = (await pool.query("SELECT * FROM communication_rules WHERE id = $1", [req.params.id])).rows[0];
    if (!before) throw Object.assign(new Error("Rule not found."), { status: 404 });
    const body = req.body || {};
    const { rows } = await pool.query(
      `UPDATE communication_rules
          SET name = COALESCE($2, name), template_id = COALESCE($3::uuid, template_id),
              channel = COALESCE($4, channel), recipient = COALESCE($5, recipient),
              delay_minutes = COALESCE($6, delay_minutes),
              branch_ids = COALESCE($7::uuid[], branch_ids),
              countries = COALESCE($8, countries),
              conditions = COALESCE($9::jsonb, conditions),
              is_active = COALESCE($10, is_active),
              max_per_day = COALESCE($11, max_per_day),
              quiet_start = COALESCE($12, quiet_start), quiet_end = COALESCE($13, quiet_end),
              requires_approval = COALESCE($14, requires_approval),
              paused_reason = CASE WHEN $10 IS TRUE THEN '' ELSE paused_reason END,
              updated_at = now()
        WHERE id = $1 RETURNING *`,
      [
        req.params.id, body.name ?? null, body.template_id ?? null, body.channel ?? null,
        body.recipient ?? null, body.delay_minutes ?? null,
        body.branch_ids ? arrayOf(body.branch_ids) : null,
        body.countries ? arrayOf(body.countries) : null,
        body.conditions ? JSON.stringify(body.conditions) : null,
        typeof body.is_active === "boolean" ? body.is_active : null,
        body.max_per_day ?? null, body.quiet_start ?? null, body.quiet_end ?? null,
        typeof body.requires_approval === "boolean" ? body.requires_approval : null,
      ],
    );
    await logChange(req, {
      entityType: "communication_rule", entityId: req.params.id, entityLabel: rows[0].name,
      action: before.is_active !== rows[0].is_active ? (rows[0].is_active ? "enable" : "disable") : "update",
      before, after: rows[0],
    });
    await audit(req, "comms.rule", "communication_rule", req.params.id, diffOf(before, rows[0]));
    res.json(rows[0]);
  } catch (error) { fail(res, error); }
});

/** The kill switch: stops every rule at once. */
router.post("/api/comms/rules/stop-all", superOnly, async (req, res) => {
  try {
    const { rowCount } = await pool.query(
      "UPDATE communication_rules SET is_active = false, paused_reason = $1, updated_at = now() WHERE is_active",
      [String(req.body?.reason || "Stopped by super admin")],
    );
    await logChange(req, {
      entityType: "communication_rule", entityId: "*", entityLabel: "all rules",
      action: "stop_all", diff: { stopped: { from: rowCount, to: 0 } },
    });
    await audit(req, "comms.stop_all", "communication_rule", null, { stopped: rowCount });
    res.json({ stopped: rowCount });
  } catch (error) { fail(res, error); }
});

/** Fires a rule's event by hand, so it can be tested before being switched on. */
router.post("/api/comms/rules/:id/test", commsAdmin, async (req, res) => {
  try {
    const rule = (await pool.query("SELECT * FROM communication_rules WHERE id = $1", [req.params.id])).rows[0];
    if (!rule) throw Object.assign(new Error("Rule not found."), { status: 404 });
    const template = rule.template_id ? await activeTemplate(rule.template_id) : null;
    if (!template) throw new Error("This rule has no live template.");
    const address = String(req.body?.address || "");
    if (!address) throw new Error("Give a test phone number or email address.");

    const row = await deliver({
      channel: rule.channel, template, context: req.body?.context || {},
      recipient: { type: "student", id: `test:${req.user.id}`, address, branchId: req.scope.branchId },
      rule: null, sentBy: req.user.email || req.user.id, deps,
    });
    res.json({ status: row.status, reason: row.skip_reason || row.error || "" });
  } catch (error) { fail(res, error); }
});

/** Lets any module fire an event. Used by the CRM screens and by scripts. */
router.post("/api/comms/events/:event", commsAdmin, async (req, res) => {
  try {
    if (!AUTOMATION_EVENTS.includes(req.params.event)) throw new Error("Unknown event.");
    const results = await runEvent(req.params.event, req.body || {}, deps);
    res.json({ results });
  } catch (error) { fail(res, error); }
});

// ===========================================================================
// Delivery log, consent and opt-out
// ===========================================================================

router.get("/api/comms/log", staffAuth, async (req, res) => {
  try {
    const params = [];
    const where = [];
    if (!req.scope.allBranches) {
      params.push(req.scope.branchIds);
      where.push(`(branch_id = ANY($${params.length}::uuid[]) OR branch_id IS NULL)`);
    }
    if (req.query.status) { params.push(String(req.query.status)); where.push(`status = $${params.length}`); }
    if (req.query.channel) { params.push(String(req.query.channel)); where.push(`channel = $${params.length}`); }
    if (req.query.student_id) { params.push(String(req.query.student_id)); where.push(`student_id = $${params.length}`); }
    params.push(Math.min(Number(req.query.limit) || 200, 1000));

    const { rows } = await pool.query(
      `SELECT * FROM communication_log
       ${where.length ? `WHERE ${where.join(" AND ")}` : ""}
       ORDER BY created_at DESC LIMIT $${params.length}`,
      params,
    );
    const { rows: summary } = await pool.query(
      `SELECT status, count(*) AS count FROM communication_log
        WHERE created_at > now() - interval '7 days' GROUP BY status`,
    );
    res.json({ log: rows, last_7_days: summary });
  } catch (error) { fail(res, error); }
});

router.get("/api/comms/consent", staffAuth, async (req, res) => {
  try {
    const { rows } = await pool.query(
      req.query.subject_id
        ? "SELECT * FROM communication_consent WHERE subject_id = $1"
        : "SELECT * FROM communication_consent WHERE opted_out ORDER BY updated_at DESC LIMIT 500",
      req.query.subject_id ? [String(req.query.subject_id)] : [],
    );
    res.json({ consent: rows });
  } catch (error) { fail(res, error); }
});

router.put("/api/comms/consent", staffAuth, async (req, res) => {
  try {
    const body = req.body || {};
    if (!body.subject_id || !body.channel) throw new Error("Subject and channel are required.");
    const { rows } = await pool.query(
      `INSERT INTO communication_consent (subject_type, subject_id, channel, opted_out, consent_at, reason)
       VALUES ($1,$2,$3,$4, CASE WHEN $4 THEN NULL ELSE now() END, $5)
       ON CONFLICT (subject_type, subject_id, channel) DO UPDATE
         SET opted_out = EXCLUDED.opted_out, reason = EXCLUDED.reason,
             consent_at = EXCLUDED.consent_at, updated_at = now()
       RETURNING *`,
      [
        String(body.subject_type || "student"), String(body.subject_id), String(body.channel),
        Boolean(body.opted_out), String(body.reason || ""),
      ],
    );
    await audit(req, "comms.consent", "communication_consent", rows[0].id, {
      subject: body.subject_id, channel: body.channel, opted_out: Boolean(body.opted_out),
    });
    res.json(rows[0]);
  } catch (error) { fail(res, error); }
});

// ===========================================================================
// Out-of-office and working-hours auto-response
// ===========================================================================

router.get("/api/comms/auto-response", staffAuth, async (_req, res) => {
  try {
    const { rows } = await pool.query("SELECT * FROM auto_response_rules ORDER BY scope_type, scope_id");
    res.json({ rules: rows });
  } catch (error) { fail(res, error); }
});

router.put("/api/comms/auto-response", staffAuth, async (req, res) => {
  try {
    const body = req.body || {};
    const scopeType = String(body.scope_type || "global");
    const scopeId = String(body.scope_id || "*");
    if (scopeType !== "user" && !ADMIN_ROLES.includes(req.user.role)) {
      throw Object.assign(new Error("Only an admin can change branch or global auto-replies."), { status: 403 });
    }
    if (scopeType === "user" && scopeId !== String(req.user.id) && !ADMIN_ROLES.includes(req.user.role)) {
      throw Object.assign(new Error("You can only change your own auto-reply."), { status: 403 });
    }
    const before = (await pool.query(
      "SELECT * FROM auto_response_rules WHERE scope_type = $1 AND scope_id = $2", [scopeType, scopeId],
    )).rows[0] || null;

    const { rows } = await pool.query(
      `INSERT INTO auto_response_rules
         (scope_type, scope_id, template_id, message, work_start, work_end, work_days,
          response_time_wording, summary_recipients, is_active, updated_by)
       VALUES ($1,$2,$3::uuid,$4,$5,$6,$7,$8,$9,$10,$11)
       ON CONFLICT (scope_type, scope_id) DO UPDATE
         SET template_id = EXCLUDED.template_id, message = EXCLUDED.message,
             work_start = EXCLUDED.work_start, work_end = EXCLUDED.work_end,
             work_days = EXCLUDED.work_days,
             response_time_wording = EXCLUDED.response_time_wording,
             summary_recipients = EXCLUDED.summary_recipients,
             is_active = EXCLUDED.is_active, updated_by = EXCLUDED.updated_by, updated_at = now()
       RETURNING *`,
      [
        scopeType, scopeId, body.template_id || null, String(body.message || ""),
        body.work_start || "09:30", body.work_end || "18:30",
        Array.isArray(body.work_days) ? body.work_days.map(Number) : [1, 2, 3, 4, 5, 6],
        String(body.response_time_wording || "We usually reply within one working day."),
        arrayOf(body.summary_recipients, []),
        body.is_active !== false,
        req.user.email || req.user.id,
      ],
    );
    await logChange(req, {
      entityType: "auto_response", entityId: rows[0].id, entityLabel: `${scopeType}:${scopeId}`,
      action: before ? "update" : "create", before, after: rows[0],
    });
    res.json(rows[0]);
  } catch (error) { fail(res, error); }
});

/** What an out-of-hours message should get back, if anything. */
router.get("/api/comms/auto-response/resolve", anySession, async (req, res) => {
  try {
    const userId = String(req.query.user_id || "");
    const branchId = String(req.query.branch_id || "");
    const { rows } = await pool.query(
      `SELECT * FROM auto_response_rules
        WHERE is_active
          AND ((scope_type = 'global')
            OR (scope_type = 'branch' AND scope_id = $1)
            OR (scope_type = 'user'   AND scope_id = $2))`,
      [branchId, userId],
    );
    const rank = { global: 0, branch: 1, user: 2 };
    const rule = rows.sort((a, b) => rank[a.scope_type] - rank[b.scope_type]).at(-1);
    if (!rule) return res.json({ reply: null });

    const now = new Date();
    const weekday = now.getDay() === 0 ? 7 : now.getDay();
    const minutes = now.getHours() * 60 + now.getMinutes();
    const toMinutes = (t) => { const [h, m] = String(t).split(":"); return Number(h) * 60 + Number(m || 0); };
    const onShift = (rule.work_days || []).includes(weekday)
      && minutes >= toMinutes(rule.work_start) && minutes < toMinutes(rule.work_end);

    res.json({
      reply: onShift ? null : `${rule.message} ${rule.response_time_wording}`.trim(),
      within_hours: onShift,
      work_start: rule.work_start,
      work_end: rule.work_end,
    });
  } catch (error) { fail(res, error); }
});

// ===========================================================================
// Chat supervision  (2.7: "View chat conversations between Students and
// Counsellors across the platform ... Join an active Student–Counsellor chat
// when required ... with the intervention recorded in chat history and audit
// logs.")
//
// The platform inherited three separate chat stores from the three old repos:
// WhatsApp threads, telecaller threads, and student–counsellor private chats
// (which exist both as real tables and as JSONB records, because the student
// portal and the admin portal each wrote their own). Supervision reads all of
// them through one shape, so a Super Admin reviewing a complaint does not have
// to know which system the conversation happened to land in.
// ===========================================================================

const CONVERSATION_SOURCES = {
  whatsapp: { records: "whatsapp_conversations", messages: "whatsapp_messages" },
  telecaller: { records: "telecaller_conversations", messages: "telecaller_messages" },
  student: { records: "private_conversations", messages: "private_messages" },
};

async function jsonRows(tableName) {
  const { rows } = await pool.query(
    "SELECT id, data, branch_id, created_at FROM app_records WHERE table_name = $1 ORDER BY created_at DESC LIMIT 2000",
    [tableName],
  );
  return rows.map((row) => ({ id: row.id, ...row.data, branch_id: row.branch_id, created_at: row.created_at }));
}

async function listConversations(kind) {
  const source = CONVERSATION_SOURCES[kind];
  if (!source) return [];
  const rows = await jsonRows(source.records);
  const mapped = rows.map((row) => ({
    kind,
    id: String(row.id),
    student_id: String(row.student_id || row.lead_id || row.user_id || ""),
    student_name: row.student_name || row.lead_name || row.contact_name || "",
    staff_id: String(row.assigned_staff_id || row.counselor_id || row.telecaller_id || ""),
    staff_role: row.staff_role || (kind === "telecaller" ? "telecaller" : "counselor"),
    branch_id: row.branch_id || null,
    last_message_at: row.last_message_at || row.updated_at || row.created_at,
  }));

  // The student portal also wrote student–counsellor chats into a real table.
  if (kind === "student") {
    const { rows: sqlRows } = await pool.query(
      "SELECT id, counselor_id, student_id, last_message_at, created_at FROM private_conversations ORDER BY last_message_at DESC NULLS LAST LIMIT 2000",
    );
    const seen = new Set(mapped.map((row) => row.id));
    for (const row of sqlRows) {
      if (seen.has(String(row.id))) continue;
      mapped.push({
        kind, id: String(row.id), student_id: String(row.student_id),
        student_name: "", staff_id: String(row.counselor_id), staff_role: "counselor",
        branch_id: null, last_message_at: row.last_message_at || row.created_at, source: "sql",
      });
    }
  }
  return mapped.sort((a, b) => String(b.last_message_at || "").localeCompare(String(a.last_message_at || "")));
}

async function listMessages(kind, conversationId) {
  const source = CONVERSATION_SOURCES[kind];
  if (!source) return [];
  const rows = await jsonRows(source.messages);
  const mine = rows
    .filter((row) => String(row.conversation_id || "") === String(conversationId))
    .map((row) => ({
      id: String(row.id),
      sender_id: String(row.sender_id || row.from_id || ""),
      sender_role: row.sender_role || row.direction || "",
      body: row.message || row.body || row.text || "",
      created_at: row.created_at,
      is_system: Boolean(row.is_system),
    }));

  if (kind === "student") {
    const { rows: sqlRows } = await pool.query(
      "SELECT id, sender_id, message, created_at FROM private_messages WHERE conversation_id = $1 ORDER BY created_at",
      [conversationId],
    );
    const seen = new Set(mine.map((row) => row.id));
    for (const row of sqlRows) {
      if (seen.has(String(row.id))) continue;
      mine.push({
        id: String(row.id), sender_id: String(row.sender_id), sender_role: "",
        body: row.message, created_at: row.created_at, is_system: false, source: "sql",
      });
    }
  }
  return mine.sort((a, b) => String(a.created_at || "").localeCompare(String(b.created_at || "")));
}

async function recordSupervision(req, { kind, conversationId, action, note = "" }) {
  await pool.query(
    `INSERT INTO chat_supervision_events
       (conversation_type, conversation_id, actor_id, actor_name, actor_role, action, note)
     VALUES ($1,$2,$3,$4,$5,$6,$7)`,
    [kind, String(conversationId), String(req.user.id), req.user.email || "", req.user.role, action, note],
  );
}

router.get("/api/comms/supervision/conversations", commsAdmin, async (req, res) => {
  try {
    const kinds = req.query.kind ? [String(req.query.kind)] : Object.keys(CONVERSATION_SOURCES);
    let all = [];
    for (const kind of kinds) all = all.concat(await listConversations(kind));
    if (!req.scope.allBranches) {
      const allowed = new Set(req.scope.branchIds.map(String));
      all = all.filter((row) => !row.branch_id || allowed.has(String(row.branch_id)));
    }
    res.json({ conversations: all.slice(0, Number(req.query.limit) || 300) });
  } catch (error) { fail(res, error); }
});

router.get("/api/comms/supervision/:kind/:id", commsAdmin, async (req, res) => {
  try {
    if (!CONVERSATION_SOURCES[req.params.kind]) throw new Error("Unknown conversation type.");
    const messages = await listMessages(req.params.kind, req.params.id);
    await recordSupervision(req, { kind: req.params.kind, conversationId: req.params.id, action: "view" });
    await audit(req, "chat.view", "conversation", req.params.id, { kind: req.params.kind, messages: messages.length });

    const { rows: history } = await pool.query(
      "SELECT * FROM chat_supervision_events WHERE conversation_id = $1 ORDER BY created_at DESC LIMIT 50",
      [req.params.id],
    );
    res.json({ messages, supervision_history: history });
  } catch (error) { fail(res, error); }
});

/**
 * Joining a conversation. The join itself is written into the thread as a
 * system message, so the student and the counsellor both see that a manager
 * is present — supervision is recorded, not covert.
 */
router.post("/api/comms/supervision/:kind/:id/join", commsAdmin, async (req, res) => {
  try {
    const source = CONVERSATION_SOURCES[req.params.kind];
    if (!source) throw new Error("Unknown conversation type.");
    const note = String(req.body?.reason || "Joined for review");

    await pool.query(
      `INSERT INTO app_records (id, table_name, data)
       VALUES (gen_random_uuid()::text, $1, $2::jsonb)`,
      [
        source.messages,
        JSON.stringify({
          conversation_id: String(req.params.id),
          sender_id: String(req.user.id),
          sender_role: req.user.role,
          message: `${req.user.email || "A supervisor"} joined this conversation — ${note}`,
          is_system: true,
          created_at: new Date().toISOString(),
        }),
      ],
    );
    await recordSupervision(req, { kind: req.params.kind, conversationId: req.params.id, action: "join", note });
    await audit(req, "chat.join", "conversation", req.params.id, { kind: req.params.kind, reason: note });
    res.json({ ok: true, joined: true });
  } catch (error) { fail(res, error); }
});

router.post("/api/comms/supervision/:kind/:id/message", commsAdmin, async (req, res) => {
  try {
    const source = CONVERSATION_SOURCES[req.params.kind];
    if (!source) throw new Error("Unknown conversation type.");
    const message = String(req.body?.message || "").trim();
    if (!message) throw new Error("Write a message.");

    await pool.query(
      `INSERT INTO app_records (id, table_name, data)
       VALUES (gen_random_uuid()::text, $1, $2::jsonb)`,
      [
        source.messages,
        JSON.stringify({
          conversation_id: String(req.params.id),
          sender_id: String(req.user.id),
          sender_role: req.user.role,
          message,
          is_supervisor: true,
          created_at: new Date().toISOString(),
        }),
      ],
    );
    await recordSupervision(req, { kind: req.params.kind, conversationId: req.params.id, action: "message" });
    res.json({ ok: true });
  } catch (error) { fail(res, error); }
});

// ===========================================================================
// Student escalation  (2.7: "Receive and review chat escalation reports
// submitted by Students from Student–Counsellor conversations")
// ===========================================================================

router.post("/api/comms/escalations", anySession, async (req, res) => {
  try {
    const body = req.body || {};
    const studentId = req.user.role === ROLES.STUDENT ? String(req.user.id) : String(body.student_id || "");
    if (!studentId) throw new Error("Student is required.");
    if (!String(body.reason || "").trim()) throw new Error("Tell us what the problem is.");

    const { rows } = await pool.query(
      `INSERT INTO chat_escalations
         (conversation_type, conversation_id, message_id, reported_message, student_id,
          counselor_id, branch_id, reason, category)
       VALUES ($1,$2,$3,$4,$5,$6,$7::uuid,$8,$9)
       RETURNING *`,
      [
        String(body.conversation_type || "student"), String(body.conversation_id || ""),
        String(body.message_id || ""), String(body.reported_message || "").slice(0, 2000),
        studentId, body.counselor_id || null, body.branch_id || null,
        String(body.reason).slice(0, 1000), String(body.category || "other"),
      ],
    );

    const { rows: admins } = await pool.query(
      "SELECT user_id FROM user_roles WHERE role IN ('super_admin','admin') AND is_active",
    );
    for (const admin of admins) {
      await raiseAlert({
        userId: String(admin.user_id),
        role: ROLES.SUPER_ADMIN,
        branchId: body.branch_id || null,
        alertType: "escalation_raised",
        title: "A student reported a conversation",
        body: String(body.reason).slice(0, 200),
        link: "/escalations",
        entityType: "chat_escalation",
        entityId: rows[0].id,
      }).catch(() => undefined);
    }
    res.json(rows[0]);
  } catch (error) { fail(res, error); }
});

router.get("/api/comms/escalations", commsAdmin, async (req, res) => {
  try {
    const params = [];
    const where = [];
    if (req.query.status) { params.push(String(req.query.status)); where.push(`status = $${params.length}`); }
    if (!req.scope.allBranches) {
      params.push(req.scope.branchIds);
      where.push(`(branch_id = ANY($${params.length}::uuid[]) OR branch_id IS NULL)`);
    }
    const { rows } = await pool.query(
      `SELECT * FROM chat_escalations
       ${where.length ? `WHERE ${where.join(" AND ")}` : ""}
       ORDER BY CASE status WHEN 'open' THEN 0 WHEN 'reviewing' THEN 1 ELSE 2 END, created_at DESC
       LIMIT 500`,
      params,
    );
    res.json({ escalations: rows });
  } catch (error) { fail(res, error); }
});

router.patch("/api/comms/escalations/:id", commsAdmin, async (req, res) => {
  try {
    const before = (await pool.query("SELECT * FROM chat_escalations WHERE id = $1", [req.params.id])).rows[0];
    if (!before) throw Object.assign(new Error("Escalation not found."), { status: 404 });
    const status = String(req.body?.status || before.status);
    const { rows } = await pool.query(
      `UPDATE chat_escalations
          SET status = $2,
              handled_by = $3,
              resolution_note = COALESCE($4, resolution_note),
              resolved_at = CASE WHEN $2 IN ('resolved','dismissed') THEN now() ELSE resolved_at END
        WHERE id = $1 RETURNING *`,
      [req.params.id, status, req.user.email || req.user.id, req.body?.resolution_note ?? null],
    );
    await audit(req, "escalation.update", "chat_escalation", req.params.id, diffOf(before, rows[0]));
    res.json(rows[0]);
  } catch (error) { fail(res, error); }
});

// ===========================================================================
// Scheduled sends: anything queued with a delay that is now due.
// Started from index.mjs; exported rather than self-starting so tests can
// drive it directly.
// ===========================================================================

export function startCommsScheduler({ intervalMs = 60000 } = {}) {
  const tick = async () => {
    try {
      const sent = await flushScheduled(deps, { limit: 50 });
      if (sent) console.log(`communications: sent ${sent} scheduled message(s)`);
    } catch (error) {
      console.error("communications scheduler failed:", error.message || error);
    }
  };
  const timer = setInterval(tick, intervalMs);
  if (timer.unref) timer.unref();
  return timer;
}

export default router;
