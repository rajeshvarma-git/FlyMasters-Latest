#!/usr/bin/env python3
"""
University information: server-side checks against a REAL local backend.

Run against a FRESH throwaway database only (it creates users, imports a small
fictional catalogue and writes university information):

    API_URL=http://127.0.0.1:8960 PSQL_URL=postgresql://user:pw@127.0.0.1:5432/scratch_db \
      python3 scripts/verify-university-info.py

Refuses to run unless both URLs are local.
"""
import base64, json, os, subprocess, sys, urllib.request, urllib.error, uuid
from urllib.parse import urlparse

API = os.environ.get("API_URL", "http://127.0.0.1:8960").rstrip("/")
PSQL_URL = os.environ.get("PSQL_URL", "")
for label, value in (("API_URL", API), ("PSQL_URL", PSQL_URL)):
    host = urlparse(value).hostname or ""
    if host not in ("127.0.0.1", "localhost", "::1"):
        sys.exit(f"{label} must be local (got {host or 'nothing'}). This script writes test data.")

passed = failed = 0


def check(name, ok, detail=""):
    global passed, failed
    if ok:
        passed += 1
        print(f"PASS  {name}")
    else:
        failed += 1
        print(f"FAIL  {name}  -> {detail}")


def call(method, path, token=None, body=None, raw=False):
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(API + path, data=data, method=method,
                                 headers={"Content-Type": "application/json", **({"Authorization": f"Bearer {token}"} if token else {})})
    try:
        resp = urllib.request.urlopen(req)
        payload = resp.read()
        return resp.status, (payload if raw else (json.loads(payload) if payload else {})), resp.headers
    except urllib.error.HTTPError as e:
        payload = e.read()
        try:
            return e.code, json.loads(payload), e.headers
        except Exception:
            return e.code, {"raw": payload[:200].decode("latin1")}, e.headers


def j(method, path, token=None, body=None):
    s, d, _ = call(method, path, token, body)
    return s, d


def psql(sql):
    return subprocess.run(["psql", PSQL_URL, "-tAc", sql], capture_output=True, text=True).stdout.strip()


run = uuid.uuid4().hex[:6]
PNG = b"\x89PNG\r\n\x1a\n" + b"\x00" * 64
PNG2 = b"\x89PNG\r\n\x1a\n" + b"\x01" * 64
PDF = b"%PDF-1.7\n%test\n"


def data_url(mime, raw):
    return f"data:{mime};base64," + base64.b64encode(raw).decode()


# ------------------------------------------------------------------ fixtures
status, d = j("POST", "/api/auth/signup", body={"email": f"uadmin-{run}@mg3.test", "password": "testpass123", "firstName": "Uni", "lastName": "Admin"})
admin = j("POST", "/api/auth/signin", body={"email": f"uadmin-{run}@mg3.test", "password": "testpass123"})[1].get("token", "")
branch = psql("SELECT id FROM branches ORDER BY created_at LIMIT 1")


def staff(role):
    email = f"u{role}-{run}@mg3.test"
    j("POST", "/api/users", admin, {"email": email, "password": "testpass123", "firstName": role, "lastName": "Test", "role": role, "branchIds": [branch]})
    s, d = j("POST", "/api/auth/signin", body={"email": email, "password": "testpass123"})
    return d.get("token", ""), d.get("user", {}).get("id", "")


counselor, counselor_id = staff("counselor")
telecaller, _ = staff("telecaller")
branch_head, _ = staff("branch_head")
accountant, _ = staff("accountant")


def student(tag):
    email = f"ustu{tag}-{run}@mg3.test"
    s, d = j("POST", "/__auth", body={"action": "signup", "email": email, "password": "testpass123", "user_metadata": {"first_name": f"Stu{tag}", "last_name": "Test"}})
    sess = d["session"]
    return sess["user"]["id"], sess["access_token"], email


stu1, s1, s1_email = student("1")
stu2, s2, _ = student("2")
check("fixtures: admin, counselor, telecaller, branch head, accountant, two students",
      all([admin, counselor, telecaller, branch_head, accountant, s1, s2]))

CSV = (
    "Country,University,Program Name,Degree,City\n"
    f"UK,Alpha Test University {run},MSc Data Science,Masters,Leeds\n"
    f"UK,Alpha Test University {run},MSc Finance,Masters,Leeds\n"
    f"UK,Beta Test University {run},BA History,Bachelors,York\n"
    f"Germany,Gamma Test University {run},MSc Robotics,Masters,Berlin\n"
)
status, d = j("POST", "/api/universities/import-csv", admin, {"csv": CSV, "fileName": f"fictional-{run}.csv"})
check("fictional catalogue imported", status == 200 and d.get("universities") == 3, f"{status} {d}")


