/**
 * The student dashboard's news feed: recommended universities (saved ones
 * first, then the student's destination countries) with a real campus photo
 * and their latest headlines, plus destination-country student-visa news.
 * Also a public list of famous-campus photos for the homepage headline.
 * Photos and news come from server/lib/uniMedia.mjs (Wikipedia + Google
 * News RSS, cached).
 */
import express from "express";
import { pool, jsonTable, jsonFind } from "../lib/db.mjs";
import { anySession, ROLES } from "../lib/auth.mjs";
import { universityPhoto, latestNews } from "../lib/uniMedia.mjs";

const router = express.Router();

const COUNTRY_ALIASES = {
  usa: "USA", us: "USA", america: "USA", "united states": "USA", "united states of america": "USA",
  uk: "UK", britain: "UK", england: "UK", "united kingdom": "UK", canada: "Canada", australia: "Australia",
  germany: "Germany", ireland: "Ireland", "new zealand": "New Zealand", india: "India", france: "France",
  netherlands: "Netherlands", holland: "Netherlands", nepal: "Nepal",
};
const COUNTRY_LONG = { USA: "United States", UK: "United Kingdom" };

function normalizeCountry(value) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  return COUNTRY_ALIASES[raw.toLowerCase()] || raw.replace(/\b\w/g, (c) => c.toUpperCase());
}

function countryMatches(uniCountry, wanted) {
  const a = normalizeCountry(uniCountry).toLowerCase();
  const b = wanted.toLowerCase();
  const long = (COUNTRY_LONG[wanted] || "").toLowerCase();
  return a === b || a.includes(b) || b.includes(a) || (long && String(uniCountry || "").toLowerCase().includes(long));
}

async function rowsWhere(table, field, value) {
  const { rows } = await pool.query(
    "SELECT id, data FROM app_records WHERE table_name = $1 AND data->>$2 = $3",
    [table, field, String(value)],
  );
  return rows.map((r) => ({ ...r.data, id: r.id }));
}

const withTimeout = (promise, ms, fallback) =>
  Promise.race([promise.catch(() => fallback), new Promise((resolve) => setTimeout(() => resolve(fallback), ms))]);

router.get("/api/student/feed", anySession, async (req, res) => {
  if (req.user?.role !== ROLES.STUDENT) return res.status(403).json({ error: "Students only" });
  try {
    const uid = req.user.id;
    const [profile, leads, favorites, allUnis] = await Promise.all([
      jsonFind("profiles", "user_id", uid).catch(() => null),
      rowsWhere("student_leads", "user_id", uid).catch(() => []),
      rowsWhere("user_favorites", "user_id", uid).catch(() => []),
      jsonTable("universities").catch(() => []),
    ]);
    const lead = leads.sort((a, b) => String(b.updated_at || "").localeCompare(String(a.updated_at || "")))[0] || null;
    const prefs = lead?.preferences || {};
    const countries = [
      ...(Array.isArray(profile?.interested_countries) ? profile.interested_countries : []),
      ...(Array.isArray(lead?.preferred_countries) ? lead.preferred_countries : []),
      ...(Array.isArray(prefs.interested_countries) ? prefs.interested_countries : []),
    ].map(normalizeCountry).filter(Boolean).filter((c, i, a) => a.indexOf(c) === i);
    const field = profile?.course_preferences || lead?.field_of_interest || "";

    const active = allUnis
      .filter((u) => u.is_active !== false && u.name)
      .sort((a, b) => (Number(a.ranking) || 9999) - (Number(b.ranking) || 9999));
    const favIds = new Set(favorites.map((f) => String(f.university_id)));
    const picked = [];
    const add = (u) => {
      if (u && !picked.some((p) => String(p.id) === String(u.id))) picked.push(u);
    };
    active.filter((u) => favIds.has(String(u.id))).forEach(add);
    if (countries.length) active.filter((u) => countries.some((c) => countryMatches(u.country, c))).forEach(add);
    if (picked.length < 3) active.forEach(add);
    const top = picked.slice(0, 8);

    const universities = await Promise.all(top.map(async (u) => {
      const [photo, news] = await Promise.all([
        withTimeout(universityPhoto(u.name), 7000, null),
        withTimeout(latestNews(`"${u.name}"`, 3), 7000, []),
      ]);
      return {
        id: String(u.id),
        name: u.name,
        city: u.city || "",
        country: u.country || "",
        ranking: u.ranking || null,
        website: u.website_url || null,
        is_favorite: favIds.has(String(u.id)),
        image: photo?.image || null,
        image_credit: photo?.page_url || null,
        summary: photo?.description || "",
        news: news || [],
      };
    }));

    const primary = countries[0] || "";
    const countryNews = primary
      ? await withTimeout(latestNews(`${COUNTRY_LONG[primary] || primary} student visa international students`, 6), 7000, [])
      : [];

    const seen = new Set();
    const stories = [
      ...countryNews.map((n) => ({ ...n, topic: `${primary} · student visa` })),
      ...universities.flatMap((u) => u.news.map((n) => ({ ...n, topic: u.name }))),
    ]
      .filter((n) => {
        const k = n.title.toLowerCase();
        if (seen.has(k)) return false;
        seen.add(k);
        return true;
      })
      .sort((a, b) => String(b.published_at || "").localeCompare(String(a.published_at || "")))
      .slice(0, 10);

    res.json({ countries, field, universities, stories, generated_at: new Date().toISOString() });
  } catch (error) {
    console.error("[feed] failed:", error);
    res.status(500).json({ error: "Could not load your feed." });
  }
});

// Famous campuses whose photos fill the letters of "UNIVERSITY" on the homepage.
const CAMPUSES = [
  "University of Oxford", "University of Toronto", "University of Melbourne", "Harvard University",
  "University of Cambridge", "McGill University", "University of Sydney", "Stanford University",
  "Trinity College Dublin", "University of Auckland",
];

router.get("/api/public/campus-photos", async (_req, res) => {
  const photos = await Promise.all(
    CAMPUSES.map(async (name) => {
      const p = await withTimeout(universityPhoto(name), 6000, null);
      return { name, image: p?.image || null, credit: p?.page_url || null };
    }),
  );
  res.set("Cache-Control", "public, max-age=3600");
  res.json({ photos });
});

export default router;
