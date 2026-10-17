#!/usr/bin/env python3
"""
Proves that what a Super Admin configures actually reaches the student.

    python3 scripts/verify-student-checklist.py http://127.0.0.1:8791

Run against a FRESH test database — it creates a document, a checklist, a
lead and a student account. Needs psql on PATH for the one role change that
has no API.

This chain used to be broken: the 2.6 builder wrote to document_master and
checklist_templates, while the student portal still read the legacy
document_checklists list, so a Super Admin could configure all day and
students saw the same twelve seeded items. These checks are what stops that
happening again.
"""
import json
import subprocess
import sys
import urllib.error
import urllib.request

BASE = (sys.argv[1] if len(sys.argv) > 1 else "http://127.0.0.1:8791").rstrip("/")
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
        return error.code, error.read().decode()[:200]


def check(label, condition, detail=""):
    global PASSED, FAILED
    if condition:
        PASSED += 1
        print(f"PASS  {label}")
    else:
        FAILED += 1
        print(f"FAIL  {label}  {detail}")


def psql(sql):
    return subprocess.run(
        ["psql", "-h", "127.0.0.1", "-p", "5433", "-U", "flymaster", "-d", "flymaster", "-tAc", sql],
        capture_output=True, text=True,
    ).stdout.strip()


print(f"Fly Masters — verifying the configure-to-student chain against {BASE}")

status, data = call("POST", "/api/auth/signup",
                    body={"email": "dev@mg3.test", "password": "testpass123",
                          "firstName": "Dev", "lastName": "MG3"})
if status == 200:
    psql(f"UPDATE user_roles SET role='super_admin' WHERE user_id='{data['user']['id']}';")
admin = call("POST", "/api/auth/signin",
             body={"email": "dev@mg3.test", "password": "testpass123"})[1].get("token", "")
if not admin:
    sys.exit("Could not sign in as admin. Fresh database, server running?")

print("\n### Super Admin configures")
status, doc = call("POST", "/api/config/documents", admin,
                   {"name": "Bank Statement", "accepted_formats": ["pdf"], "max_size_mb": 5,
                    "sample_instructions": "Last six months, stamped by the bank."})
check("document master created", status == 200, doc)
status, template = call("POST", "/api/config/checklists", admin,
                        {"name": "Ireland — Masters", "country": "Ireland", "course_level": "Masters"})
check("checklist draft created", status == 200, template)
status, _ = call("PUT", f"/api/config/checklists/version/{template['id']}/items", admin,
                 {"items": [{"document_master_id": doc["id"], "requirement": "mandatory"}]})
check("document added to the draft", status == 200)
status, live = call("POST", f"/api/config/checklists/version/{template['id']}/publish", admin, {})
check("checklist published", status == 200 and live["status"] == "active", live)

print("\n### A student signs up in the portal")
status, session = call("POST", "/__auth",
                       body={"action": "signup", "email": "chain-probe@test.in",
                             "password": "testpass123",
                             "user_metadata": {"first_name": "Probe", "last_name": "Student"}})
if status != 200:
    status, session = call("POST", "/__auth",
                           body={"action": "signin", "email": "chain-probe@test.in",
                                 "password": "testpass123"})
student = session["session"]["access_token"]
check("student signed in", bool(student))

status, view = call("GET", "/api/student/checklists", student)
check("with nothing activated, the student is told so plainly",
      status == 200 and view["activated"] is False, view)

print("\n### Counsellor activates it for them")
status, lead = call("POST", "/api/leads", admin,
                    {"email": "chain-probe@test.in", "phone": "9000000099",
                     "firstName": "Probe", "lastName": "Student", "countries": "Ireland"})
check("lead created for the student", status == 200, lead)
status, activation = call("POST", f"/api/students/{lead['id']}/checklists", admin,
                          {"family_id": live["family_id"]})
check("checklist activated", status == 200, activation)

print("\n### The student sees exactly what was configured")
status, view = call("GET", "/api/student/checklists", student)
check("the student's view says activated", status == 200 and view["activated"] is True, view)
items = [item for row in view.get("checklists", []) for item in row["items"]]
check("they see the configured document",
      any(item["document_type"] == "Bank Statement" for item in items),
      [item["document_type"] for item in items])
check("and not the legacy seeded list", len(items) <= 3, len(items))
check("the version they were pinned to is shown",
      all(row["version"] >= 1 for row in view["checklists"]), view["checklists"])
check("the upload instructions reach them",
      any("stamped by the bank" in (item.get("sample_instructions") or "") for item in items), items)

print("\n### The counsellor's words reach the student")
target = items[0]["id"]
status, _ = call("PATCH", f"/api/student-checklist-items/{target}", admin,
                 {"status_code": "resubmit", "rejection_reason": "The scan is cropped.",
                  "next_step_note": "Re-upload both pages by Friday."})
check("counsellor sent it back", status == 200)
status, view = call("GET", "/api/student/checklists", student)
item = [i for row in view["checklists"] for i in row["items"] if i["id"] == target][0]
check("student sees the status", item["status"] == "resubmit", item["status"])
check("student sees why", "cropped" in item["rejection_reason"], item["rejection_reason"])
check("student sees what to do next", "Friday" in item["next_step_note"], item["next_step_note"])

print("\n### And cannot see anyone else's")
status, other = call("POST", "/__auth",
                     body={"action": "signup", "email": "chain-other@test.in",
                           "password": "testpass123", "user_metadata": {}})
if status != 200:
    status, other = call("POST", "/__auth",
                         body={"action": "signin", "email": "chain-other@test.in",
                               "password": "testpass123"})
other_token = other["session"]["access_token"]
status, view = call("GET", "/api/student/checklists", other_token)
names = [i["document_type"] for row in view.get("checklists", []) for i in row["items"]]
check("a second student sees none of the first one's items",
      "Bank Statement" not in names, names)
status, view = call("GET", "/api/student/checklists", admin)
check("a staff token is refused on the student view", status == 403, (status, view))

print(f"\n{PASSED} passed, {FAILED} failed")
sys.exit(1 if FAILED else 0)
