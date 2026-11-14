// The three release journeys, driven through a real browser (milestone 3.3, acceptance).
//
// scripts/acceptance-onboarding.mjs and scripts/acceptance-journey.mjs prove the same ground at the
// API level. This one proves what a person signing in actually gets: the controls exist, the errors
// are readable, and access really is refused in the browser and not only by the API underneath.
//
// It follows the 20-step acceptance checklist exactly, and reports in the shape that asks for:
// Pass, Fail or Blocked per step, where Blocked means a control could not be found rather than that
// the product did the wrong thing. The two are not the same and are never merged.
//
// Each role gets its own browser context, which is what the checklist means by a separate browser
// profile: separate storage, separate session, no bleed between roles.
//
//   npx playwright install chromium
//   node scripts/acceptance-walkthrough.mjs --url http://localhost:8788 --super boss@example.com
//
// SUPER_PASSWORD holds the Super Admin password so it stays out of shell history. Everything this
// creates is prefixed `qa-` and carries the run's timestamp, so repeat runs never collide.
//
// NOT a release sign-off on its own: run it against staging, on the commit being released.
import { argv, env, exit } from "node:process";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

let chromium;
try {
  ({ chromium } = await import("playwright"));
} catch {
  if (env.PLAYWRIGHT_MODULE) {
    const mod = await import(env.PLAYWRIGHT_MODULE);
    chromium = mod.chromium || mod.default?.chromium;
    if (!chromium) { console.error("PLAYWRIGHT_MODULE exports no chromium"); exit(2); }
  } else {
    console.error("This check needs Playwright:  npx playwright install chromium");
    console.error("If Playwright is installed globally, point PLAYWRIGHT_MODULE at its index.js.");
    exit(2);
  }
}

const arg = (name, fallback) => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 && argv[i + 1] ? argv[i + 1] : fallback;
};
const BASE = (arg("url", "http://localhost:8788")).replace(/\/$/, "");
const SUPER_EMAIL = arg("super", env.SUPER_EMAIL || "");
const SUPER_PASSWORD = env.SUPER_PASSWORD || "";
const SHOTS = arg("shots", "/tmp/qa-shots");
const HEADED = argv.includes("--headed");
if (!SUPER_EMAIL || !SUPER_PASSWORD) {
  console.error("Need --super <email> and SUPER_PASSWORD in the environment.");
  exit(2);
}
mkdirSync(SHOTS, { recursive: true });

const STAMP = new Date().toISOString().replace(/[-:.TZ]/g, "").slice(0, 14);
const PASSWORD = `QaJourney-${STAMP}!`;
const email = (who) => `qa.${who}.${STAMP}@flymasters.test`;

// ---- reporting ---------------------------------------------------------------------------------
// Fail means the product did the wrong thing. Blocked means the step could not be carried out - a
// control that is not there, a prerequisite that never happened. Keeping them apart is the whole
// point of the checklist, so they are separate classes and never collapse into "error".
class Fail extends Error {}
class Blocked extends Error {}
const results = [];
const note = (...parts) => parts.filter(Boolean).join(" ");

async function step(id, what, fn) {
  const started = Date.now();
  try {
    const detail = await fn();
    results.push({ id, what, status: "Pass", detail: detail || "", ms: Date.now() - started });
    console.log(`  ${id}  Pass     ${detail || ""}`);
  } catch (error) {
    const status = error instanceof Blocked ? "Blocked" : "Fail";
    results.push({ id, what, status, detail: error.message, ms: Date.now() - started });
    console.log(`  ${id}  ${status.padEnd(8)} ${error.message}`);
  }
}

/**
 * This app reports errors with window.alert, and an automated browser dismisses dialogs silently - so
 * a harness that does not listen sees a form that did nothing and calls a working error message a
 * missing one. Every page records what it was told, and steps assert on that.
 */
const spoken = new WeakMap();
function listen(page) {
  const heard = [];
  spoken.set(page, heard);
  page.on("dialog", async (dialog) => { heard.push(dialog.message()); await dialog.accept().catch(() => {}); });
  return page;
}
const heardBy = (page) => spoken.get(page) || [];
const clearHeard = (page) => { const heard = spoken.get(page); if (heard) heard.length = 0; };

const shot = async (page, name) => {
  const file = join(SHOTS, `${name}.png`);
  await page.screenshot({ path: file, fullPage: true }).catch(() => {});
  return file;
};

// ---- small browser helpers ---------------------------------------------------------------------
const settle = async (page, ms = 900) => { await page.waitForLoadState("networkidle").catch(() => {}); await page.waitForTimeout(ms); };

async function signIn(context, who, address, password) {
  const page = listen(await context.newPage());
  await page.goto(`${BASE}/staff`, { waitUntil: "domcontentloaded" });
  await settle(page);
  await page.fill("#staff-email", address);
  await page.fill("#staff-password", password);
  await page.click("button[type=submit]");
  await settle(page, 1600);
  if (/\/staff\b/.test(new URL(page.url()).pathname)) {
    const message = (await page.locator("body").innerText()).split("\n").find((l) => /invalid|wrong|disabled|error|incorrect/i.test(l));
    throw new Fail(`${who} could not sign in${message ? `: ${message.trim()}` : ""}`);
  }
  return page;
}

/** The visible text of the page, flattened, for assertions that should not care about markup. */
const textOf = async (scope) => (await scope.innerText()).replace(/\s+/g, " ").trim();

/**
 * Finds a field by what a person sees, then by how the markup names it. The forms here label fields
 * with a sibling <label> rather than a wrapping one or a `for`, so three shapes are tried before
 * giving up - a missing field is Blocked, never a silent skip.
 */
async function fillLabelled(scope, labelText, value, fieldName) {
  if (fieldName) {
    const named = scope.locator(`[name="${fieldName}"]`).first();
    if (await named.count()) { await named.fill(value); return; }
  }
  const wrapped = scope.locator("label").filter({ hasText: labelText }).locator("input, textarea").first();
  if (await wrapped.count()) { await wrapped.fill(value); return; }
  const byLabel = scope.getByLabel(labelText, { exact: false }).first();
  if (await byLabel.count().catch(() => 0)) { await byLabel.fill(value); return; }
  // A label beside its input, inside one wrapper: the shape this app actually uses.
  const beside = scope.locator("div, p, fieldset").filter({ has: scope.locator(`label:text-is("${labelText}")`) })
    .locator("input, textarea").first();
  if (await beside.count()) { await beside.fill(value); return; }
  throw new Blocked(`no field labelled "${labelText}"${fieldName ? ` or named "${fieldName}"` : ""}`);
}

async function clickText(scope, pattern, { role = "button", timeout = 5000 } = {}) {
  const target = scope.getByRole(role, { name: pattern }).first();
  if (!(await target.count())) throw new Blocked(`no ${role} matching ${pattern}`);
  await target.click({ timeout });
}

// ---- the staff creation form, which every journey needs ----------------------------------------
/**
 * Creates a staff account from the Users page the way a person would: fill the form, pick the role,
 * tick the branches that appear, submit. Returns the form's own answer so the caller can judge it.
 */
async function createStaff(page, { first, last, address, phone, role, branchName }) {
  await page.goto(`${BASE}/admin/users`, { waitUntil: "domcontentloaded" });
  await settle(page);
  const form = page.locator("form").first();
  await fillLabelled(form, "First name", first, "firstName");
  await fillLabelled(form, "Last name", last, "lastName");
  await fillLabelled(form, "Email", address, "email");
  await fillLabelled(form, "Password", PASSWORD, "password");
  await fillLabelled(form, "Phone", phone, "phone");
  const roleSelect = form.locator("select").first();
  if (!(await roleSelect.count())) throw new Blocked("the create form has no role control");
  await roleSelect.selectOption(role);
  await page.waitForTimeout(600);
  // Choosing Counselor reveals a required block the other roles do not have: the form refuses to save
  // without at least one country specialization, because that is what student assignment matches on.
  if (role === "counselor") {
    const countries = form.locator("label").filter({ hasText: /^(UK|USA|Canada|Australia|Germany|Ireland|New Zealand|France)$/ });
    if (!(await countries.count())) throw new Blocked("the counselor form offers no country specialization to pick");
    await countries.first().locator("input[type=checkbox]").first().check().catch(async () => { await countries.first().click(); });
    await page.waitForTimeout(300);
  }
  if (branchName) {
    const branch = form.locator("label").filter({ hasText: branchName }).first();
    if (!(await branch.count())) throw new Blocked(`the form offers no branch "${branchName}" for role ${role}`);
    await branch.locator("input[type=checkbox]").first().check().catch(async () => { await branch.click(); });
  }
  clearHeard(page);
  await form.locator("button[type=submit]").first().click();
  await settle(page, 1800);
  return { shown: await textOf(page.locator("main").first()), said: heardBy(page).join(" | ") };
}

/** Reads a person's row on the Users page, which is where role, branch and state are shown. */
function userRow(page, address) {
  return page.locator("li, tr, div").filter({ hasText: address })
    .filter({ has: page.locator("select, button") }).last();
}

// ---- run ---------------------------------------------------------------------------------------
const browser = await chromium.launch({ headless: !HEADED });
const contexts = {};
const newContext = async (name) => {
  contexts[name] = await browser.newContext({ viewport: { width: 1400, height: 900 } });
  return contexts[name];
};

const people = {
  admin: { address: email("admin"), first: "QA", last: "AdminA", phone: "9000000011" },
  tele: { address: email("tele"), first: "QA", last: "TeleA", phone: "9000000012" },
  counselor: { address: email("counselor"), first: "QA", last: "CounselorA", phone: "9000000013" },
  studentA: { address: email("studenta"), first: "QA", last: "StudentA", phone: "9000000014" },
  studentB: { address: email("studentb"), first: "QA", last: "StudentB", phone: "9000000015" },
  // Journeys 4-6
  studentC: { address: email("studentc"), first: "QA", last: "SignupC", phone: "9000000016" },
  teleB: { address: email("teleb"), first: "QA", last: "TeleBranchB", phone: "9000000017" },
  teleA2: { address: email("telea2"), first: "QA", last: "TeleA2", phone: "9000000018" },
};
const BRANCH_A = arg("branch-a", "QA Branch A");
const BRANCH_B = arg("branch-b", "QA Branch B");
const state = {};

