/**
 * Admin + telecaller + shared staff API.
 *
 * Ported from flymaster-admin-portal/server/index.mjs. That file was 9,883 lines,
 * of which 6,090 were four older copies of itself commented out; only the last
 * 3,397 lines ever ran. Only the live code is here.
 *
 * Auth, config, the pool and the JSON-record helpers now come from ../lib.
 */
import express from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import crypto, { randomBytes, scryptSync, timingSafeEqual } from "crypto";
import { readFileSync, existsSync } from "fs";
import path from "path";
import { buildCatalogRecords, parseCatalogCsv } from "../lib/csvImport.mjs";
import { createWhatsAppService } from "../lib/whatsappService.mjs";
import { pool, jsonTable, jsonUpsert } from "../lib/db.mjs";
import {
  ROOT as root,
  IS_PRODUCTION,
  JWT_SECRET,
  ADMIN_SIGNUP_CODE,
  ADMIN_SIGNUP_OPEN,
  TELECALLER_SIGNUP_CODE,
  WHATSAPP,
} from "../lib/env.mjs";
import {
  ROLES,
  ADMIN_ROLES,
  signUser,
  session,
  requireRole,
  branchScope,
  audit,
  adminAuth as auth,
  telecallerAuth,
  counselorAuth,
  studentAuth,
  staffAuth as staffChatAuth,
  superAdminAuth,
} from "../lib/auth.mjs";

const WHATSAPP_VERIFY_TOKEN = WHATSAPP.verifyToken;
const WHATSAPP_ACCESS_TOKEN = WHATSAPP.accessToken;
const WHATSAPP_PHONE_NUMBER_ID = WHATSAPP.phoneNumberId;
const WHATSAPP_OTP_TEMPLATE_NAME = WHATSAPP.otpTemplate;
const WHATSAPP_OUTREACH_TEMPLATE_NAME = WHATSAPP.outreachTemplate;

const ADMIN_ID = "local-admin-1";

function isUuid(value) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(value || ""));
}

function hashPassword(password) {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(password, salt, 64).toString("hex");
  return `scrypt:${salt}:${hash}`;
}

function verifyPassword(password, stored) {
  if (!password || !stored) return false;
  if (stored.startsWith("scrypt:")) {
    const parts = stored.split(":");
    const salt = parts[1];
    const hash = parts[2];
    if (!salt || !hash) return false;
    const next = scryptSync(password, salt, 64);
    const prev = Buffer.from(hash, "hex");
    return next.length === prev.length && timingSafeEqual(next, prev);
  }
  return false;
}

/** Role lookup for code paths that only need the string. */
async function roleFor(userId) {
  const result = await pool.query("SELECT role FROM user_roles WHERE user_id = $1", [String(userId)]);
  return result.rows[0]?.role || "student";
}

async function ensureCounselorLogin(authId, passwordPlain) {
  const found = await pool.query("SELECT * FROM auth_users WHERE id = $1", [authId]);
  const auth = found.rows[0];
  if (!auth) return null;
  const profiles = await jsonTable("profiles");
  const profile = profiles.find((item) => String(item.user_id) === String(authId));
  const meta = auth.user_metadata || {};
  const email = String(auth.email || "").trim().toLowerCase();
  const hash = passwordPlain ? await bcrypt.hash(passwordPlain, 10) : auth.password;
  const id = isUuid(auth.id) ? auth.id : crypto.randomUUID();
  const created = await pool.query(
    `INSERT INTO counselor_users (id, email, password_hash, first_name, last_name, phone)
     VALUES ($1, $2, $3, $4, $5, $6)
     ON CONFLICT (email) DO UPDATE SET
       password_hash = CASE WHEN $7 THEN EXCLUDED.password_hash ELSE counselor_users.password_hash END,
       first_name = COALESCE(NULLIF(EXCLUDED.first_name, ''), counselor_users.first_name),
       last_name = COALESCE(NULLIF(EXCLUDED.last_name, ''), counselor_users.last_name),
       phone = COALESCE(NULLIF(EXCLUDED.phone, ''), counselor_users.phone)
     RETURNING *`,
    [
      id,
      email,
      hash,
      profile?.first_name || meta.first_name || "",
      profile?.last_name || meta.last_name || "",
      profile?.phone || "",
      Boolean(passwordPlain),
    ],
  );
  return created.rows[0];
}

function emailsMatch(left, right) {
  const a = String(left || "").trim().toLowerCase();
  const b = String(right || "").trim().toLowerCase();
  if (!a || !b) return false;
  if (a === b) return true;
  const key = (value) => String(value || "").split("@")[0].replace(/[^a-z0-9]/g, "");
  const leftKey = key(a);
  const rightKey = key(b);
  return Boolean(leftKey && leftKey === rightKey && leftKey.length >= 4);
}

function coalesceLeadRow(a, b) {
  if (!a) return { ...b };
  if (!b) return { ...a };
  return {
    ...a,
    ...b,
    assigned_counselor_id: b.assigned_counselor_id || a.assigned_counselor_id || null,
    assigned_telecaller_id: b.assigned_telecaller_id || a.assigned_telecaller_id || null,
    assigned_counselor_at: (b.assigned_counselor_id ? b.assigned_counselor_at : null)
      || (a.assigned_counselor_id ? a.assigned_counselor_at : null)
      || null,
    assigned_telecaller_at: (b.assigned_telecaller_id ? b.assigned_telecaller_at : null)
      || (a.assigned_telecaller_id ? a.assigned_telecaller_at : null)
      || null,
    preferred_countries: (Array.isArray(b.preferred_countries) && b.preferred_countries.length
      ? b.preferred_countries
      : a.preferred_countries) || [],
    first_name: b.first_name || a.first_name || "",
    last_name: b.last_name || a.last_name || "",
    email: b.email || a.email || "",
    phone: b.phone || a.phone || "",
    notes: b.notes || a.notes || "",
  };
}

/** Merge SQL + JSON lead rows and dedupe portal duplicates keyed by user_id or email. */
function mergeLeadSources(sqlRows, jsonRows) {
  const combined = [];
  for (const row of [...sqlRows, ...jsonRows]) {
    const idx = combined.findIndex(
      (existing) =>
        String(existing.id) === String(row.id)
        || (row.user_id && existing.user_id && String(existing.user_id) === String(row.user_id))
        || emailsMatch(existing.email, row.email),
    );
    if (idx < 0) combined.push({ ...row });
    else combined[idx] = coalesceLeadRow(combined[idx], row);
  }
  return combined;
}

function findLeadJsonRecord(jsonLeads, id) {
  const key = String(id);
  return (
    jsonLeads.find((row) => String(row.id) === key)
    || jsonLeads.find((row) => String(row.user_id) === key)
    || null
  );
}

async function resolveCounselorId(rawId) {
  if (!rawId) return null;
  const counselors = await loadCounselors();
  const id = String(rawId);
  const found = counselors.find((row) => row.id === id || row.auth_user_id === id);
  if (!found) return isUuid(id) ? id : null;
  return [found.id, found.auth_user_id].find((value) => isUuid(value)) || found.id;
}

function mergeById(...lists) {
  const map = new Map();
  for (const list of lists) {
    for (const row of list || []) {
      if (row?.id == null) continue;
      map.set(String(row.id), row);
    }
  }
  return [...map.values()];
}



async function jsonDelete(id) {
  await pool.query("DELETE FROM app_records WHERE id = $1", [id]);
}

async function jsonClearTable(tableName) {
  await pool.query("DELETE FROM app_records WHERE table_name = $1", [tableName]);
}

async function jsonClearCatalogCountries(countries) {
  const list = [...new Set(countries.map((value) => String(value || "").trim()).filter(Boolean))];
  if (!list.length) return;
  for (const country of list) {
    await pool.query(
      `DELETE FROM app_records
       WHERE table_name = 'university_programs'
         AND lower(data->>'country') = lower($1)`,
      [country],
    );
    await pool.query(
      `DELETE FROM app_records
       WHERE table_name = 'universities'
         AND lower(data->>'country') = lower($1)`,
      [country],
    );
  }
}

async function jsonBulkUpsert(tableName, rows) {
  for (const row of rows) {
    await jsonUpsert(tableName, row);
  }
}

async function jsonTableCount(tableName) {
  const result = await pool.query(
    "SELECT COUNT(*)::int AS count FROM app_records WHERE table_name = $1",
    [tableName],
  );
  return Number(result.rows[0]?.count || 0);
}

function catalogFilters({ q = "", country = "", university = "", degree = "", course = "" } = {}) {
  const clauses = [];
  const params = ["university_programs"];
  let index = 2;

  const exact = [
    ["country", country],
    ["university_name", university],
    ["degree", degree],
    ["course", course],
  ];
  for (const [field, value] of exact) {
    const text = String(value || "").trim();
    if (!text) continue;
    clauses.push(`lower(data->>'${field}') = lower($${index})`);
    params.push(text);
    index += 1;
  }

  const needle = String(q || "").trim().toLowerCase();
  if (needle) {
    clauses.push(`(
      lower(data->>'university_name') LIKE $${index} OR
      lower(data->>'program_name') LIKE $${index} OR
      lower(data->>'country') LIKE $${index} OR
      lower(data->>'course') LIKE $${index} OR
      lower(data->>'specialization') LIKE $${index} OR
      lower(data->>'location') LIKE $${index}
    )`);
    params.push(`%${needle}%`);
    index += 1;
  }

  const where = clauses.length ? `AND ${clauses.join(" AND ")}` : "";
  return { where, params, nextIndex: index };
}

async function searchUniversityPrograms({
  q = "",
  country = "",
  university = "",
  degree = "",
  course = "",
  limit = 100,
  offset = 0,
} = {}) {
  const safeLimit = Math.min(Math.max(Number(limit) || 100, 1), 500);
  const safeOffset = Math.max(Number(offset) || 0, 0);
  const { where, params } = catalogFilters({ q, country, university, degree, course });
  const listParams = [...params, safeLimit, safeOffset];
  const limitIndex = params.length + 1;
  const offsetIndex = params.length + 2;

  const [rowsResult, countResult] = await Promise.all([
    pool.query(
      `SELECT id, data
       FROM app_records
       WHERE table_name = $1
       ${where}
       ORDER BY lower(data->>'course'), lower(data->>'specialization'), lower(data->>'program_name')
       LIMIT $${limitIndex} OFFSET $${offsetIndex}`,
      listParams,
    ),
    pool.query(
      `SELECT COUNT(*)::int AS count
       FROM app_records
       WHERE table_name = $1
       ${where}`,
      params,
    ),
  ]);
  return {
    rows: rowsResult.rows.map((row) => {
      const data = row.data && typeof row.data === "object" ? row.data : {};
      return { ...data, id: data.id || row.id };
    }),
    total: Number(countResult.rows[0]?.count || 0),
    limit: safeLimit,
    offset: safeOffset,
  };
}

async function catalogCountries() {
  const result = await pool.query(
    `SELECT
       data->>'country' AS name,
       COUNT(DISTINCT data->>'university_name')::int AS university_count,
       COUNT(*)::int AS program_count
     FROM app_records
     WHERE table_name = $1 AND coalesce(data->>'country', '') <> ''
     GROUP BY data->>'country'
     ORDER BY lower(data->>'country')`,
    ["university_programs"],
  );
  return result.rows.map((row) => ({
    name: row.name || "Unknown",
    university_count: Number(row.university_count || 0),
    program_count: Number(row.program_count || 0),
  }));
}

async function catalogUniversities(country) {
  const result = await pool.query(
    `SELECT
       data->>'university_name' AS name,
       MAX(data->>'location') AS location,
       COUNT(*)::int AS program_count
     FROM app_records
     WHERE table_name = $1 AND lower(data->>'country') = lower($2)
     GROUP BY data->>'university_name'
     ORDER BY lower(data->>'university_name')`,
    ["university_programs", country],
  );
  return result.rows.map((row) => ({
    name: row.name || "Unknown",
    location: row.location || "",
    program_count: Number(row.program_count || 0),
  }));
}

async function catalogDegrees(country, university) {
  const result = await pool.query(
    `SELECT
       coalesce(nullif(data->>'degree', ''), 'Other') AS name,
       COUNT(*)::int AS program_count
     FROM app_records
     WHERE table_name = $1
       AND lower(data->>'country') = lower($2)
       AND lower(data->>'university_name') = lower($3)
     GROUP BY coalesce(nullif(data->>'degree', ''), 'Other')
     ORDER BY lower(coalesce(nullif(data->>'degree', ''), 'Other'))`,
    ["university_programs", country, university],
  );
  return result.rows.map((row) => ({
    name: row.name || "Other",
    program_count: Number(row.program_count || 0),
  }));
}


// Verifies the token and re-reads the caller's role from the database on every request,
// so a demoted or deleted account loses access immediately instead of at token expiry.









function publicUser(row, role) {
  const meta = row.user_metadata || {};
  return {
    id: String(row.id),
    email: row.email || "",
    firstName: row.first_name || meta.first_name || "",
    lastName: row.last_name || meta.last_name || "",
    phone: row.phone || "",
    role: role || "admin",
  };
}

function normalizeCountry(value) {
  return String(value || "").trim().toLowerCase();
}

// Self-serve sources enter as HOT LEADS. They become students only when their assigned
// counselor converts them from the counselor portal.
const SELF_SERVE_SOURCES = ["student_site", "student_chat"];

function asLead(row) {
  const selfServe = SELF_SERVE_SOURCES.includes(String(row.lead_source || ""));
  const converted = row.entity_type === "student" || row.lead_status === "converted";
  const openStatus = selfServe ? "hot" : "warm";
  return {
    ...row,
    id: String(row.id),
    user_id: row.user_id == null ? row.user_id : String(row.user_id),
    first_name: row.first_name || "",
    last_name: row.last_name || "",
    email: row.email || "",
    phone: row.phone || "",
    field_of_interest: row.field_of_interest || "",
    academic_score: row.academic_score || "",
    preferred_countries: Array.isArray(row.preferred_countries) ? row.preferred_countries : [],
    assigned_counselor_id: row.assigned_counselor_id == null ? null : String(row.assigned_counselor_id),
    assigned_telecaller_id: row.assigned_telecaller_id == null ? null : String(row.assigned_telecaller_id),
    assigned_counselor_at: row.assigned_counselor_at
      || (row.assigned_counselor_id && row.updated_at ? row.updated_at : null)
      || null,
    assigned_telecaller_at: row.assigned_telecaller_at
      || (row.assigned_telecaller_id && row.updated_at ? row.updated_at : null)
      || null,
    entity_type: converted ? "student" : (row.entity_type || "lead"),
    lead_status: row.lead_status || (converted ? "converted" : openStatus),
    lead_stage: row.lead_stage || row.lead_status || (converted ? "converted" : openStatus),
    lead_source: row.lead_source || "manual",
    priority: row.priority || "medium",
    notes: row.notes || "",
    next_follow_up_date: row.next_follow_up_date || null,
    last_contact_date: row.last_contact_date || null,
    conversion_date: row.conversion_date || null,
    created_at: row.created_at || null,
  };
}

function asDocument(row) {
  const status = row.status === "pending" ? "uploaded" : (row.status || "uploaded");
  return {
    ...row,
    id: String(row.id),
    user_id: row.user_id == null ? row.user_id : String(row.user_id),
    document_type: row.document_type || "",
    file_name: row.file_name || "",
    file_path: row.file_path || "",
    file_size: Number(row.file_size || 0),
    mime_type: row.mime_type || "",
    status,
    archived: Boolean(row.archived),
    admin_comments: row.admin_comments || "",
    reviewed_at: row.reviewed_at || null,
    created_at: row.created_at || null,
  };
}

