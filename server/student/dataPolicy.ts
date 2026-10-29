/**
 * Who may read and write what through the student portal's generic data API
 * (/__local_db and /__storage in httpApi.ts).
 *
 * That API was built as a stand-in for Supabase with no checks at all: any
 * visitor could list every table (every student's profile, leads, chats,
 * documents), change any row, overwrite the whole database, or download any
 * uploaded file. These rules close that, without changing the portal's
 * screens:
 *
 *  - Public site content (universities, website text, travel packages, …) is
 *    readable by anyone. A few contact forms accept inserts from anyone.
 *  - A signed-in student sees and changes only their own rows: a row is
 *    theirs when one of its owner columns holds their user id (or one of
 *    their lead ids), or its email column holds their email.
 *  - Admins and super admins keep full access (the student app still hosts
 *    some admin screens).
 *  - Everything else is refused.
 */
import { getPool } from "./postgres";
import { getSessionByToken, readBearerToken } from "./studentAuth";
import { commonCountryDocumentsFor, countryDocumentsEnabled, canStudentUseCountryDocument } from "../lib/countryDocumentApproval.mjs";
import { canStudentUploadAnything, canStudentUploadDocument } from "../lib/documentUploadAuthorization.mjs";
import { staffOnlyTypesForStudent, typeKey } from "../lib/staffOnlyDocuments.mjs";

export type Viewer = {
  userId: string;
  email: string;
  role: string;
  admin: boolean;
  /** user id plus the ids of their own student_leads rows */
  keys: Set<string>;
};

const ADMIN_ROLES = new Set(["admin", "super_admin"]);

/** Website and catalogue content: anyone may read. */
const PUBLIC_READ = new Set([
  "website_content", "website_media", "travel_packages", "travel_services", "travel_offers", "travel_news",
  "universities", "courses", "country_courses", "countries", "country_content", "country_highlights",
  "country_industries", "country_testimonials", "testimonials", "video_testimonials", "youtube_videos",
  "student_gallery", "founders", "service_offerings", "test_prep_schedules", "chat_questions",
  "document_checklists", "document_countries", "document_degree_types", "travel_document_requirements",
  "package_reviews", "package_inventory", "package_faqs", "package_availability", "counselors",
  "system_settings", "system_notifications",
]);

/** Only these system_settings keys are public. */
const PUBLIC_SETTINGS = new Set(["registration_enabled", "analytics_config"]);

/** Contact / enquiry forms: anyone may insert (not read). */
const PUBLIC_INSERT = new Set(["newsletter_subscriptions", "travel_inquiries"]);

/** A signed-in student may read and write their own rows in these. */
const OWNED = new Set([
  "profiles", "student_leads", "documents", "document_versions", "document_notifications", "document_requests",
  "document_audit_logs", "student_document_progress", "student_checklists", "applications",
  "student_country_document_approvals", "student_document_upload_authorizations",
  "application_status_updates", "user_favorites", "notifications", "chat_sessions", "chat_messages",
  "chat_conversations", "ai_chat_messages", "private_conversations", "private_messages",
  "telecaller_conversations", "telecaller_messages", "university_shortlists", "shortlist_notes",
  "package_bookings", "package_wishlists", "package_reviews", "travel_document_uploads", "user_roles",
]);

/**
 * Read-only for students even when the row is theirs.
 * Shortlists and applications: the student ticks or crosses a university
 * through /api/case/me/shortlists (which also tells the counsellor), and the
 * counsellor runs the application. Writing these rows directly would let a
 * student mark a shortlist "applied" or invent an application.
 * Document requests are the counsellor's too: a request is one of the things
 * that lets a student upload, so a student must not be able to write one.
 */
const READ_ONLY_OWNED = new Set(["user_roles", "university_shortlists_admin", "university_shortlists", "applications", "application_status_updates", "student_country_document_approvals", "student_document_upload_authorizations", "document_requests"]);

const OWNER_ID_FIELDS = ["user_id", "student_id", "student_user_id", "sender_id", "receiver_id"];
const OWNER_EMAIL_FIELDS = ["email", "student_email", "user_email"];

