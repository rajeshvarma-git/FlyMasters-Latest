/**
 * Turn a notification's action_url into a route inside the telecaller portal.
 *
 * The router is mounted at /telecaller, so paths must be relative to that base.
 * The server also sends absolute paths (/telecaller/...) and links to screens that
 * do not exist here (a /leads list), so anything unrecognised falls back to /queue.
 */
export function telecallerHref(url?: string): string {
  let value = String(url || "").trim();
  if (!value) return "/queue";
  value = value.replace(/^https?:\/\/[^/]+/i, "").replace(/^\/telecaller(?=\/|$|\?)/, "") || "/";
  if (!value.startsWith("/")) value = `/${value}`;

  const lead = value.match(/[?&]lead=([^&]+)/);
  if (value.startsWith("/whatsapp")) return value;
  if (value.startsWith("/chat")) return value;
  if (/^\/leads\/[^/?]+/.test(value)) return value;
  if (value.startsWith("/queue") || value.startsWith("/converted") || value.startsWith("/notifications")) return value;
  if (lead) return `/whatsapp?lead=${lead[1]}`;
  if (/whatsapp/i.test(value)) return "/whatsapp";
  if (/chat/i.test(value)) return "/chat";
  return "/queue";
}
