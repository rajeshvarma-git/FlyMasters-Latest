// Which counselor-portal calls get the /api/counselor prefix, and which must not.
//
// Counselor endpoints moved under /api/counselor/* so they stopped shadowing the shared routes, and
// prefixing became the default. But several screens in that portal are SHARED with the admin portal
// and call the shared routes - the checklist panel is one - so prefixing their calls turns a working
// endpoint into "API route not found" on the screen, with nothing in the console to say why.
//
// The singular and the plural are the trap: /students/:id/checklist and /students/:id/document-requests
// ARE counselor routes and keep the prefix, while /students/:id/checklists and /students/:id/progress
// are shared and must not be prefixed. This test checks the list against the routes that actually
// exist in the server, so the two can never drift apart quietly again.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { isSharedPath } from "../src/portals/counselor/lib/api.ts";

const routes = new Set<string>();
const dir = new URL("../server/routes/", import.meta.url);
for (const file of readdirSync(dir).filter((name) => name.endsWith(".mjs"))) {
  const src = readFileSync(new URL(file, dir), "utf8").replace(/\r\n/g, "\n");
  for (const [, path] of src.matchAll(/router\.(?:get|post|patch|put|delete)\(\s*"([^"]+)"/g)) routes.add(path);
}

/** Turns a call the portal makes into the route pattern the server would have registered. */
const asRoute = (path: string) =>
  path.split("?")[0].replace(/\/(cs-[a-z0-9-]+|[0-9a-f-]{8,}|x)(?=\/|$)/gi, "/:id");

test("the route list was actually found (an empty one would make everything below pass)", () => {
  assert.ok(routes.size > 200, `only ${routes.size} routes found in server/routes`);
});

test("shared paths exist unprefixed and have no counselor copy", () => {
  for (const path of ["/config/reasons?kind=rejection", "/students/x/checklists", "/students/x/progress"]) {
    assert.equal(isSharedPath(path), true, `${path} must be called without the counselor prefix`);
    const route = asRoute(path);
    assert.ok(routes.has(`/api${route}`), `/api${route} does not exist, so the portal would 404`);
    assert.equal(routes.has(`/api/counselor${route}`), false,
      `/api/counselor${route} now exists, so this path should stop being treated as shared`);
  }
});

test("counselor paths keep the prefix, and the singular is not confused with the plural", () => {
  for (const path of ["/students/x/checklist", "/students/x/document-requests", "/state", "/leads/x", "/documents/x/file"]) {
    assert.equal(isSharedPath(path), false, `${path} must keep the counselor prefix`);
    const route = asRoute(path);
    assert.ok(routes.has(`/api/counselor${route}`), `/api/counselor${route} does not exist, so the portal would 404`);
  }
});

test("sign-in, WhatsApp and alerts stay shared", () => {
  for (const path of ["/auth/signin", "/whatsapp/conversations", "/alerts"]) {
    assert.equal(isSharedPath(path), true, `${path} must not be prefixed`);
  }
});

test("a path that merely starts the same way is not mistaken for a shared one", () => {
  // Anchored and exact on purpose: /configuration is not /config/, and /alerts-settings is not /alerts.
  assert.equal(isSharedPath("/students/x/checklists-archive"), false);
  assert.equal(isSharedPath("/students/x/progress-report"), false);
  assert.equal(isSharedPath("/configuration"), false);
});
