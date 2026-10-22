/**
 * University information API. Rules (all enforced here, not in the screens):
 *
 *   - Only an admin or super admin may write, upload, publish or unpublish.
 *     Branch heads, counselors, telecallers, accountants, partners and
 *     students get 403 on every /api/admin/universities/... route.
 *   - A student (or any non-admin) reads the PUBLISHED copy only. A draft, or
 *     an unpublished university, answers `info: null`. Uploaded files are
 *     served only while the published copy points at them.
 *   - Information is stored against the university's catalogue id, in its own
 *     `university_profiles` record, so the catalogue import (which recreates
 *     university rows) cannot erase it and no second university list exists.
 *
 * No migration: records live in app_records, files in app_storage, exactly
 * like the rest of the platform.
 */
import express from "express";
import crypto from "crypto";
import { pool, jsonUpsert } from "../lib/db.mjs";
import { session, anySession, requireRole, ADMIN_ROLES, audit } from "../lib/auth.mjs";
import {
  UNIVERSITY_ID, ASSET_FILE, ASSET_TYPES, MAX_ASSETS_PER_UNIVERSITY,
  assetPath, parseUpload, sanitizeInfo, hasContent, assetFilesIn, infoHash,
  profileRecordId, statusOf, studentView, emptyInfo,
} from "../lib/universityInfo.mjs";

const router = express.Router();
const adminOnly = [session, requireRole(ADMIN_ROLES, "Admin")];

const TABLE = "university_profiles";

/** The catalogue university behind an id, or null when there is none. */
export async function baseUniversity(id) {
  if (!UNIVERSITY_ID.test(String(id || ""))) return null;
  const record = await pool.query("SELECT data FROM app_records WHERE table_name = 'universities' AND id = $1", [id]);
  const data = record.rows[0]?.data;
  if (data && data.is_active !== false) {
    return { id, name: data.name || "", country: data.country || "", city: data.city || "", website_url: data.website_url || "" };
  }
  // A university that only exists through its programmes.
  const programs = await pool.query(
    `SELECT MAX(data->>'university_name') AS name, MAX(data->>'country') AS country, MAX(data->>'city') AS city,
            MAX(data->>'website_url') AS website_url
       FROM app_records WHERE table_name = 'university_programs' AND data->>'university_id' = $1`,
    [id],
  );
  const row = programs.rows[0];
  return row?.name ? { id, name: row.name, country: row.country || "", city: row.city || "", website_url: row.website_url || "" } : null;
}

async function loadRecord(id) {
  const { rows } = await pool.query("SELECT data FROM app_records WHERE table_name = $1 AND id = $2", [TABLE, profileRecordId(id)]);
  return rows[0]?.data || null;
}

async function knownAssets(id) {
  const prefix = `university-assets/${id}/`;
  const { rows } = await pool.query("SELECT path FROM app_storage WHERE starts_with(path, $1)", [prefix]);
  return new Set(rows.map((row) => row.path.slice(prefix.length)));
}

function adminPayload(base, record) {
  return {
    university: base,
    info: {
      draft: record?.draft || null,
      published: record?.published || null,
      status: statusOf(record),
      draft_updated_at: record?.draft_updated_at || null,
      published_at: record?.published_at || null,
    },
  };
}

function problems(res, errors) {
  return res.status(400).json({ error: errors[0]?.message ? `${errors[0].field}: ${errors[0].message}` : "Check the highlighted fields.", problems: errors });
}

async function withUniversity(req, res) {
  const id = String(req.params.id || "");
  const base = await baseUniversity(id);
  if (!base) { res.status(404).json({ error: "University not found." }); return null; }
  return { id, base };
}

// ------------------------------------------------------------------ admin

/** One row per university that has anything saved: lets the list show Draft / Published badges. */
router.get("/api/admin/university-info/status", adminOnly, async (_req, res) => {
  try {
    const { rows } = await pool.query("SELECT data FROM app_records WHERE table_name = $1", [TABLE]);
    res.json({
      statuses: rows.map((row) => ({ university_id: row.data.university_id, status: statusOf(row.data), published_at: row.data.published_at || null })),
    });
  } catch (error) {
    res.status(500).json({ error: error.message || "Could not load statuses." });
  }
});

