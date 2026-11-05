// Employee onboarding acceptance, run against a DEPLOYED environment over HTTP.
//
// This is the executable form of the Step 5 acceptance criteria: a Super Admin creates an Admin and
// gives them a branch, that Admin creates a Telecaller and a Counselor inside it, each signs in to the
// right portal, unauthorized creation and cross-branch work are refused, and a removed employee loses
// access. Every check prints PASS or FAIL with what it actually saw, so the output is the evidence.
//
// IT WRITES DATA. It creates two branches and four accounts, then deletes the accounts it made. Run it
// on staging, never on an environment whose data matters. It refuses to start without --allow-writes.
//
//   $env:ACCEPTANCE_URL = "https://your-staging-host"
//   $env:SUPER_EMAIL = "boss@example.com"
//   $env:SUPER_PASSWORD = "..."
//   node scripts/acceptance-onboarding.mjs --allow-writes
//
// Everything it creates is named with the run's timestamp, so leftovers from a failed run are obvious.
// Exit code 0 means every check passed.

const base = String(process.env.ACCEPTANCE_URL || "").replace(/\/+$/, "");
const superEmail = process.env.SUPER_EMAIL || "";
const superPassword = process.env.SUPER_PASSWORD || "";
const allowWrites = process.argv.includes("--allow-writes");
const keep = process.argv.includes("--keep");

if (!base || !superEmail || !superPassword) {
  console.error("Set ACCEPTANCE_URL, SUPER_EMAIL and SUPER_PASSWORD. See the top of this file.");
  process.exit(2);
}
if (!allowWrites) {
  console.error("This creates branches and accounts on the target environment. Re-run with --allow-writes once you are sure it is staging.");
  process.exit(2);
}

const stamp = new Date().toISOString().replace(/[^0-9]/g, "").slice(0, 14);
const tag = `acc${stamp}`;
let pass = 0;
let fail = 0;
const failures = [];

function check(name, ok, detail = "") {
  if (ok) { pass += 1; console.log(`PASS  ${name}`); return true; }
  fail += 1;
  failures.push(name);
  console.log(`FAIL  ${name}\n        ${detail}`);
  return false;
}

