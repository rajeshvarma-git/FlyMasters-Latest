// LOCAL PREVIEW ONLY. Delete this file, previewMode.ts and the marked block in src/main.tsx
// (and the isStudentPreview() lines in integrations/supabase/client.ts) to remove it.
//
// Runs the student portal without signing in and without a server. Active only when
// ALL of these hold:
//   - the Vite dev server is running (import.meta.env.DEV; false in every build)
//   - VITE_PREVIEW=true is set when starting the dev server
// While active, this answers the student portal's own requests (/__auth, /__local_db,
// /__storage, /api/case/..., /api/whatsapp/...) inside the browser from the fictional
// data below. Nothing is sent to the API, PostgreSQL or Railway. Changes live in
// memory only and are gone on reload. Anything it cannot answer fails with a clear
// "not available in preview" message instead of reaching a server.

const SESSION_KEY = "flymasters.student.session.v2";
const PICK_KEY = "flymasters.preview.student";
const COUNSELOR_ID = "preview-counselor";

// Two fictional students. Asha Example (the default) has history: documents, shortlists, applications and a counselor
// who has already enabled uploads for her. Nikhil Sampleton is a brand-new student: nothing uploaded, nothing
// shortlisted, no application, and the counselor has NOT enabled uploads or the country-wise common documents.
// Open the portal as him with  ?preview_student=fresh  (and back with  ?preview_student=asha).
const IDENTITIES = {
  asha: { key: "asha", studentId: "preview-student-1", leadId: "preview-lead-1", email: "asha.example@example.com", first: "Asha", last: "Example", label: "Asha Example" },
  fresh: { key: "fresh", studentId: "preview-student-fresh-0002", leadId: "preview-lead-fresh-0002", email: "nikhil.sampleton@example.com", first: "Nikhil", last: "Sampleton", label: "Nikhil Sampleton (new student)" },
} as const;

function chooseIdentity() {
  let wanted = "";
  try {
    const fromUrl = new URLSearchParams(window.location.search).get("preview_student");
    if (fromUrl) sessionStorage.setItem(PICK_KEY, fromUrl);
    wanted = fromUrl || sessionStorage.getItem(PICK_KEY) || "";
  } catch {
    // storage blocked: fall back to the default student
  }
  return wanted === "fresh" || wanted === "new" || wanted === "nikhil" ? IDENTITIES.fresh : IDENTITIES.asha;
}

const IDENTITY = chooseIdentity();
const STUDENT_ID = IDENTITY.studentId;
const STUDENT_EMAIL = IDENTITY.email;
const LEAD_ID = IDENTITY.leadId;
const ASHA_ID = IDENTITIES.asha.studentId;
const ASHA_LEAD_ID = IDENTITIES.asha.leadId;
const FRESH_ID = IDENTITIES.fresh.studentId;
const FRESH_LEAD_ID = IDENTITIES.fresh.leadId;
const NOW = new Date().toISOString();
const daysAgo = (n: number) => new Date(Date.now() - n * 86_400_000).toISOString();

type Row = Record<string, any>;

export const studentPreviewSession = {
  access_token: "preview-token",
  expires_at: new Date(Date.now() + 7 * 86_400_000).toISOString(),
  user: {
    id: STUDENT_ID,
    email: STUDENT_EMAIL,
    user_metadata: { first_name: IDENTITY.first, last_name: IDENTITY.last, full_name: `${IDENTITY.first} ${IDENTITY.last}` },
  },
};