function asApplication(row) {
  let status = row.status || "draft";
  if (status === "submitted") status = "pending_counselor";
  return {
    ...row,
    id: String(row.id),
    user_id: row.user_id == null ? row.user_id : String(row.user_id),
    university_name: row.university_name || "",
    course_name: row.course_name || "",
    country: row.country || "",
    city: row.city || "",
    intake_term: row.intake_term || "",
    priority_level: row.priority_level || "medium",
    status,
    notes: row.notes || "",
    counselor_comments: row.counselor_comments || "",
    created_at: row.created_at || null,
  };
}


async function ensureAdminUser() {
  if (IS_PRODUCTION) return;
  const found = await pool.query("SELECT * FROM auth_users WHERE lower(email) = 'admin@local.test'");
  let user = found.rows[0];
  if (!user) {
    await pool.query(
      "INSERT INTO auth_users (id, email, password, user_metadata) VALUES ($1, $2, $3, $4::jsonb)",
      [ADMIN_ID, "admin@local.test", hashPassword("admin123"), JSON.stringify({ first_name: "Fly", last_name: "Admin" })],
    );
    user = { id: ADMIN_ID, email: "admin@local.test" };
  }
  const roles = await jsonTable("user_roles");
  if (!roles.some((row) => String(row.user_id) === String(user.id))) {
    await jsonUpsert("user_roles", { id: "role-a1", user_id: String(user.id), role: "admin" });
  }
  const profiles = await jsonTable("profiles");
  if (!profiles.some((row) => String(row.user_id) === String(user.id))) {
    await jsonUpsert("profiles", {
      id: "profile-a1",
      user_id: String(user.id),
      first_name: "Fly",
      last_name: "Admin",
      phone: "",
      country: "India",
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });
  }
}

async function studentDirectory() {
  const profiles = await jsonTable("profiles");
  let users = [];
  try {
    const result = await pool.query("SELECT id, email, user_metadata FROM auth_users");
    users = result.rows;
  } catch {
    users = [];
  }
  return users.map((user) => {
    const profile = profiles.find((row) => String(row.user_id) === String(user.id));
    const meta = user.user_metadata || {};
    return {
      id: String(user.id),
      user_id: String(user.id),
      email: user.email || "",
      first_name: profile?.first_name || meta.first_name || "",
      last_name: profile?.last_name || meta.last_name || "",
      phone: profile?.phone || "",
      country: profile?.country || "",
    };
  });
}


function accountRole(roles, authUsers, userId, email) {
  const id = String(userId || "");
  const mail = String(email || "").trim().toLowerCase();
  const byId = roles.find((row) => String(row.user_id) === id);
  if (byId?.role) return byId.role;
  if (!mail) return null;
  const auth = authUsers.find((row) => String(row.email || "").trim().toLowerCase() === mail);
  if (!auth) return null;
  return roles.find((row) => String(row.user_id) === String(auth.id))?.role || "student";
}

async function publishCounselorAccount(row, passwordPlain) {
  const email = String(row.email || "").trim().toLowerCase();
  if (!email) return;
  const now = new Date().toISOString();
  const existing = await pool.query("SELECT id FROM auth_users WHERE lower(email) = $1", [email]).catch(() => ({ rows: [] }));
  let authId = existing.rows[0]?.id ? String(existing.rows[0].id) : "";
  const meta = JSON.stringify({
    first_name: row.first_name || "",
    last_name: row.last_name || "",
  });
  if (!authId) {
    authId = String(row.id);
    await pool.query(
      `INSERT INTO auth_users (id, email, password, user_metadata)
       VALUES ($1, $2, $3, $4::jsonb)
       ON CONFLICT (email) DO UPDATE SET user_metadata = EXCLUDED.user_metadata`,
      [authId, email, hashPassword(passwordPlain || crypto.randomUUID()), meta],
    );
  } else {
    await pool.query("UPDATE auth_users SET user_metadata = $2::jsonb WHERE id = $1", [authId, meta]);
  }
  const confirmed = await pool.query("SELECT id FROM auth_users WHERE lower(email) = $1", [email]);
  if (confirmed.rows[0]?.id) authId = String(confirmed.rows[0].id);

  const roles = await jsonTable("user_roles");
  const current = roles.find((item) => String(item.user_id) === authId);
  if (current?.role !== "admin" && current?.role !== "super_admin") {
    await jsonUpsert("user_roles", { id: current?.id || `role-${authId}`, user_id: authId, role: "counselor" });
  }

  const profiles = await jsonTable("profiles");
  const profile = profiles.find((item) => String(item.user_id) === authId) || { id: `profile-${authId}`, user_id: authId };
  await jsonUpsert("profiles", {
    ...profile,
    user_id: authId,
    first_name: row.first_name || profile.first_name || "",
    last_name: row.last_name || profile.last_name || "",
    phone: row.phone || profile.phone || "",
    country: profile.country || "India",
    created_at: profile.created_at || now,
    updated_at: now,
  });

  const counselors = await jsonTable("counselors");
  const counselor = counselors.find((item) => String(item.user_id) === authId || String(item.user_id) === String(row.id))
    || { id: `counselor-${authId}`, user_id: authId };
  await jsonUpsert("counselors", {
    ...counselor,
    user_id: authId,
    is_active: counselor.is_active === false ? false : true,
    specializations: row.specializations?.length ? row.specializations : (counselor.specializations || []),
    created_at: counselor.created_at || now,
    updated_at: now,
  });
}

async function syncPortalCounselors() {
  const sqlUsers = await pool.query(
    "SELECT id, email, first_name, last_name, phone, bio, specializations FROM counselor_users",
  );
  for (const row of sqlUsers.rows) {
    try {
      await publishCounselorAccount(row);
    } catch (error) {
      console.warn("Could not sync counselor", row.first_name, row.last_name, error.message);
    }
  }
}

async function loadCounselors() {
  await syncPortalCounselors().catch((error) => {
    console.warn("Counselor sync failed:", error.message);
  });
  const [sqlUsers, jsonCounselors, roles, profiles, authUsers] = await Promise.all([
    pool.query("SELECT id, email, first_name, last_name, phone, bio, specializations, created_at FROM counselor_users ORDER BY created_at DESC"),
    jsonTable("counselors"),
    jsonTable("user_roles"),
    jsonTable("profiles"),
    pool.query("SELECT id, email, user_metadata, created_at FROM auth_users").catch(() => ({ rows: [] })),
  ]);

  const counselorIds = new Set(
    roles.filter((row) => row.role === "counselor").map((row) => String(row.user_id)),
  );
  const counselorEmails = new Set(
    authUsers.rows
      .filter((row) => counselorIds.has(String(row.id)))
      .map((row) => String(row.email || "").trim().toLowerCase())
      .filter(Boolean),
  );

  const byKey = new Map();
  const put = (row, required = false) => {
    const email = String(row.email || "").trim().toLowerCase();
    const id = String(row.id || row.auth_user_id || "");
    const role = accountRole(roles, authUsers.rows, id, email);
    if (!required) {
      if (role === "admin" || role === "super_admin") return;
      if (role && role !== "counselor" && !counselorIds.has(id) && !counselorEmails.has(email)) return;
      if (!counselorIds.has(id) && !counselorEmails.has(email)) return;
    }
    const key = email || `id:${id}`;
    const current = byKey.get(key) || {};
    const uuidId = [id, current.id, row.auth_user_id, current.auth_user_id].find((value) => isUuid(value));
    const loginId = [current.auth_user_id, row.auth_user_id, current.id, id].find((value) => value && !isUuid(value));
    byKey.set(key, {
      id: uuidId || current.id || id,
      auth_user_id: loginId || row.auth_user_id || current.auth_user_id || id,
      email: email || current.email || "",
      first_name: row.first_name || current.first_name || "",
      last_name: row.last_name || current.last_name || "",
      phone: row.phone || current.phone || "",
      bio: row.bio || current.bio || "",
      specializations: row.specializations?.length ? row.specializations : (current.specializations || []),
      is_active: row.is_active == null ? (current.is_active ?? true) : Boolean(row.is_active),
      role: "counselor",
      created_at: current.created_at || row.created_at || null,
    });
  };

  for (const row of sqlUsers.rows) put(row, true);

  for (const role of roles.filter((row) => row.role === "counselor")) {
    const auth = authUsers.rows.find((item) => String(item.id) === String(role.user_id));
    const profile = profiles.find((item) => String(item.user_id) === String(role.user_id));
    const portal = sqlUsers.rows.find((item) => String(item.email || "").trim().toLowerCase() === String(auth?.email || "").trim().toLowerCase());
    const meta = auth?.user_metadata || {};
    put({
      id: role.user_id,
      auth_user_id: role.user_id,
      email: auth?.email || portal?.email || "",
      first_name: portal?.first_name || meta.first_name || profile?.first_name || "",
      last_name: portal?.last_name || meta.last_name || profile?.last_name || "",
      phone: portal?.phone || profile?.phone || "",
      bio: portal?.bio || "",
      specializations: portal?.specializations || [],
      created_at: auth?.created_at || portal?.created_at,
    }, true);
  }

  for (const row of jsonCounselors) {
    const auth = authUsers.rows.find((item) => String(item.id) === String(row.user_id));
    const profile = profiles.find((item) => String(item.user_id) === String(row.user_id));
    const portal = sqlUsers.rows.find((item) => String(item.email || "").trim().toLowerCase() === String(auth?.email || "").trim().toLowerCase());
    const meta = auth?.user_metadata || {};
    put({
      id: row.user_id || row.id,
      auth_user_id: row.user_id,
      email: auth?.email || portal?.email || "",
      first_name: portal?.first_name || meta.first_name || profile?.first_name || "",
      last_name: portal?.last_name || meta.last_name || profile?.last_name || "",
      phone: portal?.phone || profile?.phone || "",
      specializations: row.specializations || portal?.specializations || [],
      is_active: row.is_active !== false,
      created_at: row.created_at,
    });
  }

  return [...byKey.values()];
}

async function loadUsers() {
  const [authUsers, roles, profiles, sqlCounselors] = await Promise.all([
    pool.query("SELECT id, email, user_metadata, created_at FROM auth_users ORDER BY created_at DESC"),
    jsonTable("user_roles"),
    jsonTable("profiles"),
    pool.query("SELECT id, email, first_name, last_name, phone, created_at FROM counselor_users").catch(() => ({ rows: [] })),
  ]);
  const portalByEmail = new Map(
    sqlCounselors.rows.map((row) => [String(row.email || "").trim().toLowerCase(), row]),
  );
  const users = authUsers.rows.map((user) => {
    const email = String(user.email || "").trim().toLowerCase();
    const portal = portalByEmail.get(email);
    let role = roles.find((row) => String(row.user_id) === String(user.id))?.role || "student";
    if (portal && role !== "admin" && role !== "super_admin") role = "counselor";
    const profile = profiles.find((row) => String(row.user_id) === String(user.id));
    const meta = user.user_metadata || {};
    return {
      id: String(user.id),
      email: user.email,
      first_name: portal?.first_name || profile?.first_name || meta.first_name || "",
      last_name: portal?.last_name || profile?.last_name || meta.last_name || "",
      phone: portal?.phone || profile?.phone || "",
      country: profile?.country || "",
      role,
      is_active: profile?.is_active !== false,
      created_at: user.created_at,
    };
  });
  for (const row of sqlCounselors.rows) {
    const email = String(row.email || "").trim().toLowerCase();
    if (users.some((user) => String(user.email || "").trim().toLowerCase() === email)) continue;
    users.push({
      id: String(row.id),
      email: row.email,
      first_name: row.first_name || "",
      last_name: row.last_name || "",
      phone: row.phone || "",
      country: "",
      role: "counselor",
      is_active: true,
      created_at: row.created_at,
    });
  }
  return users;
}

function loadTelecallers(users) {
  return users
    .filter((user) => user.role === "telecaller")
    .map((user) => ({
      id: user.id,
      email: user.email,
      first_name: user.first_name,
      last_name: user.last_name,
      phone: user.phone,
      is_active: user.is_active !== false,
      created_at: user.created_at || null,
    }));
}

function studentKeyIds(lead) {
  return [...new Set([String(lead.user_id || ""), String(lead.id)].filter(Boolean))];
}

/** Move counselor chat threads and shortlists to the newly assigned counselor. */
async function transferCounselorOwnership(lead, newCounselorId) {
  if (!newCounselorId) return;
  const ids = studentKeyIds(lead);
  const convs = await jsonTable("private_conversations");
  for (const conv of convs) {
    if (ids.includes(String(conv.student_id))) {
      await jsonUpsert("private_conversations", { ...conv, counselor_id: newCounselorId });
    }
  }
  for (const sid of ids) {
    if (isUuid(sid) && isUuid(newCounselorId)) {
      await pool.query("UPDATE private_conversations SET counselor_id = $1 WHERE student_id = $2", [newCounselorId, sid]).catch(() => {});
    }
  }
  const shorts = await jsonTable("university_shortlists");
  for (const row of shorts) {
    if (ids.includes(String(row.student_id))) {
      await jsonUpsert("university_shortlists", { ...row, counselor_id: newCounselorId });
    }
  }
  for (const sid of ids) {
    if (isUuid(sid) && isUuid(newCounselorId)) {
      await pool.query("UPDATE university_shortlists SET counselor_id = $1 WHERE student_id = $2", [newCounselorId, sid]).catch(() => {});
    }
  }
}

/** Move telecaller chat threads to the newly assigned telecaller. */
async function transferTelecallerOwnership(lead, newTelecallerId) {
  if (!newTelecallerId) return;
  const ids = studentKeyIds(lead);
  const convs = await jsonTable("telecaller_conversations");
  for (const conv of convs) {
    if (ids.includes(String(conv.student_id))) {
      await jsonUpsert("telecaller_conversations", { ...conv, telecaller_id: newTelecallerId });
    }
  }
}

async function syncOwnershipOnAssignment(before, after) {
  if (!before || !after) return;
  const counselorChanged =
    String(before.assigned_counselor_id || "") !== String(after.assigned_counselor_id || "");
  const telecallerChanged =
    String(before.assigned_telecaller_id || "") !== String(after.assigned_telecaller_id || "");
  if (counselorChanged && after.assigned_counselor_id) {
    await transferCounselorOwnership(after, after.assigned_counselor_id);
  }
  if (telecallerChanged && after.assigned_telecaller_id) {
    await transferTelecallerOwnership(after, after.assigned_telecaller_id);
  }
  await whatsapp.syncConversationForLead(after);
}

function counselorKeyIds(counselor) {
  return [...new Set([String(counselor.id || ""), String(counselor.auth_user_id || "")].filter(Boolean))];
}

function leadOwnedByCounselor(lead, counselor) {
  const ids = counselorKeyIds(counselor);
  return ids.includes(String(lead.assigned_counselor_id || ""));
}

async function transferCounselorThreads(fromCounselor, toCounselor) {
  const fromIds = counselorKeyIds(fromCounselor);
  const targetId = String(toCounselor.id);
  const convs = await jsonTable("private_conversations");
  for (const conv of convs) {
    if (fromIds.includes(String(conv.counselor_id))) {
      await jsonUpsert("private_conversations", { ...conv, counselor_id: targetId });
    }
  }
  for (const fid of fromIds) {
    if (isUuid(fid) && isUuid(targetId)) {
      await pool.query("UPDATE private_conversations SET counselor_id = $1 WHERE counselor_id = $2", [targetId, fid]).catch(() => {});
    }
  }
  const shorts = await jsonTable("university_shortlists");
  for (const row of shorts) {
    if (fromIds.includes(String(row.counselor_id))) {
      await jsonUpsert("university_shortlists", { ...row, counselor_id: targetId });
    }
  }
  for (const fid of fromIds) {
    if (isUuid(fid) && isUuid(targetId)) {
      await pool.query("UPDATE university_shortlists SET counselor_id = $1 WHERE counselor_id = $2", [targetId, fid]).catch(() => {});
    }
  }
}

