// import test from "node:test";
// import assert from "node:assert/strict";
// import { readFileSync } from "node:fs";
// import { assignRole, setAccountBranches, createAccount, upsertUserRole, needsBranch, AccountWriteError } from "../server/lib/accountWrites.mjs";

// // ---------- a recording pool: proves transactions, ordering and rollback without a database ----------

// function fakePool(handler) {
//   const log = [];
//   const client = {
//     query: async (sql, params) => {
//       const text = String(sql).replace(/\s+/g, " ").trim();
//       log.push(text.split(" ").slice(0, 3).join(" "));
//       const r = await handler(text, params);
//       return r || { rows: [] };
//     },
//     release: () => log.push("RELEASE"),
//   };
//   return { log, connect: async () => client };
// }

// test("needsBranch: branch-scoped roles need one; admin, super admin, partner and student do not", () => {
//   for (const r of ["branch_head", "counselor", "telecaller", "accountant"]) assert.equal(needsBranch(r), true, r);
//   for (const r of ["admin", "super_admin", "partner", "student"]) assert.equal(needsBranch(r), false, r);
// });

// test("role change keeps the existing branch: the update uses the caller's branch, not a Head Office default", async () => {
//   let sql = "";
//   const pool = fakePool((text) => {
//     if (text.startsWith("INSERT INTO user_roles")) { sql = text; return { rows: [{ user_id: "u1", role: "telecaller", branch_id: "b1" }] }; }
//   });
//   await assignRole(pool, { userId: "u1", role: "telecaller" });
//   // The update branch must be COALESCE($3, user_roles.branch_id) with $3 the raw argument.
//   assert.match(sql, /branch_id = COALESCE\(\$3::uuid, user_roles\.branch_id\)/);
//   assert.doesNotMatch(sql, /EXCLUDED\.branch_id/);
// });

// test("moving into a branch-scoped role with no branch is refused and rolled back", async () => {
//   const pool = fakePool((text) => {
//     if (text.startsWith("INSERT INTO user_roles")) return { rows: [{ user_id: "u1", role: "counselor", branch_id: null }] };
//   });
//   await assert.rejects(() => assignRole(pool, { userId: "u1", role: "counselor" }), (e) => e instanceof AccountWriteError && e.status === 400);
//   assert.deepEqual(pool.log.filter((l) => /^(BEGIN|COMMIT|ROLLBACK)/.test(l)), ["BEGIN", "ROLLBACK"]);
//   assert.equal(pool.log.at(-1), "RELEASE");
// });

// test("a scoped role with a home branch and no memberships gets its membership in the same transaction", async () => {
//   const pool = fakePool((text) => {
//     if (text.startsWith("INSERT INTO user_roles")) return { rows: [{ user_id: "u1", role: "telecaller", branch_id: "b1" }] };
//   });
//   await assignRole(pool, { userId: "u1", role: "telecaller" });
//   assert.deepEqual(pool.log, ["BEGIN", "INSERT INTO user_roles", "INSERT INTO user_branches", "COMMIT", "RELEASE"]);
// });

// test("a non-scoped role change writes no membership", async () => {
//   const pool = fakePool((text) => {
//     if (text.startsWith("INSERT INTO user_roles")) return { rows: [{ user_id: "u1", role: "admin", branch_id: "b1" }] };
//   });
//   await assignRole(pool, { userId: "u1", role: "admin" });
//   assert.deepEqual(pool.log, ["BEGIN", "INSERT INTO user_roles", "COMMIT", "RELEASE"]);
// });

// test("setAccountBranches: memberships and home branch change in one transaction", async () => {
//   const pool = fakePool((text) => { if (text.startsWith("SELECT role")) return { rows: [{ role: "telecaller" }] }; });
//   const ids = await setAccountBranches(pool, { userId: "u1", branchIds: ["b2", "b3", "b2"] });
//   assert.deepEqual(ids, ["b2", "b3"]);
//   assert.deepEqual(pool.log, ["BEGIN", "SELECT role FROM", "DELETE FROM user_branches", "INSERT INTO user_branches", "UPDATE user_roles SET", "COMMIT", "RELEASE"]);
// });

