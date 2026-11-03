// Launch contract rule 8: HR (attendance, leave, salary) is off unless HR_ENABLED=true.
// The real route handlers run here; only the database is replaced, and every statement is recorded.

process.env.DATABASE_URL = process.env.DATABASE_URL || "postgresql://nobody:nothing@127.0.0.1:1/none";

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import core from "../server/routes/core.mjs";
import counselor from "../server/routes/counselor.mjs";
import { pool } from "../server/lib/db.mjs";
import { hrEnabled } from "../server/lib/hrSwitch.mjs";

const HR_ROUTES = [
  [core, "patch", "/api/leave/:id"],
  [core, "post", "/api/salary"],
  [core, "get", "/api/hr/state"],
  [counselor, "post", "/api/counselor/leave"],
  [counselor, "post", "/api/counselor/attendance"],
  [counselor, "patch", "/api/counselor/attendance/:id"],
];

const handlerOf = (router, method, path) => {
  const layer = router.stack.find((l) => l.route?.path === path && l.route.methods[method]);
  assert.ok(layer, `${method} ${path} not found`);
  return layer.route.stack.at(-1).handle; // the handler itself, after its guards
};

async function call(handler) {
  const sql = [];
  const original = pool.query.bind(pool);
  pool.query = async (text) => { sql.push(String(text).replace(/\s+/g, " ").trim()); return { rows: [] }; };
  const res = { code: 200, body: null, status(c) { this.code = c; return this; }, json(b) { this.body = b; return this; } };
  const req = { params: { id: "1" }, body: {}, user: { id: "u1", role: "admin" }, scope: { allBranches: true, branchIds: [] } };
  let threw = false;
  try { await handler(req, res); } catch { threw = true; } finally { pool.query = original; }
  return { res, sql, threw };
}

test("hrEnabled is true only for the word true, in any case", () => {
  const was = process.env.HR_ENABLED;
  try {
    for (const [value, expected] of [[undefined, false], ["", false], ["false", false], ["1", false], ["yes", false], ["true", true], ["TRUE", true], [" true ", true]]) {
      if (value === undefined) delete process.env.HR_ENABLED; else process.env.HR_ENABLED = value;
      assert.equal(hrEnabled(), expected, String(value));
    }
  } finally {
    if (was === undefined) delete process.env.HR_ENABLED; else process.env.HR_ENABLED = was;
  }
});

for (const [router, method, path] of HR_ROUTES) {
  test(`${method.toUpperCase()} ${path}: refused with HR_DISABLED, and no statement reaches the database, while HR is off`, async () => {
    const was = process.env.HR_ENABLED;
    delete process.env.HR_ENABLED;
    try {
      const { res, sql, threw } = await call(handlerOf(router, method, path));
      assert.equal(threw, false);
      assert.equal(res.code, 403);
      assert.equal(res.body.code, "HR_DISABLED");
      assert.deepEqual(sql, []);
    } finally {
      if (was !== undefined) process.env.HR_ENABLED = was;
    }
  });

  test(`${method.toUpperCase()} ${path}: HR_ENABLED=true lets the request reach its normal handler`, async () => {
    const was = process.env.HR_ENABLED;
    process.env.HR_ENABLED = "true";
    try {
      const { res } = await call(handlerOf(router, method, path));
      assert.notEqual(res.body?.code, "HR_DISABLED");
    } finally {
      if (was === undefined) delete process.env.HR_ENABLED; else process.env.HR_ENABLED = was;
    }
  });
}

test("the state payloads send no leave, attendance or salary rows while HR is off", () => {
  const coreSrc = readFileSync(new URL("../server/routes/core.mjs", import.meta.url), "utf8");
  const counselorSrc = readFileSync(new URL("../server/routes/counselor.mjs", import.meta.url), "utf8");
  assert.match(coreSrc, /leave: hrEnabled\(\) \? sqlLeave\.rows : \[\]/);
  assert.match(coreSrc, /attendance: \(hrEnabled\(\) \? sqlAtt\.rows : \[\]\)\.map/);
  assert.match(coreSrc, /salary: \(hrEnabled\(\) \? sqlSalary\.rows : \[\]\)\.map/);
  assert.match(counselorSrc, /leave: hrEnabled\(\) \? leave\.rows : \[\]/);
  assert.match(counselorSrc, /attendance: \(hrEnabled\(\) \? attendance\.rows : \[\]\)\.map/);
  assert.match(counselorSrc, /salary: \(hrEnabled\(\) \? salary\.rows : \[\]\)\.map/);
});
