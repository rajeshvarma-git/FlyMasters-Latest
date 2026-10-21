#!/usr/bin/env python3
"""
Regression test for the staff-only document authorization, against a running
server and a FRESH test database (never a shared or production one):

    PSQL_URL=postgres://user:pw@127.0.0.1:5432/testdb \
      python3 scripts/verify-staff-only-authorization.py http://127.0.0.1:8921

Every "must be rejected" line sends the unauthorized request for real and
checks the answer AND that nothing changed. "Staff keep access" and "ordinary
documents still work" lines prove the fix did not break the normal flow.
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




def stored_file(path):
    return psql(f"SELECT length(data_url) FROM app_storage WHERE path = '{path}'")


def b64(text):
    import base64
    return "data:application/pdf;base64," + base64.b64encode(text.encode()).decode()


def tables_leak(token, needle, tables):
    out = []
    for table in tables:
        status, data = call("GET", f"/__local_db?table={table}", token)
        if status == 200 and needle in json.dumps(data):
            out.append(table)
    return out


print(f"Fly Masters - verifying staff-only document authorization against {BASE}")
run = uuid.uuid4().hex[:6]
admin_id, admin = staff(f"admin-{run}@mg3.test", "super_admin")
counselor_id, counselor = counselor_account(f"couns-{run}@mg3.test", admin)
email_a, email_b = f"asha-{run}@mg3.test", f"ben-{run}@mg3.test"
stu_a, tok_a = student(email_a)
stu_b, tok_b = student(email_b)
assign(stu_a, counselor_id, email_a, ["Canada"])
assign(stu_b, counselor_id, email_b, ["Canada"])
check("fixtures: admin, counselor, two students", all([admin, counselor, tok_a, tok_b]))

N_STAFF, N_VIS, N_SHARED = f"Fict StaffOnly {run}", f"Fict Visible {run}", f"Fict Shared {run}"
status, r = setup_doc(counselor, name=N_STAFF, is_required=True, staff_only=True, student_ids=[stu_a])
staff_id = r["document"]["id"] if status == 200 else None
status, r = setup_doc(counselor, name=N_VIS, is_required=True, staff_only=False, student_ids=[stu_a])
vis_id = r["document"]["id"] if status == 200 else None
# the same name: staff-only for A, an ordinary document for B
status, r = setup_doc(counselor, name=N_SHARED, is_required=False, staff_only=True, student_ids=[stu_a])
shared_staff = r["document"]["id"] if status == 200 else None
status, r = setup_doc(counselor, name=N_SHARED, is_required=False, staff_only=False, student_ids=[stu_b])
shared_vis = r["document"]["id"] if status == 200 else None
check("fixtures: a staff-only, a visible, and a same-name pair (staff-only for A, visible for B)", all([staff_id, vis_id, shared_staff, shared_vis]))

print("\n### 1. Blanket upload permission never overrides staff-only")
status, resp = call("PUT", f"/api/counselor/document-setup/students/{stu_a}/document-upload-authorization", counselor, {"enabled": True})
check("(setup) counselor enables uploads for ALL documents for student A", status == 200, f"{status} {resp}")
stage, status, body, doc_id, _ = try_upload(tok_a, stu_a, N_STAFF)
check("A cannot file a document of the staff-only type, even with blanket permission", stage != "ok" and status == 403, f"{stage} {status} {body}")
check("...and no record was created", not [r for r in psql(f"SELECT id FROM app_records WHERE table_name='documents' AND data->>'document_type'='{N_STAFF}'").split("\n") if r])
stage, status, body, _, _ = try_upload(tok_a, stu_a, N_STAFF.upper())
check("a different letter case of the name is rejected too", stage != "ok" and status == 403, f"{stage} {status}")
status, body = call("POST", "/__local_db", tok_a, {"action": "insert", "table": "documents", "rows": [{
    "id": str(uuid.uuid4()), "user_id": stu_a, "document_type": f"  {N_STAFF}  ", "file_name": "x.pdf", "status": "uploaded"}]})
check("...and so is the name padded with spaces", status == 403, f"{status} {body}")
stage, status, body, ord_id, _ = try_upload(tok_a, stu_a, N_VIS)
check("ordinary visible document: A can still upload it (blanket permission)", stage == "ok", f"{stage} {status} {body}")
stage, status, body, free_id, _ = try_upload(tok_a, stu_a, f"Fict Free Text {run}")
check("a document type that is on no list can still be uploaded under blanket permission (unchanged behaviour)", stage == "ok", f"{stage} {status} {body}")
call("PUT", f"/api/counselor/document-setup/students/{stu_a}/document-upload-authorization", counselor, {"enabled": True, "document_types": [N_STAFF, N_VIS]})
stage, status, body, _, _ = try_upload(tok_a, stu_a, N_STAFF)
check("'selected documents' permission that even lists the staff-only type does not allow it", stage != "ok" and status == 403, f"{stage} {status} {body}")
call("PUT", f"/api/counselor/document-setup/students/{stu_a}/document-upload-authorization", counselor, {"enabled": True})
# relabel an existing ordinary document into the staff-only type
status, body = call("POST", "/__local_db", tok_a, {"action": "update", "table": "documents", "payload": {"document_type": N_STAFF}, "filters": [{"column": "id", "op": "eq", "value": ord_id}]})
check("A cannot relabel an ordinary document into the staff-only type", status == 403 and psql(f"SELECT data->>'document_type' FROM app_records WHERE table_name='documents' AND id='{ord_id}'") == N_VIS, f"{status} {body}")
stage_a, status_a, body_a, _, _ = try_upload(tok_a, stu_a, N_SHARED)
stage_b, status_b, body_b, _, _ = try_upload(tok_b, stu_b, N_SHARED)
check("same name: staff-only for A -> A is rejected", stage_a != "ok" and status_a == 403, f"{stage_a} {status_a}")
check("same name: ordinary for B -> B can still upload it", stage_b == "ok", f"{stage_b} {status_b} {body_b}")
call("PUT", f"/api/counselor/document-setup/students/{stu_a}/document-upload-authorization", counselor, {"enabled": False})

print("\n### 2. The counselor document-request route rejects staff-only types")
before = psql("SELECT count(*) FROM app_records WHERE table_name='document_requests'")
status, resp = call("POST", f"/api/counselor/students/{stu_a}/document-requests", counselor, {"document_type": N_STAFF})
check("request for a staff-only type is rejected (4xx)", 400 <= status < 500, f"{status} {resp}")
check("...no request row was created", psql("SELECT count(*) FROM app_records WHERE table_name='document_requests'") == before)
status, resp = call("POST", f"/api/counselor/students/{stu_a}/document-requests", counselor, {"document_type": N_STAFF.lower()})
check("...in any letter case", 400 <= status < 500, f"{status}")
status, resp = call("POST", f"/api/counselor/students/{stu_a}/document-requests", counselor, {"document_types": [N_VIS + " other", N_STAFF]})
check("...also when it is hidden inside a list of types, and none of the list is created", 400 <= status < 500 and psql("SELECT count(*) FROM app_records WHERE table_name='document_requests'") == before, f"{status} {resp}")
status, resp = call("POST", f"/api/counselor/students/{stu_a}/document-requests", counselor, {"document_type": N_VIS})
check("ordinary document: the counselor can still request it", status in (200, 400) and (status == 200 or "already" in str(resp)), f"{status} {resp}")
status, resp = call("POST", f"/api/counselor/students/{stu_b}/document-requests", counselor, {"document_type": N_SHARED})
check("same name, ordinary for B: the counselor can request it from B", status in (200, 400) and (status == 200 or "already" in str(resp)), f"{status} {resp}")
status, resp = call("POST", f"/api/counselor/students/{stu_a}/document-requests", counselor, {"document_type": N_SHARED})
check("same name, staff-only for A: request to A is rejected", 400 <= status < 500, f"{status} {resp}")
status, resp = call("POST", f"/api/counselor/students/{stu_a}/document-requests", tok_a, {"document_type": N_VIS})
check("a student cannot use the counselor request route", status in (401, 403), f"{status}")

print("\n### 3. Requests that already exist, or that a student writes, do not open a loophole")
req_id = "req-staff-" + run
psql("INSERT INTO app_records (table_name,id,data) VALUES ('document_requests','" + req_id + "','" + json.dumps({"id": req_id, "student_id": stu_a, "document_type": N_STAFF, "status": "pending", "is_mandatory": True}) + "'::jsonb);")
check("a pre-existing request for the staff-only type is not returned to the student", not [r for r in rows(tok_a, "document_requests")[1] if r.get("document_type") == N_STAFF])
stage, status, body, _, _ = try_upload(tok_a, stu_a, N_STAFF)
check("...and uploading against it is rejected (no authorization needed to see that)", stage != "ok" and status == 403, f"{stage} {status} {body}")
status, body = call("POST", "/__local_db", tok_a, {"action": "insert", "table": "document_requests", "rows": [{
    "id": "req-self-" + run, "student_id": stu_a, "document_type": f"Fict Self Requested {run}", "status": "pending"}]})
self_ok = status == 200
check("a student cannot write their own document request", not self_ok, f"{status} {body}")
stage, status, body, _, _ = try_upload(tok_a, stu_a, f"Fict Self Requested {run}")
check("...so a self-made request cannot open uploads for a type nobody authorized", stage != "ok", f"{stage} {status}")
status, body = call("POST", "/__local_db", tok_a, {"action": "update", "table": "document_requests", "payload": {"status": "approved"}, "filters": [{"column": "id", "op": "eq", "value": req_id}]})
check("a student cannot edit/close the staff-only request by its id", status == 403 and psql(f"SELECT data->>'status' FROM app_records WHERE table_name='document_requests' AND id='{req_id}'") == "pending", f"{status} {body}")
status, body = call("POST", "/__local_db", tok_a, {"action": "delete", "table": "document_requests", "filters": [{"column": "id", "op": "eq", "value": req_id}]})
check("...or delete it by its id", status == 403 and psql(f"SELECT count(*) FROM app_records WHERE table_name='document_requests' AND id='{req_id}'") == "1", f"{status} {body}")

print("\n### 4. Existing staff-only records and files stay hidden from students")
doc_id_s, ver_id_s = "doc-staff-" + run, "ver-staff-" + run
staff_path = f"{stu_a}/staffonly-{run}.pdf"
guess_path = f"{stu_a}/staffonly-{run}-v2.pdf"
psql("INSERT INTO app_storage (path, data_url) VALUES ('" + staff_path + "','" + b64("fictional staff-only file") + "'), ('" + guess_path + "','" + b64("fictional staff-only file v2") + "');")
psql("INSERT INTO app_records (table_name,id,data) VALUES ('documents','" + doc_id_s + "','" + json.dumps({"id": doc_id_s, "user_id": stu_a, "document_type": N_STAFF, "file_name": "staffonly.pdf", "file_path": staff_path, "status": "uploaded", "archived": False}) + "'::jsonb),"
     "('document_versions','" + ver_id_s + "','" + json.dumps({"id": ver_id_s, "user_id": stu_a, "document_id": doc_id_s, "document_type": N_STAFF, "file_name": "staffonly-v2.pdf", "file_path": guess_path, "version_number": 2}) + "'::jsonb);")
for table in ("documents", "document_versions", "document_requests"):
    check(f"/__local_db?table={table}: the student gets no staff-only record", not tables_leak(tok_a, N_STAFF, [table]), f"{table}")
check("...nor in any other table the student can read", not tables_leak(tok_a, N_STAFF, ["student_document_progress", "student_checklists", "document_notifications", "document_audit_logs", "document_checklists", "notifications"]))
check("student B sees none of A's records either", not tables_leak(tok_b, N_STAFF, ["documents", "document_versions", "document_requests", "document_checklists"]))
status, data = call("GET", f"/__local_db?table=documents&id={doc_id_s}", tok_a)
check("asking for the record by its id returns nothing", N_STAFF not in json.dumps(data) and doc_id_s not in json.dumps(data), f"{status}")
for label, mutation in (
    ("update its status to approved", {"action": "update", "table": "documents", "payload": {"status": "approved"}, "filters": [{"column": "id", "op": "eq", "value": doc_id_s}]}),
    ("delete it by its id", {"action": "delete", "table": "documents", "filters": [{"column": "id", "op": "eq", "value": doc_id_s}]}),
    ("overwrite it with an upsert", {"action": "upsert", "table": "documents", "rows": [{"id": doc_id_s, "user_id": stu_a, "document_type": N_VIS, "file_name": "x.pdf", "status": "uploaded"}]}),
    ("delete its version row", {"action": "delete", "table": "document_versions", "filters": [{"column": "id", "op": "eq", "value": ver_id_s}]}),
):
    status, body = call("POST", "/__local_db", tok_a, mutation)
    check(f"student cannot {label}", status == 403, f"{status} {body}")
now_doc = psql(f"SELECT data->>'status' || '|' || (data->>'document_type') FROM app_records WHERE table_name='documents' AND id='{doc_id_s}'")
now_ver = psql(f"SELECT count(*) FROM app_records WHERE table_name='document_versions' AND id='{ver_id_s}'")
check("...and the staff-only record is unchanged", now_doc == "uploaded|" + N_STAFF and now_ver == "1", f"doc={now_doc!r} versions={now_ver!r}")

print("\n--- raw files")
status, _ = call("GET", f"/__storage?path={urllib.parse.quote(staff_path)}", tok_a)
check("A cannot read the staff-only file by its path (it is in A's own folder)", status == 403, f"HTTP {status}")
status, _ = call("GET", f"/__storage?path={urllib.parse.quote(guess_path)}", tok_a)
check("A cannot read the staff-only version file by guessing its path", status == 403, f"HTTP {status}")
status, _ = call("GET", f"/__storage?path={urllib.parse.quote(staff_path)}", tok_b)
check("B cannot read it either", status in (401, 403), f"HTTP {status}")
status, data = call("GET", "/__storage?action=list&prefix=", tok_a)
listed = json.dumps(data)
check("the file listing of A's folder does not show the staff-only files", staff_path not in listed and guess_path not in listed, listed[:200])
status, body = call("PUT", f"/__storage?path={urllib.parse.quote(staff_path)}", tok_a, raw=b"%PDF-1.4 overwritten by student", content_type="application/pdf")
check("A cannot overwrite the staff-only file", status == 403 and psql(f"SELECT data_url FROM app_storage WHERE path='{staff_path}'") == b64("fictional staff-only file"), f"{status} {body}")
status, body = call("DELETE", "/__storage", tok_a, {"paths": [staff_path]})
check("A cannot delete the staff-only file", status == 403 and stored_file(staff_path) != "", f"{status} {body}")
status, body = call("POST", "/__local_db", tok_a, {"action": "insert", "table": "documents", "rows": [{
    "id": str(uuid.uuid4()), "user_id": stu_a, "document_type": N_VIS, "file_name": "x.pdf", "file_path": staff_path, "status": "uploaded"}]})
check("A cannot attach the staff-only file to a new ordinary document", status == 403, f"{status} {body}")
status, body = call("POST", "/__local_db", tok_a, {"action": "update", "table": "documents", "payload": {"file_path": staff_path}, "filters": [{"column": "id", "op": "eq", "value": ord_id}]})
check("A cannot re-point an ordinary document at the staff-only file", status == 403, f"{status} {body}")
# a file the student places in their own folder is theirs: still readable, still harmless
own_path = f"{stu_a}/own-{run}.pdf"
status, body = call("PUT", f"/__storage?path={urllib.parse.quote(own_path)}", tok_a, raw=b"%PDF-1.4 student file", content_type="application/pdf")
status_read, _ = call("GET", f"/__storage?path={urllib.parse.quote(own_path)}", tok_a)
check("(control) a file the student puts in their own folder is still theirs to read", status == 200 and status_read == 200, f"{status} {status_read}")
status, _ = call("GET", f"/__storage?path={urllib.parse.quote(stu_b + '/anything.pdf')}", tok_a)
check("(control) A still cannot read B's folder", status == 403, f"{status}")

print("\n--- staff keep access")
status, resp = call("GET", f"/api/counselor/documents/{doc_id_s}/file", counselor)
check("the assigned counselor can still open the staff-only file", status == 200 and resp.get("dataUrl") == b64("fictional staff-only file"), f"{status}")
status, resp = call("GET", f"/api/documents/{doc_id_s}/file", admin)
check("admin can still open it", status == 200 and resp.get("dataUrl"), f"{status}")
status, resp = call("PATCH", f"/api/counselor/documents/{doc_id_s}", counselor, {"status": "approved", "comments": "ok"})
check("the counselor can still review (approve) it", status == 200 and psql(f"SELECT data->>'status' FROM app_records WHERE table_name='documents' AND id='{doc_id_s}'") == "approved", f"{status} {resp}")
check("...without telling the student about a staff-only document", not tables_leak(tok_a, N_STAFF, ["notifications", "document_notifications"]))
check("Document Setup still lists it for counselor and admin with staff_only set", listing(counselor).get(staff_id, {}).get("staff_only") is True and listing(admin, "/api/document-setup").get(staff_id, {}).get("staff_only") is True)

print("\n--- ordinary visible documents still work end to end")
check("A sees the ordinary document they uploaded", [r for r in rows(tok_a, "documents")[1] if r.get("id") == ord_id])
path_vis = psql(f"SELECT data->>'file_path' FROM app_records WHERE table_name='documents' AND id='{ord_id}'")
status, _ = call("GET", f"/__storage?path={urllib.parse.quote(path_vis)}", tok_a)
check("A can read their ordinary file back", status == 200, f"{status}")
status, _ = call("PATCH", f"/api/counselor/documents/{ord_id}", counselor, {"status": "approved"})
note_rows = rows(tok_a, "document_notifications")[1]
check("the counselor's approval of an ordinary document still reaches the student", status == 200 and any(N_VIS in json.dumps(r) for r in note_rows), f"{status}")
check("A's checklist still lists the visible document and not the staff-only one", [r for r in student_checklist(tok_a) if r.get("id") == vis_id] and not has(student_checklist(tok_a), staff_id, N_STAFF))
status, cl = call("GET", f"/api/counselor/students/{stu_a}/checklist", counselor)
check("the counselor's per-student checklist still works", status == 200 and isinstance(cl.get("items"), list), f"{status}")

print(f"\n{PASSED} passed, {FAILED} failed")
sys.exit(1 if FAILED else 0)