// test("setAccountBranches: a failure part-way rolls everything back", async () => {
//   const pool = fakePool((text) => {
//     if (text.startsWith("SELECT role")) return { rows: [{ role: "telecaller" }] };
//     if (text.startsWith("INSERT INTO user_branches")) throw new Error("boom");
//   });
//   await assert.rejects(() => setAccountBranches(pool, { userId: "u1", branchIds: ["b1"] }), /boom/);
//   assert.ok(pool.log.includes("ROLLBACK"));
//   assert.ok(!pool.log.includes("COMMIT"));
// });

// test("setAccountBranches: a scoped role cannot be left with no branch; an account with no role is refused", async () => {
//   const scoped = fakePool((text) => { if (text.startsWith("SELECT role")) return { rows: [{ role: "counselor" }] }; });
//   await assert.rejects(() => setAccountBranches(scoped, { userId: "u1", branchIds: [] }), (e) => e.status === 400);
//   assert.ok(!scoped.log.some((l) => l.startsWith("DELETE")), "nothing is deleted before the check");
//   const none = fakePool(() => ({ rows: [] }));
//   await assert.rejects(() => setAccountBranches(none, { userId: "ghost", branchIds: ["b1"] }), (e) => e.status === 409);
// });

// test("setAccountBranches: an admin may be given no branches (no scoped role)", async () => {
//   const pool = fakePool((text) => { if (text.startsWith("SELECT role")) return { rows: [{ role: "admin" }] }; });
//   assert.deepEqual(await setAccountBranches(pool, { userId: "u1", branchIds: [] }), []);
// });

// test("createAccount: login, role and memberships are one transaction; a scoped role without a branch writes nothing", async () => {
//   const pool = fakePool((text) => { if (text.startsWith("INSERT INTO user_roles")) return { rows: [{ user_id: "u1" }] }; });
//   await createAccount(pool, { id: "u1", email: "a@b.c", passwordHash: "h", role: "telecaller", branchIds: ["b1"] });
//   assert.deepEqual(pool.log, ["BEGIN", "INSERT INTO auth_users", "INSERT INTO user_roles", "DELETE FROM user_branches", "INSERT INTO user_branches", "COMMIT", "RELEASE"]);
//   const empty = fakePool(() => ({ rows: [] }));
//   await assert.rejects(() => createAccount(empty, { id: "u2", email: "x@y.z", passwordHash: "h", role: "counselor", branchIds: [] }), (e) => e.status === 400);
//   assert.deepEqual(empty.log, [], "no connection was even opened");
// });

// test("createAccount: a role failure after the login insert rolls the login back; a duplicate email is a 400", async () => {
//   const fail = fakePool((text) => { if (text.startsWith("INSERT INTO user_roles")) throw new Error("role write failed"); });
//   await assert.rejects(() => createAccount(fail, { id: "u1", email: "a@b.c", passwordHash: "h", role: "admin" }), /role write failed/);
//   assert.ok(fail.log.includes("ROLLBACK") && !fail.log.includes("COMMIT"));
//   const dup = fakePool((text) => { if (text.startsWith("INSERT INTO auth_users")) throw Object.assign(new Error("dup"), { code: "23505" }); });
//   await assert.rejects(() => createAccount(dup, { id: "u1", email: "a@b.c", passwordHash: "h", role: "admin" }), (e) => e.status === 400);
// });

// test("upsertUserRole: students can opt out of the Head Office default so they carry no branch", async () => {
//   let params;
//   const db = { query: async (_s, p) => { params = p; return { rows: [{}] }; } };
//   await upsertUserRole(db, { userId: "u1", role: "student", defaultToHeadOffice: false });
//   assert.equal(params[4], false);
//   await assert.rejects(() => upsertUserRole(db, { userId: "", role: "student" }), AccountWriteError);
// });

// // ---------- source guards: the old unsafe paths cannot come back ----------

// const src = (f) => readFileSync(new URL(`../${f}`, import.meta.url), "utf8");

// test("student signup writes the role as a SQL row, not a legacy JSON record", () => {
//   const s = src("server/student/studentAuth.ts");
//   assert.match(s, /upsertUserRole\(client/);
//   assert.doesNotMatch(s, /record\("user_roles"/);
// });

