// ACCESS-02C: every way into the system treats the same account the same way.
//
// One account row is fed to three entry points (the opaque student session in the API,
// the student portal's session lookup, and the student data API's viewer) and to the
// staff JWT path. Missing role, disabled account and database failure must come out
// consistently, in compatible and in strict mode.

process.env.DATABASE_URL = process.env.DATABASE_URL || "postgresql://nobody:nothing@127.0.0.1:1/none";

import test from "node:test";
import assert from "node:assert/strict";
import { anySession, session, signUser } from "../server/lib/auth.mjs";
import { pool as apiPool } from "../server/lib/db.mjs";
import { getPool as studentPool } from "../server/student/postgres.ts";
import { getSessionByToken } from "../server/student/studentAuth.ts";
import { viewerFromRequest } from "../server/student/dataPolicy.ts";

const account = (over = {}) => ({ id: "u1", email: "u1@x.com", has_role: true, role: "student", branch_id: null, is_active: true, membership_ids: [], ...over });
const noRole = account({ has_role: false, role: null, is_active: null });
const future = () => new Date(Date.now() + 60_000);

/** One fake database for both pool objects the code uses. `mode` picks the account's state. */
function withAccount(state, fn) {
  const handler = async (sql) => {
    const text = String(sql);
    if (state === "db-down" && text.includes("FROM auth_users u")) throw new Error("db down");
    if (text.includes("FROM auth_users u")) return { rows: [state === "missing" ? noRole : state === "disabled" ? account({ is_active: false }) : account()] };
    if (text.includes("FROM auth_sessions s") && text.includes("user_metadata")) return { rows: [{ token: "tok", expires_at: future(), id: "u1", email: "u1@x.com", user_metadata: {} }] };
    if (text.includes("FROM auth_sessions s")) return { rows: [{ user_id: "u1", expires_at: future(), email: "u1@x.com" }] };
    return { rows: [] };
  };
  const pools = [apiPool, studentPool()];
  const originals = pools.map((p) => p.query.bind(p));
  const originalConnect = studentPool().connect.bind(studentPool());
  pools.forEach((p) => { p.query = handler; });
  // The student schema bootstrap opens a client; give it one that touches no database.
  studentPool().connect = async () => ({ query: async () => ({ rows: [{ count: 1 }], rowCount: 1 }), release: () => {} });
  return Promise.resolve(fn()).finally(() => {
    pools.forEach((p, i) => { p.query = originals[i]; });
    studentPool().connect = originalConnect;
  });
}

const fakeRes = () => ({ code: 200, body: null, status(c) { this.code = c; return this; }, json(b) { this.body = b; return this; } });
async function viaApi(mw, token) {
  const res = fakeRes();
  let next = false;
  const req = { headers: { authorization: `Bearer ${token}` } };
  await mw(req, res, () => { next = true; });
  return { allowed: next, status: next ? 200 : res.code, role: req.user?.role };
}
const viaPortal = async () => {
  try { return { allowed: !!(await getSessionByToken("tok")), threw: false }; } catch { return { allowed: false, threw: true }; }
};
const viaDataApi = async () => {
  try { return { allowed: !!(await viewerFromRequest({ headers: { authorization: "Bearer tok" } })), threw: false }; } catch { return { allowed: false, threw: true }; }
};
const jwt = () => signUser({ id: "u1", email: "u1@x.com", role: "student" });

async function allPaths() {
  return {
    apiStudentToken: await viaApi(anySession, "opaque-student-token"),
    apiStaffJwt: await viaApi(session, jwt()),
    portalSession: await viaPortal(),
    dataApi: await viaDataApi(),
  };
}

test("healthy student: allowed on every path, always as a student", async () => {
  await withAccount("ok", async () => {
    const r = await allPaths();
    assert.deepEqual([r.apiStudentToken.allowed, r.apiStaffJwt.allowed, r.portalSession.allowed, r.dataApi.allowed], [true, true, true, true]);
    assert.equal(r.apiStudentToken.role, "student");
  });
});

test("disabled account: refused on every path", async () => {
  await withAccount("disabled", async () => {
    const r = await allPaths();
    assert.deepEqual([r.apiStudentToken.allowed, r.apiStaffJwt.allowed, r.portalSession.allowed, r.dataApi.allowed], [false, false, false, false]);
    assert.deepEqual([r.apiStudentToken.status, r.apiStaffJwt.status], [403, 403]);
  });
});

test("missing role, compatible mode: every path agrees (allowed as a student)", async () => {
  await withAccount("missing", async () => {
    const r = await allPaths();
    assert.deepEqual([r.apiStudentToken.allowed, r.apiStaffJwt.allowed, r.portalSession.allowed, r.dataApi.allowed], [true, true, true, true]);
    assert.deepEqual([r.apiStudentToken.role, r.apiStaffJwt.role], ["student", "student"]);
  });
});

test("missing role, strict mode: every path refuses the same account", async () => {
  process.env.IDENTITY_STRICT = "true";
  try {
    await withAccount("missing", async () => {
      const r = await allPaths();
      assert.deepEqual([r.apiStudentToken.allowed, r.apiStaffJwt.allowed, r.portalSession.allowed, r.dataApi.allowed], [false, false, false, false]);
      assert.deepEqual([r.apiStudentToken.status, r.apiStaffJwt.status], [403, 403]);
    });
  } finally { delete process.env.IDENTITY_STRICT; }
});

test("database failure on the identity lookup: no path grants access", async () => {
  await withAccount("db-down", async () => {
    const r = await allPaths();
    assert.deepEqual([r.apiStudentToken.allowed, r.apiStaffJwt.allowed, r.portalSession.allowed, r.dataApi.allowed], [false, false, false, false]);
    assert.deepEqual([r.apiStudentToken.status, r.apiStaffJwt.status], [500, 500]);
    assert.equal(r.portalSession.threw && r.dataApi.threw, true, "student paths surface the failure instead of treating it as allowed");
  });
});

test("the student token stays a student even when the account holds a staff role", async () => {
  const staff = account({ role: "admin", branch_id: "b1", membership_ids: ["b1"] });
  const handler = async (sql) => {
    const t = String(sql);
    if (t.includes("FROM auth_users u")) return { rows: [staff] };
    if (t.includes("FROM auth_sessions s")) return { rows: [{ user_id: "u1", expires_at: future(), email: "u1@x.com" }] };
    return { rows: [] };
  };
  const original = apiPool.query.bind(apiPool);
  apiPool.query = handler;
  try {
    const r = await viaApi(anySession, "opaque-student-token");
    assert.deepEqual([r.allowed, r.role], [true, "student"]);
  } finally { apiPool.query = original; }
});