console.log(`\nFly Masters acceptance walkthrough`);
console.log(`url: ${BASE}`);
console.log(`run: ${STAMP}\n`);

const superPage = await signIn(await newContext("super"), "Super Admin", SUPER_EMAIL, SUPER_PASSWORD);

// ================================================================================================
console.log("Journey 1 - create an employee, log in, correct portal");
// ================================================================================================

await step("1.1", "Super Admin creates an Admin assigned only to Branch A", async () => {
  // The create form offers no Admin role: this app makes an Admin by creating the account and then
  // changing its role, which is the only path a Super Admin has in the UI.
  const answer = await createStaff(superPage, { ...people.admin, role: "branch_head", branchName: BRANCH_A });
  if (answer.said && !/created|added|saved/i.test(answer.said)) throw new Fail(`creating the Admin reported: ${answer.said.slice(0, 160)}`);
  await superPage.reload({ waitUntil: "domcontentloaded" });
  await settle(superPage);
  const row = userRow(superPage, people.admin.address);
  if (!(await row.count())) throw new Fail("the new account is not listed after creating it");
  const roleSelect = row.locator("select").first();
  if (!(await roleSelect.count())) throw new Blocked("the account row has no role control");
  const options = await roleSelect.locator("option").evaluateAll((ns) => ns.map((n) => n.value));
  if (!options.includes("admin")) throw new Fail(`a Super Admin cannot set the Admin role: options are ${options.join(", ")}`);
  await roleSelect.selectOption("admin");
  await settle(superPage, 1500);
  await superPage.reload({ waitUntil: "domcontentloaded" });
  await settle(superPage);
  const after = await textOf(userRow(superPage, people.admin.address));
  if (!/admin/i.test(after)) throw new Fail(`the account is not an Admin after the change: ${after.slice(0, 120)}`);
  return "created as Branch Head with Branch A, then promoted to Admin (the form itself offers no Admin role)";
});

await step("1.2", "sign out, sign in as the new Admin, Admin portal opens on Branch A", async () => {
  await clickText(superPage, /sign out/i).catch(() => {});
  await settle(superPage, 1200);
  const page = await signIn(await newContext("admin"), "Admin A", people.admin.address, PASSWORD);
  state.adminPage = page;
  const path = new URL(page.url()).pathname;
  if (!path.startsWith("/admin")) throw new Fail(`the Admin landed on ${path}, not the admin portal`);
  await page.goto(`${BASE}/admin/branches`, { waitUntil: "domcontentloaded" });
  await settle(page);
  const visible = await textOf(page.locator("main").first());
  if (!visible.includes(BRANCH_A)) throw new Fail(`the Admin does not see ${BRANCH_A}`);
  if (visible.includes(BRANCH_B)) throw new Fail(`the Admin assigned only to ${BRANCH_A} can see ${BRANCH_B}`);
  return `landed on ${path}; sees ${BRANCH_A} and not ${BRANCH_B}`;
});

await step("1.3", "the Admin creates a Telecaller in Branch A", async () => {
  const answer = await createStaff(state.adminPage, { ...people.tele, role: "telecaller", branchName: BRANCH_A });
  if (answer.said && !/created|added|saved/i.test(answer.said)) throw new Fail(`creating the telecaller reported: ${answer.said.slice(0, 160)}`);
  await state.adminPage.reload({ waitUntil: "domcontentloaded" });
  await settle(state.adminPage);
  const row = userRow(state.adminPage, people.tele.address);
  if (!(await row.count())) throw new Fail("the telecaller is not listed after creation");
  const text = await textOf(row);
  if (!/tele/i.test(text)) throw new Fail(`the account was not saved as a telecaller: ${text.slice(0, 120)}`);
  return "saved once with the Telecaller role in Branch A";
});

await step("1.4", "the same email again is refused, and leaves no second account", async () => {
  const answer = await createStaff(state.adminPage, { ...people.tele, role: "telecaller", branchName: BRANCH_A });
  const told = `${answer.said} ${answer.shown}`;
  const clear = told.match(/[^.|]*\b(already|exists|duplicate|taken|in use)\b[^.|]*/i)?.[0];
  await state.adminPage.reload({ waitUntil: "domcontentloaded" });
  await settle(state.adminPage);
  const rows = await state.adminPage.locator("li, tr").filter({ hasText: people.tele.address }).count();
  if (rows > 1) throw new Fail(`${rows} rows carry the same email: a duplicate was created`);
  if (!clear) throw new Fail(`nothing told the person why: dialog="${answer.said}"`);
  return `refused with "${clear.trim().slice(0, 90)}"; still one account`;
});

await step("1.5", "the Telecaller signs in to their own portal, with no Admin controls", async () => {
  const page = await signIn(await newContext("tele"), "Telecaller A", people.tele.address, PASSWORD);
  state.telePage = page;
  const path = new URL(page.url()).pathname;
  if (!path.startsWith("/telecaller")) throw new Fail(`the telecaller landed on ${path}`);
  const adminLinks = await page.locator('a[href^="/admin"]').count();
  if (adminLinks > 0) throw new Fail(`the telecaller portal offers ${adminLinks} admin links`);
  await page.goto(`${BASE}/admin/users`, { waitUntil: "domcontentloaded" });
  await settle(page, 1400);
  const reached = new URL(page.url()).pathname;
  const body = await textOf(page.locator("body"));
  const refused = !reached.startsWith("/admin") || /not allowed|no access|sign in|unauthori|forbidden|permission/i.test(body);
  if (!refused) throw new Fail(`typing /admin/users let the telecaller in: landed on ${reached}`);
  if (/@|user management/i.test(body) && reached.startsWith("/admin")) throw new Fail("the admin user list rendered for a telecaller");
  return `own portal only; /admin/users refused (landed on ${reached})`;
});

await step("1.6", "after signing out, a protected Telecaller URL asks for a login", async () => {
  const page = state.telePage;
  await page.goto(`${BASE}/telecaller/queue`, { waitUntil: "domcontentloaded" });
  await settle(page);
  // Taken before signing out, because signing out clears it from the browser. This is the token
  // somebody could already have copied.
  const beforeSignOut = await page.evaluate(() => sessionStorage.getItem("fm_token") || localStorage.getItem("fm_token") || "");
  await clickText(page, /sign out/i);
  await settle(page, 1500);
  await page.goto(`${BASE}/telecaller/queue`, { waitUntil: "domcontentloaded" });
  await settle(page, 1400);
  const path = new URL(page.url()).pathname;
  const body = await textOf(page.locator("body"));
  if (path.startsWith("/telecaller") && !/sign in/i.test(body)) {
    await shot(page, "1.6-still-inside");
    throw new Fail(`the queue opened after signing out (${path})`);
  }
  if (/qa lead|queue/i.test(body) && !/sign in/i.test(body)) throw new Fail("protected content rendered after signing out");

  // The honest part. Signing out revokes the refresh token at once, so no new access token can be
  // issued - but the access token already in hand is a signed JWT and stays valid until it expires,
  // by design (ACCESS_TOKEN_TTL, 15 minutes). A copied token therefore outlives the sign-out by up to
  // that long. Reported rather than asserted either way, because it is a decision, not a defect.
  const copied = await page.evaluate(async (token) => {
    const res = await fetch("/api/telecaller/state", { headers: { Authorization: `Bearer ${token}` } });
    return { status: res.status };
  }, beforeSignOut);
  const window = copied.status < 400
    ? `a token copied before sign-out still answers for up to ACCESS_TOKEN_TTL (15m); the refresh token is revoked, so nothing renews it`
    : `and a token copied before sign-out is already refused`;
  return `sent to ${path} and asked to sign in - ${window}`;
});

// ---- prerequisites the checklist names, done as a person would ---------------------------------
// Counselor A, Students A and B, and Student A assigned to Counselor A. These are setup, not steps,
// so they are not numbered and never counted as a journey result - but a failure here stops the run,
// because a journey standing on a prerequisite that never happened proves nothing.
console.log("\nprerequisites");

const superAgain = async () => signIn(await newContext(`super-${Date.now()}`), "Super Admin", SUPER_EMAIL, SUPER_PASSWORD);

/** Runs a staff API call with the signed-in token the page is holding, exactly as the portal does. */
async function asStaff(page, path, init = {}) {
  return page.evaluate(async ([p, i]) => {
    const token = sessionStorage.getItem("fm_token") || localStorage.getItem("fm_token") || "";
    const res = await fetch(p, {
      ...i,
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}`, ...(i.headers || {}) },
    });
    const text = await res.text();
    let body; try { body = JSON.parse(text); } catch { body = text.slice(0, 400); }
    return { status: res.status, body };
  }, [path, init]);
}

/** What the counselor portal itself now holds for one document - read through its own route. */
async function documentSeenByCounselor(page, id) {
  const state = await asStaff(page, "/api/counselor/state");
  const documents = state.body?.documents || [];
  return documents.find((row) => String(row.id) === String(id)) || null;
}

/** The same, for the student portal, which holds an opaque server-side session rather than a JWT. */
async function asStudent(page, path, init = {}) {
  return page.evaluate(async ([p, i]) => {
    let token = "";
    try { token = JSON.parse(localStorage.getItem("flymasters.student.session.v2") || "{}").access_token || ""; } catch { token = ""; }
    const res = await fetch(p, {
      ...i,
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}`, ...(i.headers || {}) },
    });
    const text = await res.text();
    let body; try { body = JSON.parse(text); } catch { body = text.slice(0, 200); }
    return { status: res.status, body };
  }, [path, init]);
}

