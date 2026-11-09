// The business journey, run against a DEPLOYED environment over HTTP.
//
// Milestones 2.1 and 2.2: a lead is captured, assigned to a telecaller, followed up, converted and
// handed to a counselor; then a student registers, is assigned, uploads the document the counselor
// asked for, and has it reviewed. The question this answers is not whether each
// route works on its own — the test suite covers that — but whether **ownership and history survive
// every step**, and whether the branch next door stays out of all of it.
//
// IT WRITES DATA. It creates a branch pair, four staff accounts and a lead, then deletes the accounts
// it made. Run it on staging, never on an environment whose data matters. It refuses to start without
// --allow-writes.
//
//   $env:ACCEPTANCE_URL = "https://<staging-host>"
//   $env:SUPER_EMAIL = "boss@example.com"; $env:SUPER_PASSWORD = "..."
//   node scripts/acceptance-journey.mjs --allow-writes
//
// Exit code 0 means every check passed. --keep leaves what it created in place.

const base = String(process.env.ACCEPTANCE_URL || "").replace(/\/+$/, "");
const superEmail = process.env.SUPER_EMAIL || "";
const superPassword = process.env.SUPER_PASSWORD || "";
if (!base || !superEmail || !superPassword) {
  console.error("Set ACCEPTANCE_URL, SUPER_EMAIL and SUPER_PASSWORD. See the top of this file.");
  process.exit(2);
}
if (!process.argv.includes("--allow-writes")) {
  console.error("This creates a branch, staff and a lead on the target environment. Re-run with --allow-writes once you are sure it is staging.");
  process.exit(2);
}
const keep = process.argv.includes("--keep");

const tag = `jny${new Date().toISOString().replace(/[^0-9]/g, "").slice(0, 14)}`;
const PASSWORD = "journey-pass-123";
let pass = 0;
let fail = 0;
const failures = [];

const check = (name, ok, detail = "") => {
  if (ok) { pass += 1; console.log(`PASS  ${name}`); return true; }
  fail += 1; failures.push(name);
  console.log(`FAIL  ${name}\n        ${detail}`);
  return false;
};