// test("the Users, branches and create-user routes go through accountWrites, not separate statements", () => {
//   const s = src("server/routes/core.mjs");
//   assert.match(s, /assignRole\(pool/);
//   assert.match(s, /setAccountBranches\(pool/);
//   assert.match(s, /createAccount\(pool/);
//   assert.doesNotMatch(s, /setUserBranches\(/);
//   assert.doesNotMatch(s, /UPDATE user_roles SET branch_id/);
// });

// test("publishing a counselor profile assigns a role only to a newly created account", () => {
//   for (const f of ["server/routes/core.mjs", "server/routes/counselor.mjs"]) {
//     const s = src(f);
//     assert.match(s, /if \(isNewAccount\) await assignRole/, f);
//     assert.doesNotMatch(s, /role: "counselor" \}\);\n  \}\n\n  const profiles/, f);
//   }
// });

// test("writeUserRole delegates to the one role writer that keeps the existing branch", () => {
//   const s = src("server/lib/db.mjs");
//   assert.doesNotMatch(s, /INSERT INTO user_roles/);
//   assert.match(s, /upsertUserRole\(pool/);
// });

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { assignRole, setAccountBranches, createAccount, upsertUserRole, needsBranch, AccountWriteError } from "../server/lib/accountWrites.mjs";

// ---------- a recording pool: proves transactions, ordering and rollback without a database ----------

function fakePool(handler, { accountExists = true } = {}) {
  const log = [];
  const client = {
    query: async (sql, params) => {
      const text = String(sql).replace(/\s+/g, " ").trim();
      log.push(text.split(" ").slice(0, 3).join(" "));
      if (text.startsWith("SELECT 1 FROM auth_users")) return { rows: accountExists ? [{ "?column?": 1 }] : [] };
      const r = await handler(text, params);
      return r || { rows: [] };
    },
    release: () => log.push("RELEASE"),
  };
  return { log, connect: async () => client };
}

test("needsBranch: branch-scoped roles need one; admin, super admin, partner and student do not", () => {
  for (const r of ["branch_head", "counselor", "telecaller", "accountant"]) assert.equal(needsBranch(r), true, r);
  for (const r of ["admin", "super_admin", "partner", "student"]) assert.equal(needsBranch(r), false, r);
});

test("role change keeps the existing branch: the update uses the caller's branch, not a Head Office default", async () => {
  let sql = "";
  const pool = fakePool((text) => {
    if (text.startsWith("INSERT INTO user_roles")) { sql = text; return { rows: [{ user_id: "u1", role: "telecaller", branch_id: "b1" }] }; }
  });
  await assignRole(pool, { userId: "u1", role: "telecaller" });
  // The update branch must be COALESCE($3, user_roles.branch_id) with $3 the raw argument.
  assert.match(sql, /branch_id = COALESCE\(\$3::uuid, user_roles\.branch_id\)/);
  assert.doesNotMatch(sql, /EXCLUDED\.branch_id/);
});

test("moving into a branch-scoped role with no branch is refused and rolled back", async () => {
  const pool = fakePool((text) => {
    if (text.startsWith("INSERT INTO user_roles")) return { rows: [{ user_id: "u1", role: "counselor", branch_id: null }] };
  });
  await assert.rejects(() => assignRole(pool, { userId: "u1", role: "counselor" }), (e) => e instanceof AccountWriteError && e.status === 400);
  assert.deepEqual(pool.log.filter((l) => /^(BEGIN|COMMIT|ROLLBACK)/.test(l)), ["BEGIN", "ROLLBACK"]);
  assert.equal(pool.log.at(-1), "RELEASE");
});

test("a scoped role with a home branch and no memberships gets its membership in the same transaction", async () => {
  const pool = fakePool((text) => {
    if (text.startsWith("INSERT INTO user_roles")) return { rows: [{ user_id: "u1", role: "telecaller", branch_id: "b1" }] };
  });
  await assignRole(pool, { userId: "u1", role: "telecaller" });
  assert.deepEqual(pool.log, ["BEGIN", "SELECT 1 FROM", "INSERT INTO user_roles", "SELECT branch_id FROM", "INSERT INTO user_branches", "COMMIT", "RELEASE"]);
});

