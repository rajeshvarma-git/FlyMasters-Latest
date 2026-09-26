/**
 * CRM section 2.6 — Country, Document, University and Course Configuration,
 * plus 2.6.1 (configurable sound and visual alerts) and 2.6.2 (country-wise
 * checklists and the status workflow).
 *
 * The whole section rests on one promise the client made explicitly: nothing
 * is ever deleted. A checklist that changes does not overwrite the old one —
 * the old version keeps its row, moves to `inactive`, and points at the
 * version that replaced it. Students already mid-application stay pinned to
 * the version that was live when their checklist was activated, so publishing
 * a new Canada checklist on Tuesday does not silently change the requirements
 * for the forty students who started on Monday.
 *
 * Route map:
 *   /api/config/documents      document master (2.6 bullets 3, 4)
 *   /api/config/reasons        rejection reasons and request templates
 *   /api/config/statuses       the status vocabulary the Super Admin owns
 *   /api/config/checklists     versioned country checklists
 *   /api/students/:id/...      activation, item updates, progress bar
 *   /api/alerts/...            2.6.1
 *   /api/config/changes        developer-only change history
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
import { logChange, readChanges, developerOnly, isDeveloper, diffOf } from "../lib/changelog.mjs";
import { raiseAlert, pendingAlerts, ALERT_TYPES } from "../lib/alerts.mjs";

const router = Router();

const staffAuth = [session, requireRole(STAFF_ROLES, "Staff"), branchScope];
const configAuth = [session, requireRole([...ADMIN_ROLES], "Admin"), branchScope];
const superOnly = [session, requireRole([ROLES.SUPER_ADMIN], "Super admin"), branchScope];
const counsellorOrAdmin = [
  session,
  requireRole([ROLES.COUNSELOR, ROLES.BRANCH_HEAD, ...ADMIN_ROLES], "Counsellor"),
  branchScope,
];

const fail = (res, error) =>
  res.status(error?.status || 400).json({ error: error?.message || "Request failed" });

const arrayOf = (value, fallback = []) => {
  if (Array.isArray(value)) return value.map((item) => String(item).trim()).filter(Boolean);
  if (typeof value === "string" && value.trim()) {
    return value.split(",").map((item) => item.trim()).filter(Boolean);
  }
  return fallback;
};

const slug = (value) =>
  String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 60);

// ===========================================================================
// Document master  (2.6: "Define master document records with document name,
// description, maximum upload size, accepted format, mandatory or optional
// flag, country applicability, and checklist usage rules.")
// ===========================================================================

router.get("/api/config/documents", staffAuth, async (req, res) => {
  try {
    const includeInactive = String(req.query.all || "") === "1";
    const { rows } = await pool.query(
      `SELECT * FROM document_master ${includeInactive ? "" : "WHERE is_active"} ORDER BY name`,
    );
    res.json({ documents: rows });
  } catch (error) { fail(res, error); }
});

router.post("/api/config/documents", configAuth, async (req, res) => {
  try {
    const body = req.body || {};
    const name = String(body.name || "").trim();
    if (!name) throw new Error("Document name is required.");
    const code = slug(body.code || name);

    const { rows } = await pool.query(
      `INSERT INTO document_master
         (code, name, description, accepted_formats, max_size_mb, naming_convention,
          requires_expiry, validity_months, sample_instructions, review_instructions,
          country_scope, restricted_visible, retention_days, secure_download, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)
       RETURNING *`,
      [
        code, name, String(body.description || ""),
        arrayOf(body.accepted_formats, ["pdf"]),
        Number(body.max_size_mb || 20),
        String(body.naming_convention || ""),
        Boolean(body.requires_expiry),
        body.validity_months ? Number(body.validity_months) : null,
        String(body.sample_instructions || ""),
        String(body.review_instructions || ""),
        arrayOf(body.country_scope, ["All"]),
        Boolean(body.restricted_visible),
        body.retention_days ? Number(body.retention_days) : null,
        Boolean(body.secure_download),
        req.user.email || req.user.id,
      ],
    );
    const row = rows[0];
    await logChange(req, {
      entityType: "document_master", entityId: row.id, entityLabel: row.name,
      action: "create", after: row,
    });
    await audit(req, "document_master.create", "document_master", row.id, { name });
    res.json(row);
  } catch (error) {
    if (String(error.message).includes("duplicate key")) {
      return fail(res, new Error("A document with that code already exists."));
    }
    fail(res, error);
  }
});

const DOC_FIELDS = [
  "name", "description", "accepted_formats", "max_size_mb", "naming_convention",
  "requires_expiry", "validity_months", "sample_instructions", "review_instructions",
  "country_scope", "restricted_visible", "retention_days", "secure_download", "is_active",
];

router.patch("/api/config/documents/:id", configAuth, async (req, res) => {
  try {
    const before = (await pool.query("SELECT * FROM document_master WHERE id = $1", [req.params.id])).rows[0];
    if (!before) throw Object.assign(new Error("Document not found."), { status: 404 });

    const sets = [];
    const params = [];
    for (const field of DOC_FIELDS) {
      if (!(field in (req.body || {}))) continue;
      let value = req.body[field];
      if (field === "accepted_formats" || field === "country_scope") value = arrayOf(value, before[field]);
      if (field === "max_size_mb") value = Number(value);
      if (["requires_expiry", "restricted_visible", "secure_download", "is_active"].includes(field)) {
        value = Boolean(value);
      }
      if (["validity_months", "retention_days"].includes(field)) value = value ? Number(value) : null;
      params.push(value);
      sets.push(`${field} = $${params.length}`);
    }
    if (!sets.length) return res.json(before);
    params.push(req.params.id);

    const { rows } = await pool.query(
      `UPDATE document_master SET ${sets.join(", ")}, updated_at = now()
        WHERE id = $${params.length} RETURNING *`,
      params,
    );
    const after = rows[0];
    await logChange(req, {
      entityType: "document_master", entityId: after.id, entityLabel: after.name,
      action: before.is_active && !after.is_active ? "archive" : "update",
      before, after,
    });
    await audit(req, "document_master.update", "document_master", after.id, diffOf(before, after));
    res.json(after);
  } catch (error) { fail(res, error); }
});

// ===========================================================================
// Rejection reasons, approval rules and additional-document request templates
// ===========================================================================

router.get("/api/config/reasons", staffAuth, async (req, res) => {
  try {
    const kind = req.query.kind ? String(req.query.kind) : null;
    const { rows } = await pool.query(
      kind
        ? "SELECT * FROM document_reason_master WHERE is_active AND kind = $1 ORDER BY label"
        : "SELECT * FROM document_reason_master WHERE is_active ORDER BY kind, label",
      kind ? [kind] : [],
    );
    res.json({ reasons: rows });
  } catch (error) { fail(res, error); }
});

router.post("/api/config/reasons", configAuth, async (req, res) => {
  try {
    const body = req.body || {};
    const kind = String(body.kind || "rejection");
    const label = String(body.label || "").trim();
    if (!label) throw new Error("Label is required.");
    const { rows } = await pool.query(
      `INSERT INTO document_reason_master (kind, code, label, body)
       VALUES ($1,$2,$3,$4)
       ON CONFLICT (kind, code) DO UPDATE SET label = EXCLUDED.label, body = EXCLUDED.body, is_active = true
       RETURNING *`,
      [kind, slug(body.code || label), label, String(body.body || "")],
    );
    await logChange(req, {
      entityType: "document_reason", entityId: rows[0].id, entityLabel: label,
      action: "upsert", after: rows[0],
    });
    res.json(rows[0]);
  } catch (error) { fail(res, error); }
});

router.patch("/api/config/reasons/:id", configAuth, async (req, res) => {
  try {
    const before = (await pool.query("SELECT * FROM document_reason_master WHERE id = $1", [req.params.id])).rows[0];
    if (!before) throw Object.assign(new Error("Reason not found."), { status: 404 });
    const { rows } = await pool.query(
      `UPDATE document_reason_master
          SET label = COALESCE($2, label), body = COALESCE($3, body),
              is_active = COALESCE($4, is_active)
        WHERE id = $1 RETURNING *`,
      [
        req.params.id,
        req.body?.label ?? null,
        req.body?.body ?? null,
        typeof req.body?.is_active === "boolean" ? req.body.is_active : null,
      ],
    );
    await logChange(req, {
      entityType: "document_reason", entityId: req.params.id, entityLabel: rows[0].label,
      action: "update", before, after: rows[0],
    });
    res.json(rows[0]);
  } catch (error) { fail(res, error); }
});

// ===========================================================================
// Status vocabulary  (2.6.2: "Super Admin can define document, application,
// visa, commission-visibility, and next-step statuses that Counsellors must
// use when updating student progress.")
// ===========================================================================

const STATUS_KINDS = ["document", "application", "visa", "commission_visibility", "next_step"];

router.get("/api/config/statuses", anySession, async (req, res) => {
  try {
    const kind = req.query.kind ? String(req.query.kind) : null;
    if (kind && !STATUS_KINDS.includes(kind)) throw new Error("Unknown status kind.");
    const { rows } = await pool.query(
      kind
        ? "SELECT * FROM status_vocabulary WHERE is_active AND kind = $1 ORDER BY stage_index, label"
        : "SELECT * FROM status_vocabulary WHERE is_active ORDER BY kind, stage_index, label",
      kind ? [kind] : [],
    );
    // A student or an agent never sees a status the Super Admin marked internal.
    const audience =
      req.user?.role === ROLES.STUDENT ? "student"
      : req.user?.role === ROLES.PARTNER ? "partner"
      : "staff";
    res.json({ statuses: rows.filter((row) => (row.visible_to || []).includes(audience)) });
  } catch (error) { fail(res, error); }
});

router.post("/api/config/statuses", configAuth, async (req, res) => {
  try {
    const body = req.body || {};
    const kind = String(body.kind || "");
    if (!STATUS_KINDS.includes(kind)) throw new Error("Unknown status kind.");
    const label = String(body.label || "").trim();
    if (!label) throw new Error("Label is required.");
    const { rows } = await pool.query(
      `INSERT INTO status_vocabulary
         (kind, code, label, description, color, icon, stage_index, is_terminal, visible_to)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
       ON CONFLICT (kind, code) DO UPDATE
         SET label = EXCLUDED.label, description = EXCLUDED.description, color = EXCLUDED.color,
             icon = EXCLUDED.icon, stage_index = EXCLUDED.stage_index,
             is_terminal = EXCLUDED.is_terminal, visible_to = EXCLUDED.visible_to, is_active = true
       RETURNING *`,
      [
        kind, slug(body.code || label), label, String(body.description || ""),
        String(body.color || "slate"), String(body.icon || ""),
        Number(body.stage_index || 0), Boolean(body.is_terminal),
        arrayOf(body.visible_to, ["staff", "student", "partner"]),
      ],
    );
    await logChange(req, {
      entityType: "status_vocabulary", entityId: rows[0].id, entityLabel: `${kind}/${rows[0].code}`,
      action: "upsert", after: rows[0],
    });
    res.json(rows[0]);
  } catch (error) { fail(res, error); }
});

// Retiring a status never deletes it — historical records still reference it.
router.patch("/api/config/statuses/:id", configAuth, async (req, res) => {
  try {
    const before = (await pool.query("SELECT * FROM status_vocabulary WHERE id = $1", [req.params.id])).rows[0];
    if (!before) throw Object.assign(new Error("Status not found."), { status: 404 });
    const { rows } = await pool.query(
      `UPDATE status_vocabulary
          SET label = COALESCE($2, label), color = COALESCE($3, color),
              description = COALESCE($4, description), stage_index = COALESCE($5, stage_index),
              is_terminal = COALESCE($6, is_terminal), visible_to = COALESCE($7, visible_to),
              is_active = COALESCE($8, is_active)
        WHERE id = $1 RETURNING *`,
      [
        req.params.id,
        req.body?.label ?? null,
        req.body?.color ?? null,
        req.body?.description ?? null,
        req.body?.stage_index ?? null,
        typeof req.body?.is_terminal === "boolean" ? req.body.is_terminal : null,
        req.body?.visible_to ? arrayOf(req.body.visible_to) : null,
        typeof req.body?.is_active === "boolean" ? req.body.is_active : null,
      ],
    );
    await logChange(req, {
      entityType: "status_vocabulary", entityId: req.params.id,
      entityLabel: `${before.kind}/${before.code}`, action: "update", before, after: rows[0],
    });
    res.json(rows[0]);
  } catch (error) { fail(res, error); }
});

// ===========================================================================
// Versioned country checklists
// ===========================================================================

async function itemsFor(templateId) {
  const { rows } = await pool.query(
    `SELECT i.*, d.name, d.code, d.description, d.accepted_formats, d.max_size_mb,
            d.sample_instructions, d.review_instructions, d.requires_expiry AS master_requires_expiry
       FROM checklist_template_items i
       JOIN document_master d ON d.id = i.document_master_id
      WHERE i.template_id = $1
      ORDER BY i.display_order, d.name`,
    [templateId],
  );
  return rows;
}

/** One row per checklist family: the live version, plus how many exist. */
router.get("/api/config/checklists", staffAuth, async (_req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT DISTINCT ON (family_id) t.*,
              (SELECT count(*) FROM checklist_templates v WHERE v.family_id = t.family_id) AS version_count,
              (SELECT count(*) FROM checklist_template_items ci WHERE ci.template_id = t.id) AS item_count
         FROM checklist_templates t
        ORDER BY family_id,
                 CASE status WHEN 'active' THEN 0 WHEN 'draft' THEN 1 ELSE 2 END,
                 version DESC`,
    );
    res.json({ checklists: rows });
  } catch (error) { fail(res, error); }
});

/** Every version of one family, newest first. This is the history screen. */
router.get("/api/config/checklists/:familyId/versions", staffAuth, async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT t.*, (SELECT count(*) FROM checklist_template_items ci WHERE ci.template_id = t.id) AS item_count
         FROM checklist_templates t WHERE family_id = $1 ORDER BY version DESC`,
      [req.params.familyId],
    );
    res.json({ versions: rows });
  } catch (error) { fail(res, error); }
});