function leadOwnedByTelecaller(lead, telecallerId) {
  return String(lead.assigned_telecaller_id || "") === String(telecallerId || "");
}

function isOpenLeadRecord(lead) {
  return lead.entity_type !== "student" && lead.lead_status !== "converted";
}

async function transferTelecallerThreads(fromTelecallerId, toTelecallerId) {
  const convs = await jsonTable("telecaller_conversations");
  for (const conv of convs) {
    if (String(conv.telecaller_id) === String(fromTelecallerId)) {
      await jsonUpsert("telecaller_conversations", { ...conv, telecaller_id: String(toTelecallerId) });
    }
  }
  if (isUuid(fromTelecallerId) && isUuid(toTelecallerId)) {
    await pool
      .query("UPDATE telecaller_conversations SET telecaller_id = $1 WHERE telecaller_id = $2", [
        toTelecallerId,
        fromTelecallerId,
      ])
      .catch(() => {});
  }
}

async function transferTelecallerLeads(fromTelecallerId, toTelecallerId) {
  const users = await loadUsers();
  const from = users.find((row) => row.id === fromTelecallerId && row.role === "telecaller");
  const to = users.find((row) => row.id === toTelecallerId && row.role === "telecaller");
  if (!from) throw new Error("Telecaller not found.");
  if (!to) throw new Error("Target telecaller not found.");
  if (from.id === to.id) throw new Error("Choose a different telecaller to transfer to.");
  if (to.is_active === false) throw new Error("Target telecaller is not active.");

  const leads = await jsonTable("student_leads");
  let count = 0;
  for (const lead of leads) {
    if (!isOpenLeadRecord(lead) || !leadOwnedByTelecaller(lead, from.id)) continue;
    const before = { ...lead };
    const updated = await applyLeadPatch(lead.id, {
      assigned_telecaller_id: to.id,
      status: "assigned",
    });
    await syncOwnershipOnAssignment(before, updated);
    count += 1;
  }
  await transferTelecallerThreads(from.id, to.id);
  return count;
}

async function deactivateTelecaller(telecallerId) {
  const users = await loadUsers();
  const telecaller = users.find((row) => row.id === telecallerId && row.role === "telecaller");
  if (!telecaller) throw new Error("Telecaller not found.");

  const profiles = await jsonTable("profiles");
  let updated = false;
  for (const profile of profiles) {
    if (String(profile.user_id) === String(telecaller.id)) {
      await jsonUpsert("profiles", {
        ...profile,
        is_active: false,
        updated_at: new Date().toISOString(),
      });
      updated = true;
    }
  }
  if (!updated) {
    await jsonUpsert("profiles", {
      id: `profile-${telecaller.id}`,
      user_id: String(telecaller.id),
      first_name: telecaller.first_name || "",
      last_name: telecaller.last_name || "",
      phone: telecaller.phone || "",
      is_active: false,
      updated_at: new Date().toISOString(),
    });
  }

  return telecaller;
}

async function transferCounselorStudents(fromCounselorId, toCounselorId) {
  const counselors = await loadCounselors();
  const from = counselors.find((row) => row.id === fromCounselorId || row.auth_user_id === fromCounselorId);
  const to = counselors.find((row) => row.id === toCounselorId || row.auth_user_id === toCounselorId);
  if (!from) throw new Error("Counselor not found.");
  if (!to) throw new Error("Target counselor not found.");
  if (from.id === to.id) throw new Error("Choose a different counselor to transfer to.");

  const targetId = String(to.id);
  const leads = await jsonTable("student_leads");
  let count = 0;
  for (const lead of leads) {
    const converted = lead.entity_type === "student" || lead.lead_status === "converted";
    if (!converted || !leadOwnedByCounselor(lead, from)) continue;
    const before = { ...lead };
    const updated = await applyLeadPatch(lead.id, { assigned_counselor_id: targetId, status: "assigned" });
    await syncOwnershipOnAssignment(before, updated);
    count += 1;
  }
  await transferCounselorThreads(from, to);
  return count;
}

async function deactivateCounselor(counselorId) {
  const counselors = await loadCounselors();
  const counselor = counselors.find((row) => row.id === counselorId || row.auth_user_id === counselorId);
  if (!counselor) throw new Error("Counselor not found.");

  const leads = await jsonTable("student_leads");
  for (const lead of leads) {
    if (!leadOwnedByCounselor(lead, counselor)) continue;
    await applyLeadPatch(lead.id, { assigned_counselor_id: null, status: "unassigned" });
  }

  const keys = counselorKeyIds(counselor);
  const jsonCounselors = await jsonTable("counselors");
  for (const row of jsonCounselors) {
    if (keys.includes(String(row.id)) || keys.includes(String(row.user_id))) {
      await jsonUpsert("counselors", { ...row, is_active: false, updated_at: new Date().toISOString() });
    }
  }

  const authId = String(counselor.auth_user_id || counselor.id);
  const roles = await jsonTable("user_roles");
  const roleRow = roles.find((row) => String(row.user_id) === authId);
  if (roleRow && roleRow.role === "counselor") {
    await jsonDelete(roleRow.id);
  }

  const email = String(counselor.email || "").trim().toLowerCase();
  if (email) {
    await pool.query("DELETE FROM counselor_users WHERE lower(email) = $1", [email]).catch(() => {});
  }
  if (isUuid(counselor.id)) {
    await pool.query("DELETE FROM counselor_users WHERE id = $1", [counselor.id]).catch(() => {});
  }

  return counselor;
}

async function applyLeadPatch(id, patch) {
  if (patch.assigned_counselor_id !== undefined) {
    patch.assigned_counselor_id = await resolveCounselorId(patch.assigned_counselor_id);
  }

  const jsonLeads = await jsonTable("student_leads");
  const shared = findLeadJsonRecord(jsonLeads, id) || { id };
  const now = new Date().toISOString();

  if (patch.assigned_telecaller_id !== undefined) {
    const next = patch.assigned_telecaller_id || null;
    const prev = shared.assigned_telecaller_id || null;
    if (String(next || "") !== String(prev || "")) {
      patch.assigned_telecaller_at = next ? now : null;
    }
  }
  if (patch.assigned_counselor_id !== undefined) {
    const next = patch.assigned_counselor_id || null;
    const prev = shared.assigned_counselor_id || null;
    if (String(next || "") !== String(prev || "")) {
      patch.assigned_counselor_at = next ? now : null;
    }
  }

  if (patch.lead_status === "converted" || patch.entity_type === "student") {
    patch.entity_type = "student";
    patch.lead_stage = "converted";
    patch.lead_status = "converted";
    patch.conversion_date = patch.conversion_date || new Date().toISOString();
    if (!patch.assigned_counselor_id) {
      patch.assigned_counselor_id = null;
      patch.assigned_counselor_at = null;
      patch.status = "unassigned";
    }
  }

  if (isUuid(id)) {
    const keys = Object.keys(patch).filter((key) => key !== "preferred_countries" || Array.isArray(patch.preferred_countries));
    if (keys.length) {
      const sets = keys.map((key, index) => `${key} = $${index + 2}`);
      const values = keys.map((key) => patch[key]);
      await pool.query(`UPDATE student_leads SET ${sets.join(", ")} WHERE id = $1 OR user_id = $1`, [id, ...values]).catch(() => {});
    }
  }

  const storeId = String(shared.id || id);
  const merged = { ...shared, ...patch, id: storeId, updated_at: now };
  await jsonUpsert("student_leads", merged);
  return merged;
}

async function loadState() {
  const [
    sqlLeads,
    jsonLeads,
    sqlDocs,
    jsonDocs,
    jsonApps,
    sqlShort,
    jsonShort,
    sqlConv,
    jsonConv,
    sqlMsg,
    jsonMsg,
    sqlLeave,
    sqlAtt,
    sqlSalary,
    jsonNotes,
    sqlNotes,
    jsonUnis,
    programCount,
    jsonChecks,
    jsonChat,
    jsonChatMsgs,
    jsonTcConv,
    jsonTcMsg,
    jsonWaConv,
    jsonWaMsg,
    directory,
    counselors,
    users,
  ] = await Promise.all([
    pool.query("SELECT * FROM student_leads ORDER BY created_at DESC").catch(() => ({ rows: [] })),
    jsonTable("student_leads"),
    pool.query("SELECT * FROM documents ORDER BY created_at DESC").catch(() => ({ rows: [] })),
    jsonTable("documents"),
    jsonTable("applications"),
    pool.query("SELECT * FROM university_shortlists ORDER BY created_at DESC").catch(() => ({ rows: [] })),
    jsonTable("university_shortlists"),
    pool.query("SELECT * FROM private_conversations ORDER BY last_message_at DESC NULLS LAST").catch(() => ({ rows: [] })),
    jsonTable("private_conversations"),
    pool.query("SELECT * FROM private_messages ORDER BY created_at ASC").catch(() => ({ rows: [] })),
    jsonTable("private_messages"),
    pool.query("SELECT * FROM counselor_leave_requests ORDER BY applied_on DESC").catch(() => ({ rows: [] })),
    pool.query(
      `SELECT id, counselor_id, date::text AS date, clock_in::text AS clock_in, clock_out::text AS clock_out, total_hours, status
       FROM counselor_attendance ORDER BY date DESC`,
    ).catch(() => ({ rows: [] })),
    pool.query("SELECT * FROM counselor_salary_records ORDER BY year DESC, month DESC").catch(() => ({ rows: [] })),
    jsonTable("notifications"),
    pool.query("SELECT * FROM notifications ORDER BY created_at DESC").catch(() => ({ rows: [] })),
    jsonTable("universities"),
    jsonTableCount("university_programs"),
    jsonTable("document_checklists"),
    jsonTable("chat_sessions"),
    jsonTable("chat_messages"),
    jsonTable("telecaller_conversations"),
    jsonTable("telecaller_messages"),
    jsonTable("whatsapp_conversations"),
    jsonTable("whatsapp_messages"),
    studentDirectory(),
    loadCounselors(),
    loadUsers(),
  ]);

  const leads = mergeLeadSources(
    sqlLeads.rows.map(asLead),
    jsonLeads.map(asLead),
  ).map((lead) => {
    const person = directory.find((item) => item.user_id === String(lead.user_id) || emailsMatch(item.email, lead.email));
    if (!person) return lead;
    return {
      ...lead,
      first_name: lead.first_name || person.first_name,
      last_name: lead.last_name || person.last_name,
      email: lead.email || person.email,
      phone: lead.phone || person.phone,
    };
  });

  const studentIds = new Set(users.filter((row) => row.role === "student").map((row) => row.id));
  // Portal signups with no lead row of their own enter as HOT LEADS, not students.
  // The one exception is somebody who already has real activity against their account
  // (documents, applications, shortlists) — they were converted before this rule existed,
  // so demoting them back to a lead would lose their place in the pipeline.
  const activeStudentIds = new Set();
  for (const row of [...sqlDocs.rows, ...jsonDocs, ...jsonApps]) {
    if (row.user_id) activeStudentIds.add(String(row.user_id));
  }
  for (const row of [...sqlShort.rows, ...jsonShort]) {
    if (row.student_id) activeStudentIds.add(String(row.student_id));
  }

  // New hot leads created this pass get persisted to student_leads (not just held in
  // memory for display) so admins can see and manually assign a telecaller from
  // Lead alerts or Telecaller leads.
  const freshHotLeads = [];
  for (const person of directory) {
    if (!studentIds.has(person.user_id)) continue;
    if (leads.some((lead) => String(lead.user_id) === person.user_id || emailsMatch(lead.email, person.email))) continue;
    const alreadyWorking = activeStudentIds.has(String(person.user_id));
    const synthLead = asLead({
      id: person.user_id,
      user_id: person.user_id,
      email: person.email,
      first_name: person.first_name,
      last_name: person.last_name,
      phone: person.phone,
      assigned_counselor_id: null,
      lead_source: "student_site",
      entity_type: alreadyWorking ? "student" : "lead",
      lead_status: alreadyWorking ? "converted" : "hot",
      lead_stage: alreadyWorking ? "converted" : "hot",
      status: alreadyWorking ? "converted" : "new",
      created_at: new Date().toISOString(),
    });
    leads.push(synthLead);
    if (!alreadyWorking) freshHotLeads.push(synthLead);
  }

  if (freshHotLeads.length) {
    for (const lead of freshHotLeads) {
      if (isUuid(lead.id)) {
        await pool.query(
          `INSERT INTO student_leads (
            id, user_id, email, phone, first_name, last_name, lead_status, lead_stage,
            lead_source, entity_type, status, created_at
          ) VALUES ($1,$2,$3,$4,$5,$6,'hot','hot',$7,'lead','new',$8)
          ON CONFLICT (id) DO NOTHING`,
          [lead.id, lead.user_id, lead.email, lead.phone, lead.first_name, lead.last_name, lead.lead_source, lead.created_at],
        ).catch(() => {});
      }
      await jsonUpsert("student_leads", { ...lead });
    }
  }

  return {
    users,
    counselors,
    telecallers: loadTelecallers(users),
    leads,
    documents: mergeById(sqlDocs.rows.map(asDocument), jsonDocs.map(asDocument)),
    applications: jsonApps.map(asApplication),
    shortlists: mergeById(sqlShort.rows, jsonShort).map((row) => ({
      ...row,
      id: String(row.id),
      student_id: row.student_id == null ? row.student_id : String(row.student_id),
      counselor_id: row.counselor_id == null ? row.counselor_id : String(row.counselor_id),
      university_name: row.university_name || "",
      course_name: row.course_name || "",
      location: row.location || "",
      counselor_notes: row.counselor_notes || "",
      status: row.status || "recommended",
      created_at: row.created_at || null,
    })),
    conversations: mergeById(sqlConv.rows, jsonConv).map((row) => ({
      ...row,
      id: String(row.id),
      student_id: String(row.student_id),
      counselor_id: String(row.counselor_id),
    })),
    messages: mergeById(sqlMsg.rows, jsonMsg).map((row) => ({
      ...row,
      id: String(row.id),
      conversation_id: String(row.conversation_id),
      sender_id: String(row.sender_id),
      receiver_id: String(row.receiver_id),
      message: row.message || "",
      is_read: Boolean(row.is_read),
    })),
    leave: sqlLeave.rows,
    attendance: sqlAtt.rows.map((row) => ({
      ...row,
      clock_in: row.clock_in ? String(row.clock_in).slice(0, 8) : null,
      clock_out: row.clock_out ? String(row.clock_out).slice(0, 8) : null,
      date: String(row.date || "").slice(0, 10),
      total_hours: row.total_hours == null ? null : Number(row.total_hours),
    })),
    salary: sqlSalary.rows.map((row) => ({ ...row, net_salary: Number(row.net_salary || 0) })),
    notifications: mergeById(
      sqlNotes.rows.map((row) => ({ ...row, message: row.message || row.body || "" })),
      jsonNotes,
    ),
    universities: jsonUnis,
    universityProgramCount: programCount,
    checklists: jsonChecks.sort((a, b) => Number(a.display_order || 0) - Number(b.display_order || 0)),
    chatSessions: jsonChat,
    chatMessages: jsonChatMsgs,
    telecallerConversations: jsonTcConv.map((row) => ({
      ...row,
      id: String(row.id),
      student_id: String(row.student_id),
      telecaller_id: String(row.telecaller_id),
    })),
    telecallerMessages: jsonTcMsg.map((row) => ({
      ...row,
      id: String(row.id),
      conversation_id: String(row.conversation_id),
      sender_id: String(row.sender_id),
      receiver_id: String(row.receiver_id),
      message: row.message || "",
      is_read: Boolean(row.is_read),
    })),
    whatsappConversations: jsonWaConv.map((row) => ({
      ...row,
      id: String(row.id),
      lead_id: String(row.lead_id || ""),
      user_id: row.user_id ? String(row.user_id) : "",
      phone_number: row.phone_number || "",
      assigned_staff_id: row.assigned_staff_id ? String(row.assigned_staff_id) : "",
      staff_role: row.staff_role || "",
    })),
    whatsappMessages: jsonWaMsg.map((row) => ({
      ...row,
      id: String(row.id),
      conversation_id: String(row.conversation_id),
      direction: row.direction || "inbound",
      kind: row.kind || "",
      body: row.body || "",
      staff_id: row.staff_id ? String(row.staff_id) : "",
      is_read: Boolean(row.is_read),
    })),
  };
}