async function call(method, path, { token, body } = {}) {
  const res = await fetch(base + path, {
    method,
    headers: { "content-type": "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  let json = null;
  try { json = text ? JSON.parse(text) : null; } catch { json = { raw: text.slice(0, 200) }; }
  return { status: res.status, json };
}
const show = (r) => `status ${r.status} ${JSON.stringify(r.json)?.slice(0, 240)}`;

async function signIn(email, password) {
  const r = await call("POST", "/api/auth/signin", { body: { email, password } });
  return { ok: r.status === 200 && Boolean(r.json?.token), token: r.json?.token, res: r };
}
const created = { accounts: [], leadId: null, studentLeadId: null };
async function makeStaff(token, role, branchId, label) {
  const email = `${tag}.${label}@example.invalid`;
  const r = await call("POST", "/api/users", {
    token, body: { email, password: PASSWORD, firstName: "Jny", lastName: label, role, branchId },
  });
  if (!check(`a ${role} is created for branch ${label.includes("far") ? "Two" : "One"}`, r.status === 200 && r.json?.id, show(r))) return null;
  created.accounts.push(r.json.id);
  const session = await signIn(email, PASSWORD);
  if (!check(`that ${role} can sign in`, session.ok, show(session.res))) return null;
  return { id: r.json.id, email, token: session.token };
}

console.log(`\n== Target ${base}\n== Run tag ${tag}\n`);

const health = await call("GET", "/api/health");
if (!check("the server and its database are reachable", health.status === 200 && health.json?.ok === true, show(health))) process.exit(1);

// What is this environment running? A green run against an unknown commit proves nothing, so the
// commit and schema version are printed before any check (milestone 3.1).
const version = await call("GET", "/api/version");
if (version.status === 200) {
  const v = version.json || {};
  console.log(`== Deployed commit ${v.short || "UNKNOWN"}${v.branch ? ` on ${v.branch}` : ""}${v.environment ? ` (${v.environment})` : ""}`);
  console.log(`== Migrations applied ${v.migrations?.applied ?? "?"}, latest ${v.migrations?.latest || "none"}`);
  check("the environment reports which commit it is running",
    Boolean(v.short),
    "no commit is configured, so this run cannot say which code it tested: set RAILWAY_GIT_COMMIT_SHA or an equivalent");
} else {
  console.log(`== Deployed commit UNKNOWN (/api/version answered ${version.status}: an older build)`);
}

const boss = await signIn(superEmail, superPassword);
if (!check("the Super Admin can sign in", boss.ok, show(boss.res))) {
  console.log("\nStopping: create the first Super Admin with scripts/bootstrap-super-admin.mjs.");
  process.exit(1);
}

// ---- the cast -------------------------------------------------------------------------------
const branches = [];
for (const label of ["One", "Two"]) {
  const r = await call("POST", "/api/branches", { token: boss.token, body: { name: `${tag} Branch ${label}`, city: "Testville" } });
  const id = r.json?.branch?.id || r.json?.id;
  if (check(`branch ${label} is created`, r.status === 200 && Boolean(id), show(r))) branches.push(id);
}
if (branches.length < 2) { console.log("\nStopping: the isolation checks need two branches."); process.exit(1); }
const [B1, B2] = branches;

const admin = await makeStaff(boss.token, "admin", B1, "admin");
if (!admin) process.exit(1);
const telecaller = await makeStaff(admin.token, "telecaller", B1, "telecaller");
const counselor = await makeStaff(admin.token, "counselor", B1, "counselor");
const farCounselor = await makeStaff(boss.token, "counselor", B2, "far-counselor");
if (!telecaller || !counselor || !farCounselor) process.exit(1);

// ---- 2.1 capture ----------------------------------------------------------------------------
// Converting needs preferred countries, a field of interest and a phone number, so they are captured
// up front: a lead that cannot convert would stop the journey at step three.
const leadBody = {
  firstName: "Journey", lastName: "Lead", email: `${tag}.lead@example.invalid`,
  phone: "9800000111", countries: "United Kingdom, Canada", field: "Computer Science",
  branchId: B1,
};
const captured = await call("POST", "/api/leads", { token: admin.token, body: leadBody });
const leadId = captured.json?.lead?.id || captured.json?.id;
if (!check("a lead is captured with the details conversion needs", captured.status === 200 && Boolean(leadId), show(captured))) process.exit(1);
created.leadId = leadId;

// ---- 2.1 assignment -------------------------------------------------------------------------
const assigned = await call("POST", "/api/leads/bulk-assign-telecaller", {
  token: admin.token, body: { ids: [leadId], telecallerId: telecaller.id },
});
check("the Admin assigns the lead to the telecaller", assigned.status === 200 && assigned.json?.count === 1,
  `${show(assigned)} — count 0 means nothing was assigned`);

const queue = await call("GET", "/api/telecaller/state", { token: telecaller.token });
const inQueue = (rows) => (rows || []).some((row) => String(row.id) === String(leadId));
check("the lead appears in that telecaller's own queue",
  queue.status === 200 && inQueue(queue.json?.leads), show(queue));

const farQueue = await call("GET", "/api/telecaller/state", { token: telecaller.token });
check("the queue read is repeatable", farQueue.status === 200 && inQueue(farQueue.json?.leads), show(farQueue));

// ---- 2.1 follow-up, and the history it must leave -------------------------------------------
const contact = await call("POST", `/api/telecaller/leads/${leadId}/contact`, {
  token: telecaller.token,
  body: { outcome: "connected", note: `${tag} first call: interested in January intake`, lead_status: "warm" },
});
check("the telecaller records a follow-up", contact.status === 200, show(contact));

const second = await call("POST", `/api/telecaller/leads/${leadId}/contact`, {
  token: telecaller.token,
  body: { outcome: "connected", note: `${tag} second call: documents discussed`, lead_status: "hot" },
});
check("a second follow-up is recorded", second.status === 200, show(second));

const afterCalls = await call("GET", "/api/telecaller/state", { token: telecaller.token });
const lead = (afterCalls.json?.leads || []).find((row) => String(row.id) === String(leadId));
check("the follow-up moved the lead's status, rather than leaving it untouched",
  String(lead?.lead_status || "") === "hot", `lead_status ${lead?.lead_status}`);
const history = JSON.stringify(lead || {});
check("BOTH follow-up notes are still on the lead: the first was not overwritten by the second",
  history.includes("first call") && history.includes("second call"),
  "one of the two notes is missing from the lead, so the call history does not accumulate");
check("the lead still belongs to the same telecaller after the follow-ups",
  String(lead?.assigned_telecaller_id || "") === String(telecaller.id),
  `assigned_telecaller_id ${lead?.assigned_telecaller_id}`);

// ---- 2.1 conversion -------------------------------------------------------------------------
const converted = await call("POST", `/api/telecaller/leads/${leadId}/convert`, { token: telecaller.token, body: {} });
check("the telecaller converts the lead", converted.status === 200, show(converted));

// ---- 2.2 handoff to a counselor -------------------------------------------------------------
const handed = await call("POST", "/api/leads/bulk-assign", {
  token: admin.token, body: { ids: [leadId], counselorId: counselor.id },
});
check("the Admin hands the converted lead to a counselor", handed.status === 200 && handed.json?.count === 1,
  `${show(handed)} — count 0 means nothing was handed over`);

const counselorState = await call("GET", "/api/counselor/state", { token: counselor.token });
const mine = [...(counselorState.json?.leads || []), ...(counselorState.json?.students || [])];
const held = mine.find((row) => String(row.id) === String(leadId) || String(row.lead_id || "") === String(leadId));
check("the student now appears for the assigned counselor", counselorState.status === 200 && Boolean(held), show(counselorState));
check("the telecaller's work survived the handoff: their id is still on the record",
  JSON.stringify(held || {}).includes(String(telecaller.id)),
  "the converted record no longer names the telecaller who worked it, so that history is lost");

const studentRef = held?.user_id || held?.student_id || held?.id;

// ---- 2.2 document request -------------------------------------------------------------------
if (studentRef) {
  const request = await call("POST", `/api/counselor/students/${studentRef}/document-requests`, {
    token: counselor.token,
    body: { document_types: ["passport"], note: `${tag} please upload your passport` },
  });
  check("the counselor can request a document from their own student", request.status === 200, show(request));

  const farRequest = await call("POST", `/api/counselor/students/${studentRef}/document-requests`, {
    token: farCounselor.token,
    body: { document_types: ["passport"], note: "from another branch" },
  });
  check("a counselor in the other branch cannot request a document from this student (403)",
    farRequest.status === 403, show(farRequest));

  const checklist = await call("GET", `/api/counselor/students/${studentRef}/checklist`, { token: counselor.token });
  check("the assigned counselor can read the student's checklist", checklist.status === 200, show(checklist));
  const farChecklist = await call("GET", `/api/counselor/students/${studentRef}/checklist`, { token: farCounselor.token });
  check("the other branch's counselor cannot read that checklist (403)", farChecklist.status === 403, show(farChecklist));
}

// ---- 2.2 the student's own half: sign-up, upload, and the counselor's review ----------------
// A self-registering student, which is how the student journey actually begins. The lead above was
// captured by staff, and sign-up refuses an email that already has a login, so this is a second person.
const studentEmail = `${tag}.student@example.invalid`;
const studentSession = { token: null, leadId: null, userId: null };
const studentSignup = await call("POST", "/__auth", {
  body: {
    action: "signup", email: studentEmail, password: PASSWORD,
    user_metadata: { first_name: "Jny", last_name: "Student" },
  },
});
const studentToken = studentSignup.json?.session?.access_token || studentSignup.json?.session?.token;
if (check("a student can register", studentSignup.status === 200 && Boolean(studentToken), show(studentSignup))) {
  // The new student's lead has to reach this branch's counselor before any of the rest applies.
  // Staff read leads through /api/state; there is no GET /api/leads.
  const allLeads = await call("GET", "/api/state", { token: boss.token });
  const pool = [
    ...(allLeads.json?.leads || []),
    ...(allLeads.json?.students || []),
  ];
  const studentLead = pool.find((row) => String(row.email || "").toLowerCase() === studentEmail);
  if (check("the registration created a lead the staff can see", Boolean(studentLead), show(allLeads))) {
    const toBranch = await call("POST", `/api/leads/${studentLead.id}/branch`, {
      token: boss.token, body: { branchId: B1 },
    });
    check("the Super Admin places that lead in branch One", toBranch.status === 200, show(toBranch));
    // A registered person is a LEAD, not yet a student: bulk-assign refuses anything not converted
    // (`if (!converted) continue`), so the real path runs through the telecaller first. Worth knowing:
    // that route answers ok:true with count:0 when it assigns nothing, so count is what to check.
    const toTelecaller = await call("POST", "/api/leads/bulk-assign-telecaller", {
      token: admin.token, body: { ids: [studentLead.id], telecallerId: telecaller.id },
    });
    check("the registered lead reaches the telecaller", toTelecaller.status === 200 && toTelecaller.json?.count === 1, show(toTelecaller));

    // Conversion needs countries, a field of interest and a phone number; a sign-up supplies none.
    const enriched = await call("PATCH", `/api/telecaller/leads/${studentLead.id}`, {
      token: telecaller.token,
      body: { preferred_countries: ["Australia"], field_of_interest: "Data Science", phone: "9800000222" },
    });
    check("the telecaller completes the details conversion needs", enriched.status === 200, show(enriched));

    const studentConverted = await call("POST", `/api/telecaller/leads/${studentLead.id}/convert`, { token: telecaller.token, body: {} });
    check("the telecaller converts the registered student", studentConverted.status === 200, show(studentConverted));

    const toCounselor = await call("POST", "/api/leads/bulk-assign", {
      token: admin.token, body: { ids: [studentLead.id], counselorId: counselor.id },
    });
    check("the Admin assigns the converted student to the counselor",
      toCounselor.status === 200 && toCounselor.json?.count === 1,
      `${show(toCounselor)} — count 0 means it assigned nothing while still answering ok`);

    created.studentLeadId = studentLead.id;
    const studentUserId = studentLead.user_id;
    studentSession.token = studentToken;
    studentSession.leadId = studentLead.id;
    studentSession.userId = studentUserId;
    const request = await call("POST", `/api/counselor/students/${studentUserId}/document-requests`, {
      token: counselor.token,
      body: { document_types: ["passport"], note: `${tag} upload your passport` },
    });
    check("the counselor requests a passport from the registered student", request.status === 200, show(request));

    // The file first: the student's own folder, which is the only place they may write.
    const filePath = `${studentUserId}/passport-${tag}.pdf`;
    const upload = await call("PUT", "/__storage", {
      token: studentToken,
      body: { path: filePath, dataUrl: "data:application/pdf;base64,JVBERi0xLjQK" },
    });
    check("the student can upload into their own folder", upload.status === 200, show(upload));

    const foreign = await call("PUT", "/__storage", {
      token: studentToken,
      body: { path: `someone-else/passport-${tag}.pdf`, dataUrl: "data:application/pdf;base64,JVBERi0xLjQK" },
    });
    check("the student cannot upload into another student's folder (403)", foreign.status === 403, show(foreign));

    // Then the documents row that points at it, through the student data API.
    const docId = `jdoc-${tag}`;
    const record = await call("POST", "/__local_db", {
      token: studentToken,
      // The student data API takes `rows`, not `values`; with `values` it answers ok and writes nothing.
      body: {
        table: "documents", action: "insert",
        rows: [{
          id: docId, user_id: studentUserId, document_type: "passport",
          file_name: `passport-${tag}.pdf`, file_path: filePath,
          // "uploaded" is the only status a student may set: review belongs to staff
          // (dataPolicy.ts — "Document review is controlled by staff.").
          status: "uploaded", created_at: new Date().toISOString(),
        }],
      },
    });
    check("the student's upload is recorded against the request", record.status === 200, show(record));

    // And the counselor's side of it: read the file, then decide.
    const fetched = await call("GET", `/api/counselor/documents/${docId}/file`, { token: counselor.token });
    check("the assigned counselor can open the uploaded file", fetched.status === 200 && Boolean(fetched.json?.dataUrl), show(fetched));
    const farFetched = await call("GET", `/api/counselor/documents/${docId}/file`, { token: farCounselor.token });
    check("the other branch's counselor cannot open it (403)", farFetched.status === 403, show(farFetched));

    const reviewed = await call("PATCH", `/api/counselor/documents/${docId}`, {
      token: counselor.token, body: { status: "approved", note: `${tag} looks correct` },
    });
    check("the counselor reviews and approves the document", reviewed.status === 200, show(reviewed));

    const checklistAfter = await call("GET", `/api/counselor/students/${studentUserId}/checklist`, { token: counselor.token });
    const checklistText = JSON.stringify(checklistAfter.json || {});
    check("the approval shows on the student's checklist, so the next step is visible",
      checklistAfter.status === 200 && /approved/i.test(checklistText), show(checklistAfter));

    const farReview = await call("PATCH", `/api/counselor/documents/${docId}`, {
      token: farCounselor.token, body: { status: "rejected", note: "from another branch" },
    });
    check("the other branch's counselor cannot review it (403)", farReview.status === 403, show(farReview));
  }
}

// ---- 2.2 the application step, which is the middle of 2.2's gate -----------------------------
// "counselor handoff -> application -> document upload/review -> next step". The documents half is
// above; this is the application itself: shortlist, the student's own acceptance, starting the
// application, submitting it to the university, and an offer coming back.
if (studentSession.token && studentSession.leadId) {
  const shortlist = await call("POST", "/api/counselor/shortlists", {
    token: counselor.token,
    body: {
      student_id: studentSession.leadId, university_name: `${tag} Imperial College`,
      course_name: "MSc Data Science", location: "London",
    },
  });
  const shortlistId = shortlist.json?.shortlist?.id || shortlist.json?.id;
  if (check("the counselor shortlists a university for the student", shortlist.status === 200 && Boolean(shortlistId), show(shortlist))) {
    // A counselor cannot start an application the student has not accepted: that is the rule, so it is
    // checked before the acceptance rather than assumed afterwards.
    const tooEarly = await call("POST", `/api/counselor/shortlists/${shortlistId}/start-application`, { token: counselor.token, body: {} });
    check("an application cannot start before the student accepts (409)", tooEarly.status === 409, show(tooEarly));

    const accepted = await call("POST", `/api/case/me/shortlists/${shortlistId}/decision`, {
      token: studentSession.token, body: { decision: "accept" },
    });
    check("the student accepts the university", accepted.status === 200, show(accepted));

    const started = await call("POST", `/api/counselor/shortlists/${shortlistId}/start-application`, { token: counselor.token, body: {} });
    const applicationId = started.json?.application?.id || started.json?.id;
    if (check("the counselor starts the application", started.status === 200 && Boolean(applicationId), show(started))) {
      // One application per student and university: a second click must reuse it, not make a duplicate.
      const again = await call("POST", `/api/counselor/shortlists/${shortlistId}/start-application`, { token: counselor.token, body: {} });
      const againId = again.json?.application?.id || again.json?.id;
      check("starting it twice reuses the same application rather than duplicating it",
        again.status === 200 && String(againId) === String(applicationId), `${show(again)} — expected ${applicationId}`);

      const farStart = await call("POST", `/api/counselor/shortlists/${shortlistId}/start-application`, { token: farCounselor.token, body: {} });
      check("the other branch's counselor cannot start an application for this student (403)", farStart.status === 403, show(farStart));

      const submitted = await call("PATCH", `/api/counselor/applications/${applicationId}`, {
        token: counselor.token, body: { status: "submitted_to_university", comments: `${tag} sent` },
      });
      check("the counselor submits the application to the university", submitted.status === 200, show(submitted));

      const offer = await call("PATCH", `/api/counselor/applications/${applicationId}`, {
        token: counselor.token, body: { status: "offer_received", comments: `${tag} offer in` },
      });
      check("an offer from the university is recorded", offer.status === 200, show(offer));

      const farUpdate = await call("PATCH", `/api/counselor/applications/${applicationId}`, {
        token: farCounselor.token, body: { status: "rejected", comments: "from another branch" },
      });
      check("the other branch's counselor cannot change the application (403)", farUpdate.status === 403, show(farUpdate));

      // The student has to be able to see where they stand: that is the "next step" in the gate. The
      // student portal reads its own rows through the data API, which filters them to this student.
      const studentView = await call("GET", "/__local_db?table=applications", { token: studentSession.token });
      const rows = studentView.json?.rows || studentView.json || [];
      const own = (Array.isArray(rows) ? rows : []).find((row) => String(row.id) === String(applicationId));
      check("the student can see their own application and its latest status",
        studentView.status === 200 && own?.status === "offer_received",
        `${show(studentView)} — the student cannot see where their application stands`);

      // And only their own: another student's application must not be in that answer.
      const otherEmail = `${tag}.student2@example.invalid`;
      const other = await call("POST", "/__auth", {
        body: { action: "signup", email: otherEmail, password: PASSWORD, user_metadata: { first_name: "Other" } },
      });
      const otherToken = other.json?.session?.access_token || other.json?.session?.token;
      if (otherToken) {
        const otherView = await call("GET", "/__local_db?table=applications", { token: otherToken });
        const otherRows = otherView.json?.rows || otherView.json || [];
        const leaked = (Array.isArray(otherRows) ? otherRows : []).some((row) => String(row.id) === String(applicationId));
        check("another student cannot see this application", !leaked, show(otherView));
      }
    }
  }
}

// ---- isolation across the whole journey -----------------------------------------------------
const farCounselorState = await call("GET", "/api/counselor/state", { token: farCounselor.token });
const farSees = [...(farCounselorState.json?.leads || []), ...(farCounselorState.json?.students || [])]
  .some((row) => String(row.id) === String(leadId));
check("the other branch's counselor never sees this student in their own list", !farSees, show(farCounselorState));

const stealAssign = await call("POST", "/api/leads/bulk-assign", {
  token: admin.token, body: { ids: [leadId], counselorId: farCounselor.id },
});
check("the lead cannot be assigned to a counselor outside the Admin's branches (403/400)",
  stealAssign.status === 403 || stealAssign.status === 400, show(stealAssign));

// ---- clean up -------------------------------------------------------------------------------
if (keep) {
  console.log(`\n--keep given: leaving the accounts, the lead (${created.leadId}) and the branches in place.`);
} else {
  // The lead goes first: an account that still holds leads cannot be deleted, which is the right
  // refusal and would otherwise leave this run's staff behind.
  let leadDelete = { status: 0, json: null };
  for (const id of [created.leadId, created.studentLeadId].filter(Boolean)) {
    // Both people this run created: the staff-captured lead and the registered student.
    leadDelete = await call("POST", `/api/admin/delete/${id === created.studentLeadId ? "student" : "lead"}/${id}`, {
      token: boss.token, body: { confirm: "DELETE", reason: `journey run ${tag}` },
    });
    if (leadDelete.status !== 200) console.log(`      note: could not delete ${id} (${show(leadDelete)})`);
  }
  let removed = 0;
  for (const id of [...created.accounts].reverse()) {
    const r = await call("POST", `/api/admin/delete/staff/${id}`, { token: boss.token, body: { confirm: "DELETE", reason: `journey run ${tag}` } });
    if (r.status === 200) removed += 1; else console.log(`      note: could not delete account ${id} (${show(r)})`);
  }
  console.log(`\nCleanup: lead delete ${leadDelete.status === 200 ? "ok" : show(leadDelete)}; deleted ${removed} of ${created.accounts.length} accounts.`);
  console.log(`Branches named "${tag} Branch One/Two" remain: there is no branch delete route.`);
}

console.log(`\n${pass} passed, ${fail} failed`);
if (fail) { console.log("\nFailed checks:"); for (const name of failures) console.log(`  - ${name}`); }
process.exit(fail ? 1 : 0);
