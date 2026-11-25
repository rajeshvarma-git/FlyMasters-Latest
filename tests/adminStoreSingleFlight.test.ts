// The admin portal must send ONE /api/state request at a time, however many screens ask for it.
//
// Found on the live app (21 Nov 2026): every component reading admin data started its own
// five-second poller and its own request on mount, with nothing stopping duplicates. Production
// queued 15+ /api/state requests at once and the portal took up to 29 seconds to open.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

let calls = 0;
let release: () => void = () => {};
const g = globalThis as Record<string, unknown>;
g.window = globalThis;
g.location = { origin: "http://localhost", href: "http://localhost/" };
g.fetch = async () => {
  calls += 1;
  await new Promise<void>((resolve) => { release = resolve; });
  return new Response(JSON.stringify({ users: [], leads: [] }), { status: 200 });
};

const settle = () => new Promise((resolve) => setTimeout(resolve, 20));
const store = await import("../src/portals/admin/lib/store.ts");

test("five polls or opening screens at once share one request", async () => {
  const pending = [1, 2, 3, 4, 5].map(() => store.sharedRefresh());
  await settle();
  assert.equal(calls, 1, "a second request started while the first was still running");
  assert.equal(store.pollingState().inFlight, true);
  release();
  await Promise.all(pending);
  assert.equal(store.pollingState().inFlight, false);
});

test("the next refresh after one finishes does go to the server", async () => {
  const next = store.refreshStore();
  await settle();
  assert.equal(calls, 2);
  release();
  await next;
});

test("a refresh after a save never returns a request that started before it", async () => {
  const poll = store.sharedRefresh();          // a poll is running...
  await settle();
  assert.equal(calls, 3);
  const afterSave = [1, 2, 3].map(() => store.refreshStore()); // ...when the user saves something
  await settle();
  assert.equal(calls, 3, "must wait for the running poll, not start a parallel request");
  release(); await poll; await settle();
  assert.equal(calls, 4, "the saves must get ONE new request that started after them");
  release(); await Promise.all(afterSave);
});

test("the store has one shared timer, not one per component", () => {
  const src = readFileSync(new URL("../src/portals/admin/lib/store.ts", import.meta.url), "utf8");
  assert.equal(src.match(/setInterval\(/g)?.length, 1);
  const hook = src.slice(src.indexOf("export function useAdminStore"));
  assert.ok(!hook.includes("setInterval("), "useAdminStore must not start its own timer");
  assert.ok(src.includes('visibilityState === "hidden"'), "a hidden tab must not poll");
});
