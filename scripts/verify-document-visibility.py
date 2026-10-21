#!/usr/bin/env python3
"""
Tests the two document settings "Mandatory" (is_required) and "Staff only /
Hidden from students" (staff_only), alone and together, against a running
server and a FRESH test database (never a shared or production one):

    PSQL_URL=postgres://user:pw@127.0.0.1:5432/testdb \
      python3 scripts/verify-document-visibility.py http://127.0.0.1:8921

PASS/FAIL lines are things that must hold. NOTE lines record what the backend
actually does where the setting is only informational, so nothing is claimed
that the server does not do.
"""
import json
import os
import subprocess
import sys
import urllib.error
import urllib.request
import uuid

BASE = (sys.argv[1] if len(sys.argv) > 1 else "http://127.0.0.1:8921").rstrip("/")
PSQL_URL = os.environ.get("PSQL_URL", "")
PASSED = FAILED = 0


def call(method, path, token=None, body=None, raw=None, content_type="application/json"):
    request = urllib.request.Request(BASE + path, method=method)
    request.add_header("Content-Type", content_type)
    if token:
        request.add_header("Authorization", "Bearer " + token)
    payload = raw if raw is not None else (json.dumps(body).encode() if body is not None else None)
    try:
        with urllib.request.urlopen(request, payload, timeout=25) as response:
            return response.status, json.loads(response.read() or b"{}")
    except urllib.error.HTTPError as error:
        text = error.read().decode()[:400]
        try:
            return error.code, json.loads(text)
        except Exception:
            return error.code, text


def check(label, condition, detail=""):
    global PASSED, FAILED
    if condition:
        PASSED += 1
        print(f"PASS  {label}")
    else:
        FAILED += 1
        print(f"FAIL  {label}  {detail}")


def psql(sql):
    if not PSQL_URL:
        sys.exit("Set PSQL_URL to the FRESH test database.")
    return subprocess.run(["psql", PSQL_URL, "-tAc", sql], capture_output=True, text=True).stdout.strip()


def staff(email, role):
    status, data = call("POST", "/api/auth/signup", body={"email": email, "password": "testpass123", "firstName": role, "lastName": "Test"})
    user_id = data["user"]["id"] if status == 200 else psql(f"SELECT id FROM auth_users WHERE email='{email}'")
    psql(f"UPDATE user_roles SET role='{role}' WHERE user_id='{user_id}';")
    token = call("POST", "/api/auth/signin", body={"email": email, "password": "testpass123"})[1].get("token", "")
    return user_id, token


def counselor_account(email, admin):
    branch = psql("SELECT id FROM branches ORDER BY created_at LIMIT 1")
    status, data = call("POST", "/api/users", admin, {"email": email, "password": "testpass123", "firstName": "Coun", "lastName": "Selor",
                                                       "role": "counselor", "branchIds": [branch]})
    user_id = (data.get("user") or data).get("id") if isinstance(data, dict) else None
    user_id = user_id or psql(f"SELECT id FROM auth_users WHERE email='{email}'")
    token = call("POST", "/api/auth/signin", body={"email": email, "password": "testpass123"})[1].get("token", "")
    return user_id, token


def student(email):
    status, data = call("POST", "/__auth", body={"action": "signup", "email": email, "password": "testpass123",
                                                   "user_metadata": {"first_name": "Stu", "last_name": email.split("@")[0]}})
    if status != 200:
        status, data = call("POST", "/__auth", body={"action": "signin", "email": email, "password": "testpass123"})
    session = data["session"]
    return session["user"]["id"], session["access_token"]