router.get("/api/admin/universities/:id/info", adminOnly, async (req, res) => {
  try {
    const found = await withUniversity(req, res);
    if (!found) return;
    res.json(adminPayload(found.base, await loadRecord(found.id)));
  } catch (error) {
    res.status(500).json({ error: error.message || "Could not load university information." });
  }
});

async function saveDraft(req, found, input, expected) {
  const record = await loadRecord(found.id);
  if (expected !== undefined && (record?.draft_updated_at || null) !== (expected || null)) {
    return { conflict: true };
  }
  const { info, errors } = sanitizeInfo(input, await knownAssets(found.id));
  if (errors.length) return { errors };
  const now = new Date().toISOString();
  const saved = await jsonUpsert(TABLE, {
    id: profileRecordId(found.id),
    university_id: found.id,
    draft: info,
    draft_updated_at: now,
    draft_updated_by: String(req.user.id),
    updated_at: now,
  });
  return { record: { ...(record || {}), ...saved } };
}

router.put("/api/admin/universities/:id/info", adminOnly, async (req, res) => {
  try {
    const found = await withUniversity(req, res);
    if (!found) return;
    const result = await saveDraft(req, found, req.body?.info, req.body?.expected_updated_at);
    if (result.conflict) return res.status(409).json({ error: "Someone else saved changes to this university. Reload to see them." });
    if (result.errors) return problems(res, result.errors);
    await audit(req, "university.info.save_draft", "university_profiles", found.id, { university: found.base.name });
    res.json(adminPayload(found.base, result.record));
  } catch (error) {
    res.status(500).json({ error: error.message || "Could not save." });
  }
});

/** Saves the given info as the draft (when sent) and publishes exactly that. */
router.post("/api/admin/universities/:id/info/publish", adminOnly, async (req, res) => {
  try {
    const found = await withUniversity(req, res);
    if (!found) return;
    let record = await loadRecord(found.id);
    if (req.body?.info !== undefined) {
      // Check before saving anything: publishing nothing must not overwrite the existing draft.
      const probe = sanitizeInfo(req.body.info, await knownAssets(found.id));
      if (probe.errors.length) return problems(res, probe.errors);
      if (!hasContent(probe.info)) return res.status(400).json({ error: "Add some information before publishing. Nothing was published." });
      const result = await saveDraft(req, found, req.body.info, req.body.expected_updated_at);
      if (result.conflict) return res.status(409).json({ error: "Someone else saved changes to this university. Reload to see them." });
      if (result.errors) return problems(res, result.errors);
      record = result.record;
    }
    const draft = record?.draft;
    if (!draft || !hasContent(draft)) {
      return res.status(400).json({ error: "Add some information before publishing. Nothing was published." });
    }
    if (!draft.basic.name && !found.base.name) {
      return res.status(400).json({ error: "The university needs a name before it can be published." });
    }
    // Re-check the files: a published copy must never point at a file that is gone.
    const known = await knownAssets(found.id);
    const missing = [...assetFilesIn(draft)].filter((file) => !known.has(file));
    if (missing.length) return res.status(400).json({ error: "Some uploaded files are missing. Upload them again before publishing." });

    const now = new Date().toISOString();
    const saved = await jsonUpsert(TABLE, {
      id: profileRecordId(found.id),
      university_id: found.id,
      published: draft,
      published_hash: infoHash(draft),
      published_at: now,
      published_by: String(req.user.id),
      updated_at: now,
    });
    await audit(req, "university.info.publish", "university_profiles", found.id, { university: found.base.name });
    res.json(adminPayload(found.base, { ...record, ...saved }));
  } catch (error) {
    res.status(500).json({ error: error.message || "Could not publish." });
  }
});