async function notify(userId, title, message, type = "info", actionUrl = "") {
  if (!userId) return;
  const now = new Date().toISOString();
  const row = {
    id: crypto.randomUUID(),
    user_id: String(userId),
    title,
    message,
    type,
    action_url: actionUrl,
    created_at: now,
    is_read: false,
  };
  await jsonUpsert("notifications", row);
  if (isUuid(userId)) {
    await pool.query(
      "INSERT INTO notifications (id, user_id, title, message, is_read, created_at) VALUES ($1,$2,$3,$4,false,now()) ON CONFLICT (id) DO NOTHING",
      [row.id, userId, title, message],
    ).catch(() => {});
  }
}

async function notifyAdmins(title, message, actionUrl = "") {
  const users = await loadUsers();
  for (const user of users.filter((row) => ADMIN_ROLES.includes(row.role))) {
    await notify(user.id, title, message, "info", actionUrl);
  }
}

const whatsapp = createWhatsAppService({
  jsonTable,
  jsonUpsert,
  notify,
  pool,
  notifyAdmins,
  config: {
    accessToken: WHATSAPP_ACCESS_TOKEN,
    phoneNumberId: WHATSAPP_PHONE_NUMBER_ID,
    otpTemplateName: WHATSAPP_OTP_TEMPLATE_NAME,
    outreachTemplateName: WHATSAPP_OUTREACH_TEMPLATE_NAME,
    verifyToken: WHATSAPP_VERIFY_TOKEN,
  },
});

const router = express.Router();
const ALLOWED_ORIGINS = String(process.env.ALLOWED_ORIGINS || "")
  .split(",")
  .map((item) => item.trim())
  .filter(Boolean);

router.get("/api/health", async (_req, res) => {
  try {
    await pool.query("SELECT 1");
    res.json({ ok: true, database: "connected" });
  } catch {
    res.status(503).json({ ok: false, error: "PostgreSQL is not connected" });
  }
});

router.post("/api/auth/signup", async (req, res) => {
  try {
    if (IS_PRODUCTION && !ADMIN_SIGNUP_OPEN) {
      const submitted = String(req.body.code || "");
      if (!ADMIN_SIGNUP_CODE) {
        return res.status(403).json({
          error: "Admin signup is closed on this server. An admin must set ADMIN_SIGNUP_CODE in Railway variables, or create your account under Users.",
        });
      }
      if (submitted !== ADMIN_SIGNUP_CODE) {
        return res.status(403).json({ error: "That signup code is not valid." });
      }
    } else if (ADMIN_SIGNUP_CODE && String(req.body.code || "") !== ADMIN_SIGNUP_CODE) {
      return res.status(403).json({ error: "That signup code is not valid." });
    }

    const email = String(req.body.email || "").trim().toLowerCase();
    const password = String(req.body.password || "");
    const firstName = String(req.body.firstName || "").trim();
    const lastName = String(req.body.lastName || "").trim();
    const phone = String(req.body.phone || "").trim();
    if (!email || password.length < 6) {
      return res.status(400).json({ error: "Email and a password of at least 6 characters are required." });
    }
    if (!firstName || !lastName) {
      return res.status(400).json({ error: "First name and last name are required." });
    }
    const existing = await pool.query("SELECT id FROM auth_users WHERE lower(email) = $1", [email]);
    if (existing.rows[0]) {
      return res.status(400).json({ error: "An account with this email already exists. Sign in instead." });
    }
    const id = `admin-${crypto.randomUUID()}`;
    await pool.query(
      "INSERT INTO auth_users (id, email, password, user_metadata) VALUES ($1,$2,$3,$4::jsonb)",
      [id, email, hashPassword(password), JSON.stringify({ first_name: firstName, last_name: lastName })],
    );
    await jsonUpsert("user_roles", { id: `role-${id}`, user_id: id, role: "admin" });
    await jsonUpsert("profiles", {
      id: `profile-${id}`,
      user_id: id,
      first_name: firstName,
      last_name: lastName,
      phone,
      country: "India",
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });
    const user = publicUser({ id, email, first_name: firstName, last_name: lastName, phone }, "admin");
    res.json({ token: signUser(user), user });
  } catch (error) {
    res.status(500).json({ error: error.message || "Could not create account" });
  }
});

router.post("/api/auth/telecaller-signup", async (req, res) => {
  try {
    if (!TELECALLER_SIGNUP_CODE) {
      return res.status(403).json({ error: "Self signup is switched off. Ask an admin to create your account." });
    }
    if (String(req.body.code || "") !== TELECALLER_SIGNUP_CODE) {
      return res.status(403).json({ error: "That signup code is not valid." });
    }
    const email = String(req.body.email || "").trim().toLowerCase();
    const password = String(req.body.password || "");
    const firstName = String(req.body.firstName || "").trim();
    const lastName = String(req.body.lastName || "").trim();
    const phone = String(req.body.phone || "").trim();
    if (!email || password.length < 6) {
      return res.status(400).json({ error: "Email and a password of at least 6 characters are required." });
    }
    if (!firstName || !lastName) {
      return res.status(400).json({ error: "First name and last name are required." });
    }
    const existing = await pool.query("SELECT id FROM auth_users WHERE lower(email) = $1", [email]);
    if (existing.rows[0]) {
      return res.status(400).json({ error: "An account with this email already exists. Sign in instead." });
    }
    const id = `user-${crypto.randomUUID()}`;
    await pool.query(
      "INSERT INTO auth_users (id, email, password, user_metadata) VALUES ($1,$2,$3,$4::jsonb)",
      [id, email, hashPassword(password), JSON.stringify({ first_name: firstName, last_name: lastName })],
    );
    await jsonUpsert("user_roles", { id: `role-${id}`, user_id: id, role: "telecaller" });
    await jsonUpsert("profiles", {
      id: `profile-${id}`,
      user_id: id,
      first_name: firstName,
      last_name: lastName,
      phone,
      country: "India",
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });
    const users = await loadUsers();
    for (const admin of users.filter((row) => ADMIN_ROLES.includes(row.role))) {
      await notify(admin.id, "New telecaller registered", `${firstName} ${lastName} created a telecaller account.`, "info", "/admin/telecallers");
    }
    const user = publicUser({ id, email, first_name: firstName, last_name: lastName, phone }, "telecaller");
    res.json({ token: signUser(user), user });
  } catch (error) {
    res.status(500).json({ error: error.message || "Could not create account" });
  }
});

router.post("/api/auth/signin", async (req, res) => {
  try {
    const email = String(req.body.email || "").trim().toLowerCase();
    const password = String(req.body.password || "");
    const found = await pool.query("SELECT * FROM auth_users WHERE lower(email) = $1", [email]);
    const row = found.rows[0];
    if (!row || !verifyPassword(password, row.password)) {
      return res.status(401).json({ error: "Wrong email or password." });
    }
    if (!String(row.password).startsWith("scrypt:")) {
      const next = hashPassword(password);
      await pool.query("UPDATE auth_users SET password = $2 WHERE id = $1", [row.id, next]);
      row.password = next;
    }
    const role = await roleFor(row.id);
    const active = await pool.query("SELECT is_active FROM user_roles WHERE user_id = $1", [row.id]);
    if (active.rows[0]?.is_active === false) {
      return res.status(403).json({ error: "This account is disabled. Ask an admin." });
    }
    const profiles = await jsonTable("profiles");
    const profile = profiles.find((item) => String(item.user_id) === String(row.id));
    const user = publicUser({ ...row, first_name: profile?.first_name, last_name: profile?.last_name, phone: profile?.phone }, role);
    res.json({ token: signUser(user), user });
  } catch (error) {
    res.status(500).json({ error: error.message || "Could not sign in" });
  }
});

router.get("/api/me", session, async (req, res) => {
  const found = await pool.query("SELECT * FROM auth_users WHERE id = $1", [req.user.id]);
  if (!found.rows[0]) return res.status(401).json({ error: "Account not found" });
  const role = await roleFor(req.user.id);
  const profiles = await jsonTable("profiles");
  const profile = profiles.find((item) => String(item.user_id) === String(req.user.id));
  res.json({ user: publicUser({ ...found.rows[0], first_name: profile?.first_name, last_name: profile?.last_name, phone: profile?.phone }, role) });
});

// ---------------------------------------------------------------------------
// Telecaller portal API
//
// Every route here is scoped to the signed-in telecaller. A telecaller can only
// read and write leads where assigned_telecaller_id is their own id, enforced
// server-side on each request rather than trusted from the client.
// ---------------------------------------------------------------------------

const TELECALLER_LEAD_FIELDS = [
  "first_name", "last_name", "email", "phone",
  "field_of_interest", "academic_score", "preferred_countries",
  "lead_status", "next_follow_up_date", "notes", "priority",
];

const CALL_OUTCOMES = ["connected", "no_answer", "busy", "wrong_number", "not_interested", "callback"];

async function ownedLead(telecallerId, leadId) {
  const rows = await jsonTable("student_leads");
  const lead = rows.find((row) => String(row.id) === String(leadId));
  if (!lead) return { error: "Lead not found." };
  if (String(lead.assigned_telecaller_id || "") !== String(telecallerId)) {
    return { error: "That lead is not assigned to you." };
  }
  return { lead };
}

async function ownedCounselorLead(counselorUserId, leadId) {
  const counselors = await loadCounselors();
  const counselor = counselors.find(
    (row) => String(row.auth_user_id || "") === String(counselorUserId) || String(row.id) === String(counselorUserId),
  );
  if (!counselor) return { error: "Counselor profile not found." };

  const lead = findLeadJsonRecord(await jsonTable("student_leads"), leadId);
  if (!lead) return { error: "Lead not found." };
  if (!leadOwnedByCounselor(lead, counselor)) {
    return { error: "That lead is not assigned to you." };
  }
  return { lead, counselor };
}

// Telecaller ids are not always real UUIDs (self-signup mints "user-<uuid>"), so chat is
// stored in the flexible app_records JSON tables rather than the UUID-typed
// private_conversations/private_messages tables the counselor portal uses.
async function ownedStudentLead(telecallerId, studentId) {
  const rows = await jsonTable("student_leads");
  const lead = rows.find(
    (row) => String(row.user_id || "") === String(studentId) || String(row.id) === String(studentId),
  );
  if (!lead) return { error: "This lead has no student portal account yet." };
  if (String(lead.assigned_telecaller_id || "") !== String(telecallerId)) {
    return { error: "That lead is not assigned to you." };
  }
  return { lead };
}

router.get("/api/telecaller/state", telecallerAuth, async (req, res) => {
  try {
    const state = await loadState();
    const mine = state.leads.filter(
      (lead) => String(lead.assigned_telecaller_id || "") === String(req.user.id),
    );
    const mineOpen = mine.filter(
      (lead) => lead.entity_type !== "student" && lead.lead_status !== "converted",
    );
    await whatsapp.syncConversationsForLeads(mineOpen);

    const [allConversations, allMessages, waConv, waMsg] = await Promise.all([
      jsonTable("telecaller_conversations"),
      jsonTable("telecaller_messages"),
      jsonTable("whatsapp_conversations"),
      jsonTable("whatsapp_messages"),
    ]);
    const myConversations = allConversations.filter((row) => String(row.telecaller_id) === String(req.user.id));
    const myConversationIds = new Set(myConversations.map((row) => String(row.id)));
    const myWhatsAppConversations = waConv.filter((row) =>
      whatsapp.staffCanViewConversation(row, req.user, state.counselors || [], mineOpen),
    );
    const myWhatsAppIds = new Set(myWhatsAppConversations.map((row) => String(row.id)));
    res.json({
      leads: mine,
      notifications: state.notifications.filter((row) => String(row.user_id) === String(req.user.id)),
      counselors: state.counselors.map((row) => ({
        id: row.id,
        first_name: row.first_name,
        last_name: row.last_name,
        specializations: row.specializations || [],
      })),
      conversations: myConversations,
      messages: allMessages.filter((row) => myConversationIds.has(String(row.conversation_id))),
      whatsappConversations: myWhatsAppConversations,
      whatsappMessages: waMsg.filter((row) => myWhatsAppIds.has(String(row.conversation_id))),
    });
  } catch (error) {
    res.status(500).json({ error: error.message || "Could not load your leads" });
  }
});

router.get("/api/telecaller/whatsapp", telecallerAuth, async (req, res) => {
  try {
    const state = await loadState();
    const mineOpen = state.leads.filter(
      (lead) =>
        String(lead.assigned_telecaller_id || "") === String(req.user.id) &&
        lead.entity_type !== "student" &&
        lead.lead_status !== "converted",
    );
    await whatsapp.syncConversationsForLeads(mineOpen);

    const [waConv, waMsg] = await Promise.all([
      jsonTable("whatsapp_conversations"),
      jsonTable("whatsapp_messages"),
    ]);
    const mineIds = new Set(mineOpen.map((lead) => String(lead.id)));
    const conversations = waConv.filter((row) => {
      if (whatsapp.staffCanViewConversation(row, req.user, state.counselors || [], mineOpen)) return true;
      if (mineIds.has(String(row.lead_id || ""))) return true;
      return mineOpen.some(
        (lead) =>
          whatsapp.phonesMatch(lead.phone, row.phone_number) ||
          whatsapp.phonesMatch(lead.whatsapp_number, row.phone_number),
      );
    });
    const ids = new Set(conversations.map((row) => String(row.id)));
    res.json({
      conversations,
      messages: waMsg.filter((row) => ids.has(String(row.conversation_id))),
    });
  } catch (error) {
    res.status(500).json({ error: error.message || "Could not load WhatsApp" });
  }
});

router.post("/api/telecaller/whatsapp/messages", telecallerAuth, async (req, res) => {
  try {
    const leadId = String(req.body.leadId || "");
    const message = String(req.body.message || req.body.body || "").trim();
    if (!leadId || !message) {
      return res.status(400).json({ error: "Choose a lead and type a message." });
    }

    const owned = await ownedLead(req.user.id, leadId);
    if (owned.error) return res.status(403).json({ error: owned.error });
    const lead = owned.lead;
    if (lead.entity_type === "student" || lead.lead_status === "converted") {
      return res.status(403).json({ error: "This chat has moved to the counselor." });
    }

    const result = await whatsapp.sendLeadMessage({
      lead,
      staffId: req.user.id,
      text: message,
    });
    res.json(result);
  } catch (error) {
    res.status(error.status || 500).json({ error: error.message || "Could not send WhatsApp message" });
  }
});