def assign(student_id, counselor_id, email, countries):
    """Signing up already creates the student's one lead record; give THAT record a counselor and countries."""
    patch = json.dumps({"assigned_counselor_id": counselor_id, "entity_type": "student", "lead_status": "converted",
                        "preferred_countries": countries, "qualification_level": "Masters"})
    lead_id = psql(f"UPDATE app_records SET data = data || '{patch}'::jsonb WHERE table_name = 'student_leads' AND data->>'user_id' = '{student_id}' RETURNING id;").split("\n")[0].strip()
    if lead_id:
        return lead_id
    lead_id = "lead-" + uuid.uuid4().hex[:8]
    data = json.dumps({"user_id": student_id, "email": email, "first_name": "Stu", "last_name": "Dent",
                       "assigned_counselor_id": counselor_id, "entity_type": "student", "lead_status": "converted",
                       "preferred_countries": countries, "qualification_level": "Masters"})
    psql(f"INSERT INTO app_records (table_name, id, data) VALUES ('student_leads', '{lead_id}', '{data}'::jsonb) ON CONFLICT DO NOTHING;")
    return lead_id


def rows(token, table):
    status, data = call("GET", f"/__local_db?table={table}", token)
    return status, (data.get("rows") if isinstance(data, dict) and isinstance(data.get("rows"), list) else [])


def checklist_item(item_id, document_type, countries, student_ids=None):
    data = {"id": item_id, "document_type": document_type, "description": "Fictional test requirement", "is_required": True,
            "is_active": True, "countries": countries, "student_ids": student_ids or [], "allowed_file_types": ["pdf"], "max_file_size_mb": 20}
    if student_ids:
        data["audience"] = "students"
    psql(f"INSERT INTO app_records (table_name, id, data) VALUES ('document_checklists', '{item_id}', '{json.dumps(data)}'::jsonb) ON CONFLICT (id) DO UPDATE SET data = EXCLUDED.data;")


def try_upload(token, user_id, document_type, name=None):
    """Upload a small file, then save its document row, exactly like the Documents page does."""
    path = f"{user_id}/{(name or document_type).replace(' ', '_')}_{uuid.uuid4().hex[:6]}.pdf"
    put_status, put_body = call("PUT", f"/__storage?path={urllib.parse.quote(path)}", token, raw=b"%PDF-1.4 fictional test file", content_type="application/pdf")
    if put_status != 200:
        return "storage", put_status, put_body, None
    doc_id = str(uuid.uuid4())
    status, body = call("POST", "/__local_db", token, {"action": "insert", "table": "documents", "rows": [{
        "id": doc_id, "user_id": user_id, "document_type": document_type, "file_name": "fictional.pdf", "file_path": path,
        "status": "uploaded", "archived": False}]})
    return ("row" if status != 200 else "ok"), status, body, doc_id


import urllib.parse


import urllib.parse  # noqa: E402

NOTES = []


def note(label, detail=""):
    NOTES.append(label)
    print(f"NOTE  {label}  {detail}")


def setup_doc(token, **kw):
    body = {"document_type": kw.pop("name"), "description": "Fictional test document", "allowed_file_types": ["pdf"], "max_file_size_mb": 20,
            "all_countries": False, "countries": [], "all_students": False, **kw}
    return call("POST", "/api/counselor/document-setup", token, body)


def listing(token, route="/api/counselor/document-setup"):
    status, data = call("GET", route, token)
    return {d["id"]: d for d in (data.get("documents") or [])} if status == 200 and isinstance(data, dict) else {}


def stored(doc_id):
    raw = psql(f"SELECT data::text FROM app_records WHERE table_name='document_checklists' AND id='{doc_id}'")
    return json.loads(raw) if raw else {}


def student_checklist(token):
    return rows(token, "document_checklists")[1]


def has(rows_, doc_id=None, name=None):
    return any((doc_id and r.get("id") == doc_id) or (name and r.get("document_type") == name) for r in rows_)


def try_upload(token, user_id, document_type):
    path = f"{user_id}/{document_type.replace(' ', '_')}_{uuid.uuid4().hex[:6]}.pdf"
    put_status, put_body = call("PUT", f"/__storage?path={urllib.parse.quote(path)}", token, raw=b"%PDF-1.4 fictional test file", content_type="application/pdf")
    if put_status != 200:
        return "storage", put_status, put_body, None, path
    doc_id = str(uuid.uuid4())
    status, body = call("POST", "/__local_db", token, {"action": "insert", "table": "documents", "rows": [{
        "id": doc_id, "user_id": user_id, "document_type": document_type, "file_name": "fictional.pdf", "file_path": path,
        "status": "uploaded", "archived": False}]})
    return ("ok" if status == 200 else "row"), status, body, doc_id, path


