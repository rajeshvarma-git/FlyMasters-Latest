/**
 * True only when the page itself is being served from this computer
 * (localhost, 127.0.0.1 or ::1). The local preview modes use it as
 * a second lock next to the dev-server check, so a dev server reached through a
 * LAN address or a tunnel never skips sign-in.
 */
export function isLocalHost(hostname: string = typeof window !== "undefined" ? window.location.hostname : ""): boolean {
  const host = hostname.toLowerCase().replace(/^\[|\]$/g, "");
  return host === "localhost" || host === "127.0.0.1" || host === "::1";
}
