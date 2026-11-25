/**
 * A short-lived, shared cache for the big "everything this person may see" read.
 *
 * Why it exists: /api/state and the telecaller screens each read about 29 whole tables, and every open
 * portal polls every few seconds. With a database pool of ten, a handful of overlapping polls queued
 * behind each other and a screen could sit on "Loading..." for 30 to 90 seconds (Journey 4-6 run on
 * Railway, 2026-11-25; a request that touches no database at all already costs ~0.4 s round trip).
 *
 * What it does:
 *  - callers with the same scope share ONE computation (the in-flight promise is reused), so ten
 *    simultaneous polls cost one read, not ten;
 *  - a finished result is reused for `ttlMs`, then recomputed;
 *  - any write through the API calls invalidate(), so a person's own change is visible on their next
 *    read rather than after the TTL;
 *  - every caller gets its OWN copy, because callers filter and re-assign parts of the state
 *    (the notifications of one user must never leak into another's response);
 *  - errors are never cached, and ttlMs of 0 turns the cache off (tests, local development).
 */
export function createStateCache({ ttlMs, compute, now = () => Date.now() }) {
  const entries = new Map(); // key -> { epoch, at, promise }
  let epoch = 0;

  const clone = (value) => (value === null || value === undefined ? value : structuredClone(value));

  async function get(key, ...args) {
    if (!(ttlMs > 0)) return compute(...args);

    const hit = entries.get(key);
    if (hit && hit.epoch === epoch && now() - hit.at < ttlMs) return clone(await hit.promise);

    const entry = { epoch, at: now(), promise: null };
    entry.promise = compute(...args);
    entries.set(key, entry);
    try {
      return clone(await entry.promise);
    } catch (error) {
      if (entries.get(key) === entry) entries.delete(key);
      throw error;
    }
  }

  function invalidate() {
    epoch += 1;
    entries.clear();
  }

  return { get, invalidate, size: () => entries.size };
}

/** A stable key: two requests with the same branches share a result, a different scope never does. */
export function scopeKey(scope) {
  if (!scope) return "all";
  return JSON.stringify({
    all: Boolean(scope.allBranches),
    ids: [...(scope.branchIds || [])].map(String).sort(),
    branch: scope.branchId ? String(scope.branchId) : null,
    partner: scope.partnerId ? String(scope.partnerId) : null,
  });
}
