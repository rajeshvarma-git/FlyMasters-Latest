// Where the backend is, for every portal.
//
// On the web every portal is served from the same origin as the API, so the base is "" and a relative
// "/api/..." is correct. That is the behaviour this file preserves exactly.
//
// Inside the Capacitor shell there is no such origin: a relative request resolves against
// capacitor://localhost or http://localhost and never leaves the device. A native build therefore needs
// an absolute URL, configured at BUILD time. Three names have been used across the portals, so all
// three are accepted rather than silently ignoring the one a build happens to set.
//
// A native build with none of them set used to fall back to an emulator address
// (http://10.0.2.2:8087), which is right on an Android emulator and wrong on a real phone, where it
// fails as a timeout that looks like a server problem. `resolveApiBase` says so instead.
import { isNative } from "./native";

export const API_BASE_ENV_NAMES = ["VITE_API_BASE_URL", "VITE_API_URL", "VITE_API_TARGET"] as const;

const trim = (value: unknown) => String(value ?? "").trim().replace(/\/+$/, "");

/**
 * The pure rule, so it can be tested without Capacitor or a device.
 *
 * @param env      the build-time environment
 * @param native   whether this is the Capacitor shell
 * @param onError  called with a message when a native build has nothing configured
 */
export function resolveApiBase(
  env: Record<string, string | undefined>,
  native: boolean,
  onError: (message: string) => void = () => {},
): string {
  const configured = API_BASE_ENV_NAMES.map((name) => trim(env[name])).find(Boolean) || "";

  if (!native) {
    // On the web a localhost URL baked into a deployed build would break every request, so it is
    // ignored in favour of the origin the page was actually served from.
    const isLocal = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i.test(configured);
    const servedLocally =
      typeof window === "undefined" ||
      /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i.test(window.location.origin);
    if (configured && isLocal && !servedLocally) return "";
    return configured;
  }

  if (!configured) {
    onError(
      "This is a native build with no backend URL. Set one of " +
        API_BASE_ENV_NAMES.join(", ") +
        " when building, or every request will fail: a WebView has no server origin to fall back on.",
    );
    return "";
  }
  return configured;
}

let cached: string | null = null;

/** The base to put in front of "/api/...". "" means same origin, which is correct on the web. */
export function apiBase(): string {
  if (cached === null) {
    cached = resolveApiBase(
      // `|| {}` because there is no import.meta.env outside a Vite build, and the tests run this file
      // directly under node.
      (import.meta.env || {}) as unknown as Record<string, string | undefined>,
      isNative(),
      (message) => console.error(message),
    );
  }
  return cached;
}
