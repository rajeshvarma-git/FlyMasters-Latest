#!/usr/bin/env python3
"""
Proves the "Recommended by your counselor" flow against a running server and a
FRESH test database (never a shared or production one):

    PSQL_URL=postgres://user:pw@127.0.0.1:5432/testdb \
      python3 scripts/verify-shortlist-recommendations.py http://127.0.0.1:8921

A counselor recommends a catalogue programme to one student; it reaches only
that student, with the real university and programme behind it; the student's
consent is stored and survives a re-read; "Start Application" from the student
only asks the counselor and never creates an application; only the assigned
counselor starts one, once; and no other student can see or touch any of it.
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



import urllib.parse  # noqa: E402

print(f"Fly Masters - verifying recommended universities against {BASE}")
run = uuid.uuid4().hex[:6]
admin_id, admin = staff(f"admin-{run}@mg3.test", "super_admin")
counselor_id, counselor = counselor_account(f"couns-{run}@mg3.test", admin)
other_id, other_counselor = counselor_account(f"couns2-{run}@mg3.test", admin)
email_a, email_b = f"asha-{run}@mg3.test", f"ben-{run}@mg3.test"
stu_a, tok_a = student(email_a)
stu_b, tok_b = student(email_b)
assign(stu_a, counselor_id, email_a, ["Canada"])
assign(stu_b, counselor_id, email_b, ["Canada"])

uni_id, prog_id, prog2_id = f"uni-fict-{run}", f"prog-fict-{run}", f"prog-fict2-{run}"
uni_name = f"Fictional University of Testing {run}"
psql("INSERT INTO app_records (table_name,id,data) VALUES "
     f"('universities','{uni_id}','{json.dumps({'id': uni_id, 'name': uni_name, 'country': 'Canada', 'city': 'Testville', 'state_province': 'Ontario', 'description': 'A fictional university for automated tests.', 'ranking': 77, 'website_url': 'https://example.com/fict', 'is_active': True})}'::jsonb),"
     f"('university_programs','{prog_id}','{json.dumps({'id': prog_id, 'university_id': uni_id, 'university_name': uni_name, 'program_name': 'MSc Fictional Data', 'country': 'Canada', 'degree': 'Masters', 'course': 'Data', 'specialization': 'Analytics', 'location': 'Testville, Ontario', 'city': 'Testville', 'region': 'Ontario', 'duration': '2 years', 'fee': 'CAD 20,000 per year', 'eligibility': 'Fictional eligibility text', 'deadline': '1 Feb 2027', 'is_active': True})}'::jsonb),"
     f"('university_programs','{prog2_id}','{json.dumps({'id': prog2_id, 'university_id': uni_id, 'university_name': uni_name, 'program_name': 'MBA Fictional', 'country': 'Canada', 'degree': 'Masters', 'is_active': True})}'::jsonb);")
check("fixtures: admin, two counselors, two students, a fictional catalogue university with two programmes", all([admin, counselor, other_counselor, tok_a, tok_b]))

print("\n### The counselor recommends a catalogue programme to student A")
status, rec = call("POST", "/api/counselor/shortlists", counselor, {
    "student_id": stu_a, "student_email": email_a, "university_name": uni_name, "course_name": "MSc Fictional Data · Data · Analytics",
    "location": "Testville, Ontario, Canada", "counselor_notes": "Great fit", "university_id": prog_id, "priority_level": "high"})
check("counselor recommends it", status == 200, f"{status} {rec}")
sl_id = (rec.get("shortlist") or {}).get("id")
status, mine_a = rows(tok_a, "university_shortlists")
row_a = next((r for r in mine_a if r.get("id") == sl_id), None)
check("it appears for student A, from the persisted record", row_a is not None and row_a.get("university_id") == prog_id and row_a.get("university_name") == uni_name, f"{mine_a}")
check("...as a recommendation: not consented, priority kept", row_a and not row_a.get("student_consent") and row_a.get("status") == "recommended" and row_a.get("priority_level") == "high", f"{row_a}")
status, mine_b = rows(tok_b, "university_shortlists")
check("student B does not see it", status == 200 and not any(r.get("id") == sl_id for r in mine_b), f"{mine_b}")
status, apps = rows(tok_a, "applications")
check("a recommendation creates no application", status == 200 and apps == [], f"{apps}")

print("\n### The real university and programme behind it")
status, det = call("GET", "/api/case/me/shortlist-details", tok_a)
d = (det.get("details") or {}).get(sl_id) if isinstance(det, dict) else None
check("details resolve the catalogue programme by id", status == 200 and d and d["matched_by"] == "id" and d["program"]["program_name"] == "MSc Fictional Data", f"{status} {det}")
check("...and the university (description, ranking, location)", d and d["university"]["name"] == uni_name and d["university"].get("description") and d["university"].get("ranking") == 77 and d["university"].get("city") == "Testville", f"{d}")
check("...with the programme's own fee, duration, eligibility and deadline", d and d["program"].get("fee") == "CAD 20,000 per year" and d["program"].get("duration") == "2 years" and d["program"].get("eligibility") and d["program"].get("deadline"), f"{d}")
check("...and the other programmes at the same university", d and {p["id"] for p in d["programs"]} == {prog_id, prog2_id}, f"{d and d['programs']}")
status, det_b = call("GET", "/api/case/me/shortlist-details", tok_b)
check("student B's details contain nothing of student A's", status == 200 and det_b.get("details") == {}, f"{det_b}")
status, det_anon = call("GET", "/api/case/me/shortlist-details")
check("details need a signed-in student", status in (401, 403), f"{status}")
status, det_staff = call("GET", "/api/case/me/shortlist-details", counselor)
check("a counselor token is not a student", status in (401, 403), f"{status}")

print("\n### Entries that cannot be resolved are never invented")
status, legacy = call("POST", "/api/counselor/shortlists", counselor, {
    "student_id": stu_a, "student_email": email_a, "university_name": uni_name, "course_name": "MBA Fictional", "location": "Testville, Canada"})
legacy_id = (legacy.get("shortlist") or {}).get("id")
status, det = call("GET", "/api/case/me/shortlist-details", tok_a)
dl = det["details"].get(legacy_id)
check("no university_id: matched by exact university name and programme", dl and dl["matched_by"] == "name" and dl["program"]["program_name"] == "MBA Fictional" and dl["university"]["name"] == uni_name, f"{dl}")
status, ghost = call("POST", "/api/counselor/shortlists", counselor, {
    "student_id": stu_a, "student_email": email_a, "university_name": "Nonexistent Academy of Nowhere", "course_name": "BSc Imaginary", "location": "Nowhere"})
ghost_id = (ghost.get("shortlist") or {}).get("id")
status, det = call("GET", "/api/case/me/shortlist-details", tok_a)
dg = det["details"].get(ghost_id)
check("a university that is not in the catalogue returns no university or programme", dg and dg["university"] is None and dg["program"] is None and dg["programs"] == [], f"{dg}")

print("\n### Consent, and Start Application, are not an application")
status, resp = call("POST", f"/api/case/me/shortlists/{sl_id}/request-application", tok_a, {})
check("asking to start before consent is refused with an explanation", status == 409 and "consent" in json.dumps(resp).lower(), f"{status} {resp}")
status, resp = call("POST", f"/api/case/me/shortlists/{sl_id}/decision", tok_b, {"decision": "accept"})
check("student B cannot give consent for student A's recommendation", status == 404, f"{status} {resp}")
status, resp = call("POST", f"/api/case/me/shortlists/{sl_id}/request-application", tok_b, {})
check("student B cannot ask for A's application", status == 404, f"{status} {resp}")
status, resp = call("POST", f"/api/counselor/shortlists/{sl_id}/start-application", counselor, {})
check("the counselor cannot start before the student has consented", status == 409, f"{status} {resp}")

status, resp = call("POST", f"/api/case/me/shortlists/{sl_id}/decision", tok_a, {"decision": "accept"})
check("student A gives consent", status == 200 and resp["shortlist"]["student_consent"] is True and resp["shortlist"]["status"] == "consented", f"{status} {resp}")
status, mine_a = rows(tok_a, "university_shortlists")
row_a = next((r for r in mine_a if r.get("id") == sl_id), {})
check("consent and its date are stored and survive a re-read", row_a.get("student_consent") is True and row_a.get("student_consent_date") and row_a.get("status") == "consented", f"{row_a}")
status, mine_b = rows(tok_b, "university_shortlists")
check("student B cannot see A's consent record", not any(r.get("id") == sl_id for r in mine_b))
status, apps = rows(tok_a, "applications")
check("giving consent creates no application", apps == [], f"{apps}")
status, resp = call("POST", "/api/case/me/applications", tok_a, {"university_id": prog_id, "university_name": uni_name, "course_name": "x"})
check("a student cannot create an application", status == 403, f"{status} {resp}")
status, resp = call("POST", "/__local_db", tok_a, {"action": "insert", "table": "applications", "rows": [{"user_id": stu_a, "university_name": uni_name, "status": "in_progress"}]})
check("...nor write one directly", status in (400, 401, 403), f"{status} {resp}")
status, resp = call("POST", "/__local_db", tok_a, {"action": "update", "table": "university_shortlists", "payload": {"status": "applied", "application_start_requested_at": "2026-01-01"}, "filters": [{"column": "id", "op": "eq", "value": sl_id}]})
check("...nor edit the shortlist row directly", status in (400, 401, 403), f"{status} {resp}")

status, resp = call("POST", f"/api/case/me/shortlists/{sl_id}/request-application", tok_a, {})
check("after consent, Start Application asks the counselor", status == 200 and resp["shortlist"].get("application_start_requested_at"), f"{status} {resp}")
status, again = call("POST", f"/api/case/me/shortlists/{sl_id}/request-application", tok_a, {})
check("asking twice is harmless", status == 200 and again.get("already") is True, f"{status} {again}")
notes = psql(f"SELECT count(*) FROM app_records WHERE table_name='notifications' AND data->>'user_id'='{counselor_id}' AND data->>'title'='Student asked to start an application'")
check("the assigned counselor was told exactly once", notes == "1", f"count={notes}")
status, apps = rows(tok_a, "applications")
check("asking still creates no application", apps == [], f"{apps}")

print("\n### Only the assigned counselor starts it, once")
status, resp = call("POST", f"/api/counselor/shortlists/{sl_id}/start-application", other_counselor, {})
check("an unassigned counselor cannot start it", status == 403, f"{status} {resp}")
status, resp = call("POST", f"/api/counselor/shortlists/{sl_id}/start-application", counselor, {"intake_term": "Fall 2027"})
app_id = (resp.get("application") or {}).get("id")
check("the assigned counselor starts the application", status == 200 and (resp.get("application") or {}).get("status") == "in_progress", f"{status} {resp}")
status, resp = call("POST", f"/api/counselor/shortlists/{sl_id}/start-application", counselor, {})
check("starting again reuses it: no duplicate", status == 200 and resp.get("already") is True and resp["application"]["id"] == app_id, f"{status} {resp}")
status, apps = rows(tok_a, "applications")
check("student A has exactly one application, in progress, not submitted", len(apps) == 1 and apps[0]["status"] == "in_progress" and not apps[0].get("submitted_at"), f"{apps}")
status, apps_b = rows(tok_b, "applications")
check("student B sees no application", apps_b == [], f"{apps_b}")
status, mine_a = rows(tok_a, "university_shortlists")
row_a = next((r for r in mine_a if r.get("id") == sl_id), {})
check("the shortlist now links to the real application and keeps consent", row_a.get("application_id") == app_id and row_a.get("status") == "applied" and row_a.get("student_consent") is True, f"{row_a}")
status, ev = rows(tok_a, "application_status_updates")
check("the journey timeline has its 'started' event for the student", any(e.get("application_id") == app_id and e.get("event_type") == "started" for e in ev), f"{ev}")
status, resp = call("POST", f"/api/case/me/shortlists/{sl_id}/request-application", tok_a, {})
check("once an application exists, Start Application is refused", status == 409, f"{status} {resp}")
status, resp = call("POST", f"/api/case/me/shortlists/{sl_id}/decision", tok_a, {"decision": "undo"})
check("consent cannot be withdrawn after the counselor started", status == 409, f"{status} {resp}")
status, det = call("GET", "/api/case/me/shortlist-details", tok_a)
check("the university details still resolve after the application exists", det["details"][sl_id]["university"]["name"] == uni_name)

print("\n### Withdrawing consent also withdraws the request")
status, other = call("POST", "/api/counselor/shortlists", counselor, {
    "student_id": stu_a, "student_email": email_a, "university_name": uni_name, "course_name": "MBA Fictional", "location": "Testville, Canada", "university_id": prog2_id})
o_id = (other.get("shortlist") or {}).get("id")
call("POST", f"/api/case/me/shortlists/{o_id}/decision", tok_a, {"decision": "accept"})
call("POST", f"/api/case/me/shortlists/{o_id}/request-application", tok_a, {})
status, resp = call("POST", f"/api/case/me/shortlists/{o_id}/decision", tok_a, {"decision": "undo"})
check("withdrawing consent clears consent and the request", status == 200 and resp["shortlist"]["student_consent"] is False and not resp["shortlist"].get("application_start_requested_at"), f"{status} {resp}")
status, resp = call("POST", f"/api/case/me/shortlists/{o_id}/request-application", tok_a, {})
check("...so Start Application needs consent again", status == 409, f"{status} {resp}")
status, resp = call("POST", f"/api/counselor/shortlists/{o_id}/start-application", counselor, {})
check("...and the counselor cannot start it", status == 409, f"{status} {resp}")

print(f"\n{PASSED} passed, {FAILED} failed")
sys.exit(1 if FAILED else 0)
