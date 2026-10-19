#!/usr/bin/env python3
"""
Proves the document-upload authorization against a running server and a FRESH
test database (never a shared or production one):

    PSQL_URL=postgres://user:pw@127.0.0.1:5432/testdb \
      python3 scripts/verify-document-authorization.py http://127.0.0.1:8921

A brand-new student can upload nothing. The counselor assigned to the student
enables uploads (all applicable, or chosen documents). Approving the
country-wise common documents is a separate switch and does not grant uploads.
Everything is checked through the real HTTP routes, i.e. enforced on the
server, not only on the page.
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

print(f"Fly Masters - verifying document-upload authorization against {BASE}")
run = uuid.uuid4().hex[:6]
admin_id, admin = staff(f"admin-{run}@mg3.test", "super_admin")
counselor_id, counselor = counselor_account(f"couns-{run}@mg3.test", admin)
other_id, other_counselor = counselor_account(f"couns2-{run}@mg3.test", admin)
email_a, email_b = f"fresh-{run}@mg3.test", f"other-{run}@mg3.test"
stu_a, tok_a = student(email_a)
stu_b, tok_b = student(email_b)
lead_a = assign(stu_a, counselor_id, email_a, ["Canada"])
assign(stu_b, counselor_id, email_b, ["Canada"])
checklist_item(f"dc-pass-{run}", "Passport", ["All"])
checklist_item(f"dc-canada-{run}", "Canada study permit form", ["Canada"])
check("fixtures: admin, two counselors, two students (fresh, nothing uploaded)", all([admin, counselor, other_counselor, tok_a, tok_b]))

print("\n### A new student has no upload permission")
status, auth_rows = rows(tok_a, "student_document_upload_authorizations")
check("no authorization row exists for the new student", status == 200 and auth_rows == [], f"{status} {auth_rows}")
status, docs = rows(tok_a, "documents")
check("the new student has no documents", status == 200 and docs == [])
stage, status, body, _ = try_upload(tok_a, stu_a, "Passport")
check("file upload is refused before authorization", stage == "storage" and status == 403, f"{stage} {status} {body}")
status, body = call("POST", "/__local_db", tok_a, {"action": "insert", "table": "documents", "rows": [{
    "id": str(uuid.uuid4()), "user_id": stu_a, "document_type": "Passport", "file_name": "x.pdf", "file_path": f"{stu_a}/x.pdf", "status": "uploaded"}]})
check("a document row cannot be written before authorization", status == 403, f"{status} {body}")
status, body = call("POST", "/__local_db", tok_a, {"action": "insert", "table": "documents", "rows": [{
    "id": str(uuid.uuid4()), "user_id": stu_a, "document_type": "Passport", "file_name": "x.pdf", "status": "approved"}]})
check("a student cannot insert a pre-approved document either", status in (400, 403), f"{status} {body}")
status, body = call("POST", "/__local_db", tok_a, {"action": "insert", "table": "student_document_upload_authorizations", "rows": [{
    "id": str(uuid.uuid4()), "student_id": stu_a, "enabled": True, "scope": "all"}]})
check("a student cannot authorize themselves", status in (400, 403), f"{status} {body}")
status, body = call("PUT", f"/api/counselor/document-setup/students/{stu_a}/document-upload-authorization", tok_a, {"enabled": True})
check("a student cannot call the counselor authorization route", status in (401, 403), f"{status}")

print("\n### The counselor reviews and authorizes")
status, state = call("GET", f"/api/counselor/document-setup/students/{stu_a}/document-upload-authorization", counselor)
check("counselor sees: not enabled", status == 200 and state.get("enabled") is False, f"{status} {state}")
status, resp = call("PUT", f"/api/counselor/document-setup/students/{stu_a}/document-upload-authorization", other_counselor, {"enabled": True})
check("an unassigned counselor cannot authorize this student", status == 403, f"{status} {resp}")
status, state = call("GET", f"/api/counselor/document-setup/students/{stu_a}/document-upload-authorization", counselor)
check("...and nothing changed", state.get("enabled") is False, f"{state}")

print("\n### Country-wise approval is a different switch")
status, resp = call("PUT", f"/api/counselor/document-setup/students/{stu_a}/country-documents-approval", counselor, {"enabled": True})
check("counselor approves country-wise common documents", status == 200 and resp.get("enabled") is True, f"{status} {resp}")
stage, status, body, _ = try_upload(tok_a, stu_a, "Passport")
check("approving country documents does NOT let the student upload", stage == "storage" and status == 403, f"{stage} {status} {body}")
status, auth_rows = rows(tok_a, "student_document_upload_authorizations")
check("still no upload authorization row", auth_rows == [], f"{auth_rows}")
call("PUT", f"/api/counselor/document-setup/students/{stu_a}/country-documents-approval", counselor, {"enabled": False})

print("\n### Authorize selected documents only")
status, resp = call("PUT", f"/api/counselor/document-setup/students/{stu_a}/document-upload-authorization", counselor, {"enabled": True, "document_types": ["Passport"]})
check("counselor enables uploads for Passport only", status == 200 and resp.get("scope") == "selected" and resp.get("document_types") == ["Passport"], f"{status} {resp}")
status, auth_rows = rows(tok_a, "student_document_upload_authorizations")
check("the student can read their own authorization", len(auth_rows) == 1 and auth_rows[0]["enabled"] is True and auth_rows[0]["scope"] == "selected", f"{auth_rows}")
status, others = rows(tok_b, "student_document_upload_authorizations")
check("another student cannot see it", status == 200 and others == [], f"{others}")
stage, status, body, passport_id = try_upload(tok_a, stu_a, "Passport")
check("Passport upload now works", stage == "ok", f"{stage} {status} {body}")
stage, status, body, _ = try_upload(tok_a, stu_a, "Bank statement")
check("a document that was not authorized is still refused", stage != "ok" and status == 403, f"{stage} {status} {body}")
status, docs = rows(tok_a, "documents")
check("exactly the authorized upload is saved, as 'uploaded'", len(docs) == 1 and docs[0]["document_type"] == "Passport" and docs[0]["status"] == "uploaded", f"{docs}")
status, body = call("POST", "/__local_db", tok_a, {"action": "update", "table": "documents", "payload": {"status": "approved"}, "filters": [{"column": "id", "op": "eq", "value": passport_id}]})
check("a student still cannot approve their own document", status in (400, 403), f"{status} {body}")
status, body = call("POST", "/__local_db", tok_a, {"action": "update", "table": "documents", "payload": {"document_type": "Bank statement"}, "filters": [{"column": "id", "op": "eq", "value": passport_id}]})
check("a document cannot be re-labelled into an unauthorized type", status in (400, 403), f"{status} {body}")
status, body = call("POST", "/__local_db", tok_b, {"action": "insert", "table": "documents", "rows": [{
    "id": str(uuid.uuid4()), "user_id": stu_a, "document_type": "Passport", "file_name": "x.pdf", "status": "uploaded"}]})
check("student B cannot add a document to student A", status in (400, 403), f"{status} {body}")
stage, status, body, _ = try_upload(tok_b, stu_b, "Passport")
check("student B (never authorized) is still refused", stage == "storage" and status == 403, f"{stage} {status} {body}")

print("\n### Authorize all applicable documents")
status, resp = call("PUT", f"/api/counselor/document-setup/students/{stu_a}/document-upload-authorization", counselor, {"enabled": True})
check("counselor enables uploads for all applicable documents", status == 200 and resp.get("scope") == "all", f"{status} {resp}")
stage, status, body, _ = try_upload(tok_a, stu_a, "Bank statement")
check("any document now uploads", stage == "ok", f"{stage} {status} {body}")
status, state = call("GET", f"/api/counselor/document-setup/students/{stu_a}/document-upload-authorization", counselor)
check("authorization persists when read again (refresh)", state.get("enabled") is True and state.get("scope") == "all", f"{state}")

print("\n### Country-wise common documents stay gated separately, even with uploads enabled")
status, items = rows(tok_a, "document_checklists")
types = [i["document_type"] for i in items]
check("Canada common document is hidden until country approval", "Canada study permit form" not in types and "Passport" in types, f"{types}")
stage, status, body, _ = try_upload(tok_a, stu_a, "Canada study permit form")
check("...and cannot be submitted until country approval", stage == "row" and status == 403, f"{stage} {status} {body}")
call("PUT", f"/api/counselor/document-setup/students/{stu_a}/country-documents-approval", counselor, {"enabled": True})
status, items = rows(tok_a, "document_checklists")
check("after country approval it appears", "Canada study permit form" in [i["document_type"] for i in items])
stage, status, body, _ = try_upload(tok_a, stu_a, "Canada study permit form")
check("...and can be submitted (uploads are enabled too)", stage == "ok", f"{stage} {status} {body}")

print("\n### Revoking")
status, resp = call("PUT", f"/api/counselor/document-setup/students/{stu_a}/document-upload-authorization", counselor, {"enabled": False})
check("counselor disables uploads", status == 200 and resp.get("enabled") is False, f"{status} {resp}")
stage, status, body, _ = try_upload(tok_a, stu_a, "Passport")
check("uploads are refused again", stage == "storage" and status == 403, f"{stage} {status} {body}")
status, body = call("POST", "/__local_db", tok_a, {"action": "delete", "table": "documents", "filters": [{"column": "id", "op": "eq", "value": passport_id}]})
check("deleting an existing document is refused too", status in (400, 403), f"{status} {body}")
status, docs = rows(tok_a, "documents")
check("documents already on file stay readable", len(docs) >= 1, f"{docs}")

print("\n### A document the counselor aimed at this student by name (patch 0014) or requested")
checklist_item(f"dc-named-{run}", "English test score", ["All"], student_ids=[stu_a, lead_a])
stage, status, body, _ = try_upload(tok_a, stu_a, "English test score")
check("a named-student document can be uploaded by that student", stage == "ok", f"{stage} {status} {body}")
stage, status, body, _ = try_upload(tok_a, stu_a, "Passport")
check("...but it does not open up everything else", stage != "ok" and status == 403, f"{stage} {status} {body}")
stage, status, body, _ = try_upload(tok_b, stu_b, "English test score")
check("...and it is not available to another student", stage == "storage" and status == 403, f"{stage} {status} {body}")

print(f"\n{PASSED} passed, {FAILED} failed")
sys.exit(1 if FAILED else 0)