router.get("/api/config/checklists/version/:id", staffAuth, async (req, res) => {
  try {
    const { rows } = await pool.query("SELECT * FROM checklist_templates WHERE id = $1", [req.params.id]);
    if (!rows[0]) throw Object.assign(new Error("Checklist version not found."), { status: 404 });
    res.json({ template: rows[0], items: await itemsFor(req.params.id) });
  } catch (error) { fail(res, error); }
});

/** Creates version 1 of a new family, as a draft. */
router.post("/api/config/checklists", configAuth, async (req, res) => {
  try {
    const body = req.body || {};
    const name = String(body.name || "").trim();
    if (!name) throw new Error("Checklist name is required.");
    const { rows } = await pool.query(
      `INSERT INTO checklist_templates
         (family_id, name, country, application_stage, visa_stage, course_level, intake,
          institution_type, version, status, change_note, created_by)
       VALUES (gen_random_uuid(), $1,$2,$3,$4,$5,$6,$7, 1, 'draft', $8, $9)
       RETURNING *`,
      [
        name, String(body.country || "All"), String(body.application_stage || "All"),
        String(body.visa_stage || "All"), String(body.course_level || "All"),
        String(body.intake || "All"), String(body.institution_type || "All"),
        String(body.change_note || "First version."),
        req.user.email || req.user.id,
      ],
    );
    await logChange(req, {
      entityType: "checklist_template", entityId: rows[0].family_id, entityLabel: name,
      action: "create", versionTo: 1, after: rows[0],
    });
    res.json(rows[0]);
  } catch (error) { fail(res, error); }
});