async function registerStudent(who) {
  const person = people[who];
  const context = await newContext(who);
  const page = listen(await context.newPage());
  await page.goto(`${BASE}/auth`, { waitUntil: "domcontentloaded" });
  await settle(page);
  await clickText(page, /sign up|create account|register/i, { role: "tab" }).catch(async () => {
    await clickText(page, /sign up|create account|register/i).catch(() => {});
  });
  await settle(page, 700);
  await page.fill("#firstName", person.first);
  await page.fill("#lastName", person.last);
  await page.fill("#signup-email", person.address);
  await page.fill("#signup-password", PASSWORD);
  const phone = page.locator("#signup-phone, input[name=phone]").first();
  if (await phone.count()) await phone.fill(person.phone);
  await page.locator("form").filter({ has: page.locator("#signup-email") }).locator("button[type=submit]").first().click();
  await settle(page, 2500);
  const inside = /dashboard|student/.test(new URL(page.url()).pathname);
  if (!inside) {
    const body = await textOf(page.locator("body"));
    throw new Blocked(`could not register ${who}: ${body.slice(0, 160)}`);
  }
  state[`${who}Page`] = page;
  return page;
}

let prereqError = "";
try {
  const boss = await superAgain();
  state.superPage = boss;
  const answer = await createStaff(boss, { ...people.counselor, role: "counselor", branchName: BRANCH_A });
  if (answer.said && !/created|added|saved/i.test(answer.said)) throw new Error(`creating Counselor A reported: ${answer.said.slice(0, 120)}`);
  console.log(`  Counselor A created: ${people.counselor.address}`);
  await registerStudent("studentA");
  await registerStudent("studentB");
  console.log(`  Students registered: ${people.studentA.address}, ${people.studentB.address}`);
} catch (error) {
  prereqError = error.message;
  console.log(`  prerequisites failed: ${error.message}`);
}

// ================================================================================================
console.log("\nJourney 2 - lead capture, counselor handoff, access removal");
// ================================================================================================
const LEAD_NAME = `QA Lead A ${STAMP}`;

await step("2.1", "Telecaller A creates a lead, which lands in Branch A and in their queue", async () => {
  const page = await signIn(await newContext("tele2"), "Telecaller A", people.tele.address, PASSWORD);
  state.telePage = page;
  await page.goto(`${BASE}/telecaller/queue`, { waitUntil: "domcontentloaded" });
  await settle(page);
  await clickText(page, /add lead/i);
  await settle(page, 600);
  const form = page.locator("form").filter({ has: page.locator('[name="first_name"]') }).first();
  if (!(await form.count())) throw new Blocked("the Add lead form did not open");
  await form.locator('[name="first_name"]').fill("QA");
  await form.locator('[name="last_name"]').fill(`Lead A ${STAMP}`);
  await form.locator('[name="email"]').fill(email("leada"));
  await form.locator('[name="phone"]').fill("9000000021");
  // Countries and field of interest are filled now because the product refuses to hand a lead on
  // without them: "Capture preferred countries, field of interest before you can convert."
  await form.locator('[name="preferred_countries"]').fill("UK");
  await form.locator('[name="field_of_interest"]').fill("Data Science");
  clearHeard(page);
  await form.locator("button[type=submit]").first().click();
  await settle(page, 2000);
  await page.goto(`${BASE}/telecaller/queue`, { waitUntil: "domcontentloaded" });
  await settle(page, 1200);
  const queue = await textOf(page.locator("main").first());
  if (!queue.includes(`Lead A ${STAMP}`)) throw new Fail(`the lead is not in the telecaller's queue: ${queue.slice(0, 200)}`);
  const mine = await asStaff(page, "/api/telecaller/state");
  const lead = (mine.body?.leads || []).find((row) => String(row.last_name || "").includes(STAMP));
  if (!lead) throw new Fail("the lead is shown but the telecaller's own data does not carry it");
  state.leadId = lead.id;
  if (!lead.branch_id) throw new Fail("the lead was saved with no branch, so nobody can see it");
  state.branchAId = lead.branch_id;
  return `saved in the telecaller's branch and listed in their queue (lead ${String(lead.id).slice(0, 8)})`;
});

await step("2.2", "a follow-up note survives a refresh", async () => {
  if (!state.leadId) throw new Blocked("no lead was created in 2.1");
  const page = state.telePage;
  const NOTE = `QA follow-up note ${STAMP}`;
  await page.goto(`${BASE}/telecaller/leads/${state.leadId}`, { waitUntil: "domcontentloaded" });
  await settle(page);
  const noteField = page.locator('[name="note"]').first();
  if (!(await noteField.count())) throw new Blocked("the lead workspace offers no note field");
  await noteField.fill(NOTE);
  clearHeard(page);
  await clickText(page, /save call|log call|save/i);
  await settle(page, 2000);
  await page.reload({ waitUntil: "domcontentloaded" });
  await settle(page, 1400);
  const after = await textOf(page.locator("main").first());
  if (!after.includes(NOTE)) throw new Fail(`the note is gone after a refresh: ${after.slice(0, 220)}`);
  if (!after.includes(`Lead A ${STAMP}`)) throw new Fail("the lead's own details did not survive the refresh");
  return "the note and the lead details are both still there";
});

await step("2.3", "Admin A hands the lead to Counselor A", async () => {
  if (!state.leadId) throw new Blocked("no lead was created in 2.1");
  if (prereqError) throw new Blocked(`Counselor A does not exist: ${prereqError}`);
  const page = state.adminPage;
  if (!page) throw new Blocked("Admin A never signed in (1.2)");

  // The handoff in this product is two moves, not one: the telecaller converts the qualified lead,
  // and only then does an Admin give it a counselor. The assign screen lists converted students
  // waiting for a counselor and nothing else, so the conversion is part of this step.
  const tele = state.telePage;
  await tele.goto(`${BASE}/telecaller/leads/${state.leadId}`, { waitUntil: "domcontentloaded" });
  await settle(tele, 1200);
  const convert = tele.getByRole("button", { name: /convert to student/i }).first();
  if (!(await convert.count())) throw new Blocked("the lead workspace offers no way to convert the lead");
  if (await convert.isDisabled()) {
    const why = await textOf(tele.locator("main").first());
    throw new Fail(`the lead cannot be converted: ${(why.match(/Capture [^.]+/) || ["no reason given"])[0]}`);
  }
  clearHeard(tele);
  await convert.click();
  await settle(tele, 2500);

  await page.goto(`${BASE}/admin/students?view=assign`, { waitUntil: "domcontentloaded" });
  await settle(page, 1600);
  const waiting = await textOf(page.locator("main").first());
  if (!waiting.includes(`Lead A ${STAMP}`)) throw new Fail(`the converted lead is not waiting for a counselor: ${waiting.slice(0, 220)}`);

  // Pick the counselor first: the Assign button counts the ticked rows, and a tick that did not
  // register leaves a button that looks clickable and does nothing.
  const picker = page.locator("main select").first();
  if (!(await picker.count())) throw new Blocked("the assign screen offers no counselor picker");
  const labels = await picker.locator("option").evaluateAll((ns) => ns.map((n) => `${n.value}::${n.textContent}`));
  const mine = labels.find((o) => o.includes(people.counselor.last) || o.toLowerCase().includes(people.counselor.address));
  if (!mine) throw new Fail(`Counselor A is not offered as a target: ${labels.join(" | ").slice(0, 200)}`);
  await picker.selectOption(mine.split("::")[0]);
  await page.waitForTimeout(400);

  const box = page.locator("label, li, tr, div").filter({ hasText: `Lead A ${STAMP}` })
    .locator("input[type=checkbox]").first();
  if (!(await box.count())) throw new Blocked("the waiting student has no way to select it");
  await box.check();
  await page.waitForTimeout(400);
  const assign = page.getByRole("button", { name: /assign selected|assign/i }).last();
  const label = (await assign.innerText()).replace(/\s+/g, " ").trim();
  if (/\(0\)/.test(label)) throw new Fail(`ticking the student did not select it: the button still reads "${label}"`);
  clearHeard(page);
  await assign.click();
  await settle(page, 2500);
  const check = await asStaff(page, "/api/state");
  const moved = (check.body?.leads || []).find((r) => String(r.id) === String(state.leadId));
  const assigned = moved?.assigned_counselor_id;
  if (!assigned) throw new Fail(`the lead still has no counselor after assigning: ${JSON.stringify(moved || check.body).slice(0, 180)}`);
  state.counselorId = assigned;
  return `converted by the telecaller, then assigned by the Admin to counselor ${String(assigned).slice(0, 8)}`;
});

await step("2.4", "Counselor A opens the lead and sees it", async () => {
  if (prereqError) throw new Blocked(`Counselor A does not exist: ${prereqError}`);
  const page = await signIn(await newContext("counselor"), "Counselor A", people.counselor.address, PASSWORD);
  state.counselorPage = page;
  // A converted lead reaches the counselor as a student, so both screens count as "the counselor can
  // see what was handed to them". Neither showing it is the failure.
  const where = [];
  for (const path of ["/counselor/students", "/counselor/leads"]) {
    await page.goto(`${BASE}${path}`, { waitUntil: "domcontentloaded" });
    await settle(page, 1800);
    const body = await textOf(page.locator("main").first());
    if (body.includes(`Lead A ${STAMP}`)) { where.push(path); state.counselorLeadUrl = page.url(); }
  }
  if (!where.length) throw new Fail("what was handed over is on neither the counselor's students nor their leads screen");
  const detail = await asStaff(page, "/api/counselor/state");
  const mine = [...(detail.body?.students || []), ...(detail.body?.leads || [])].find((r) => String(r.id) === String(state.leadId));
  if (!mine) throw new Fail("the counselor's own data does not carry the record they were handed");
  return `visible on ${where.join(" and ")}, with their details`;
});