print(f"Fly Masters - verifying Mandatory / Staff only document settings against {BASE}")
run = uuid.uuid4().hex[:6]
admin_id, admin = staff(f"admin-{run}@mg3.test", "super_admin")
counselor_id, counselor = counselor_account(f"couns-{run}@mg3.test", admin)
email_a, email_b = f"asha-{run}@mg3.test", f"ben-{run}@mg3.test"
stu_a, tok_a = student(email_a)
stu_b, tok_b = student(email_b)
assign(stu_a, counselor_id, email_a, ["Canada"])
assign(stu_b, counselor_id, email_b, ["Canada"])
check("fixtures: admin, counselor, two students under that counselor", all([admin, counselor, tok_a, tok_b]))

N_REQ, N_OPT, N_STAFF, N_BOTH = (f"Fict Mandatory {run}", f"Fict Optional {run}", f"Fict StaffOnly {run}", f"Fict MandatoryStaffOnly {run}")

print("\n### TEST 1 - Mandatory document")
status, resp = setup_doc(counselor, name=N_REQ, is_required=True, staff_only=False, student_ids=[stu_a])
req_id = (resp.get("document") or {}).get("id") if isinstance(resp, dict) else None
check("counselor creates a Mandatory document for student A", status == 200 and req_id and resp["document"].get("is_required") is True, f"{status} {resp}")
status, resp = setup_doc(counselor, name=N_OPT, is_required=False, staff_only=False, student_ids=[stu_a])
opt_id = (resp.get("document") or {}).get("id") if isinstance(resp, dict) else None
check("counselor creates a non-mandatory document for student A", status == 200 and opt_id and resp["document"].get("is_required") is False, f"{status} {resp}")
mine = listing(counselor)
check("counselor screen data marks it mandatory (and the other not)", mine.get(req_id, {}).get("is_required") is True and mine.get(opt_id, {}).get("is_required") is False)
check("admin sees the same flags", listing(admin, "/api/document-setup").get(req_id, {}).get("is_required") is True)
check("stored in the database as is_required=true / false", stored(req_id).get("is_required") is True and stored(opt_id).get("is_required") is False, f"{stored(req_id)}")
check("persists on a fresh read (second GET)", listing(counselor).get(req_id, {}).get("is_required") is True)
sa = student_checklist(tok_a)
check("student A is shown the mandatory document, flagged mandatory", has(sa, req_id) and next(r for r in sa if r["id"] == req_id).get("is_required") is True)
check("student A is shown the non-mandatory one, flagged optional", has(sa, opt_id) and next(r for r in sa if r["id"] == opt_id).get("is_required") is False)
check("student B (not targeted) sees neither", not has(student_checklist(tok_b), req_id) and not has(student_checklist(tok_b), opt_id))
status, body = call("POST", "/__local_db", tok_a, {"action": "update", "table": "document_checklists", "payload": {"is_required": False}, "filters": [{"column": "id", "op": "eq", "value": req_id}]})
check("a student cannot un-require it through the generic data route", status in (400, 403) and stored(req_id).get("is_required") is True, f"{status} {body}")
status, body = call("PATCH", f"/api/counselor/document-setup/{req_id}", tok_a, {"is_required": False})
check("a student cannot call the counselor setup route", status in (401, 403) and stored(req_id).get("is_required") is True, f"{status}")