/**
 * Replaces the items on a DRAFT version. An active or inactive version is
 * immutable — that is the whole point of pinning students to a version.
 */
router.put("/api/config/checklists/version/:id/items", configAuth, async (req, res) => {
  const client = await pool.connect();
  try {
    const template = (await client.query("SELECT * FROM checklist_templates WHERE id = $1", [req.params.id])).rows[0];
    if (!template) throw Object.assign(new Error("Checklist version not found."), { status: 404 });
    if (template.status !== "draft") {
      throw new Error("Published versions cannot be edited. Create a new version instead.");
    }
    const before = await itemsFor(template.id);
    const items = Array.isArray(req.body?.items) ? req.body.items : [];

    await client.query("BEGIN");
    await client.query("DELETE FROM checklist_template_items WHERE template_id = $1", [template.id]);
    let order = 0;
    for (const item of items) {
      if (!item?.document_master_id) continue;
      await client.query(
        `INSERT INTO checklist_template_items
           (template_id, document_master_id, requirement, condition_note, requires_expiry, display_order)
         VALUES ($1,$2,$3,$4,$5,$6)
         ON CONFLICT (template_id, document_master_id) DO UPDATE
           SET requirement = EXCLUDED.requirement, condition_note = EXCLUDED.condition_note,
               requires_expiry = EXCLUDED.requires_expiry, display_order = EXCLUDED.display_order`,
        [
          template.id, item.document_master_id,
          String(item.requirement || "mandatory"),
          String(item.condition_note || ""),
          Boolean(item.requires_expiry),
          Number.isFinite(Number(item.display_order)) ? Number(item.display_order) : order,
        ],
      );
      order += 1;
    }
    await client.query("COMMIT");

    const after = await itemsFor(template.id);
    await logChange(req, {
      entityType: "checklist_template", entityId: template.family_id, entityLabel: template.name,
      action: "edit_draft", versionTo: template.version,
      diff: {
        items: {
          from: before.map((row) => `${row.code}:${row.requirement}`),
          to: after.map((row) => `${row.code}:${row.requirement}`),
        },
      },
    });
    res.json({ template, items: after });
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    fail(res, error);
  } finally {
    client.release();
  }
});

/**
 * Publishes a draft. The version that was live becomes `inactive` and points
 * at this one via superseded_by. It keeps every row it had: students pinned to
 * it continue to see exactly the checklist they started with.
 */
router.post("/api/config/checklists/version/:id/publish", configAuth, async (req, res) => {
  const client = await pool.connect();
  try {
    const template = (await client.query("SELECT * FROM checklist_templates WHERE id = $1", [req.params.id])).rows[0];
    if (!template) throw Object.assign(new Error("Checklist version not found."), { status: 404 });
    if (template.status === "active") throw new Error("This version is already live.");
    if (template.status === "inactive") throw new Error("A retired version cannot be republished. Create a new version from it.");

    const itemCount = Number(
      (await client.query("SELECT count(*) FROM checklist_template_items WHERE template_id = $1", [template.id])).rows[0].count,
    );
    if (!itemCount) throw new Error("Add at least one document before publishing.");

    await client.query("BEGIN");
    const previous = (await client.query(
      "SELECT * FROM checklist_templates WHERE family_id = $1 AND status = 'active' FOR UPDATE",
      [template.family_id],
    )).rows[0];

    if (previous) {
      await client.query(
        "UPDATE checklist_templates SET status = 'inactive', superseded_by = $2, updated_at = now() WHERE id = $1",
        [previous.id, template.id],
      );
    }
    const { rows } = await client.query(
      "UPDATE checklist_templates SET status = 'active', published_at = now(), updated_at = now() WHERE id = $1 RETURNING *",
      [template.id],
    );
    await client.query("COMMIT");

    await logChange(req, {
      entityType: "checklist_template", entityId: template.family_id, entityLabel: template.name,
      action: "publish", versionFrom: previous?.version ?? null, versionTo: template.version,
      diff: {
        note: { from: previous?.change_note || null, to: template.change_note },
        live_version: { from: previous?.version ?? null, to: template.version },
      },
    });
    await audit(req, "checklist.publish", "checklist_template", template.id, {
      family: template.family_id, version: template.version, replaced: previous?.version ?? null,
    });
    res.json(rows[0]);
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    fail(res, error);
  } finally {
    client.release();
  }
});

