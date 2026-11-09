// Does every portal work at phone width? (Milestone 3.2, responsive screens.)
//
// The mobile shell wraps this same web app, so a screen that overflows in a 390px browser overflows on
// the device. That part is checkable without a device, and it is where mobile layout actually breaks:
// a table or a toolbar wider than the viewport makes the page scroll sideways and pushes controls off.
//
// It needs Playwright, which is NOT a project dependency — this is a check you run, not part of the
// build. Install it where you run it:
//
//   npx playwright install chromium
//   node scripts/responsive-audit.mjs --url http://localhost:8788 --email boss@example.com
//
// The password comes from AUDIT_PASSWORD so it stays out of shell history. Read-only: it signs in and
// looks at pages, and writes nothing.
import { argv, env, exit } from "node:process";

let chromium;
try {
  ({ chromium } = await import("playwright"));
} catch {
  // A global install is not resolvable from the project, so allow an explicit path:
  //   PLAYWRIGHT_MODULE=/path/to/playwright/index.js node scripts/responsive-audit.mjs ...
  if (env.PLAYWRIGHT_MODULE) {
    try {
      // A CommonJS build exposes its exports under `default`, so accept either shape.
      const mod = await import(env.PLAYWRIGHT_MODULE);
      chromium = mod.chromium || mod.default?.chromium;
      if (!chromium) throw new Error("that module exports no chromium");
    } catch (error) {
      console.error(`PLAYWRIGHT_MODULE did not load: ${error?.message || error}`);
      exit(2);
    }
  } else {
    console.error("This check needs Playwright:  npx playwright install chromium");
    console.error("It is deliberately not a project dependency; nothing in the build uses it.");
    console.error("If Playwright is installed globally, point PLAYWRIGHT_MODULE at its index.js.");
    exit(2);
  }
}

const arg = (name, fallback = "") => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 ? argv[i + 1] : fallback;
};
const base = arg("url", env.AUDIT_URL || "").replace(/\/+$/, "");
const email = arg("email", env.AUDIT_EMAIL || "");
const password = env.AUDIT_PASSWORD || "";
const width = Number(arg("width", "390"));
const height = Number(arg("height", "844"));
if (!base || !email || !password) {
  console.error("Give --url and --email, and set AUDIT_PASSWORD. --width/--height default to 390x844.");
  exit(2);
}

// One signed-in page per portal, by the role that uses it.
const ROUTES = [
  "/admin", "/admin/leads", "/admin/students", "/admin/users", "/admin/branches",
  "/admin/documents", "/admin/whatsapp", "/admin/partners", "/admin/finance",
  "/admin/team", "/admin/universities", "/admin/settings",
  "/counselor", "/counselor/students", "/counselor/documents",
  "/telecaller/queue", "/telecaller/my-work",
  "/staff",
];

const res = await fetch(`${base}/api/auth/signin`, {
  method: "POST", headers: { "content-type": "application/json" },
  body: JSON.stringify({ email, password }),
});
const signin = await res.json().catch(() => ({}));
if (!signin?.token) {
  console.error(`Could not sign in as ${email}: ${res.status} ${JSON.stringify(signin).slice(0, 200)}`);
  exit(1);
}

const version = await fetch(`${base}/api/version`).then((r) => r.json()).catch(() => ({}));
console.log(`\n== ${base} at ${width}x${height}`);
console.log(`== Deployed commit ${version.short || "UNKNOWN"}${version.branch ? ` on ${version.branch}` : ""}\n`);

const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: 2 });
const page = await context.newPage();

// The staff portals keep the token in sessionStorage on the web (see shared/lib/tokenStore.ts).
await page.goto(`${base}/staff`, { waitUntil: "domcontentloaded" });
await page.evaluate(({ token, user }) => {
  sessionStorage.setItem("fm_token", token);
  sessionStorage.setItem("fm_user", JSON.stringify(user));
}, { token: signin.token, user: signin.user });

let problems = 0;
const findings = [];