def uni_id(country, name):
    s, rows = j("GET", f"/api/university-catalog/universities?country={country}", admin)
    for row in rows if isinstance(rows, list) else []:
        if row["name"] == name:
            return row.get("university_id")
    return None


A = uni_id("UK", f"Alpha Test University {run}")
B = uni_id("UK", f"Beta Test University {run}")
G = uni_id("Germany", f"Gamma Test University {run}")
check("catalogue list now carries each university's id", all([A, B, G]) and len({A, B, G}) == 3, f"{A} {B} {G}")
check("ids are the stable catalogue ids", str(A).startswith("uni-"), A)

# ------------------------------------------------------ authorization (direct API)
print("\n### Only admins can write, upload, publish or unpublish")
info_draft = {"basic": {"overview": "ALPHA DRAFT SECRET"}}
writes = [
    ("PUT", f"/api/admin/universities/{A}/info", {"info": info_draft}),
    ("POST", f"/api/admin/universities/{A}/info/publish", {"info": info_draft}),
    ("POST", f"/api/admin/universities/{A}/info/unpublish", {}),
    ("POST", f"/api/admin/universities/{A}/assets", {"dataUrl": data_url("image/png", PNG)}),
    ("GET", f"/api/admin/universities/{A}/info", None),
    ("GET", "/api/admin/university-info/status", None),
]
for label, token in (("no token", None), ("student", s1), ("counselor", counselor), ("telecaller", telecaller), ("branch head", branch_head), ("accountant", accountant)):
    for method, path, body in writes:
        status, d = j(method, path, token, body)
        # A student's session is not a staff session at all, so the staff middleware answers 401; staff roles get 403.
        expected = (401,) if token is None else ((401, 403) if token == s1 else (403,))
        check(f"{label}: {method} {path.replace(A, '<id>')} refused", status in expected, f"{status} {d}")
check("none of those requests created anything", psql("SELECT count(*) FROM app_records WHERE table_name='university_profiles'") == "0")
check("none of those uploads were stored", psql("SELECT count(*) FROM app_storage WHERE path LIKE 'university-assets/%'") == "0")

# ------------------------------------------------------------- admin editing
print("\n### Admin adds, edits and saves information")
status, d = j("GET", f"/api/admin/universities/{A}/info", admin)
check("admin opens an empty record: status none, base university shown", status == 200 and d["info"]["status"] == "none" and d["university"]["name"] == f"Alpha Test University {run}", f"{status} {d}")
status, up_logo = j("POST", f"/api/admin/universities/{A}/assets", admin, {"dataUrl": data_url("image/png", PNG)})
check("admin uploads a logo (PNG)", status == 200 and up_logo.get("file", "").endswith(".png"), f"{status} {up_logo}")
status, up_hidden = j("POST", f"/api/admin/universities/{A}/assets", admin, {"dataUrl": data_url("image/png", PNG2)})
status2, up_pdf = j("POST", f"/api/admin/universities/{A}/assets", admin, {"dataUrl": data_url("application/pdf", PDF)})
check("admin uploads a second image and a PDF brochure", status == 200 and status2 == 200 and up_pdf.get("file", "").endswith(".pdf"), f"{status} {status2}")

FULL = {
    "basic": {"name": f"Alpha Test University {run}", "country": "UK", "city": "Leeds", "campus_location": "Main campus, Leeds", "overview": "Alpha overview text (fictional)."},
    "branding": {"logo": {"file": up_logo["file"], "caption": "Alpha logo"}, "campus_images": [{"file": up_logo["file"], "caption": "Quad"}], "gallery": []},
    "programs": [{"name": "MSc Data Science", "degree_level": "Masters", "duration": "1 year", "courses": "Machine learning; Statistics"}],
    "fees": {"tuition": "21,000", "currency": "gbp", "period": "per year", "other_costs": "Accommodation about 9,000"},
    "admission": {"academic": "Upper second class degree", "english": "IELTS 6.5", "other": "Two references"},
    "intakes": [{"period": "September 2027", "deadline": "2027-05-31", "notes": "Main intake"}],
    "important_dates": [{"label": "Scholarship deadline", "date": "2027-02-01"}],
    "links": {"website": "https://alpha.example.edu", "admissions_page": "https://alpha.example.edu/apply", "other": [{"label": "Housing", "url": "https://alpha.example.edu/housing"}]},
    "brochures": [{"label": "Prospectus 2027", "file": up_pdf["file"]}, {"label": "Online guide", "url": "https://alpha.example.edu/guide.pdf"}],
}
status, d = j("PUT", f"/api/admin/universities/{A}/info", admin, {"info": FULL})
check("admin saves a draft", status == 200 and d["info"]["status"] == "draft" and d["info"]["draft"]["fees"]["currency"] == "GBP", f"{status} {d}")
stamp = d["info"]["draft_updated_at"]
status, d = j("GET", f"/api/admin/universities/{A}/info", admin)
check("draft persists on reload (all sections)", status == 200 and d["info"]["draft"]["basic"]["overview"] == FULL["basic"]["overview"]
      and d["info"]["draft"]["programs"][0]["name"] == "MSc Data Science" and len(d["info"]["draft"]["brochures"]) == 2
      and d["info"]["draft"]["intakes"][0]["deadline"] == "2027-05-31", f"{status}")
