// LOCAL PREVIEW ONLY. Delete this file, and the one call to
// installDocumentSetupPreview() in lib/previewMode.ts, to remove it.
//
// Documents Setup preview. The shared setup screen calls fetch("/api/document-setup")
// directly (not api()), so this answers those calls inside the browser:
//   GET /api/document-setup, POST /api/document-setup, PATCH /api/document-setup/:id
// It is only installed from previewApi(), which runs only when the Vite dev server
// is started with VITE_COUNSELOR_PREVIEW=true. It mirrors the server's country and
// student rules closely enough to exercise the form, but it is a MOCK, not the real
// authorization. Saved rows live in sessionStorage: they survive a reload and are
// gone when the tab closes. No request leaves the browser for these paths.
//
// View as admin or counsellor with ?as=admin or ?as=counselor (remembered for the
// tab), or with the switch in the preview banner.

type PreviewRole = "admin" | "counselor";

const ROLE_KEY = "fm_preview_role";
const DOCS_KEY = "fm_preview_setup_docs";
const ALL_COUNTRIES = ["Australia", "Canada", "France", "Germany", "Ireland", "Netherlands", "New Zealand", "UAE", "UK", "USA"];
const COUNSELOR_COUNTRIES = ["Canada", "UK", "USA"];
const SETUP_STUDENTS = [
  { id: "preview-student-1", lead_id: "preview-lead-1", name: "Asha Example", email: "asha.example@example.com", countries: ["Canada", "Ireland"] },
  { id: "preview-student-4", lead_id: "preview-lead-4", name: "Asha Example", email: "asha.second@example.com", countries: ["UK"] },
  { id: "preview-student-2", lead_id: "preview-lead-2", name: "Ben Sample", email: "ben.sample@example.com", countries: ["UK"] },
  { id: "preview-student-3", lead_id: "preview-lead-3", name: "Chloe Demo", email: "chloe.demo@example.com", countries: ["Australia", "New Zealand"] },
];

type SetupRow = Record<string, unknown> & { id: string; document_type: string; countries: string[]; student_ids: string[] };

let installed = false;

function previewRole(): PreviewRole {
  try {
    return sessionStorage.getItem(ROLE_KEY) === "admin" ? "admin" : "counselor";
  } catch {
    return "counselor";
  }
}

function normalizeCountry(input: string) {
  const raw = input.trim();
  const alias: Record<string, string> = {
    usa: "USA", us: "USA", "united states": "USA", uk: "UK", "united kingdom": "UK", uae: "UAE",
  };
  return alias[raw.toLowerCase()] || raw.replace(/\b\w/g, (c) => c.toUpperCase());
}

function seedRow(id: string, name: string): SetupRow {
  return {
    id,
    document_type: name,
    description: "Mock document for the local preview.",
    is_required: true,
    is_active: true,
    staff_only: false,
    allowed_file_types: ["pdf", "jpg", "png"],
    max_file_size_mb: 20,
    countries: ["All"],
    student_ids: [],
    created_by_role: "admin",
  };
}

function readRows(): SetupRow[] {
  try {
    const stored = sessionStorage.getItem(DOCS_KEY);
    if (stored) return JSON.parse(stored) as SetupRow[];
  } catch {
    /* fall through to the seed rows */
  }
  return [seedRow("preview-doc-passport", "Passport (preview)"), seedRow("preview-doc-transcripts", "Academic transcripts (preview)")];
}

function writeRows(rows: SetupRow[]) {
  try {
    sessionStorage.setItem(DOCS_KEY, JSON.stringify(rows));
  } catch {
    /* the preview still works for this page view */
  }
}

function describeRow(row: SetupRow, role: PreviewRole) {
  const countries = row.countries.some((c) => c.toLowerCase() === "all") ? [] : row.countries;
  const names = row.student_ids.length
    ? [...new Set(row.student_ids.map((id) => SETUP_STUDENTS.find((s) => s.id === id || s.lead_id === id)?.name || "A student"))]
    : [];
  return {
    ...row,
    countries_label: countries.length ? countries.join(", ") : "All countries",
    students_label: names.length ? names.join(", ") : "All students",
    can_edit: role === "admin" || row.created_by_role === "counselor",
  };
}

