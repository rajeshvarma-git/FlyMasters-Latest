// Launch contract rule 8: HR (attendance, leave, salary) is off unless HR_ENABLED=true.
// The real route handlers run here; only the database is replaced, and every statement is recorded.

process.env.DATABASE_URL = process.env.DATABASE_URL || "postgresql://nobody:nothing@127.0.0.1:1/none";

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import core from "../server/routes/core.mjs";
import counselor from "../server/routes/counselor.mjs";
import { pool } from "../server/lib/db.mjs";
import { counselorHrEnabled, hrEnabled, telecallerHrEnabled } from "../server/lib/hrSwitch.mjs";

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

/**
 * Runs `body` with every HR switch forced to a known state, then restores them.
 *
 * All three matter, not just HR_ENABLED: TELECALLER_HR_ENABLED and COUNSELOR_HR_ENABLED override it
 * per portal, and a developer with one of those in their .env would otherwise see "HR is off" tests
 * fail while the same tests passed everywhere else. The switches are the thing under test, so the
 * test must not inherit them from whoever is running it.
 */
async function withHrSwitches({ hr, telecaller, counselor }, body) {
  const names = ["HR_ENABLED", "TELECALLER_HR_ENABLED", "COUNSELOR_HR_ENABLED"];
  const saved = names.map((name) => [name, process.env[name]]);
  const set = (name, value) => { if (value === undefined) delete process.env[name]; else process.env[name] = value; };
  set("HR_ENABLED", hr);
  set("TELECALLER_HR_ENABLED", telecaller);
  set("COUNSELOR_HR_ENABLED", counselor);
  try {
    return await body();
  } finally {
    for (const [name, value] of saved) set(name, value);
  }
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
    await withHrSwitches({}, async () => {
      const { res, sql, threw } = await call(handlerOf(router, method, path));
      assert.equal(threw, false);
      assert.equal(res.code, 403);
      assert.equal(res.body.code, "HR_DISABLED");
      assert.deepEqual(sql, []);
    });
  });

  test(`${method.toUpperCase()} ${path}: HR_ENABLED=true lets the request reach its normal handler`, async () => {
    // The per-portal switches are cleared too: with COUNSELOR_HR_ENABLED=false in someone's .env this
    // would otherwise fail for the counselor routes while passing everywhere else.
    await withHrSwitches({ hr: "true" }, async () => {
      const { res } = await call(handlerOf(router, method, path));
      assert.notEqual(res.body?.code, "HR_DISABLED");
    });
  });
}

test("the state payloads send no leave, attendance or salary rows while HR is off", () => {
  const coreSrc = readFileSync(new URL("../server/routes/core.mjs", import.meta.url), "utf8");
  const counselorSrc = readFileSync(new URL("../server/routes/counselor.mjs", import.meta.url), "utf8");
  assert.match(coreSrc, /leave: hrEnabled\(\) \? sqlLeave\.rows : \[\]/);
  assert.match(coreSrc, /attendance: \(hrEnabled\(\) \? sqlAtt\.rows : \[\]\)\.map/);
  assert.match(coreSrc, /salary: \(hrEnabled\(\) \? sqlSalary\.rows : \[\]\)\.map/);
  // The counselor routes read their own switch, which follows HR_ENABLED unless COUNSELOR_HR_ENABLED
  // overrides it - one function for the data, the writes and the tab.
  assert.match(counselorSrc, /leave: counselorHrEnabled\(\) \? leave\.rows : \[\]/);
  assert.match(counselorSrc, /attendance: \(counselorHrEnabled\(\) \? attendance\.rows : \[\]\)\.map/);
  assert.match(counselorSrc, /salary: \(counselorHrEnabled\(\) \? salary\.rows : \[\]\)\.map/);
});

// ---- the telecaller override, and being able to see it from outside ----------------------------
//
// Attendance, Leave and Salary showed in the telecaller portal locally and not on the deployed one.
// Nothing was broken: the deployed server simply had neither switch set. It took far too long to
// establish that, because "the server has HR off" and "the portal never managed to ask" looked
// identical from the browser. These pin both halves of the fix.