status, d = j("GET", f"/api/admin/universities/{B}/info", admin)
check("editing Alpha did not touch Beta", d["info"]["status"] == "none" and d["info"]["draft"] is None)
status, d = j("GET", f"/api/admin/universities/{G}/info", admin)
check("editing Alpha did not touch Gamma", d["info"]["status"] == "none" and d["info"]["draft"] is None)
check("exactly one profile record exists", psql("SELECT count(*) FROM app_records WHERE table_name='university_profiles'") == "1")

print("\n### Validation")
bad_cases = [
    ("javascript: link", {"links": {"website": "javascript:alert(1)"}}),
    ("link with credentials", {"links": {"website": "https://user:pw@alpha.example.edu"}}),
    ("not a real date", {"intakes": [{"period": "X", "deadline": "2027-13-45"}]}),
    ("unknown currency", {"fees": {"currency": "dollars"}}),
    ("file from nowhere", {"branding": {"logo": {"file": "00000000-0000-4000-8000-000000000000.png"}}}),
    ("path traversal as file", {"branding": {"logo": {"file": "../../etc/passwd"}}}),
    ("PDF used as an image", {"branding": {"logo": {"file": up_pdf["file"]}}}),
    ("programme without a name", {"programs": [{"duration": "1 year"}]}),
    ("overview too long", {"basic": {"overview": "x" * 5001}}),
    ("brochure with neither file nor link", {"brochures": [{"label": "Empty"}]}),
]
for label, body in bad_cases:
    status, d = j("PUT", f"/api/admin/universities/{A}/info", admin, {"info": body})
    check(f"rejected: {label}", status == 400, f"{status} {d}")
status, d = j("GET", f"/api/admin/universities/{A}/info", admin)
check("rejected saves changed nothing", d["info"]["draft"]["basic"]["overview"] == FULL["basic"]["overview"])
uploads = [
    ("SVG", data_url("image/svg+xml", b"<svg xmlns='http://www.w3.org/2000/svg' onload='alert(1)'/>")),
    ("HTML", data_url("text/html", b"<script>alert(1)</script>")),
    ("PNG label on text", data_url("image/png", b"definitely not an image")),
    ("JPEG label on PNG bytes", data_url("image/jpeg", PNG)),
    ("not a data URL", "hello"),
    ("image over 5 MB", data_url("image/png", PNG + b"\x00" * (5 * 1024 * 1024))),
]
for label, value in uploads:
    status, d = j("POST", f"/api/admin/universities/{A}/assets", admin, {"dataUrl": value})
    check(f"upload rejected: {label}", status == 400, f"{status} {d}")
status, d = j("GET", "/api/admin/universities/uni-doesnotexist/info", admin)
check("unknown university: 404", status == 404, f"{status}")
status, d = j("GET", "/api/admin/universities/..%2F..%2Fx/info", admin)
check("odd id: 404, not an error", status in (404,), f"{status}")
status, d = j("PUT", "/api/admin/universities/uni-doesnotexist/info", admin, {"info": info_draft})
check("cannot attach information to a university that does not exist", status == 404, f"{status}")
status, d = j("PUT", f"/api/admin/universities/{A}/info", admin, {"info": FULL, "expected_updated_at": "2000-01-01T00:00:00.000Z"})
check("stale edit is refused (409), nothing overwritten", status == 409, f"{status} {d}")

# ----------------------------------------------- draft is invisible to students
print("\n### Unpublished information is not exposed")
for label, token in (("student 1", s1), ("student 2", s2), ("counselor", counselor)):
    status, d = j("GET", f"/api/university-info/{A}", token)
    check(f"{label} sees no information while only a draft exists", status == 200 and d.get("info") is None and "ALPHA DRAFT" not in json.dumps(d) and "Alpha overview" not in json.dumps(d), f"{status} {d}")
