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
  "application_status_updates", "user_favorites", "notifications", "chat_sessions", "chat_messages",
  "chat_conversations", "ai_chat_messages", "private_conversations", "private_messages",
  "telecaller_conversations", "telecaller_messages", "university_shortlists", "shortlist_notes",
  "package_bookings", "package_wishlists", "package_reviews", "travel_document_uploads", "user_roles",
]);

/** Read-only for students even when the row is theirs. */
const READ_ONLY_OWNED = new Set(["user_roles", "university_shortlists_admin"]);

const OWNER_ID_FIELDS = ["user_id", "student_id", "student_user_id", "sender_id", "receiver_id"];
const OWNER_EMAIL_FIELDS = ["email", "student_email", "user_email"];

export async function viewerFromRequest(req: { headers?: Record<string, any>; url?: string }): Promise<Viewer | null> {
  const session = await getSessionByToken(readBearerToken(req));
  if (!session?.user?.id) return null;
  const userId = String(session.user.id);
  const email = String(session.user.email || "").trim().toLowerCase();
  const pool = getPool();
  const [sqlRole, jsonRoles, leads] = await Promise.all([
    pool.query("SELECT role FROM user_roles WHERE user_id = $1", [userId]).catch(() => ({ rows: [] as any[] })),
    pool.query("SELECT data->>'role' AS role FROM app_records WHERE table_name = 'user_roles' AND data->>'user_id' = $1", [userId]).catch(() => ({ rows: [] as any[] })),
    pool.query(
      "SELECT id FROM app_records WHERE table_name = 'student_leads' AND (data->>'user_id' = $1 OR ($2 <> '' AND lower(data->>'email') = $2))",
      [userId, email],
    ).catch(() => ({ rows: [] as any[] })),
  ]);
  const roles = [...sqlRole.rows, ...jsonRoles.rows].map((r) => String(r.role || "")).filter(Boolean);
  const admin = roles.some((r) => ADMIN_ROLES.has(r));
  const role = admin ? roles.find((r) => ADMIN_ROLES.has(r))! : roles[0] || "student";
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
    `SELECT user_id FROM user_roles WHERE user_id = ANY($1::text[]) AND role <> 'student'
     UNION SELECT data->>'user_id' FROM app_records WHERE table_name = 'user_roles' AND data->>'user_id' = ANY($1::text[]) AND data->>'role' <> 'student'`,
    [ids],
  ).catch(() => ({ rows: [] as any[] }));
  const staffIds = new Set(staff.map((s) => String(s.user_id)));
  return rows
    .filter((r) => staffIds.has(String(r.user_id)))
    .map((r) => ({ id: r.id, user_id: r.user_id, first_name: r.first_name, last_name: r.last_name, full_name: r.full_name, avatar_url: r.avatar_url }));
}

/** The rows of `table` this viewer may see, or null when the table is off limits. */
export async function visibleRows(viewer: Viewer | null, table: string, rows: any[]): Promise<any[] | null> {
  if (viewer?.admin) return rows;
  if (table === "system_settings") return rows.filter((r) => PUBLIC_SETTINGS.has(String(r.key)));
  if (PUBLIC_READ.has(table) && !OWNED.has(table)) return rows;
  if (table === "package_reviews") return rows; // public reviews; writes still owner-checked
  if (!viewer) return PUBLIC_READ.has(table) ? rows : null;
  if (!OWNED.has(table)) return null;
  const mine = rows.filter((row) => ownsRow(viewer, row));
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
     UNION SELECT data->>'user_id' FROM app_records WHERE table_name = 'user_roles' AND data->>'user_id' = ANY($1::text[]) AND data->>'role' <> 'student'
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
  // Students upload under "<their user id>/…".
  if (path.split("/")[0] === viewer.userId) return true;
  if (mode === "write") return false;
  // Older files are matched through the document row that points at them.
  const { rows } = await getPool().query(
    "SELECT data FROM app_records WHERE table_name IN ('documents','document_versions','travel_document_uploads') AND data->>'file_path' = $1",
    [path],
  ).catch(() => ({ rows: [] as any[] }));
  return rows.some((r) => ownsRow(viewer, r.data));
}

/** Rows of `table` matched by a mutation's filters (same matching the store uses). */
export async function rowsForFilters(table: string, filters: any[] | undefined, match: (row: any, filters: any[]) => boolean) {
  const { rows } = await getPool().query("SELECT id, data FROM app_records WHERE table_name = $1", [table]);
  const current = rows.map((r) => ({ ...(r.data || {}), id: r.id }));
  return filters?.length ? current.filter((row) => match(row, filters)) : current;
}
