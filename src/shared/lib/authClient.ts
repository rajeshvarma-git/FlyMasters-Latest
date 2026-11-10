// Staying signed in: one access token, refreshed quietly, for every staff portal.
//
// The access token is fifteen minutes long and cannot be revoked, which is the point: its lifetime is
// the window a copied token stays useful. That only works if something replaces it without asking for
// the password again, and that is the refresh token (server/lib/refreshTokens.mjs).
//
// What this file does:
//   * keeps the access token where tokenStore.ts says, and the refresh token where secureStore.ts says
//   * sends a request, and on 401 refreshes ONCE and retries the same request
//   * refreshes single-flight: ten requests failing together cause one refresh, not ten. Ten would
//     also break the session outright, because rotation treats a second use of one refresh token as
//     theft and ends the sign-in.
//   * signs out on the server as well as in the browser, which is what makes sign-out mean something
import { apiBase } from "./apiBase";
import { readToken, writeToken } from "./tokenStore";
import { readSecure, writeSecure } from "./secureStore";

export const TOKEN_KEY = "fm_token";
export const USER_KEY = "fm_user";
export const REFRESH_KEY = "fm_refresh";

/** Kept in memory as well as in storage: a retry must not wait on a native plugin round-trip. */
let refreshInMemory: string | null = null;
let inFlight: Promise<string | null> | null = null;

export const getAccessToken = (): string => readToken(TOKEN_KEY) || "";
export const setAccessToken = (token: string | null): void => writeToken(TOKEN_KEY, token);

export async function getRefreshToken(): Promise<string | null> {
  if (refreshInMemory) return refreshInMemory;
  refreshInMemory = await readSecure(REFRESH_KEY);
  return refreshInMemory;
}

export function setRefreshToken(token: string | null): void {
  refreshInMemory = token;
  void writeSecure(REFRESH_KEY, token);
}

/** Everything a sign-in or a refresh hands back. `refreshToken` is absent on an older server. */
export type SignInTokens = { token: string; refreshToken?: string | null; expiresIn?: string };

/** Stores a fresh sign-in. Call this with the whole sign-in response, not just the access token. */
export function saveTokens(data: SignInTokens): void {
  setAccessToken(data.token || null);
  if (data.refreshToken !== undefined) setRefreshToken(data.refreshToken || null);
}

/** Clears the browser only. Use `signOut` to end the session on the server too. */
export function clearTokens(): void {
  setAccessToken(null);
  setRefreshToken(null);
  writeToken(USER_KEY, null);
}

/**
 * Exchanges the refresh token for a new access token. Returns the new access token, or null when the
 * session is over — expired, signed out, or ended because the token was used twice.
 */
export async function refreshAccessToken(): Promise<string | null> {
  if (inFlight) return inFlight;
  inFlight = (async () => {
    const refreshToken = await getRefreshToken();
    if (!refreshToken) return null;
    try {
      const res = await fetch(`${apiBase()}/api/auth/refresh`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ refreshToken }),
      });
      if (!res.ok) {
        clearTokens();
        return null;
      }
      const data = (await res.json()) as SignInTokens & { user?: unknown };
      if (!data?.token) {
        clearTokens();
        return null;
      }
      saveTokens(data);
      if (data.user) writeToken(USER_KEY, JSON.stringify(data.user));
      return data.token;
    } catch {
      // A network failure is not a dead session: keep the tokens and let the caller surface the error.
      return null;
    }
  })();
  try {
    return await inFlight;
  } finally {
    inFlight = null;
  }
}

/**
 * Sends a request with the access token and, if the server says 401, refreshes once and sends it
 * again. Anything else is returned untouched, so each portal keeps its own error handling.
 *
 * `init.headers` is expected to be a plain object, which is what all four portals pass.
 */
export async function fetchWithRefresh(url: string, init: RequestInit = {}): Promise<Response> {
  const headers: Record<string, string> = { ...((init.headers as Record<string, string>) || {}) };
  const hadAuth = Boolean(headers.Authorization);
  const first = await fetch(url, { ...init, headers });
  if (first.status !== 401 || !hadAuth) return first;

  const token = await refreshAccessToken();
  if (!token) return first;
  return fetch(url, { ...init, headers: { ...headers, Authorization: `Bearer ${token}` } });
}

/**
 * Ends the session on the server, then clears the browser. The access token keeps working for the few
 * minutes it has left — that is the price of a stateless token — but nothing will issue another.
 */
export async function signOut(): Promise<void> {
  const refreshToken = await getRefreshToken();
  if (refreshToken) {
    try {
      await fetch(`${apiBase()}/api/auth/signout`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ refreshToken }),
      });
    } catch {
      // Offline: the local session still goes, and the token expires on its own.
    }
  }
  clearTokens();
}