/** The canonical role: the SQL row, or "student" when the account has none. Legacy JSON never counts. */
export function viewerRole(rows: Array<{ role?: unknown }>): string {
  return String(rows[0]?.role || "") || "student";
}

export async function viewerFromRequest(req: { headers?: Record<string, any>; url?: string }): Promise<Viewer | null> {
  const session = await getSessionByToken(readBearerToken(req));
  if (!session?.user?.id) return null;
  const userId = String(session.user.id);
  const email = String(session.user.email || "").trim().toLowerCase();
  const pool = getPool();
  // The role comes from SQL only; a failed lookup propagates rather than guessing.
  const [sqlRole, leads] = await Promise.all([
    pool.query("SELECT role FROM user_roles WHERE user_id = $1", [userId]),
    pool.query(
      "SELECT id FROM app_records WHERE table_name = 'student_leads' AND (data->>'user_id' = $1 OR ($2 <> '' AND lower(data->>'email') = $2))",
      [userId, email],
    ).catch(() => ({ rows: [] as any[] })),
  ]);
  const role = viewerRole(sqlRole.rows);
  const admin = ADMIN_ROLES.has(role);
  const keys = new Set([userId, ...leads.rows.map((r) => String(r.id))]);
  return { userId, email, role, admin, keys };
}

export function ownsRow(viewer: Viewer, row: any) {
  if (!row || typeof row !== "object") return false;
  for (const field of OWNER_ID_FIELDS) {
    const value = row[field];
    if (value != null && value !== "" && viewer.keys.has(String(value))) return true;
  }
  if (viewer.email) {
    for (const field of OWNER_EMAIL_FIELDS) {
      if (String(row[field] || "").trim().toLowerCase() === viewer.email) return true;
    }
  }
  return false;
}

/** Staff names on profiles, so a student can see who their counselor is — nothing else. */
async function staffNameRows(rows: any[]) {
  const ids = rows.map((r) => String(r.user_id || "")).filter(Boolean);
  if (!ids.length) return [];
  const { rows: staff } = await getPool().query(
    `SELECT user_id FROM user_roles WHERE user_id = ANY($1::text[]) AND role <> 'student'`,
    [ids],
  ).catch(() => ({ rows: [] as any[] }));
  const staffIds = new Set(staff.map((s) => String(s.user_id)));
  return rows
    .filter((r) => staffIds.has(String(r.user_id)))
    .map((r) => ({ id: r.id, user_id: r.user_id, first_name: r.first_name, last_name: r.last_name, full_name: r.full_name, avatar_url: r.avatar_url }));
}

/** The rows of `table` this viewer may see, or null when the table is off limits. */
/**
 * Required-document rows: public catalogue content, except that a row aimed
 * at named students is only for them, a counsellor's "all my students" row
 * only for that counsellor's students, and a staff-only row for nobody here.
 */
async function documentChecklistRows(viewer: Viewer | null, rows: any[]) {
  const list = (value: any) => (Array.isArray(value) ? value : []).map((v) => String(v)).filter(Boolean);
  let counselorIds: Set<string> | null = null;
  const myCounselors = async () => {
    if (counselorIds) return counselorIds;
    counselorIds = new Set();
    if (viewer) {
      const { rows: leads } = await getPool().query(
        "SELECT data->>'assigned_counselor_id' AS c FROM app_records WHERE table_name = 'student_leads' AND id = ANY($1::text[])",
        [[...viewer.keys]],
      ).catch(() => ({ rows: [] as any[] }));
      leads.forEach((l) => { if (l.c) counselorIds!.add(String(l.c)); });
    }
    return counselorIds;
  };
  const out: any[] = [];
  const lead = viewer ? await studentLead(viewer) : null;
  const enabled = lead ? await countryDocumentsEnabled(lead) : false;
  for (const row of rows) {
    if (row?.staff_only) continue;
    if (lead && !enabled && commonCountryDocumentsFor(lead, [row]).length) continue;
    const targets = list(row?.student_ids);
    if (targets.length) {
      if (viewer && targets.some((id) => viewer.keys.has(id))) out.push(row);
      continue;
    }
    // Created for named students but none left: nobody sees it (never a whole country).
    if (String(row?.audience || "").toLowerCase() === "students") continue;
    const scope = list(row?.counselor_scope_ids);
    if (scope.length) {
      const mine = await myCounselors();
      if (scope.some((id) => mine.has(id))) out.push(row);
      continue;
    }
    out.push(row);
  }
  return out;
}

