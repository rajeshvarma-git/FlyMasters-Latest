// LOCAL PREVIEW ONLY (staff portals). Delete this file, staffPreviewStub.tsx and the marked lines in
// src/main.tsx, src/App.tsx and vite.config.ts to remove it.
//
// Lets the Admin, Counselor and Telecaller portals be looked at without signing in. Active only when ALL hold:
//   - the Vite dev server is running (import.meta.env.DEV; false in every build)
//   - VITE_PREVIEW=true is set when starting the dev server
//   - the page is opened from localhost / 127.0.0.1 / ::1 (a LAN address or tunnel gets the normal sign-in)
//
// How it stays safe:
//   - No account, token or session is created. Nothing is stored in sessionStorage/localStorage, so a normal
//     sign-in is never touched and no token exists that a server could accept.
//   - While you are inside /admin or /telecaller, EVERY request to /api/... is answered here, in the browser,
//     from the fictional data below. Nothing is sent to the API, PostgreSQL or Railway, so no privileged route
//     is reachable and no server authorization is bypassed (the server is simply never asked).
//   - Reads without sample data answer a clear "no sample data in preview" error. Writes (create, update,
//     delete, sign-in, uploads) are refused with a clear "not saved" error: no action ever appears to succeed.
//   - The Counselor portal uses its own existing preview (counselor/lib/previewMode.ts), which also never
//     contacts the server.

import { isLocalHost } from "@shared/localHost";

export type PreviewRole = "admin" | "counselor" | "telecaller";

export function isStaffPreview() {
  return import.meta.env.DEV && import.meta.env.VITE_PREVIEW === "true" && isLocalHost();
}

const ROLE_HOME: Record<PreviewRole, string> = { admin: "/admin", counselor: "/counselor", telecaller: "/telecaller/queue" };
const ROLE_LABEL: Record<PreviewRole, string> = { admin: "Admin", counselor: "Counselor", telecaller: "Telecaller" };

export function previewRoleFromPath(pathname: string): PreviewRole | null {
  if (pathname === "/admin" || pathname.startsWith("/admin/")) return "admin";
  if (pathname === "/counselor" || pathname.startsWith("/counselor/")) return "counselor";
  if (pathname === "/telecaller" || pathname.startsWith("/telecaller/")) return "telecaller";
  return null;
}

// ---------------------------------------------------------------- fictional data
const ADMIN_ID = "preview-admin";
const TELECALLER_ID = "preview-telecaller";
const COUNSELOR_ID = "preview-counselor";
const COUNSELOR2_ID = "preview-counselor-2";
const NOW = new Date().toISOString();
const daysAgo = (n: number) => new Date(Date.now() - n * 86_400_000).toISOString();
const daysAhead = (n: number) => new Date(Date.now() + n * 86_400_000).toISOString();

type Row = Record<string, any>;

const users: Record<PreviewRole, Row> = {
  admin: { id: ADMIN_ID, email: "preview-admin@example.com", firstName: "Preview", lastName: "Admin", phone: "+00 000 000 0100", role: "admin" },
  counselor: { id: COUNSELOR_ID, email: "preview-counselor@example.com", firstName: "Preview", lastName: "Counselor", phone: "+00 000 000 0000", role: "counselor" },
  telecaller: { id: TELECALLER_ID, email: "preview-telecaller@example.com", firstName: "Preview", lastName: "Telecaller", phone: "+00 000 000 0200", role: "telecaller" },
};

