/**
 * One place to set up the documents students must upload — shared by the
 * admin portal and the counsellor portal (it replaces the admin "Document
 * master" + "Document lists (legacy)" pair and the counsellor "Set up
 * documents" screen, which wrote to the same rows with different forms).
 *
 * The store is `document_checklists`, the rows the student Documents page and
 * every per-student checklist are built from. The CRM 2.6 `document_master`
 * table (used by the versioned Country checklists builder) is kept in step:
 * a document added here is added there, and any master-only document shows
 * up here as "not asked automatically" so there is a single list.
 *
 * Targeting (see lib/documentTargeting.mjs):
 *   Country   — a counsellor picks from their own countries (one country is
 *               chosen for them; several give a choice plus "All my
 *               countries"). Admin picks any country or All.
 *   Students  — "All students" (a counsellor's are only their own), or one or
 *               more named students. A named-student document goes to them
 *               only, and they are told about it straight away.
 *   Staff only — kept for staff; never shown to or asked of a student.
 */
import express from "express";
import crypto from "crypto";
import { pool, jsonTable, jsonUpsert } from "../lib/db.mjs";
import { ROLES, ADMIN_ROLES, session, requireRole, branchScope, audit } from "../lib/auth.mjs";
import { documentCountries, normalizeCountry } from "../lib/documentTargeting.mjs";
import { myAssignedLeads, resolveCounselorAliases } from "./counselor.mjs";

const router = express.Router();

const DOC_ROLES = [...ADMIN_ROLES, ROLES.BRANCH_HEAD, ROLES.COUNSELOR];
const docAuth = [session, requireRole(DOC_ROLES, "Staff"), branchScope];

const DEFAULT_COUNTRIES = ["USA", "UK", "Canada", "Australia", "Germany", "Ireland", "New Zealand", "France", "Netherlands", "UAE"];

const isAdmin = (req) => ADMIN_ROLES.includes(req.user?.role);
const isCounselor = (req) => req.user?.role === ROLES.COUNSELOR;

const asList = (value) => (Array.isArray(value) ? value : String(value || "").split(","))
  .map((item) => String(item).trim())
  .filter(Boolean);

function fail(res, error, status = 400) {
  return res.status(error?.status || status).json({ error: error?.message || "Request failed" });
}

/** Every country the platform knows about (document_countries + the defaults). */
async function knownCountries() {
  const rows = await jsonTable("document_countries").catch(() => []);
  const names = rows
    .filter((row) => row.is_active !== false && String(row.name || "").toLowerCase() !== "all")
    .map((row) => normalizeCountry(row.name));
  return [...new Set([...DEFAULT_COUNTRIES, ...names].filter(Boolean))].sort();
}

/** The countries this counsellor works on, from their profile's specializations. */
async function counselorCountries(userId) {
  const known = await knownCountries();
  const knownLower = new Set(known.map((c) => c.toLowerCase()));
  const [sql, json] = await Promise.all([
    pool.query(
      `SELECT specializations FROM counselor_users
        WHERE id::text = $1 OR lower(email) = (SELECT lower(email) FROM auth_users WHERE id::text = $1 LIMIT 1)`,
      [String(userId)],
    ).catch(() => ({ rows: [] })),
    jsonTable("counselors").catch(() => []),
  ]);
  const raw = [
    ...sql.rows.flatMap((row) => asList(row.specializations)),
    ...json
      .filter((row) => String(row.user_id) === String(userId) || String(row.auth_user_id || "") === String(userId))
      .flatMap((row) => asList(row.specializations)),
  ];
  const mine = [...new Set(raw.map(normalizeCountry).filter((c) => knownLower.has(c.toLowerCase())))];
  return { countries: mine.length ? mine.sort() : known, fromProfile: mine.length > 0 };
}

function personName(row) {
  return [row.first_name, row.last_name].filter(Boolean).join(" ").trim() || row.email || "Student";
}