/** Clones the live (or newest) version into a fresh draft. Never edits in place. */
router.post("/api/config/checklists/:familyId/revise", configAuth, async (req, res) => {
  const client = await pool.connect();
  try {
    const source = (await client.query(
      `SELECT * FROM checklist_templates WHERE family_id = $1
        ORDER BY CASE status WHEN 'active' THEN 0 ELSE 1 END, version DESC LIMIT 1`,
      [req.params.familyId],
    )).rows[0];
    if (!source) throw Object.assign(new Error("Checklist not found."), { status: 404 });

    const openDraft = (await client.query(
      "SELECT id, version FROM checklist_templates WHERE family_id = $1 AND status = 'draft' LIMIT 1",
      [req.params.familyId],
    )).rows[0];
    if (openDraft) throw new Error(`Version ${openDraft.version} is already an open draft. Publish or edit that one.`);

    const nextVersion = Number(
      (await client.query("SELECT COALESCE(max(version),0) + 1 AS v FROM checklist_templates WHERE family_id = $1",
        [req.params.familyId])).rows[0].v,
    );

    await client.query("BEGIN");
    const { rows } = await client.query(
      `INSERT INTO checklist_templates
         (family_id, name, country, application_stage, visa_stage, course_level, intake,
          institution_type, version, status, change_note, created_by)
       SELECT family_id, $2, country, application_stage, visa_stage, course_level, intake,
              institution_type, $3, 'draft', $4, $5
         FROM checklist_templates WHERE id = $1
       RETURNING *`,
      [
        source.id,
        String(req.body?.name || source.name),
        nextVersion,
        String(req.body?.change_note || ""),
        req.user.email || req.user.id,
      ],
    );
    await client.query(
      `INSERT INTO checklist_template_items
         (template_id, document_master_id, requirement, condition_note, requires_expiry, display_order)
       SELECT $1, document_master_id, requirement, condition_note, requires_expiry, display_order
         FROM checklist_template_items WHERE template_id = $2`,
      [rows[0].id, source.id],
    );
    await client.query("COMMIT");

    await logChange(req, {
      entityType: "checklist_template", entityId: source.family_id, entityLabel: source.name,
      action: "new_draft", versionFrom: source.version, versionTo: nextVersion,
    });
    res.json({ ...rows[0], copied_from_version: source.version });
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    fail(res, error);
  } finally {
    client.release();
  }
});

/** Retires the live version of a family. Rows are kept; nothing is deleted. */
router.post("/api/config/checklists/:familyId/retire", configAuth, async (req, res) => {
  try {
    const { rows } = await pool.query(
      "UPDATE checklist_templates SET status = 'inactive', updated_at = now() WHERE family_id = $1 AND status = 'active' RETURNING *",
      [req.params.familyId],
    );
    if (!rows[0]) throw new Error("This checklist has no live version to retire.");
    await logChange(req, {
      entityType: "checklist_template", entityId: req.params.familyId, entityLabel: rows[0].name,
      action: "retire", versionFrom: rows[0].version,
      diff: { reason: { from: null, to: String(req.body?.reason || "") } },
    });
    res.json(rows[0]);
  } catch (error) { fail(res, error); }
});

// ===========================================================================
// Student checklists: activation, version pinning, duplicate detection
// ===========================================================================

/** Leads and converted students live as JSONB in app_records, not in a table. */
async function studentRecord(studentId) {
  const { rows } = await pool.query(
    "SELECT id, data, branch_id FROM app_records WHERE id = $1 AND table_name = 'student_leads'",
    [String(studentId)],
  );
  const row = rows[0];
  return row ? { id: row.id, ...row.data, branch_id: row.branch_id } : null;
}

function inScope(req, branchId) {
  if (req.scope?.allBranches) return true;
  return (req.scope?.branchIds || []).map(String).includes(String(branchId || ""));
}

/**
 * Cross-country duplicate handling (2.6, bullet: "Control duplicate-document
 * handling when one student is processed for multiple countries").
 *
 * Looks for the same document already accepted anywhere else for this student.
 * When found the new item is created as `not_required` and points back at the
 * accepted one, so the student is never asked to upload a passport twice while
 * each country's checklist still tracks its own completeness.
 */
async function acceptedElsewhere(client, studentId, documentMasterId, exceptChecklistId = null) {
  const { rows } = await client.query(
    `SELECT i.id
       FROM student_checklist_items i
       JOIN student_checklists c ON c.id = i.student_checklist_id
      WHERE c.student_id = $1
        AND i.document_master_id = $2
        AND i.status_code = 'accepted'
        AND ($3::uuid IS NULL OR i.student_checklist_id <> $3::uuid)
      LIMIT 1`,
    [String(studentId), documentMasterId, exceptChecklistId],
  );
  return rows[0]?.id || null;
}

router.get("/api/students/:id/checklists", staffAuth, async (req, res) => {
  try {
    const student = await studentRecord(req.params.id);
    if (!student) throw Object.assign(new Error("Student not found."), { status: 404 });
    if (!inScope(req, student.branch_id)) throw Object.assign(new Error("Not your branch."), { status: 403 });

    const { rows: lists } = await pool.query(
      `SELECT c.*, t.name, t.version, t.status AS template_status, t.country AS template_country,
              t.application_stage, t.visa_stage, t.course_level, t.intake
         FROM student_checklists c
         JOIN checklist_templates t ON t.id = c.template_id
        WHERE c.student_id = $1 AND c.is_active
        ORDER BY c.activated_at`,
      [String(req.params.id)],
    );

    for (const list of lists) {
      const { rows: items } = await pool.query(
        `SELECT i.*, d.name, d.code, d.description, d.accepted_formats, d.max_size_mb,
                d.sample_instructions, d.requires_expiry AS master_requires_expiry
           FROM student_checklist_items i
           JOIN document_master d ON d.id = i.document_master_id
          WHERE i.student_checklist_id = $1
          ORDER BY d.name`,
        [list.id],
      );
      list.items = items;
      const countable = items.filter((item) => item.requirement === "mandatory");
      const done = countable.filter((item) => item.status_code === "accepted" || item.status_code === "not_required");
      list.progress = countable.length ? Math.round((done.length / countable.length) * 100) : 0;
    }
    res.json({ checklists: lists });
  } catch (error) { fail(res, error); }
});

/**
 * Activates a checklist for a student (2.6.2: "Once a country checklist is
 * finalized, Counsellors can activate the relevant checklist for assigned
 * students based on the country or countries being processed.")
 *
 * The student is pinned to whichever version is live right now.
 */
