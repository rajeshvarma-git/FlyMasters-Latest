import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { decideIdentity, isStrict } from "../server/lib/accountIdentity.mjs";
import { session, anySession, branchScope, signUser, ALL_ROLES } from "../server/lib/auth.mjs";
import { pool } from "../server/lib/db.mjs";
import { viewerRole } from "../server/student/dataPolicy.ts";

const row = (over = {}) => ({ id: "u1", email: "u1@x.com", has_role: true, role: "counselor", branch_id: "b1", is_active: true, membership_ids: ["b1", "b2"], ...over });
const known = { knownRoles: ALL_ROLES };

// ---------- pure decision ----------

test("an existing, enabled account resolves to its SQL role, home branch and memberships", () => {
  const r = decideIdentity(row(), known);
  assert.equal(r.ok, true);
  assert.deepEqual(r.identity, { id: "u1", email: "u1@x.com", role: "counselor", branch_id: "b1", branch_ids: ["b1", "b2"], warnings: [] });
});

test("an unknown account is a 401", () => {
  assert.deepEqual([decideIdentity(null).ok, decideIdentity(null).status], [false, 401]);
});

test("a disabled account is denied", () => {
  const r = decideIdentity(row({ is_active: false }), known);
  assert.deepEqual([r.ok, r.status, r.code], [false, 403, "ACCOUNT_DISABLED"]);
});

test("a missing role: compatible mode keeps today's student fallback but reports it; strict mode refuses", () => {
  const missing = row({ has_role: false, role: null, is_active: null, branch_id: null, membership_ids: [] });
  const loose = decideIdentity(missing, known);
  assert.equal(loose.identity.role, "student");
  assert.deepEqual(loose.identity.warnings, ["missing_role"]);
  const strict = decideIdentity(missing, { ...known, strict: true });
  assert.deepEqual([strict.ok, strict.status, strict.code], [false, 403, "ROLE_NOT_CONFIGURED"]);
});

test("a role outside the known list is refused in both modes", () => {
  assert.equal(decideIdentity(row({ role: "root" }), known).code, "ROLE_INVALID");
  assert.equal(decideIdentity(row({ role: "root" }), { ...known, strict: true }).code, "ROLE_INVALID");
});

test("empty memberships: compatible mode falls back to the home branch and says so; strict mode gives no branch access", () => {
  const empty = row({ membership_ids: [] });
  const loose = decideIdentity(empty, known);
  assert.deepEqual(loose.identity.branch_ids, ["b1"]);
  assert.deepEqual(loose.identity.warnings, ["home_branch_fallback"]);
  assert.deepEqual(decideIdentity(empty, { ...known, strict: true }).identity.branch_ids, []);
});

test("explicit memberships always win over the home branch", () => {
  assert.deepEqual(decideIdentity(row({ branch_id: "b9", membership_ids: ["b1"] }), known).identity.branch_ids, ["b1"]);
});

// ---------- middleware, with the database replaced ----------

const realQuery = pool.query.bind(pool);
const jwtFor = (id = "u1") => signUser({ id, email: "u1@x.com", role: "student" });
const fakeRes = () => ({ code: 200, body: null, status(c) { this.code = c; return this; }, json(b) { this.body = b; return this; } });
async function run(mw, req) {
  const res = fakeRes();
  let nexted = false;
  await mw(req, res, () => { nexted = true; });
  return { res, nexted, req };
}
function withDb(handler, fn) {
  pool.query = async (sql, params) => handler(String(sql), params);
  return fn().finally(() => { pool.query = realQuery; });
}
const bearer = (t) => ({ headers: { authorization: `Bearer ${t}` } });
const identityDb = (r) => (sql) => (sql.includes("FROM auth_users u") ? { rows: r ? [r] : [] } : { rows: [] });

test("session: role is read from SQL on every request; JSON roles play no part", async () => {
  await withDb(identityDb(row({ role: "student" })), async () => {
    const { req, nexted } = await run(session, bearer(jwtFor()));
    assert.equal(nexted, true);
    assert.equal(req.user.role, "student"); // a stale JSON "admin" record cannot change this
  });
});

test("session: a disabled account is refused with its code", async () => {
  await withDb(identityDb(row({ is_active: false })), async () => {
    const { res, nexted } = await run(session, bearer(jwtFor()));
    assert.deepEqual([res.code, res.body.code, nexted], [403, "ACCOUNT_DISABLED", false]);
  });
});

test("session: a database failure is a 500 and never grants access", async () => {
  await withDb(() => { throw new Error("db down"); }, async () => {
    const { res, nexted, req } = await run(session, bearer(jwtFor()));
    assert.deepEqual([res.code, nexted, req.user], [500, false, undefined]);
  });
});

