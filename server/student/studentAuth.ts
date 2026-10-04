import { createHash, randomBytes } from "crypto";
import { isEmailConfigured, sendVerificationEmail } from "./emailVerification";
import { hashPassword, needsRehash, verifyPassword } from "./password";
import { ensureSchema, getPool } from "./postgres";

const SESSION_DAYS = 30;
const loginAttempts = new Map<string, { count: number; resetAt: number }>();

export type PublicUser = {
  id: string;
  email: string;
  user_metadata: Record<string, any>;
};

export type AuthSession = {
  access_token: string;
  expires_at: string;
  user: PublicUser;
};

function normalizeEmail(value: string) {
  return String(value || "").trim().toLowerCase();
}

function emailLocalPart(value: string) {
  return normalizeEmail(value).split("@")[0].replace(/[^a-z0-9]/g, "");
}

function publicUser(row: any): PublicUser {
  return {
    id: String(row.id),
    email: String(row.email || ""),
    user_metadata: row.user_metadata || {},
  };
}

function checkRateLimit(key: string, limit = 12, windowMs = 10 * 60 * 1000) {
  const now = Date.now();
  const current = loginAttempts.get(key);
  if (!current || current.resetAt < now) {
    loginAttempts.set(key, { count: 1, resetAt: now + windowMs });
    return true;
  }
  current.count += 1;
  return current.count <= limit;
}

async function findAuthUser(emailInput: string) {
  const email = normalizeEmail(emailInput);
  if (!email) return { user: null as any, ambiguous: false };
  const local = emailLocalPart(email);
  const result = await getPool().query(
    `SELECT id, email, password, user_metadata
     FROM auth_users
     WHERE lower(email) = $1
        OR lower(split_part(email, '@', 1)) = $2`,
    [email, email.includes("@") ? email.split("@")[0] : email]
  );
  const exact = result.rows.find((row) => String(row.email || "").toLowerCase() === email);
  if (exact) return { user: exact, ambiguous: false };
  const localMatches = result.rows.filter((row) => emailLocalPart(row.email) === local);
  if (localMatches.length === 1) return { user: localMatches[0], ambiguous: false };
  if (localMatches.length > 1) return { user: null, ambiguous: true };
  return { user: null, ambiguous: false };
}

async function createSession(user: PublicUser): Promise<AuthSession> {
  const token = randomBytes(32).toString("hex");
  const expires = new Date(Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000);
  await getPool().query(
    `INSERT INTO auth_sessions (token, user_id, expires_at) VALUES ($1, $2, $3)`,
    [token, user.id, expires.toISOString()]
  );
  return {
    access_token: token,
    expires_at: expires.toISOString(),
    user,
  };
}

export async function getSessionByToken(token: string | null | undefined): Promise<AuthSession | null> {
  const value = String(token || "").trim();
  if (!value) return null;
  await ensureSchema();
  const found = await getPool().query(
    `SELECT s.token, s.expires_at, u.id, u.email, u.user_metadata
     FROM auth_sessions s
     JOIN auth_users u ON u.id = s.user_id
     WHERE s.token = $1
     LIMIT 1`,
    [value]
  );
  const row = found.rows[0];
  if (!row) return null;
  if (new Date(row.expires_at).getTime() <= Date.now()) {
    await getPool().query("DELETE FROM auth_sessions WHERE token = $1", [value]);
    return null;
  }
  // A disabled account loses access immediately, not when its session expires.
  if (await isDisabled(row.id)) {
    await getPool().query("DELETE FROM auth_sessions WHERE user_id = $1", [row.id]).catch(() => null);
    return null;
  }
  await getPool().query("UPDATE auth_sessions SET last_seen_at = now() WHERE token = $1", [value]).catch(() => null);
  return {
    access_token: value,
    expires_at: new Date(row.expires_at).toISOString(),
    user: publicUser(row),
  };
}

async function isDisabled(userId: string) {
  const { rows } = await getPool().query(
    `SELECT 1 FROM user_roles WHERE user_id = $1 AND is_active = false
     UNION ALL SELECT 1 FROM app_records WHERE table_name = 'user_roles' AND data->>'user_id' = $1 AND data->>'is_active' = 'false'
     LIMIT 1`,
    [String(userId)],
  ).catch(() => ({ rows: [] as any[] }));
  return rows.length > 0;
}

/** Ends every session of a user (password change, disable). */
export async function destroyAllSessions(userId: string) {
  await getPool().query("DELETE FROM auth_sessions WHERE user_id = $1", [String(userId)]);
}

export async function destroySession(token: string | null | undefined) {
  const value = String(token || "").trim();
  if (!value) return;
  await ensureSchema();
  await getPool().query("DELETE FROM auth_sessions WHERE token = $1", [value]);
}

