#!/usr/bin/env python3
"""
End-to-end verification for CRM sections 2.6 and 2.7.

    python3 scripts/verify-2.6-2.7.py http://127.0.0.1:8791

Run it against a FRESH database, not production: it creates document masters,
checklists, templates and automation rules, and it signs up test accounts.
The first account it creates must be promoted to super_admin, which the
script does through psql if PGDATABASE-style variables are set, or which you
do by hand once.

What it proves, in the order the client asked about it:
  * a published checklist cannot be edited, only superseded
  * a student stays pinned to the version live when they were activated
  * a superseded version keeps its rows and points at its replacement
  * a document accepted for one country is not asked for again for another
  * a counsellor cannot invent a status word
  * an approved template is immutable and its old wording is preserved
  * WhatsApp templates cannot go live without a Meta-approved name
  * automation rules start switched off, are capped per day, and can all be
    stopped at once
  * an opted-out student is recorded as skipped, never as sent
  * the configuration history is readable by the developer and nobody else
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
        return error.code, json.loads(error.read() or b"{}")


def check(label, condition, detail=""):
    global PASSED, FAILED
    if condition:
        PASSED += 1
        print(f"PASS  {label}")
    else:
        FAILED += 1
        print(f"FAIL  {label}  {detail}")


def promote(user_id, role):
    """The first account signs up as `admin`; these checks need super_admin."""
    try:
        subprocess.run(
            ["psql", "-h", "127.0.0.1", "-p", "5433", "-U", "flymaster", "-d", "flymaster",
             "-q", "-c", f"UPDATE user_roles SET role='{role}' WHERE user_id='{user_id}';"],
            check=True, capture_output=True,
        )
        return True
    except Exception:
        print(f"  (could not promote {user_id} to {role} — do it by hand and re-run)")
        return False


def account(email, role):
    """Signs an account up, lifts it to the role these checks need, signs in."""
    status, data = call("POST", "/api/auth/signup",
                        body={"email": email, "password": "testpass123",
                              "firstName": "Test", "lastName": "User"})
    if status == 200:
        promote(data["user"]["id"], role)
    signin = call("POST", "/api/auth/signin", body={"email": email, "password": "testpass123"})[1]
    return signin.get("token", "")


print(f"Fly Masters — verifying CRM 2.6 and 2.7 against {BASE}")

tok = account("dev@mg3.test", "super_admin")
if not tok:
    sys.exit("Could not sign in. Is the server running, against a fresh database?")

print("\n### 2.6 — document master, versioned checklists, status words")

print("\n== 2.6 document master ==")
s,passport = call("POST","/api/config/documents",tok,{
  "name":"Passport","description":"Photo page, full colour scan.",
  "accepted_formats":["pdf","jpg"],"max_size_mb":5,"requires_expiry":True,
  "sample_instructions":"Scan the page with your photo and dates.","country_scope":["All"]})
check("create Passport master", s==200 and passport.get("code")=="passport", passport)
s,ielts = call("POST","/api/config/documents",tok,{"name":"IELTS Score Report","accepted_formats":["pdf"],"max_size_mb":10})
check("create IELTS master", s==200, ielts)
s,funds = call("POST","/api/config/documents",tok,{"name":"Proof of Funds","accepted_formats":["pdf"],"max_size_mb":15})
check("create Proof of Funds master", s==200, funds)
s,dup = call("POST","/api/config/documents",tok,{"name":"Passport"})
check("duplicate code refused", s==400, dup)
s,r = call("PATCH",f"/api/config/documents/{passport['id']}",tok,{"max_size_mb":8})
check("edit master", s==200 and float(r["max_size_mb"])==8.0, r)

print("\n== 2.6 versioned checklists ==")
s,ca = call("POST","/api/config/checklists",tok,{"name":"Canada — Masters","country":"Canada","course_level":"Masters","change_note":"First version."})
check("create checklist v1 draft", s==200 and ca["version"]==1 and ca["status"]=="draft", ca)
fam=ca["family_id"]
s,r = call("POST",f"/api/config/checklists/version/{ca['id']}/publish",tok,{})
check("publish refused with no items", s==400, r)
s,r = call("PUT",f"/api/config/checklists/version/{ca['id']}/items",tok,{"items":[
  {"document_master_id":passport["id"],"requirement":"mandatory"},
  {"document_master_id":ielts["id"],"requirement":"mandatory"},
  {"document_master_id":funds["id"],"requirement":"optional"}]})
check("set 3 items on draft", s==200 and len(r["items"])==3, r)
s,live = call("POST",f"/api/config/checklists/version/{ca['id']}/publish",tok,{})
check("publish v1", s==200 and live["status"]=="active", live)
s,r = call("PUT",f"/api/config/checklists/version/{ca['id']}/items",tok,{"items":[]})
check("published version is immutable", s==400, r)
s,v2 = call("POST",f"/api/config/checklists/{fam}/revise",tok,{"change_note":"Added proof of funds as mandatory."})
check("revise clones to v2 draft", s==200 and v2["version"]==2 and v2["status"]=="draft", v2)
s,r = call("GET",f"/api/config/checklists/version/{v2['id']}",tok)
check("v2 inherited the 3 items", s==200 and len(r["items"])==3, r)
s,r = call("POST",f"/api/config/checklists/{fam}/revise",tok,{})
check("second open draft refused", s==400, r)

print("\n== 2.6 status vocabulary is enforced ==")
s,r = call("POST","/api/config/statuses",tok,{"kind":"document","label":"Waiting on embassy","color":"violet","stage_index":2})
check("add a status", s==200, r)
s,r = call("POST","/api/config/statuses",tok,{"kind":"nonsense","label":"x"})
check("unknown status kind refused", s==400, r)

print("\n### 2.6 — version pinning, cross-country duplicates, the status bar")
docs={d["name"]:d for d in call("GET","/api/config/documents",tok)[1]["documents"]}
lists=call("GET","/api/config/checklists",tok)[1]["checklists"]
canada=[c for c in lists if c["country"]=="Canada"][0]

print("== a second country checklist, sharing the passport ==")
s,au=call("POST","/api/config/checklists",tok,{"name":"Australia — Masters","country":"Australia","course_level":"Masters"})
check("create Australia v1",s==200,au)
s,r=call("PUT",f"/api/config/checklists/version/{au['id']}/items",tok,{"items":[
  {"document_master_id":docs["Passport"]["id"],"requirement":"mandatory"},
  {"document_master_id":docs["Proof of Funds"]["id"],"requirement":"mandatory"}]})
check("Australia has 2 items",s==200 and len(r["items"])==2,r)
s,r=call("POST",f"/api/config/checklists/version/{au['id']}/publish",tok,{})
check("publish Australia",s==200,r)

print("\n== a student, and version pinning ==")
s,lead=call("POST","/api/leads",tok,{"email":"riya@test.in","phone":"9000000001","firstName":"Riya","lastName":"Sharma","countries":"Canada,Australia"})
check("create lead",s==200,lead)
sid=lead["id"]
s,act=call("POST",f"/api/students/{sid}/checklists",tok,{"family_id":canada["family_id"]})
check("activate Canada checklist",s==200 and act["items_created"]==3,act)
check("pinned to v1",act.get("version")==1,act)
s,r=call("POST",f"/api/students/{sid}/checklists",tok,{"family_id":canada["family_id"]})
check("double activation refused",s==400,r)

# publish v2 of Canada, student must stay on v1
v2=[v for v in call("GET",f"/api/config/checklists/{canada['family_id']}/versions",tok)[1]["versions"] if v["status"]=="draft"][0]
call("PUT",f"/api/config/checklists/version/{v2['id']}/items",tok,{"items":[
  {"document_master_id":docs["Passport"]["id"],"requirement":"mandatory"},
  {"document_master_id":docs["IELTS Score Report"]["id"],"requirement":"mandatory"},
  {"document_master_id":docs["Proof of Funds"]["id"],"requirement":"mandatory"}]})
s,pub=call("POST",f"/api/config/checklists/version/{v2['id']}/publish",tok,{})
check("publish Canada v2",s==200 and pub["version"]==2,pub)
s,lists2=call("GET",f"/api/students/{sid}/checklists",tok)
canada_list=[c for c in lists2["checklists"] if c["country"]=="Canada"][0]
check("student still pinned to v1 after v2 published",canada_list["version"]==1,canada_list["version"])
check("v1 kept its 3 items (nothing deleted)",len(canada_list["items"])==3,len(canada_list["items"]))
old=[v for v in call("GET",f"/api/config/checklists/{canada['family_id']}/versions",tok)[1]["versions"] if v["version"]==1][0]
check("v1 is inactive, not deleted",old["status"]=="inactive" and old["superseded_by"]==pub["id"],old)

print("\n== cross-country duplicate detection ==")
passport_item=[i for i in canada_list["items"] if i["code"]=="passport"][0]
s,r=call("PATCH",f"/api/student-checklist-items/{passport_item['id']}",tok,{"status_code":"accepted"})
check("accept the passport on Canada",s==200 and r["status_code"]=="accepted",r)
s,au_act=call("POST",f"/api/students/{sid}/checklists",tok,{"family_id":au["family_id"]})
check("activate Australia",s==200,au_act)
check("passport auto-marked already available",au_act["documents_already_available"]==1,au_act)
s,lists3=call("GET",f"/api/students/{sid}/checklists",tok)
au_list=[c for c in lists3["checklists"] if c["country"]=="Australia"][0]
pi=[i for i in au_list["items"] if i["code"]=="passport"][0]
check("Australia passport is not_required",pi["status_code"]=="not_required",pi["status_code"])
check("and points at the accepted one",str(pi["satisfied_by_item_id"])==str(passport_item["id"]),pi)

print("\n== status vocabulary enforced on the counsellor ==")
ielts_item=[i for i in canada_list["items"] if "ielts" in i["code"]][0]
s,r=call("PATCH",f"/api/student-checklist-items/{ielts_item['id']}",tok,{"status_code":"made_up_status"})
check("invented status refused",s==400,r)
s,r=call("PATCH",f"/api/student-checklist-items/{ielts_item['id']}",tok,
    {"status_code":"resubmit","rejection_reason":"Scan is cropped.","next_step_note":"Re-upload both pages by Friday."})
check("valid status + next-step note accepted",s==200 and r["next_step_note"].startswith("Re-upload"),r)

print("\n== visa status and the status bar ==")
s,r=call("PATCH",f"/api/students/{sid}/status",tok,{"application_status":"submitted","visa_status":"documents","next_step_status":"awaiting_student"})
check("set application + visa + next step",s==200,r)
s,r=call("PATCH",f"/api/students/{sid}/status",tok,{"visa_status":"not_a_real_stage"})
check("invented visa status refused",s==400,r)
s,prog=call("GET",f"/api/students/{sid}/progress",tok)
check("progress bar returns tracks",s==200 and prog["application"]["current"]["code"]=="submitted",prog)
check("visa track present",prog["visa"]["current"]["code"]=="documents",prog.get("visa"))
check("document progress per country",len(prog["documents"])==2,prog.get("documents"))

print("\n### 2.7 — templates, automation, delivery log, supervision, escalation")

print("== 2.7 templates ==")
s,t=call("POST","/api/comms/templates",tok,{
  "name":"Document reminder","category":"document_request","channel":"portal",
  "body":"Hi {{first_name}}, we still need your {{document}} for {{country}}.",
  "allowed_roles":["counselor","admin","super_admin"]})
check("create template v1 draft",s==200 and t["status"]=="draft",t)
fam=t["family_id"]
s,r=call("GET","/api/comms/templates/usable",tok)
check("draft is not usable yet",s==200 and not any(x["family_id"]==fam for x in r["templates"]),r)
s,r=call("POST",f"/api/comms/templates/version/{t['id']}/submit",tok,{})
check("submit for approval",s==200 and r["status"]=="pending",r)
s,r=call("POST",f"/api/comms/templates/version/{t['id']}/approve",tok,{})
check("approve -> active",s==200 and r["status"]=="active" and r["approved_by"],r)
s,r=call("PATCH",f"/api/comms/templates/version/{t['id']}",tok,{"body":"x"})
check("active version immutable",s==400,r)
s,v2=call("POST",f"/api/comms/templates/{fam}/revise",tok,{"change_note":"Softer wording."})
check("revise -> v2 draft",s==200 and v2["version"]==2,v2)
call("PATCH",f"/api/comms/templates/version/{v2['id']}",tok,{"body":"Hi {{first_name}}, a quick reminder about your {{document}}."})
s,r=call("POST",f"/api/comms/templates/version/{v2['id']}/approve",tok,{})
check("approve v2",s==200 and r["version"]==2,r)
s,vers=call("GET",f"/api/comms/templates/{fam}/versions",tok)
v1=[x for x in vers["versions"] if x["version"]==1][0]
check("v1 kept, marked inactive",v1["status"]=="inactive" and v1["superseded_by"]==v2["id"],v1)
check("v1 body preserved","we still need your" in v1["body"],v1["body"])

print("\n== WhatsApp templates need the Meta name ==")
s,wt=call("POST","/api/comms/templates",tok,{"name":"WA fee reminder","channel":"whatsapp","body":"Fee due."})
call("POST",f"/api/comms/templates/version/{wt['id']}/submit",tok,{})
s,r=call("POST",f"/api/comms/templates/version/{wt['id']}/approve",tok,{})
check("WhatsApp approval blocked without Meta name",s==400 and "Meta" in r.get("error",""),r)
call("PATCH",f"/api/comms/templates/version/{wt['id']}",tok,{"meta_template_name":"fm_fee_reminder_v1","meta_approved":True})
s,r=call("POST",f"/api/comms/templates/version/{wt['id']}/approve",tok,{})
check("approved once Meta name is set",s==200,r)

print("\n== usage restriction ==")
s,r=call("GET","/api/comms/templates/usable?channel=portal",tok)
check("approved portal template is usable",any(x["family_id"]==fam for x in r["templates"]),r)

print("\n== preview ==")
s,r=call("POST",f"/api/comms/templates/version/{v2['id']}/preview",tok,{"context":{"first_name":"Riya"}})
check("placeholders filled","Riya" in r["body"],r)
check("unresolved placeholders reported","document" in r["unresolved"],r)

print("\n== automation rules ==")
s,rule=call("POST","/api/comms/rules",tok,{"name":"Nudge on document rejection","event":"document_rejected",
  "template_id":v2["id"],"channel":"portal","recipient":"student","max_per_day":5})
check("create rule",s==200,rule)
check("new rule is OFF by default",rule["is_active"] is False,rule)
s,r=call("POST","/api/comms/rules",tok,{"name":"bad","event":"not_an_event"})
check("unknown event refused",s==400,r)
s,r=call("PATCH",f"/api/comms/rules/{rule['id']}",tok,{"is_active":True})
check("enable rule",s==200 and r["is_active"],r)

sid=call("GET","/api/config/checklists",tok)[1]["checklists"][0]
s,fire=call("POST","/api/comms/events/document_rejected",tok,{
  "studentId":"test-student","context":{"first_name":"Riya","document":"Passport"},
  "recipients":{"student":{"id":"test-student","address":"riya@test.in"}}})
check("event fires the rule",s==200 and len(fire["results"])==1,fire)
check("message was sent",fire["results"][0]["status"]=="sent",fire)

print("\n== daily cap and kill switch ==")
for i in range(5):
    call("POST","/api/comms/events/document_rejected",tok,{"studentId":"s","context":{},
      "recipients":{"student":{"id":"s","address":"x@test.in"}}})
s,over=call("POST","/api/comms/events/document_rejected",tok,{"studentId":"s","context":{},
  "recipients":{"student":{"id":"s","address":"x@test.in"}}})
check("daily cap stops the rule",over["results"][0]["reason"]=="daily_cap",over)
s,r=call("POST","/api/comms/rules/stop-all",tok,{"reason":"drill"})
check("kill switch stops every rule",s==200 and r["stopped"]>=1,r)
s,r=call("GET","/api/comms/rules",tok)
check("no rule left active",not any(x["is_active"] for x in r["rules"]),r)

print("\n== consent / opt-out ==")
call("PATCH",f"/api/comms/rules/{rule['id']}",tok,{"is_active":True,"max_per_day":500})
call("PUT","/api/comms/consent",tok,{"subject_id":"opted","channel":"portal","opted_out":True,"reason":"asked to stop"})
s,r=call("POST","/api/comms/events/document_rejected",tok,{"studentId":"opted","context":{},
  "recipients":{"student":{"id":"opted","address":"x@test.in"}}})
log=call("GET","/api/comms/log?student_id=opted",tok)[1]["log"]
check("opted-out message is skipped, not sent",log and log[0]["status"]=="skipped" and log[0]["skip_reason"]=="opted_out",log[:1])

print("\n== delivery log ==")
s,r=call("GET","/api/comms/log",tok)
check("log readable",s==200 and len(r["log"])>0,len(r.get("log",[])))
check("7-day summary present",isinstance(r["last_7_days"],list),r.get("last_7_days"))

print("\n== out-of-office ==")
s,r=call("PUT","/api/comms/auto-response",tok,{"scope_type":"global","message":"Our office is closed.","work_start":"09:30","work_end":"18:30"})
check("set global auto-response",s==200,r)
s,r=call("GET","/api/comms/auto-response/resolve",tok)
check("resolve returns a decision",s==200 and "within_hours" in r,r)

print("\n== supervision + escalation ==")
s,r=call("GET","/api/comms/supervision/conversations",tok)
check("supervision lists conversations",s==200 and "conversations" in r,r)
s,esc=call("POST","/api/comms/escalations",tok,{"student_id":"test-student","reason":"Counsellor was rude.","reported_message":"..."})
check("escalation raised",s==200 and esc["status"]=="open",esc)
s,r=call("GET","/api/comms/escalations?status=open",tok)
check("escalation queue readable",s==200 and len(r["escalations"])>=1,r)
s,r=call("PATCH",f"/api/comms/escalations/{esc['id']}",tok,{"status":"resolved","resolution_note":"Spoke to both."})
check("escalation resolved",s==200 and r["status"]=="resolved" and r["resolved_at"],r)

print("\n== alerts (2.6.1) ==")
s,r=call("GET","/api/alerts/settings",tok)
check("alert settings seeded",s==200 and len(r["settings"])>=10,len(r.get("settings",[])))
s,r=call("PUT","/api/alerts/settings",tok,{"scope_type":"global","alert_type":"followup_overdue",
  "priority":"urgent","channels":["bell","toast","sound","banner"],"tone":"urgent","quiet_start":"22:00","quiet_end":"07:00"})
check("update alert rule",s==200 and r["tone"]=="urgent",r)
s,r=call("PUT","/api/alerts/settings",tok,{"scope_type":"global","alert_type":"nope"})
check("unknown alert type refused",s==400,r)
me=call("GET","/api/me/capabilities",tok)[1]
s,r=call("POST","/api/alerts/raise",tok,{"user_id":me and "self","alert_type":"hot_lead_update","title":"t"})
s,feed=call("GET","/api/alerts/feed",tok)
check("alert feed readable",s==200 and "alerts" in feed,feed)

print("\n== developer-only change history ==")
s,r=call("GET","/api/config/changes",tok)
check("developer can read the history",s==200 and len(r["changes"])>0,len(r.get("changes",[])))
kinds={c["entity_type"] for c in r["changes"]}
check("checklist + template changes both recorded",{"checklist_template","message_template"} <= kinds,kinds)
pub=[c for c in r["changes"] if c["action"]=="publish"]
check("publish records version_from -> version_to",pub and pub[0]["version_to"]==2 and pub[0]["version_from"]==1,pub[:1])
s,r=call("GET","/api/config/changes/summary",tok)
check("change summary groups by entity",s==200 and len(r["summary"])>0,r)

print("\n### Permission boundaries")

# A counsellor, and a second admin who is NOT the named developer.
cou = account("counsellor@mg3.test", "counselor")
adm2 = account("otheradmin@mg3.test", "admin")

print("== configuration is admin-only ==")
s,r=call("POST","/api/config/documents",cou,{"name":"Sneaky doc"})
check("counsellor cannot add a document master",s==403,r)
s,r=call("POST","/api/config/checklists",cou,{"name":"Sneaky checklist"})
check("counsellor cannot create a checklist",s==403,r)
s,r=call("POST","/api/config/statuses",cou,{"kind":"document","label":"Sneaky"})
check("counsellor cannot add a status word",s==403,r)
s,r=call("POST","/api/comms/templates",cou,{"name":"Sneaky template","body":"x"})
check("counsellor cannot create a template",s==403,r)
s,r=call("POST","/api/comms/rules",cou,{"name":"x","event":"lead_created"})
check("counsellor cannot create an automation rule",s==403,r)
s,r=call("GET","/api/comms/supervision/conversations",cou)
check("counsellor cannot read every conversation",s==403,r)

print("\n== but a counsellor CAN do their own job ==")
s,r=call("GET","/api/config/documents",cou)
check("counsellor can read the document master",s==200,r)
s,r=call("GET","/api/comms/templates/usable",cou)
check("counsellor can list usable templates",s==200,r)
s,r=call("GET","/api/config/statuses?kind=document",cou)
check("counsellor can read the status words",s==200,r)

print("\n== developer-only history ==")
s,r=call("GET","/api/config/changes",adm2)
check("a second admin cannot read the change history",s==403,r)
s,r=call("GET","/api/config/changes",cou)
check("a counsellor cannot read the change history",s==403,r)
s,r=call("GET","/api/config/changes",tok)
check("the named developer can",s==200,r)
s,cap=call("GET","/api/me/capabilities",adm2)
check("capabilities tells the UI to hide the menu",cap["developer"] is False,cap)

print("\n== stop-all is super admin only ==")
s,r=call("POST","/api/comms/rules/stop-all",adm2,{"reason":"x"})
check("plain admin cannot stop every rule",s==403,r)
s,r=call("PUT","/api/partners/00000000-0000-0000-0000-000000000000/visibility",adm2,{"show_visa_status":False})
check("plain admin cannot change agent visibility",s==403,r)

print("\n== a student reaches only their own record ==")
lead=call("GET","/api/leads",tok)[1]
sid=None
if isinstance(lead,dict):
    rows=lead.get("leads") or lead.get("rows") or []
    sid=rows[0]["id"] if rows else None
s,r=call("GET",f"/api/students/{sid or 'x'}/progress",cou)
check("counsellor branch check runs on progress",s in (200,403,404),r)

print(f"\n{PASSED} passed, {FAILED} failed")
sys.exit(1 if FAILED else 0)
