// LOCAL PREVIEW ONLY. Remove this file and the marked block at the top of
// api() in lib/api.ts to delete the preview completely.
//
// Active only when ALL of these hold:
//   - the Vite dev server is running (import.meta.env.DEV; false in every build)
//   - VITE_COUNSELOR_PREVIEW=true (or VITE_PREVIEW=true, which also previews the
//     student portal) is set when starting the dev server
// When active, the counselor portal skips sign-in and every API call is answered
// from the fictional data below. Nothing is sent to the API, PostgreSQL or Railway,
// and nothing is saved: writes only change this in-memory preview data.

export function isCounselorPreview() {
  return import.meta.env.DEV && (import.meta.env.VITE_COUNSELOR_PREVIEW === "true" || import.meta.env.VITE_PREVIEW === "true");
}

const PREVIEW_COUNSELOR_ID = "preview-counselor";

const user = {
  id: PREVIEW_COUNSELOR_ID,
  email: "preview-counselor@example.com",
  firstName: "Preview",
  lastName: "Counselor",
  phone: "+00 000 000 0000",
};

function lead(index: number, first: string, last: string, field: string, countries: string[], score: string) {
  return {
    id: `preview-lead-${index}`,
    user_id: `preview-student-${index}`,
    first_name: first,
    last_name: last,
    email: `${first.toLowerCase()}.${last.toLowerCase()}@example.com`,
    phone: `+00 000 000 00${index}`,
    lead_status: "converted",
    lead_stage: "converted",
    lead_source: "manual",
    priority: "medium",
    field_of_interest: field,
    academic_score: score,
    preferred_countries: countries,
    notes: "Mock student for local preview only.",
    next_follow_up_date: null,
    last_contact_date: null,
    conversion_date: "2026-01-10T00:00:00.000Z",
    created_at: "2026-01-05T00:00:00.000Z",
    assigned_counselor_id: PREVIEW_COUNSELOR_ID,
    assigned_telecaller_id: null,
    entity_type: "student",
  };
}

const leads = [
  lead(1, "Asha", "Example", "Computer Science", ["Canada", "Ireland"], "IELTS 7.0"),
  lead(2, "Ben", "Sample", "Business Analytics", ["United Kingdom"], "GPA 3.4"),
  lead(3, "Chloe", "Demo", "Nursing", ["Australia", "New Zealand"], "IELTS 6.5"),
];

const documentTypes = [
  { document_type: "Passport", description: "Valid for at least 12 months.", is_required: true },
  { document_type: "Academic transcripts", description: "Official transcripts from every institution.", is_required: true },
  { document_type: "English test score", description: "IELTS, TOEFL or PTE result.", is_required: true },
  { document_type: "Statement of purpose", description: "Optional personal statement.", is_required: false },
];

const checklistItems: Record<string, Array<{ status: string; request_sent: boolean; request_sent_at: string | null; file_name: string | null }>> = {
  "preview-student-1": [
    { status: "approved", request_sent: false, request_sent_at: null, file_name: "passport-preview.pdf" },
    { status: "uploaded", request_sent: false, request_sent_at: null, file_name: "transcripts-preview.pdf" },
    { status: "requested", request_sent: true, request_sent_at: "2026-10-10T09:00:00.000Z", file_name: null },
    { status: "requested", request_sent: false, request_sent_at: null, file_name: null },
  ],
  "preview-student-2": [
    { status: "requested", request_sent: false, request_sent_at: null, file_name: null },
    { status: "requested", request_sent: false, request_sent_at: null, file_name: null },
    { status: "requested", request_sent: false, request_sent_at: null, file_name: null },
    { status: "requested", request_sent: false, request_sent_at: null, file_name: null },
  ],
  "preview-student-3": [
    { status: "approved", request_sent: false, request_sent_at: null, file_name: "passport-preview.pdf" },
    { status: "approved", request_sent: false, request_sent_at: null, file_name: "transcripts-preview.pdf" },
    { status: "approved", request_sent: false, request_sent_at: null, file_name: "english-preview.pdf" },
    { status: "rejected", request_sent: true, request_sent_at: "2026-10-12T14:30:00.000Z", file_name: null },
  ],
};

function checklistFor(studentId: string) {
  const states = checklistItems[studentId] || checklistItems["preview-student-1"];
  const items = documentTypes.map((doc, index) => ({
    ...doc,
    ...states[index],
    document_id: states[index].file_name ? `preview-doc-${index}` : null,
    admin_comments: "",
    request_id: states[index].request_sent ? `preview-request-${index}` : null,
  }));
  const required = items.filter((item) => item.is_required);
  const approved = required.filter((item) => item.status === "approved").length;
  return {
    student_id: studentId,
    countries: ["Canada"],
    degree: "Bachelor's",
    items,
    required_total: required.length,
    required_approved: approved,
    not_uploaded: required.filter((item) => !item.file_name).length,
    complete: approved === required.length,
  };
}

function emptyState() {
  return {
    leads,
    conversations: [],
    messages: [],
    notifications: [],
    documents: leads.map((item, index) => ({
      id: `preview-doc-row-${index}`,
      user_id: item.user_id,
      document_type: "Passport",
      file_name: "passport-preview.pdf",
      status: "approved",
      archived: false,
      created_at: "2026-01-12T00:00:00.000Z",
    })),
    applications: [],
    shortlists: [
      {
        id: "preview-shortlist-1",
        student_id: "preview-student-1",
        university_name: "Preview University of Examples",
        course_name: "BSc Computer Science",
        location: "Toronto, Canada",
        created_at: "2026-01-20T00:00:00.000Z",
      },
    ],
    leave: [],
    attendance: [],
    salary: [],
    counselorExtras: [],
  };
}

const previewState = emptyState();

export async function previewApi(path: string, options: { method?: string; body?: unknown } = {}): Promise<unknown> {
  // Also answer the shared Documents Setup screen's direct fetch calls (previewSetup.ts).
  const { installDocumentSetupPreview } = await import("./previewSetup");
  installDocumentSetupPreview();
  const method = options.method || "GET";

  if (method === "GET" && path === "/me") return { user };
  if (method === "GET" && path === "/state") return previewState;

  const checklistMatch = path.match(/^\/students\/([^/]+)\/checklist$/);
  if (method === "GET" && checklistMatch) return checklistFor(checklistMatch[1]);

  const requestMatch = path.match(/^\/students\/([^/]+)\/document-requests$/);
  if (method === "POST" && requestMatch) {
    const studentId = requestMatch[1];
    const types = ((options.body as { document_types?: string[] })?.document_types) || [];
    const states = checklistItems[studentId];
    const requests: Array<{ id: string; document_type: string }> = [];
    if (states) {
      documentTypes.forEach((doc, index) => {
        if (types.includes(doc.document_type) && states[index].status !== "approved") {
          states[index] = { ...states[index], status: "requested", request_sent: true, request_sent_at: new Date().toISOString() };
          requests.push({ id: `preview-request-${index}`, document_type: doc.document_type });
        }
      });
    }
    return { ok: true, requests };
  }

  throw new Error(`Preview mode: "${method} ${path}" is not available locally. Nothing was changed.`);
}