print("\n--- does the backend ENFORCE a mandatory document, or only show it?")
status, cl = call("GET", f"/api/counselor/students/{stu_a}/checklist", counselor)
items = {i["document_type"]: i for i in (cl.get("items") or [])} if status == 200 else {}
check("counselor's per-student checklist carries the flag and counts it", items.get(N_REQ, {}).get("is_required") is True and items.get(N_OPT, {}).get("is_required") is False and cl.get("required_total", 0) >= 1, f"{status} {cl}")
check("...and `complete` is false while the mandatory one is missing", cl.get("complete") is False)
stage, status, body, doc_id, _ = try_upload(tok_a, stu_a, N_REQ)
check("student A (named on it) can upload the mandatory document", stage == "ok", f"{stage} {status} {body}")
stage, status, body, _, _ = try_upload(tok_b, stu_b, N_REQ)
check("student B cannot upload it (not named, no authorization)", stage == "storage" and status == 403, f"{stage} {status} {body}")
status, cl2 = call("GET", f"/api/counselor/students/{stu_a}/checklist", counselor)
check("uploading is not approval: required_approved is still 0, complete still false", cl2.get("required_approved") == 0 and cl2.get("complete") is False, f"{cl2}")

# An application with the mandatory document still missing (N_OPT never uploaded; N_REQ uploaded but not approved)
shortlist_status, rec = call("POST", "/api/counselor/shortlists", counselor, {
    "student_id": stu_a, "student_email": email_a, "university_name": f"Fictional University {run}", "course_name": "MSc Fictional", "location": "Testville, Canada"})
sl_id = (rec.get("shortlist") or {}).get("id") if isinstance(rec, dict) else None
call("POST", f"/api/case/me/shortlists/{sl_id}/decision", tok_a, {"decision": "accept"})
status, started = call("POST", f"/api/counselor/shortlists/{sl_id}/start-application", counselor, {})
app_id = (started.get("application") or {}).get("id") if isinstance(started, dict) else None
check("(setup) an application exists for student A", status == 200 and app_id, f"{status} {started}")
status, moved = call("PATCH", f"/api/counselor/applications/{app_id}", counselor, {"status": "counselor_approved"})
if status == 200:
    note("counselor can APPROVE an application although a mandatory document is not approved - the flag is not enforced at that step")
else:
    check("approval is blocked while a mandatory document is unapproved", True)
status, moved = call("PATCH", f"/api/counselor/applications/{app_id}", counselor, {"status": "submitted_to_university"})
if status == 200:
    note("counselor can record SUBMISSION TO UNIVERSITY although a mandatory document is not approved - the flag is not enforced at that step")
else:
    check("submission is blocked while a mandatory document is unapproved", True)
status, back = call("PATCH", f"/api/counselor/document-setup/{req_id}", counselor, {"is_required": False})
check("counselor can switch Mandatory off (API supports it)", status == 200 and stored(req_id).get("is_required") is False and has(student_checklist(tok_a), req_id) and next(r for r in student_checklist(tok_a) if r["id"] == req_id).get("is_required") is False)
call("PATCH", f"/api/counselor/document-setup/{req_id}", counselor, {"is_required": True})
check("...and back on; the student sees it follow", stored(req_id).get("is_required") is True and next(r for r in student_checklist(tok_a) if r["id"] == req_id).get("is_required") is True)

print("\n### TEST 2 - Staff only (students don't see it)")
status, resp = setup_doc(counselor, name=N_STAFF, is_required=False, staff_only=True, student_ids=[stu_a])
staff_id = (resp.get("document") or {}).get("id") if isinstance(resp, dict) else None
check("counselor creates a Staff-only document aimed at student A", status == 200 and staff_id and resp["document"].get("staff_only") is True, f"{status} {resp}")
check("counselor Document Setup still lists it, flagged staff-only", listing(counselor).get(staff_id, {}).get("staff_only") is True)
check("admin Document Setup lists it too", listing(admin, "/api/document-setup").get(staff_id, {}).get("staff_only") is True)
check("stored staff_only=true in the database", stored(staff_id).get("staff_only") is True)
sa = student_checklist(tok_a)
check("student A's checklist (generic data route) does not contain it - by id or by name", not has(sa, staff_id, N_STAFF), f"{[r.get('document_type') for r in sa]}")
check("student B does not either", not has(student_checklist(tok_b), staff_id, N_STAFF))

