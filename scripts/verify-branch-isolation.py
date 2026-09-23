#!/usr/bin/env python3
"""
Proves that a branch-scoped role cannot see outside its own branch.

    python3 scripts/verify-branch-isolation.py http://127.0.0.1:8791

Run against a FRESH test database — it creates two branches, an accountant in
one of them, a counsellor in each, and money in both, then checks what the
accountant can reach. Needs psql on PATH for the role/branch setup that has no
API of its own.

The accountant is the sharpest case in the platform: they handle money, they
are outside the counselling chain, and the client's rule is that they know
nothing beyond their own branch. If this script passes, that rule holds in the
database rather than in the menu.
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


def psql(sql):
    return subprocess.run(
        ["psql", "-h", "127.0.0.1", "-p", "5433", "-U", "flymaster", "-d", "flymaster", "-tAc", sql],
        capture_output=True, text=True,
    ).stdout.strip()


def check(label, condition, detail=""):
    global PASSED, FAILED
    if condition:
        PASSED += 1
        print(f"PASS  {label}")
    else:
        FAILED += 1
        print(f"FAIL  {label}  {detail}")


def account(email, role, branch_id=None):
    status, data = call("POST", "/api/auth/signup",
                        body={"email": email, "password": "testpass123",
                              "firstName": "Test", "lastName": "User"})
    user_id = data["user"]["id"] if status == 200 else psql(f"SELECT id FROM auth_users WHERE email='{email}'")
    where = f", branch_id='{branch_id}'" if branch_id else ""
    psql(f"UPDATE user_roles SET role='{role}'{where} WHERE user_id='{user_id}';")
    if branch_id:
        psql(f"INSERT INTO user_branches (user_id, branch_id) VALUES ('{user_id}','{branch_id}') ON CONFLICT DO NOTHING;")
    signin = call("POST", "/api/auth/signin", body={"email": email, "password": "testpass123"})[1]
    return signin.get("token", ""), user_id


print(f"Fly Masters — verifying branch isolation against {BASE}")

boss, _ = account("dev@mg3.test", "super_admin")
if not boss:
    sys.exit("Could not sign in. Is the server running against a fresh database?")

call("POST", "/api/branches", boss, {"name": "Ameerpet", "city": "Hyderabad", "area": "Ameerpet"})
call("POST", "/api/branches", boss, {"name": "Kukatpally", "city": "Hyderabad", "area": "Kukatpally"})
mine = psql("SELECT id FROM branches WHERE code='HYD-AME'")
theirs = psql("SELECT id FROM branches WHERE code='HYD-KUK'")
check("two branches exist", bool(mine) and bool(theirs), (mine, theirs))

accountant, _ = account("acct@mg3.test", "accountant", mine)
account("c-mine@mg3.test", "counselor", mine)
account("c-theirs@mg3.test", "counselor", theirs)

# money and payroll in both branches
for branch, tag, salary in [(mine, "AMEE", 50000), (theirs, "KUKA", 99999)]:
    psql(f"""INSERT INTO partners (id, type, full_name, referral_code, commission_rate, commission_basis, branch_id)
             VALUES (gen_random_uuid(),'agent','Agent {tag}','{tag}-TEST',15000,'per_enrollment','{branch}')
             ON CONFLICT DO NOTHING;""")
    partner = psql(f"SELECT id FROM partners WHERE branch_id='{branch}' LIMIT 1")
    psql(f"""INSERT INTO partner_commissions (id, partner_id, amount, status, branch_id)
             VALUES (gen_random_uuid(),'{partner}',{salary},'pending','{branch}');""")
    psql(f"""INSERT INTO counselor_salary_records (id, counselor_id, month, year, net_salary, branch_id)
             VALUES (gen_random_uuid(), gen_random_uuid(), 9, 2026, {salary}, '{branch}');""")

print("\n### What the accountant CAN reach — their own branch only")
status, data = call("GET", "/api/finance/commissions", accountant)
rows = data.get("commissions", [])
check("sees their branch's commissions", status == 200 and len(rows) > 0, data)
check("and no other branch's", all(str(r.get("branch_id")) == mine for r in rows),
      [r.get("branch_id") for r in rows])
check("the other branch's amount is absent",
      not any(float(r.get("amount", 0)) == 99999 for r in rows), rows)

status, data = call("GET", "/api/finance/summary", accountant)
check("the summary is branch-scoped, not 'all branches'",
      status == 200 and "all branches" not in str(data.get("scope", "")), data.get("scope"))

status, data = call("GET", "/api/hr/state", accountant)
salary = data.get("salary", [])
check("payroll is their branch only",
      status == 200 and {str(r.get("branch_id")) for r in salary} <= {mine}, salary)
check("the other branch's payroll figure is absent",
      not any(float(r.get("net_salary", 0)) == 99999 for r in salary), salary)
emails = [u.get("email") for u in data.get("users", [])]
check("the staff directory is their branch only — not even names from elsewhere",
      "c-theirs@mg3.test" not in emails, emails)
check("no leads, documents or conversations come back at all",
      not data.get("leads") and not data.get("documents") and not data.get("conversations"),
      {k: len(data.get(k, [])) for k in ("leads", "documents", "conversations")})

print("\n### What the accountant CANNOT reach")
other_commission = psql(f"SELECT id FROM partner_commissions WHERE branch_id='{theirs}' LIMIT 1")
status, data = call("PATCH", f"/api/finance/commissions/{other_commission}", accountant, {"status": "approved"})
check("cannot approve another branch's commission", status == 403, (status, data))
status, data = call("GET", f"/api/finance/commissions/{other_commission}/invoice", accountant)
check("cannot open another branch's invoice", status in (403, 404), (status, data))
status, data = call("POST", "/api/finance/payments", accountant, {"branchId": theirs, "amount": 1000})
check("cannot record a payment against another branch", status == 403, (status, data))

status, data = call("GET", "/api/state", accountant)
check("cannot reach the CRM at all (leads, students, chats)", status == 403, (status, data))
status, data = call("POST", "/api/salary", accountant, {"counselorId": "x", "month": 1, "year": 2026})
check("cannot post a salary record (admin only)", status == 403, (status, data))
status, data = call("GET", "/api/comms/supervision/conversations", accountant)
check("cannot read anyone's chats", status == 403, (status, data))
status, data = call("POST", "/api/config/documents", accountant, {"name": "Sneaky"})
check("cannot change configuration", status == 403, (status, data))

print("\n### An accountant with no branch is refused, not given everything")
orphan, orphan_id = account("acct-orphan@mg3.test", "accountant")
psql(f"DELETE FROM user_branches WHERE user_id='{orphan_id}';")
psql(f"UPDATE user_roles SET branch_id=NULL WHERE user_id='{orphan_id}';")
orphan = call("POST", "/api/auth/signin", body={"email": "acct-orphan@mg3.test", "password": "testpass123"})[1].get("token", "")
status, data = call("GET", "/api/finance/commissions", orphan)
check("no branch assigned means refused, never 'see everything'", status == 403, (status, data))

print(f"\n{PASSED} passed, {FAILED} failed")
sys.exit(1 if FAILED else 0)