router.post("/api/students/:id/checklists", counsellorOrAdmin, async (req, res) => {
  const client = await pool.connect();
  try {
    const student = await studentRecord(req.params.id);
    if (!student) throw Object.assign(new Error("Student not found."), { status: 404 });
    if (!inScope(req, student.branch_id)) throw Object.assign(new Error("Not your branch."), { status: 403 });

    const familyId = String(req.body?.family_id || "");
    if (!familyId) throw new Error("Choose a checklist to activate.");

    const template = (await client.query(
      "SELECT * FROM checklist_templates WHERE family_id = $1 AND status = 'active'",
      [familyId],
    )).rows[0];
    if (!template) throw new Error("That checklist has no published version yet.");

    const existing = (await client.query(
      "SELECT * FROM student_checklists WHERE student_id = $1 AND family_id = $2",
      [String(req.params.id), familyId],
    )).rows[0];
    if (existing) throw new Error("This checklist is already activated for this student.");

    await client.query("BEGIN");
    const list = (await client.query(
      `INSERT INTO student_checklists (student_id, template_id, family_id, country, branch_id, activated_by)
       VALUES ($1,$2,$3,$4,$5::uuid,$6) RETURNING *`,
      [
        String(req.params.id), template.id, familyId,
        String(req.body?.country || template.country),
        student.branch_id || null,
        req.user.email || req.user.id,
      ],
    )).rows[0];

    const templateItems = (await client.query(
      "SELECT * FROM checklist_template_items WHERE template_id = $1 ORDER BY display_order",
      [template.id],
    )).rows;

    let reused = 0;
    for (const item of templateItems) {
      const satisfiedBy = await acceptedElsewhere(client, req.params.id, item.document_master_id, list.id);
      if (satisfiedBy) reused += 1;
      await client.query(
        `INSERT INTO student_checklist_items
           (student_checklist_id, document_master_id, requirement, status_code,
            satisfied_by_item_id, updated_by)
         VALUES ($1,$2,$3,$4,$5,$6)`,
        [
          list.id, item.document_master_id, item.requirement,
          satisfiedBy ? "not_required" : "pending",
          satisfiedBy,
          req.user.email || req.user.id,
        ],
      );
    }
    await client.query("COMMIT");

    await audit(req, "checklist.activate", "student_checklist", list.id, {
      student: req.params.id, family: familyId, version: template.version, reused,
    });
    res.json({ ...list, version: template.version, items_created: templateItems.length, documents_already_available: reused });
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    fail(res, error);
  } finally {
    client.release();
  }
});

/**
 * Counsellor updates one checklist item.
 *
 * The status must come from the Super Admin's vocabulary — a counsellor cannot
 * invent one. A free-text next-step note travels alongside it, which is what
 * the document asks for: "can also add an explicit next-step status or short
 * progress note to inform the student about the immediate action required."
 *
 * Accepting an item also releases the same document on the student's other
 * country checklists, so multi-country students upload once.
 */
router.patch("/api/student-checklist-items/:id", counsellorOrAdmin, async (req, res) => {
  const client = await pool.connect();
  try {
    const current = (await client.query(
      `SELECT i.*, c.student_id, c.branch_id
         FROM student_checklist_items i
         JOIN student_checklists c ON c.id = i.student_checklist_id
        WHERE i.id = $1`,
      [req.params.id],
    )).rows[0];
    if (!current) throw Object.assign(new Error("Checklist item not found."), { status: 404 });
    if (!inScope(req, current.branch_id)) throw Object.assign(new Error("Not your branch."), { status: 403 });

    const body = req.body || {};
    let statusCode = current.status_code;
    if (body.status_code && body.status_code !== current.status_code) {
      const known = (await client.query(
        "SELECT 1 FROM status_vocabulary WHERE kind = 'document' AND code = $1 AND is_active",
        [String(body.status_code)],
      )).rows[0];
      if (!known) throw new Error("That status is not one the Super Admin has defined.");
      statusCode = String(body.status_code);
    }

    if (body.next_step_code) {
      const known = (await client.query(
        "SELECT 1 FROM status_vocabulary WHERE kind = 'next_step' AND code = $1 AND is_active",
        [String(body.next_step_code)],
      )).rows[0];
      if (!known) throw new Error("That next-step status is not one the Super Admin has defined.");
    }

    await client.query("BEGIN");
    const updated = (await client.query(
      `UPDATE student_checklist_items
          SET status_code = $2,
              next_step_note = COALESCE($3, next_step_note),
              rejection_reason = COALESCE($4, rejection_reason),
              document_record_id = COALESCE($5, document_record_id),
              expires_on = COALESCE($6::date, expires_on),
              updated_by = $7,
              updated_at = now()
        WHERE id = $1 RETURNING *`,
      [
        req.params.id, statusCode,
        body.next_step_note ?? null,
        body.rejection_reason ?? null,
        body.document_record_id ?? null,
        body.expires_on ?? null,
        req.user.email || req.user.id,
      ],
    )).rows[0];

    let released = 0;
    if (statusCode === "accepted" && current.status_code !== "accepted") {
      const { rowCount } = await client.query(
        `UPDATE student_checklist_items i
            SET status_code = 'not_required', satisfied_by_item_id = $1, updated_at = now()
           FROM student_checklists c
          WHERE i.student_checklist_id = c.id
            AND c.student_id = $2
            AND i.document_master_id = $3
            AND i.id <> $1
            AND i.status_code IN ('pending','resubmit')`,
        [updated.id, String(current.student_id), current.document_master_id],
      );
      released = rowCount;
    }
    await client.query("COMMIT");

    if (statusCode === "resubmit" || statusCode === "rejected") {
      await raiseAlert({
        userId: String(current.student_id),
        role: ROLES.STUDENT,
        branchId: current.branch_id,
        alertType: "document_rejected",
        title: "A document needs to be re-uploaded",
        body: String(body.rejection_reason || updated.rejection_reason || ""),
        entityType: "student_checklist_item",
        entityId: updated.id,
      }).catch(() => undefined);
    }

    res.json({ ...updated, released_on_other_checklists: released });
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    fail(res, error);
  } finally {
    client.release();
  }
});

// ===========================================================================
// Application, visa and next-step status on the student record itself
//
// Leads and students live as JSONB, so these write into app_records.data
// rather than onto a column — the lesson migrations 004 and 005 were written
// to fix.
// ===========================================================================

const STUDENT_STATUS_FIELDS = {
  application_status: "application",
  visa_status: "visa",
  next_step_status: "next_step",
};

router.patch("/api/students/:id/status", counsellorOrAdmin, async (req, res) => {
  try {
    const student = await studentRecord(req.params.id);
    if (!student) throw Object.assign(new Error("Student not found."), { status: 404 });
    if (!inScope(req, student.branch_id)) throw Object.assign(new Error("Not your branch."), { status: 403 });

    const patch = {};
    for (const [field, kind] of Object.entries(STUDENT_STATUS_FIELDS)) {
      if (!(field in (req.body || {}))) continue;
      const code = String(req.body[field] || "");
      if (code) {
        const known = (await pool.query(
          "SELECT 1 FROM status_vocabulary WHERE kind = $1 AND code = $2 AND is_active",
          [kind, code],
        )).rows[0];
        if (!known) throw new Error(`"${code}" is not a ${kind.replace("_", " ")} status the Super Admin has defined.`);
      }
      patch[field] = code;
      patch[`${field}_updated_at`] = new Date().toISOString();
      patch[`${field}_updated_by`] = req.user.email || req.user.id;
    }
    if ("next_step_note" in (req.body || {})) patch.next_step_note = String(req.body.next_step_note || "");
    if (!Object.keys(patch).length) throw new Error("Nothing to update.");

    const { rows } = await pool.query(
      `UPDATE app_records SET data = data || $2::jsonb, updated_at = now()
        WHERE id = $1 AND table_name = 'student_leads'
        RETURNING id, data, branch_id`,
      [String(req.params.id), JSON.stringify(patch)],
    );

    await audit(req, "student.status", "student_leads", req.params.id, patch);

    if (patch.application_status || patch.visa_status) {
      const counselorId = student.assigned_counselor_id;
      if (counselorId) {
        await raiseAlert({
          userId: String(counselorId),
          role: ROLES.COUNSELOR,
          branchId: student.branch_id,
          alertType: "application_status_changed",
          title: `${student.full_name || student.name || "A student"} — status updated`,
          body: patch.application_status || patch.visa_status || "",
          entityType: "student_leads",
          entityId: req.params.id,
        }).catch(() => undefined);
      }
    }
    res.json({ id: rows[0].id, ...rows[0].data });
  } catch (error) { fail(res, error); }
});

