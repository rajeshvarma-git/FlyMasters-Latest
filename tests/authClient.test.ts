// Staying signed in without the person noticing, and signing out for real.
//
// The access token is now fifteen minutes long instead of seven days, which only works if a 401
// quietly fetches a new one. These are the parts of that which can break silently:
//
//   * a request that fails with 401 must be retried, once, with the new token
//   * several requests failing together must cause ONE refresh. Rotation treats a second use of a
//     refresh token as theft and ends the session, so a stampede would sign the person out — the exact
//     opposite of what the refresh is for.
//   * a refresh that is genuinely refused must clear the session rather than loop
//   * signing out must tell the server, so the refresh token cannot be used again
//
// No device and no browser: a Storage stand-in and a stubbed fetch are enough.
import test from "node:test";
import assert from "node:assert/strict";

class MemoryStorage {
  private map = new Map<string, string>();
  get length() { return this.map.size; }
  key(i: number) { return [...this.map.keys()][i] ?? null; }
  getItem(k: string) { return this.map.has(k) ? this.map.get(k)! : null; }
  setItem(k: string, v: string) { this.map.set(k, String(v)); }
  removeItem(k: string) { this.map.delete(k); }
  clear() { this.map.clear(); }
}

const g = globalThis as any;
g.window = g.window || {};
g.window.location = g.window.location || { origin: "http://localhost" };
g.sessionStorage = new MemoryStorage();
g.localStorage = new MemoryStorage();
g.window.sessionStorage = g.sessionStorage;
g.window.localStorage = g.localStorage;

const auth = await import("../src/shared/lib/authClient.ts");
const { pickRefreshStore } = await import("../src/shared/lib/secureStore.ts");

type Call = { url: string; init: RequestInit };
let calls: Call[] = [];
const reply = (status: number, body: unknown = {}) =>
  ({ ok: status >= 200 && status < 300, status, json: async () => body, text: async () => JSON.stringify(body) }) as unknown as Response;

/** Installs a fetch that answers from `handler` and records every call. */
function stubFetch(handler: (call: Call) => Response | Promise<Response>) {
  calls = [];
  g.fetch = async (url: string, init: RequestInit = {}) => {
    const call = { url: String(url), init };
    calls.push(call);
    return handler(call);
  };
}
const refreshCalls = () => calls.filter((c) => c.url.endsWith("/api/auth/refresh"));
const authOf = (call: Call) => ((call.init.headers as Record<string, string>) || {}).Authorization;

const signedIn = (refreshToken: string | null = "refresh-1") => {
  auth.saveTokens({ token: "access-old", refreshToken });
};

test("a request that works is sent once and left alone", async () => {
  signedIn();
  stubFetch(() => reply(200, { ok: true }));
  const res = await auth.fetchWithRefresh("/api/state", { headers: { Authorization: "Bearer access-old" } });
  assert.equal(res.status, 200);
  assert.equal(calls.length, 1);
  assert.equal(refreshCalls().length, 0, "a working request triggered a refresh");
});

test("a 401 refreshes once and retries the same request with the new token", async () => {
  signedIn();
  stubFetch((call) => {
    if (call.url.endsWith("/api/auth/refresh")) return reply(200, { token: "access-new", refreshToken: "refresh-2" });
    return reply(authOf(call) === "Bearer access-new" ? 200 : 401, { ok: authOf(call) === "Bearer access-new" });
  });

  const res = await auth.fetchWithRefresh("/api/state", { headers: { Authorization: "Bearer access-old" } });
  assert.equal(res.status, 200, "the request was not retried with the refreshed token");
  assert.equal(refreshCalls().length, 1);
  assert.equal(auth.getAccessToken(), "access-new", "the new access token was not stored");
  assert.equal(await auth.getRefreshToken(), "refresh-2", "the rotated refresh token was not stored");
});

test("the retry happens once: a second 401 is returned, not refreshed again", async () => {
  signedIn();
  stubFetch((call) =>
    call.url.endsWith("/api/auth/refresh") ? reply(200, { token: "access-new", refreshToken: "refresh-2" }) : reply(401, { error: "expired" }));

  const res = await auth.fetchWithRefresh("/api/state", { headers: { Authorization: "Bearer access-old" } });
  assert.equal(res.status, 401);
  assert.equal(refreshCalls().length, 1, "it refreshed more than once for one request");
  assert.equal(calls.length, 3, "expected request, refresh, retry");
});

