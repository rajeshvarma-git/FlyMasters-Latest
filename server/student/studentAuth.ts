import { randomBytes } from "crypto";
import { hashPassword, needsRehash, verifyPassword } from "./password";
import { ensureSchema, getPool, mutateAppState } from "./postgres";

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
  await getPool().query("UPDATE auth_sessions SET last_seen_at = now() WHERE token = $1", [value]).catch(() => null);
  return {
    access_token: value,
    expires_at: new Date(row.expires_at).toISOString(),
    user: publicUser(row),
  };
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

  try {
    await getPool().query(
      "INSERT INTO auth_users (id, email, password, user_metadata) VALUES ($1, $2, $3, $4::jsonb)",
      [user.id, user.email, user.password, JSON.stringify(user.user_metadata)]
    );
  } catch (error: any) {
    if (String(error?.code) === "23505") return { error: "User already registered", status: 409 };
    throw error;
  }

  const now = new Date().toISOString();
  await mutateAppState({
    action: "insert",
    table: "profiles",
    rows: [{
      id: crypto.randomUUID(),
      user_id: user.id,
      first_name: firstName,
      last_name: lastName,
      created_at: now,
      updated_at: now,
    }],
  });
  await mutateAppState({
    action: "insert",
    table: "user_roles",
    rows: [{ id: crypto.randomUUID(), user_id: user.id, role: "student" }],
  });
  await mutateAppState({
    action: "insert",
    table: "student_leads",
    rows: [{
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
      created_at: now,
      updated_at: now,
    }],
  });

  return { session: await createSession(publicUser(user)) };
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