await step("2.5", "Super Admin moves the lead to Branch B", async () => {
  if (!state.leadId) throw new Blocked("no lead was created in 2.1");
  const boss = state.superPage || (await superAgain());
  state.superPage = boss;
  const branches = await asStaff(boss, "/api/branches");
  const list = branches.body?.branches || branches.body || [];
  const target = list.find((b) => String(b.name).includes(BRANCH_B));
  if (!target) throw new Blocked(`${BRANCH_B} does not exist`);
  const moved = await asStaff(boss, `/api/leads/${state.leadId}/branch`, { method: "POST", body: JSON.stringify({ branchId: target.id }) });
  if (moved.status >= 400) throw new Fail(`the branch change was refused: ${moved.status} ${JSON.stringify(moved.body).slice(0, 160)}`);
  const after = await asStaff(boss, "/api/state");
  const lead = (after.body?.leads || []).find((row) => String(row.id) === String(state.leadId));
  if (!lead) throw new Fail("the lead disappeared from the Super Admin's own view after the move");
  if (String(lead.branch_id) !== String(target.id)) throw new Fail(`the lead did not actually move branch: it is still in ${lead.branch_id}`);
  // Worth saying plainly: no screen in the admin portal changes a lead's branch, so this had to be
  // done through the API. The change itself saves, which is what the step asks.
  return `moved to ${BRANCH_B} (NOTE: no UI control exists for this; done through the API as Super Admin)`;
});

await step("2.6", "Counselor A's open session loses the lead once it leaves their branch", async () => {
  if (!state.counselorPage || !state.leadId) throw new Blocked("Counselor A never opened the lead (2.4)");
  const page = state.counselorPage;
  const direct = await asStaff(page, `/api/counselor/leads/${state.leadId}`);
  if (direct.status < 400) throw new Fail(`the counselor can still read the lead after it moved branch: ${direct.status}`);

  // Check back on every screen that showed it in 2.4, not just one: a record that disappears from the
  // leads list while still sitting on the students list has not gone anywhere. The counselor portal
  // has no per-lead URL to reopen - there is no /counselor/leads/:id route - so these screens, plus
  // the direct read above, are the whole of what "reopen it" can mean here.
  const stillOn = [];
  for (const path of ["/counselor/students", "/counselor/leads"]) {
    await page.goto(`${BASE}${path}`, { waitUntil: "domcontentloaded" });
    await settle(page, 1600);
    const body = await textOf(page.locator("main").first());
    if (body.includes(`Lead A ${STAMP}`)) stillOn.push(path);
  }
  if (stillOn.length) {
    await shot(page, "2.6-still-visible");
    throw new Fail(`the record is still listed on ${stillOn.join(" and ")} for a counselor whose branch no longer holds it`);
  }
  const everywhere = await asStaff(page, "/api/counselor/state");
  const leaked = [...(everywhere.body?.students || []), ...(everywhere.body?.leads || [])]
    .find((row) => String(row.id) === String(state.leadId));
  if (leaked) throw new Fail("the counselor's own data still carries the record after it changed branch");
  return `refused with ${direct.status}; gone from both their students and leads screens, and from their data`;
});

// ================================================================================================
console.log("\nJourney 3 - request documents, upload, review, student isolation");
// ================================================================================================

await step("3.1", "Counselor A requests one document type for Student A", async () => {
  if (prereqError) throw new Blocked(`the prerequisites failed: ${prereqError}`);
  const page = state.counselorPage;
  if (!page) throw new Blocked("Counselor A never signed in (2.4)");
  // Student A has to be this counselor's student before documents can be asked for.
  const boss = state.superPage || (await superAgain());
  state.superPage = boss;
  const students = await asStaff(boss, "/api/state");
  const mine = (students.body?.students || students.body?.leads || []).find((row) => String(row.email || "").includes("studenta"));
  if (!mine) throw new Blocked("Student A is not visible to the Super Admin, so they cannot be assigned");
  state.studentAId = mine.user_id || mine.id;
  // A student who signs up on the portal lands with no branch, and branch-scoped staff cannot see a
  // record that belongs to no branch. Put them in Branch A first, which is what an office would do.
  if (state.branchAId) {
    const placed = await asStaff(boss, `/api/leads/${mine.id}/branch`, { method: "POST", body: JSON.stringify({ branchId: state.branchAId }) });
    if (placed.status >= 400) throw new Blocked(`Student A could not be put in ${BRANCH_A}: ${JSON.stringify(placed.body).slice(0, 140)}`);
  }

  // Someone who signs up on the student portal arrives as a LEAD, not a student: the product makes a
  // student only when a telecaller converts one. bulk-assign silently skips anything unconverted, so
  // Student A has to travel the same road as any other student before a counselor can hold them -
  // telecaller, convert, then assign. This is setup, not a journey step, but it has to be the real path.
  const tele = state.telePage;
  const me = await asStaff(tele, "/api/me");
  const teleId = me.body?.user?.id || me.body?.id;
  if (!teleId) throw new Blocked("could not establish the telecaller's own id");
  const handedToTele = await asStaff(boss, `/api/leads/${mine.id}`, {
    method: "PATCH",
    body: JSON.stringify({ assigned_telecaller_id: teleId, phone: people.studentA.phone, preferred_countries: "UK", field_of_interest: "Data Science" }),
  });
  if (handedToTele.status >= 400) throw new Blocked(`Student A could not be given to the telecaller: ${JSON.stringify(handedToTele.body).slice(0, 140)}`);
  const converted = await asStaff(tele, `/api/telecaller/leads/${mine.id}/convert`, { method: "POST" });
  if (converted.status >= 400) throw new Blocked(`Student A could not be converted: ${JSON.stringify(converted.body).slice(0, 160)}`);

  const handed = await asStaff(boss, "/api/leads/bulk-assign", {
    method: "POST",
    body: JSON.stringify({ ids: [mine.id], counselorId: state.counselorId }),
  });
  if (handed.status >= 400) throw new Blocked(`Student A could not be assigned to Counselor A: ${JSON.stringify(handed.body).slice(0, 160)}`);
  if (Number(handed.body?.count || 0) < 1) throw new Blocked(`the assignment skipped Student A: ${JSON.stringify(handed.body).slice(0, 160)}`);

  await page.goto(`${BASE}/counselor/students`, { waitUntil: "domcontentloaded" });
  await settle(page, 1800);
  const card = page.locator("li, tr, div").filter({ hasText: people.studentA.address })
    .filter({ has: page.getByRole("button", { name: /view profile/i }) }).last();
  if (!(await card.count())) throw new Blocked(`Student A is not listed for this counselor: ${(await textOf(page.locator("main").first())).slice(0, 200)}`);
  // The checklist lives in the student's profile, not on the list, so this is the click a person makes.
  await card.getByRole("button", { name: /view profile/i }).first().click();
  await settle(page, 2000);
  const buttons = page.getByRole("button", { name: /send request/i });
  const count = await buttons.count();
  if (!count) throw new Blocked(`no per-document "Send request" control on the student's checklist: ${(await textOf(page.locator("main").first())).slice(0, 220)}`);
  clearHeard(page);
  await buttons.first().click();
  await settle(page, 2000);
  const shown = await textOf(page.locator("main").first());
  const sent = shown.match(/Request sent for ([^.]+)\./);
  if (!sent) throw new Fail(`nothing confirmed the request: ${shown.slice(0, 220)}`);
  state.docType = sent[1].trim();
  if (/Requests sent for \d+/.test(shown)) throw new Fail("one selection requested more than one document");
  return `requested "${state.docType}" only`;
});

await step("3.2", "Student A sees the requested document with an upload action", async () => {
  const page = state.studentAPage;
  if (!page) throw new Blocked("Student A was never registered");
  await page.goto(`${BASE}/dashboard/documents`, { waitUntil: "domcontentloaded" });
  await settle(page, 2200);
  const body = await textOf(page.locator("body"));
  if (state.docType && !body.toLowerCase().includes(state.docType.toLowerCase().slice(0, 12)))
    throw new Fail(`the requested document "${state.docType}" is not on the student's checklist: ${body.slice(0, 240)}`);
  const uploads = await page.locator('input[type="file"]').count();
  if (!uploads) throw new Fail("the checklist offers no way to upload");
  return `"${state.docType}" is listed with an upload control`;
});

await step("3.3", "an uploaded PDF persists and shows as waiting for review", async () => {
  const page = state.studentAPage;
  if (!page) throw new Blocked("Student A was never registered");
  const pdf = join(SHOTS, "qa-dummy.pdf");
  // Stamped, so 3.4 can prove the counselor is served THIS file and not merely a file.
  state.uploadedBytes = `%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n2 0 obj<</Type/Pages/Kids[]/Count 0>>endobj\ntrailer<</Root 1 0 R>>\n% ${STAMP}\n%%EOF\n`;
  writeFileSync(pdf, state.uploadedBytes);
  const input = page.locator('input[type="file"]').first();
  await input.setInputFiles(pdf);
  await settle(page, 3000);
  await page.reload({ waitUntil: "domcontentloaded" });
  await settle(page, 2500);
  const body = await textOf(page.locator("body"));
  if (!/pending|review|uploaded|submitted/i.test(body)) throw new Fail(`no submitted state after uploading: ${body.slice(0, 240)}`);
  const docs = await asStudent(page, "/__local_db?table=documents");
  const rows = (docs.body?.rows || docs.body || []).filter((r) => String(r.user_id || "") === String(state.studentAId));
  if (!rows.length) throw new Fail("the upload did not persist");
  state.docId = rows[0].id;
  state.docPath = rows[0].file_path;
  return `upload persisted (${rows[0].file_name || "file"}) and reads as waiting for review`;
});

