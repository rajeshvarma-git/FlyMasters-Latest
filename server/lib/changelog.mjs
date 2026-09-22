/**
 * Developer-facing configuration change tracking.
 *
 * `audit_log` (migration 002) answers "who did a sensitive thing?" and is a
 * compliance record. This is a different question: "what did this piece of
 * configuration look like before, and what changed when?" — the history a
 * developer or the client's own technical contact reads when a checklist or a
 * message template behaves differently from last month.
 *
 * Two rules the client asked for explicitly:
 *   1. Nothing is ever deleted. A superseded version keeps its row and goes
 *      inactive; the live version is the active one. This file records the
 *      transition between them.
 *   2. The history is NOT for every staff member. Read access is gated by
 *      `developerOnly` below, which is narrower than super admin.
 */
import { pool } from "./db.mjs";
import { ROLES } from "./auth.mjs";

/**
 * Who may read the change history.
 *
 * Set DEVELOPER_EMAILS to a comma-separated list. When it is empty the gate
 * falls back to super admin alone — never to "any admin", because the client
 * asked for this to stay with the developer rather than the whole office.
 */
function developerEmails() {
  return String(process.env.DEVELOPER_EMAILS || "")
    .split(",")
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean);
}

export function isDeveloper(user) {
  if (!user) return false;
  const allow = developerEmails();
  if (allow.length) return allow.includes(String(user.email || "").toLowerCase());
  return user.role === ROLES.SUPER_ADMIN;
}

export function developerOnly(req, res, next) {
  if (!isDeveloper(req.user)) {
    return res.status(403).json({ error: "Change history is restricted to the platform developer." });
  }
  next();
}

/**
 * Shallow field-level diff. Arrays compare by JSON value, which is right for
 * the string arrays used throughout the configuration tables.
 */
export function diffOf(before = {}, after = {}, ignore = []) {
  const skip = new Set(["updated_at", "created_at", "id", ...ignore]);
  const keys = new Set([...Object.keys(before || {}), ...Object.keys(after || {})]);
  const changed = {};
  for (const key of keys) {
    if (skip.has(key)) continue;
    const a = before?.[key];
    const b = after?.[key];
    if (JSON.stringify(a ?? null) === JSON.stringify(b ?? null)) continue;
    changed[key] = { from: a ?? null, to: b ?? null };
  }
  return changed;
}

/**
 * Records one configuration change. Never throws into the request path — a
 * failed history write must not fail the change the user asked for.
 */
export async function logChange(req, {
  entityType,
  entityId,
  entityLabel = "",
  action,
  versionFrom = null,
  versionTo = null,
  before = null,
  after = null,
  diff = null,
}) {
  try {
    const computed = diff || (before || after ? diffOf(before || {}, after || {}) : {});
    await pool.query(
      `INSERT INTO config_change_log
         (entity_type, entity_id, entity_label, action, version_from, version_to, diff,
          actor_id, actor_name, actor_role)
       VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb,$8,$9,$10)`,
      [
        entityType,
        String(entityId || ""),
        entityLabel,
        action,
        versionFrom,
        versionTo,
        JSON.stringify(computed),
        req?.user?.id || null,
        req?.user?.email || null,
        req?.user?.role || null,
      ],
    );
  } catch (error) {
    console.error("config_change_log write failed:", error.message || error);
  }
}

export async function readChanges({ entityType = null, entityId = null, limit = 200, since = null } = {}) {
  const params = [];
  const where = [];
  if (entityType) { params.push(entityType); where.push(`entity_type = $${params.length}`); }
  if (entityId) { params.push(String(entityId)); where.push(`entity_id = $${params.length}`); }
  if (since) { params.push(since); where.push(`created_at >= $${params.length}`); }
  params.push(Math.min(Number(limit) || 200, 1000));
  const { rows } = await pool.query(
    `SELECT * FROM config_change_log
     ${where.length ? `WHERE ${where.join(" AND ")}` : ""}
     ORDER BY created_at DESC
     LIMIT $${params.length}`,
    params,
  );
  return rows;
}