router.post("/api/telecaller/notifications/read", telecallerAuth, async (req, res) => {
  try {
    const all = Boolean(req.body.all);
    const ids = new Set(
      (Array.isArray(req.body.ids) ? req.body.ids : [req.body.id]).filter(Boolean).map(String),
    );
    const rows = await jsonTable("notifications");
    let count = 0;
    for (const row of rows) {
      if (String(row.user_id) !== String(req.user.id)) continue;
      if (row.is_read) continue;
      if (!all && !ids.has(String(row.id))) continue;
      await jsonUpsert("notifications", { ...row, is_read: true });
      count += 1;
    }
    res.json({ ok: true, count });
  } catch (error) {
    res.status(500).json({ error: error.message || "Could not update notifications" });
  }
});

router.post("/api/telecaller/conversations", telecallerAuth, async (req, res) => {
  try {
    const studentId = String(req.body.studentId || "");
    const owned = await ownedStudentLead(req.user.id, studentId);
    if (owned.error) return res.status(403).json({ error: owned.error });

    const studentKey = String(owned.lead.user_id || owned.lead.id);
    const rows = await jsonTable("telecaller_conversations");
    const existing = rows.find(
      (row) =>
        String(row.telecaller_id) === String(req.user.id) &&
        (String(row.student_id) === studentKey ||
          String(row.student_id) === String(owned.lead.id) ||
          String(row.student_id) === String(owned.lead.user_id || "")),
    );
    if (existing) {
      if (String(existing.student_id) !== studentKey) {
        await jsonUpsert("telecaller_conversations", { ...existing, student_id: studentKey });
      }
      return res.json({ ...existing, student_id: studentKey });
    }

    const created = await jsonUpsert("telecaller_conversations", {
      id: crypto.randomUUID(),
      telecaller_id: req.user.id,
      student_id: studentKey,
      last_message_at: null,
      created_at: new Date().toISOString(),
    });
    res.json(created);
  } catch (error) {
    res.status(500).json({ error: error.message || "Could not start the conversation" });
  }
});

router.post("/api/telecaller/messages", telecallerAuth, async (req, res) => {
  try {
    const conversationId = String(req.body.conversationId || "");
    const message = String(req.body.message || "").trim();
    if (!message) return res.status(400).json({ error: "Message cannot be empty." });

    const conversations = await jsonTable("telecaller_conversations");
    const conversation = conversations.find((row) => String(row.id) === conversationId);
    if (!conversation || String(conversation.telecaller_id) !== String(req.user.id)) {
      return res.status(404).json({ error: "Conversation not found." });
    }

    const now = new Date().toISOString();
    const created = await jsonUpsert("telecaller_messages", {
      id: crypto.randomUUID(),
      conversation_id: conversationId,
      sender_id: req.user.id,
      receiver_id: conversation.student_id,
      message,
      is_read: false,
      created_at: now,
    });
    await jsonUpsert("telecaller_conversations", { ...conversation, last_message_at: now });
    await notify(conversation.student_id, "New message from your telecaller", message.slice(0, 140), "info", "/student/chat");
    res.json(created);
  } catch (error) {
    res.status(500).json({ error: error.message || "Could not send the message" });
  }
});

router.post("/api/telecaller/conversations/:id/read", telecallerAuth, async (req, res) => {
  try {
    const conversations = await jsonTable("telecaller_conversations");
    const conversation = conversations.find((row) => String(row.id) === String(req.params.id));
    if (!conversation || String(conversation.telecaller_id) !== String(req.user.id)) {
      return res.status(404).json({ error: "Conversation not found." });
    }
    const messages = await jsonTable("telecaller_messages");
    const unread = messages.filter(
      (row) =>
        String(row.conversation_id) === String(req.params.id) &&
        String(row.receiver_id) === String(req.user.id) &&
        !row.is_read,
    );
    for (const row of unread) {
      await jsonUpsert("telecaller_messages", { ...row, is_read: true });
    }
    res.json({ ok: true });
  } catch (error) {
    res.status(500).json({ error: error.message || "Could not mark messages read" });
  }
});

router.post("/api/telecaller/leads", telecallerAuth, async (req, res) => {
  try {
    const email = String(req.body.email || "").trim().toLowerCase();
    if (!email) return res.status(400).json({ error: "Email is required." });

    const rawCountries = req.body.preferred_countries ?? req.body.countries ?? "";
    const countries = Array.isArray(rawCountries)
      ? rawCountries.map((item) => String(item).trim()).filter(Boolean)
      : String(rawCountries).split(",").map((item) => item.trim()).filter(Boolean);

    const studentId = crypto.randomUUID();
    const assignedAt = new Date().toISOString();
    const payload = {
      id: crypto.randomUUID(),
      user_id: studentId,
      email,
      phone: String(req.body.phone || "").trim(),
      first_name: String(req.body.first_name || req.body.firstName || "").trim(),
      last_name: String(req.body.last_name || req.body.lastName || "").trim(),
      preferred_countries: countries,
      field_of_interest: String(req.body.field_of_interest || req.body.field || "").trim(),
      academic_score: String(req.body.academic_score || req.body.score || "").trim(),
      lead_status: "warm",
      lead_stage: "warm",
      lead_source: "telecaller_manual",
      priority: "medium",
      assigned_telecaller_id: req.user.id,
      assigned_counselor_id: null,
      assigned_telecaller_at: assignedAt,
      assigned_counselor_at: null,
      entity_type: "lead",
      status: "assigned",
      notes: String(req.body.notes || "").trim(),
      created_at: assignedAt,
      updated_at: assignedAt,
    };

    if (isUuid(payload.id) && isUuid(studentId)) {
      await pool.query(
        `INSERT INTO student_leads (
          id, user_id, email, phone, first_name, last_name, preferred_countries, field_of_interest,
          academic_score, lead_status, lead_stage, lead_source, assigned_telecaller_id, assigned_counselor_id, entity_type, status, notes
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,'warm','warm',$10,$11,NULL,'lead','assigned',$12)
        ON CONFLICT (id) DO NOTHING`,
        [
          payload.id, studentId, payload.email, payload.phone, payload.first_name, payload.last_name, countries,
          payload.field_of_interest, payload.academic_score, payload.lead_source, req.user.id, payload.notes,
        ],
      ).catch(() => {});
    }
    await jsonUpsert("student_leads", payload);
    res.json(payload);
  } catch (error) {
    res.status(500).json({ error: error.message || "Could not create the lead" });
  }
});

router.patch("/api/telecaller/leads/:id", telecallerAuth, async (req, res) => {
  try {
    const owned = await ownedLead(req.user.id, req.params.id);
    if (owned.error) return res.status(403).json({ error: owned.error });

    const entries = Object.entries(req.body).filter(([key]) => TELECALLER_LEAD_FIELDS.includes(key));
    if (!entries.length) return res.json({ ok: true, lead: owned.lead });
    const patch = Object.fromEntries(entries);

    if (patch.lead_status && !["cold", "warm", "hot"].includes(patch.lead_status)) {
      return res.status(400).json({ error: "Status must be cold, warm or hot." });
    }
    // A telecaller can never move a lead across the conversion boundary from here,
    // nor attach a counselor. Conversion has its own audited route below.
    delete patch.entity_type;
    delete patch.assigned_counselor_id;
    delete patch.assigned_telecaller_id;
    if (patch.lead_status) patch.lead_stage = patch.lead_status;

    const lead = await applyLeadPatch(req.params.id, patch);
    res.json({ ok: true, lead });
  } catch (error) {
    res.status(500).json({ error: error.message || "Could not save the lead" });
  }
});

router.post("/api/telecaller/leads/:id/contact", telecallerAuth, async (req, res) => {
  try {
    const owned = await ownedLead(req.user.id, req.params.id);
    if (owned.error) return res.status(403).json({ error: owned.error });

    const outcome = String(req.body.outcome || "");
    if (!CALL_OUTCOMES.includes(outcome)) {
      return res.status(400).json({ error: "Choose a valid call outcome." });
    }
    const note = String(req.body.note || "").trim();
    const status = ["cold", "warm", "hot"].includes(String(req.body.lead_status || ""))
      ? String(req.body.lead_status)
      : null;
    const followUp = req.body.next_follow_up_date ? String(req.body.next_follow_up_date) : null;

    const stamp = new Date().toISOString();
    const label = outcome.replace(/_/g, " ");
    const entry = `[${stamp.slice(0, 10)}] ${label}${note ? ` — ${note}` : ""}`;

    const patch = {
      last_contact_date: stamp,
      notes: `${owned.lead.notes || ""}\n${entry}`.trim(),
      next_follow_up_date: followUp,
    };
    if (status) {
      patch.lead_status = status;
      patch.lead_stage = status;
    }
    const lead = await applyLeadPatch(req.params.id, patch);
    res.json({ ok: true, lead });
  } catch (error) {
    res.status(500).json({ error: error.message || "Could not log the call" });
  }
});

router.post("/api/telecaller/leads/:id/convert", telecallerAuth, async (req, res) => {
  try {
    const owned = await ownedLead(req.user.id, req.params.id);
    if (owned.error) return res.status(403).json({ error: owned.error });
    const lead = owned.lead;

    if (lead.entity_type === "student" || lead.lead_status === "converted") {
      return res.json({ ok: true, lead: asLead(lead) });
    }

    const missing = [];
    if (!(lead.preferred_countries || []).length) missing.push("preferred countries");
    if (!lead.field_of_interest) missing.push("field of interest");
    if (!lead.phone && !lead.whatsapp_number) missing.push("phone number");
    if (missing.length) {
      return res.status(400).json({ error: `Capture ${missing.join(", ")} before converting.` });
    }

    const stamp = new Date().toISOString();
    const before = { ...lead };
    const updated = await applyLeadPatch(req.params.id, {
      lead_status: "converted",
      lead_stage: "converted",
      entity_type: "student",
      conversion_date: stamp,
      last_contact_date: stamp,
      phone: lead.phone || String(lead.whatsapp_number || "").replace(/\D/g, "").slice(-10),
      assigned_counselor_id: null,
      status: "unassigned",
    });

    await syncOwnershipOnAssignment(before, updated);

    const name = updated.first_name || "A student";
    await notifyAdmins(
      "Student needs a counselor",
      `${name} was converted and is waiting for a counselor. The telecaller has left the WhatsApp chat.`,
      "/admin/alerts",
    );

    res.json({ ok: true, lead: updated });
  } catch (error) {
    res.status(500).json({ error: error.message || "Could not convert the lead" });
  }
});

/**
 * The checklist a specific student should see, built from their preferred countries and
 * degree level. document_checklists rows carry country/countries and degree_type/degree_types;
 * "All" matches anything. Each item is joined to whatever the student has already uploaded.
 */
function checklistApplies(item, countries, degree) {
  const wanted = countries.map((value) => String(value).trim().toLowerCase()).filter(Boolean);
  const itemCountries = [item.country, ...(item.countries || [])]
    .filter(Boolean)
    .map((value) => String(value).trim().toLowerCase());
  const countryOk =
    !itemCountries.length ||
    itemCountries.includes("all") ||
    (wanted.length > 0 && itemCountries.some((value) => wanted.includes(value)));

  const itemDegrees = [item.degree_type, ...(item.degree_types || [])]
    .filter(Boolean)
    .map((value) => String(value).trim().toLowerCase());
  const degreeOk =
    !itemDegrees.length ||
    itemDegrees.includes("all") ||
    (degree ? itemDegrees.includes(String(degree).trim().toLowerCase()) : true);

  return countryOk && degreeOk;
}

router.get("/api/students/:id/checklist", auth, async (req, res) => {
  try {
    const leads = await jsonTable("student_leads");
    const student = leads.find(
      (row) => String(row.id) === String(req.params.id) || String(row.user_id) === String(req.params.id),
    );
    if (!student) return res.status(404).json({ error: "Student not found." });

    const [items, sqlDocs, jsonDocs] = await Promise.all([
      jsonTable("document_checklists"),
      pool.query("SELECT * FROM documents").catch(() => ({ rows: [] })),
      jsonTable("documents"),
    ]);

    const owns = (ownerId) =>
      ownerId != null &&
      (String(ownerId) === String(student.user_id) || String(ownerId) === String(student.id));
    const docs = mergeById(sqlDocs.rows.map(asDocument), jsonDocs.map(asDocument))
      .filter((doc) => !doc.archived && owns(doc.user_id));

    const countries = student.preferred_countries || [];
    const degree = student.qualification_level || student.degree_level || "";

    const applicable = items
      .filter((item) => item.is_active !== false)
      .filter((item) => checklistApplies(item, countries, degree))
      .sort((a, b) => Number(a.display_order || 99) - Number(b.display_order || 99));

    const checklist = applicable.map((item) => {
      const match = docs.find(
        (doc) => String(doc.document_type || "").trim().toLowerCase() === String(item.document_type).trim().toLowerCase(),
      );
      return {
        document_type: item.document_type,
        description: item.description || "",
        is_required: item.is_required !== false,
        allowed_file_types: item.allowed_file_types || [],
        max_file_size_mb: item.max_file_size_mb || 20,
        status: match ? match.status : "requested",
        document_id: match?.id || null,
        file_name: match?.file_name || null,
        admin_comments: match?.admin_comments || "",
        uploaded_at: match?.created_at || null,
      };
    });

    const required = checklist.filter((row) => row.is_required);
    res.json({
      student_id: String(student.id),
      countries,
      degree,
      items: checklist,
      required_total: required.length,
      required_approved: required.filter((row) => row.status === "approved").length,
      awaiting_review: checklist.filter((row) => row.status === "uploaded" || row.status === "pending").length,
      not_uploaded: checklist.filter((row) => row.status === "requested").length,
      complete: required.length > 0 && required.every((row) => row.status === "approved"),
    });
  } catch (error) {
    res.status(500).json({ error: error.message || "Could not build the checklist" });
  }
});

router.get("/api/system/alerts", auth, (_req, res) => {
  const nextRunAt =
    alertStatus.enabled && alertStatus.lastRunAt
      ? new Date(new Date(alertStatus.lastRunAt).getTime() + ALERT_INTERVAL_HOURS * 3600000).toISOString()
      : null;
  res.json({ ...alertStatus, repeatHours: ALERT_REPEAT_HOURS, nextRunAt });
});

router.post("/api/system/auto-assign", auth, async (_req, res) => {
  try {
    if (!TELECALLER_AUTO_ASSIGN) {
      return res.status(400).json({ error: "Auto assignment is switched off. Set TELECALLER_AUTO_ASSIGN=true." });
    }
    const count = await autoAssignTelecallers();
    res.json({ ok: true, count });
  } catch (error) {
    res.status(500).json({ error: error.message || "Could not assign the leads" });
  }
});

router.post("/api/system/alerts/run", auth, async (_req, res) => {
  await checkUnassignedLeads();
  res.json({ ok: true, ...alertStatus });
});

router.get("/api/state", auth, async (req, res) => {
  try {
    const state = await loadState();
    state.notifications = state.notifications.filter((row) => String(row.user_id) === String(req.user.id));
    res.json(state);
  } catch (error) {
    res.status(500).json({ error: error.message || "Could not load admin data" });
  }
});