await step("3.4", "Counselor A opens the file and rejects it with a reason", async () => {
  const page = state.counselorPage;
  if (!page || !state.docId) throw new Blocked("no uploaded document to review");
  await page.goto(`${BASE}/counselor/documents`, { waitUntil: "domcontentloaded" });
  await settle(page, 2000);
  const card = page.locator("div").filter({ hasText: people.studentA.last }).filter({ has: page.getByRole("button", { name: /review/i }) }).last();
  const review = (await card.count()) ? card.getByRole("button", { name: /^review$/i }).first() : page.getByRole("button", { name: /^review$/i }).first();
  if (!(await review.count())) throw new Blocked("nothing offers a review control for the uploaded file");
  await review.click();
  await page.getByRole("button", { name: /^reject$/i }).first().waitFor({ state: "visible", timeout: 8000 }).catch(() => {});
  // Open it the way the counselor does - the button - and separately confirm the portal's own route
  // answers, so "the file opened" is not inferred from the absence of a complaint.
  clearHeard(page);
  await clickText(page, /view file/i);
  await page.waitForTimeout(1200);
  const complaint = heardBy(page).find((said) => /could not open/i.test(said));
  if (complaint) throw new Fail(`opening the file failed: ${complaint}`);
  const file = await asStaff(page, `/api/counselor/documents/${state.docId}/file`);
  if (file.status >= 400) throw new Fail(`the counselor cannot open the file they must judge: ${file.status}`);
  const dataUrl = String(file.body?.dataUrl || "");
  if (!dataUrl.startsWith("data:")) throw new Fail("the file opened with no content");
  // "Correct file" means Student A's bytes. A data URL that merely exists could be anyone's.
  const served = Buffer.from(dataUrl.slice(dataUrl.indexOf(",") + 1), "base64").toString("utf8");
  if (served !== state.uploadedBytes) {
    throw new Fail(`the file served is not the one Student A uploaded (${served.length} bytes vs ${String(state.uploadedBytes).length})`);
  }
  const REASON = `QA rejection reason ${STAMP}`;
  const note = page.locator("textarea").last();
  if (!(await note.count())) throw new Blocked("the review panel has nowhere to write a reason");
  await note.fill(REASON);
  state.reason = REASON;
  await clickText(page, /^reject$/i);
  await settle(page, 2200);
  const row = await documentSeenByCounselor(page, state.docId);
  if (!row) throw new Fail("the document vanished from the counselor's view after rejecting it");
  if (row.status !== "rejected") throw new Fail(`the rejection did not save: status is ${row.status}`);
  if (!String(row.admin_comments || "").includes(STAMP)) throw new Fail("the reason did not save with the rejection");
  return "the file opened, and the rejection and its reason saved";
});

await step("3.5", "Student A reads the reason and uploads a corrected file", async () => {
  const page = state.studentAPage;
  if (!page || !state.reason) throw new Blocked("nothing was rejected in 3.4");
  await page.goto(`${BASE}/dashboard/documents`, { waitUntil: "domcontentloaded" });
  await settle(page, 2500);
  const body = await textOf(page.locator("body"));
  if (!body.includes(state.reason)) throw new Fail(`the student cannot see why it was sent back: ${body.slice(0, 260)}`);
  const pdf = join(SHOTS, "qa-dummy-corrected.pdf");
  writeFileSync(pdf, "%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n2 0 obj<</Type/Pages/Kids[]/Count 0>>endobj\ntrailer<</Root 1 0 R>>\n% corrected\n%%EOF\n");
  const input = page.locator('input[type="file"]').first();
  if (!(await input.count())) throw new Fail("a rejected document offers no way to replace it");
  await input.setInputFiles(pdf);
  await settle(page, 3000);
  const docs = await asStudent(page, "/__local_db?table=documents");
  const rows = (docs.body?.rows || docs.body || []).filter((r) => String(r.user_id || "") === String(state.studentAId));
  const latest = rows.sort((a, b) => String(b.created_at || "").localeCompare(String(a.created_at || "")))[0];
  if (!latest || latest.status === "rejected") throw new Fail("the replacement did not go back for review");
  state.docId = latest.id;
  state.docPath = latest.file_path;
  return "the reason is visible, and the replacement is back under review";
});

await step("3.6", "Counselor A approves it, and both portals agree", async () => {
  const page = state.counselorPage;
  if (!page || !state.docId) throw new Blocked("nothing to approve");
  await page.goto(`${BASE}/counselor/documents`, { waitUntil: "domcontentloaded" });
  await settle(page, 2000);
  const review = page.getByRole("button", { name: /^review$/i }).first();
  if (!(await review.count())) throw new Blocked("nothing offers a review control for the replacement");
  await review.click();
  const approve = page.getByRole("button", { name: /^approve$/i }).first();
  await approve.waitFor({ state: "visible", timeout: 8000 }).catch(() => {});
  if (!(await approve.count())) throw new Blocked("the review panel offers no Approve");
  await approve.click();
  await settle(page, 2500);
  const row = await documentSeenByCounselor(page, state.docId);
  if (row?.status !== "approved") throw new Fail(`the counselor side does not read approved: ${row?.status}`);
  const studentPage = state.studentAPage;
  await studentPage.goto(`${BASE}/dashboard/documents`, { waitUntil: "domcontentloaded" });
  await settle(studentPage, 2500);
  const body = await textOf(studentPage.locator("body"));
  if (!/approved/i.test(body)) throw new Fail(`the student's checklist does not show approved: ${body.slice(0, 240)}`);
  return "approved on both sides";
});

await step("3.7", "Student B cannot reach Student A's file", async () => {
  const page = state.studentBPage;
  if (!page) throw new Blocked("Student B was never registered");
  if (!state.docPath) throw new Blocked("Student A has no stored file to try");
  const direct = await asStudent(page, `/__storage?path=${encodeURIComponent(state.docPath)}`);
  if (direct.status < 400) {
    await shot(page, "3.7-file-reachable");
    throw new Fail(`Student B read Student A's file: ${direct.status}`);
  }
  const listed = await asStudent(page, "/__local_db?table=documents");
  const theirs = (listed.body?.rows || listed.body || []).filter((r) => String(r.user_id || "") === String(state.studentAId));
  if (theirs.length) throw new Fail(`Student B can list ${theirs.length} of Student A's documents`);
  return `the file is refused with ${direct.status}, and none of Student A's documents are listed`;
});

// ---- the report --------------------------------------------------------------------------------
// ================================================================================================
console.log("\nJourney 4 - student signup, branch assignment, telecaller");
// ================================================================================================
// A person who signs up on the student portal arrives as a LEAD with no branch. Branch-scoped staff
// cannot see a record that belongs to no branch, so this journey is about whether such a signup can
// be found and placed before it is lost.

await step("4.1", "a new student can register on the portal and sign in", async () => {
  await registerStudent("studentC");
  const page = state.studentCPage;
  if (!page) throw new Fail("registration did not land inside the student portal");
  // Registering is not the same as being able to sign in, so prove the second one separately.
  const fresh = await newContext("studentC-signin");
  const signinPage = listen(await fresh.newPage());
  await signinPage.goto(`${BASE}/auth`, { waitUntil: "domcontentloaded" });
  await settle(signinPage, 900);
  await signinPage.fill("#signin-email", people.studentC.address);
  await signinPage.fill("#signin-password", PASSWORD);
  await signinPage.locator("form").filter({ has: signinPage.locator("#signin-email") }).locator("button[type=submit]").first().click();
  await settle(signinPage, 2800);
  const path = new URL(signinPage.url()).pathname;
  if (!/dashboard|student/.test(path)) throw new Fail(`signing in again landed on ${path}`);
  state.studentCPage = signinPage;
  return `registered and signed in again as ${people.studentC.address}`;
});

await step("4.2", "the Super Admin can find the signup, branch or no branch", async () => {
  const boss = state.superPage || (await superAgain());
  state.superPage = boss;
  const all = await asStaff(boss, "/api/state");
  const mine = (all.body?.leads || []).find((row) => String(row.email || "") === people.studentC.address);
  if (!mine) throw new Fail("the signup is in no list the Super Admin can read");
  state.signupId = mine.id;
  state.signupHadBranch = Boolean(mine.branch_id);
  await boss.goto(`${BASE}/admin/leads`, { waitUntil: "domcontentloaded" });
  await settle(boss, 2000);
  let shown = await textOf(boss.locator("main").first());
  if (!shown.includes(people.studentC.last)) {
    const search = boss.locator('input[type="search"], input[placeholder*="earch" i]').first();
    if (await search.count()) {
      await search.fill(people.studentC.last);
      await settle(boss, 1500);
      shown = await textOf(boss.locator("main").first());
    }
  }
  if (!shown.includes(people.studentC.last)) {
    await shot(boss, "4.2-not-listed");
    throw new Fail(`the signup is in the data but not on the leads screen: ${shown.slice(0, 200)}`);
  }
  return `found on /admin/leads${state.signupHadBranch ? "" : " while it still has NO branch"}`;
});

await step("4.3", "the signup can be put in Branch A from a screen", async () => {
  if (!state.signupId) throw new Blocked("4.2 never found the signup");
  const boss = state.superPage;
  // Look honestly for a control: any branch picker on the leads list or the lead's own page.
  const places = ["/admin/leads", `/admin/leads/${state.signupId}`];
  const found = [];
  for (const path of places) {
    await boss.goto(`${BASE}${path}`, { waitUntil: "domcontentloaded" });
    await settle(boss, 1800);
    const pickers = boss.locator("select").filter({ hasText: /branch/i });
    const buttons = boss.getByRole("button", { name: /branch|move|transfer/i });
    if ((await pickers.count()) || (await buttons.count())) found.push(path);
  }
  if (!found.length) {
    // Place it anyway so the rest of the journey can run, and say exactly what was missing.
    const placed = await asStaff(boss, `/api/leads/${state.signupId}/branch`, {
      method: "POST", body: JSON.stringify({ branchId: state.branchAId }),
    });
    if (placed.status >= 400) throw new Fail(`even the API refused to place the signup: ${JSON.stringify(placed.body).slice(0, 140)}`);
    throw new Blocked(
      "no screen in the admin portal changes a lead's branch - no picker on /admin/leads or the lead's own page. "
      + "POST /api/leads/:id/branch exists and works, and was used here so Journey 4 could continue, "
      + "but a branch-less signup cannot be placed by anyone without API access.",
    );
  }
  return `a branch control exists on ${found.join(" and ")}`;
});