const tables: Record<string, Row[]> = {
  profiles: [{
    id: "preview-profile-1", user_id: ASHA_ID, first_name: "Asha", last_name: "Example", full_name: "Asha Example",
    phone: "+00 000 000 0001", country: "India", interested_countries: ["Canada", "Ireland"], degree_level: "Masters",
    course_preferences: "Computer Science", bachelors_degree: "B.Tech Computer Science", bachelors_score: "8.1 CGPA",
    whatsapp_number: null, whatsapp_verified: false, created_at: daysAgo(40), updated_at: NOW,
  }, {
    id: "preview-profile-fresh", user_id: FRESH_ID, first_name: "Nikhil", last_name: "Sampleton", full_name: "Nikhil Sampleton",
    phone: "+00 000 000 0002", country: "India", interested_countries: ["Canada"], degree_level: "Masters",
    course_preferences: "Data Science", whatsapp_number: null, whatsapp_verified: false, created_at: daysAgo(1), updated_at: NOW,
  }],
  user_roles: [
    { id: "preview-role-1", user_id: ASHA_ID, role: "student", created_at: daysAgo(40) },
    { id: "preview-role-fresh", user_id: FRESH_ID, role: "student", created_at: daysAgo(1) },
  ],
  student_leads: [{
    id: ASHA_LEAD_ID, user_id: ASHA_ID, first_name: "Asha", last_name: "Example", email: IDENTITIES.asha.email, phone: "+00 000 000 0001",
    lead_status: "converted", lead_stage: "converted", entity_type: "student", preferred_countries: ["Canada", "Ireland"],
    field_of_interest: "Computer Science", qualification_level: "Masters", academic_score: "IELTS 7.0",
    assigned_counselor_id: COUNSELOR_ID, created_at: daysAgo(40), updated_at: NOW,
  }, {
    id: FRESH_LEAD_ID, user_id: FRESH_ID, first_name: "Nikhil", last_name: "Sampleton", email: IDENTITIES.fresh.email, phone: "+00 000 000 0002",
    student_code: "PV-FRESH-0002", lead_status: "converted", lead_stage: "converted", entity_type: "student", preferred_countries: ["Canada"],
    field_of_interest: "Data Science", qualification_level: "Masters",
    assigned_counselor_id: COUNSELOR_ID, created_at: daysAgo(1), updated_at: NOW,
  }],
  // The counselor enabled uploads for Asha long ago. Nikhil has no row here, i.e. nothing is enabled for him.
  student_document_upload_authorizations: [
    { id: "pv-auth-asha", student_id: ASHA_ID, lead_id: ASHA_LEAD_ID, enabled: true, scope: "all", document_types: [], authorized_by: COUNSELOR_ID, authorized_at: daysAgo(35), created_at: daysAgo(35), updated_at: daysAgo(35) },
  ],
  student_country_document_approvals: [],
  counselors: [{
    id: COUNSELOR_ID, user_id: COUNSELOR_ID, first_name: "Preview", last_name: "Counselor", full_name: "Preview Counselor",
    email: "preview-counselor@example.com", is_active: true, is_verified: true, experience_years: 6, specializations: ["Canada", "Ireland"],
  }],
  document_checklists: [
    { id: "pv-dc-1", document_type: "Passport", description: "Valid for at least 12 months.", is_required: true, is_active: true, countries: ["All"], student_ids: [], allowed_file_types: ["pdf", "jpg", "png"], max_file_size_mb: 20 },
    { id: "pv-dc-2", document_type: "Academic transcripts", description: "Official transcripts from every institution.", is_required: true, is_active: true, countries: ["Canada"], student_ids: [], allowed_file_types: ["pdf"], max_file_size_mb: 20 },
    { id: "pv-dc-3", document_type: "English test score", description: "IELTS, TOEFL or PTE result.", is_required: true, is_active: true, countries: ["All"], student_ids: [ASHA_ID, ASHA_LEAD_ID], audience: "students", allowed_file_types: ["pdf", "jpg"], max_file_size_mb: 10 },
  ],
  documents: [
    { id: "pv-doc-1", user_id: ASHA_ID, document_type: "Passport", file_name: "passport-preview.pdf", file_path: "preview/passport-preview.pdf", status: "approved", archived: false, is_current_version: true, version_number: 1, created_at: daysAgo(20), updated_at: daysAgo(18) },
    { id: "pv-doc-2", user_id: ASHA_ID, document_type: "Academic transcripts", file_name: "transcripts-preview.pdf", file_path: "preview/transcripts-preview.pdf", status: "uploaded", archived: false, is_current_version: true, version_number: 1, created_at: daysAgo(3), updated_at: daysAgo(3) },
  ],
  notifications: [
    { id: "pv-n-1", user_id: ASHA_ID, title: "Document approved", message: "Your Passport was approved.", type: "approval", is_read: false, action_url: "/student/documents", created_at: daysAgo(2) },
    { id: "pv-n-2", user_id: ASHA_ID, title: "New document needed", message: "Please upload English test score.", type: "warning", is_read: false, action_url: "/student/documents", created_at: daysAgo(1) },
  ],
  universities: [
    { id: "pv-u-1", name: "Preview University of Examples", country: "Canada", city: "Toronto", state_province: "Ontario", description: "A fictional research university used only in the local preview. Known for applied computing labs and a large co-op programme.", established_year: 1921, website_url: "https://example.com/preview-university", is_active: true, is_tie_up: true, ranking: 120, university_type: "Public", created_at: daysAgo(90), updated_at: NOW },
    { id: "pv-u-2", name: "Sample Institute of Technology", country: "Ireland", city: "Dublin", is_active: true, is_tie_up: false, ranking: 240, university_type: "Public", created_at: daysAgo(90), updated_at: NOW },
    { id: "pv-u-3", name: "Harbour Example University", country: "Ireland", city: "Cork", is_active: true, is_tie_up: false, ranking: 300, university_type: "Public", created_at: daysAgo(90), updated_at: NOW },
    { id: "pv-u-4", name: "Lakeside Sample College", country: "Canada", city: "Ottawa", is_active: true, is_tie_up: false, ranking: 410, university_type: "Public", created_at: daysAgo(90), updated_at: NOW },
    { id: "pv-u-5", name: "Riverside Example Institute", country: "Ireland", city: "Galway", is_active: true, is_tie_up: false, ranking: 500, university_type: "Public", created_at: daysAgo(90), updated_at: NOW },
  ],
  // Fictional catalogue programmes. A counselor's recommendation stores the id of one of these as its university_id.
  university_programs: [
    { id: "prog-pv-1", university_id: "pv-u-1", university_name: "Preview University of Examples", program_name: "MSc Computer Science", country: "Canada", degree: "Masters", course: "Computer Science", specialization: "Machine Learning", location: "Toronto, Ontario", city: "Toronto", region: "Ontario", duration: "2 years", fee: "CAD 24,000 per year", language: "English (IELTS 6.5)", program_description: "Thesis or project route with a paid co-op term.", eligibility: "Bachelor's degree in a related field, 70% or equivalent; IELTS 6.5.", career: "Software engineering, data science and research roles.", deadline: "15 Jan 2027", is_active: true },
    { id: "prog-pv-2", university_id: "pv-u-1", university_name: "Preview University of Examples", program_name: "MEng Data Engineering", country: "Canada", degree: "Masters", course: "Engineering", specialization: "Data Engineering", location: "Toronto, Ontario", city: "Toronto", region: "Ontario", duration: "16 months", fee: "CAD 21,500 per year", is_active: true },
  ],
  user_favorites: [{ id: "pv-fav-1", user_id: ASHA_ID, university_id: "pv-u-2", created_at: daysAgo(4) }],
  // Fictional shortlist rows covering every case: counselor recommendation still waiting for the student,
  // a recommendation that became an application, an application not yet sent to the university, and the student's own pick.
  university_shortlists: [
    {
      id: "pv-sl-1", student_id: ASHA_ID, counselor_id: COUNSELOR_ID, source_counselor_id: COUNSELOR_ID, university_id: "prog-pv-1", university_name: "Preview University of Examples",
      course_name: "MSc Computer Science", location: "Toronto, Canada", status: "recommended", priority_level: "high", tuition_fees: 24000, course_duration: "2 years",
      counselor_notes: "Strong fit for your profile and budget.", shortlisted_at: daysAgo(5), created_at: daysAgo(5), updated_at: daysAgo(5),
    },
    {
      id: "pv-sl-2", student_id: ASHA_ID, counselor_id: COUNSELOR_ID, source_counselor_id: COUNSELOR_ID, university_id: "pv-u-3", university_name: "Harbour Example University",
      course_name: "MSc Data Analytics", location: "Cork, Ireland", status: "applied", student_consent: true, student_decision: "accepted",
      application_id: "pv-app-1", application_status: "offer_received", shortlisted_at: daysAgo(30), created_at: daysAgo(30), updated_at: daysAgo(2),
    },
    {
      id: "pv-sl-3", student_id: ASHA_ID, counselor_id: COUNSELOR_ID, source_counselor_id: COUNSELOR_ID, university_id: "pv-u-4", university_name: "Lakeside Sample College",
      course_name: "MEng Software Engineering", location: "Ottawa, Canada", status: "applied", student_consent: true, student_decision: "accepted",
      application_id: "pv-app-2", application_status: "counselor_approved", shortlisted_at: daysAgo(12), created_at: daysAgo(12), updated_at: daysAgo(1),
    },
    {
      id: "pv-sl-4", student_id: ASHA_ID, counselor_id: "local-counselor-1", source: "student", university_id: "pv-u-5", university_name: "Riverside Example Institute",
      course_name: "MSc AI", location: "Galway, Ireland", status: "consented", student_consent: true, student_decision: "accepted",
      shortlisted_at: daysAgo(3), created_at: daysAgo(3), updated_at: daysAgo(3),
    },
  ],
  applications: [
    {
      id: "pv-app-1", user_id: ASHA_ID, counselor_id: COUNSELOR_ID, shortlist_id: "pv-sl-2", university_id: "pv-u-3", university_name: "Harbour Example University",
      course_name: "MSc Data Analytics", country: "Ireland", city: "Cork", intake_term: "Fall 2027", status: "offer_received", started_by: "counselor",
      counselor_comments: "Conditional offer - subject to final transcripts.", submitted_at: daysAgo(14), created_at: daysAgo(28), updated_at: daysAgo(2),
    },
    {
      id: "pv-app-2", user_id: ASHA_ID, counselor_id: COUNSELOR_ID, shortlist_id: "pv-sl-3", university_id: "pv-u-4", university_name: "Lakeside Sample College",
      course_name: "MEng Software Engineering", country: "Canada", city: "Ottawa", intake_term: "Spring 2027", status: "counselor_approved", started_by: "counselor",
      counselor_comments: "", created_at: daysAgo(10), updated_at: daysAgo(1),
    },
  ],
  application_status_updates: [
    { id: "pv-ev-1", application_id: "pv-app-1", student_id: ASHA_ID, event_type: "started", status: "in_progress", notes: "", updated_by_role: "counselor", updated_at: daysAgo(28), is_visible_to_student: true },
    { id: "pv-ev-2", application_id: "pv-app-1", student_id: ASHA_ID, event_type: "status", from_status: "in_progress", status: "counselor_approved", notes: "Documents checked.", updated_by_role: "counselor", updated_at: daysAgo(15), is_visible_to_student: true },
    { id: "pv-ev-3", application_id: "pv-app-1", student_id: ASHA_ID, event_type: "status", from_status: "counselor_approved", status: "submitted_to_university", notes: "", updated_by_role: "counselor", updated_at: daysAgo(14), is_visible_to_student: true },
    { id: "pv-ev-4", application_id: "pv-app-1", student_id: ASHA_ID, event_type: "status", from_status: "submitted_to_university", status: "offer_received", notes: "Conditional offer - subject to final transcripts.", updated_by_role: "counselor", updated_at: daysAgo(2), is_visible_to_student: true },
    { id: "pv-ev-5", application_id: "pv-app-2", student_id: ASHA_ID, event_type: "started", status: "in_progress", notes: "", updated_by_role: "counselor", updated_at: daysAgo(10), is_visible_to_student: true },
    { id: "pv-ev-6", application_id: "pv-app-2", student_id: ASHA_ID, event_type: "status", from_status: "in_progress", status: "counselor_approved", notes: "Approved internally - not sent yet.", updated_by_role: "counselor", updated_at: daysAgo(1), is_visible_to_student: true },
  ],
};