test("ten requests failing together cause ONE refresh", async () => {
  signedIn();
  let refreshes = 0;
  stubFetch((call) => {
    if (call.url.endsWith("/api/auth/refresh")) {
      refreshes += 1;
      return new Promise((resolve) => setTimeout(() => resolve(reply(200, { token: "access-new", refreshToken: `rot-${refreshes}` })), 10));
    }
    return reply(authOf(call) === "Bearer access-new" ? 200 : 401, {});
  });

  const results = await Promise.all(
    Array.from({ length: 10 }, (_, i) => auth.fetchWithRefresh(`/api/state?${i}`, { headers: { Authorization: "Bearer access-old" } })),
  );
  assert.equal(refreshes, 1, `${refreshes} refreshes: rotation would read the extras as theft and end the session`);
  assert.deepEqual([...new Set(results.map((r) => r.status))], [200]);
});

test("a refused refresh clears the session instead of looping", async () => {
  signedIn();
  stubFetch((call) =>
    call.url.endsWith("/api/auth/refresh")
      ? reply(401, { error: "That session has been signed out. Sign in again.", code: "REFRESH_REVOKED" })
      : reply(401, { error: "expired" }));

  const res = await auth.fetchWithRefresh("/api/state", { headers: { Authorization: "Bearer access-old" } });
  assert.equal(res.status, 401);
  assert.equal(auth.getAccessToken(), "", "a dead token was left behind");
  assert.equal(await auth.getRefreshToken(), null, "a dead refresh token was left behind");
});

test("a network failure during refresh keeps the tokens: it is not a dead session", async () => {
  signedIn();
  stubFetch((call) => {
    if (call.url.endsWith("/api/auth/refresh")) throw new TypeError("Failed to fetch");
    return reply(401, {});
  });
  const res = await auth.fetchWithRefresh("/api/state", { headers: { Authorization: "Bearer access-old" } });
  assert.equal(res.status, 401);
  assert.equal(await auth.getRefreshToken(), "refresh-1", "an offline moment signed the person out");
});

test("with no refresh token stored, a 401 is passed straight through", async () => {
  auth.clearTokens();
  signedIn(null);
  stubFetch(() => reply(401, {}));
  const res = await auth.fetchWithRefresh("/api/state", { headers: { Authorization: "Bearer access-old" } });
  assert.equal(res.status, 401);
  assert.equal(refreshCalls().length, 0, "it tried to refresh without a refresh token");
});

test("an unauthenticated request is never refreshed", async () => {
  signedIn();
  stubFetch(() => reply(401, {}));
  await auth.fetchWithRefresh("/api/auth/signin", { method: "POST" });
  assert.equal(refreshCalls().length, 0, "a wrong password triggered a refresh");
});

test("signing out tells the server and then clears the browser", async () => {
  signedIn("refresh-9");
  stubFetch(() => reply(200, { ok: true }));
  await auth.signOut();
  assert.equal(calls.length, 1);
  assert.match(calls[0].url, /\/api\/auth\/signout$/);
  assert.equal(JSON.parse(String(calls[0].init.body)).refreshToken, "refresh-9", "the server was not told which session to end");
  assert.equal(auth.getAccessToken(), "");
  assert.equal(await auth.getRefreshToken(), null);
});

test("signing out offline still clears the browser", async () => {
  signedIn("refresh-9");
  stubFetch(() => { throw new TypeError("Failed to fetch"); });
  await auth.signOut();
  assert.equal(auth.getAccessToken(), "");
  assert.equal(await auth.getRefreshToken(), null);
});

// ---- where the refresh token is kept -----------------------------------------------------------

test("the refresh token goes to the best store the platform has, and nothing is claimed that is not there", () => {
  const secure = { SecureStoragePlugin: {} as any };
  const prefs = { Preferences: {} as any };
  assert.equal(pickRefreshStore(true, { ...secure, ...prefs }), "keychain", "a secure store was available and not used");
  assert.equal(pickRefreshStore(true, prefs), "native-preferences");
  assert.equal(pickRefreshStore(true, {}), "browser-storage", "a native build with no plugin must not claim encryption");
  assert.equal(pickRefreshStore(true, undefined), "browser-storage");
  assert.equal(pickRefreshStore(false, secure), "browser-storage", "the web has no keychain");
});
