import test from "node:test";
import assert from "node:assert/strict";
import { createFreshLoader } from "../src/shared/freshLoader";

const settle = () => new Promise((r) => setTimeout(r, 5));

function gatedLoader() {
  let calls = 0; const gates: Array<() => void> = [];
  const loader = createFreshLoader(() => { calls += 1; return new Promise<void>((r) => gates.push(r)); });
  return { loader, calls: () => calls, releaseNext: () => gates.shift()?.() };
}

test("shared() joins a running load", async () => {
  const t = gatedLoader();
  const a = t.loader.shared(); const b = t.loader.shared();
  assert.equal(t.calls(), 1);
  t.releaseNext(); await Promise.all([a, b]);
});

test("fresh() during a running load waits for it, then loads once more; repeated calls share that one", async () => {
  const t = gatedLoader();
  const poll = t.loader.shared();
  const f1 = t.loader.fresh(); const f2 = t.loader.fresh();
  assert.equal(t.calls(), 1);
  t.releaseNext(); await poll; await settle();
  assert.equal(t.calls(), 2, "the change must be read by a load that started after it");
  t.releaseNext(); await Promise.all([f1, f2]);
  assert.equal(t.calls(), 2);
});

test("fresh() with nothing running loads at once, and a failed load does not block the next", async () => {
  let n = 0;
  const loader = createFreshLoader(async () => { n += 1; if (n === 1) throw new Error("offline"); });
  await assert.rejects(() => loader.fresh(), /offline/);
  await loader.fresh();
  assert.equal(n, 2);
});