// ---------------------------------------------------------------- helpers
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

function matches(row: Row, spec: Row) {
  const value = row?.[spec.column];
  switch (spec.op) {
    case "eq": return value === spec.value || String(value) === String(spec.value);
    case "neq": return value !== spec.value;
    case "in": return Array.isArray(spec.value) && spec.value.includes(value);
    case "is": return value === spec.value;
    case "contains": return Array.isArray(value) && Array.isArray(spec.value) && spec.value.every((v: unknown) => value.includes(v));
    case "not": return spec.operator === "is" && spec.value === null ? value != null : value !== spec.value;
    case "or": return true;
    default: return true;
  }
}

// Mirrors the server's data policy: a student sees their own rows only, and a required document aimed at named
// students is visible to those students only. (Without this, the second fictional student would see Asha's data.)
const PREVIEW_OWNED = new Set([
  "profiles", "user_roles", "student_leads", "documents", "document_requests", "document_versions", "notifications",
  "user_favorites", "university_shortlists", "applications", "application_status_updates",
  "student_country_document_approvals", "student_document_upload_authorizations",
]);
const PREVIEW_KEYS = new Set<string>([STUDENT_ID, LEAD_ID]);

function ownedByViewer(row: Row) {
  for (const field of ["user_id", "student_id", "student_user_id"]) {
    if (row?.[field] != null && PREVIEW_KEYS.has(String(row[field]))) return true;
  }
  return Boolean(row?.email && String(row.email).toLowerCase() === STUDENT_EMAIL);
}