/** Takes the information off the student side. The draft is kept. */
router.post("/api/admin/universities/:id/info/unpublish", adminOnly, async (req, res) => {
  try {
    const found = await withUniversity(req, res);
    if (!found) return;
    const record = await loadRecord(found.id);
    if (!record?.published) return res.status(400).json({ error: "This university has nothing published." });
    const now = new Date().toISOString();
    await pool.query(
      `UPDATE app_records SET data = (data - 'published' - 'published_hash' - 'published_at' - 'published_by') || $3::jsonb, updated_at = now()
        WHERE table_name = $1 AND id = $2`,
      [TABLE, profileRecordId(found.id), JSON.stringify({ unpublished_at: now, unpublished_by: String(req.user.id), updated_at: now })],
    );
    await audit(req, "university.info.unpublish", "university_profiles", found.id, { university: found.base.name });
    res.json(adminPayload(found.base, await loadRecord(found.id)));
  } catch (error) {
    res.status(500).json({ error: error.message || "Could not unpublish." });
  }
});

router.post("/api/admin/universities/:id/assets", adminOnly, async (req, res) => {
  try {
    const found = await withUniversity(req, res);
    if (!found) return;
    const upload = parseUpload(req.body?.dataUrl);
    if (upload.error) return res.status(400).json({ error: upload.error });
    const existing = await knownAssets(found.id);
    if (existing.size >= MAX_ASSETS_PER_UNIVERSITY) {
      return res.status(400).json({ error: `A university can have at most ${MAX_ASSETS_PER_UNIVERSITY} uploaded files.` });
    }
    const file = `${crypto.randomUUID()}.${upload.ext}`;
    await pool.query(
      `INSERT INTO app_storage (path, data_url) VALUES ($1, $2)
       ON CONFLICT (path) DO UPDATE SET data_url = EXCLUDED.data_url`,
      [assetPath(found.id, file), `data:${upload.mime};base64,${upload.buffer.toString("base64")}`],
    );
    await audit(req, "university.asset.upload", "university_profiles", found.id, { file, bytes: upload.buffer.length });
    res.json({ ok: true, file, mime: upload.mime, kind: upload.kind, bytes: upload.buffer.length });
  } catch (error) {
    res.status(500).json({ error: error.message || "Could not upload the file." });
  }
});

// ---------------------------------------------------------- student + staff

/** The published information for one university. Anything unpublished answers `info: null`. */
router.get("/api/university-info/:id", anySession, async (req, res) => {
  try {
    const id = String(req.params.id || "");
    const base = await baseUniversity(id);
    if (!base) return res.status(404).json({ error: "University not found." });
    res.json(studentView(await loadRecord(id), base));
  } catch (error) {
    res.status(500).json({ error: error.message || "Could not load the university." });
  }
});

/**
 * A file belonging to a university. Admins may fetch any of its files (to
 * preview a draft); everyone else only a file the published copy points at.
 */
router.get("/api/university-info/:id/assets/:file", anySession, async (req, res) => {
  try {
    const id = String(req.params.id || "");
    const file = String(req.params.file || "");
    if (!UNIVERSITY_ID.test(id) || !ASSET_FILE.test(file)) return res.status(404).json({ error: "File not found." });
    if (!ADMIN_ROLES.includes(req.user?.role)) {
      const record = await loadRecord(id);
      if (!record?.published || !assetFilesIn(record.published).has(file)) return res.status(404).json({ error: "File not found." });
    }
    const { rows } = await pool.query("SELECT data_url FROM app_storage WHERE path = $1", [assetPath(id, file)]);
    const match = /^data:([^;]+);base64,(.*)$/s.exec(rows[0]?.data_url || "");
    if (!match || !ASSET_TYPES[match[1]]) return res.status(404).json({ error: "File not found." });
    res.set({
      "Content-Type": match[1],
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "default-src 'none'; sandbox",
      "Cache-Control": "private, max-age=300",
    });
    res.send(Buffer.from(match[2], "base64"));
  } catch (error) {
    res.status(500).json({ error: error.message || "Could not load the file." });
  }
});

export { emptyInfo };
export default router;