router.post("/api/leads", auth, async (req, res) => {
  const studentId = crypto.randomUUID();
  const countries = String(req.body.countries || "").split(",").map((item) => item.trim()).filter(Boolean);
  const telecallerId = req.body.telecallerId || null;
  const counselorId = await resolveCounselorId(req.body.counselorId || null);
  const assignedAt = new Date().toISOString();
  const payload = {
    id: crypto.randomUUID(),
    user_id: studentId,
    email: String(req.body.email || "").trim().toLowerCase(),
    phone: req.body.phone || "",
    first_name: req.body.firstName || "",
    last_name: req.body.lastName || "",
    preferred_countries: countries,
    field_of_interest: req.body.field || "",
    academic_score: req.body.score || "",
    lead_status: "warm",
    lead_stage: "warm",
    lead_source: req.body.source || "manual",
    priority: req.body.priority || "medium",
    assigned_telecaller_id: telecallerId,
    assigned_counselor_id: counselorId,
    assigned_telecaller_at: telecallerId ? assignedAt : null,
    assigned_counselor_at: counselorId ? assignedAt : null,
    entity_type: "lead",
    status: telecallerId || counselorId ? "assigned" : "new",
    notes: req.body.notes || "",
    created_at: assignedAt,
    updated_at: assignedAt,
  };
  if (isUuid(payload.id) && isUuid(studentId)) {
    await pool.query(
      `INSERT INTO student_leads (
        id, user_id, email, phone, first_name, last_name, preferred_countries, field_of_interest,
        academic_score, lead_status, lead_stage, lead_source, assigned_telecaller_id, assigned_counselor_id, entity_type, status, notes
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,'warm','warm',$10,$11,$12,'lead',$13,$14)
      ON CONFLICT (id) DO NOTHING`,
      [
        payload.id, studentId, payload.email, payload.phone, payload.first_name, payload.last_name, countries,
        payload.field_of_interest, payload.academic_score, payload.lead_source,
        isUuid(telecallerId) ? telecallerId : null,
        isUuid(counselorId) ? counselorId : null,
        payload.status, payload.notes,
      ],
    ).catch(() => {});
  }
  await jsonUpsert("student_leads", payload);
  if (telecallerId || counselorId) {
    await whatsapp.syncConversationForLead(payload);
  }
  if (telecallerId) {
    const waNote = payload.phone || payload.whatsapp_number ? " WhatsApp chat is in your telecaller inbox." : "";
    await notify(
      telecallerId,
      "New lead assigned",
      `${payload.first_name} ${payload.last_name} was assigned to you.${waNote}`,
      "info",
      payload.phone ? `/whatsapp?lead=${payload.id}` : "/queue",
    );
  }
  if (counselorId) {
    await notify(
      counselorId,
      "New lead assigned",
      `${payload.first_name} ${payload.last_name} was assigned to you.`,
      "info",
      "/counselor/students",
    );
  }
  res.json(payload);
});

router.patch("/api/leads/:id", auth, async (req, res) => {
  const allowed = [
    "lead_status", "lead_stage", "notes", "next_follow_up_date", "last_contact_date",
    "conversion_date", "entity_type", "assigned_counselor_id", "assigned_telecaller_id", "status", "priority",
    "cooled_at", "cooled_reason",
    "first_name", "last_name", "email", "phone", "field_of_interest", "academic_score", "preferred_countries",
  ];
  const body = { ...req.body };
  if (body.counselorId !== undefined && body.assigned_counselor_id === undefined) {
    body.assigned_counselor_id = body.counselorId;
  }
  const entries = Object.entries(body).filter(([key]) => allowed.includes(key));
  if (!entries.length) return res.json({ ok: true });
  const patch = Object.fromEntries(entries);
  if (patch.assigned_counselor_id === "") patch.assigned_counselor_id = null;
  if (patch.assigned_telecaller_id === "") patch.assigned_telecaller_id = null;
  if ((patch.assigned_counselor_id || patch.assigned_telecaller_id) && !patch.status) {
    patch.status = "assigned";
  }
  // Conversion must go through POST /api/counselor/leads/:id/convert in the counselor portal.
  if (patch.lead_status === "converted" || patch.entity_type === "student") {
    return res.status(403).json({
      error: "Only the assigned counselor can convert a lead from the counselor portal.",
    });
  }
  const jsonLeads = await jsonTable("student_leads");
  const current = findLeadJsonRecord(jsonLeads, req.params.id);
  const updated = await applyLeadPatch(req.params.id, patch);
  await syncOwnershipOnAssignment(current, updated);
  if (patch.assigned_telecaller_id) {
    const hasWhatsApp = Boolean(updated.whatsapp_number || updated.phone || updated.lead_source === "whatsapp");
    const waNote = hasWhatsApp ? " Reply on WhatsApp from your telecaller inbox." : "";
    await notify(
      patch.assigned_telecaller_id,
      updated.lead_source === "whatsapp" ? "WhatsApp lead assigned" : "Lead assigned",
      `${updated.first_name || "A lead"} was assigned to you.${waNote}`,
      "info",
      hasWhatsApp ? `/whatsapp?lead=${updated.id}` : "/queue",
    );
  }
  if (patch.assigned_counselor_id) {
    const waNote = updated.lead_source === "whatsapp" || updated.whatsapp_number ? " WhatsApp thread included." : "";
    await notify(
      patch.assigned_counselor_id,
      updated.entity_type === "student" || updated.lead_status === "converted" ? "Student assigned" : "Lead assigned",
      `${updated.first_name || "A lead"} was assigned to you.${waNote}`,
      "info",
      `/admin/counselors/${patch.assigned_counselor_id}`,
    );
  }
  res.json({ ok: true, lead: updated });
});

// Admins assign counselors; only the assigned counselor converts a lead from their portal.
router.post("/api/leads/:id/convert", auth, (_req, res) => {
  res.status(403).json({
    error: "Only the assigned counselor can convert a lead. They convert it from the counselor portal.",
  });
});

router.post("/api/counselor/leads/:id/convert", counselorAuth, async (req, res) => {
  try {
    const owned = await ownedCounselorLead(req.user.id, req.params.id);
    if (owned.error) return res.status(403).json({ error: owned.error });
    const lead = owned.lead;
    if (lead.entity_type === "student" || lead.lead_status === "converted") {
      return res.json({ ok: true, lead: asLead(lead) });
    }

    const stamp = new Date().toISOString();
    const before = { ...lead };
    const updated = await applyLeadPatch(req.params.id, {
      lead_status: "converted",
      lead_stage: "converted",
      entity_type: "student",
      conversion_date: stamp,
      status: lead.assigned_counselor_id ? "assigned" : "unassigned",
    });

    await syncOwnershipOnAssignment(before, updated);
    await whatsapp.syncConversationForLead(updated);

    if (updated.assigned_telecaller_id) {
      await notify(
        updated.assigned_telecaller_id,
        "Lead converted to student",
        `${updated.first_name || "Lead"} is now a student. Counselor takes over WhatsApp when assigned.`,
        "info",
        `/admin/students/${updated.id}`,
      );
    }

    if (updated.assigned_counselor_id) {
      await notify(
        updated.assigned_counselor_id,
        "Student ready on WhatsApp",
        `${updated.first_name || "Student"} was converted. You can reply on WhatsApp from your counselor portal.`,
        "info",
        `/admin/counselors/${updated.assigned_counselor_id}`,
      );
    } else {
      await notifyAdmins(
        "Converted student needs counselor",
        `${updated.first_name || "Student"} was converted from WhatsApp. Assign a counselor on Lead alerts.`,
        "/admin/alerts",
      );
    }

    res.json({ ok: true, lead: updated });
  } catch (error) {
    res.status(500).json({ error: error.message || "Could not convert the lead." });
  }
});

router.post("/api/leads/bulk-assign", auth, async (req, res) => {
  const ids = Array.isArray(req.body.ids) ? req.body.ids.map(String) : [];
  const counselorId = req.body.counselorId ? String(req.body.counselorId) : "";
  if (!ids.length) return res.status(400).json({ error: "Select at least one student." });
  if (!counselorId) return res.status(400).json({ error: "Choose a counselor to assign." });
  let count = 0;
  for (const id of ids) {
    const jsonLeads = await jsonTable("student_leads");
    const lead = jsonLeads.find((row) => String(row.id) === id);
    if (!lead) continue;
    const converted = lead.entity_type === "student" || lead.lead_status === "converted";
    if (!converted) continue;
    const updated = await applyLeadPatch(id, { assigned_counselor_id: counselorId, status: "assigned" });
    await syncOwnershipOnAssignment(lead, updated);
    count += 1;
  }
  await notify(
    counselorId,
    "Students assigned",
    `${count} student(s) were assigned to you with full history.`,
    "info",
    "/counselor/students",
  );
  res.json({ ok: true, count });
});

router.post("/api/leads/bulk-assign-telecaller", auth, async (req, res) => {
  const ids = Array.isArray(req.body.ids) ? req.body.ids.map(String) : [];
  const telecallerId = req.body.telecallerId ? String(req.body.telecallerId) : "";
  if (!ids.length || !telecallerId) return res.status(400).json({ error: "Select leads and a telecaller." });
  let count = 0;
  for (const id of ids) {
    const jsonLeads = await jsonTable("student_leads");
    const lead = jsonLeads.find((row) => String(row.id) === id);
    if (!lead) continue;
    const updated = await applyLeadPatch(id, { assigned_telecaller_id: telecallerId, status: "assigned" });
    await syncOwnershipOnAssignment(lead, updated);
    count += 1;
  }
  await notify(
    telecallerId,
    "Leads assigned",
    `${count} lead(s) were assigned to you with full history.`,
    "info",
    "/telecaller",
  );
  res.json({ ok: true, count });
});

router.patch("/api/documents/:id", auth, async (req, res) => {
  const status = String(req.body.status || "").trim();
  const comments = req.body.comments == null ? undefined : String(req.body.comments);
  if (!["uploaded", "approved", "rejected", "pending"].includes(status)) {
    return res.status(400).json({ error: "Status must be approved or rejected." });
  }
  const now = new Date().toISOString();
  if (isUuid(req.params.id)) await pool.query("UPDATE documents SET status = $2 WHERE id = $1", [req.params.id, status]).catch(() => {});
  const docs = await jsonTable("documents");
  const found = docs.find((row) => String(row.id) === String(req.params.id));
  if (found) {
    await jsonUpsert("documents", {
      ...found,
      status,
      admin_comments: comments !== undefined ? comments : found.admin_comments,
      reviewed_by: req.user.id,
      reviewed_at: now,
      updated_at: now,
    });
    await notify(
      found.user_id,
      status === "approved" ? "Document approved" : "Document rejected",
      comments || (status === "approved"
        ? `${found.document_type} was approved.`
        : `${found.document_type} was rejected. Please upload a corrected file.`),
      status === "approved" ? "success" : "error",
      "/student/documents",
    );
  }
  res.json({ ok: true });
});

router.get("/api/documents/:id/file", auth, async (req, res) => {
  const docs = await jsonTable("documents");
  const found = docs.find((row) => String(row.id) === String(req.params.id));
  if (!found?.file_path) return res.status(404).json({ error: "File not found" });
  const file = await pool.query("SELECT data_url FROM app_storage WHERE path = $1", [found.file_path]);
  if (!file.rows[0]?.data_url) return res.status(404).json({ error: "File not found" });
  res.json({ fileName: found.file_name || "document", dataUrl: file.rows[0].data_url });
});

router.patch("/api/applications/:id", auth, async (req, res) => {
  const status = String(req.body.status || "").trim();
  const comments = req.body.comments == null ? "" : String(req.body.comments);
  if (!["counselor_approved", "returned", "offer", "rejected", "submitted", "pending_counselor"].includes(status)) {
    return res.status(400).json({ error: "Invalid application status." });
  }
  const apps = await jsonTable("applications");
  const found = apps.find((row) => String(row.id) === String(req.params.id));
  if (!found) return res.status(404).json({ error: "Application not found" });
  const now = new Date().toISOString();
  await jsonUpsert("applications", {
    ...found,
    status,
    counselor_comments: comments || found.counselor_comments,
    reviewed_at: now,
    updated_at: now,
  });
  await notify(
    found.user_id,
    status === "returned" ? "Application returned" : "Application updated",
    comments || `Your ${found.university_name} application is now ${status.replaceAll("_", " ")}.`,
    status === "returned" ? "warning" : "info",
    "/student/applications",
  );
  res.json({ ok: true });
});

router.patch("/api/leave/:id", auth, async (req, res) => {
  const status = String(req.body.status || "");
  if (!["approved", "rejected", "pending"].includes(status)) return res.status(400).json({ error: "Invalid leave status." });
  const comments = String(req.body.comments || "");
  const updated = await pool.query(
    "UPDATE counselor_leave_requests SET status = $2 WHERE id = $1 RETURNING *",
    [req.params.id, status],
  ).catch(() => ({ rows: [] }));
  const row = updated.rows[0];
  if (row?.counselor_id) {
    await notify(row.counselor_id, `Leave ${status}`, comments || `Your leave request was ${status}.`, status === "approved" ? "success" : "warning", "/counselor/leave");
  }
  res.json({ ok: true, row });
});

router.post("/api/salary", auth, async (req, res) => {
  const counselorId = String(req.body.counselorId || "");
  const month = String(req.body.month || "");
  const year = Number(req.body.year || new Date().getFullYear());
  const net = Number(req.body.netSalary || 0);
  const notes = String(req.body.notes || "");
  if (!counselorId || !month) return res.status(400).json({ error: "Counselor, month, and amount are required." });
  if (!isUuid(counselorId)) return res.status(400).json({ error: "This counselor record is not linked to HR tables yet." });
  const row = await pool.query(
    `INSERT INTO counselor_salary_records (counselor_id, month, year, net_salary, notes)
     VALUES ($1,$2,$3,$4,$5)
     ON CONFLICT (counselor_id, month, year) DO UPDATE SET net_salary = EXCLUDED.net_salary, notes = EXCLUDED.notes
     RETURNING *`,
    [counselorId, month, year, net, notes],
  );
  await notify(counselorId, "Salary posted", `${month} ${year}: ₹${net}`, "info", "/counselor/salary");
  res.json(row.rows[0]);
});

router.put("/api/users/:id/role", auth, async (req, res) => {
  const role = String(req.body.role || "");
  if (!["student", "telecaller", "counselor", "admin", "super_admin"].includes(role)) {
    return res.status(400).json({ error: "Invalid role." });
  }
  const roles = await jsonTable("user_roles");
  const existing = roles.find((row) => String(row.user_id) === String(req.params.id));
  await jsonUpsert("user_roles", { id: existing?.id || `role-${req.params.id}`, user_id: req.params.id, role });
  if (role === "counselor") {
    const counselors = await jsonTable("counselors");
    const found = counselors.find((row) => String(row.user_id) === String(req.params.id));
    await jsonUpsert("counselors", {
      id: found?.id || `counselor-${req.params.id}`,
      user_id: req.params.id,
      is_active: true,
      specializations: found?.specializations || ["Study Abroad"],
      created_at: found?.created_at || new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });
    await ensureCounselorLogin(req.params.id).catch(() => {});
  }
  res.json({ ok: true });
});

router.put("/api/users/:id/password", auth, async (req, res) => {
  const password = String(req.body.password || "");
  if (password.length < 6) return res.status(400).json({ error: "Password must be at least 6 characters." });
  const role = (await jsonTable("user_roles")).find((row) => String(row.user_id) === String(req.params.id))?.role;
  if (ADMIN_ROLES.includes(role) && String(req.params.id) !== String(req.user.id) && req.user.role !== "super_admin") {
    return res.status(403).json({ error: "Only a super admin can reset another admin's password." });
  }
  await pool.query("UPDATE auth_users SET password = $2 WHERE id = $1", [req.params.id, hashPassword(password)]);
  const counselor = await pool.query("SELECT id FROM counselor_users WHERE email = (SELECT email FROM auth_users WHERE id = $1)", [req.params.id]).catch(() => ({ rows: [] }));
  if (counselor.rows[0]) {
    await pool.query("UPDATE counselor_users SET password_hash = $2 WHERE id = $1", [counselor.rows[0].id, await bcrypt.hash(password, 10)]);
  } else if (role === "counselor") {
    await ensureCounselorLogin(req.params.id, password).catch(() => {});
  }
  res.json({ ok: true });
});