/**
 * The status bar payload (2.6.2, "Status-bar design").
 *
 * One endpoint, four audiences. Which stages and which fields come back depend
 * on who is asking: staff see everything, a student sees what the Super Admin
 * marked student-visible, and an agent additionally passes through the
 * per-agent visibility flags on their own partner record.
 */
router.get("/api/students/:id/progress", anySession, async (req, res) => {
  try {
    const student = await studentRecord(req.params.id);
    if (!student) throw Object.assign(new Error("Student not found."), { status: 404 });

    const role = req.user.role;
    let audience = "staff";
    let visibility = { application: true, visa: true, next_step: true, documents: true };

    if (role === ROLES.STUDENT) {
      if (String(req.user.id) !== String(req.params.id)) {
        throw Object.assign(new Error("Not your record."), { status: 403 });
      }
      audience = "student";
    } else if (role === ROLES.PARTNER) {
      const partner = (await pool.query("SELECT * FROM partners WHERE user_id = $1", [String(req.user.id)])).rows[0];
      if (!partner) throw Object.assign(new Error("No partner record."), { status: 403 });
      if (String(student.referred_by_partner_id || "") !== String(partner.id)) {
        throw Object.assign(new Error("Not one of your referrals."), { status: 403 });
      }
      audience = "partner";
      visibility = {
        application: partner.show_application_status,
        visa: partner.show_visa_status,
        next_step: partner.show_next_step,
        documents: partner.show_document_status,
      };
    } else if (STAFF_ROLES.includes(role)) {
      if (!req.scope && !ADMIN_ROLES.includes(role)) {
        // staffAuth normally attaches scope; this route uses bare session so
        // branch checking is done explicitly below.
      }
      const branchIds = (req.user.branch_ids || []).map(String);
      const unrestricted = ADMIN_ROLES.includes(role);
      if (!unrestricted && !branchIds.includes(String(student.branch_id || ""))) {
        throw Object.assign(new Error("Not your branch."), { status: 403 });
      }
    } else {
      throw Object.assign(new Error("Not allowed."), { status: 403 });
    }

    const { rows: vocab } = await pool.query(
      "SELECT * FROM status_vocabulary WHERE is_active ORDER BY kind, stage_index",
    );
    const visible = vocab.filter((row) => (row.visible_to || []).includes(audience));
    const stagesFor = (kind) => visible.filter((row) => row.kind === kind);

    const track = (kind, code) => {
      const stages = stagesFor(kind);
      const current = stages.find((row) => row.code === code) || null;
      return {
        stages: stages.map((row) => ({
          code: row.code, label: row.label, color: row.color,
          stage_index: row.stage_index, is_terminal: row.is_terminal,
        })),
        current: current && { code: current.code, label: current.label, color: current.color, stage_index: current.stage_index },
        percent: current && stages.length
          ? Math.round(((current.stage_index + 1) / (Math.max(...stages.map((s) => s.stage_index)) + 1)) * 100)
          : 0,
      };
    };

    const payload = { student_id: student.id, name: student.full_name || student.name || "" };
    if (visibility.application) payload.application = track("application", student.application_status);
    if (visibility.visa) payload.visa = track("visa", student.visa_status);
    if (visibility.next_step) {
      payload.next_step = track("next_step", student.next_step_status);
      payload.next_step_note = student.next_step_note || "";
    }

    if (visibility.documents) {
      const { rows } = await pool.query(
        `SELECT c.country, c.family_id,
                count(*) FILTER (WHERE i.requirement = 'mandatory') AS required,
                count(*) FILTER (WHERE i.requirement = 'mandatory'
                                   AND i.status_code IN ('accepted','not_required')) AS done
           FROM student_checklists c
           JOIN student_checklist_items i ON i.student_checklist_id = c.id
          WHERE c.student_id = $1 AND c.is_active
          GROUP BY c.country, c.family_id`,
        [String(req.params.id)],
      );
      payload.documents = rows.map((row) => ({
        country: row.country,
        family_id: row.family_id,
        required: Number(row.required),
        done: Number(row.done),
        percent: Number(row.required) ? Math.round((Number(row.done) / Number(row.required)) * 100) : 0,
      }));
    }
    res.json(payload);
  } catch (error) { fail(res, error); }
});

// ===========================================================================
// The student's own view of their checklist  (2.6.2, "Student visibility")
//
// The student portal used to ask the student to pick a country and a degree,
// then show them a global document list. That is the old model. Under 2.6 the
// counsellor activates a checklist for them, pinned to the version that was
// live at the time, and the student simply sees it — with the counsellor's
// status, the rejection reason and the next-step note attached to each item.
//
// This endpoint takes either realm's token (staff previewing, or the student
// themselves on their own opaque token) and never reveals another student's
// checklist.
// ===========================================================================