export async function signInUser(emailInput: string, password: string): Promise<{ session?: AuthSession; error?: string; status?: number }> {
  await ensureSchema();
  const email = normalizeEmail(emailInput);
  if (!email || !password) return { error: "Email and password are required.", status: 400 };
  if (!checkRateLimit(`login:${email}`)) {
    return { error: "Too many sign-in attempts. Try again in a few minutes.", status: 429 };
  }
  const { user, ambiguous } = await findAuthUser(email);
  if (ambiguous) {
    return { error: "That login matches more than one student. Use your full email address.", status: 400 };
  }
  if (!user || !verifyPassword(password, user.password)) {
    return { error: "Invalid email or password", status: 401 };
  }
  if (await isDisabled(user.id)) {
    return { error: "This account is disabled. Contact Fly Masters.", status: 403 };
  }
  if (needsRehash(user.password)) {
    await getPool().query("UPDATE auth_users SET password = $1 WHERE id = $2", [hashPassword(password), user.id]);
  }
  loginAttempts.delete(`login:${email}`);
  return { session: await createSession(publicUser(user)) };
}

export async function signUpUser(input: {
  email: string;
  password: string;
  user_metadata?: Record<string, any>;
}): Promise<{ session?: AuthSession; error?: string; status?: number }> {
  await ensureSchema();
  const email = normalizeEmail(input.email);
  const password = String(input.password || "");
  const firstName = String(input.user_metadata?.first_name || "").trim();
  const lastName = String(input.user_metadata?.last_name || "").trim();
  if (!email || !email.includes("@")) return { error: "Enter a valid email address.", status: 400 };
  if (password.length < 6) return { error: "Password must be at least 6 characters.", status: 400 };
  if (!checkRateLimit(`signup:${email}`, 8)) {
    return { error: "Too many sign-up attempts. Try again in a few minutes.", status: 429 };
  }

  // The "registration on hold" switch (Admin settings) is enforced here,
  // not only on the sign-up page.
  const setting = await getPool().query(
    "SELECT data->'value' AS value FROM app_records WHERE table_name = 'system_settings' AND data->>'key' = 'registration_enabled' LIMIT 1",
  ).catch(() => ({ rows: [] as any[] }));
  const reg = setting.rows[0]?.value;
  if (reg && typeof reg === "object" && reg.enabled === false) {
    return { error: String(reg.message || "New registrations are on hold right now."), status: 403 };
  }

  const existing = await getPool().query("SELECT id FROM auth_users WHERE lower(email) = $1 LIMIT 1", [email]);
  if (existing.rows[0]) return { error: "User already registered", status: 409 };

  const user = {
    id: crypto.randomUUID(),
    email,
    password: hashPassword(password),
    user_metadata: {
      first_name: firstName,
      last_name: lastName,
      ...(input.user_metadata || {}),
    },
  };

  // Account, profile, role and lead are written together: either all of
  // them exist or none do, so a failure can't leave half a student behind.
  const now = new Date().toISOString();
  const record = (table: string, data: Record<string, any>) => ({ table, data: { ...data, created_at: now, updated_at: now } });
  const records = [
    record("profiles", { id: crypto.randomUUID(), user_id: user.id, first_name: firstName, last_name: lastName }),
    record("user_roles", { id: crypto.randomUUID(), user_id: user.id, role: "student" }),
    record("student_leads", {
      id: crypto.randomUUID(),
      user_id: user.id,
      email,
      first_name: firstName,
      last_name: lastName,
      // A signup is a HOT LEAD, not a student. The person found us and registered
      // themselves, which is the strongest intent we get — so they go to the top of the
      // telecaller queue. They only become a student when a telecaller converts them,
      // and only an admin attaches a counselor after that.
      assigned_counselor_id: null,
      assigned_telecaller_id: null,
      lead_source: "student_site",
      entity_type: "lead",
      lead_status: "hot",
      lead_stage: "hot",
      status: "new",
    }),
  ];
  const client = await getPool().connect();
  try {
    await client.query("BEGIN");
    await client.query(
      "INSERT INTO auth_users (id, email, password, user_metadata) VALUES ($1, $2, $3, $4::jsonb)",
      [user.id, user.email, user.password, JSON.stringify(user.user_metadata)]
    );
    for (const r of records) {
      await client.query("INSERT INTO app_records (id, table_name, data) VALUES ($1, $2, $3::jsonb)", [r.data.id, r.table, JSON.stringify(r.data)]);
    }
    await client.query("COMMIT");
  } catch (error: any) {
    await client.query("ROLLBACK").catch(() => {});
    if (String(error?.code) === "23505") return { error: "User already registered", status: 409 };
    throw error;
  } finally {
    client.release();
  }

  return { session: await createSession(publicUser(user)) };
}

// ---------------------------------------------------------- password reset
//
// "Forgot password": a single-use link, valid for 30 minutes, emailed to the
// account's address. Only a hash of the token is stored. Using it sets the
// new password and signs the account out everywhere.

const RESET_TTL_MS = 30 * 60 * 1000;
const sha256 = (value: string) => createHash("sha256").update(value).digest("hex");

