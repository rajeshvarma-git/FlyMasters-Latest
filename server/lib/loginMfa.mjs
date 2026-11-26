/**
 * Second step of sign-in: a 6-digit code sent to the person's own WhatsApp number.
 *
 * A password alone is easy to get (shared, guessed, leaked). A phone number is not, so after the password
 * is right the server holds back the session and sends a code; only the code releases it. This is checked
 * on the server for every sign-in path (staff and student), so hiding or skipping the screen does nothing.
 *
 *  - Switch: the Super Admin turns it on or off for staff and for students (switches.mjs). Off leaves sign-in exactly
 *    as it was, which is also the way back in if WhatsApp sending ever fails.
 *  - The number comes from the account's own profile (verified WhatsApp number first, then phone). It is never
 *    taken from the sign-in request, so someone who only has the password cannot point the code at their phone.
 *  - A code lasts 5 minutes, allows 5 tries, works once, and a new one cannot be asked for within 30 seconds.
 *  - Only a hash of the code is stored.
 *
 * Challenges live in app_records (table_name = 'login_challenges'), so no new table is needed.
 */
import { createHash, randomBytes, randomInt, timingSafeEqual } from "crypto";
import { switchOn } from "./switches.mjs";

const TABLE = "login_challenges";
export const CODE_TTL_MS = 5 * 60 * 1000;
export const RESEND_AFTER_MS = 30 * 1000;
export const MAX_TRIES = 5;

/** Whether the sign-in code is required for this kind of account right now (a Super Admin switch). */
export const mfaEnabled = (pool, role) => switchOn(pool, role === "student" ? "login_code_students" : "login_code_staff");

const digits = (v) => String(v || "").replace(/\D/g, "");
const hash = (challengeId, code) => createHash("sha256").update(`${challengeId}:${code}`).digest("hex");
const same = (a, b) => {
  const x = Buffer.from(String(a)), y = Buffer.from(String(b));
  return x.length === y.length && timingSafeEqual(x, y);
};

/** 10-digit Indian mobile -> "91XXXXXXXXXX"; anything else -> null. */
export function toWhatsAppNumber(value) {
  const d = digits(value);
  const ten = d.length === 12 && d.startsWith("91") ? d.slice(2) : d.length === 11 && d.startsWith("0") ? d.slice(1) : d;
  return /^[6-9]\d{9}$/.test(ten) ? `91${ten}` : null;
}

export const maskNumber = (n) => (n ? `+91 ${"•".repeat(5)}${String(n).slice(-5)}` : "");

/** The number on file for this login, from their profile only. */
export async function numberOnFile(pool, userId) {
  const r = await pool.query(
    `SELECT data FROM app_records WHERE table_name = 'profiles' AND data->>'user_id' = $1 ORDER BY updated_at DESC LIMIT 1`,
    [String(userId)],
  );
  const p = r.rows[0]?.data || {};
  return toWhatsAppNumber(p.whatsapp_number) || toWhatsAppNumber(p.phone);
}

/**
 * After a correct password. Returns:
 *  - { required: false }                      let them in (switch off, or a student with no number yet)
 *  - { required: true, challengeId, masked }  code sent; hold the session
 *  - { error, status }                        cannot sign in (staff with no number, or sending failed)
 *
 * `role` decides what to do when no number is on file: a student is let in once (the first chat makes them add
 * one), staff are stopped, because a staff account must always be tied to a real phone.
 */
export async function beginLoginMfa({ pool, userId, role, send }) {
  if (!(await mfaEnabled(pool, role))) return { required: false };
  const number = await numberOnFile(pool, userId);
  if (!number) {
    if (role === "student") return { required: false, noNumber: true };
    return { error: "Your account has no WhatsApp number on file. Ask an admin to add it, then sign in again.", status: 403, code: "NO_NUMBER" };
  }
  return issueCode({ pool, userId, number, send });
}

async function issueCode({ pool, userId, number, send, challengeId }) {
  const id = challengeId || randomBytes(24).toString("hex");
  const code = String(randomInt(100000, 1000000));
  const now = Date.now();
  const data = {
    user_id: String(userId), number, code_hash: hash(id, code), tries: 0, used: false,
    sent_at: new Date(now).toISOString(), expires_at: new Date(now + CODE_TTL_MS).toISOString(),
  };
  try {
    await send(number, code);
  } catch (error) {
    return { error: "We could not send the WhatsApp code. Try again in a minute.", status: 502, code: "SEND_FAILED", detail: error?.message };
  }
  await pool.query(
    `INSERT INTO app_records (id, table_name, data) VALUES ($1, $2, $3::jsonb)
     ON CONFLICT (id) DO UPDATE SET data = EXCLUDED.data, updated_at = now()`,
    [`${TABLE}:${id}`, TABLE, JSON.stringify(data)],
  );
  // Old, finished challenges are tidied away as we go.
  await pool.query(`DELETE FROM app_records WHERE table_name = $1 AND (data->>'expires_at')::timestamptz < now() - interval '1 day'`, [TABLE]).catch(() => null);
  return { required: true, challengeId: id, masked: maskNumber(number) };
}

async function load(pool, challengeId) {
  const r = await pool.query(`SELECT data FROM app_records WHERE id = $1 AND table_name = $2`, [`${TABLE}:${String(challengeId || "")}`, TABLE]);
  return r.rows[0]?.data || null;
}

/** Ask for another code on the same challenge. */
export async function resendLoginCode({ pool, challengeId, send }) {
  const c = await load(pool, challengeId);
  if (!c || c.used) return { error: "That sign-in has expired. Start again.", status: 400, code: "EXPIRED" };
  const wait = RESEND_AFTER_MS - (Date.now() - new Date(c.sent_at).getTime());
  if (wait > 0) return { error: `Wait ${Math.ceil(wait / 1000)} seconds before asking for a new code.`, status: 429, code: "TOO_SOON" };
  return issueCode({ pool, userId: c.user_id, number: c.number, send, challengeId });
}

/** Check the code. Returns { ok: true, userId } once; any other result means no session. */
export async function checkLoginCode({ pool, challengeId, code }) {
  const c = await load(pool, challengeId);
  const bad = { error: "Wrong or expired code.", status: 400 };
  if (!c || c.used) return bad;
  if (new Date(c.expires_at).getTime() <= Date.now()) return { ...bad, error: "That code has expired. Ask for a new one." };
  if (Number(c.tries) >= MAX_TRIES) return { error: "Too many wrong codes. Sign in again.", status: 429 };
  const clean = digits(code);
  if (clean.length !== 6 || !same(c.code_hash, hash(challengeId, clean))) {
    await pool.query(
      `UPDATE app_records SET data = jsonb_set(data, '{tries}', to_jsonb(COALESCE((data->>'tries')::int, 0) + 1)), updated_at = now() WHERE id = $1`,
      [`${TABLE}:${challengeId}`],
    );
    return { error: "Wrong code. Check WhatsApp and try again.", status: 400 };
  }
  // Single use: the update only succeeds for the first caller.
  const used = await pool.query(
    `UPDATE app_records SET data = data || '{"used": true}'::jsonb, updated_at = now() WHERE id = $1 AND COALESCE((data->>'used')::boolean, false) = false`,
    [`${TABLE}:${challengeId}`],
  );
  if (!used.rowCount) return bad;
  return { ok: true, userId: c.user_id };
}