async function studentLead(viewer: Viewer) {
  let rows: any[] = [];
  try {
    rows = (await getPool().query(
      "SELECT id, data FROM app_records WHERE table_name = 'student_leads' AND (data->>'user_id' = $1 OR id = ANY($2::text[])) LIMIT 1",
      [viewer.userId, [...viewer.keys]],
    )).rows;
  } catch {
    // Unit tests intentionally run without PostgreSQL. Production always has
    // this store; without it no country-common requirement can be identified.
    rows = [];
  }
  const row = rows[0];
  return row ? { ...(row.data || {}), id: String(row.id) } : { id: viewer.userId, user_id: viewer.userId };
}

async function countryChecklistItems() {
  try {
    return (await getPool().query("SELECT data FROM app_records WHERE table_name = 'document_checklists'"))
      .rows.map((row) => row.data || {});
  } catch {
    return [];
  }
}

async function visibleCountryDocumentRows(viewer: Viewer, rows: any[]) {
  const lead = await studentLead(viewer);
  const items = await countryChecklistItems();
  if (!items.length) return rows;
  const allowed = await Promise.all(rows.map(async (row) =>
    !row?.document_type || await canStudentUseCountryDocument(lead, row.document_type, items),
  ));
  return rows.filter((_row, index) => allowed[index]);
}

/**
 * Tables whose rows carry a document type. A document that is staff-only for
 * this student ("Hidden from students") must not be readable, changeable or
 * attached to anything through any of them - not just hidden from the list.
 */
const DOCUMENT_TYPE_TABLES = new Set([
  "documents", "document_versions", "document_requests", "document_notifications",
  "document_audit_logs", "student_document_progress", "student_checklists",
]);

async function hiddenDocumentTypes(viewer: Viewer): Promise<Set<string>> {
  return staffOnlyTypesForStudent(await studentLead(viewer), [...viewer.keys]);
}

/** Ids of `documents` rows whose type is hidden from this viewer (versions point at them by document_id). */
async function hiddenDocumentIds(hidden: Set<string>): Promise<Set<string>> {
  if (!hidden.size) return new Set();
  const { rows } = await getPool().query(
    "SELECT id FROM app_records WHERE table_name = 'documents' AND lower(btrim(data->>'document_type')) = ANY($1::text[])",
    [[...hidden]],
  ).catch(() => ({ rows: [] as any[] }));
  return new Set(rows.map((r) => String(r.id)));
}

function isHiddenRow(row: any, hidden: Set<string>, hiddenIds: Set<string>) {
  if (!row) return false;
  if (row.document_type && hidden.has(typeKey(row.document_type))) return true;
  return Boolean(row.document_id && hiddenIds.has(String(row.document_id)));
}

async function withoutStaffOnlyDocuments(viewer: Viewer, rows: any[]) {
  const hidden = await hiddenDocumentTypes(viewer);
  if (!hidden.size) return rows;
  const hiddenIds = await hiddenDocumentIds(hidden);
  return rows.filter((row) => !isHiddenRow(row, hidden, hiddenIds));
}

/** Of these stored file paths, the ones that belong to a staff-only document for this viewer. */
async function staffOnlyFilePaths(viewer: Viewer, paths: string[]): Promise<Set<string>> {
  if (!paths.length) return new Set();
  const hidden = await hiddenDocumentTypes(viewer);
  if (!hidden.size) return new Set();
  const hiddenIds = await hiddenDocumentIds(hidden);
  const { rows } = await getPool().query(
    "SELECT data FROM app_records WHERE table_name IN ('documents','document_versions','travel_document_uploads') AND data->>'file_path' = ANY($1::text[])",
    [paths],
  ).catch(() => ({ rows: [] as any[] }));
  return new Set(rows.filter((r) => isHiddenRow(r.data, hidden, hiddenIds)).map((r) => String(r.data?.file_path)));
}

