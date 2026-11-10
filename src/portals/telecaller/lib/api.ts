// Deliberately distinct from the admin portal's storage keys. If both sites are ever
// served from the same origin, an admin session and a telecaller session must not
// overwrite each other.
import { apiBase } from "@shared/lib/apiBase";
import { readToken, writeToken } from "@shared/lib/tokenStore";
import { clearTokens, fetchWithRefresh, getAccessToken, saveTokens, signOut } from "@shared/lib/authClient";

const USER_KEY = "fm_user";    // unified across portals

/** Absolute API origin in production; empty in dev so the Vite proxy handles /api. */
// Every portal is served from one origin on the web, so this is "" there. In the native shell there
// is no origin to be served from, so it is the configured absolute URL: shared/lib/apiBase.ts.
const API_BASE = () => apiBase();

function apiErrorMessage(status: number, data: unknown): string {
  if (data && typeof data === "object") {
    const body = data as { error?: unknown; message?: unknown };
    if (typeof body.error === "string" && body.error.trim()) return body.error;
    if (typeof body.message === "string" && body.message.trim()) return body.message;
  }
  if (status === 403) return "You are not allowed to do that. Check your signup code or ask an admin.";
  if (status === 404 || status === 405) {
    return "This site cannot reach the Fly Masters API. Contact support if this keeps happening.";
  }
  if (status >= 500) return "The Fly Masters server had a problem. Try again in a moment.";
  return `Something went wrong (${status}). Try again.`;
}

// Storage goes through the shared helpers: sessionStorage is emptied whenever the operating system
// reclaims a native WebView, and the refresh token belongs in the platform's best store
// (shared/lib/tokenStore.ts, shared/lib/secureStore.ts).
export function getToken() {
  return getAccessToken();
}

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

export async function api<T = unknown>(
  path: string,
  options: { method?: string; body?: unknown; auth?: boolean } = {},
) {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (options.auth !== false) {
    const token = getToken();
    if (token) headers.Authorization = `Bearer ${token}`;
  }
  let res: Response;
  try {
    // Refreshes once on 401 before giving up (shared/lib/authClient.ts).
    res = await fetchWithRefresh(`${API_BASE()}/api${path}`, {
      method: options.method || "GET",
      headers,
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
    });
  } catch (err) {
    if (err instanceof TypeError) {
      throw new Error("Cannot reach the Fly Masters API. Check your connection and try again.");
    }
    throw err;
  }
  let data: unknown = {};
  const contentType = res.headers.get("content-type") || "";
  if (contentType.includes("application/json")) {
    data = await res.json().catch(() => ({}));
  } else if (!res.ok) {
    const text = await res.text().catch(() => "");
    if (text.trim()) data = { error: text.trim().slice(0, 200) };
  }
  if (!res.ok) {
    // A revoked or expired session should not leave a dead token behind.
    if (res.status === 401) clearAuth();
    throw new Error(apiErrorMessage(res.status, data));
  }
  return data as T;
}