function visibleToViewer(table: string, rows: Row[]): Row[] {
  if (table === "document_checklists") {
    return rows.filter((row) => {
      const targets: string[] = Array.isArray(row.student_ids) ? row.student_ids.map(String) : [];
      if (targets.length) return targets.some((id) => PREVIEW_KEYS.has(id));
      return String(row.audience || "").toLowerCase() !== "students";
    });
  }
  return PREVIEW_OWNED.has(table) ? rows.filter(ownedByViewer) : rows;
}

function handleDb(url: URL, init?: RequestInit): Response {
  const method = (init?.method || "GET").toUpperCase();
  if (method === "GET") {
    const table = url.searchParams.get("table");
    if (table) return json({ rows: visibleToViewer(table, tables[table] || []) });
    return json(Object.fromEntries(Object.entries(tables).map(([name, rows]) => [name, visibleToViewer(name, rows)])));
  }
  try {
    return json(mutatePreview(JSON.parse(String(init?.body || "{}"))));
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : "Preview database error." }, 400);
  }
}

const caseMessages = [
  { id: "pv-m-1", kind: "text", sender_role: "counselor", sender_id: COUNSELOR_ID, sender_name: "Preview Counselor", body: `Hi ${IDENTITY.first} — this is a fictional preview chat. Nothing here is real.`, data: null, channel: "app", source: null, sources: [], review_status: null, reviewed_by_name: null, created_at: daysAgo(1) },
];

