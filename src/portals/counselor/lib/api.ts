const TOKEN_KEY = "fm_token";  // unified across portals
const USER_KEY = "fm_user";    // unified across portals

export function getToken() {
  return sessionStorage.getItem(TOKEN_KEY) || "";
}

export function setAuth(token: string, user: unknown) {
  sessionStorage.setItem(TOKEN_KEY, token);
  sessionStorage.setItem(USER_KEY, JSON.stringify(user));
}

export function clearAuth() {
  sessionStorage.removeItem(TOKEN_KEY);
  sessionStorage.removeItem(USER_KEY);
}

export function readStoredUser<T>() {
  try {
    return JSON.parse(sessionStorage.getItem(USER_KEY) || "null") as T | null;
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
    // Counselor endpoints moved under /api/counselor/* in the merge so they no
    // longer shadow the shared routes. Sign-in is now one endpoint for all roles.
    const url = path.startsWith("/auth/signin") ? `/api${path}` : `/api/counselor${path}`;
    res = await fetch(url, {
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
