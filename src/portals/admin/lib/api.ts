import { apiBase } from "@shared/lib/apiBase";
import { readToken, writeToken } from "@shared/lib/tokenStore";
import { clearTokens, fetchWithRefresh, getAccessToken, saveTokens, signOut } from "@shared/lib/authClient";

const TOKEN_KEY = "fm_token";  // unified across portals
const USER_KEY = "fm_user";    // unified across portals

export function getToken() {
  return getAccessToken();
}

/**
 * Stores a sign-in. `refreshToken` comes from the same response and is what keeps the person signed in
 * once the fifteen-minute access token runs out, so pass the whole response, not just the token.
 */
export function setAuth(token: string, user: unknown, refreshToken?: string | null) {
  saveTokens({ token, refreshToken });
  writeToken(USER_KEY, JSON.stringify(user));
}

export function clearAuth() {
  clearTokens();
}

/** Signs out on the server as well, so the refresh token cannot be used again. */
export async function endSession() {
  await signOut();
}

export function readStoredUser<T>() {
  try {
    return JSON.parse(readToken(USER_KEY) || "null") as T | null;
  } catch {
    return null;
  }
}

export async function api<T = unknown>(path: string, options: { method?: string; body?: unknown; auth?: boolean } = {}) {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (options.auth !== false) {
    const token = getToken();
    if (token) headers.Authorization = `Bearer ${token}`;
  }
  let res: Response;
  try {
    // On 401 this refreshes the access token once and sends the request again, so a session that has
    // simply aged out does not surface as a failed request (shared/lib/authClient.ts).
    res = await fetchWithRefresh(`${apiBase()}/api${path}`, {
      method: options.method || "GET",
      headers,
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
    });
  } catch {
    throw new Error("Cannot reach the admin API. Keep it running on port 8788 and try again.");
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((data as { error?: string }).error || "Request failed");
  return data as T;
}