router.post("/api/users", auth, async (req, res) => {
  const email = String(req.body.email || "").trim().toLowerCase();
  const password = String(req.body.password || "changeme123");
  const firstName = String(req.body.firstName || "").trim();
  const lastName = String(req.body.lastName || "").trim();
  const role = String(req.body.role || "student");
  const phone = String(req.body.phone || "");
  if (!email || password.length < 6) return res.status(400).json({ error: "Email and a password of at least 6 characters are required." });
  if (!["student", "telecaller", "counselor", "admin", "super_admin"].includes(role)) return res.status(400).json({ error: "Invalid role." });
  const existing = await pool.query("SELECT id FROM auth_users WHERE lower(email) = $1", [email]);
  if (existing.rows[0]) return res.status(400).json({ error: "An account with this email already exists." });
  const id = role === "counselor" ? crypto.randomUUID() : `user-${crypto.randomUUID()}`;
  await pool.query(
    "INSERT INTO auth_users (id, email, password, user_metadata) VALUES ($1,$2,$3,$4::jsonb)",
    [id, email, hashPassword(password), JSON.stringify({ first_name: firstName, last_name: lastName })],
  );
  await jsonUpsert("user_roles", { id: `role-${id}`, user_id: id, role });
  await jsonUpsert("profiles", {
    id: `profile-${id}`,
    user_id: id,
    first_name: firstName,
    last_name: lastName,
    phone,
    country: req.body.country || "India",
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  });
  if (role === "counselor") {
    const hash = await bcrypt.hash(password, 10);
    const bio = String(req.body.bio || "").trim();
    const specializations = Array.isArray(req.body.specializations)
      ? req.body.specializations.map((item) => String(item).trim()).filter(Boolean)
      : String(req.body.specializations || "Study Abroad").split(",").map((item) => item.trim()).filter(Boolean);
    const created = await pool.query(
      `INSERT INTO counselor_users (id, email, password_hash, first_name, last_name, phone, bio, specializations)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8) ON CONFLICT (email) DO UPDATE SET
         password_hash = EXCLUDED.password_hash,
         first_name = EXCLUDED.first_name,
         last_name = EXCLUDED.last_name,
         phone = EXCLUDED.phone,
         bio = EXCLUDED.bio,
         specializations = EXCLUDED.specializations
       RETURNING *`,
      [isUuid(id) ? id : crypto.randomUUID(), email, hash, firstName, lastName, phone, bio, specializations],
    );
    await jsonUpsert("counselors", {
      id: `counselor-${id}`,
      user_id: id,
      is_active: true,
      specializations,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });
    res.json({ ok: true, id, counselorId: created.rows[0]?.id });
    return;
  }
  res.json({ ok: true, id });
});

router.post("/api/counselors/:id/transfer", auth, async (req, res) => {
  try {
    const targetCounselorId = String(req.body.targetCounselorId || "");
    if (!targetCounselorId) {
      return res.status(400).json({ error: "Choose a counselor to transfer students to." });
    }
    const count = await transferCounselorStudents(req.params.id, targetCounselorId);
    if (count > 0) {
      await notify(
        targetCounselorId,
        "Students transferred",
        `${count} student(s) were transferred to you with full conversation history.`,
        "info",
        "/counselor/students",
      );
    }
    res.json({ ok: true, count });
  } catch (error) {
    res.status(400).json({ error: error.message || "Could not transfer students." });
  }
});

router.post("/api/telecallers/:id/transfer", auth, async (req, res) => {
  try {
    const targetTelecallerId = String(req.body.targetTelecallerId || "");
    if (!targetTelecallerId) {
      return res.status(400).json({ error: "Choose a telecaller to transfer leads to." });
    }
    const count = await transferTelecallerLeads(req.params.id, targetTelecallerId);
    if (count > 0) {
      await notify(
        targetTelecallerId,
        "Leads transferred",
        `${count} open lead(s) were transferred to you with full chat history.`,
        "info",
        "/telecaller/leads",
      );
    }
    res.json({ ok: true, count });
  } catch (error) {
    res.status(400).json({ error: error.message || "Could not transfer leads." });
  }
});

router.post("/api/telecallers/:id/remove", auth, async (req, res) => {
  try {
    const users = await loadUsers();
    const telecaller = users.find((row) => row.id === req.params.id && row.role === "telecaller");
    if (!telecaller) return res.status(404).json({ error: "Telecaller not found." });

    const targetTelecallerId = req.body.targetTelecallerId ? String(req.body.targetTelecallerId) : "";
    const assigned = (await jsonTable("student_leads")).filter(
      (lead) => isOpenLeadRecord(lead) && leadOwnedByTelecaller(lead, telecaller.id),
    );

    if (assigned.length > 0 && !targetTelecallerId) {
      return res.status(400).json({
        error: `${assigned.length} open lead(s) still assigned. Pick a telecaller to transfer them to, then remove.`,
      });
    }

    let transferred = 0;
    if (targetTelecallerId && assigned.length > 0) {
      transferred = await transferTelecallerLeads(req.params.id, targetTelecallerId);
      if (transferred > 0) {
        await notify(
          targetTelecallerId,
          "Leads transferred",
          `${transferred} open lead(s) were transferred to you before the previous telecaller was removed.`,
          "info",
          "/telecaller/leads",
        );
      }
    }

    await deactivateTelecaller(req.params.id);
    res.json({ ok: true, transferred });
  } catch (error) {
    res.status(400).json({ error: error.message || "Could not remove telecaller." });
  }
});

router.post("/api/counselors/:id/remove", auth, async (req, res) => {
  try {
    const counselors = await loadCounselors();
    const counselor = counselors.find((row) => row.id === req.params.id || row.auth_user_id === req.params.id);
    if (!counselor) return res.status(404).json({ error: "Counselor not found." });

    const targetCounselorId = req.body.targetCounselorId ? String(req.body.targetCounselorId) : "";
    const assigned = (await jsonTable("student_leads")).filter(
      (lead) =>
        (lead.entity_type === "student" || lead.lead_status === "converted") &&
        leadOwnedByCounselor(lead, counselor),
    );

    if (assigned.length > 0 && !targetCounselorId) {
      return res.status(400).json({
        error: `${assigned.length} student(s) still assigned. Pick a counselor to transfer them to, then remove.`,
      });
    }

    let transferred = 0;
    if (targetCounselorId && assigned.length > 0) {
      transferred = await transferCounselorStudents(req.params.id, targetCounselorId);
      if (transferred > 0) {
        await notify(
          targetCounselorId,
          "Students transferred",
          `${transferred} student(s) were transferred to you before the previous counselor was removed.`,
          "info",
          "/counselor/students",
        );
      }
    }

    await deactivateCounselor(req.params.id);
    res.json({ ok: true, transferred });
  } catch (error) {
    res.status(400).json({ error: error.message || "Could not remove counselor." });
  }
});

router.get("/api/university-catalog/countries", auth, async (_req, res) => {
  try {
    res.json(await catalogCountries());
  } catch (error) {
    res.status(500).json({ error: error.message || "Could not load countries." });
  }
});

router.get("/api/university-catalog/universities", auth, async (req, res) => {
  try {
    const country = String(req.query.country || "").trim();
    if (!country) return res.status(400).json({ error: "Country is required." });
    res.json(await catalogUniversities(country));
  } catch (error) {
    res.status(500).json({ error: error.message || "Could not load universities." });
  }
});

router.get("/api/university-catalog/degrees", auth, async (req, res) => {
  try {
    const country = String(req.query.country || "").trim();
    const university = String(req.query.university || "").trim();
    if (!country || !university) {
      return res.status(400).json({ error: "Country and university are required." });
    }
    res.json(await catalogDegrees(country, university));
  } catch (error) {
    res.status(500).json({ error: error.message || "Could not load degree types." });
  }
});

router.get("/api/university-programs", auth, async (req, res) => {
  try {
    const result = await searchUniversityPrograms({
      q: req.query.q,
      country: req.query.country,
      university: req.query.university,
      degree: req.query.degree,
      course: req.query.course,
      limit: req.query.limit,
      offset: req.query.offset,
    });
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message || "Could not load university programs." });
  }
});

router.post("/api/universities/import-csv", auth, async (req, res) => {
  try {
    const csv = String(req.body.csv || "");
    const fileName = String(req.body.fileName || "upload.csv").trim();
    const replaceAll = req.body.replace === true;
    if (!csv.trim()) return res.status(400).json({ error: "CSV content is required." });

    const parsedRows = parseCatalogCsv(csv);
    const { universities, programs } = buildCatalogRecords(parsedRows, fileName);
    const countries = [...new Set(parsedRows.map((row) => row.country).filter(Boolean))];

    if (replaceAll) {
      await jsonClearTable("university_programs");
      await jsonClearTable("universities");
    } else {
      await jsonClearCatalogCountries(countries);
    }

    await jsonBulkUpsert("universities", universities);
    await jsonBulkUpsert("university_programs", programs);

    res.json({
      ok: true,
      fileName,
      replace: replaceAll,
      countries,
      universities: universities.length,
      programs: programs.length,
    });
  } catch (error) {
    res.status(400).json({ error: error.message || "Could not import CSV." });
  }
});

router.delete("/api/universities/catalog", auth, async (req, res) => {
  try {
    await jsonClearTable("university_programs");
    await jsonClearTable("universities");
    res.json({ ok: true });
  } catch (error) {
    res.status(500).json({ error: error.message || "Could not clear university catalog." });
  }
});

router.patch("/api/universities/:id", auth, async (req, res) => {
  const rows = await jsonTable("universities");
  const found = rows.find((row) => String(row.id) === String(req.params.id));
  if (!found) return res.status(404).json({ error: "University not found" });
  const next = { ...found, ...req.body, id: found.id, updated_at: new Date().toISOString() };
  await jsonUpsert("universities", next);
  res.json(next);
});

router.delete("/api/universities/:id", auth, async (req, res) => {
  await jsonDelete(req.params.id);
  res.json({ ok: true });
});

router.post("/api/checklists", auth, async (req, res) => {
  const payload = {
    id: req.body.id || `dc-${crypto.randomUUID()}`,
    document_type: String(req.body.document_type || "").trim(),
    description: String(req.body.description || ""),
    is_required: req.body.is_required !== false,
    is_active: req.body.is_active !== false,
    max_file_size_mb: Number(req.body.max_file_size_mb || 20),
    allowed_file_types: Array.isArray(req.body.allowed_file_types)
      ? req.body.allowed_file_types
      : String(req.body.allowed_file_types || "pdf").split(",").map((item) => item.trim()).filter(Boolean),
    country: req.body.country || "All",
    countries: req.body.countries || ["All"],
    degree_type: req.body.degree_type || "All",
    degree_types: req.body.degree_types || ["All"],
    display_order: Number(req.body.display_order || 99),
  };
  if (!payload.document_type) return res.status(400).json({ error: "Document type is required." });
  await jsonUpsert("document_checklists", payload);
  res.json(payload);
});

router.patch("/api/checklists/:id", auth, async (req, res) => {
  const rows = await jsonTable("document_checklists");
  const found = rows.find((row) => String(row.id) === String(req.params.id));
  if (!found) return res.status(404).json({ error: "Checklist item not found" });
  await jsonUpsert("document_checklists", { ...found, ...req.body, id: found.id });
  res.json({ ok: true });
});

router.post("/api/notifications", auth, async (req, res) => {
  const userId = String(req.body.userId || "");
  const title = String(req.body.title || "").trim();
  const message = String(req.body.message || "").trim();
  if (!userId || !title) return res.status(400).json({ error: "Recipient and title are required." });
  await notify(userId, title, message, req.body.type || "info", req.body.actionUrl || "");
  res.json({ ok: true });
});

router.post("/api/notifications/broadcast", auth, async (req, res) => {
  const title = String(req.body.title || "").trim();
  const message = String(req.body.message || "").trim();
  const audience = String(req.body.audience || "students");
  if (!title) return res.status(400).json({ error: "Title is required." });
  const users = await loadUsers();
  const targets = users.filter((user) => {
    if (audience === "all") return true;
    if (audience === "students") return user.role === "student";
    if (audience === "counselors") return user.role === "counselor";
    return false;
  });
  for (const user of targets) {
    await notify(user.id, title, message, "info");
  }
  const counselors = await loadCounselors();
  if (audience === "counselors" || audience === "all") {
    for (const counselor of counselors) {
      if (isUuid(counselor.id) && !targets.some((user) => user.id === counselor.id || user.email === counselor.email)) {
        await notify(counselor.id, title, message, "info");
      }
    }
  }
  res.json({ ok: true, count: targets.length });
});

// ---------------------------------------------------------------------------
// WhatsApp — OTP verification (student portal) + staff inbox
// ---------------------------------------------------------------------------

router.post("/api/whatsapp/send-otp", studentAuth, async (req, res) => {
  try {
    const result = await whatsapp.sendOtp({
      userId: req.user.id,
      phone: req.body.phone,
    });
    res.json(result);
  } catch (error) {
    res.status(error.status || 500).json({ error: error.message || "Could not send verification code" });
  }
});

router.post("/api/whatsapp/verify-otp", studentAuth, async (req, res) => {
  try {
    const result = await whatsapp.verifyOtp({
      userId: req.user.id,
      phone: req.body.phone,
      code: req.body.code,
    });
    res.json(result);
  } catch (error) {
    res.status(error.status || 500).json({ error: error.message || "Could not verify code" });
  }
});

router.get("/api/whatsapp/verification-status", studentAuth, async (req, res) => {
  try {
    res.json(await whatsapp.getVerificationStatus(req.user.id));
  } catch (error) {
    res.status(500).json({ error: error.message || "Could not load verification status" });
  }
});

router.get("/api/whatsapp/conversations", staffChatAuth, async (req, res) => {
  try {
    const counselors = await loadCounselors();
    const leads = await jsonTable("student_leads");
    const conversations = await whatsapp.filterConversationsForStaff(req.user, counselors, leads);
    res.json(conversations.sort((a, b) => String(b.last_message_at || "").localeCompare(String(a.last_message_at || ""))));
  } catch (error) {
    res.status(500).json({ error: error.message || "Could not load WhatsApp conversations" });
  }
});

router.get("/api/whatsapp/conversations/:id/messages", staffChatAuth, async (req, res) => {
  try {
    const counselors = await loadCounselors();
    const leads = await jsonTable("student_leads");
    const conversations = await jsonTable("whatsapp_conversations");
    const conversation = conversations.find((row) => String(row.id) === String(req.params.id));
    if (!conversation) return res.status(404).json({ error: "Conversation not found." });
    if (!whatsapp.staffCanViewConversation(conversation, req.user, counselors, leads)) {
      return res.status(403).json({ error: "You cannot view this conversation." });
    }
    const messages = (await jsonTable("whatsapp_messages"))
      .filter((row) => String(row.conversation_id) === String(req.params.id))
      .sort((a, b) => String(a.created_at).localeCompare(String(b.created_at)));
    res.json(messages);
  } catch (error) {
    res.status(500).json({ error: error.message || "Could not load messages" });
  }
});