/** The student's file listing without the files of staff-only documents. */
export async function visibleStorageListing(viewer: Viewer | null, rows: any[]) {
  if (!viewer || viewer.admin) return rows;
  const blocked = await staffOnlyFilePaths(viewer, rows.map((r) => String(r.path)));
  return blocked.size ? rows.filter((r) => !blocked.has(String(r.path))) : rows;
}

export async function visibleRows(viewer: Viewer | null, table: string, rows: any[]): Promise<any[] | null> {
  if (viewer?.admin) return rows;
  if (table === "document_checklists") return documentChecklistRows(viewer, rows);
  if (table === "system_settings") return rows.filter((r) => PUBLIC_SETTINGS.has(String(r.key)));
  if (PUBLIC_READ.has(table) && !OWNED.has(table)) return rows;
  if (table === "package_reviews") return rows; // public reviews; writes still owner-checked
  if (!viewer) return PUBLIC_READ.has(table) ? rows : null;
  if (!OWNED.has(table)) return null;
  let mine = rows.filter((row) => ownsRow(viewer, row));
  if (DOCUMENT_TYPE_TABLES.has(table)) mine = await withoutStaffOnlyDocuments(viewer, mine);
  if (["documents", "document_requests", "document_versions"].includes(table)) {
    return visibleCountryDocumentRows(viewer, mine);
  }
  // Timeline entries a counselor marked staff-only never reach the student.
  if (table === "application_status_updates") return mine.filter((row) => row?.is_visible_to_student !== false);
  if (table === "profiles") {
    const others = await staffNameRows(rows.filter((row) => !ownsRow(viewer, row)));
    return [...mine, ...others];
  }
  return mine;
}

type Mutation = { action: string; table: string; rows?: any[]; payload?: any; filters?: any[] };

/**
 * Whether this viewer may apply `mutation`. `matching` is the set of
 * existing rows the mutation's filters select (for update/delete/upsert).
 * Returns an error message, or null when allowed.
 */
