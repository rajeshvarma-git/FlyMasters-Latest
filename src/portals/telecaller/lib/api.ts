// Deliberately distinct from the admin portal's storage keys. If both sites are ever
// served from the same origin, an admin session and a telecaller session must not
// overwrite each other.
const TOKEN_KEY = "fm_token";  // unified across portals
const USER_KEY = "fm_user";    // unified across portals

/** Absolute API origin in production; empty in dev so the Vite proxy handles /api. */
function resolveApiBase() {
  // Every portal is served from one origin now, so /api is same-origin. The old
  // build hardcoded the admin portal's Railway hostname here as a fallback.
  const fromEnv = (import.meta.env.VITE_API_BASE_URL || "").replace(/\/$/, "");
  return fromEnv;
}

const API_BASE = resolveApiBase();

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
    res = await fetch(`${API_BASE}/api${path}`, {
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