# every table the student can read: the document's name must not appear anywhere
tables = [t for t in psql("SELECT DISTINCT table_name FROM app_records").split("\n") if t.strip()]
tables += ["document_master", "document_requests", "documents", "student_checklists", "country_document_checklists"]
leaks = []
for table in sorted(set(t.strip() for t in tables)):
    status, data = call("GET", f"/__local_db?table={table}", tok_a)
    if status == 200 and N_STAFF in json.dumps(data):
        leaks.append(table)
check("the staff-only document's name appears in NO table the student can read through /__local_db", not leaks, f"leaks in: {leaks}")

stage, status, body, _, _ = try_upload(tok_a, stu_a, N_STAFF)
check("student cannot upload it - no document row can be created (no upload authorization for that type)", stage != "ok" and status == 403, f"{stage} {status} {body}")
if stage == "row":
    note("the raw file PUT into the student's own folder was accepted (storage is gated per student, not per document type) - only an orphan file, no document record was created")
status, body = call("POST", "/__local_db", tok_a, {"action": "insert", "table": "documents", "rows": [{
    "id": str(uuid.uuid4()), "user_id": stu_a, "document_type": N_STAFF, "file_name": "x.pdf", "file_path": f"{stu_a}/x.pdf", "status": "uploaded"}]})
check("student cannot write a documents row of that type either", status == 403, f"{status} {body}")

print("\n--- the loopholes: other ways a staff-only type could reach a student")
status, resp = call("POST", f"/api/counselor/students/{stu_a}/document-requests", counselor, {"document_type": N_STAFF})
req_rows = rows(tok_a, "document_requests")[1]
if status == 200 and any(r.get("document_type") == N_STAFF for r in req_rows):
    note("a counselor 'document request' for a staff-only type DOES reach the student (request route does not check staff_only) - the student then sees it and may upload")
    stage, status, body, req_doc, _ = try_upload(tok_a, stu_a, N_STAFF)
    note("...and the student can then upload against that request", f"-> {stage} HTTP {status}")
    if req_doc:
        psql(f"DELETE FROM app_records WHERE table_name='documents' AND id='{req_doc}'")
else:
    check("a counselor document request for a staff-only type does not reach the student", not any(r.get("document_type") == N_STAFF for r in req_rows), f"{status} {resp}")
    note("counselor document request for a staff-only type", f"-> HTTP {status} {str(resp)[:120]}")

status, cl = call("GET", f"/api/counselor/students/{stu_a}/checklist", counselor)
names = [i["document_type"] for i in (cl.get("items") or [])]
if N_STAFF not in names:
    note("the counselor's PER-STUDENT checklist does not list the staff-only document either (it is visible only in Document Setup)")
else:
    check("counselor per-student checklist lists it", True)

# a documents record of that type stored under the student's id (as if staff filed it for them)
staff_doc = "doc-staff-" + run
psql("INSERT INTO app_records (table_name,id,data) VALUES ('documents','" + staff_doc + "','" + json.dumps({"id": staff_doc, "user_id": stu_a, "document_type": N_STAFF, "file_name": "staffonly.pdf", "file_path": f"{stu_a}/staffonly.pdf", "status": "uploaded", "archived": False}) + "'::jsonb);")
seen = [r for r in rows(tok_a, "documents")[1] if r.get("document_type") == N_STAFF]
if seen:
    note("a documents record of a staff-only type filed under the student's own id IS returned to that student by /__local_db (ownership filter only; staff_only is not consulted)")
else:
    check("a documents record of a staff-only type filed under the student is not returned to the student", True)
psql(f"DELETE FROM app_records WHERE table_name='documents' AND id='{staff_doc}'")

