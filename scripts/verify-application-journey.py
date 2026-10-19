#!/usr/bin/env python3
"""
Proves the application journey against a running server and a FRESH test
database (never a shared or production one):

    PSQL_URL=postgres://user:pw@127.0.0.1:5432/testdb \
      python3 scripts/verify-application-journey.py http://127.0.0.1:8921

It creates a counselor, a student and an unrelated student, then walks the
whole life of an application through the real HTTP routes:

  saved / recommended is not an application -> only the counselor starts one ->
  internal approval is not a university submission -> a decision needs a
  recorded submission -> every step is an event the student can read, and
  nobody else can.
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


def call(method, path, token=None, body=None):
    request = urllib.request.Request(BASE + path, method=method)
    request.add_header("Content-Type", "application/json")
    if token:
        request.add_header("Authorization", "Bearer " + token)
    payload = json.dumps(body).encode() if body is not None else None
    try:
        with urllib.request.urlopen(request, payload, timeout=25) as response:
            return response.status, json.loads(response.read() or b"{}")
    except urllib.error.HTTPError as error:
        raw = error.read().decode()[:400]
        try:
            return error.code, json.loads(raw)
        except Exception:
            return error.code, raw


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


def student(email):
    status, data = call("POST", "/__auth", body={"action": "signup", "email": email, "password": "testpass123",
                                                   "user_metadata": {"first_name": "Stu", "last_name": email.split("@")[0]}})
    if status != 200:
        status, data = call("POST", "/__auth", body={"action": "signin", "email": email, "password": "testpass123"})
    session = data["session"]
    return session["user"]["id"], session["access_token"]


def local_db(token, table, filters=None):
    query = f"/__local_db?table={table}"
    status, data = call("GET", query, token)
    rows = data.get("rows") if isinstance(data, dict) else None
    return status, (rows if isinstance(rows, list) else [])


def assign(student_id, counselor_id, email):
    lead_id = "lead-" + uuid.uuid4().hex[:8]
    data = json.dumps({"user_id": student_id, "email": email, "first_name": "Stu", "last_name": "Dent",
                       "assigned_counselor_id": counselor_id, "entity_type": "student", "lead_status": "converted"})
    psql(f"INSERT INTO app_records (table_name, id, data) VALUES ('student_leads', '{lead_id}', '{data}'::jsonb) ON CONFLICT DO NOTHING;")


print(f"Fly Masters - verifying the application journey against {BASE}")
run = uuid.uuid4().hex[:6]
def counselor_account(email):
    """Counselors are created the way the admin portal creates them (uuid ids)."""
    branch = psql("SELECT id FROM branches ORDER BY created_at LIMIT 1")
    status, data = call("POST", "/api/users", admin, {"email": email, "password": "testpass123", "firstName": "Coun", "lastName": "Selor",
                                                       "role": "counselor", "branchIds": [branch]})
    user_id = (data.get("user") or data).get("id") if isinstance(data, dict) else None
    user_id = user_id or psql(f"SELECT id FROM auth_users WHERE email='{email}'")
    token = call("POST", "/api/auth/signin", body={"email": email, "password": "testpass123"})[1].get("token", "")
    return user_id, token


admin_id, admin = staff(f"admin-{run}@mg3.test", "super_admin")
counselor_id, counselor = counselor_account(f"couns-{run}@mg3.test")
other_id, other_counselor = counselor_account(f"couns2-{run}@mg3.test")
s1_email = f"stu1-{run}@mg3.test"
stu1, s1 = student(s1_email)
stu2, s2 = student(f"stu2-{run}@mg3.test")
assign(stu1, counselor_id, s1_email)
check("fixtures: counselor, second counselor, two students signed in", all([admin, counselor, other_counselor, s1, s2]))

print("\n### Saving or recommending is not an application")
status, rec = call("POST", "/api/counselor/shortlists", counselor, {
    "student_id": stu1, "student_email": s1_email, "university_name": "Test University of Recommendation",
    "course_name": "MSc Data Science", "location": "Leeds, United Kingdom", "counselor_notes": "Strong fit"})
check("counselor recommends a university", status in (200, 201), f"{status} {rec}")
shortlist_id = (rec.get("shortlist") or rec).get("id") if isinstance(rec, dict) else None
status, apps = local_db(s1, "applications")
check("a recommendation creates no application", status == 200 and len(apps) == 0, f"{status} {apps}")
status, pick = call("POST", "/api/case/me/shortlists", s1, {"university_name": "Student Pick University", "location": "Dublin, Ireland", "course_name": "MBA"})
check("student expresses interest (own pick)", status == 200, f"{status} {pick}")
status, apps = local_db(s1, "applications")
check("student interest creates no application", len(apps) == 0, f"{apps}")
status, resp = call("POST", "/api/case/me/applications", s1, {"university_id": "u1", "university_name": "Sneaky U", "course_name": "X"})
check("a student cannot start an application", status == 403, f"{status} {resp}")
status, resp = call("POST", "/__local_db", s1, {"action": "insert", "table": "applications", "rows": [{"user_id": stu1, "university_name": "Direct insert", "status": "submitted_to_university"}]})
check("a student cannot write an application row directly", status in (400, 401, 403), f"{status} {resp}")
status, resp = call("POST", f"/api/counselor/shortlists/{shortlist_id}/start-application", s1, {})
check("a student cannot use the counselor start route", status in (401, 403), f"{status}")
status, resp = call("POST", f"/api/counselor/shortlists/{shortlist_id}/start-application", counselor, {})
check("counselor cannot start before the student agrees", status == 409, f"{status} {resp}")

print("\n### Counselor starts the application")
call("POST", f"/api/case/me/shortlists/{shortlist_id}/decision", s1, {"decision": "accept"})
status, resp = call("POST", f"/api/counselor/shortlists/{shortlist_id}/start-application", other_counselor, {})
check("an unassigned counselor cannot start it", status == 403, f"{status} {resp}")
status, resp = call("POST", f"/api/counselor/shortlists/{shortlist_id}/start-application", counselor, {"intake_term": "Fall 2027"})
check("assigned counselor starts the application", status == 200 and resp.get("application", {}).get("status") == "in_progress", f"{status} {resp}")
app_id = resp.get("application", {}).get("id")
status, again = call("POST", f"/api/counselor/shortlists/{shortlist_id}/start-application", counselor, {})
check("starting twice reuses the same application", again.get("already") is True and again["application"]["id"] == app_id, f"{again}")
status, apps = local_db(s1, "applications")
check("the student sees exactly that one application", len(apps) == 1 and apps[0]["id"] == app_id, f"{apps}")
status, other_apps = local_db(s2, "applications")
check("another student sees none", status == 200 and len(other_apps) == 0)
status, state = call("GET", "/api/counselor/state", counselor)
check("the assigned counselor sees the same application", any(a["id"] == app_id for a in state.get("applications", [])), f"{status}")
status, ostate = call("GET", "/api/counselor/state", other_counselor)
check("an unassigned counselor does not", not any(a["id"] == app_id for a in ostate.get("applications", [])))
status, sl = local_db(s1, "university_shortlists")
linked = [r for r in sl if r.get("id") == shortlist_id]
check("the shortlist now points at the application", linked and linked[0].get("application_id") == app_id and linked[0].get("application_status") == "in_progress", f"{linked}")

print("\n### Internal approval is not a university submission")
status, resp = call("PATCH", f"/api/counselor/applications/{app_id}", s1, {"status": "submitted_to_university"})
check("a student cannot change the application status", status in (401, 403), f"{status}")
status, resp = call("PATCH", f"/api/counselor/applications/{app_id}", other_counselor, {"status": "submitted_to_university"})
check("an unassigned counselor cannot change it", status == 403, f"{status}")
status, resp = call("PATCH", f"/api/counselor/applications/{app_id}", counselor, {"status": "offer_received"})
check("an offer cannot be recorded before a submission", status == 409, f"{status} {resp}")
status, resp = call("PATCH", f"/api/counselor/applications/{app_id}", counselor, {"status": "counselor_approved", "comments": "Documents verified"})
check("counselor approves internally", status == 200 and resp["application"]["status"] == "counselor_approved", f"{status} {resp}")
check("approval does not stamp a submission", not resp["application"].get("submitted_at"), f"{resp['application']}")

print("\n### Recorded submission and university decision")
status, resp = call("PATCH", f"/api/counselor/applications/{app_id}", counselor, {"status": "submitted_to_university"})
check("counselor records the submission to the university", status == 200 and resp["application"].get("submitted_at"), f"{status} {resp}")
first_submitted = resp["application"].get("submitted_at")
status, resp = call("PATCH", f"/api/counselor/applications/{app_id}", counselor, {"status": "offer_received", "comments": "Conditional offer"})
check("then an offer can be recorded", status == 200 and resp["application"]["status"] == "offer_received", f"{status} {resp}")
check("the first submission time is kept", resp["application"].get("submitted_at") == first_submitted)

print("\n### The journey is stored and the right people read it")
status, events = local_db(s1, "application_status_updates")
mine = [e for e in events if e.get("application_id") == app_id]
order = [e.get("status") for e in sorted(mine, key=lambda e: e.get("updated_at", ""))]
check("the student reads the timeline in order", order == ["in_progress", "counselor_approved", "submitted_to_university", "offer_received"], f"{order}")
check("events record who and when", all(e.get("updated_by_role") == "counselor" and e.get("updated_at") for e in mine))
status, others = local_db(s2, "application_status_updates")
check("another student reads none of it", not [e for e in others if e.get("application_id") == app_id])
status, resp = call("POST", "/__local_db", s1, {"action": "insert", "table": "application_status_updates", "rows": [{"student_id": stu1, "application_id": app_id, "status": "enrolled"}]})
check("a student cannot write timeline events", status in (400, 401, 403), f"{status}")
# a staff-only note never reaches the student
psql(f"""INSERT INTO app_records (table_name, id, data) VALUES ('application_status_updates', 'hidden-{run}',
  '{{"application_id":"{app_id}","student_id":"{stu1}","status":"offer_received","notes":"internal only","is_visible_to_student":false,"updated_at":"2999-01-01T00:00:00Z"}}'::jsonb);""")
status, events = local_db(s1, "application_status_updates")
check("a staff-only entry is hidden from the student", not any(e.get("notes") == "internal only" for e in events))
status, cstate = call("GET", "/api/counselor/state", counselor)
check("the counselor reads the same events", len([e for e in cstate.get("application_events", []) if e.get("application_id") == app_id and e.get("is_visible_to_student") is not False]) == 4)
status, astate = call("GET", "/api/state", admin)
check("admin reads the same application and events", any(a["id"] == app_id for a in astate.get("applications", [])) and len([e for e in astate.get("applicationEvents", []) if e.get("application_id") == app_id]) >= 4, f"{status}")

print("\n### Reading other data does not wipe the shortlist-to-application link")
# The student portal reads student_leads next to the shortlists on every page; that read used to reset
# every shortlist (consent, decision, application link) to a blank "recommended" copy.
for _ in range(2):
    local_db(s1, "student_leads")
    local_db(s1, "notifications")
status, sl = local_db(s1, "university_shortlists")
linked = [r for r in sl if r.get("id") == shortlist_id]
check("after other reads the shortlist still holds consent and the application link",
      linked and linked[0].get("application_id") == app_id and linked[0].get("student_consent") is True
      and linked[0].get("application_status") == "offer_received", f"{linked}")
check("a refresh keeps every application and its events", len(local_db(s1, "applications")[1]) == 1
      and len([e for e in local_db(s1, "application_status_updates")[1] if e.get("application_id") == app_id]) == 4)

print("\n### Student withdrawal is limited to before submission")
status, resp = call("PATCH", f"/api/case/me/applications/{app_id}", s1, {"status": "withdrawn"})
check("a student cannot withdraw after the university has answered", status == 409, f"{status} {resp}")
status, pick2 = call("POST", "/api/case/me/shortlists", s1, {"university_name": "Second Pick University", "location": "Berlin, Germany", "course_name": "MSc"})
pick2_id = pick2["shortlist"]["id"]
status, started = call("POST", f"/api/counselor/shortlists/{pick2_id}/start-application", counselor, {})
second_id = started["application"]["id"]
status, resp = call("PATCH", f"/api/case/me/applications/{second_id}", s1, {"status": "withdrawn"})
check("a student can withdraw an application that is still being prepared", status == 200, f"{status} {resp}")
status, resp = call("PATCH", f"/api/case/me/applications/{second_id}", s1, {"status": "enrolled"})
check("a student cannot set any other status", status == 403, f"{status}")
status, events = local_db(s1, "application_status_updates")
check("the withdrawal is on the timeline", any(e.get("application_id") == second_id and e.get("status") == "withdrawn" and e.get("updated_by_role") == "student" for e in events))

print(f"\n{PASSED} passed, {FAILED} failed")
sys.exit(1 if FAILED else 0)