async function ensureResetTable() {
  await getPool().query(`CREATE TABLE IF NOT EXISTS auth_password_resets (
    token_hash text PRIMARY KEY,
    user_id text NOT NULL,
    expires_at timestamptz NOT NULL,
    used_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now()
  )`);
}

/** Public address used in the emailed link (never taken from the request's Host header alone). */
function siteUrl(fallbackHost?: string) {
  const configured = String(process.env.PUBLIC_APP_URL || "").trim().replace(/\/$/, "");
  if (configured) return configured;
  const railway = String(process.env.RAILWAY_PUBLIC_DOMAIN || "").trim();
  if (railway) return `https://${railway}`;
  return fallbackHost ? `http://${fallbackHost}` : "";
}

export async function requestPasswordReset(emailInput: string, fallbackHost?: string): Promise<{ ok?: boolean; error?: string; status?: number }> {
  await ensureSchema();
  const email = normalizeEmail(emailInput);
  if (!email || !email.includes("@")) return { error: "Enter your email address.", status: 400 };
  await ensureResetTable();
  if (!checkRateLimit(`reset:${email}`, 3)) {
    return { error: "A reset link was already requested. Check your inbox (and spam), or try again in a few minutes.", status: 429 };
  }
  if (!isEmailConfigured()) {
    return {
      error: "Password reset by email isn't available yet. Message Fly Masters on WhatsApp at +91 90104 25365 and we'll reset it for you.",
      status: 503,
    };
  }
  await ensureResetTable();
  const found = await getPool().query("SELECT id FROM auth_users WHERE lower(email) = $1 LIMIT 1", [email]);
  const userId = found.rows[0]?.id;
  // Same answer whether or not the account exists, so the form can't be
  // used to find out who has one.
  if (!userId) return { ok: true };
  const token = randomBytes(32).toString("hex");
  await getPool().query(
    "INSERT INTO auth_password_resets (token_hash, user_id, expires_at) VALUES ($1, $2, $3)",
    [sha256(token), String(userId), new Date(Date.now() + RESET_TTL_MS).toISOString()],
  );
  const link = `${siteUrl(fallbackHost)}/auth?type=recovery&reset_token=${token}`;
  await sendVerificationEmail({
    to: email,
    subject: "Reset your Fly Masters password",
    text: `Open this link within 30 minutes to choose a new password: ${link}\n\nIf you didn't ask for this, ignore this email — your password stays the same.`,
    html: `<div style="font-family:Arial,sans-serif;max-width:480px;margin:0 auto;padding:24px">
      <h2 style="color:#1e40af;margin-bottom:8px">Reset your password</h2>
      <p style="color:#475569">Click the button within 30 minutes to choose a new password. The link works once.</p>
      <p style="padding:12px 0"><a href="${link}" style="background:#2563eb;color:#fff;padding:10px 18px;border-radius:8px;text-decoration:none">Choose a new password</a></p>
      <p style="color:#64748b;font-size:13px">If you didn't ask for this, ignore this email — your password stays the same.</p>
    </div>`,
  });
  return { ok: true };
}

export async function resetPasswordWithToken(token: string, password: string): Promise<{ ok?: boolean; error?: string; status?: number }> {
  await ensureSchema();
  await ensureResetTable();
  if (!password || password.length < 6) return { error: "Password must be at least 6 characters.", status: 400 };
  const hash = sha256(String(token || ""));
  const client = await getPool().connect();
  try {
    await client.query("BEGIN");
    // Claiming the token and using it happen together: a link works once.
    const { rows } = await client.query(
      `UPDATE auth_password_resets SET used_at = now()
        WHERE token_hash = $1 AND used_at IS NULL AND expires_at > now()
        RETURNING user_id`,
      [hash],
    );
    if (!rows[0]) {
      await client.query("ROLLBACK");
      return { error: "This reset link has expired or was already used. Ask for a new one.", status: 400 };
    }
    await client.query("UPDATE auth_users SET password = $1 WHERE id = $2", [hashPassword(password), rows[0].user_id]);
    await client.query("DELETE FROM auth_sessions WHERE user_id = $1", [rows[0].user_id]);
    await client.query("COMMIT");
    return { ok: true };
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}

export async function updatePasswordForToken(token: string, password: string) {
  const session = await getSessionByToken(token);
  if (!session) return { error: "Please sign in again.", status: 401 };
  if (!password || password.length < 6) return { error: "Password must be at least 6 characters.", status: 400 };
  await getPool().query("UPDATE auth_users SET password = $1 WHERE id = $2", [hashPassword(password), session.user.id]);
  return { user: session.user };
}

export function readBearerToken(req: { headers?: Record<string, any>; url?: string }) {
  const header = String(req.headers?.authorization || req.headers?.Authorization || "");
  if (header.toLowerCase().startsWith("bearer ")) return header.slice(7).trim();
  try {
    const parsed = new URL(req.url || "/", "http://localhost");
    return parsed.searchParams.get("token") || "";
  } catch {
    return "";
  }
}