status, resp = call("PUT", f"/api/counselor/document-setup/students/{stu_a}/document-upload-authorization", counselor, {"enabled": True})
check("(setup) counselor enables uploads for student A: 'all applicable documents'", status == 200, f"{status} {resp}")
stage, status, body, leak_doc, leak_path = try_upload(tok_a, stu_a, N_STAFF)
check("with blanket upload authorization the student STILL cannot create a record for a staff-only type", stage != "ok", f"{stage} {status} {body}")
if leak_doc:
    psql(f"DELETE FROM app_records WHERE table_name='documents' AND id='{leak_doc}'")
call("PUT", f"/api/counselor/document-setup/students/{stu_a}/document-upload-authorization", counselor, {"enabled": False})

print("\n--- turning a visible document into staff-only (and back) takes effect at once")
status, resp = call("PATCH", f"/api/counselor/document-setup/{opt_id}", counselor, {"staff_only": True})
check("counselor uses 'Make staff only' on the visible document", status == 200 and stored(opt_id).get("staff_only") is True)
check("the student immediately stops seeing it", not has(student_checklist(tok_a), opt_id))
check("the counselor still sees it", listing(counselor).get(opt_id, {}).get("staff_only") is True)
call("PATCH", f"/api/counselor/document-setup/{opt_id}", counselor, {"staff_only": False})
check("'Show to students' brings it back", has(student_checklist(tok_a), opt_id))
status, body = call("POST", "/__local_db", tok_a, {"action": "update", "table": "document_checklists", "payload": {"staff_only": False}, "filters": [{"column": "id", "op": "eq", "value": staff_id}]})
check("a student cannot flip staff_only through the generic data route", status in (400, 403) and stored(staff_id).get("staff_only") is True, f"{status} {body}")
check("persists after re-reading: staff-only still set, still hidden", stored(staff_id).get("staff_only") is True and not has(student_checklist(tok_a), staff_id) and listing(counselor).get(staff_id, {}).get("staff_only") is True)

print("\n### TEST 3 - Mandatory AND Staff only")
status, resp = setup_doc(counselor, name=N_BOTH, is_required=True, staff_only=True, student_ids=[stu_a])
both_id = (resp.get("document") or {}).get("id") if isinstance(resp, dict) else None
check("the backend accepts the combination", status == 200 and both_id and resp["document"].get("is_required") is True and resp["document"].get("staff_only") is True, f"{status} {resp}")
rec_both = stored(both_id)
check("both flags are stored together", rec_both.get("is_required") is True and rec_both.get("staff_only") is True, f"{rec_both}")
check("mandatory does NOT make it visible: student A's checklist lacks it", not has(student_checklist(tok_a), both_id, N_BOTH))
check("student B's checklist lacks it", not has(student_checklist(tok_b), both_id, N_BOTH))
stage, status, body, _, _ = try_upload(tok_a, stu_a, N_BOTH)
check("student cannot create a document record for it", stage != "ok" and status == 403, f"{stage} {status} {body}")
check("counselor Document Setup shows both flags", listing(counselor).get(both_id, {}).get("is_required") is True and listing(counselor).get(both_id, {}).get("staff_only") is True)
check("admin Document Setup shows both flags", listing(admin, "/api/document-setup").get(both_id, {}).get("staff_only") is True)
status, cl = call("GET", f"/api/counselor/students/{stu_a}/checklist", counselor)
names = [i["document_type"] for i in (cl.get("items") or [])]
if N_BOTH not in names:
    note("a mandatory + staff-only document is NOT in the student's checklist or its required_total / complete count - the mandatory flag has no effect on any per-student view or progress for staff-only documents")
else:
    check("mandatory + staff-only document is counted in the counselor checklist", True)
leaks = [t for t in sorted(set(t.strip() for t in tables)) if (lambda r: r[0] == 200 and N_BOTH in json.dumps(r[1]))(call("GET", f"/__local_db?table={t}", tok_a))]
check("its name appears in no table the student can read", not leaks, f"{leaks}")

print(f"\n{PASSED} passed, {FAILED} failed, {len(NOTES)} notes (observed behaviour, not claimed as protection)")
sys.exit(1 if FAILED else 0)
