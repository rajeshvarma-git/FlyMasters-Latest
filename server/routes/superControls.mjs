/**
 * The Super Admin's own controls (owner only):
 *   GET  /api/super/switches            every key switch and its state, plus whether turning one on is safe
 *   PUT  /api/super/switches/:key       flip one (logged, and undoable from the Activity screen)
 *   GET  /api/super/activity            everything that happened: who, what, when, from where
 */
import { Router } from "express";
import { pool } from "../lib/db.mjs";
import { superAdminAuth, audit } from "../lib/auth.mjs";
import { listSwitches, setSwitch, switchByKey } from "../lib/switches.mjs";
import { numberOnFile } from "../lib/loginMfa.mjs";

const router = Router();

const nameOf = (u) => [u?.first_name, u?.last_name].filter(Boolean).join(" ") || u?.email || null;

async function actorName(userId) {
  const r = await pool.query(
    `SELECT u.email, (SELECT data FROM app_records p WHERE p.table_name='profiles' AND p.data->>'user_id' = u.id::text ORDER BY p.updated_at DESC LIMIT 1) AS profile
       FROM auth_users u WHERE u.id::text = $1`, [String(userId)]);
  const row = r.rows[0];
  return row ? nameOf({ ...(row.profile || {}), email: row.email }) : null;
}

/** Staff who would be unable to sign in if the staff code were switched on today. */
async function staffWithoutNumber() {
  const r = await pool.query(
    `SELECT u.id::text AS id, u.email, ur.role,
            (SELECT data FROM app_records p WHERE p.table_name='profiles' AND p.data->>'user_id' = u.id::text ORDER BY p.updated_at DESC LIMIT 1) AS profile
       FROM auth_users u JOIN user_roles ur ON ur.user_id::text = u.id::text
      WHERE ur.role <> 'student' AND COALESCE(ur.is_active, true)`);
  const seen = new Set();
  const missing = [];
  for (const row of r.rows) {
    if (seen.has(row.id)) continue;
    seen.add(row.id);
    if (!(await numberOnFile(pool, row.id))) missing.push({ id: row.id, name: nameOf({ ...(row.profile || {}), email: row.email }), email: row.email, role: row.role });
  }
  return missing;
}

router.get("/api/super/switches", superAdminAuth, async (req, res) => {
  try {
    const switches = await listSwitches(pool);
    const missing = await staffWithoutNumber();
    res.json({
      switches,
      readiness: { staffWithoutNumber: missing, youHaveNumber: Boolean(await numberOnFile(pool, req.user.id)) },
    });
  } catch (error) {
    res.status(500).json({ error: error.message || "Could not load the switches" });
  }
});

router.put("/api/super/switches/:key", superAdminAuth, async (req, res) => {
  try {
    const def = switchByKey(req.params.key);
    if (!def) return res.status(404).json({ error: "No such switch." });
    if (typeof req.body.value !== "boolean") return res.status(400).json({ error: "value must be true or false." });
    const value = req.body.value;
    // The owner must never lock himself out: the staff code needs a number to send to.
    if (def.key === "login_code_staff" && value && !(await numberOnFile(pool, req.user.id))) {
      return res.status(409).json({ error: "Add your own WhatsApp number to your profile first, or you could not sign in yourself.", code: "OWNER_HAS_NO_NUMBER" });
    }
    const before = (await listSwitches(pool)).find((s) => s.key === def.key);
    if (before.value === value) return res.json({ ok: true, unchanged: true, switch: before });
    const name = await actorName(req.user.id);
    await setSwitch(pool, def.key, value, { id: req.user.id, name });
    await audit(req, "switch.change", "system_switch", def.key, {
      key: def.key, label: def.label, from: before.value, to: value, reason: String(req.body.reason || "").slice(0, 300) || null,
      undo: { kind: "switch", key: def.key, value: before.value },
    });
    res.json({ ok: true, switch: (await listSwitches(pool)).find((s) => s.key === def.key) });
  } catch (error) {
    res.status(500).json({ error: error.message || "Could not change the switch" });
  }
});

router.get("/api/super/activity", superAdminAuth, async (req, res) => {
  try {
    const limit = Math.min(Math.max(Number(req.query.limit) || 100, 1), 300);
    const where = [];
    const args = [];
    const add = (sql, v) => { args.push(v); where.push(sql.replace("?", `$${args.length}`)); };
    if (req.query.before) add("a.id < ?", Number(req.query.before));
    if (req.query.actor) add("a.actor_id = ?", String(req.query.actor));
    if (req.query.action) add("a.action LIKE ?", `${String(req.query.action).replace(/[%_]/g, "")}%`);
    if (req.query.q) add("(a.action ILIKE ? OR a.entity ILIKE ? OR a.detail::text ILIKE ?)".replace(/\?/g, `$${args.length + 1}`), `%${String(req.query.q).slice(0, 80)}%`);
    args.push(limit);
    const rows = (await pool.query(
      `SELECT a.id, a.actor_id, a.actor_role, a.branch_id, a.action, a.entity, a.entity_id, a.detail, a.ip, a.created_at,
              u.email AS actor_email,
              (SELECT p.data->>'first_name' || ' ' || COALESCE(p.data->>'last_name','') FROM app_records p
                WHERE p.table_name='profiles' AND p.data->>'user_id' = a.actor_id ORDER BY p.updated_at DESC LIMIT 1) AS actor_name,
              (SELECT b.name FROM branches b WHERE b.id = a.branch_id) AS branch_name
         FROM audit_log a LEFT JOIN auth_users u ON u.id::text = a.actor_id
        ${where.length ? `WHERE ${where.join(" AND ")}` : ""}
        ORDER BY a.id DESC LIMIT $${args.length}`, args)).rows;
    // Which of these has already been undone.
    const ids = rows.map((r) => String(r.id));
    const undone = ids.length
      ? new Set((await pool.query(`SELECT entity_id FROM audit_log WHERE action = 'undo' AND entity_id = ANY($1)`, [ids])).rows.map((r) => r.entity_id))
      : new Set();
    res.json({
      items: rows.map((r) => ({
        id: String(r.id), at: r.created_at, action: r.action, entity: r.entity, entityId: r.entity_id,
        actorId: r.actor_id, actorRole: r.actor_role, actorName: (r.actor_name || "").trim() || null, actorEmail: r.actor_email,
        branch: r.branch_name || null, ip: r.ip, detail: { ...r.detail, undo: undefined },
        canUndo: Boolean(r.detail?.undo) && !undone.has(String(r.id)), undone: undone.has(String(r.id)),
      })),
      next: rows.length === limit ? String(rows[rows.length - 1].id) : null,
    });
  } catch (error) {
    res.status(500).json({ error: error.message || "Could not load the activity" });
  }
});

export default router;
