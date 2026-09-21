/**
 * One token for the whole platform.
 *
 * Before the merge each portal kept its own pair of localStorage keys
 * (fm_admin_token, fm_pg_token, fm_telecaller_token) because each portal talked
 * to a different backend with a different signing secret. Staff who worked in
 * two portals signed in twice.
 *
 * One origin + one JWT secret means one key. The old keys are read once during
 * cutover so signed-in users are not kicked out on the deploy, then cleared.
 */
const TOKEN_KEY = "fm_token";
const USER_KEY = "fm_user";
const LEGACY_TOKEN_KEYS = ["fm_admin_token", "fm_pg_token", "fm_telecaller_token"];
const LEGACY_USER_KEYS = ["fm_admin_user", "fm_pg_user", "fm_telecaller_user"];

function safeGet(key: string): string | null {
  try {
    // read both: the old telecaller build used localStorage, the others sessionStorage
    return sessionStorage.getItem(key) ?? localStorage.getItem(key);
  } catch {
    return null;
  }
}

function safeSet(key: string, value: string | null) {
  try {
    if (value === null) {
      sessionStorage.removeItem(key);
      localStorage.removeItem(key);
    } else {
      sessionStorage.setItem(key, value);
    }
  } catch {
    /* private mode / storage disabled */
  }
}

function migrateLegacy() {
  if (safeGet(TOKEN_KEY)) return;
  for (let i = 0; i < LEGACY_TOKEN_KEYS.length; i += 1) {
    const token = safeGet(LEGACY_TOKEN_KEYS[i]);
    if (!token) continue;
    safeSet(TOKEN_KEY, token);
    const user = safeGet(LEGACY_USER_KEYS[i]);
    if (user) safeSet(USER_KEY, user);
    break;
  }
  LEGACY_TOKEN_KEYS.forEach((key) => safeSet(key, null));
  LEGACY_USER_KEYS.forEach((key) => safeSet(key, null));
}

migrateLegacy();

export function getToken(): string {
  return safeGet(TOKEN_KEY) || "";
}

export function setToken(token: string | null) {
  safeSet(TOKEN_KEY, token);
}

export function getStoredUser<T = unknown>(): T | null {
  const raw = safeGet(USER_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

export function setStoredUser(user: unknown | null) {
  safeSet(USER_KEY, user === null ? null : JSON.stringify(user));
}

export function clearSession() {
  setToken(null);
  setStoredUser(null);
}

export type PortalRole =
  | "super_admin"
  | "admin"
  | "branch_head"
  | "counselor"
  | "telecaller"
  | "accountant"
  | "partner"
  | "student";

/**
 * Where a role lands after signing in. One sign-in page, one redirect table.
 *
 * These must be pages that exist AND are behind that role's own guard.
 * /telecaller is the telecaller sign-in redirect, so a telecaller is sent to
 * /telecaller/queue instead — sending them to /telecaller would bounce them
 * straight back to /staff in a loop.
 *
 * Roles with no portal yet (accountant, partner) are deliberately absent:
 * StaffSignIn shows them a clear message rather than a broken screen.
 */
export const HOME_FOR_ROLE: Partial<Record<PortalRole, string>> = {
  super_admin: "/admin",
  admin: "/admin",
  branch_head: "/admin",
  counselor: "/counselor",
  telecaller: "/telecaller/queue",
  student: "/",
};