test("telecallerHrEnabled follows HR_ENABLED, and the telecaller override wins either way", () => {
  const wasHr = process.env.HR_ENABLED;
  const wasOwn = process.env.TELECALLER_HR_ENABLED;
  const set = (name, value) => { if (value === undefined) delete process.env[name]; else process.env[name] = value; };
  try {
    for (const [hr, own, expected] of [
      [undefined, undefined, false],   // nothing set: off, which is the deployed default
      ["true", undefined, true],       // follows the one switch
      ["false", undefined, false],
      [undefined, "true", true],       // on for telecallers alone
      ["false", "true", true],
      ["true", "false", false],        // off for telecallers even when HR is on
      ["true", "", true],              // empty is "unset", not "false"
      [undefined, "TRUE", true],       // same casing rule as hrEnabled
    ]) {
      set("HR_ENABLED", hr);
      set("TELECALLER_HR_ENABLED", own);
      assert.equal(telecallerHrEnabled(), expected, `HR_ENABLED=${hr} TELECALLER_HR_ENABLED=${own}`);
    }
  } finally {
    set("HR_ENABLED", wasHr);
    set("TELECALLER_HR_ENABLED", wasOwn);
  }
});

test("/api/version reports both HR switches, so a deployed host can be checked without signing in", () => {
  const src = readFileSync(new URL("../server/index.mjs", import.meta.url), "utf8").replace(/\r\n/g, "\n");
  const route = src.slice(src.indexOf('app.get("/api/version"'));
  assert.ok(route, "/api/version is gone");
  assert.match(route.slice(0, 600), /features:\s*\{\s*hr:\s*hrEnabled\(\),\s*telecallerHr:\s*telecallerHrEnabled\(\)/,
    "/api/version no longer reports the HR switches: a deployment with HR off looks the same as a broken one");
  // Switch STATE is public; switch values and secrets are not.
  assert.doesNotMatch(route.slice(0, 600), /process\.env\.(JWT_SECRET|DATABASE_URL)/);
});

test("the telecaller sidebar hides HR until the server says on, and does not call a failed request an answer", () => {
  const src = readFileSync(new URL("../src/portals/telecaller/screens/Layout.tsx", import.meta.url), "utf8").replace(/\r\n/g, "\n");
  assert.match(src, /api<\{ hr: boolean \}>\("\/telecaller\/me\/features"\)/, "the sidebar no longer asks the server");
  assert.match(src, /hr === "on" \? \[profileItem, \.\.\.hrItems\] : \[profileItem\]/, "the HR items are not gated on the server's answer");
  assert.match(src, /"unknown" \| "on" \| "off"/, "a failed request is being treated as a definite 'off' again");
  assert.match(src, /attempt < 2/, "the one retry for a cold start is gone");
  assert.match(src, /console\.error\(/, "a failed features request is silent again");
});


// ---- the counselor portal, which had the same split ---------------------------------------------
//
// Reported 18 Nov 2026: no Attendance tab in the counselor portal. Nothing was broken server-side -
// the routes, the table and the data were all there and all gated by the HR switch - but the TAB was
// gated by a flag compiled into the build. A flag in the bundle cannot be checked against the server
// that holds the data, so the two drifted: the server was returning attendance rows to a portal that
// had no screen to show them on. The sidebar now asks the server, like the telecaller portal does.

test("counselorHrEnabled follows HR_ENABLED, and the counselor override wins either way", () => {
  const wasHr = process.env.HR_ENABLED;
  const wasOwn = process.env.COUNSELOR_HR_ENABLED;
  const set = (name, value) => { if (value === undefined) delete process.env[name]; else process.env[name] = value; };
  try {
    for (const [hr, own, expected] of [
      [undefined, undefined, false],   // nothing set: off, which is the deployed default
      ["true", undefined, true],
      ["false", undefined, false],
      [undefined, "true", true],       // on for counselors alone
      ["false", "true", true],
      ["true", "false", false],        // off for counselors even when HR is on
      ["true", "", true],              // empty is "unset", not "false"
      [undefined, "TRUE", true],
    ]) {
      set("HR_ENABLED", hr);
      set("COUNSELOR_HR_ENABLED", own);
      assert.equal(counselorHrEnabled(), expected, `HR_ENABLED=${hr} COUNSELOR_HR_ENABLED=${own}`);
    }
  } finally {
    set("HR_ENABLED", wasHr);
    set("COUNSELOR_HR_ENABLED", wasOwn);
  }
});

test("/api/version reports the counselor switch too", () => {
  const src = readFileSync(new URL("../server/index.mjs", import.meta.url), "utf8").replace(/\r\n/g, "\n");
  const route = src.slice(src.indexOf('app.get("/api/version"'), src.indexOf('app.get("/api/version"') + 700);
  assert.match(route, /counselorHr:\s*counselorHrEnabled\(\)/,
    "a deployed host cannot be asked whether counselor HR is on");
});

test("one switch decides the counselor tab, the data behind it, and the writes", () => {
  // The whole point: these used to be two switches. If any of these reads drifts back to the global
  // hrEnabled() while the features endpoint answers counselorHrEnabled(), the tab and the data it
  // shows can disagree again - which is the bug, not the symptom.
  const src = readFileSync(new URL("../server/routes/counselor.mjs", import.meta.url), "utf8").replace(/\r\n/g, "\n");
  assert.equal(/(^|[^a-zA-Z])hrEnabled\(\)/m.test(src.replace(/counselorHrEnabled\(\)/g, "")), false,
    "something in the counselor routes still reads the global HR switch");
  assert.match(src, /router\.get\("\/api\/counselor\/me\/features"/, "the counselor portal has nothing to ask");
  assert.match(src, /res\.json\(\{ hr: counselorHrEnabled\(\) \}\)/, "the features endpoint does not answer the counselor switch");
  // Leave, attendance and salary rows, plus the three writes, all behind the same function.
  assert.ok((src.match(/counselorHrEnabled\(\)/g) || []).length >= 7,
    "fewer gates than before: a read or a write has stopped checking the switch");
});

test("the counselor sidebar and its HR routes are gated on the server's answer, not a build flag", () => {
  const layout = readFileSync(new URL("../src/portals/counselor/counselor/CounselorLayout.tsx", import.meta.url), "utf8").replace(/\r\n/g, "\n");
  assert.doesNotMatch(layout, /HR_ENABLED/, "the sidebar is compiled with the answer baked in again");
  assert.match(layout, /askServerAboutHr\(\)/, "the sidebar no longer asks the server");
  assert.match(layout, /hr === "on" \? \[profileItem, \.\.\.hrItems\] : \[profileItem\]/, "the HR tabs are not gated on that answer");

  const app = readFileSync(new URL("../src/portals/counselor/App.tsx", import.meta.url), "utf8").replace(/\r\n/g, "\n");
  assert.doesNotMatch(app, /HR_ENABLED/, "the HR routes are gated by a build flag again");
  for (const page of ["LeavePage", "AttendancePage", "SalaryPage"]) {
    assert.match(app, new RegExp(`<HrRoute><${page} /></HrRoute>`), `${page} is not behind the server's answer`);
  }
  // A page must not redirect while the answer is still in flight: that looks exactly like "off".
  assert.match(app, /if \(!asked\) return null;/, "an unanswered request redirects, which is indistinguishable from HR being off");

  const hr = readFileSync(new URL("../src/portals/counselor/lib/hr.ts", import.meta.url), "utf8").replace(/\r\n/g, "\n");
  assert.match(hr, /"unknown" \| "on" \| "off"/, "a failed request is treated as a definite 'off'");
  assert.match(hr, /console\.error\(/, "a failed features request is silent");
  assert.match(hr, /asked = null/, "there is no way to forget the cached answer");
});