test("a non-scoped role change writes no membership", async () => {
  const pool = fakePool((text) => {
    if (text.startsWith("INSERT INTO user_roles")) return { rows: [{ user_id: "u1", role: "admin", branch_id: "b1" }] };
  });
  await assignRole(pool, { userId: "u1", role: "admin" });
  assert.deepEqual(pool.log, ["BEGIN", "SELECT 1 FROM", "INSERT INTO user_roles", "COMMIT", "RELEASE"]);
});

test("setAccountBranches: memberships and home branch change in one transaction", async () => {
  const pool = fakePool((text) => { if (text.startsWith("SELECT role")) return { rows: [{ role: "telecaller" }] }; });
  const ids = await setAccountBranches(pool, { userId: "u1", branchIds: ["b2", "b3", "b2"] });
  assert.deepEqual(ids, ["b2", "b3"]);
  assert.deepEqual(pool.log, ["BEGIN", "SELECT 1 FROM", "SELECT role FROM", "DELETE FROM user_branches", "INSERT INTO user_branches", "UPDATE user_roles SET", "COMMIT", "RELEASE"]);
});

test("setAccountBranches: a failure part-way rolls everything back", async () => {
  const pool = fakePool((text) => {
    if (text.startsWith("SELECT role")) return { rows: [{ role: "telecaller" }] };
    if (text.startsWith("INSERT INTO user_branches")) throw new Error("boom");
  });
  await assert.rejects(() => setAccountBranches(pool, { userId: "u1", branchIds: ["b1"] }), /boom/);
  assert.ok(pool.log.includes("ROLLBACK"));
  assert.ok(!pool.log.includes("COMMIT"));
});

test("setAccountBranches: a scoped role cannot be left with no branch; an account with no role is refused", async () => {
  const scoped = fakePool((text) => { if (text.startsWith("SELECT role")) return { rows: [{ role: "counselor" }] }; });
  await assert.rejects(() => setAccountBranches(scoped, { userId: "u1", branchIds: [] }), (e) => e.status === 400);
  assert.ok(!scoped.log.some((l) => l.startsWith("DELETE")), "nothing is deleted before the check");
  const none = fakePool(() => ({ rows: [] }));
  await assert.rejects(() => setAccountBranches(none, { userId: "ghost", branchIds: ["b1"] }), (e) => e.status === 409);
});

test("setAccountBranches: an admin may be given no branches (no scoped role)", async () => {
  const pool = fakePool((text) => { if (text.startsWith("SELECT role")) return { rows: [{ role: "admin" }] }; });
  assert.deepEqual(await setAccountBranches(pool, { userId: "u1", branchIds: [] }), []);
});

test("createAccount: login, role and memberships are one transaction; a scoped role without a branch writes nothing", async () => {
  const pool = fakePool((text) => { if (text.startsWith("INSERT INTO user_roles")) return { rows: [{ user_id: "u1" }] }; });
  await createAccount(pool, { id: "u1", email: "a@b.c", passwordHash: "h", role: "telecaller", branchIds: ["b1"] });
  assert.deepEqual(pool.log, ["BEGIN", "INSERT INTO auth_users", "SELECT 1 FROM", "INSERT INTO user_roles", "DELETE FROM user_branches", "INSERT INTO user_branches", "COMMIT", "RELEASE"]);
  const empty = fakePool(() => ({ rows: [] }));
  await assert.rejects(() => createAccount(empty, { id: "u2", email: "x@y.z", passwordHash: "h", role: "counselor", branchIds: [] }), (e) => e.status === 400);
  assert.deepEqual(empty.log, [], "no connection was even opened");
});

test("createAccount: a role failure after the login insert rolls the login back; a duplicate email is a 400", async () => {
  const fail = fakePool((text) => { if (text.startsWith("INSERT INTO user_roles")) throw new Error("role write failed"); });
  await assert.rejects(() => createAccount(fail, { id: "u1", email: "a@b.c", passwordHash: "h", role: "admin" }), /role write failed/);
  assert.ok(fail.log.includes("ROLLBACK") && !fail.log.includes("COMMIT"));
  const dup = fakePool((text) => { if (text.startsWith("INSERT INTO auth_users")) throw Object.assign(new Error("dup"), { code: "23505" }); });
  await assert.rejects(() => createAccount(dup, { id: "u1", email: "a@b.c", passwordHash: "h", role: "admin" }), (e) => e.status === 400);
});