function handleApi(path: string, init?: RequestInit): Response {
  const method = (init?.method || "GET").toUpperCase();
  const body = (() => { try { return JSON.parse(String(init?.body || "{}")); } catch { return {}; } })();
  if (path === "/api/case/me" && method === "GET") {
    return json({ conversation_id: "pv-conv-1", owner: { role: "counselor", id: COUNSELOR_ID, name: "Preview Counselor" }, intake_complete: true, messages: caseMessages });
  }
  if (path === "/api/case/me/messages" && method === "POST") {
    caseMessages.push({ id: `pv-m-${Date.now()}`, kind: "text", sender_role: "student", sender_id: STUDENT_ID, sender_name: `${IDENTITY.first} ${IDENTITY.last}`, body: String(body.message || ""), data: null, channel: "app", source: null, sources: [], review_status: null, reviewed_by_name: null, created_at: new Date().toISOString() });
    return json({ owner: { role: "counselor", id: COUNSELOR_ID, name: "Preview Counselor" }, intake_complete: true, messages: caseMessages });
  }
  if (path === "/api/case/me/unread") return json({ unread: 0 });
  if (path === "/api/case/me/recommendations") {
    return json({
      known: { country: "Canada", qualification: "Masters", field: "Computer Science", score: "IELTS 7.0", budget: "" },
      missing: ["budget"], chat_started: true, intake_complete: true,
      universities: [{ id: "pv-u-1", name: "Preview University of Examples", location: "Toronto, Canada", programs: ["MSc Computer Science"], tuitionFee: "CAD 24,000 / year", duration: "2 years", deadline: "15 Jan", languageReq: "IELTS 6.5", postStudyVisa: "Up to 3 years", ranking: "#120", saved: false }],
    });
  }
  // Same rules as the server: students cannot start an application, and can only withdraw one that has not been sent on.
  if (path === "/api/case/me/applications" && method === "POST") {
    return json({ error: "Your counselor starts applications. Tick the university on My Shortlists and they will take it forward." }, 403);
  }
  if (path.startsWith("/api/case/me/applications/")) {
    const id = decodeURIComponent(path.split("/").pop() || "");
    const row = tables.applications.find((item) => item.id === id);
    if (body.status !== "withdrawn") return json({ error: "Students can only withdraw an application." }, 403);
    if (!row) return json({ error: "Application not found." }, 404);
    if (!["draft", "in_progress", "pending_counselor", "returned"].includes(row.status)) return json({ error: "This application can no longer be withdrawn." }, 409);
    const at = new Date().toISOString();
    Object.assign(row, { status: "withdrawn", updated_at: at });
    tables.application_status_updates.push({ id: `pv-ev-${Date.now()}`, application_id: id, student_id: STUDENT_ID, event_type: "status", from_status: "in_progress", status: "withdrawn", notes: "Withdrawn by the student.", updated_by_role: "student", updated_at: at, is_visible_to_student: true });
    return json({ ok: true, application: row });
  }
  if (path === "/api/case/me/notifications") return json({ ok: true });
  if (path === "/api/case/me/shortlists" && method === "POST") return json({ ok: true, shortlist: { id: `pv-sl-${Date.now()}`, ...body } });
  // Same rules as the server, applied to the in-memory rows so the preview behaves like the real thing (until reload).
  if (/^\/api\/case\/me\/shortlists\/[^/]+\/decision$/.test(path)) {
    const row = tables.university_shortlists.find((item) => item.id === path.split("/")[5] && ownedByViewer(item));
    if (!row) return json({ error: "That shortlist entry was not found." }, 404);
    if (row.status === "applied") return json({ error: "Your counsellor has already started this application." }, 409);
    const at = new Date().toISOString();
    const accepted = body.decision === "accept";
    Object.assign(row, {
      student_consent: accepted, student_consent_date: accepted ? at : null,
      student_decision: body.decision === "undo" ? null : accepted ? "accepted" : "declined",
      student_decision_at: body.decision === "undo" ? null : at,
      status: accepted ? "consented" : body.decision === "decline" ? "declined" : "recommended",
      application_start_requested_at: accepted ? row.application_start_requested_at || null : null, updated_at: at,
    });
    return json({ ok: true, shortlist: row });
  }
  if (/^\/api\/case\/me\/shortlists\/[^/]+\/request-application$/.test(path)) {
    const row = tables.university_shortlists.find((item) => item.id === path.split("/")[5] && ownedByViewer(item));
    if (!row) return json({ error: "That shortlist entry was not found." }, 404);
    if (row.status === "applied" || row.application_id) return json({ error: "Your counsellor has already started this application." }, 409);
    if (!row.student_consent) return json({ error: "Please give your consent for this university first. Your counselor can start the application once you have." }, 409);
    if (!row.application_start_requested_at) Object.assign(row, { application_start_requested_at: new Date().toISOString() });
    return json({ ok: true, shortlist: row });
  }
  if (path === "/api/case/me/shortlist-details" && method === "GET") {
    const lower = (value: unknown) => String(value || "").trim().toLowerCase();
    const details: Row = {};
    for (const row of tables.university_shortlists.filter(ownedByViewer)) {
      const program = tables.university_programs.find((item) => item.id === row.university_id) || null;
      const university = tables.universities.find((item) => item.id === (program?.university_id || row.university_id)) || tables.universities.find((item) => lower(item.name) === lower(row.university_name)) || null;
      details[row.id] = {
        matched_by: program ? "id" : university ? "university" : null,
        university,
        program,
        programs: tables.university_programs.filter((item) => university && item.university_id === university.id),
      };
    }
    return json({ details });
  }
  if (path === "/api/student/checklists") return json({ activated: false, reason: "Preview: no counselor checklist has been activated.", checklists: [] });
  if (path === "/api/case/inbox") return json({ conversations: [], messages: [], unread: 0 });
  if (path.startsWith("/api/whatsapp/")) return json({ conversations: [], messages: [], verified: false });
  return json({ error: `Preview mode: "${method} ${path}" is not available locally. Nothing was changed.` }, 404);
}