function lead(n: number, first: string, last: string, over: Row = {}): Row {
  return {
    id: `preview-lead-${n}`, user_id: over.entity_type === "student" ? `preview-student-${n}` : undefined,
    first_name: first, last_name: last, email: `${first.toLowerCase()}.${last.toLowerCase()}@example.com`, phone: `+00 000 000 03${String(n).padStart(2, "0")}`,
    whatsapp_number: "", whatsapp_verified: false, field_of_interest: "Computer Science", academic_score: "IELTS 6.5", preferred_countries: ["Canada"],
    assigned_counselor_id: null, assigned_telecaller_id: TELECALLER_ID, entity_type: "lead", lead_status: "new", lead_stage: "new", lead_source: "website",
    priority: "medium", notes: "Fictional record for the local preview.", next_follow_up_date: null, last_contact_date: null, conversion_date: null,
    created_at: daysAgo(10 - n), ...over,
  };
}

const leads: Row[] = [
  lead(1, "Asha", "Example", { entity_type: "student", lead_status: "converted", lead_stage: "converted", assigned_counselor_id: COUNSELOR_ID, preferred_countries: ["Canada", "Ireland"], conversion_date: daysAgo(30), created_at: daysAgo(40) }),
  lead(2, "Ben", "Sample", { entity_type: "student", lead_status: "converted", lead_stage: "converted", assigned_counselor_id: COUNSELOR_ID, field_of_interest: "Business Analytics", preferred_countries: ["United Kingdom"], conversion_date: daysAgo(20), created_at: daysAgo(35) }),
  lead(3, "Chloe", "Demo", { entity_type: "student", lead_status: "converted", lead_stage: "converted", assigned_counselor_id: COUNSELOR2_ID, field_of_interest: "Nursing", preferred_countries: ["Australia"], conversion_date: daysAgo(12), created_at: daysAgo(25) }),
  lead(4, "Dev", "Placeholder", { entity_type: "student", lead_status: "converted", lead_stage: "converted", assigned_counselor_id: null, field_of_interest: "Data Science", conversion_date: daysAgo(2), created_at: daysAgo(14) }),
  lead(5, "Esha", "Mockwell", { lead_status: "contacted", lead_stage: "contacted", priority: "high", last_contact_date: daysAgo(1), next_follow_up_date: daysAhead(1), notes: "Asked for fee details." }),
  lead(6, "Farid", "Testman", { lead_status: "interested", lead_stage: "qualified", priority: "high", last_contact_date: daysAgo(2), next_follow_up_date: daysAhead(2), preferred_countries: ["Germany"] }),
  lead(7, "Gita", "Sampleton", { lead_status: "new", lead_stage: "new", created_at: daysAgo(1) }),
  lead(8, "Hari", "Fictional", { lead_status: "new", lead_stage: "new", assigned_telecaller_id: null, created_at: daysAgo(1) }),
  lead(9, "Ira", "Notreal", { lead_status: "contacted", lead_stage: "contacted", assigned_telecaller_id: null, last_contact_date: daysAgo(5) }),
];

const counselors: Row[] = [
  { id: COUNSELOR_ID, auth_user_id: COUNSELOR_ID, email: "preview-counselor@example.com", first_name: "Preview", last_name: "Counselor", phone: "+00 000 000 0000", bio: "Fictional counselor.", specializations: ["Canada", "Ireland"], is_active: true, role: "counselor", created_at: daysAgo(200) },
  { id: COUNSELOR2_ID, auth_user_id: COUNSELOR2_ID, email: "priya.sample@example.com", first_name: "Priya", last_name: "Sample", phone: "+00 000 000 0001", bio: "Fictional counselor.", specializations: ["Australia", "United Kingdom"], is_active: true, role: "counselor", created_at: daysAgo(150) },
];
const telecallers: Row[] = [
  { id: TELECALLER_ID, email: "preview-telecaller@example.com", first_name: "Preview", last_name: "Telecaller", phone: "+00 000 000 0200", is_active: true, created_at: daysAgo(120), role: "telecaller" },
  { id: "preview-telecaller-2", email: "tara.sample@example.com", first_name: "Tara", last_name: "Sample", phone: "+00 000 000 0201", is_active: true, created_at: daysAgo(90), role: "telecaller" },
];