test("upsertUserRole never picks a branch: a new row without one has none", async () => {
  let params;
  const db = { query: async (sql, p) => { if (String(sql).startsWith("SELECT 1")) return { rows: [{}] }; params = p; return { rows: [{}] }; } };
  await upsertUserRole(db, { userId: "u1", role: "student" });
  assert.equal(params[2], null, "branch is null unless the caller named one");
  await assert.rejects(() => upsertUserRole(db, { userId: "", role: "student" }), AccountWriteError);
});

// ---------- regression: rollback review ----------

test("upsertUserRole given a pool runs account check, role and membership as one transaction on one connection", async () => {
  const pool = fakePool((text) => { if (text.startsWith("INSERT INTO user_roles")) return { rows: [{ user_id: "u1", role: "telecaller", branch_id: "b1" }] }; });
  await upsertUserRole(pool, { userId: "u1", role: "telecaller", branchId: "b1" });
  assert.deepEqual(pool.log, ["BEGIN", "SELECT 1 FROM", "INSERT INTO user_roles", "INSERT INTO user_branches", "COMMIT", "RELEASE"]);
});

test("upsertUserRole given a pool rolls the role back when the membership insert fails", async () => {
  const pool = fakePool((text) => {
    if (text.startsWith("INSERT INTO user_roles")) return { rows: [{ user_id: "u1", role: "telecaller", branch_id: "b1" }] };
    if (text.startsWith("INSERT INTO user_branches")) throw new Error("membership failed");
  });
  await assert.rejects(() => upsertUserRole(pool, { userId: "u1", role: "telecaller", branchId: "b1" }), /membership failed/);
  assert.deepEqual(pool.log.filter((l) => /^(BEGIN|COMMIT|ROLLBACK)/.test(l)), ["BEGIN", "ROLLBACK"]);
  assert.equal(pool.log.at(-1), "RELEASE");
});

test("upsertUserRole given an open client joins the caller's transaction instead of starting another", async () => {
  const pool = fakePool((text) => { if (text.startsWith("INSERT INTO user_roles")) return { rows: [{ user_id: "u1", role: "telecaller", branch_id: "b1" }] }; });
  const client = await pool.connect();
  await upsertUserRole(client, { userId: "u1", role: "telecaller", branchId: "b1" });
  assert.ok(!pool.log.includes("BEGIN") && !pool.log.includes("COMMIT"), "the caller owns BEGIN/COMMIT");
});

// ---------- regression: the four findings from the 02D review ----------

test("F1: no SQL statement assigns Head Office by default", () => {
  const s = src("server/lib/accountWrites.mjs") + src("server/lib/db.mjs");
  assert.doesNotMatch(s, /code\s*=\s*'HO'/);
  assert.doesNotMatch(s, /defaultToHeadOffice/);
});

test("F1: a role-less account moving into a scoped role is refused, never given a branch", async () => {
  const pool = fakePool((text) => {
    if (text.startsWith("INSERT INTO user_roles")) return { rows: [{ user_id: "u1", role: "telecaller", branch_id: null }] };
  });
  await assert.rejects(() => assignRole(pool, { userId: "u1", role: "telecaller" }), (e) => e.status === 400);
  assert.ok(pool.log.includes("ROLLBACK") && !pool.log.includes("COMMIT"));
});

test("F2: naming a home branch also makes it a membership (roles that work at a branch)", async () => {
  const pool = fakePool((text) => { if (text.startsWith("INSERT INTO user_roles")) return { rows: [{ user_id: "u1", role: "telecaller", branch_id: "b2" }] }; });
  await upsertUserRole(await pool.connect(), { userId: "u1", role: "telecaller", branchId: "b2" });
  assert.ok(pool.log.includes("INSERT INTO user_branches"));
  const student = fakePool((text) => { if (text.startsWith("INSERT INTO user_roles")) return { rows: [{ user_id: "u2", role: "student", branch_id: "b2" }] }; });
  await upsertUserRole(await student.connect(), { userId: "u2", role: "student", branchId: "b2" });
  assert.ok(!student.log.includes("INSERT INTO user_branches"), "students are not given memberships");
});