for (const route of ROUTES) {
  await page.goto(base + route, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(900); // let the first data load settle
  const report = await page.evaluate((viewportWidth) => {
    const doc = document.documentElement;
    const overflow = doc.scrollWidth - doc.clientWidth;
    const wide = [];
    for (const el of document.querySelectorAll("body *")) {
      const box = el.getBoundingClientRect();
      if (box.width < 1 || box.height < 1) continue;
      // Only elements that actually stick out past the viewport, and only the outermost of a nest.
      if (box.right > viewportWidth + 2 || box.left < -2) {
        if (wide.some((w) => w.node.contains(el))) continue;
        // A tab strip or table inside a deliberately scrollable box is meant to be wider than the
        // screen; the person swipes it. Only an element that is NOT inside such a box is a problem.
        let scrollable = false;
        for (let a = el.parentElement; a && a !== document.body; a = a.parentElement) {
          const overflowX = getComputedStyle(a).overflowX;
          if ((overflowX === "auto" || overflowX === "scroll") && a.scrollWidth > a.clientWidth + 2) {
            scrollable = true;
            break;
          }
        }
        if (scrollable) continue;
        wide.push({
          node: el,
          tag: el.tagName.toLowerCase(),
          cls: String(el.className || "").slice(0, 70),
          width: Math.round(box.width),
          right: Math.round(box.right),
        });
      }
      if (wide.length > 6) break;
    }
    // Controls too small to hit reliably with a thumb. 24px is a lenient floor; 44 is the usual target.
    // Named, not counted: a bare number is not actionable, and some are decorative or hidden by design.
    const tiny = [];
    for (const el of document.querySelectorAll("button, a, input, select, [role=button]")) {
      const box = el.getBoundingClientRect();
      if (box.width < 1 || box.height < 1 || box.height >= 24) continue;
      const style = getComputedStyle(el);
      if (style.opacity === "0" || style.visibility === "hidden") continue; // not a target at all
      // A link inside a sentence is text, and text is the height of text. Only controls meant to be
      // tapped as a box — buttons, checkboxes, block links — are judged against the thumb floor.
      if (el.tagName === "A" && style.display === "inline") continue;
      // A checkbox or radio inside a <label> is tapped by the label, which is the real hit area.
      // Judge the label, not the box: a 20px checkbox on a 36px row is fine.
      if (el.tagName === "INPUT" && ["checkbox", "radio"].includes(el.getAttribute("type") || "")) {
        const label = el.closest("label");
        if (label && label.getBoundingClientRect().height >= 24) continue;
      }
      tiny.push({
        tag: el.tagName.toLowerCase(),
        label: (el.getAttribute("aria-label") || el.textContent || el.getAttribute("type") || "").trim().slice(0, 40),
        height: Math.round(box.height),
      });
      if (tiny.length > 5) break;
    }
    return {
      overflow, tiny,
      wide: wide.map(({ tag, cls, width: w, right }) => ({ tag, cls, width: w, right })),
      title: document.title,
      blank: (document.body.innerText || "").trim().length < 20,
    };
  }, width);

  const bad = report.overflow > 2 || report.blank;
  if (bad) problems += 1;
  const flag = report.blank ? "BLANK" : report.overflow > 2 ? `OVERFLOW +${report.overflow}px` : "ok";
  console.log(`${bad ? "FAIL" : "PASS"}  ${route.padEnd(24)} ${flag}`);
  for (const t of report.tiny) {
    console.log(`        small target: <${t.tag}> ${t.height}px tall${t.label ? ` — "${t.label}"` : ""}`);
  }
  for (const w of report.wide) {
    console.log(`        ${w.tag}.${w.cls} is ${w.width}px wide, reaching ${w.right}px`);
  }
  if (bad) findings.push({ route, ...report });
}

await browser.close();

console.log(`\n${ROUTES.length - problems} of ${ROUTES.length} screens fit ${width}px.`);
if (problems) {
  console.log("\nScreens to fix:");
  for (const f of findings) console.log(`  - ${f.route}: ${f.blank ? "rendered blank" : `overflows by ${f.overflow}px`}`);
}
exit(problems ? 1 : 0);