const adminUsers: Row[] = [
  { id: ADMIN_ID, email: "preview-admin@example.com", first_name: "Preview", last_name: "Admin", phone: "+00 000 000 0100", country: "India", role: "admin", is_active: true, created_at: daysAgo(300) },
  ...counselors.map((c) => ({ id: c.id, email: c.email, first_name: c.first_name, last_name: c.last_name, phone: c.phone, country: "India", role: "counselor", is_active: true, created_at: c.created_at })),
  ...telecallers.map((t) => ({ id: t.id, email: t.email, first_name: t.first_name, last_name: t.last_name, phone: t.phone, country: "India", role: "telecaller", is_active: true, created_at: t.created_at })),
];

const universities: Row[] = [
  { id: "pv-u-1", name: "Preview University of Examples", country: "Canada", city: "Toronto", ranking: 120, is_active: true, is_tie_up: true, website_url: "https://example.com/preview-university" },
  { id: "pv-u-2", name: "Sample Institute of Technology", country: "Ireland", city: "Dublin", ranking: 240, is_active: true, is_tie_up: false, website_url: "" },
  { id: "pv-u-3", name: "Harbour Example University", country: "Ireland", city: "Cork", ranking: 300, is_active: true, is_tie_up: false, website_url: "" },
  { id: "pv-u-4", name: "Lakeside Sample College", country: "Canada", city: "Ottawa", ranking: 410, is_active: true, is_tie_up: false, website_url: "" },
];
const programs: Row[] = [
  { id: "prog-pv-1", university_id: "pv-u-1", university_name: "Preview University of Examples", program_name: "MSc Computer Science", country: "Canada", degree: "Masters", course: "Computer Science", specialization: "Machine Learning", location: "Toronto, Ontario", city: "Toronto", region: "Ontario", duration: "2 years", fee: "CAD 24,000 per year", language: "English", program_description: "Fictional programme.", eligibility: "Fictional eligibility.", career: "", deadline: "15 Jan 2027", is_active: true },
  { id: "prog-pv-2", university_id: "pv-u-3", university_name: "Harbour Example University", program_name: "MSc Data Analytics", country: "Ireland", degree: "Masters", course: "Data", specialization: "Analytics", location: "Cork", city: "Cork", region: "", duration: "1 year", fee: "EUR 18,500 per year", language: "English", program_description: "Fictional programme.", eligibility: "", career: "", deadline: "31 May 2027", is_active: true },
];

const branches: Row[] = [
  { id: "preview-branch-1", name: "Head Office (fictional)", code: "HQ", city: "Hyderabad", state: "Telangana", area: "Example Area", address: "1 Example Road", phone: "+00 000 000 0900", is_active: true, is_head_office: true, staff_count: 5, lead_count: 9 },
  { id: "preview-branch-2", name: "Sample Branch (fictional)", code: "SB", city: "Chennai", state: "Tamil Nadu", area: "Sample Area", address: "2 Sample Street", phone: "+00 000 000 0901", is_active: true, is_head_office: false, staff_count: 2, lead_count: 0 },
];

const notifications: Row[] = [
  { id: "pv-n-1", user_id: ADMIN_ID, title: "Document uploaded", message: "Asha Example uploaded Academic transcripts (fictional).", is_read: false, created_at: daysAgo(1) },
  { id: "pv-n-2", user_id: ADMIN_ID, title: "Unassigned student", message: "Dev Placeholder needs a counselor (fictional).", is_read: false, created_at: daysAgo(2) },
];