// ------------------------------------------------- contract used by integrations/supabase/client.ts
/** True only under the Vite dev server with VITE_PREVIEW=true (or VITE_STUDENT_PREVIEW=true). Always false in builds. */
export function isStudentPreview() {
  return import.meta.env.DEV && (import.meta.env.VITE_PREVIEW === "true" || import.meta.env.VITE_STUDENT_PREVIEW === "true");
}

export function previewRows(table: string): Row[] {
  return visibleToViewer(table, tables[table] || []);
}

/** Same shape the server returns for POST /__local_db, answered from the in-memory tables. */
export function mutatePreview(body: Row): { data: Row[]; count: number } {
  const rows = (tables[body.table] ||= []);
  const filters: Row[] = body.filters || [];
  const hit = (row: Row) => filters.every((f) => matches(row, f));
  if (body.table === "documents" && ["insert", "upsert", "update", "delete"].includes(body.action)) {
    // Same rule the server applies: no upload, replace or delete until the counselor enables uploads.
    const enabled = tables.student_document_upload_authorizations.some((row) => ownedByViewer(row) && row.enabled === true);
    const requested = (tables.document_requests || []).some((row) => ownedByViewer(row));
    if (!enabled && !requested) throw new Error("Document uploads are not enabled yet. Your counselor must review your profile and enable them first.");
  }
  if (body.action === "insert") {
    rows.push(...body.rows);
    return { data: body.rows, count: body.rows.length };
  }
  if (body.action === "upsert") {
    const key = body.upsertConflict || "id";
    for (const item of body.rows) {
      const index = rows.findIndex((row) => row[key] === item[key]);
      if (index >= 0) rows[index] = { ...rows[index], ...item };
      else rows.push(item);
    }
    return { data: body.rows, count: body.rows.length };
  }
  if (body.action === "update") {
    const changed = rows.filter(hit).map((row) => Object.assign(row, body.payload, { updated_at: new Date().toISOString() }));
    return { data: changed, count: changed.length };
  }
  if (body.action === "delete") {
    const doomed = rows.filter(hit);
    tables[body.table] = rows.filter((row) => !doomed.includes(row));
    return { data: doomed, count: doomed.length };
  }
  throw new Error(`Preview: unsupported database action "${body.action}".`);
}