router.post("/api/whatsapp/messages", staffChatAuth, async (req, res) => {
  try {
    const conversationId = String(req.body.conversationId || "");
    const leadId = String(req.body.leadId || req.body.lead_id || "");
    const body = String(req.body.message || req.body.body || "").trim();
    if (!body) {
      return res.status(400).json({ error: "Message cannot be empty." });
    }

    const counselors = await loadCounselors();
    const leads = await jsonTable("student_leads");

    // First outbound often has a lead but no conversation yet. Create the thread and send.
    if (leadId && req.user.role === "telecaller") {
      const owned = await ownedLead(req.user.id, leadId);
      if (owned.error) return res.status(403).json({ error: owned.error });
      if (owned.lead.entity_type === "student" || owned.lead.lead_status === "converted") {
        return res.status(403).json({ error: "This chat has moved to the counselor." });
      }
      const result = await whatsapp.sendLeadMessage({
        lead: owned.lead,
        staffId: req.user.id,
        text: body,
      });
      return res.json(result.message);
    }

    if (leadId && req.user.role === "counselor") {
      const owned = await ownedCounselorLead(req.user.id, leadId);
      if (owned.error) return res.status(403).json({ error: owned.error });
      const result = await whatsapp.sendLeadMessage({
        lead: owned.lead,
        staffId: req.user.id,
        text: body,
      });
      return res.json(result.message);
    }

    if (!conversationId) {
      return res.status(400).json({ error: "Conversation and message are required." });
    }

    const conversations = await jsonTable("whatsapp_conversations");
    const conversation = conversations.find((row) => String(row.id) === conversationId);
    if (!conversation) return res.status(404).json({ error: "Conversation not found." });
    if (!whatsapp.staffCanReplyConversation(conversation, req.user, counselors, leads)) {
      const unassigned = !conversation.assigned_staff_id;
      return res.status(403).json({
        error: unassigned
          ? "No telecaller or counselor is assigned yet. Assign staff from the lead profile — admins monitor only."
          : "Only the assigned telecaller or counselor can reply on WhatsApp.",
      });
    }

    const lead =
      leads.find((row) => String(row.id) === String(conversation.lead_id)) ||
      (await whatsapp.findLeadByPhone(conversation.phone_number));
    if (lead) {
      const result = await whatsapp.sendLeadMessage({
        lead,
        staffId: req.user.id,
        text: body,
      });
      return res.json(result.message);
    }

    const waMessageId = await whatsapp.sendTextMessage(conversation.phone_number, body);
    const created = await whatsapp.storeOutboundMessage({
      conversationId,
      body,
      staffId: req.user.id,
      waMessageId,
    });
    res.json(created);
  } catch (error) {
    res.status(error.status || 500).json({ error: error.message || "Could not send WhatsApp message" });
  }
});

router.post("/api/whatsapp/conversations/:id/read", staffChatAuth, async (req, res) => {
  try {
    const counselors = await loadCounselors();
    const leads = await jsonTable("student_leads");
    const conversations = await jsonTable("whatsapp_conversations");
    const conversation = conversations.find((row) => String(row.id) === String(req.params.id));
    if (!conversation) return res.status(404).json({ error: "Conversation not found." });
    if (!whatsapp.staffCanViewConversation(conversation, req.user, counselors, leads)) {
      return res.status(403).json({ error: "You cannot update this conversation." });
    }

    const messages = await jsonTable("whatsapp_messages");
    const unread = messages.filter(
      (row) =>
        String(row.conversation_id) === String(req.params.id) &&
        row.direction === "inbound" &&
        !row.is_read,
    );
    for (const row of unread) {
      await jsonUpsert("whatsapp_messages", { ...row, is_read: true });
    }
    res.json({ ok: true, count: unread.length });
  } catch (error) {
    res.status(500).json({ error: error.message || "Could not mark messages read" });
  }
});

router.post("/api/whatsapp/sync-staff", auth, async (_req, res) => {
  try {
    const count = await whatsapp.syncAllConversationStaff();
    res.json({ ok: true, count });
  } catch (error) {
    res.status(500).json({ error: error.message || "Could not sync WhatsApp assignments" });
  }
});

// Meta WhatsApp Cloud API webhook — GET verifies the callback URL during setup.
router.get("/api/whatsapp/webhook", (req, res) => {
  const mode = String(req.query["hub.mode"] || "");
  const token = String(req.query["hub.verify_token"] || "");
  const challenge = String(req.query["hub.challenge"] || "");

  if (mode === "subscribe" && WHATSAPP_VERIFY_TOKEN && token === WHATSAPP_VERIFY_TOKEN) {
    return res.status(200).send(challenge);
  }

  if (!WHATSAPP_VERIFY_TOKEN) {
    return res.status(503).json({ error: "WHATSAPP_VERIFY_TOKEN is not configured on the server." });
  }

  return res.status(403).json({ error: "Webhook verification failed." });
});

// Meta sends message/status events here after subscription is active.
router.post("/api/whatsapp/webhook", async (req, res) => {
  try {
    const body = req.body || {};
    if (body.object !== "whatsapp_business_account") {
      return res.sendStatus(404);
    }

    for (const entry of body.entry || []) {
      for (const change of entry.changes || []) {
        const value = change.value || {};
        const contacts = value.contacts || [];
        for (const message of value.messages || []) {
          if (message.type !== "text") continue;
          const text = String(message.text?.body || "").trim();
          if (!text) continue;
          const contact = contacts.find((row) => String(row.wa_id || "") === String(message.from || ""));
          await whatsapp.storeInboundMessage({
            from: message.from,
            text,
            waMessageId: message.id,
            profileName: contact?.profile?.name || "",
          });
        }
      }
    }

    res.sendStatus(200);
  } catch (error) {
    console.error("WhatsApp webhook error:", error);
    res.sendStatus(500);
  }
});

// (API 404 + SPA fallback moved to server/index.mjs, after all routers mount)

// ---------------------------------------------------------------------------
// Unassigned lead watcher
//
// A student can sign up on the student portal and sit there with nobody to call
// them. Nothing in this system runs on a timer, so nobody finds out. This job
// checks every ALERT_INTERVAL_HOURS and tells the admins.
//
// The hard part is not the timer, it is not spamming. State is kept per lead in
// app_records so a lead is announced once, then repeated at most once every
// ALERT_REPEAT_HOURS while it stays unassigned, and forgotten the moment somebody
// picks it up.
// ---------------------------------------------------------------------------

const ALERT_INTERVAL_HOURS = Number(process.env.UNASSIGNED_ALERT_HOURS || 2);
const ALERT_REPEAT_HOURS = Number(process.env.UNASSIGNED_REPEAT_HOURS || 24);
const ALERT_GRACE_MINUTES = Number(process.env.UNASSIGNED_GRACE_MINUTES || 15);
const ALERT_TABLE = "lead_alerts";
// A lead that a telecaller has not spoken to within this many days goes cold on its own,
// so nothing sits warm forever because somebody forgot to update it.
const COLD_AFTER_DAYS = Number(process.env.LEAD_COLD_AFTER_DAYS || 2);
// Telecaller assignment is manual by default — an admin picks who gets each lead.
// Set TELECALLER_AUTO_ASSIGN=true to hand unowned leads to the least-loaded telecaller.
const TELECALLER_AUTO_ASSIGN = String(process.env.TELECALLER_AUTO_ASSIGN || "false") === "true";

const alertStatus = {
  enabled: ALERT_INTERVAL_HOURS > 0,
  intervalHours: ALERT_INTERVAL_HOURS,
  coldAfterDays: COLD_AFTER_DAYS,
  cooledCount: 0,
  autoAssign: TELECALLER_AUTO_ASSIGN,
  assignedCount: 0,
  lastRunAt: null,
  lastError: null,
  unassignedCount: 0,
  notifiedCount: 0,
};

function hoursBetween(a, b) {
  return Math.abs(new Date(a).getTime() - new Date(b).getTime()) / 3600000;
}

/** Skip duplicate reminders to the same person inside the repeat window. */
async function notifyOnce(userId, title, message, type = "info", actionUrl = "", repeatHours = ALERT_REPEAT_HOURS) {
  if (!userId) return;
  const notes = await jsonTable("notifications");
  const now = new Date().toISOString();
  const duplicate = notes.some(
    (row) =>
      String(row.user_id) === String(userId) &&
      row.title === title &&
      row.created_at &&
      hoursBetween(now, row.created_at) < repeatHours,
  );
  if (duplicate) return;
  await notify(userId, title, message, type, actionUrl);
}

/**
 * Any lead that has a telecaller but has gone quiet past COLD_AFTER_DAYS becomes cold.
 * The clock starts at the last logged call, or at assignment if there has never been one.
 * Converted students and leads already cold are left alone.
 */
/**
 * Hands every unowned open lead to the active telecaller with the fewest open leads.
 * Least-loaded rather than strict rotation, so somebody returning from leave is not
 * buried, and a new telecaller picks up work immediately.
 */
async function autoAssignTelecallers() {
  if (!TELECALLER_AUTO_ASSIGN) return 0;
  const users = await loadUsers();
  const telecallers = users.filter((row) => row.role === "telecaller" && row.is_active !== false);
  if (!telecallers.length) return 0;

  const leads = await jsonTable("student_leads");
  const open = leads.filter(
    (row) => row.entity_type !== "student" && row.lead_status !== "converted",
  );

  const load = new Map(telecallers.map((row) => [String(row.id), 0]));
  for (const lead of open) {
    const owner = String(lead.assigned_telecaller_id || "");
    if (load.has(owner)) load.set(owner, load.get(owner) + 1);
  }

  const waiting = open
    .filter((row) => !row.assigned_telecaller_id)
    .sort((a, b) => String(a.created_at || "").localeCompare(String(b.created_at || "")));

  let assigned = 0;
  for (const lead of waiting) {
    let target = null;
    let lowest = Infinity;
    for (const [id, count] of load) {
      if (count < lowest) {
        lowest = count;
        target = id;
      }
    }
    if (!target) break;

    const updated = await applyLeadPatch(lead.id, { assigned_telecaller_id: target, status: "assigned" });
    await whatsapp.syncConversationForLead(updated);
    load.set(target, lowest + 1);
    assigned += 1;

    const name = lead.first_name || lead.email || "A new lead";
    await notify(
      target,
      "New lead assigned",
      `${name} signed up and is waiting for your call.`,
      "info",
      "/queue",
    );
  }
  return assigned;
}

async function coolStaleLeads(startedAt) {
  if (COLD_AFTER_DAYS <= 0) return 0;
  const leads = await jsonTable("student_leads");
  const cutoffHours = COLD_AFTER_DAYS * 24;
  let cooled = 0;

  for (const lead of leads) {
    if (lead.entity_type === "student" || lead.lead_status === "converted") continue;
    if (!lead.assigned_telecaller_id) continue;          // the unassigned sweep owns those
    if (lead.lead_status === "cold") continue;
    const since = lead.last_contact_date || lead.created_at;
    if (!since) continue;
    if (hoursBetween(startedAt, since) < cutoffHours) continue;

    await applyLeadPatch(lead.id, {
      lead_status: "cold",
      lead_stage: "cold",
      cooled_at: startedAt,
      cooled_reason: `No contact logged for ${COLD_AFTER_DAYS} days.`,
    });
    const name = lead.first_name || lead.email || "A lead";
    await notify(
      lead.assigned_telecaller_id,
      "Lead went cold",
      `${name} has had no logged call for ${COLD_AFTER_DAYS} days and is now cold. Call them or hand it back.`,
      "warning",
      "/telecaller",
    );
    cooled += 1;
  }
  return cooled;
}

async function checkUnassignedLeads() {
  const startedAt = new Date().toISOString();
  try {
    alertStatus.assignedCount = TELECALLER_AUTO_ASSIGN
      ? await autoAssignTelecallers().catch((error) => {
          console.warn("[alerts] auto assign failed:", error.message);
          return 0;
        })
      : 0;
    const [leads, alerts, users] = await Promise.all([
      jsonTable("student_leads"),
      jsonTable(ALERT_TABLE),
      loadUsers(),
    ]);

    // Open leads only. A converted student is the counselor queue's problem, not this one.
    const open = leads.filter(
      (row) => row.entity_type !== "student" && row.lead_status !== "converted",
    );
    const unassigned = open.filter((row) => !row.assigned_telecaller_id && !row.assigned_counselor_id);
    const unassignedIds = new Set(unassigned.map((row) => String(row.id)));

    // Somebody picked these up. Forget them so they alert again if they are ever dropped.
    for (const alert of alerts) {
      if (!unassignedIds.has(String(alert.lead_id))) await jsonDelete(alert.id);
    }

    // A brand new signup deserves a few minutes before we shout about it.
    const ripe = unassigned.filter(
      (row) => !row.created_at || hoursBetween(startedAt, row.created_at) * 60 >= ALERT_GRACE_MINUTES,
    );

    const byLead = new Map(alerts.map((row) => [String(row.lead_id), row]));
    const due = ripe.filter((row) => {
      const alert = byLead.get(String(row.id));
      if (!alert) return true;
      return hoursBetween(startedAt, alert.last_alert_at) >= ALERT_REPEAT_HOURS;
    });

    alertStatus.unassignedCount = unassigned.length;
    alertStatus.notifiedCount = due.length;
    alertStatus.lastRunAt = startedAt;
    alertStatus.lastError = null;
    alertStatus.cooledCount = await coolStaleLeads(startedAt).catch((error) => {
      console.warn("[alerts] cold sweep failed:", error.message);
      return 0;
    });

    if (!due.length) return;

    for (const lead of due) {
      const existing = byLead.get(String(lead.id));
      await jsonUpsert(ALERT_TABLE, {
        id: existing?.id || `alert-${lead.id}`,
        lead_id: String(lead.id),
        first_alert_at: existing?.first_alert_at || startedAt,
        last_alert_at: startedAt,
        alert_count: (existing?.alert_count || 0) + 1,
      });
    }

    const oldest = ripe.reduce((worst, row) => {
      if (!row.created_at) return worst;
      if (!worst || row.created_at < worst) return row.created_at;
      return worst;
    }, null);
    const waitedHours = oldest ? Math.floor(hoursBetween(startedAt, oldest)) : 0;

    // One digest per admin, not one message per lead.
    const names = due
      .slice(0, 3)
      .map((row) => [row.first_name, row.last_name].filter(Boolean).join(" ") || row.email || "a new signup")
      .join(", ");
    const extra = due.length > 3 ? ` and ${due.length - 3} more` : "";
    const message =
      `${unassigned.length} lead${unassigned.length === 1 ? "" : "s"} have no telecaller or counselor. ` +
      `Waiting longest: ${waitedHours} hour${waitedHours === 1 ? "" : "s"}. New since the last check: ${names}${extra}.`;

    for (const admin of users.filter((row) => ADMIN_ROLES.includes(row.role))) {
      await notifyOnce(admin.id, "Leads waiting for assignment", message, "warning", "/admin/alerts");
    }
    console.log(`[alerts] ${due.length} unassigned lead(s) reported to admins`);
  } catch (error) {
    alertStatus.lastRunAt = startedAt;
    alertStatus.lastError = error.message || "Unassigned lead check failed";
    console.error("[alerts]", error);
  }
}

export function startUnassignedWatcher() {
  if (!alertStatus.enabled) {
    console.log("[alerts] unassigned lead watcher disabled (UNASSIGNED_ALERT_HOURS=0)");
    return;
  }
  // Run shortly after boot so a restart does not blind the team for two hours.
  setTimeout(() => void checkUnassignedLeads(), 30000);
  setInterval(() => void checkUnassignedLeads(), ALERT_INTERVAL_HOURS * 3600000);
  console.log(`[alerts] unassigned lead watcher every ${ALERT_INTERVAL_HOURS}h`);
}

export default router;