function adminState() {
  return {
    users: adminUsers, counselors, telecallers, leads,
    documents: [
      { id: "pv-doc-1", user_id: "preview-student-1", document_type: "Passport", file_name: "passport-preview.pdf", file_path: "preview/passport-preview.pdf", status: "approved", archived: false, admin_comments: "", reviewed_at: daysAgo(18), created_at: daysAgo(20) },
      { id: "pv-doc-2", user_id: "preview-student-1", document_type: "Academic transcripts", file_name: "transcripts-preview.pdf", file_path: "preview/transcripts-preview.pdf", status: "uploaded", archived: false, created_at: daysAgo(3) },
      { id: "pv-doc-3", user_id: "preview-student-2", document_type: "Passport", file_name: "passport-ben.pdf", file_path: "preview/passport-ben.pdf", status: "uploaded", archived: false, created_at: daysAgo(1) },
    ],
    applications: [
      { id: "pv-app-1", user_id: "preview-student-1", university_name: "Harbour Example University", course_name: "MSc Data Analytics", country: "Ireland", city: "Cork", intake_term: "Fall 2027", priority_level: "medium", status: "offer_received", notes: "", counselor_comments: "Conditional offer.", created_at: daysAgo(28), submitted_at: daysAgo(14), started_by: "counselor" },
      { id: "pv-app-2", user_id: "preview-student-2", university_name: "Lakeside Sample College", course_name: "MEng Software Engineering", country: "Canada", city: "Ottawa", intake_term: "Spring 2027", priority_level: "medium", status: "in_progress", notes: "", counselor_comments: "", created_at: daysAgo(10), submitted_at: null, started_by: "counselor" },
    ],
    applicationEvents: [],
    shortlists: [
      { id: "pv-sl-1", student_id: "preview-student-1", counselor_id: COUNSELOR_ID, university_name: "Preview University of Examples", course_name: "MSc Computer Science", location: "Toronto, Canada", counselor_notes: "Strong fit.", status: "recommended", created_at: daysAgo(5) },
      { id: "pv-sl-2", student_id: "preview-student-2", counselor_id: COUNSELOR_ID, university_name: "Lakeside Sample College", course_name: "MEng Software Engineering", location: "Ottawa, Canada", counselor_notes: "", status: "applied", created_at: daysAgo(12) },
    ],
    conversations: [], messages: [], telecallerConversations: [], telecallerMessages: [], whatsappConversations: [], whatsappMessages: [],
    leave: [{ id: "pv-leave-1", counselor_id: COUNSELOR_ID, leave_type: "Casual", start_date: daysAhead(7).slice(0, 10), end_date: daysAhead(8).slice(0, 10), reason: "Fictional leave request", total_days: 2, status: "pending", applied_on: daysAgo(1) }],
    attendance: [], salary: [], notifications, universities, universityProgramCount: programs.length,
    checklists: [
      { id: "pv-dc-1", document_type: "Passport", description: "Valid for at least 12 months.", is_required: true, is_active: true, max_file_size_mb: 20, allowed_file_types: ["pdf", "jpg"], display_order: 1 },
      { id: "pv-dc-2", document_type: "Academic transcripts", description: "Official transcripts.", is_required: true, is_active: true, max_file_size_mb: 20, allowed_file_types: ["pdf"], display_order: 2 },
    ],
    chatSessions: [], chatMessages: [],
  };
}

function telecallerState() {
  return {
    leads: leads.filter((item) => item.assigned_telecaller_id === TELECALLER_ID).map((item) => ({ ...item, assigned_counselor_id: undefined })),
    notifications: [{ id: "pv-tn-1", user_id: TELECALLER_ID, title: "Follow-up due", message: "Esha Mockwell is due a call today (fictional).", is_read: false, type: "reminder", created_at: daysAgo(0) }],
    counselors: counselors.map((c) => ({ id: c.id, first_name: c.first_name, last_name: c.last_name, specializations: c.specializations })),
    conversations: [], messages: [], whatsappConversations: [], whatsappMessages: [],
  };
}