async function call(method, path, { token, body } = {}) {
  const res = await fetch(base + path, {
    method,
    headers: { "content-type": "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  let json = null;
  const text = await res.text();
  try { json = text ? JSON.parse(text) : null; } catch { json = { raw: text.slice(0, 200) }; }
  return { status: res.status, json };
}
const show = (r) => `status ${r.status} ${JSON.stringify(r.json)?.slice(0, 220)}`;

async function signIn(email, password) {
  const r = await call("POST", "/api/auth/signin", { body: { email, password } });
  return { ok: r.status === 200 && Boolean(r.json?.token), token: r.json?.token, res: r };
}

async function createAccount(token, { email, role, branchId, first = "Acc", last = role }) {
  return call("POST", "/api/users", {
    token,
    body: { email, password: "acceptance-pass-123", firstName: first, lastName: last, role, branchId },
  });
}

const created = { accounts: [], branches: [] };

// ---------------------------------------------------------------- 0. the environment itself
console.log(`\n== Target ${base}\n== Run tag ${tag}\n`);

const health = await call("GET", "/api/health");
if (!check("the server and its database are reachable", health.status === 200 && health.json?.ok === true, show(health))) {
  console.log("\nStopping: nothing else can be trusted if health fails.");
  process.exit(1);
}

const noToken = await call("GET", "/api/me");
check("no token is refused (401)", noToken.status === 401, show(noToken));
const badToken = await call("GET", "/api/me", { token: "not.a.real.token" });
check("a forged token is refused (401)", badToken.status === 401, show(badToken));
const wrongPass = await signIn(superEmail, `${superPassword}-wrong`);
check("a wrong password issues no token (401)", wrongPass.res.status === 401 && !wrongPass.token, show(wrongPass.res));
const publicSignup = await call("POST", "/api/counselor/auth/signup", {
  body: { email: `${tag}.public@example.invalid`, password: "acceptance-pass-123", name: "Public" },
});
check("public counselor sign-up is closed (403)", publicSignup.status === 403, show(publicSignup));

// ---------------------------------------------------------------- 1. the Super Admin
const boss = await signIn(superEmail, superPassword);
if (!check("the Super Admin can sign in", boss.ok, show(boss.res))) {
  console.log("\nStopping: without the Super Admin nothing below can run. Check SUPER_EMAIL / SUPER_PASSWORD,");
  console.log("or create the first Super Admin with scripts/bootstrap-super-admin.mjs.");
  process.exit(1);
}
const bossMe = await call("GET", "/api/me", { token: boss.token });
check("the Super Admin resolves as super_admin", bossMe.json?.access?.role === "super_admin", show(bossMe));

const hrOff = await call("GET", "/api/hr/state", { token: boss.token });
check("HR is switched off for this release (403)", hrOff.status === 403, show(hrOff));

// ---------------------------------------------------------------- 2. two branches to work in
for (const label of ["One", "Two"]) {
  const r = await call("POST", "/api/branches", { token: boss.token, body: { name: `${tag} Branch ${label}`, city: "Testville" } });
  const branchId = r.json?.branch?.id || r.json?.id;
  if (check(`the Super Admin can create branch ${label}`, r.status === 200 && Boolean(branchId), show(r))) {
    created.branches.push({ id: branchId, label });
  }
}
if (created.branches.length < 2) {
  console.log("\nStopping: the onboarding chain needs two branches.");
  process.exit(1);
}
const [B1, B2] = created.branches;

// ---------------------------------------------------------------- 3. Super Admin creates an Admin
const adminEmail = `${tag}.admin@example.invalid`;
const adminRes = await createAccount(boss.token, { email: adminEmail, role: "admin", branchId: B1.id, last: "Admin" });
const adminId = adminRes.json?.id;
check("the Super Admin creates an Admin scoped to branch One", adminRes.status === 200 && Boolean(adminId), show(adminRes));
if (adminId) created.accounts.push(adminId);

const admin = adminId ? await signIn(adminEmail, "acceptance-pass-123") : { ok: false, res: { status: 0, json: null } };
check("the new Admin can sign in", admin.ok, show(admin.res));
if (admin.ok) {
  const me = await call("GET", "/api/me", { token: admin.token });
  check("the Admin resolves as admin", me.json?.access?.role === "admin", show(me));
  const branches = [...(me.json?.access?.branch_ids || []), me.json?.access?.branch_id].filter(Boolean).map(String);
  check("the Admin's scope is branch One only", branches.includes(String(B1.id)) && !branches.includes(String(B2.id)),
    `scope ${JSON.stringify(branches)} expected only ${B1.id}`);
}

// ---------------------------------------------------------------- 4. the Admin onboards employees
const staff = {};
if (admin.ok) {
  for (const role of ["telecaller", "counselor"]) {
    const email = `${tag}.${role}@example.invalid`;
    const r = await createAccount(admin.token, { email, role, branchId: B1.id, last: role });
    const okCreate = check(`the Admin creates a ${role} in their own branch`, r.status === 200 && r.json?.id, show(r));
    if (okCreate) {
      created.accounts.push(r.json.id);
      const session = await signIn(email, "acceptance-pass-123");
      check(`the new ${role} can sign in`, session.ok, show(session.res));
      if (session.ok) {
        staff[role] = { token: session.token, id: r.json.id, email };
        const me = await call("GET", "/api/me", { token: session.token });
        check(`the ${role} resolves as ${role}`, me.json?.access?.role === role, show(me));
      }
    }
  }
}

// ---------------------------------------------------------------- 5. what must be refused
if (admin.ok) {
  for (const role of ["admin", "super_admin", "branch_head"]) {
    const r = await createAccount(admin.token, { email: `${tag}.deny-${role}@example.invalid`, role, branchId: B1.id });
    check(`an Admin cannot create a ${role} (403)`, r.status === 403, show(r));
    if (r.status === 200 && r.json?.id) created.accounts.push(r.json.id);
  }
  const otherBranch = await createAccount(admin.token, { email: `${tag}.deny-branch@example.invalid`, role: "telecaller", branchId: B2.id });
  check("an Admin cannot create staff in a branch they do not hold (403)", otherBranch.status === 403, show(otherBranch));
  if (otherBranch.status === 200 && otherBranch.json?.id) created.accounts.push(otherBranch.json.id);

  const duplicate = await createAccount(admin.token, { email: adminEmail, role: "telecaller", branchId: B1.id });
  check("a duplicate email is refused (400)", duplicate.status === 400, show(duplicate));
}
for (const role of ["telecaller", "counselor"]) {
  if (!staff[role]) continue;
  const r = await createAccount(staff[role].token, { email: `${tag}.deny-by-${role}@example.invalid`, role: "telecaller", branchId: B1.id });
  check(`a ${role} cannot create accounts (403)`, r.status === 403, show(r));
  if (r.status === 200 && r.json?.id) created.accounts.push(r.json.id);
}

// ---------------------------------------------------------------- 6. cross-branch isolation
const admin2Email = `${tag}.admin2@example.invalid`;
const admin2Res = await createAccount(boss.token, { email: admin2Email, role: "admin", branchId: B2.id, last: "Admin2" });
if (check("the Super Admin creates a second Admin in branch Two", admin2Res.status === 200 && admin2Res.json?.id, show(admin2Res))) {
  created.accounts.push(admin2Res.json.id);
  const admin2 = await signIn(admin2Email, "acceptance-pass-123");
  if (check("the branch Two Admin can sign in", admin2.ok, show(admin2.res)) && staff.counselor) {
    const move = await call("POST", `/api/counselors/${staff.counselor.id}/remove`, { token: admin2.token, body: {} });
    check("a branch Two Admin cannot remove branch One staff (403/404)", move.status === 403 || move.status === 404, show(move));
    const roleChange = await call("PUT", `/api/users/${staff.counselor.id}/role`, { token: admin2.token, body: { role: "telecaller" } });
    check("a branch Two Admin cannot change a branch One employee's role (403/404)", roleChange.status === 403 || roleChange.status === 404, show(roleChange));
  }
}

// ---------------------------------------------------------------- 7. account lifecycle
if (staff.counselor) {
  const removed = await call("POST", `/api/counselors/${staff.counselor.id}/remove`, { token: boss.token, body: {} });
  if (check("the Super Admin can remove a Counselor", removed.status === 200, show(removed))) {
    const after = await signIn(staff.counselor.email, "acceptance-pass-123");
    check("a removed Counselor can no longer sign in", !after.ok, show(after.res));
  }
}
if (staff.telecaller) {
  const removed = await call("POST", `/api/telecallers/${staff.telecaller.id}/remove`, { token: boss.token, body: {} });
  if (check("the Super Admin can remove a Telecaller", removed.status === 200, show(removed))) {
    const after = await signIn(staff.telecaller.email, "acceptance-pass-123");
    check("a removed Telecaller can no longer sign in", !after.ok, show(after.res));
  }
}

// ---------------------------------------------------------------- 8. delete is Super Admin only
if (admin.ok && adminId) {
  const byAdmin = await call("POST", `/api/admin/delete/staff/${adminId}`, { token: admin.token, body: { confirm: "DELETE" } });
  check("an Admin cannot delete an account (403)", byAdmin.status === 403, show(byAdmin));
}

// ---------------------------------------------------------------- 9. clean up what this run made
if (keep) {
  console.log("\n--keep given: leaving the created accounts and branches in place.");
} else {
  let removed = 0;
  for (const id of [...created.accounts].reverse()) {
    const r = await call("POST", `/api/admin/delete/staff/${id}`, { token: boss.token, body: { confirm: "DELETE", reason: `acceptance run ${tag}` } });
    if (r.status === 200) removed += 1;
    else console.log(`      note: could not delete account ${id} (${show(r)})`);
  }
  console.log(`\nCleanup: deleted ${removed} of ${created.accounts.length} accounts this run created.`);
  console.log(`Branches named "${tag} Branch One/Two" are left behind: there is no branch delete route. Rename or ignore them.`);
}

// ---------------------------------------------------------------- result
console.log(`\n${pass} passed, ${fail} failed`);
if (fail) {
  console.log("\nFailed checks:");
  for (const name of failures) console.log(`  - ${name}`);
}
process.exit(fail ? 1 : 0);
