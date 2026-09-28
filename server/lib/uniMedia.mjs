/**
 * Real photos and latest news for universities — no API keys.
 *
 *  - Photos: Wikipedia's REST API (page summary, falling back to the first
 *    real photo in the article when the lead image is a logo/crest). The
 *    browser hotlinks the Wikimedia thumbnail; we return the Wikipedia page
 *    as the credit link.
 *  - News: Google News RSS search, newest first.
 *
 * Everything is cached in memory (photos 24h, news 3h) so a busy dashboard
 * doesn't hit either service per page view, and every call has a short
 * timeout and fails soft (no photo / no news) rather than breaking the page.
 * WIKI_API_BASE / NEWS_RSS_BASE exist only so tests can point at a stub.
 */

const WIKI_BASE = () => String(process.env.WIKI_API_BASE || "https://en.wikipedia.org").replace(/\/$/, "");
const NEWS_BASE = () => String(process.env.NEWS_RSS_BASE || "https://news.google.com/rss/search").replace(/\/$/, "");
const UA = "FlyMastersStudentPortal/1.0 (https://flymasters.in; study-abroad dashboard)";

const PHOTO_TTL = 24 * 60 * 60 * 1000;
const NEWS_TTL = 3 * 60 * 60 * 1000;
const cache = new Map();

function cached(key, ttl, loader) {
  const hit = cache.get(key);
  if (hit && hit.expires > Date.now()) return hit.value;
  const value = loader().catch((error) => {
    console.warn(`[uniMedia] ${key}:`, error.message || error);
    return null;
  });
  cache.set(key, { value, expires: Date.now() + ttl });
  // A failed lookup is retried after 10 minutes, not a whole TTL.
  value.then((v) => {
    if (v == null) cache.set(key, { value, expires: Date.now() + 10 * 60 * 1000 });
  });
  if (cache.size > 2000) cache.delete(cache.keys().next().value);
  return value;
}

async function fetchWithTimeout(url, { timeout = 5000, accept = "application/json" } = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);
  try {
    const res = await fetch(url, { signal: controller.signal, headers: { "User-Agent": UA, Accept: accept } });
    return res;
  } finally {
    clearTimeout(timer);
  }
}

const LOGOISH = /(logo|seal|coat[_ ]of[_ ]arms|crest|emblem|wordmark|shield|arms[_.]|flag|signature|map|locator)/i;

function sized(url, width) {
  // Wikimedia thumbnails look like .../thumb/a/ab/File.jpg/320px-File.jpg
  return url && /\/\d+px-/.test(url) ? url.replace(/\/\d+px-/, `/${width}px-`) : url;
}

function isPhoto(url) {
  return Boolean(url) && /\.(jpe?g|webp)(\/|$|\?)/i.test(url.split("/").slice(-2).join("/")) && !LOGOISH.test(decodeURIComponent(url));
}

async function wikiSummary(title) {
  const res = await fetchWithTimeout(`${WIKI_BASE()}/api/rest_v1/page/summary/${encodeURIComponent(title.replace(/ /g, "_"))}`);
  if (!res.ok) return null;
  const data = await res.json();
  if (data?.type === "disambiguation") return null;
  return data;
}

async function wikiSearchTitle(query) {
  const res = await fetchWithTimeout(`${WIKI_BASE()}/w/rest.php/v1/search/title?q=${encodeURIComponent(query)}&limit=1`);
  if (!res.ok) return null;
  const data = await res.json();
  return data?.pages?.[0]?.key || null;
}

async function wikiFirstPhoto(title) {
  const res = await fetchWithTimeout(`${WIKI_BASE()}/api/rest_v1/page/media-list/${encodeURIComponent(title.replace(/ /g, "_"))}`);
  if (!res.ok) return null;
  const data = await res.json();
  for (const item of data?.items || []) {
    if (item.type !== "image") continue;
    const src = item.srcset?.[0]?.src || item.original?.source;
    const full = src && src.startsWith("//") ? `https:${src}` : src;
    if (isPhoto(full)) return sized(full, 800);
  }
  return null;
}

/** { image, page_url, description } for a university name, or null. */
export function universityPhoto(name) {
  const key = `photo:${String(name).toLowerCase()}`;
  return cached(key, PHOTO_TTL, async () => {
    let summary = await wikiSummary(name);
    if (!summary) {
      const found = await wikiSearchTitle(name);
      if (found) summary = await wikiSummary(found);
    }
    if (!summary) return null;
    const title = summary.titles?.canonical || summary.title || name;
    let image = summary.thumbnail?.source ? sized(summary.thumbnail.source, 800) : null;
    if (!isPhoto(image)) image = await wikiFirstPhoto(title).catch(() => null);
    return {
      image: image || null,
      page_url: summary.content_urls?.desktop?.page || `https://en.wikipedia.org/wiki/${encodeURIComponent(title)}`,
      description: String(summary.extract || "").split(/(?<=\.)\s/).slice(0, 2).join(" ").slice(0, 280),
    };
  });
}

function decodeXml(text) {
  return String(text || "")
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/<[^>]+>/g, "")
    .trim();
}

function tag(block, name) {
  const m = block.match(new RegExp(`<${name}[^>]*>([\\s\\S]*?)</${name}>`, "i"));
  return m ? decodeXml(m[1]) : "";
}

/** Latest headlines for a search query: [{ title, link, source, published_at }]. */
export function latestNews(query, limit = 5) {
  const key = `news:${query.toLowerCase()}`;
  return cached(key, NEWS_TTL, async () => {
    const url = `${NEWS_BASE()}?q=${encodeURIComponent(query)}&hl=en-IN&gl=IN&ceid=IN:en`;
    const res = await fetchWithTimeout(url, { accept: "application/rss+xml, application/xml, text/xml" });
    if (!res.ok) throw new Error(`news ${res.status}`);
    const xml = await res.text();
    const items = [];
    for (const m of xml.matchAll(/<item>([\s\S]*?)<\/item>/gi)) {
      const block = m[1];
      const source = tag(block, "source");
      let title = tag(block, "title");
      if (source && title.endsWith(` - ${source}`)) title = title.slice(0, -(source.length + 3));
      const link = tag(block, "link");
      const published = new Date(tag(block, "pubDate"));
      if (!title || !link) continue;
      items.push({ title, link, source, published_at: Number.isNaN(published.getTime()) ? null : published.toISOString() });
    }
    items.sort((a, b) => String(b.published_at || "").localeCompare(String(a.published_at || "")));
    return items;
  }).then((items) => (items || []).slice(0, limit));
}