// ---- university information shown in the admin editor (in-memory, read-only: saving is refused like every write)
const catalogue = [
  { name: "Preview University of Examples", country: "Canada", location: "Toronto, Canada", id: "pv-u-1", programs: 2 },
  { name: "Lakeside Sample College", country: "Canada", location: "Ottawa, Canada", id: "pv-u-4", programs: 1 },
  { name: "Harbour Example University", country: "Ireland", location: "Cork, Ireland", id: "pv-u-3", programs: 1 },
  { name: "Sample Institute of Technology", country: "Ireland", location: "Dublin, Ireland", id: "pv-u-2", programs: 1 },
];
const publishedInfo = {
  basic: { name: "Preview University of Examples", country: "Canada", city: "Toronto", campus_location: "100 Example Avenue (fictional)", overview: "FICTIONAL preview text shown in the admin editor." },
  branding: { logo: null, campus_images: [], gallery: [] },
  programs: [{ name: "MSc Computer Science", degree_level: "Masters", duration: "2 years", courses: "Machine Learning" }],
  fees: { tuition: "24,000", currency: "CAD", period: "year", other_costs: "" },
  admission: { academic: "Bachelor's degree, 70%.", english: "IELTS 6.5", other: "" },
  intakes: [{ period: "Fall 2027", deadline: "2027-01-15", notes: "" }],
  important_dates: [], links: { website: "https://example.com/preview-university", admissions_page: "", other: [] }, brochures: [],
};

// ---------------------------------------------------------------- the request answerer
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
const READ_ONLY = "Local preview: nothing was saved or sent. This screen is showing fictional data. Run the app without VITE_PREVIEW to try real actions.";

function answer(role: PreviewRole, rawPath: string, method: string): Response {
  const url = new URL(rawPath, window.location.origin);
  const path = url.pathname.replace(/^\/api/, "") || "/";

  // Writes are never performed. Sign-in is refused too: preview does not authenticate anyone.
  if (method !== "GET") return json({ error: READ_ONLY }, 403);

  if (path === "/me") return json({ user: users[role] });
  if (path === "/me/capabilities") return json({ developer: false });
  if (path === "/case/inbox") return json({ conversations: [], messages: [], unread: 0 });
  if (path.startsWith("/whatsapp") || path === "/telecaller/whatsapp") return json({ conversations: [], messages: [], verified: false });

  if (role === "admin") {
    if (path === "/state") return json(adminState());
    if (path === "/branches") return json({ branches });
    if (path === "/university-catalog/countries") return json([{ name: "Canada", university_count: 2, program_count: 3 }, { name: "Ireland", university_count: 2, program_count: 2 }]);
    if (path === "/university-catalog/universities") {
      const country = url.searchParams.get("country");
      return json(catalogue.filter((item) => item.country === country).map((item) => ({ name: item.name, university_id: item.id, location: item.location, program_count: item.programs })));
    }
    if (path === "/university-catalog/degrees") return json([{ name: "Masters", program_count: 3 }]);
    if (path === "/university-programs") return json({ rows: programs, total: programs.length, limit: 25, offset: 0 });
    if (path === "/admin/university-info/status") return json({ statuses: [{ university_id: "pv-u-1", status: "published", published_at: daysAgo(3) }, { university_id: "pv-u-3", status: "draft", published_at: null }] });
    const info = /^\/admin\/universities\/([^/]+)\/info$/.exec(path);
    if (info) {
      const base = catalogue.find((item) => item.id === info[1]);
      if (!base) return json({ error: "University not found." }, 404);
      const published = base.id === "pv-u-1";
      return json({
        university: { id: base.id, name: base.name, country: base.country, city: base.location.split(",")[0], website_url: "" },
        info: { draft: published ? publishedInfo : null, published: published ? publishedInfo : null, status: published ? "published" : "none", draft_updated_at: published ? daysAgo(3) : null, published_at: published ? daysAgo(3) : null },
      });
    }
    if (path === "/notifications") return json(notifications);
  }
  if (role === "telecaller" && path === "/telecaller/state") return json(telecallerState());

  return json({ error: `Local preview: there is no sample data for ${method} ${path}. Nothing was contacted.` }, 404);
}