await step("4.4", "Admin A finds the lead and gives it to Telecaller A", async () => {
  if (!state.signupId) throw new Blocked("4.2 never found the signup");
  const page = state.adminPage;
  if (!page) throw new Blocked("Admin A never signed in (1.2)");
  await page.goto(`${BASE}/admin/alerts`, { waitUntil: "domcontentloaded" });
  await settle(page, 2200);
  const listed = await textOf(page.locator("main").first());
  if (!listed.includes(people.studentC.last)) {
    await shot(page, "4.4-not-waiting");
    throw new Fail(`Admin A cannot see the lead waiting for assignment: ${listed.slice(0, 220)}`);
  }
  const mode = page.getByRole("button", { name: /^telecaller$/i }).first();
  if (await mode.count()) { await mode.click(); await page.waitForTimeout(400); }
  const picker = page.locator("main select").first();
  if (!(await picker.count())) throw new Blocked("the alerts screen offers no telecaller picker");
  const options = await picker.locator("option").evaluateAll((ns) => ns.map((n) => `${n.value}::${n.textContent}`));
  const target = options.find((o) => o.includes(people.tele.last) || o.toLowerCase().includes(people.tele.address));
  if (!target) throw new Fail(`Telecaller A is not offered: ${options.join(" | ").slice(0, 200)}`);
  await picker.selectOption(target.split("::")[0]);
  await page.waitForTimeout(400);
  const row = page.locator("li, div").filter({ hasText: people.studentC.last })
    .filter({ has: page.getByRole("button", { name: /assign telecaller/i }) }).last();
  const button = (await row.count()) ? row.getByRole("button", { name: /assign telecaller/i }).first()
    : page.getByRole("button", { name: /assign telecaller/i }).first();
  if (!(await button.count())) throw new Blocked("no control assigns a telecaller to this lead");
  clearHeard(page);
  await button.click();
  await settle(page, 2500);
  const after = await asStaff(page, "/api/state");
  const lead = (after.body?.leads || []).find((r) => String(r.id) === String(state.signupId));
  if (!lead?.assigned_telecaller_id) throw new Fail(`the lead still has no telecaller: ${JSON.stringify(lead || {}).slice(0, 160)}`);
  state.signupTelecallerId = lead.assigned_telecaller_id;
  return `assigned to telecaller ${String(lead.assigned_telecaller_id).slice(0, 8)} from /admin/alerts`;
});

await step("4.5", "Telecaller A opens it and sees the right student", async () => {
  if (!state.signupTelecallerId) throw new Blocked("4.4 never assigned a telecaller");
  const page = state.telePage;
  await page.goto(`${BASE}/telecaller/queue`, { waitUntil: "domcontentloaded" });
  await settle(page, 2000);
  const queue = await textOf(page.locator("main").first());
  if (!queue.includes(people.studentC.last)) throw new Fail(`the lead is not in the telecaller's queue: ${queue.slice(0, 220)}`);
  const mine = await asStaff(page, "/api/telecaller/state");
  const lead = (mine.body?.leads || []).find((r) => String(r.id) === String(state.signupId));
  if (!lead) throw new Fail("the queue shows it but the telecaller's own data does not carry it");
  if (String(lead.email || "") !== people.studentC.address) throw new Fail(`the queue is showing the wrong person: ${lead.email}`);
  return `in their queue with the right email (${lead.email})`;
});

await step("4.6", "Branch B staff cannot see a Branch A lead", async () => {
  if (!state.signupId) throw new Blocked("4.2 never found the signup");
  const boss = state.superPage;
  const madeB = await createStaff(boss, { ...people.teleB, role: "telecaller", branchName: BRANCH_B });
  if (madeB.said && !/created|added|saved/i.test(madeB.said)) throw new Blocked(`could not create a Branch B telecaller: ${madeB.said.slice(0, 120)}`);
  const page = await signIn(await newContext("teleB"), "Telecaller B (Branch B)", people.teleB.address, PASSWORD);
  state.teleBPage = page;
  await page.goto(`${BASE}/telecaller/queue`, { waitUntil: "domcontentloaded" });
  await settle(page, 2000);
  const queue = await textOf(page.locator("main").first());
  if (queue.includes(people.studentC.last)) {
    await shot(page, "4.6-visible-across-branch");
    throw new Fail("a Branch B telecaller can see a Branch A lead in their queue");
  }
  const search = page.locator('input[placeholder*="earch" i]').first();
  if (await search.count()) {
    await search.fill(people.studentC.last);
    await settle(page, 1500);
    const found = await textOf(page.locator("main").first());
    if (found.includes(people.studentC.address)) throw new Fail("searching surfaced a Branch A lead to Branch B staff");
  }
  const direct = await asStaff(page, `/api/telecaller/leads/${state.signupId}`);
  if (direct.status < 400) throw new Fail(`Branch B staff read the Branch A lead directly: ${direct.status}`);
  return `not in their queue, not findable by search, and a direct read is refused with ${direct.status}`;
});

// ================================================================================================
console.log("\nJourney 5 - conversion, then counselor assignment");
// ================================================================================================

await step("5.1", "an unconverted lead in Branch A shows with its status", async () => {
  const page = state.telePage;
  await page.goto(`${BASE}/telecaller/queue`, { waitUntil: "domcontentloaded" });
  await settle(page, 1500);
  await clickText(page, /add lead/i);
  await settle(page, 700);
  const form = page.locator("form").filter({ has: page.locator('[name="first_name"]') }).first();
  if (!(await form.count())) throw new Blocked("the Add lead form did not open");
  await form.locator('[name="first_name"]').fill("QA");
  await form.locator('[name="last_name"]').fill(`Unconverted ${STAMP}`);
  await form.locator('[name="email"]').fill(email("unconv"));
  await form.locator('[name="phone"]').fill("9000000055");
  await form.locator('[name="preferred_countries"]').fill("UK");
  await form.locator('[name="field_of_interest"]').fill("Business");
  await form.locator("button[type=submit]").first().click();
  await settle(page, 2200);
  const mine = await asStaff(page, "/api/telecaller/state");
  const lead = (mine.body?.leads || []).find((r) => String(r.last_name || "").includes(`Unconverted ${STAMP}`));
  if (!lead) throw new Fail("the new lead is not in the telecaller's own data");
  if (String(lead.entity_type || "") === "student") throw new Fail("the lead was created already converted, so 5.2 cannot be tested");
  state.unconvertedId = lead.id;
  await page.goto(`${BASE}/telecaller/queue`, { waitUntil: "domcontentloaded" });
  await settle(page, 1500);
  const queue = await textOf(page.locator("main").first());
  if (!queue.includes(`Unconverted ${STAMP}`)) throw new Fail("the unconverted lead is not listed");
  return `listed as ${lead.lead_status || "new"}, entity_type=${lead.entity_type || "lead"}`;
});

await step("5.2", "assigning an unconverted lead to a counselor is prevented or explained, never faked", async () => {
  if (!state.unconvertedId) throw new Blocked("5.1 never made an unconverted lead");
  const page = state.adminPage;
  const findings = [];

  // Control 1: the assign screen. It lists converted students only, so there is nothing to click.
  await page.goto(`${BASE}/admin/students?view=assign`, { waitUntil: "domcontentloaded" });
  await settle(page, 1800);
  const assignScreen = await textOf(page.locator("main").first());
  const offeredThere = assignScreen.includes(`Unconverted ${STAMP}`);
  findings.push(offeredThere ? "the assign screen offers it" : "the assign screen does not list it, so no assignment can be attempted there");

  // Control 2: the alerts screen, which assigns a counselor straight onto a lead.
  await page.goto(`${BASE}/admin/alerts`, { waitUntil: "domcontentloaded" });
  await settle(page, 2000);
  const alerts = await textOf(page.locator("main").first());
  let viaAlerts = "the alerts screen does not list it either";
  if (alerts.includes(`Unconverted ${STAMP}`)) {
    const mode = page.getByRole("button", { name: /^counselor$/i }).first();
    if (await mode.count()) { await mode.click(); await page.waitForTimeout(400); }
    const picker = page.locator("main select").first();
    const options = await picker.locator("option").evaluateAll((ns) => ns.map((n) => `${n.value}::${n.textContent}`));
    const target = options.find((o) => o.includes(people.counselor.last) || o.toLowerCase().includes(people.counselor.address));
    if (target) {
      await picker.selectOption(target.split("::")[0]);
      await page.waitForTimeout(400);
      const row = page.locator("li, div").filter({ hasText: `Unconverted ${STAMP}` })
        .filter({ has: page.getByRole("button", { name: /assign counselor/i }) }).last();
      if (await row.count()) {
        clearHeard(page);
        await row.getByRole("button", { name: /assign counselor/i }).first().click();
        await settle(page, 2500);
        const after = await asStaff(page, "/api/state");
        const lead = (after.body?.leads || []).find((r) => String(r.id) === String(state.unconvertedId));
        viaAlerts = lead?.assigned_counselor_id
          ? "the alerts screen assigned a counselor to an UNCONVERTED lead"
          : "the alerts screen left it unassigned";
        state.alertsAssignedUnconverted = Boolean(lead?.assigned_counselor_id);
      }
    }
  }
  findings.push(viaAlerts);

  // Control 3: what an integration would call. This is the one that lies.
  const bulk = await asStaff(page, "/api/leads/bulk-assign", {
    method: "POST", body: JSON.stringify({ ids: [state.unconvertedId], counselorId: state.counselorId }),
  });
  const claimedOk = bulk.status < 400 && bulk.body?.ok === true;
  const movedNothing = Number(bulk.body?.count || 0) === 0;
  if (claimedOk && movedNothing) {
    throw new Fail(
      `POST /api/leads/bulk-assign answered ${bulk.status} {"ok":true,"count":0} for an unconverted lead: `
      + `it reports success while assigning nobody, and says nothing about conversion being required. `
      + `On the screens: ${findings.join("; ")}.`,
    );
  }
  if (!movedNothing) throw new Fail("an unconverted lead was actually assigned to a counselor");
  if (!/convert/i.test(String(bulk.body?.error || ""))) {
    throw new Fail(`the refusal does not say conversion is what is missing: ${JSON.stringify(bulk.body).slice(0, 160)}`);
  }
  findings.push(`the API refuses it with ${bulk.status} and says "${String(bulk.body.error).slice(0, 80)}"`);
  return findings.join("; ");
});