router.get("/api/student/checklists", anySession, async (req, res) => {
  try {
    if (req.user.role !== ROLES.STUDENT) {
      throw Object.assign(new Error("This is the student view."), { status: 403 });
    }

    // Match on the signed-in account, or on the email it signed in with — the
    // lead may pre-date the student ever creating a login.
    const { rows: found } = await pool.query(
      `SELECT id, data, branch_id FROM app_records
        WHERE table_name = 'student_leads'
          AND (id = $1 OR data->>'user_id' = $1
               OR ($2 <> '' AND lower(data->>'email') = lower($2)))
        ORDER BY created_at DESC LIMIT 1`,
      [String(req.user.id), String(req.user.email || "")],
    );
    const lead = found[0] ? { id: found[0].id, ...found[0].data } : null;

    if (!lead) {
      // Not yet a CRM record — a brand new signup. Say so plainly rather than
      // returning an empty list the portal would read as "nothing required".
      return res.json({ activated: false, reason: "no_crm_record", checklists: [] });
    }

    const { rows: lists } = await pool.query(
      `SELECT c.id, c.country, c.family_id, c.activated_at,
              t.name, t.version, t.course_level, t.intake
         FROM student_checklists c
         JOIN checklist_templates t ON t.id = c.template_id
        WHERE c.student_id = $1 AND c.is_active
        ORDER BY c.activated_at`,
      [String(lead.id)],
    );

    if (!lists.length) {
      return res.json({ activated: false, reason: "not_activated", checklists: [], student_id: lead.id });
    }

    const { rows: vocabulary } = await pool.query(
      "SELECT kind, code, label, color FROM status_vocabulary WHERE is_active AND 'student' = ANY(visible_to)",
    );
    const word = (kind, code) => vocabulary.find((row) => row.kind === kind && row.code === code) || null;

    for (const list of lists) {
      const { rows: items } = await pool.query(
        `SELECT i.id, i.requirement, i.status_code, i.next_step_note, i.rejection_reason,
                i.satisfied_by_item_id, i.expires_on, i.document_record_id,
                d.name AS document_type, d.description, d.accepted_formats, d.max_size_mb,
                d.sample_instructions, d.requires_expiry
           FROM student_checklist_items i
           JOIN document_master d ON d.id = i.document_master_id
          WHERE i.student_checklist_id = $1
          ORDER BY d.name`,
        [list.id],
      );

      list.items = items.map((item) => {
        const status = word("document", item.status_code);
        return {
          id: item.id,
          document_type: item.document_type,
          description: item.description,
          // the portal's existing shape, so its uploader keeps working
          is_required: item.requirement === "mandatory",
          requirement: item.requirement,
          max_file_size_mb: Number(item.max_size_mb),
          allowed_file_types: item.accepted_formats,
          sample_instructions: item.sample_instructions,
          requires_expiry: item.requires_expiry,
          expires_on: item.expires_on,
          document_id: item.document_record_id,
          status: item.status_code,
          status_label: status?.label || item.status_code,
          status_color: status?.color || "slate",
          next_step_note: item.next_step_note || "",
          rejection_reason: item.rejection_reason || "",
          // already accepted on another country's checklist — do not ask twice
          already_available: Boolean(item.satisfied_by_item_id),
        };
      });

      const required = list.items.filter((item) => item.is_required);
      const done = required.filter((item) => item.status === "accepted" || item.status === "not_required");
      list.progress = required.length ? Math.round((done.length / required.length) * 100) : 0;
    }

    res.json({
      activated: true,
      student_id: lead.id,
      checklists: lists,
      next_step_note: lead.next_step_note || "",
    });
  } catch (error) { fail(res, error); }
});

// ===========================================================================
// Per-agent status visibility (2.6.2, last bullet of the visibility rules)
// ===========================================================================

router.put("/api/partners/:id/visibility", superOnly, async (req, res) => {
  try {
    const before = (await pool.query("SELECT * FROM partners WHERE id = $1", [req.params.id])).rows[0];
    if (!before) throw Object.assign(new Error("Partner not found."), { status: 404 });
    const { rows } = await pool.query(
      `UPDATE partners
          SET show_application_status = COALESCE($2, show_application_status),
              show_visa_status        = COALESCE($3, show_visa_status),
              show_next_step          = COALESCE($4, show_next_step),
              show_document_status    = COALESCE($5, show_document_status)
        WHERE id = $1 RETURNING *`,
      [
        req.params.id,
        typeof req.body?.show_application_status === "boolean" ? req.body.show_application_status : null,
        typeof req.body?.show_visa_status === "boolean" ? req.body.show_visa_status : null,
        typeof req.body?.show_next_step === "boolean" ? req.body.show_next_step : null,
        typeof req.body?.show_document_status === "boolean" ? req.body.show_document_status : null,
      ],
    );
    await logChange(req, {
      entityType: "partner_visibility", entityId: req.params.id,
      entityLabel: before.full_name || before.agency_name || before.referral_code || "",
      action: "update", before, after: rows[0],
    });
    await audit(req, "partner.visibility", "partners", req.params.id, diffOf(before, rows[0]));
    res.json(rows[0]);
  } catch (error) { fail(res, error); }
});

// ===========================================================================
// 2.6.1 — configurable sound and visual alerts
// ===========================================================================

router.get("/api/alerts/types", staffAuth, (_req, res) => {
  res.json({ types: ALERT_TYPES });
});

router.get("/api/alerts/settings", staffAuth, async (req, res) => {
  try {
    // A branch head sees and edits their own branches only; an admin sees all.
    const params = [];
    let where = "";
    if (!req.scope.allBranches) {
      params.push(req.scope.branchIds.map(String));
      where = `WHERE scope_type = 'global' OR (scope_type = 'branch' AND scope_id = ANY($1::text[]))`;
    }
    const { rows } = await pool.query(
      `SELECT * FROM alert_settings ${where} ORDER BY scope_type, alert_type`, params,
    );
    res.json({ settings: rows, editable_scopes: req.scope.allBranches ? ["global", "branch", "role", "user"] : ["branch"] });
  } catch (error) { fail(res, error); }
});

router.put("/api/alerts/settings", staffAuth, async (req, res) => {
  try {
    const body = req.body || {};
    const scopeType = String(body.scope_type || "global");
    const scopeId = String(body.scope_id || "*");
    const alertType = String(body.alert_type || "");
    if (!ALERT_TYPES.includes(alertType)) throw new Error("Unknown alert type.");

    // Only an admin may touch the global default or another branch's rule.
    const isAdmin = ADMIN_ROLES.includes(req.user.role);
    if (!isAdmin) {
      if (scopeType !== "branch" || !req.scope.branchIds.map(String).includes(scopeId)) {
        throw Object.assign(new Error("You can only change alert rules for your own branch."), { status: 403 });
      }
    }

    const before = (await pool.query(
      "SELECT * FROM alert_settings WHERE scope_type = $1 AND scope_id = $2 AND alert_type = $3",
      [scopeType, scopeId, alertType],
    )).rows[0] || null;

    const { rows } = await pool.query(
      `INSERT INTO alert_settings
         (scope_type, scope_id, alert_type, enabled, sound_enabled, tone, repeat_count,
          priority, channels, color, display_ms, can_snooze, can_mute,
          quiet_start, quiet_end, respect_hours, updated_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)
       ON CONFLICT (scope_type, scope_id, alert_type) DO UPDATE
         SET enabled = EXCLUDED.enabled, sound_enabled = EXCLUDED.sound_enabled,
             tone = EXCLUDED.tone, repeat_count = EXCLUDED.repeat_count,
             priority = EXCLUDED.priority, channels = EXCLUDED.channels,
             color = EXCLUDED.color, display_ms = EXCLUDED.display_ms,
             can_snooze = EXCLUDED.can_snooze, can_mute = EXCLUDED.can_mute,
             quiet_start = EXCLUDED.quiet_start, quiet_end = EXCLUDED.quiet_end,
             respect_hours = EXCLUDED.respect_hours, updated_by = EXCLUDED.updated_by,
             updated_at = now()
       RETURNING *`,
      [
        scopeType, scopeId, alertType,
        body.enabled !== false,
        body.sound_enabled !== false,
        String(body.tone || "chime"),
        Number(body.repeat_count || 1),
        String(body.priority || "normal"),
        arrayOf(body.channels, ["bell", "toast"]),
        String(body.color || "sky"),
        Number(body.display_ms || 6000),
        body.can_snooze !== false,
        body.can_mute !== false,
        body.quiet_start || null,
        body.quiet_end || null,
        body.respect_hours !== false,
        req.user.email || req.user.id,
      ],
    );
    await logChange(req, {
      entityType: "alert_setting", entityId: rows[0].id,
      entityLabel: `${scopeType}:${scopeId}/${alertType}`,
      action: before ? "update" : "create", before, after: rows[0],
    });
    res.json(rows[0]);
  } catch (error) { fail(res, error); }
});