/** The students this person may aim a document at. */
async function studentsFor(req) {
  if (isCounselor(req)) {
    const { leads } = await myAssignedLeads(req.user.id);
    return leads.map((lead) => ({
      id: String(lead.user_id || lead.id),
      lead_id: String(lead.id),
      name: personName(lead),
      email: lead.email || "",
      countries: asList(lead.preferred_countries).map(normalizeCountry),
    }));
  }
  const leads = await jsonTable("student_leads", { scope: req.scope }).catch(() => []);
  return leads
    .filter((lead) => !lead.merged_into)
    .filter((lead) => lead.user_id || lead.entity_type === "student" || lead.lead_status === "converted" || lead.lead_stage === "converted")
    .map((lead) => ({
      id: String(lead.user_id || lead.id),
      lead_id: String(lead.id),
      name: personName(lead),
      email: lead.email || "",
      countries: asList(lead.preferred_countries).map(normalizeCountry),
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * Bring any document defined only in the CRM 2.6 document master into the
 * one list. It arrives switched off ("not asked automatically") so nothing
 * changes for any student until someone turns it on.
 */
async function absorbMasterOnlyDocuments(rows) {
  const { rows: master } = await pool.query("SELECT * FROM document_master").catch(() => ({ rows: [] }));
  const known = new Set(rows.map((row) => String(row.document_type || "").trim().toLowerCase()));
  const added = [];
  for (const doc of master) {
    const name = String(doc.name || "").trim();
    if (!name || known.has(name.toLowerCase())) continue;
    const row = {
      id: `dm-${doc.id}`,
      document_type: name,
      description: doc.description || "",
      is_required: true,
      is_active: false,
      staff_only: Boolean(doc.restricted_visible),
      max_file_size_mb: Number(doc.max_size_mb || 20),
      allowed_file_types: Array.isArray(doc.accepted_formats) && doc.accepted_formats.length ? doc.accepted_formats : ["pdf"],
      country: (doc.country_scope || ["All"])[0] || "All",
      countries: Array.isArray(doc.country_scope) && doc.country_scope.length ? doc.country_scope : ["All"],
      degree_type: "All",
      degree_types: ["All"],
      student_ids: [],
      counselor_scope_ids: [],
      source: "document_master",
      document_master_id: doc.id,
      display_order: 99,
      created_by_role: "admin",
      created_at: doc.created_at ? new Date(doc.created_at).toISOString() : new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    await jsonUpsert("document_checklists", row);
    known.add(name.toLowerCase());
    added.push(row);
  }
  return added;
}

/** Keep the CRM 2.6 master in step so the Country checklists builder can use it. */
async function mirrorToMaster(row, req) {
  try {
    const name = String(row.document_type || "").trim();
    const existing = await pool.query("SELECT id FROM document_master WHERE lower(name) = lower($1) LIMIT 1", [name]);
    if (existing.rows[0]) {
      await pool.query("UPDATE document_master SET restricted_visible = $2, updated_at = now() WHERE id = $1", [existing.rows[0].id, Boolean(row.staff_only)]);
      return existing.rows[0].id;
    }
    const base = name.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 50) || "document";
    const code = `${base}_${crypto.randomBytes(2).toString("hex")}`;
    const countries = documentCountries(row);
    const { rows } = await pool.query(
      `INSERT INTO document_master (code, name, description, accepted_formats, max_size_mb, country_scope, restricted_visible, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id`,
      [code, name, String(row.description || ""), row.allowed_file_types || ["pdf"], Number(row.max_file_size_mb || 20),
        countries.length ? countries : ["All"], Boolean(row.staff_only), req.user?.email || req.user?.id || null],
    );
    return rows[0]?.id || null;
  } catch (error) {
    console.error("[document-setup] could not mirror to document master:", error.message);
    return null;
  }
}

/** Whether this person may change this row. Admin: anything. Counsellor: their own rows. */
function canEdit(req, row, aliases) {
  if (isAdmin(req)) return true;
  if (req.user?.role === ROLES.BRANCH_HEAD) return row.created_by_role !== "admin";
  return Boolean(row.created_by && aliases.has(String(row.created_by)));
}

/** Rows a counsellor should see: everything global, their own, and anything aimed at their students. */
function visibleTo(req, row, aliases, studentIds) {
  if (!isCounselor(req)) return true;
  if (row.created_by && aliases.has(String(row.created_by))) return true;
  const targets = asList(row.student_ids);
  if (targets.length) return targets.some((id) => studentIds.has(id));
  const scope = asList(row.counselor_scope_ids);
  if (scope.length) return scope.some((id) => aliases.has(id));
  return true;
}

function describe(row, studentsById) {
  const targets = asList(row.student_ids);
  const countries = documentCountries(row);
  const legacyDegrees = asList(row.degree_types).filter((d) => d.toLowerCase() !== "all");
  return {
    ...row,
    countries_label: countries.length ? countries.join(", ") : "All countries",
    students_label: targets.length
      ? [...new Set(targets.map((id) => studentsById.get(id)?.name || "A student"))].join(", ")
      : asList(row.counselor_scope_ids).length ? "All students of the counsellor who added it" : "All students",
    legacy_degrees: legacyDegrees,
  };
}

router.get(["/api/document-setup", "/api/counselor/document-setup"], docAuth, async (req, res) => {
  try {
    let rows = await jsonTable("document_checklists");
    rows = [...rows, ...(await absorbMasterOnlyDocuments(rows))];
    const aliases = isCounselor(req) ? await resolveCounselorAliases(req.user.id) : new Set([String(req.user.id)]);
    const students = await studentsFor(req);
    const studentIds = new Set(students.flatMap((s) => [s.id, s.lead_id]));
    const studentsById = new Map(students.flatMap((s) => [[s.id, s], [s.lead_id, s]]));
    const countryInfo = isAdmin(req)
      ? { countries: await knownCountries(), fromProfile: false }
      : await counselorCountries(req.user.id);
    const documents = rows
      .filter((row) => visibleTo(req, row, aliases, studentIds))
      .sort((a, b) => Number(a.display_order || 99) - Number(b.display_order || 99)
        || String(a.document_type || "").localeCompare(String(b.document_type || "")))
      .map((row) => ({ ...describe(row, studentsById), can_edit: canEdit(req, row, aliases) }));
    res.json({
      documents,
      countries: countryInfo.countries,
      countries_from_profile: countryInfo.fromProfile,
      students,
      role: req.user.role,
    });
  } catch (error) { fail(res, error, 500); }
});

router.post(["/api/document-setup", "/api/counselor/document-setup"], docAuth, async (req, res) => {
  try {
    const body = req.body || {};
    const documentType = String(body.document_type || "").trim().slice(0, 120);
    if (!documentType) throw new Error("Give the document a name.");

    const aliases = isCounselor(req) ? await resolveCounselorAliases(req.user.id) : new Set([String(req.user.id)]);
    const allowedCountries = isAdmin(req) ? await knownCountries() : (await counselorCountries(req.user.id)).countries;
    const allowedLower = new Set(allowedCountries.map((c) => c.toLowerCase()));

    // Countries
    let countries;
    if (body.all_countries || !asList(body.countries).length) {
      // Admin "All" really means every country. A counsellor's "All my
      // countries" means the ones on their profile.
      countries = isAdmin(req) || req.user.role === ROLES.BRANCH_HEAD ? ["All"] : allowedCountries;
    } else {
      countries = [...new Set(asList(body.countries).map(normalizeCountry))];
      const outside = countries.filter((c) => !allowedLower.has(c.toLowerCase()));
      if (outside.length && !isAdmin(req)) throw new Error(`You can only choose your own countries (not ${outside.join(", ")}).`);
    }

    // Students
    const students = await studentsFor(req);
    const byId = new Map(students.flatMap((s) => [[s.id, s], [s.lead_id, s]]));
    const studentIds = [...new Set(asList(body.student_ids))];
    const unknown = studentIds.filter((id) => !byId.has(id));
    if (unknown.length) throw new Error("Choose students from your own list.");
    const targeted = studentIds.map((id) => byId.get(id));

    const now = new Date().toISOString();
    const row = {
      id: `dc-${crypto.randomUUID()}`,
      document_type: documentType,
      description: String(body.description || "").slice(0, 2000),
      is_required: body.is_required !== false,
      is_active: true,
      staff_only: Boolean(body.staff_only),
      max_file_size_mb: Math.min(Math.max(Number(body.max_file_size_mb || 20), 1), 100),
      allowed_file_types: asList(body.allowed_file_types).length ? asList(body.allowed_file_types).map((t) => t.toLowerCase().replace(/^\./, "")) : ["pdf", "jpg", "png"],
      country: countries[0] || "All",
      countries,
      degree_type: "All",
      degree_types: ["All"],
      // A named student is stored by their portal user id (and lead id), so
      // the student portal's own id finds it.
      student_ids: [...new Set(targeted.flatMap((s) => [s.id, s.lead_id]).filter(Boolean))],
      // "All my students" from a counsellor stays with that counsellor's students.
      counselor_scope_ids: isCounselor(req) && !targeted.length ? [...aliases] : [],
      display_order: Number(body.display_order || 99),
      created_by: String(req.user.id),
      created_by_role: isAdmin(req) ? "admin" : req.user.role,
      created_at: now,
      updated_at: now,
    };
    row.document_master_id = await mirrorToMaster(row, req);
    await jsonUpsert("document_checklists", row);
    await audit(req, "document_setup.create", "document_checklists", row.id, { name: documentType, countries, students: targeted.length }).catch(() => null);

    // Named students hear about it straight away (bell + their chat, which
    // reaches WhatsApp). Broad "all students" documents just appear on the
    // Documents page — no blast.
    if (targeted.length && !row.staff_only) {
      const portalUrl = String(process.env.PUBLIC_APP_URL || "").trim().replace(/\/$/, "");
      for (const student of targeted) {
        await jsonUpsert("notifications", {
          id: crypto.randomUUID(),
          user_id: student.id,
          title: "New document needed",
          message: `Please upload ${documentType}${row.description ? ` — ${row.description}` : ""}.`,
          type: "warning",
          action_url: "/student/documents",
          created_at: now,
          is_read: false,
        });
        await import("./cases.mjs")
          .then(({ notifyStudentChat }) => notifyStudentChat(
            student.id,
            `📄 Document needed: ${documentType}. Please upload it in the Documents section of your Fly Masters student portal${portalUrl ? ` (${portalUrl}/student/documents)` : ""}.`,
            `doc-setup:${row.id}:${student.id}`,
          ))
          .catch(() => null);
      }
    }
    res.json({ ok: true, document: describe(row, byId) });
  } catch (error) { fail(res, error); }
});

router.patch(["/api/document-setup/:id", "/api/counselor/document-setup/:id"], docAuth, async (req, res) => {
  try {
    const rows = await jsonTable("document_checklists");
    const found = rows.find((row) => String(row.id) === String(req.params.id));
    if (!found) throw Object.assign(new Error("Document not found."), { status: 404 });
    const aliases = isCounselor(req) ? await resolveCounselorAliases(req.user.id) : new Set([String(req.user.id)]);
    if (!canEdit(req, found, aliases)) {
      throw Object.assign(new Error("Only admin (or whoever added it) can change this document."), { status: 403 });
    }
    const patch = {};
    for (const field of ["is_active", "staff_only", "is_required"]) {
      if (field in (req.body || {})) patch[field] = Boolean(req.body[field]);
    }
    if ("description" in (req.body || {})) patch.description = String(req.body.description || "").slice(0, 2000);
    const next = { ...found, ...patch, id: found.id, updated_at: new Date().toISOString() };
    await jsonUpsert("document_checklists", next);
    if ("staff_only" in patch) await mirrorToMaster(next, req);
    res.json({ ok: true, document: next });
  } catch (error) { fail(res, error); }
});

export default router;
