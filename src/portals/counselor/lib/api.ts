import { apiBase } from "@shared/lib/apiBase";
import { readToken, writeToken } from "@shared/lib/tokenStore";
import { clearTokens, fetchWithRefresh, getAccessToken, saveTokens, signOut } from "@shared/lib/authClient";

const USER_KEY = "fm_user";    // unified across portals

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

export async function api<T = unknown>(path: string, options: { method?: string; body?: unknown; auth?: boolean } = {}) {
  // LOCAL PREVIEW ONLY: dev server + VITE_COUNSELOR_PREVIEW=true. Compiled out of
  // production builds. Delete this block and lib/previewMode.ts to remove it.
  if (import.meta.env.DEV) {
    const { isCounselorPreview, previewApi } = await import("./previewMode");
    if (isCounselorPreview()) return (await previewApi(path, options)) as T;
  }
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (options.auth !== false) {
    const token = getToken();
    if (token) headers.Authorization = `Bearer ${token}`;
  }
  let res: Response;
  try {
    // Counselor endpoints moved under /api/counselor/* in the merge so they no
    // longer shadow the shared routes. Sign-in and WhatsApp are shared across
    // portals (server/routes/core.mjs's /api/whatsapp/*) and stayed there —
    // they never had counselor-specific copies, unlike everything else here.
    const isShared = path.startsWith("/auth/signin") || path.startsWith("/whatsapp") || path.startsWith("/alerts");
    const url = isShared ? `${apiBase()}/api${path}` : `${apiBase()}/api/counselor${path}`;
    // Refreshes once on 401 before giving up (shared/lib/authClient.ts).
    res = await fetchWithRefresh(url, {
      method: options.method || "GET",
      headers,
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
    });
  } catch {
    throw new Error("Cannot reach the Fly Masters API. Check that the platform server is running.");
  }
  const raw = await res.text();
  let data: { error?: string } = {};
  try {
    data = raw ? (JSON.parse(raw) as { error?: string }) : {};
  } catch {
    if (/<!doctype html|<html[\s>]/i.test(raw)) {
      throw new Error(
        "Counselor API is not running. On Railway, set DATABASE_URL from Postgres and redeploy with npm run start:prod (not static hosting only).",
      );
    }
  }
  if (!res.ok) {
    const message = data.error;
    if (message) throw new Error(message);
    if (res.status === 404 || res.status === 405 || /<html[\s>]/i.test(raw)) {
      throw new Error(
        "Counselor API is not running. On Railway, set DATABASE_URL from Postgres and redeploy with npm run start:prod.",
      );
    }
    throw new Error(`Request failed (${res.status})`);
  }
  return data as T;
}