await step("5.3", "the telecaller adds a note and converts, and the history survives", async () => {
  if (!state.unconvertedId) throw new Blocked("5.1 never made an unconverted lead");
  const page = state.telePage;
  const NOTE = `QA conversion note ${STAMP}`;
  await page.goto(`${BASE}/telecaller/leads/${state.unconvertedId}`, { waitUntil: "domcontentloaded" });
  await settle(page, 1500);
  const noteField = page.locator('[name="note"]').first();
  if (!(await noteField.count())) throw new Blocked("the lead workspace offers no note field");
  await noteField.fill(NOTE);
  await clickText(page, /save call|log call|save/i);
  await settle(page, 2000);
  const convert = page.getByRole("button", { name: /convert to student/i }).first();
  if (!(await convert.count())) throw new Blocked("no convert control on the lead workspace");
  if (await convert.isDisabled()) {
    const why = await textOf(page.locator("main").first());
    throw new Fail(`conversion is blocked: ${(why.match(/Capture [^.]+/) || ["no reason given"])[0]}`);
  }
  clearHeard(page);
  await convert.click();
  await settle(page, 2800);
  const after = await asStaff(page, "/api/telecaller/state");
  const lead = (after.body?.leads || []).find((r) => String(r.id) === String(state.unconvertedId));
  if (String(lead?.entity_type || "") !== "student") throw new Fail(`the lead did not become a student: entity_type=${lead?.entity_type}`);
  // "Remains available" - to whom? Check the three people who might need it, and report what is true
  // rather than asking one screen and calling it the answer.
  const seenBy = [];
  await page.goto(`${BASE}/telecaller/leads/${state.unconvertedId}`, { waitUntil: "domcontentloaded" });
  await settle(page, 1800);
  if ((await textOf(page.locator("main").first())).includes(NOTE)) seenBy.push("the telecaller who wrote it");

  const kept = String(lead?.notes || "").includes(NOTE);
  if (!kept) throw new Fail("the follow-up note is gone from the record itself after conversion");

  const boss = state.superPage || (await superAgain());
  state.superPage = boss;
  await boss.goto(`${BASE}/admin/students/${state.unconvertedId}`, { waitUntil: "domcontentloaded" });
  await settle(boss, 2200);
  if ((await textOf(boss.locator("body"))).includes(NOTE)) seenBy.push("the admin's student page");

  if (!seenBy.length) {
    await shot(page, "5.3-history-hidden");
    throw new Fail("the note survives in the record but no screen shows it after conversion");
  }
  return `converted; the note is kept on the record and shown on ${seenBy.join(" and ")}`
    + (seenBy.includes("the telecaller who wrote it") ? "" : " - NOTE: the telecaller's own workspace stops showing the call history once they convert");
});

await step("5.4", "Admin A assigns the converted student to Counselor A, and is told so", async () => {
  if (!state.unconvertedId) throw new Blocked("5.1 never made a lead");
  const page = state.adminPage;
  await page.goto(`${BASE}/admin/students?view=assign`, { waitUntil: "domcontentloaded" });
  await settle(page, 2000);
  const waiting = await textOf(page.locator("main").first());
  if (!waiting.includes(`Unconverted ${STAMP}`)) throw new Fail(`the converted student is not waiting for a counselor: ${waiting.slice(0, 220)}`);
  const picker = page.locator("main select").first();
  const options = await picker.locator("option").evaluateAll((ns) => ns.map((n) => `${n.value}::${n.textContent}`));
  const target = options.find((o) => o.includes(people.counselor.last) || o.toLowerCase().includes(people.counselor.address));
  if (!target) throw new Fail("Counselor A is not offered as a target");
  await picker.selectOption(target.split("::")[0]);
  await page.waitForTimeout(400);
  const box = page.locator("label, li, tr, div").filter({ hasText: `Unconverted ${STAMP}` }).locator("input[type=checkbox]").first();
  if (!(await box.count())) throw new Blocked("the waiting student has no way to select it");
  await box.check();
  await page.waitForTimeout(400);
  const assign = page.getByRole("button", { name: /assign selected|assign/i }).last();
  const label = (await assign.innerText()).replace(/\s+/g, " ").trim();
  if (/\(0\)/.test(label)) throw new Fail(`ticking did not select it: the button reads "${label}"`);
  clearHeard(page);
  await assign.click();
  await settle(page, 2500);
  const after = await asStaff(page, "/api/state");
  const lead = (after.body?.leads || []).find((r) => String(r.id) === String(state.unconvertedId));
  if (!lead?.assigned_counselor_id) throw new Fail("the assignment did not save");
  await page.goto(`${BASE}/admin/students`, { waitUntil: "domcontentloaded" });
  await settle(page, 2000);
  const shown = await textOf(page.locator("main").first());
  if (!new RegExp(people.counselor.last, "i").test(shown) && !shown.includes(people.counselor.address)) {
    const row = shown.includes(`Unconverted ${STAMP}`);
    if (!row) throw new Fail("the student is not on the admin students screen after assigning");
  }
  return `assigned, and the record names counselor ${String(lead.assigned_counselor_id).slice(0, 8)}`;
});

await step("5.5", "Counselor A opens the student and sees their details and history", async () => {
  const page = state.counselorPage;
  if (!page) throw new Blocked("Counselor A never signed in");
  await page.goto(`${BASE}/counselor/students`, { waitUntil: "domcontentloaded" });
  await settle(page, 2000);
  const body = await textOf(page.locator("main").first());
  if (!body.includes(`Unconverted ${STAMP}`)) throw new Fail(`the assigned student is not on the counselor's list: ${body.slice(0, 220)}`);
  const mine = await asStaff(page, "/api/counselor/state");
  const student = [...(mine.body?.students || []), ...(mine.body?.leads || [])].find((r) => String(r.id) === String(state.unconvertedId));
  if (!student) throw new Fail("the counselor's own data does not carry the student");
  if (String(student.email || "").length === 0) throw new Fail("the student arrives with no contact details");
  return `listed with their details (${student.email})`;
});

await step("5.6", "the assignment reads the same on both screens after a refresh", async () => {
  const admin = state.adminPage;
  const counselor = state.counselorPage;
  if (!admin || !counselor) throw new Blocked("one of the two sessions is missing");
  await admin.reload({ waitUntil: "domcontentloaded" });
  await settle(admin, 2000);
  await counselor.reload({ waitUntil: "domcontentloaded" });
  await settle(counselor, 2000);
  const adminSide = await asStaff(admin, "/api/state");
  const adminRow = (adminSide.body?.leads || []).find((r) => String(r.id) === String(state.unconvertedId));
  const counselorSide = await asStaff(counselor, "/api/counselor/state");
  const counselorRow = [...(counselorSide.body?.students || []), ...(counselorSide.body?.leads || [])]
    .find((r) => String(r.id) === String(state.unconvertedId));
  if (!counselorRow) throw new Fail("after a refresh the counselor no longer has the student");
  if (String(adminRow?.assigned_counselor_id || "") !== String(counselorRow.assigned_counselor_id || adminRow?.assigned_counselor_id || "")) {
    throw new Fail(`the two screens disagree: admin says ${adminRow?.assigned_counselor_id}, counselor says ${counselorRow.assigned_counselor_id}`);
  }
  const shown = await textOf(counselor.locator("main").first());
  if (!shown.includes(`Unconverted ${STAMP}`)) throw new Fail("the counselor's screen lost the student after a refresh");
  return `both still name counselor ${String(adminRow?.assigned_counselor_id || "").slice(0, 8)}`;
});

// ================================================================================================
console.log("\nJourney 6 - reassignment, deactivation, access removal");
// ================================================================================================
// Two telecallers in the SAME branch, so nothing here can be explained away by branch scope.

await step("6.1", "Telecaller A holds the lead and can open it", async () => {
  const boss = state.superPage || (await superAgain());
  state.superPage = boss;
  const made = await createStaff(boss, { ...people.teleA2, role: "telecaller", branchName: BRANCH_A });
  if (made.said && !/created|added|saved/i.test(made.said)) throw new Blocked(`could not create the second Branch A telecaller: ${made.said.slice(0, 120)}`);

  const page = state.telePage;
  await page.goto(`${BASE}/telecaller/queue`, { waitUntil: "domcontentloaded" });
  await settle(page, 1500);
  await clickText(page, /add lead/i);
  await settle(page, 700);
  const form = page.locator("form").filter({ has: page.locator('[name="first_name"]') }).first();
  await form.locator('[name="first_name"]').fill("QA");
  await form.locator('[name="last_name"]').fill(`Handover ${STAMP}`);
  await form.locator('[name="email"]').fill(email("handover"));
  await form.locator('[name="phone"]').fill("9000000066");
  await form.locator('[name="preferred_countries"]').fill("UK");
  await form.locator('[name="field_of_interest"]').fill("Nursing");
  await form.locator("button[type=submit]").first().click();
  await settle(page, 2200);
  const mine = await asStaff(page, "/api/telecaller/state");
  const lead = (mine.body?.leads || []).find((r) => String(r.last_name || "").includes(`Handover ${STAMP}`));
  if (!lead) throw new Fail("Telecaller A does not hold the lead they just created");
  state.handoverId = lead.id;
  await page.goto(`${BASE}/telecaller/leads/${lead.id}`, { waitUntil: "domcontentloaded" });
  await settle(page, 1600);
  const body = await textOf(page.locator("main").first());
  if (!body.includes(`Handover ${STAMP}`)) throw new Fail("Telecaller A cannot open the lead they hold");
  state.handoverUrl = page.url();
  return `held and opened by Telecaller A (lead ${String(lead.id).slice(0, 8)})`;
});