status, d = j("GET", f"/api/university-info/{A}", None)
check("no token: 401", status == 401, f"{status}")
status, _, _ = call("GET", f"/api/university-info/{A}/assets/{up_logo['file']}", s1, raw=True)
check("draft logo is not downloadable by a student", status == 404, f"{status}")
status, _, _ = call("GET", f"/api/university-info/{A}/assets/{up_logo['file']}", None, raw=True)
check("nor without signing in", status == 401, f"{status}")
status, raw, hdr = call("GET", f"/api/university-info/{A}/assets/{up_logo['file']}", admin, raw=True)
check("admin can preview the draft logo", status == 200 and raw == PNG and hdr.get("Content-Type") == "image/png", f"{status}")
for table in ("university_profiles",):
    status, d = j("GET", f"/__local_db?table={table}", s1)
    rows = d.get("rows") if isinstance(d, dict) else None
    check(f"student cannot read {table} through the generic data API", status in (401, 403) or not rows, f"{status} {str(d)[:120]}")
    status, d = j("POST", "/__local_db", s1, {"action": "insert", "table": table, "rows": [{"id": "x", "university_id": A, "published": {"basic": {"overview": "forged"}}}]})
    check(f"student cannot write {table} through the generic data API", status in (400, 401, 403), f"{status} {str(d)[:120]}")
status, d = j("GET", f"/api/case/me/shortlist-details", s1)
check("shortlist details carry no information text", "Alpha overview" not in json.dumps(d))
status, d = j("POST", f"/api/admin/universities/{A}/info/publish", admin, {"info": {}})
check("cannot publish an empty record", status == 400, f"{status} {d}")
status, d = j("GET", f"/api/admin/universities/{A}/info", admin)
check("a refused publish did not overwrite the saved draft", d["info"]["draft"]["basic"]["overview"] == FULL["basic"]["overview"], str(d)[:160])
status, d = j("POST", f"/api/admin/universities/{B}/info/publish", admin, {})
check("cannot publish a university with no draft", status == 400, f"{status} {d}")

# -------------------------------------------------------------- publishing
print("\n### Publishing")
status, d = j("POST", f"/api/admin/universities/{A}/info/publish", admin, {})
check("admin publishes the saved draft", status == 200 and d["info"]["status"] == "published" and d["info"]["published"]["basic"]["overview"] == FULL["basic"]["overview"], f"{status} {d}")
for label, token in (("student 1", s1), ("student 2", s2), ("counselor", counselor)):
    status, d = j("GET", f"/api/university-info/{A}", token)
    info = d.get("info") or {}
    check(f"{label} now sees the published information", status == 200 and info.get("basic", {}).get("overview") == FULL["basic"]["overview"]
          and info["fees"]["tuition"] == "21,000" and info["intakes"][0]["period"] == "September 2027"
          and info["links"]["website"] == "https://alpha.example.edu/", f"{status} {str(d)[:200]}")
    check(f"{label} view has no admin bookkeeping", not any(k in d for k in ("draft", "published", "draft_updated_by", "published_by")) and "published_by" not in json.dumps(d), str(list(d)))
status, raw, hdr = call("GET", f"/api/university-info/{A}/assets/{up_logo['file']}", s1, raw=True)
check("student can load the published logo", status == 200 and raw == PNG and hdr.get("Content-Type") == "image/png"
      and hdr.get("X-Content-Type-Options") == "nosniff", f"{status}")
status, raw, hdr = call("GET", f"/api/university-info/{A}/assets/{up_pdf['file']}", s1, raw=True)
check("student can load the published brochure PDF", status == 200 and raw == PDF and hdr.get("Content-Type") == "application/pdf", f"{status}")
status, _, _ = call("GET", f"/api/university-info/{A}/assets/{up_hidden['file']}", s1, raw=True)
check("an uploaded but unreferenced file stays hidden from students", status == 404, f"{status}")
status, _, _ = call("GET", f"/api/university-info/{B}/assets/{up_logo['file']}", s1, raw=True)
check("a file cannot be fetched through another university's id", status == 404, f"{status}")
status, d = j("GET", f"/api/university-info/{B}", s1)
check("Beta still has nothing published", status == 200 and d.get("info") is None)
status, d = j("GET", f"/api/university-info/{G}", s2)
check("Gamma still has nothing published", status == 200 and d.get("info") is None)