export async function checkMutation(viewer: Viewer | null, mutation: Mutation, matching: any[]): Promise<string | null> {
  const table = String(mutation.table || "");
  if (viewer?.admin) return null;
  if (mutation.action === "insert" && PUBLIC_INSERT.has(table)) return null;
  if (!viewer) return "Sign in required.";
  if (!OWNED.has(table) || READ_ONLY_OWNED.has(table)) return "Not allowed.";
  const fieldError = studentFieldError(mutation, matching);
  if (fieldError) return fieldError;
  // Nothing about a staff-only document can be written, replaced or removed
  // by the student - by id, by a relabelled type, or by pointing at its file.
  if (DOCUMENT_TYPE_TABLES.has(table) && ["insert", "upsert", "update", "delete"].includes(mutation.action)) {
    const hidden = await hiddenDocumentTypes(viewer);
    if (hidden.size) {
      const hiddenIds = await hiddenDocumentIds(hidden);
      const payload = mutation.payload || {};
      const incoming = mutation.action === "update" ? matching.map((m) => ({ ...m, ...payload }))
        : mutation.action === "delete" ? [] : mutation.rows || [];
      const touched = [...matching, ...incoming];
      if (touched.some((row) => isHiddenRow(row, hidden, hiddenIds))) return "This document type is not available.";
    }
  }
  if (table === "documents" && (mutation.action === "insert" || mutation.action === "upsert" || mutation.action === "update")) {
    const lead = await studentLead(viewer);
    const items = await countryChecklistItems();
    const incomingDocs = mutation.action === "update" ? matching.map((row) => ({ ...row, ...(mutation.payload || {}) })) : mutation.rows || [];
    for (const doc of incomingDocs) {
      if (doc?.document_type && !(await canStudentUseCountryDocument(lead, doc.document_type, items))) {
        return "Your country-wise common documents are not enabled yet. Please wait for your counselor's approval.";
      }
    }
  }

  // A student may not add, replace or remove a document until the counselor
  // has authorised uploads for that kind of document (see
  // lib/documentUploadAuthorization.mjs). Existing rows are judged by their
  // own type too, so a document cannot be re-labelled into an allowed type.
  if ((table === "documents" || table === "document_versions") && ["insert", "upsert", "update", "delete"].includes(mutation.action)) {
    const lead = await studentLead(viewer);
    const types = new Set<string>();
    for (const row of mutation.action === "update" ? matching.map((m) => ({ ...m, ...(mutation.payload || {}) })) : mutation.rows || []) {
      types.add(String(row?.document_type || ""));
    }
    for (const row of mutation.action === "update" || mutation.action === "delete" || mutation.action === "upsert" ? matching : []) {
      types.add(String(row?.document_type || ""));
    }
    for (const type of types) {
      const decision = await canStudentUploadDocument(lead, type, { extraIds: [...viewer.keys] });
      if (!decision.allowed) return decision.reason || "Document uploads are not enabled yet.";
    }
  }

  const rows = Array.isArray(mutation.rows) ? mutation.rows : [];
  const incoming = mutation.action === "update" ? [mutation.payload || {}] : rows;
  for (const row of incoming) {
    for (const field of OWNER_EMAIL_FIELDS) {
      if (row[field] && String(row[field]).trim().toLowerCase() !== viewer.email) return "You can only save your own identity.";
    }
    for (const field of OWNER_ID_FIELDS) {
      if (field === "receiver_id") continue;
      if (row[field] != null && row[field] !== "" && !viewer.keys.has(String(row[field]))) {
        return "You can only save your own records.";
      }
    }
    if (row.receiver_id && !viewer.keys.has(String(row.receiver_id)) && !(await areStaff([String(row.receiver_id)]))) {
      return "Messages may only be sent to staff.";
    }
    if (row.file_path && !(await canUseFile(viewer, String(row.file_path), "write"))) {
      return "You can only attach files from your own folder.";
    }
  }
  // A student's action may notify their staff (new upload, new message):
  // inserting a notification for a staff member is allowed, for another
  // student it is not.
  if (mutation.action === "insert" && NOTIFY_TABLES.has(table) && rows.length) {
    const targets = rows.map((r) => String(r.user_id || "")).filter((id) => !viewer.keys.has(id));
    if (!targets.length) return null;
    return (await areStaff(targets)) ? null : "You can only notify your own advisors.";
  }
  if (mutation.action === "insert" || mutation.action === "upsert") {
    if (!rows.length) return null;
    // New rows must name this student as their owner; an upsert may not
    // overwrite someone else's existing row.
    if (!rows.every((row) => ownsRow(viewer, row))) return "You can only save your own records.";
    if (matching.some((row) => !ownsRow(viewer, row))) return "You can only change your own records.";
    return null;
  }
  if (mutation.action === "update" || mutation.action === "delete") {
    if (matching.some((row) => !ownsRow(viewer, row))) return "You can only change your own records.";
    const payload = mutation.payload || {};
    // Re-pointing a row at someone else is not allowed either.
    for (const field of OWNER_ID_FIELDS) {
      if (field in payload && payload[field] != null && payload[field] !== "" && !viewer.keys.has(String(payload[field]))) {
        // A student may message staff: sender must be them, receiver may be anyone.
        if (field === "receiver_id") continue;
        return "You can only change your own records.";
      }
    }
    return null;
  }
  return "Not allowed.";
}