test("F2: a role change never papers over a home branch that is not among the memberships", async () => {
  const pool = fakePool((text) => {
    if (text.startsWith("INSERT INTO user_roles")) return { rows: [{ user_id: "u1", role: "counselor", branch_id: "b9" }] };
    if (text.startsWith("SELECT branch_id")) return { rows: [{ branch_id: "b1" }] };
  });
  await assert.rejects(() => assignRole(pool, { userId: "u1", role: "counselor" }), (e) => e.status === 409);
  assert.ok(pool.log.includes("ROLLBACK") && !pool.log.includes("COMMIT"));
});

test("F3: every writer refuses an account that does not exist, before writing anything", async () => {
  for (const run of [
    (p) => assignRole(p, { userId: "ghost", role: "admin" }),
    (p) => upsertUserRole(p, { userId: "ghost", role: "student" }),
    (p) => setAccountBranches(p, { userId: "ghost", branchIds: ["b1"] }),
  ]) {
    const pool = fakePool(() => ({ rows: [{ role: "admin" }] }), { accountExists: false });
    pool.query = (sql, params) => pool.connect().then((c) => c.query(sql, params));
    await assert.rejects(() => run(pool), (e) => e instanceof AccountWriteError && e.status === 404);
    assert.ok(!pool.log.some((l) => /^(INSERT INTO user_|DELETE|UPDATE)/.test(l)), "nothing was written");
  }
});

test("F4: self-registration creates account and role together, with no branch and no branch access", async () => {
  const pool = fakePool((text) => { if (text.startsWith("INSERT INTO user_roles")) return { rows: [{ user_id: "t1" }] }; });
  await createAccount(pool, { id: "t1", email: "t@x.y", passwordHash: "h", role: "telecaller", allowUnassigned: true });
  assert.deepEqual(pool.log, ["BEGIN", "INSERT INTO auth_users", "SELECT 1 FROM", "INSERT INTO user_roles", "DELETE FROM user_branches", "COMMIT", "RELEASE"]);
  const strict = fakePool(() => ({ rows: [] }));
  await assert.rejects(() => createAccount(strict, { id: "t2", email: "x@y.z", passwordHash: "h", role: "telecaller" }), (e) => e.status === 400);
});

test("F4: admin, telecaller and partner provisioning routes use the transactional writer", () => {
  const s = src("server/routes/core.mjs");
  assert.equal((s.match(/await createAccount\(pool/g) || []).length, 5, "create-user, admin, telecaller and partner signups, and counselor publishing");
  assert.doesNotMatch(s, /jsonUpsert\("user_roles", \{ id: `role-\$\{(id|userId)\}`/);
});

// ---------- source guards: the old unsafe paths cannot come back ----------

const src = (f) => readFileSync(new URL(`../${f}`, import.meta.url), "utf8");

test("student signup writes the role as a SQL row, not a legacy JSON record", () => {
  const s = src("server/student/studentAuth.ts");
  assert.match(s, /upsertUserRole\(client/);
  assert.doesNotMatch(s, /record\("user_roles"/);
});

test("the Users, branches and create-user routes go through accountWrites, not separate statements", () => {
  const s = src("server/routes/core.mjs");
  assert.match(s, /assignRole\(pool/);
  assert.match(s, /setAccountBranches\(pool/);
  assert.match(s, /createAccount\(pool/);
  assert.doesNotMatch(s, /setUserBranches\(/);
  assert.doesNotMatch(s, /UPDATE user_roles SET branch_id/);
});

test("publishing a counselor profile creates login and role in one step, and never touches an existing account's role", () => {
  for (const f of ["server/routes/core.mjs", "server/routes/counselor.mjs"]) {
    const body = src(f).replace(/\r\n/g, "\n").split("async function publishCounselorAccount")[1].split("\n}\n")[0];
    assert.match(body, /await createAccount\(pool/, f);
    assert.doesNotMatch(body, /assignRole\(/, f + ": no separate role step after the login insert");
    assert.doesNotMatch(body, /INSERT INTO auth_users/, f + ": no bare login insert");
    assert.doesNotMatch(body, /user_roles/, f + ": publishing never writes roles directly");
  }
});

test("writeUserRole delegates to the one role writer that keeps the existing branch", () => {
  const s = src("server/lib/db.mjs");
  assert.doesNotMatch(s, /INSERT INTO user_roles/);
  assert.match(s, /upsertUserRole\(pool/);
});