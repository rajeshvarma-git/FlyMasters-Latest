import test from "node:test";
import assert from "node:assert/strict";
import { createStateCache, scopeKey } from "../server/lib/stateCache.mjs";

const tick = () => new Promise((r) => setTimeout(r, 5));

test("simultaneous readers with the same scope share one computation", async () => {
  let calls = 0;
  const cache = createStateCache({ ttlMs: 1000, compute: async () => { calls += 1; await tick(); return { leads: [1, 2, 3] }; } });
  const results = await Promise.all(Array.from({ length: 10 }, () => cache.get("a")));
  assert.equal(calls, 1, "ten polls should cost one read");
  assert.equal(results.length, 10);
});

test("each caller gets its own copy: one user's change never reaches another", async () => {
  const cache = createStateCache({ ttlMs: 1000, compute: async () => ({ notifications: [{ user_id: "u1" }, { user_id: "u2" }], leads: [{ id: 1 }] }) });
  const first = await cache.get("a");
  first.notifications = first.notifications.filter((n) => n.user_id === "u1");
  first.leads[0].id = 999;
  const second = await cache.get("a");
  assert.equal(second.notifications.length, 2, "a filtered copy leaked into the cache");
  assert.equal(second.leads[0].id, 1, "an edited row leaked into the cache");
});

test("a different scope never shares a result", async () => {
  const cache = createStateCache({ ttlMs: 1000, compute: async (scope) => ({ scope }) });
  const a = await cache.get(scopeKey({ allBranches: false, branchIds: ["b1"] }), { branchIds: ["b1"] });
  const b = await cache.get(scopeKey({ allBranches: false, branchIds: ["b2"] }), { branchIds: ["b2"] });
  assert.deepEqual(a.scope.branchIds, ["b1"]);
  assert.deepEqual(b.scope.branchIds, ["b2"]);
  assert.equal(scopeKey({ allBranches: false, branchIds: ["b2", "b1"] }), scopeKey({ allBranches: false, branchIds: ["b1", "b2"] }), "branch order must not matter");
  assert.notEqual(scopeKey(null), scopeKey({ allBranches: true, branchIds: [] }));
});

test("a write invalidates, and a finished read expires after the ttl", async () => {
  let calls = 0; let t = 0;
  const cache = createStateCache({ ttlMs: 100, now: () => t, compute: async () => ({ n: ++calls }) });
  assert.equal((await cache.get("a")).n, 1);
  assert.equal((await cache.get("a")).n, 1, "should be served from the cache");
  cache.invalidate();
  assert.equal((await cache.get("a")).n, 2, "a write must force a fresh read");
  t = 500;
  assert.equal((await cache.get("a")).n, 3, "an expired entry must be recomputed");
});

test("errors are not cached, and a ttl of 0 turns the cache off", async () => {
  let calls = 0;
  const flaky = createStateCache({ ttlMs: 1000, compute: async () => { calls += 1; if (calls === 1) throw new Error("db down"); return { ok: true }; } });
  await assert.rejects(() => flaky.get("a"), /db down/);
  assert.deepEqual(await flaky.get("a"), { ok: true });

  let off = 0;
  const disabled = createStateCache({ ttlMs: 0, compute: async () => ({ n: ++off }) });
  await disabled.get("a"); await disabled.get("a");
  assert.equal(off, 2);
});

test("a read slower than the ttl is still shared and reused right after it finishes", async () => {
  let calls = 0; let t = 0;
  const cache = createStateCache({
    ttlMs: 100, now: () => t,
    compute: async () => { calls += 1; t += 12000; return { n: calls }; }, // a 12 s read, as seen on Railway
  });
  assert.equal((await cache.get("a")).n, 1);
  assert.equal((await cache.get("a")).n, 1, "a read that took longer than the ttl was thrown away the moment it finished");
  assert.equal(calls, 1);
  t += 1000;
  assert.equal((await cache.get("a")).n, 2, "and it must expire the ttl after it finished");
});

import { createThrottledJob } from "../server/lib/stateCache.mjs";

test("a throttled job runs in the background at most once per window, and never makes a read wait", async () => {
  let runs = 0; let t = 0; let release;
  const gate = new Promise((r) => { release = r; });
  const trigger = createThrottledJob(async () => { runs += 1; await gate; }, { everyMs: 1000, now: () => t });
  await trigger();                       // returns at once even though the job is still running
  await trigger(); await trigger();
  assert.equal(runs, 1, "must not start again while running or inside the window");
  release(); await tick();
  t = 500; await trigger();
  assert.equal(runs, 1, "still inside the window");
  t = 1500; await trigger(); await tick();
  assert.equal(runs, 2, "runs again once the window has passed");
});

test("a throttled job with everyMs 0 runs inline every time, and a failure never reaches the caller", async () => {
  let runs = 0; const errors = [];
  const trigger = createThrottledJob(async () => { runs += 1; throw new Error("boom"); }, { everyMs: 0, onError: (e) => errors.push(e.message) });
  await trigger(); await trigger();
  assert.equal(runs, 2);
  assert.deepEqual(errors, ["boom", "boom"]);
});