/** Ownership alone must not let a student allocate staff or approve a case. */
export function studentFieldError(mutation: Mutation, matching: any[]): string | null {
  const defaults: Record<string, Record<string, any>> = {
    student_leads: { assigned_counselor_id: null, assigned_telecaller_id: null, branch_id: null,
      entity_type: "lead", lead_status: "hot", lead_stage: "hot", status: "new", converted_at: null, converted_by: null, whatsapp_verified: false, whatsapp_verified_at: null },
    profiles: { role: "student", is_active: true, disabled: false, branch_id: null, whatsapp_verified: false, whatsapp_verified_at: null },
    documents: { reviewed_at: null, reviewed_by: null, admin_comments: null },
    applications: { reviewed_at: null, reviewed_by: null, counselor_id: null, submitted_at: null, application_number: null },
  };
  const protectedFields = defaults[mutation.table] || {};
  const incoming = mutation.action === "update" ? [mutation.payload || {}] : mutation.rows || [];
  if (mutation.action === "delete") {
    if (mutation.table === "student_leads") return "Case deletion is controlled by staff.";
    if (mutation.table === "applications" && matching.some((m) => !["draft", "in_progress", "withdrawn"].includes(m.status))) return "Reviewed applications cannot be deleted by students.";
    return null;
  }
  for (const row of incoming) {
    const existing = mutation.action === "update" ? matching : matching.filter((m) => String(m.id) === String(row.id));
    if (["profiles", "student_leads"].includes(mutation.table) && "whatsapp_number" in row
        && existing.some((m) => m.whatsapp_verified && m.whatsapp_number !== row.whatsapp_number)) {
      return "Verify a changed WhatsApp number using the verification flow.";
    }
    for (const [field, initial] of Object.entries(protectedFields)) {
      if (!(field in row)) continue;
      // Uploading a replacement resets review; it cannot grant approval.
      if (mutation.table === "documents" && row[field] == null && row.status === "uploaded" && row.file_path) continue;
      const allowed = existing.length ? existing.every((m) => JSON.stringify(m[field] ?? null) === JSON.stringify(row[field] ?? null))
        : JSON.stringify(row[field] ?? null) === JSON.stringify(initial);
      if (!allowed) return "This field is controlled by staff.";
    }
    if (mutation.table === "documents" && "status" in row && row.status !== "uploaded") {
      if (!existing.length || existing.some((m) => m.status !== row.status)) return "Document review is controlled by staff.";
    }
    if (mutation.table === "applications" && "status" in row && !["draft", "in_progress", "pending_counselor", "withdrawn"].includes(row.status)) {
      if (!existing.length || existing.some((m) => m.status !== row.status)) return "Application submission is controlled by staff.";
    }
  }
  return null;
}

const NOTIFY_TABLES = new Set(["notifications", "document_notifications"]);

async function areStaff(ids: string[]) {
  const unique = [...new Set(ids)];
  const { rows } = await getPool().query(
    `SELECT user_id FROM user_roles WHERE user_id = ANY($1::text[]) AND role <> 'student'
     UNION SELECT id::text FROM counselor_users WHERE id::text = ANY($1::text[])`,
    [unique],
  ).catch(() => ({ rows: [] as any[] }));
  const found = new Set(rows.map((r) => String(r.user_id)));
  return unique.every((id) => found.has(id));
}

/** Whether this viewer may read/write/delete the stored file at `path`. */
export async function canUseFile(viewer: Viewer | null, path: string, mode: "read" | "write"): Promise<boolean> {
  if (!path) return false;
  if (viewer?.admin) return true;
  if (!viewer) return false;
  // The file of a staff-only document is closed to the student: not to read,
  // overwrite or delete, wherever it is stored - including their own folder.
  if ((await staffOnlyFilePaths(viewer, [path])).has(path)) return false;
  // Students upload under "<their user id>/…" — but only once the counselor
  // has enabled uploads for them (an authorisation, or a request/document the
  // counselor aimed at them). Reading their own folder is unaffected.
  if (path.split("/")[0] === viewer.userId) {
    if (mode === "read") return true;
    return (await canStudentUploadAnything(await studentLead(viewer), [...viewer.keys])) === true;
  }
  if (mode === "write") return false;
  // Older files are matched through the document row that points at them.
  const { rows } = await getPool().query(
    "SELECT data FROM app_records WHERE table_name IN ('documents','document_versions','travel_document_uploads') AND data->>'file_path' = $1",
    [path],
  ).catch(() => ({ rows: [] as any[] }));
  const owned = rows.map((r) => r.data).filter((row) => ownsRow(viewer, row));
  if (!owned.length) return false;
  const lead = await studentLead(viewer);
  const items = await countryChecklistItems();
  return (await Promise.all(owned.map((row) =>
    !row?.document_type || canStudentUseCountryDocument(lead, row.document_type, items),
  ))).some(Boolean);
}

/** Rows of `table` matched by a mutation's filters (same matching the store uses). */
export async function rowsForFilters(table: string, filters: any[] | undefined, match: (row: any, filters: any[]) => boolean) {
  const { rows } = await getPool().query("SELECT id, data FROM app_records WHERE table_name = $1", [table]);
  const current = rows.map((r) => ({ ...(r.data || {}), id: r.id }));
  return filters?.length ? current.filter((row) => match(row, filters)) : current;
}