function mountBanner() {
  if (document.getElementById("fm-preview-banner")) return;
  const role = previewRole();
  const button = (text: string, onClick: () => void) => {
    const el = document.createElement("button");
    el.type = "button";
    el.textContent = text;
    el.style.cssText = "border:1px solid rgba(255,255,255,.6);background:transparent;color:#fff;border-radius:6px;padding:2px 8px;cursor:pointer;font:inherit";
    el.onclick = onClick;
    return el;
  };
  const bar = document.createElement("div");
  bar.id = "fm-preview-banner";
  bar.style.cssText =
    "position:fixed;left:12px;bottom:12px;z-index:2147483000;display:flex;flex-wrap:wrap;gap:8px;align-items:center;" +
    "max-width:calc(100vw - 24px);padding:8px 12px;border-radius:10px;font:600 12px system-ui,sans-serif;color:#fff;" +
    `box-shadow:0 4px 14px rgba(0,0,0,.25);background:${role === "admin" ? "#7c3aed" : "#0369a1"}`;
  const label = document.createElement("span");
  label.textContent = `LOCAL PREVIEW · mock data · viewing as ${role === "admin" ? "ADMIN" : "COUNSELOR"}`;
  bar.append(
    label,
    button(`Switch to ${role === "admin" ? "counselor" : "admin"} view`, () => {
      try {
        sessionStorage.setItem(ROLE_KEY, role === "admin" ? "counselor" : "admin");
      } catch {
        /* ignore */
      }
      window.location.reload();
    }),
    button("Reset saved", () => {
      try {
        sessionStorage.removeItem(DOCS_KEY);
      } catch {
        /* ignore */
      }
      window.location.reload();
    }),
  );
  document.body.appendChild(bar);
}

export function installDocumentSetupPreview() {
  if (installed) return;
  installed = true;

  const asParam = new URLSearchParams(window.location.search).get("as");
  if (asParam === "admin" || asParam === "counselor") {
    try {
      sessionStorage.setItem(ROLE_KEY, asParam);
    } catch {
      /* ignore */
    }
  }

  const realFetch = window.fetch.bind(window);
  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

  window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    const path = url.split("?")[0];
    const match = path.match(/^\/api\/(?:counselor\/)?document-setup(?:\/([^/]+))?$/);
    if (!match) return realFetch(input, init);

    const role = previewRole();
    const method = (init?.method || "GET").toUpperCase();
    const allowed = role === "admin" ? ALL_COUNTRIES : COUNSELOR_COUNTRIES;
    const rows = readRows();

    if (method === "GET") {
      return json({
        documents: rows.map((row) => describeRow(row, role)),
        countries: allowed,
        countries_from_profile: role === "counselor",
        students: SETUP_STUDENTS,
        role,
      });
    }

    let body: Record<string, unknown> = {};
    try {
      body = JSON.parse(String(init?.body || "{}")) as Record<string, unknown>;
    } catch {
      /* treated as an empty body */
    }

    if (method === "POST" && !match[1]) {
      const documentType = String(body.document_type || "").trim().slice(0, 120);
      if (!documentType) return json({ error: "Give the document a name." }, 400);

      const requested = Array.isArray(body.countries)
        ? (body.countries as unknown[]).map((c) => normalizeCountry(String(c))).filter(Boolean)
        : [];
      let countries: string[];
      if (body.all_countries || !requested.length) {
        countries = role === "admin" ? ["All"] : allowed;
      } else {
        countries = [...new Set(requested)];
        const allowedLower = new Set(allowed.map((c) => c.toLowerCase()));
        const outside = countries.filter((c) => !allowedLower.has(c.toLowerCase()));
        if (outside.length && role !== "admin") {
          return json({ error: `You can only choose your own countries (not ${outside.join(", ")}).` }, 400);
        }
      }

      const ids = Array.isArray(body.student_ids) ? (body.student_ids as unknown[]).map(String) : [];
      const targeted = ids.map((id) => SETUP_STUDENTS.find((s) => s.id === id || s.lead_id === id));
      if (targeted.some((s) => !s)) return json({ error: "Choose students from your own list." }, 400);

      const row: SetupRow = {
        id: `preview-doc-${Date.now()}`,
        document_type: documentType,
        description: String(body.description || "").slice(0, 2000),
        is_required: body.is_required !== false,
        is_active: true,
        staff_only: Boolean(body.staff_only),
        allowed_file_types: String(body.allowed_file_types || "pdf,jpg,png")
          .split(",")
          .map((t) => t.trim().toLowerCase())
          .filter(Boolean),
        max_file_size_mb: Math.min(Math.max(Number(body.max_file_size_mb || 20), 1), 100),
        countries,
        student_ids: [...new Set(targeted.flatMap((s) => [s!.id, s!.lead_id]))],
        created_by_role: role,
      };
      writeRows([...rows, row]);
      return json({ ok: true, document: describeRow(row, role) });
    }

    if (method === "PATCH" && match[1]) {
      const found = rows.find((row) => row.id === match[1]);
      if (!found) return json({ error: "Document not found." }, 404);
      if (!describeRow(found, role).can_edit) {
        return json({ error: "Only admin (or whoever added it) can change this document." }, 403);
      }
      const next: SetupRow = { ...found };
      for (const field of ["is_active", "staff_only", "is_required"]) {
        if (field in body) next[field] = Boolean(body[field]);
      }
      writeRows(rows.map((row) => (row.id === next.id ? next : row)));
      return json({ ok: true, document: describeRow(next, role) });
    }

    return json({ error: `Preview mode: "${method} ${path}" is not available locally.` }, 400);
  };

  mountBanner();
}
