/**
 * FAQ and policy articles the student chat's AI is allowed to answer from
 * (server/routes/cases.mjs → answerFromKnowledge). Nothing else: if an
 * article doesn't cover a question, the AI hands it to the assigned
 * telecaller/counselor.
 *
 * Admins and super admins edit; any staff member can read.
 * Stored as JSONB (knowledge_articles in app_records) — no migration.
 */
import express from "express";
import crypto from "crypto";
import { pool, jsonTable, jsonUpsert } from "../lib/db.mjs";
import { anySession, ROLES } from "../lib/auth.mjs";
import { geminiConfigured, geminiModelName } from "../lib/gemini.mjs";

const router = express.Router();

const EDIT_ROLES = new Set([ROLES.SUPER_ADMIN, ROLES.ADMIN]);
const READ_ROLES = new Set([ROLES.SUPER_ADMIN, ROLES.ADMIN, ROLES.BRANCH_HEAD, ROLES.COUNSELOR, ROLES.TELECALLER]);

/**
 * Offered (not saved) when there are no articles yet. Taken from what the
 * public site already says, so the admin only has to check and add them.
 * Note: the site states two different office timings (contact section vs the
 * chat's "Get Expert Help" card) — the admin should keep the right one.
 */
const SUGGESTIONS = [
  {
    title: "How can I contact Fly Masters?",
    category: "faq",
    content:
      "Phone: +91 95021 27788 or +91 98499 08829. WhatsApp: +91 90104 25365. Email: rajesh@flymasters.in or krishna@flymasters.in. You can also message us in this chat any time.",
  },
  {
    title: "What are your office hours?",
    category: "faq",
    content: "Monday to Friday: 9:00 AM – 7:00 PM. Saturday: 10:00 AM – 5:00 PM. Sunday: closed.",
  },
  {
    title: "Do you run free study-abroad sessions?",
    category: "faq",
    content:
      "Yes, free weekly sessions. Beginner sessions: Mondays 12:00 PM – 2:00 PM, for first-time applicants learning the basics of studying abroad. Advanced sessions: Thursdays 1:00 PM – 3:00 PM, covering topics like scholarships and visa applications.",
  },
  {
    title: "How many partner universities do you work with?",
    category: "faq",
    content: "Fly Masters works with 500+ partner universities across 25+ countries.",
  },
];

function canRead(req, res, next) {
  if (!READ_ROLES.has(req.user?.role)) return res.status(403).json({ error: "Staff only" });
  next();
}

function canEdit(req, res, next) {
  if (!EDIT_ROLES.has(req.user?.role)) return res.status(403).json({ error: "Only admins can change FAQs and policies." });
  next();
}

function publicArticle(a) {
  return {
    id: a.id,
    title: a.title,
    category: a.category === "policy" ? "policy" : "faq",
    content: a.content,
    is_active: Boolean(a.is_active),
    updated_at: a.updated_at || null,
    updated_by_name: a.updated_by_name || null,
  };
}

function readBody(body) {
  const title = String(body?.title || "").trim().slice(0, 200);
  const content = String(body?.content || "").trim().slice(0, 20000);
  const category = body?.category === "policy" ? "policy" : "faq";
  const is_active = body?.is_active !== false;
  return { title, content, category, is_active };
}

async function editorName(user) {
  const { rows } = await pool.query("SELECT email FROM auth_users WHERE id::text = $1", [String(user.id)]).catch(() => ({ rows: [] }));
  return rows[0]?.email || user.email || "admin";
}

router.get("/api/knowledge", anySession, canRead, async (_req, res) => {
  try {
    const rows = (await jsonTable("knowledge_articles")).filter((a) => !a.deleted);
    rows.sort((a, b) => String(a.title).localeCompare(String(b.title)));
    res.json({
      articles: rows.map(publicArticle),
      suggestions: rows.length ? [] : SUGGESTIONS,
      ai_enabled: geminiConfigured(),
      ai_model: geminiConfigured() ? geminiModelName() : null,
    });
  } catch (error) {
    console.error("[knowledge] list failed:", error);
    res.status(500).json({ error: "Could not load FAQs and policies." });
  }
});

router.post("/api/knowledge", anySession, canEdit, async (req, res) => {
  const data = readBody(req.body);
  if (!data.title || !data.content) return res.status(400).json({ error: "Title and answer/text are required." });
  try {
    const saved = await jsonUpsert("knowledge_articles", {
      id: crypto.randomUUID(),
      ...data,
      updated_at: new Date().toISOString(),
      updated_by: req.user.id,
      updated_by_name: await editorName(req.user),
    });
    res.json({ article: publicArticle(saved) });
  } catch (error) {
    console.error("[knowledge] create failed:", error);
    res.status(500).json({ error: "Could not save." });
  }
});

async function findArticle(id) {
  const { rows } = await pool.query(
    "SELECT id, data FROM app_records WHERE table_name = 'knowledge_articles' AND id = $1",
    [String(id)],
  );
  return rows[0] && !rows[0].data.deleted ? { ...rows[0].data, id: rows[0].id } : null;
}

router.put("/api/knowledge/:id", anySession, canEdit, async (req, res) => {
  try {
    const existing = await findArticle(req.params.id);
    if (!existing) return res.status(404).json({ error: "Not found." });
    const data = readBody({ ...existing, ...req.body });
    if (!data.title || !data.content) return res.status(400).json({ error: "Title and answer/text are required." });
    const saved = await jsonUpsert("knowledge_articles", {
      id: existing.id,
      ...data,
      updated_at: new Date().toISOString(),
      updated_by: req.user.id,
      updated_by_name: await editorName(req.user),
    });
    res.json({ article: publicArticle(saved) });
  } catch (error) {
    console.error("[knowledge] update failed:", error);
    res.status(500).json({ error: "Could not save." });
  }
});

router.delete("/api/knowledge/:id", anySession, canEdit, async (req, res) => {
  try {
    const existing = await findArticle(req.params.id);
    if (!existing) return res.status(404).json({ error: "Not found." });
    await jsonUpsert("knowledge_articles", { id: existing.id, deleted: true, is_active: false, updated_at: new Date().toISOString() });
    res.json({ ok: true });
  } catch (error) {
    console.error("[knowledge] delete failed:", error);
    res.status(500).json({ error: "Could not delete." });
  }
});

export default router;