/** What the bell, the toasts and the sound player poll. */
router.get("/api/alerts/feed", session, async (req, res) => {
  try {
    const alerts = await pendingAlerts(req.user.id, { limit: Number(req.query.limit) || 50 });
    const unread = alerts.length;
    if (alerts.length) {
      await pool.query(
        "UPDATE alert_queue SET delivered_at = COALESCE(delivered_at, now()) WHERE id = ANY($1::bigint[])",
        [alerts.map((row) => row.id)],
      );
    }
    res.json({ alerts, unread });
  } catch (error) { fail(res, error); }
});

router.post("/api/alerts/:id/read", session, async (req, res) => {
  try {
    await pool.query(
      "UPDATE alert_queue SET read_at = now() WHERE id = $1 AND user_id = $2",
      [req.params.id, String(req.user.id)],
    );
    res.json({ ok: true });
  } catch (error) { fail(res, error); }
});

router.post("/api/alerts/read-all", session, async (req, res) => {
  try {
    const { rowCount } = await pool.query(
      "UPDATE alert_queue SET read_at = now() WHERE user_id = $1 AND read_at IS NULL",
      [String(req.user.id)],
    );
    res.json({ ok: true, cleared: rowCount });
  } catch (error) { fail(res, error); }
});

router.post("/api/alerts/:id/snooze", session, async (req, res) => {
  try {
    const minutes = Math.min(Math.max(Number(req.body?.minutes || 15), 1), 24 * 60);
    const alert = (await pool.query(
      "SELECT * FROM alert_queue WHERE id = $1 AND user_id = $2", [req.params.id, String(req.user.id)],
    )).rows[0];
    if (!alert) throw Object.assign(new Error("Alert not found."), { status: 404 });

    const setting = (await pool.query(
      "SELECT can_snooze FROM alert_settings WHERE alert_type = $1 AND scope_type = 'global'",
      [alert.alert_type],
    )).rows[0];
    if (setting && setting.can_snooze === false) throw new Error("This alert cannot be snoozed.");

    await pool.query(
      "UPDATE alert_queue SET snoozed_to = now() + ($2 || ' minutes')::interval WHERE id = $1",
      [req.params.id, String(minutes)],
    );
    res.json({ ok: true, minutes });
  } catch (error) { fail(res, error); }
});

router.get("/api/alerts/availability", session, async (req, res) => {
  try {
    const { rows } = await pool.query("SELECT * FROM staff_availability WHERE user_id = $1", [String(req.user.id)]);
    res.json(rows[0] || { user_id: req.user.id, status: "available", work_start: "09:30", work_end: "18:30", work_days: [1, 2, 3, 4, 5, 6] });
  } catch (error) { fail(res, error); }
});

router.put("/api/alerts/availability", session, async (req, res) => {
  try {
    const body = req.body || {};
    const muteMinutes = Number(body.mute_minutes || 0);
    const { rows } = await pool.query(
      `INSERT INTO staff_availability (user_id, status, work_start, work_end, work_days, mute_until)
       VALUES ($1,$2,$3,$4,$5, CASE WHEN $6 > 0 THEN now() + ($6 || ' minutes')::interval ELSE NULL END)
       ON CONFLICT (user_id) DO UPDATE
         SET status = EXCLUDED.status, work_start = EXCLUDED.work_start, work_end = EXCLUDED.work_end,
             work_days = EXCLUDED.work_days, mute_until = EXCLUDED.mute_until, updated_at = now()
       RETURNING *`,
      [
        String(req.user.id),
        String(body.status || "available"),
        body.work_start || "09:30",
        body.work_end || "18:30",
        Array.isArray(body.work_days) ? body.work_days.map(Number) : [1, 2, 3, 4, 5, 6],
        muteMinutes,
      ],
    );
    res.json(rows[0]);
  } catch (error) { fail(res, error); }
});

/** Lets other modules (and the admin screens) raise an alert by hand. */
router.post("/api/alerts/raise", configAuth, async (req, res) => {
  try {
    const row = await raiseAlert({
      userId: String(req.body?.user_id || ""),
      role: req.body?.role || null,
      branchId: req.body?.branch_id || null,
      alertType: String(req.body?.alert_type || ""),
      title: String(req.body?.title || ""),
      body: String(req.body?.body || ""),
      link: String(req.body?.link || ""),
      entityType: String(req.body?.entity_type || ""),
      entityId: String(req.body?.entity_id || ""),
    });
    res.json({ raised: Boolean(row), alert: row });
  } catch (error) { fail(res, error); }
});

// ===========================================================================
// Developer-only configuration change history
//
// The client asked to be able to trace what changed and when — including which
// version came before which — but only for the developer, not for every staff
// member. `developerOnly` is narrower than super admin: set DEVELOPER_EMAILS
// to name the people who may read it.
// ===========================================================================

router.get("/api/config/changes", session, developerOnly, async (req, res) => {
  try {
    const rows = await readChanges({
      entityType: req.query.entity_type ? String(req.query.entity_type) : null,
      entityId: req.query.entity_id ? String(req.query.entity_id) : null,
      limit: Number(req.query.limit) || 200,
      since: req.query.since ? new Date(String(req.query.since)) : null,
    });
    res.json({ changes: rows });
  } catch (error) { fail(res, error); }
});

router.get("/api/config/changes/summary", session, developerOnly, async (_req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT entity_type,
              count(*) AS changes,
              max(created_at) AS last_change,
              min(created_at) AS first_change
         FROM config_change_log
        GROUP BY entity_type
        ORDER BY last_change DESC`,
    );
    res.json({ summary: rows });
  } catch (error) { fail(res, error); }
});

/** Lets the frontend hide the menu entry rather than render a 403. */
router.get("/api/me/capabilities", session, async (req, res) => {
  res.json({
    developer: isDeveloper(req.user),
    role: req.user.role,
    branch_ids: req.user.branch_ids || [],
  });
});

export default router;
