/**
 * CRM section 2.6.1 — configurable sound and visual alerts.
 *
 * How the settings resolve, most specific wins:
 *      user  ->  role  ->  branch  ->  global
 * A missing level falls through. If no level has a row for the alert type the
 * alert is dropped rather than guessed at, so an unknown type cannot spam.
 *
 * Every alert also passes three gates before it lands in a person's queue:
 *   - the setting is enabled at the winning level
 *   - the person is not muted or snoozed
 *   - it is not quiet hours, and the person is on shift (2.6.1, last bullet)
 * A blocked alert is still queued when its priority is 'urgent', because the
 * document treats overdue follow-ups and hot leads as things that must not be
 * missed; it just arrives without sound.
 */
import { pool } from "./db.mjs";

export const ALERT_TYPES = [
  "lead_assigned",
  "lead_transferred",
  "branch_lead_arrived",
  "followup_due",
  "followup_overdue",
  "hot_lead_update",
  "missed_response",
  "document_rejected",
  "application_status_changed",
  "escalation_raised",
];

function minutesOf(time) {
  if (!time) return null;
  const [h, m] = String(time).split(":");
  return Number(h) * 60 + Number(m || 0);
}

function inWindow(nowMinutes, start, end) {
  const a = minutesOf(start);
  const b = minutesOf(end);
  if (a === null || b === null) return false;
  return a <= b ? nowMinutes >= a && nowMinutes < b : nowMinutes >= a || nowMinutes < b;
}

/** Resolves the effective settings for one person and one alert type. */
export async function resolveAlertSetting(alertType, { userId = null, role = null, branchId = null } = {}) {
  const { rows } = await pool.query(
    `SELECT * FROM alert_settings
      WHERE alert_type = $1
        AND ( (scope_type = 'global')
           OR (scope_type = 'branch' AND scope_id = $2)
           OR (scope_type = 'role'   AND scope_id = $3)
           OR (scope_type = 'user'   AND scope_id = $4) )`,
    [alertType, String(branchId || ""), String(role || ""), String(userId || "")],
  );
  if (!rows.length) return null;
  const rank = { global: 0, branch: 1, role: 2, user: 3 };
  return rows.sort((a, b) => rank[a.scope_type] - rank[b.scope_type]).at(-1);
}

async function availabilityFor(userId) {
  const { rows } = await pool.query("SELECT * FROM staff_availability WHERE user_id = $1", [String(userId)]);
  return rows[0] || null;
}

/**
 * Queues one alert for one person. Returns the queued row, or null when the
 * alert was suppressed — the caller does not need to care which.
 */
export async function raiseAlert({
  userId,
  role = null,
  branchId = null,
  alertType,
  title,
  body = "",
  link = "",
  entityType = "",
  entityId = "",
  now = new Date(),
}) {
  if (!userId || !alertType) return null;

  const setting = await resolveAlertSetting(alertType, { userId, role, branchId });
  if (!setting || !setting.enabled) return null;

  const urgent = setting.priority === "urgent";
  let sound = setting.sound_enabled && setting.channels.includes("sound") ? setting.tone : "";

  const nowMinutes = now.getHours() * 60 + now.getMinutes();
  if (setting.quiet_start && setting.quiet_end && inWindow(nowMinutes, setting.quiet_start, setting.quiet_end)) {
    if (!urgent) return null;
    sound = "";
  }

  const availability = await availabilityFor(userId);
  if (availability) {
    if (availability.mute_until && new Date(availability.mute_until) > now) {
      if (!urgent) return null;
      sound = "";
    }
    if (setting.respect_hours) {
      const weekday = now.getDay() === 0 ? 7 : now.getDay();
      const onDay = (availability.work_days || []).includes(weekday);
      const onShift = inWindow(nowMinutes, availability.work_start, availability.work_end);
      const away = availability.status === "on_leave" || availability.status === "off_shift";
      if (!onDay || !onShift || away) {
        if (!urgent) return null;
        sound = "";
      }
    }
  }

  const { rows } = await pool.query(
    `INSERT INTO alert_queue
       (user_id, branch_id, alert_type, title, body, link, priority, sound, color, display_ms, entity_type, entity_id)
     VALUES ($1,$2::uuid,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
     RETURNING *`,
    [
      String(userId), branchId || null, alertType, title, body, link,
      setting.priority, sound, setting.color, setting.display_ms,
      entityType, String(entityId || ""),
    ],
  );
  return rows[0];
}

/** Fan-out helper: same alert to several people. */
export async function raiseAlertFor(recipients, payload) {
  const out = [];
  for (const person of recipients || []) {
    const row = await raiseAlert({
      ...payload,
      userId: person.userId || person.id,
      role: person.role ?? payload.role ?? null,
      branchId: person.branchId ?? payload.branchId ?? null,
    });
    if (row) out.push(row);
  }
  return out;
}

export async function pendingAlerts(userId, { limit = 50 } = {}) {
  const { rows } = await pool.query(
    `SELECT * FROM alert_queue
      WHERE user_id = $1
        AND read_at IS NULL
        AND (snoozed_to IS NULL OR snoozed_to <= now())
      ORDER BY
        CASE priority WHEN 'urgent' THEN 0 WHEN 'high' THEN 1 WHEN 'normal' THEN 2 ELSE 3 END,
        created_at DESC
      LIMIT $2`,
    [String(userId), Math.min(Number(limit) || 50, 200)],
  );
  return rows;
}