// ---------------------------------------------------------------- install
let installed = false;

export function installStudentPreview() {
  if (installed || !isStudentPreview()) return;
  installed = true;
  try {
    localStorage.setItem(SESSION_KEY, JSON.stringify(studentPreviewSession));
  } catch {
    // storage blocked: the /__auth answer below still returns the session
  }

  const realFetch = window.fetch.bind(window);
  window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const raw = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    const url = new URL(raw, window.location.origin);
    if (url.origin === window.location.origin) {
      const path = url.pathname;
      if (path === "/__auth") {
        const method = (init?.method || "GET").toUpperCase();
        return method === "GET" ? json({ session: studentPreviewSession }) : json({ ok: true, session: studentPreviewSession });
      }
      if (path === "/__session") return json({ session: studentPreviewSession });
      if (path === "/__local_db") return handleDb(url, init);
      if (path === "/__storage") return json(url.searchParams.get("action") === "list" ? { files: [], items: [] } : { ok: true, url: "" });
      if (path === "/__public_media" || path === "/__db_health") return json({ ok: true, files: [] });
      if (path.startsWith("/api/case/") || path.startsWith("/api/student/") || path.startsWith("/api/whatsapp/") || path.startsWith("/api/referral/") || path === "/api/auth/signin") {
        return handleApi(path, init);
      }
    }
    return realFetch(input, init);
  };

  const badge = document.createElement("div");
  badge.textContent = `Local preview · fictional data · nothing is saved · viewing as ${IDENTITY.label}`;
  badge.setAttribute("style", "position:fixed;left:50%;bottom:8px;transform:translateX(-50%);z-index:2147483647;background:#fef3c7;color:#92400e;border:1px solid #f59e0b;border-radius:9999px;padding:2px 12px;font:12px system-ui,sans-serif;pointer-events:none");
  document.body.appendChild(badge);
}
