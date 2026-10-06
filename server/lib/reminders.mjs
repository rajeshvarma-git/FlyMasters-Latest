/**
 * Automatic reminders that need no template or rule set-up — they go through the student's one chat,
 * so they reach the web app and WhatsApp together (the approved follow-up template when the 24-hour
 * window is closed). Admin tunes them on the Automation screen; settings live in system_settings.
 *
 *   documents — a document the counselor requested is still missing after N days: remind, then again
 *               every M days, at most K times.
 *   intake    — a WhatsApp student stopped halfway through the questions: ask the same question again
 *               after H1 hours, then H2 hours (see nudgeStalledIntakes in routes/cases.mjs).
 */
import crypto from "crypto";
import { pool, jsonTable, jsonUpsert } from "./db.mjs";

export const REMINDER_DEFAULTS = {
  documents: { enabled: true, afterDays: 3, repeatDays: 3, maxReminders: 3 },
  intake: { enabled: true, firstHours: 3, secondHours: 48 },
  lastRunAt: null,
  lastResult: null,
};

const clamp = (value, min, max, fallback) => {
  const n = Number(value);
  return Number.isFinite(n) ? Math.min(max, Math.max(min, Math.round(n))) : fallback;
};

export function cleanSettings(input = {}, base = REMINDER_DEFAULTS) {
  const d = { ...base.documents, ...(input.documents || {}) };
  const i = { ...base.intake, ...(input.intake || {}) };
  return {
    documents: {
      enabled: d.enabled !== false && d.enabled !== "false",
      afterDays: clamp(d.afterDays, 1, 30, 3),
      repeatDays: clamp(d.repeatDays, 1, 30, 3),
      maxReminders: clamp(d.maxReminders, 1, 10, 3),
    },
    intake: {
      enabled: i.enabled !== false && i.enabled !== "false",
      firstHours: clamp(i.firstHours, 1, 72, 3),
      secondHours: clamp(i.secondHours, 2, 240, 48),
    },
    lastRunAt: base.lastRunAt || null,
    lastResult: base.lastResult || null,
  };
}

async function settingsRow() {
  const { rows } = await pool.query(
    "SELECT id, data FROM app_records WHERE table_name = 'system_settings' AND data->>'key' = 'reminders' LIMIT 1",
  );
  return rows[0] || null;
}

export async function getReminderSettings() {
  try {
    const row = await settingsRow();
    return cleanSettings(row?.data?.value || {}, { ...REMINDER_DEFAULTS, ...(row?.data?.value || {}) });
  } catch {
    return cleanSettings({});
  }
}

export async function saveReminderSettings(patch) {
  const current = await getReminderSettings();
  const next = cleanSettings(patch, current);
  const row = await settingsRow();
  await jsonUpsert("system_settings", { id: row?.id || crypto.randomUUID(), key: "reminders", value: next });
  return next;
}

async function stamp(result) {
  const current = await getReminderSettings();
  const row = await settingsRow();
  await jsonUpsert("system_settings", {
    id: row?.id || crypto.randomUUID(),
    key: "reminders",
    value: { ...current, lastRunAt: new Date().toISOString(), lastResult: result },
  });
}

/** 9am–8pm India time: nobody gets a "reminder" at midnight. */
export function reminderHoursOpen(now = new Date()) {
  const hour = new Date(now.getTime() + 5.5 * 3600000).getUTCHours();
  return hour >= 9 && hour < 20;
}

/** Requested documents that are still missing, grouped by student. */
export async function runDocumentReminders({ now = new Date(), settings = null, ignoreHours = false } = {}) {
  const cfg = (settings || (await getReminderSettings())).documents;
  if (!cfg.enabled) return { students: 0, reminders: 0, skipped: "off" };
  if (!ignoreHours && !reminderHoursOpen(now)) return { students: 0, reminders: 0, skipped: "outside 9am-8pm" };

  const [requests, sqlDocs, jsonDocs] = await Promise.all([
    jsonTable("document_requests").catch(() => []),
    pool.query("SELECT user_id, document_type, status, archived FROM documents").catch(() => ({ rows: [] })),
    jsonTable("documents").catch(() => []),
  ]);
  const have = new Set();
  for (const doc of [...sqlDocs.rows, ...jsonDocs]) {
    if (doc.archived || !doc.user_id) continue;
    if (["rejected", "requested"].includes(String(doc.status || ""))) continue;
    have.add(`${doc.user_id}|${String(doc.document_type || "").trim().toLowerCase()}`);
  }

  const days = (iso) => (now.getTime() - Date.parse(iso || "")) / 86400000;
  const due = new Map();
  for (const req of requests) {
    if (String(req.status || "pending") !== "pending") continue;
    if (have.has(`${req.student_id}|${String(req.document_type || "").trim().toLowerCase()}`)) continue;
    const sent = Number(req.reminders_sent || 0);
    if (sent >= cfg.maxReminders) continue;
    const since = req.last_reminded_at || req.created_at;
    const needed = sent === 0 ? cfg.afterDays : cfg.repeatDays;
    if (!(days(since) >= needed)) continue;
    if (!due.has(req.student_id)) due.set(req.student_id, []);
    due.get(req.student_id).push(req);
  }

  const { notifyStudentChat } = await import("../routes/cases.mjs");
  const portalUrl = String(process.env.PUBLIC_APP_URL || "").trim().replace(/\/$/, "");
  let reminders = 0;
  for (const [studentId, list] of due) {
    const names = list.map((r) => r.document_type).join(", ");
    const round = Math.max(...list.map((r) => Number(r.reminders_sent || 0))) + 1;
    const body = `⏰ Reminder: we're still waiting for your ${names}. Please upload ${list.length === 1 ? "it" : "them"} in the Documents section of your Fly Masters student portal${portalUrl ? ` (${portalUrl}/student/documents)` : ""} so your application can move forward.`;
    const ok = await notifyStudentChat(studentId, body, `doc-remind:${studentId}:${list.map((r) => r.id).join(",")}:${round}`);
    if (!ok) continue;
    for (const req of list) {
      await jsonUpsert("document_requests", { ...req, reminders_sent: Number(req.reminders_sent || 0) + 1, last_reminded_at: now.toISOString() });
    }
    reminders += 1;
  }
  return { students: due.size, reminders };
}

/** One pass of everything automatic; the hourly timer and the "Run now" button both call this. */
export async function runAllReminders({ ignoreHours = false } = {}) {
  const settings = await getReminderSettings();
  const result = { documents: null, intake: null };
  try {
    result.documents = await runDocumentReminders({ settings, ignoreHours });
  } catch (error) {
    result.documents = { error: String(error?.message || error) };
    console.error("[reminders] documents failed:", error?.message || error);
  }
  try {
    const { nudgeStalledIntakes } = await import("../routes/cases.mjs");
    result.intake = { nudged: await nudgeStalledIntakes(new Date(), { settings, ignoreHours }) };
  } catch (error) {
    result.intake = { error: String(error?.message || error) };
    console.error("[reminders] intake failed:", error?.message || error);
  }
  await stamp(result).catch(() => {});
  return result;
}

export function startReminderScheduler({ intervalMs = 60 * 60 * 1000 } = {}) {
  const timer = setInterval(() => { runAllReminders().catch((e) => console.error("[reminders] run failed:", e?.message || e)); }, intervalMs);
  if (timer.unref) timer.unref();
  return timer;
}