test("session: strict mode refuses an account with no role; compatible mode lets it in as student", async () => {
  const missing = row({ has_role: false, role: null, is_active: null, branch_id: null, membership_ids: [] });
  await withDb(identityDb(missing), async () => {
    process.env.IDENTITY_STRICT = "true";
    try {
      assert.equal(isStrict(), true);
      const strict = await run(session, bearer(jwtFor()));
      assert.deepEqual([strict.res.code, strict.res.body.code, strict.nexted], [403, "ROLE_NOT_CONFIGURED", false]);
    } finally { delete process.env.IDENTITY_STRICT; }
    const loose = await run(session, bearer(jwtFor()));
    assert.deepEqual([loose.nexted, loose.req.user.role], [true, "student"]);
  });
});

test("session: a role or membership change shows on the very next request", async () => {
  let current = row({ role: "counselor" });
  await withDb((sql) => ({ rows: sql.includes("FROM auth_users u") ? [current] : [] }), async () => {
    assert.equal((await run(session, bearer(jwtFor()))).req.user.role, "counselor");
    current = row({ role: "telecaller", membership_ids: ["b2"] });
    const next = (await run(session, bearer(jwtFor()))).req.user;
    assert.deepEqual([next.role, next.branch_ids], ["telecaller", ["b2"]]);
  });
});

test("branchScope: a branch-scoped account with no branch is refused, never given everything", async () => {
  await withDb(identityDb(row({ branch_id: null, membership_ids: [] })), async () => {
    const { req } = await run(session, bearer(jwtFor()));
    const { res, nexted } = await run(branchScope, req);
    assert.deepEqual([res.code, nexted], [403, false]);
  });
});

test("branchScope: strict mode removes the home-branch stand-in", async () => {
  await withDb(identityDb(row({ membership_ids: [] })), async () => {
    process.env.IDENTITY_STRICT = "true";
    try {
      const { req } = await run(session, bearer(jwtFor()));
      assert.deepEqual(req.user.branch_ids, []);
      const { res, nexted } = await run(branchScope, req);
      assert.deepEqual([res.code, nexted], [403, false]);
    } finally { delete process.env.IDENTITY_STRICT; }
  });
});

test("anySession: a student-realm token acts only as a student, even when the account holds a staff role", async () => {
  const db = (sql) => {
    if (sql.includes("FROM auth_sessions")) return { rows: [{ user_id: "u1", expires_at: new Date(Date.now() + 60000), email: "u1@x.com" }] };
    if (sql.includes("FROM auth_users u")) return { rows: [row({ role: "admin" })] };
    return { rows: [] };
  };
  await withDb(db, async () => {
    const { req, nexted } = await run(anySession, bearer("opaque-token"));
    assert.deepEqual([nexted, req.user.role, req.studentRealm, req.user.branch_ids], [true, "student", true, []]);
  });
});

test("anySession: a disabled account is refused on the student path, and a failed lookup is a 500", async () => {
  const sessionRow = { rows: [{ user_id: "u1", expires_at: new Date(Date.now() + 60000), email: "u1@x.com" }] };
  await withDb((sql) => (sql.includes("FROM auth_sessions") ? sessionRow : { rows: [row({ is_active: false })] }), async () => {
    const { res, nexted } = await run(anySession, bearer("opaque-token"));
    assert.deepEqual([res.code, nexted], [403, false]);
  });
  await withDb((sql) => { if (sql.includes("FROM auth_sessions")) return sessionRow; throw new Error("db down"); }, async () => {
    const { res, nexted } = await run(anySession, bearer("opaque-token"));
    assert.deepEqual([res.code, nexted], [500, false]);
  });
});

test("anySession: a valid JWT for a disabled account is refused, not passed to the student realm", async () => {
  await withDb(identityDb(row({ is_active: false })), async () => {
    const { res, nexted } = await run(anySession, bearer(jwtFor()));
    assert.deepEqual([res.code, nexted], [403, false]);
  });
});

// ---------- student data policy ----------

test("viewerRole: SQL student stays student; no row means student; the SQL role is used as is", () => {
  assert.equal(viewerRole([{ role: "student" }]), "student");
  assert.equal(viewerRole([]), "student");
  assert.equal(viewerRole([{ role: "admin" }]), "admin");
});

// ---------- guard against JSON roles coming back ----------

test("no authorization reader consults legacy JSON roles", () => {
  for (const file of ["server/lib/auth.mjs", "server/lib/accountIdentity.mjs", "server/student/dataPolicy.ts", "server/student/studentAuth.ts"]) {
    const src = readFileSync(new URL(`../${file}`, import.meta.url), "utf8")
      .split("\n").filter((l) => !l.trim().startsWith("//") && !l.trim().startsWith("*")).join("\n");
    // The one allowed mention is student signup WRITING its record; that is fixed in ACCESS-02D.
    const reads = src.split("\n").filter((l) => /table_name\s*=\s*'user_roles'/.test(l));
    assert.deepEqual(reads, [], `${file} must not read JSON roles`);
  }
});