// LOCAL PREVIEW ONLY. Delete this file and the marked block in src/main.tsx to remove it.
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
const STUDENT_ID = "preview-student-1";
const STUDENT_EMAIL = "asha.example@example.com";
const LEAD_ID = "preview-lead-1";
const COUNSELOR_ID = "preview-counselor";
const NOW = new Date().toISOString();
const daysAgo = (n: number) => new Date(Date.now() - n * 86_400_000).toISOString();

type Row = Record<string, any>;

const session = {
  access_token: "preview-token",
  expires_at: new Date(Date.now() + 7 * 86_400_000).toISOString(),
  user: {
    id: STUDENT_ID,
    email: STUDENT_EMAIL,
    user_metadata: { first_name: "Asha", last_name: "Example", full_name: "Asha Example" },
  },
};

const tables: Record<string, Row[]> = {
  profiles: [{
    id: "preview-profile-1", user_id: STUDENT_ID, first_name: "Asha", last_name: "Example", full_name: "Asha Example",
    phone: "+00 000 000 0001", country: "India", interested_countries: ["Canada", "Ireland"], degree_level: "Masters",
    course_preferences: "Computer Science", bachelors_degree: "B.Tech Computer Science", bachelors_score: "8.1 CGPA",
    whatsapp_number: null, whatsapp_verified: false, created_at: daysAgo(40), updated_at: NOW,
  }],
  user_roles: [{ id: "preview-role-1", user_id: STUDENT_ID, role: "student", created_at: daysAgo(40) }],
  student_leads: [{
    id: LEAD_ID, user_id: STUDENT_ID, first_name: "Asha", last_name: "Example", email: STUDENT_EMAIL, phone: "+00 000 000 0001",
    lead_status: "converted", lead_stage: "converted", entity_type: "student", preferred_countries: ["Canada", "Ireland"],
    field_of_interest: "Computer Science", qualification_level: "Masters", academic_score: "IELTS 7.0",
    assigned_counselor_id: COUNSELOR_ID, created_at: daysAgo(40), updated_at: NOW,
  }],
  counselors: [{
    id: COUNSELOR_ID, user_id: COUNSELOR_ID, first_name: "Preview", last_name: "Counselor", full_name: "Preview Counselor",
    email: "preview-counselor@example.com", is_active: true, is_verified: true, experience_years: 6, specializations: ["Canada", "Ireland"],
  }],
  document_checklists: [
    { id: "pv-dc-1", document_type: "Passport", description: "Valid for at least 12 months.", is_required: true, is_active: true, countries: ["All"], student_ids: [], allowed_file_types: ["pdf", "jpg", "png"], max_file_size_mb: 20 },
    { id: "pv-dc-2", document_type: "Academic transcripts", description: "Official transcripts from every institution.", is_required: true, is_active: true, countries: ["Canada"], student_ids: [], allowed_file_types: ["pdf"], max_file_size_mb: 20 },
    { id: "pv-dc-3", document_type: "English test score", description: "IELTS, TOEFL or PTE result.", is_required: true, is_active: true, countries: ["All"], student_ids: [STUDENT_ID, LEAD_ID], audience: "students", allowed_file_types: ["pdf", "jpg"], max_file_size_mb: 10 },
  ],
  documents: [
    { id: "pv-doc-1", user_id: STUDENT_ID, document_type: "Passport", file_name: "passport-preview.pdf", file_path: "preview/passport-preview.pdf", status: "approved", archived: false, is_current_version: true, version_number: 1, created_at: daysAgo(20), updated_at: daysAgo(18) },
    { id: "pv-doc-2", user_id: STUDENT_ID, document_type: "Academic transcripts", file_name: "transcripts-preview.pdf", file_path: "preview/transcripts-preview.pdf", status: "uploaded", archived: false, is_current_version: true, version_number: 1, created_at: daysAgo(3), updated_at: daysAgo(3) },
  ],
  notifications: [
    { id: "pv-n-1", user_id: STUDENT_ID, title: "Document approved", message: "Your Passport was approved.", type: "approval", is_read: false, action_url: "/student/documents", created_at: daysAgo(2) },
    { id: "pv-n-2", user_id: STUDENT_ID, title: "New document needed", message: "Please upload English test score.", type: "warning", is_read: false, action_url: "/student/documents", created_at: daysAgo(1) },
  ],
  universities: [
    { id: "pv-u-1", name: "Preview University of Examples", country: "Canada", city: "Toronto", is_active: true, is_tie_up: true, ranking: 120, university_type: "Public", created_at: daysAgo(90), updated_at: NOW },
    { id: "pv-u-2", name: "Sample Institute of Technology", country: "Ireland", city: "Dublin", is_active: true, is_tie_up: false, ranking: 240, university_type: "Public", created_at: daysAgo(90), updated_at: NOW },
  ],
  university_shortlists: [{
    id: "pv-sl-1", student_id: STUDENT_ID, counselor_id: COUNSELOR_ID, university_id: "pv-u-1", university_name: "Preview University of Examples",
    course_name: "MSc Computer Science", location: "Toronto, Canada", status: "recommended", tuition_fees: 24000, course_duration: "2 years",
    shortlisted_at: daysAgo(5), created_at: daysAgo(5), updated_at: daysAgo(5),
  }],
  applications: [],
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

function handleDb(url: URL, init?: RequestInit): Response {
  const method = (init?.method || "GET").toUpperCase();
  if (method === "GET") {
    const table = url.searchParams.get("table");
    if (table) return json({ rows: tables[table] || [] });
    return json(tables);
  }
  const body = JSON.parse(String(init?.body || "{}"));
  const rows = (tables[body.table] ||= []);
  const filters: Row[] = body.filters || [];
  const hit = (row: Row) => filters.every((f) => matches(row, f));
  if (body.action === "insert") {
    rows.push(...body.rows);
    return json({ data: body.rows, count: body.rows.length });
  }
  if (body.action === "upsert") {
    const key = body.upsertConflict || "id";
    for (const item of body.rows) {
      const index = rows.findIndex((row) => row[key] === item[key]);
      if (index >= 0) rows[index] = { ...rows[index], ...item };
      else rows.push(item);
    }
    return json({ data: body.rows, count: body.rows.length });
  }
  if (body.action === "update") {
    const changed = rows.filter(hit).map((row) => Object.assign(row, body.payload, { updated_at: new Date().toISOString() }));
    return json({ data: changed, count: changed.length });
  }
  if (body.action === "delete") {
    const doomed = rows.filter(hit);
    tables[body.table] = rows.filter((row) => !doomed.includes(row));
    return json({ data: doomed, count: doomed.length });
  }
  return json({ error: `Preview: unsupported database action "${body.action}".` }, 400);
}

const caseMessages = [
  { id: "pv-m-1", kind: "text", sender_role: "counselor", sender_id: COUNSELOR_ID, sender_name: "Preview Counselor", body: "Hi Asha — this is a fictional preview chat. Nothing here is real.", data: null, channel: "app", source: null, sources: [], review_status: null, reviewed_by_name: null, created_at: daysAgo(1) },
];

function handleApi(path: string, init?: RequestInit): Response {
  const method = (init?.method || "GET").toUpperCase();
  const body = (() => { try { return JSON.parse(String(init?.body || "{}")); } catch { return {}; } })();
  if (path === "/api/case/me" && method === "GET") {
    return json({ conversation_id: "pv-conv-1", owner: { role: "counselor", id: COUNSELOR_ID, name: "Preview Counselor" }, intake_complete: true, messages: caseMessages });
  }
  if (path === "/api/case/me/messages" && method === "POST") {
    caseMessages.push({ id: `pv-m-${Date.now()}`, kind: "text", sender_role: "student", sender_id: STUDENT_ID, sender_name: "Asha Example", body: String(body.message || ""), data: null, channel: "app", source: null, sources: [], review_status: null, reviewed_by_name: null, created_at: new Date().toISOString() });
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
  if (path === "/api/case/me/applications" && method === "POST") {
    const application = { id: `pv-app-${Date.now()}`, student_id: STUDENT_ID, status: "draft", created_at: NOW, updated_at: NOW, ...body };
    tables.applications.push(application);
    return json({ application }, 201);
  }
  if (path.startsWith("/api/case/me/applications/")) {
    const id = decodeURIComponent(path.split("/").pop() || "");
    const row = tables.applications.find((item) => item.id === id);
    if (row) Object.assign(row, body);
    return json({ application: row || { id, ...body } });
  }
  if (path === "/api/case/me/notifications") return json({ ok: true });
  if (path === "/api/case/me/shortlists" && method === "POST") return json({ ok: true, shortlist: { id: `pv-sl-${Date.now()}`, ...body } });
  if (/^\/api\/case\/me\/shortlists\/[^/]+\/decision$/.test(path)) return json({ ok: true, shortlist: { id: path.split("/")[5], ...body } });
  if (path === "/api/student/checklists") return json({ activated: false, reason: "Preview: no counselor checklist has been activated.", checklists: [] });
  if (path === "/api/case/inbox") return json({ conversations: [], messages: [], unread: 0 });
  if (path.startsWith("/api/whatsapp/")) return json({ conversations: [], messages: [], verified: false });
  return json({ error: `Preview mode: "${method} ${path}" is not available locally. Nothing was changed.` }, 404);
}

// ---------------------------------------------------------------- install
let installed = false;

export function installStudentPreview() {
  if (installed || !import.meta.env.DEV || import.meta.env.VITE_PREVIEW !== "true") return;
  installed = true;
  try {
    localStorage.setItem(SESSION_KEY, JSON.stringify(session));
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
        return method === "GET" ? json({ session }) : json({ ok: true, session });
      }
      if (path === "/__session") return json({ session });
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
  badge.textContent = "Local preview · fictional data · nothing is saved";
  badge.setAttribute("style", "position:fixed;left:50%;bottom:8px;transform:translateX(-50%);z-index:2147483647;background:#fef3c7;color:#92400e;border:1px solid #f59e0b;border-radius:9999px;padding:2px 12px;font:12px system-ui,sans-serif;pointer-events:none");
  document.body.appendChild(badge);
}