print("\n### Editing after publishing")
edited = json.loads(json.dumps(FULL))
edited["basic"]["overview"] = "Alpha overview CHANGED (unpublished)"
status, d = j("PUT", f"/api/admin/universities/{A}/info", admin, {"info": edited})
check("draft edit after publishing: status becomes changed", status == 200 and d["info"]["status"] == "changed", f"{status} {d}")
status, d = j("GET", f"/api/university-info/{A}", s1)
check("students still see the previously published text", d["info"]["basic"]["overview"] == FULL["basic"]["overview"], str(d)[:160])
status, d = j("POST", f"/api/admin/universities/{A}/info/publish", admin, {})
check("publishing again updates what students see", status == 200 and j("GET", f"/api/university-info/{A}", s1)[1]["info"]["basic"]["overview"] == "Alpha overview CHANGED (unpublished)")

print("\n### Re-importing the catalogue does not erase the information")
status, d = j("POST", "/api/universities/import-csv", admin, {"csv": CSV, "fileName": f"fictional-{run}-again.csv"})
check("same CSV imported again", status == 200, f"{status} {d}")
check("university ids unchanged by the re-import", uni_id("UK", f"Alpha Test University {run}") == A)
status, d = j("GET", f"/api/university-info/{A}", s1)
check("published information survived the re-import", status == 200 and (d.get("info") or {}).get("fees", {}).get("tuition") == "21,000", f"{status} {str(d)[:160]}")

print("\n### View University from a counselor recommendation")
patch = json.dumps({"assigned_counselor_id": counselor_id, "entity_type": "student", "lead_status": "converted", "preferred_countries": ["UK"], "qualification_level": "Masters"})
psql(f"UPDATE app_records SET data = data || '{patch}'::jsonb WHERE table_name='student_leads' AND data->>'user_id'='{stu1}'")
status, rec = j("POST", "/api/counselor/shortlists", counselor, {"student_id": stu1, "student_email": s1_email, "university_id": A,
                "university_name": f"Alpha Test University {run}", "course_name": "MSc Data Science", "location": "Leeds, UK"})
check("counselor recommends Alpha to the student", status in (200, 201), f"{status} {rec}")
shortlist = (rec.get("shortlist") or rec).get("id")
status, d = j("GET", "/api/case/me/shortlist-details", s1)
detail = (d.get("details") or {}).get(shortlist) or {}
check("the recommendation resolves to Alpha's catalogue id", detail.get("university_id") == A, f"{detail}")
status, d = j("GET", f"/api/university-info/{detail.get('university_id')}", s1)
check("View University from the recommendation shows the published information", (d.get("info") or {}).get("basic", {}).get("overview") == "Alpha overview CHANGED (unpublished)")
status, apps = j("GET", "/__local_db?table=applications", s1)
check("viewing and recommending created no application", status == 200 and len(apps.get("rows", [])) == 0, f"{status} {apps}")
status, resp = j("POST", f"/api/counselor/shortlists/{shortlist}/start-application", counselor, {})
check("Start Application is still blocked until the student consents", status == 409, f"{status} {resp}")
status, resp = j("POST", f"/api/case/me/shortlists/{shortlist}/decision", s1, {"decision": "accept"})
status, resp = j("POST", f"/api/counselor/shortlists/{shortlist}/start-application", counselor, {"intake_term": "September 2027"})
check("after consent the counselor starts the application", status == 200 and resp.get("application", {}).get("status") == "in_progress", f"{status} {resp}")
status, resp = j("POST", f"/api/case/me/shortlists/{shortlist}/request-application", s1, {})
check("student request route still answers (already started)", status in (200, 409), f"{status}")

print("\n### Unpublishing")
status, d = j("POST", f"/api/admin/universities/{A}/info/unpublish", admin, {})
check("admin unpublishes", status == 200 and d["info"]["status"] == "draft" and d["info"]["draft"] is not None, f"{status} {d}")
status, d = j("GET", f"/api/university-info/{A}", s1)
check("students see nothing again", d.get("info") is None)
status, _, _ = call("GET", f"/api/university-info/{A}/assets/{up_logo['file']}", s1, raw=True)
check("and the files are closed again", status == 404, f"{status}")
status, d = j("POST", f"/api/admin/universities/{A}/info/unpublish", admin, {})
check("unpublishing twice is refused cleanly", status == 400, f"{status}")
status, d = j("GET", "/api/admin/university-info/status", admin)
rows = {r["university_id"]: r["status"] for r in d.get("statuses", [])}
check("status list: Alpha draft, others absent", rows.get(A) == "draft" and B not in rows and G not in rows, str(rows))
check("publishing and unpublishing were audited", int(psql("SELECT count(*) FROM audit_log WHERE action IN ('university.info.publish','university.info.unpublish')") or 0) >= 3)

print(f"\n{passed} passed, {failed} failed")
sys.exit(1 if failed else 0)