await step("6.2", "an Admin can hand the lead to the other telecaller", async () => {
  if (!state.handoverId) throw new Blocked("6.1 never made a lead");
  const page = state.adminPage;
  const boss = state.superPage;
  const staff = await asStaff(boss, "/api/state");
  const list = [
    ...(staff.body?.telecallers || []),
    ...(staff.body?.staff || []),
    ...(staff.body?.users || []),
  ];
  const other = list.find((u) => String(u.email || "").toLowerCase() === people.teleA2.address);
  if (!other) throw new Blocked(`the second Branch A telecaller is not in the staff list (${list.length} staff read)`);
  state.teleA2Id = other.id;

  // Look for a screen that can move a lead ALREADY assigned to someone.
  const places = ["/admin/alerts", `/admin/leads/${state.handoverId}`, "/admin/leads"];
  let control = "";
  for (const path of places) {
    await page.goto(`${BASE}${path}`, { waitUntil: "domcontentloaded" });
    await settle(page, 1900);
    const body = await textOf(page.locator("main").first());
    if (!body.includes(`Handover ${STAMP}`)) continue;
    const reassign = page.locator("li, div").filter({ hasText: `Handover ${STAMP}` })
      .getByRole("button", { name: /assign telecaller|reassign|transfer/i });
    if (await reassign.count()) { control = path; break; }
  }
  if (!control) {
    const moved = await asStaff(boss, `/api/leads/${state.handoverId}`, {
      method: "PATCH", body: JSON.stringify({ assigned_telecaller_id: state.teleA2Id }),
    });
    if (moved.status >= 400) throw new Fail(`even the API refused to reassign: ${JSON.stringify(moved.body).slice(0, 140)}`);
    throw new Blocked(
      "no screen reassigns a lead that already has a telecaller: /admin/alerts lists only leads with no owner, "
      + "and the lead's own page shows the telecaller as read-only text. PATCH /api/leads/:id works and was used "
      + "here so Journey 6 could continue, but a reassignment cannot be done from the product.",
    );
  }
  const after = await asStaff(boss, "/api/state");
  const lead = (after.body?.leads || []).find((r) => String(r.id) === String(state.handoverId));
  if (String(lead?.assigned_telecaller_id || "") !== String(state.teleA2Id)) throw new Fail("the reassignment did not save");
  return `reassigned from ${control}, and the record names the new telecaller`;
});

await step("6.3", "the first telecaller loses it from their queue and their saved URL", async () => {
  if (!state.handoverId) throw new Blocked("6.1 never made a lead");
  const page = state.telePage;
  await page.goto(`${BASE}/telecaller/queue`, { waitUntil: "domcontentloaded" });
  await settle(page, 2000);
  const queue = await textOf(page.locator("main").first());
  if (queue.includes(`Handover ${STAMP}`)) {
    await shot(page, "6.3-still-in-queue");
    throw new Fail("the lead is still in the first telecaller's queue after being reassigned");
  }
  const direct = await asStaff(page, `/api/telecaller/leads/${state.handoverId}`);
  if (direct.status < 400) throw new Fail(`the first telecaller can still read the lead: ${direct.status}`);
  await page.goto(state.handoverUrl, { waitUntil: "domcontentloaded" });
  await settle(page, 2000);
  const reopened = await textOf(page.locator("body"));
  if (reopened.includes(`QA Handover ${STAMP}`) && !/not found|no access|not allowed|sign in/i.test(reopened)) {
    await shot(page, "6.3-saved-url-worked");
    throw new Fail("the saved lead URL still shows the lead to the telecaller it was taken from");
  }
  return `gone from the queue, the saved URL shows nothing, and a direct read is refused with ${direct.status}`;
});

await step("6.4", "the new telecaller can open it", async () => {
  if (!state.handoverId) throw new Blocked("6.1 never made a lead");
  const page = await signIn(await newContext("teleA2"), "Telecaller B (same branch)", people.teleA2.address, PASSWORD);
  state.teleA2Page = page;
  await page.goto(`${BASE}/telecaller/queue`, { waitUntil: "domcontentloaded" });
  await settle(page, 2000);
  const queue = await textOf(page.locator("main").first());
  if (!queue.includes(`Handover ${STAMP}`)) throw new Fail(`the lead is not in the new telecaller's queue: ${queue.slice(0, 220)}`);
  await page.goto(`${BASE}/telecaller/leads/${state.handoverId}`, { waitUntil: "domcontentloaded" });
  await settle(page, 1800);
  const body = await textOf(page.locator("main").first());
  if (!body.includes(`Handover ${STAMP}`)) throw new Fail("the new telecaller cannot open the lead they now hold");
  return "in their queue, and the lead opens with its details";
});

await step("6.5", "an Admin deactivates them while they are signed in", async () => {
  if (!state.teleA2Id) throw new Blocked("6.2 never identified the second telecaller");
  const boss = state.superPage;
  const done = await asStaff(boss, `/api/users/${state.teleA2Id}/suspend`, {
    method: "POST", body: JSON.stringify({ reason: `QA deactivation ${STAMP}` }),
  });
  if (done.status >= 400) throw new Fail(`the account could not be deactivated: ${done.status} ${JSON.stringify(done.body).slice(0, 140)}`);
  await boss.goto(`${BASE}/admin/users`, { waitUntil: "domcontentloaded" });
  await settle(boss, 2200);
  // Pick the whole card, not the innermost box that happens to hold the email: every staff card
  // carries a Reset password button, and the state badge sits beside it.
  const search = boss.locator('input[placeholder*="Search users" i]').first();
  if (await search.count()) { await search.fill(people.teleA2.address); await settle(boss, 1500); }
  const row = boss.locator("div").filter({ hasText: people.teleA2.address })
    .filter({ has: boss.getByRole("button", { name: /reset password/i }) }).last();
  const shown = (await row.count()) ? await textOf(row) : await textOf(boss.locator("main").first());
  if (!/suspend|deactiv|disabled|inactive|removed/i.test(shown)) {
    await shot(boss, "6.5-no-state-shown");
    throw new Fail(`the staff list does not show the account as deactivated: ${shown.replace(/\s+/g, " ").slice(0, 200)}`);
  }
  return "deactivated, and the staff list says so";
});

await step("6.6", "their open session stops working at once", async () => {
  const page = state.teleA2Page;
  if (!page) throw new Blocked("6.4 never signed that telecaller in");
  // Their access token is still in the browser and has minutes left on it. What must not happen is
  // that it keeps opening protected data: every request re-reads the account from SQL.
  const direct = await asStaff(page, "/api/telecaller/state");
  if (direct.status < 400) {
    await shot(page, "6.6-session-alive");
    throw new Fail(`a deactivated employee's open session still reads protected data: ${direct.status}`);
  }
  await page.goto(`${BASE}/telecaller/queue`, { waitUntil: "domcontentloaded" });
  await settle(page, 2200);
  const body = await textOf(page.locator("body"));
  const path = new URL(page.url()).pathname;
  const locked = !path.startsWith("/telecaller") || /sign in|no access|not allowed|disabled|session/i.test(body);
  if (!locked) {
    await shot(page, "6.6-still-inside");
    throw new Fail(`the deactivated employee is still inside the portal at ${path}`);
  }
  if (body.includes(`Handover ${STAMP}`)) throw new Fail("protected lead data rendered for a deactivated employee");
  return `the API refuses with ${direct.status} and the portal sends them to ${path}`;
});

await step("6.7", "they cannot sign in again while deactivated", async () => {
  const context = await newContext("teleA2-again");
  const page = listen(await context.newPage());
  await page.goto(`${BASE}/staff`, { waitUntil: "domcontentloaded" });
  await settle(page, 1200);
  await page.fill("#staff-email", people.teleA2.address);
  await page.fill("#staff-password", PASSWORD);
  clearHeard(page);
  await page.locator("button[type=submit]").first().click();
  await settle(page, 3000);
  const path = new URL(page.url()).pathname;
  if (path.startsWith("/telecaller")) {
    await shot(page, "6.7-signed-in");
    throw new Fail("a deactivated employee signed in");
  }
  const body = await textOf(page.locator("body"));
  const told = `${heardBy(page).join(" ")} ${body}`;
  const reason = told.match(/[^.|]*\b(disabled|deactivat|suspend|no longer|not allowed|contact)\b[^.|]*/i)?.[0];
  if (!reason) throw new Fail(`sign-in was refused but nothing said why: ${body.replace(/\s+/g, " ").slice(0, 200)}`);
  return `refused with "${reason.trim().slice(0, 90)}"`;
});

const journeys = { "1": "Journey 1", "2": "Journey 2", "3": "Journey 3", "4": "Journey 4", "5": "Journey 5", "6": "Journey 6" };
const lines = [];
lines.push(`Environment/URL: ${BASE}`);
lines.push(`Date: ${new Date().toISOString()}`);
lines.push(`Browser/device: Chromium ${browser.version()} desktop 1400x900`);
let commit = "unknown";
try {
  const r = await fetch(`${BASE}/api/version`);
  const v = await r.json();
  commit = `${v.short || v.commit || "none reported"}${v.features ? `  features=${JSON.stringify(v.features)}` : ""}`;
} catch { commit = "unreachable"; }
lines.push(`Deployed commit, if known: ${commit}`);
lines.push("");
for (const [prefix, label] of Object.entries(journeys)) {
  const mine = results.filter((r) => r.id.startsWith(`${prefix}.`));
  if (!mine.length) continue;
  lines.push(`${label}: ${mine.map((r) => `${r.id} ${r.status}`).join(", ")}`);
}
lines.push("");
const bad = results.filter((r) => r.status !== "Pass");
if (!bad.length) lines.push("Failed/blocked step: none");
for (const r of bad) {
  lines.push(`Failed/blocked step: ${r.id} (${r.status}) - ${r.what}`);
  lines.push(`What actually happened: ${r.detail}`);
}
lines.push("");
for (const [prefix, label] of Object.entries(journeys)) {
  const mine = results.filter((r) => r.id.startsWith(`${prefix}.`));
  if (!mine.length) continue;
  const clean = mine.every((r) => r.status === "Pass");
  lines.push(`${label}: ${clean ? "PASSED" : "NOT PASSED"} (${mine.filter((r) => r.status === "Pass").length}/${mine.length} steps)`);
}
const report = lines.join("\n");
console.log(`\n${"=".repeat(78)}\n${report}\n${"=".repeat(78)}`);
writeFileSync(join(SHOTS, `walkthrough-${STAMP}.txt`), `${report}\n`);
writeFileSync(join(SHOTS, `walkthrough-${STAMP}.json`), `${JSON.stringify(results, null, 2)}\n`);
console.log(`\nreport: ${join(SHOTS, `walkthrough-${STAMP}.txt`)}`);

await browser.close();
exit(results.some((r) => r.status === "Fail") ? 1 : 0);