// ---------------------------------------------------------------- install
let installed = false;

export function installStaffPreview() {
  if (installed || !isStaffPreview()) return;
  installed = true;
  const role = previewRoleFromPath(window.location.pathname);

  if (role === "admin" || role === "telecaller") {
    const realFetch = window.fetch.bind(window);
    window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
      const raw = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
      const url = new URL(raw, window.location.origin);
      // Every /api request from these portals stays in the browser. Nothing here reaches a server.
      if (url.origin === window.location.origin && url.pathname.startsWith("/api/")) {
        const method = (init?.method || (typeof input === "object" && "method" in input ? (input as Request).method : "GET") || "GET").toUpperCase();
        return answer(role, url.pathname + url.search, method);
      }
      return realFetch(input, init);
    };
  }

  const bar = document.createElement("div");
  bar.setAttribute("data-testid", "staff-preview-bar");
  bar.setAttribute("style", "position:fixed;left:50%;bottom:8px;transform:translateX(-50%);z-index:2147483647;display:flex;align-items:center;gap:8px;background:#fef3c7;color:#92400e;border:1px solid #f59e0b;border-radius:9999px;padding:3px 6px 3px 12px;font:12px system-ui,sans-serif;white-space:nowrap;box-shadow:0 1px 4px rgba(0,0,0,.2)");
  const label = document.createElement("strong");
  label.textContent = "LOCAL PREVIEW";
  const note = document.createElement("span");
  note.textContent = "fictional data · nothing is saved · view as:";
  bar.append(label, note);
  (Object.keys(ROLE_HOME) as PreviewRole[]).forEach((key) => {
    const link = document.createElement("a");
    link.href = ROLE_HOME[key];
    link.textContent = ROLE_LABEL[key];
    link.setAttribute("data-testid", `preview-role-${key}`);
    const active = key === role;
    link.setAttribute("style", `padding:2px 10px;border-radius:9999px;text-decoration:none;font-weight:${active ? 700 : 500};background:${active ? "#92400e" : "transparent"};color:${active ? "#fef3c7" : "#92400e"};border:1px solid #92400e`);
    bar.appendChild(link);
  });
  document.body.appendChild(bar);
}

// ---------------------------------------------------------------- the /staff page in preview
export function StaffPreviewPicker() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-navy-950 px-4 py-10" data-testid="staff-preview-picker">
      <div className="w-full max-w-md">
        <div className="mb-6 text-center">
          <h1 className="text-2xl font-bold text-white">Fly Masters</h1>
          <p className="mt-1 text-sm text-slate-400">Staff portals</p>
        </div>
        <div className="rounded-2xl bg-white p-6 shadow-xl">
          <p className="inline-block rounded-full bg-amber-100 px-3 py-1 text-xs font-bold tracking-wide text-amber-800">LOCAL PREVIEW</p>
          <h2 className="mt-3 text-lg font-semibold text-slate-900">Choose a portal to look at</h2>
          <p className="mt-1 text-sm text-slate-600">
            No sign-in. Every screen shows fictional data from your browser; nothing is saved and nothing is sent to a server.
            Where a screen has no sample data it says so.
          </p>
          <div className="mt-5 grid gap-3">
            {(Object.keys(ROLE_HOME) as PreviewRole[]).map((key) => (
              <a
                key={key}
                href={ROLE_HOME[key]}
                data-testid={`pick-${key}`}
                className="rounded-xl border border-slate-300 px-4 py-3 text-sm font-semibold text-slate-900 transition hover:border-sky-400 hover:bg-sky-50"
              >
                View as {ROLE_LABEL[key]}
              </a>
            ))}
          </div>
          <p className="mt-4 text-xs text-slate-500">
            Real sign-in is unchanged: start the app without <code>VITE_PREVIEW</code> (or open it from a non-local address).
          </p>
        </div>
      </div>
    </div>
  );
}
