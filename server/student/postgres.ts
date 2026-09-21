import pg from "pg";
import { hashPassword } from "./password";
import { seedAppState } from "./seed";

const { Pool } = pg;

let pool: pg.Pool | null = null;
let schemaReady: Promise<void> | null = null;

export function getDatabaseUrl() {
  return process.env.DATABASE_URL || "";
}

export function getPool() {
  const url = getDatabaseUrl();
  if (!url || url.includes("YOUR_PASSWORD")) {
    throw new Error(
      "PostgreSQL is not configured. Set DATABASE_URL in .env, for example postgresql://postgres:YOUR_PASSWORD@127.0.0.1:5433/flymasters"
    );
  }
  if (!pool) {
    pool = new Pool({
      connectionString: url,
      max: 25,
      connectionTimeoutMillis: 8000,
      idleTimeoutMillis: 15000,
    });
  }
  return pool;
}

export async function pingPostgres() {
  const client = await getPool().connect();
  try {
    const result = await client.query("SELECT current_database() AS database, current_user AS user, inet_server_addr() AS host, inet_server_port() AS port");
    return result.rows[0];
  } finally {
    client.release();
  }
}

export async function ensureSchema() {
  if (!schemaReady) {
    schemaReady = ensureSchemaOnce().catch((error) => {
      schemaReady = null;
      throw error;
    });
  }
  return schemaReady;
}

async function ensureSchemaOnce() {
  const client = await getPool().connect();
  try {
    await client.query("BEGIN");
    await client.query(`
      CREATE TABLE IF NOT EXISTS auth_users (
        id TEXT PRIMARY KEY,
        email TEXT UNIQUE NOT NULL,
        password TEXT NOT NULL,
        user_metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now()
      );

      CREATE TABLE IF NOT EXISTS app_records (
        id TEXT PRIMARY KEY,
        table_name TEXT NOT NULL,
        data JSONB NOT NULL DEFAULT '{}'::jsonb,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
      );
      CREATE INDEX IF NOT EXISTS idx_app_records_table ON app_records(table_name);

      CREATE TABLE IF NOT EXISTS app_storage (
        path TEXT PRIMARY KEY,
        data_url TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS app_meta (
        key TEXT PRIMARY KEY,
        value JSONB NOT NULL
      );

      CREATE TABLE IF NOT EXISTS auth_sessions (
        token TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        expires_at TIMESTAMPTZ NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        last_seen_at TIMESTAMPTZ NOT NULL DEFAULT now()
      );
      CREATE INDEX IF NOT EXISTS idx_auth_sessions_user ON auth_sessions(user_id);
      CREATE INDEX IF NOT EXISTS idx_auth_sessions_expires ON auth_sessions(expires_at);
    `);

    const users = await client.query("SELECT COUNT(*)::int AS count FROM auth_users");
    if (users.rows[0].count === 0) {
      const seed = seedAppState();
      for (const user of seed.authUsers) {
        await client.query(
          "INSERT INTO auth_users (id, email, password, user_metadata) VALUES ($1, $2, $3, $4)",
          [user.id, user.email, user.password, JSON.stringify(user.user_metadata)]
        );
      }
      for (const [tableName, rows] of Object.entries(seed.tables)) {
        for (const row of rows) {
          await client.query(
            "INSERT INTO app_records (id, table_name, data) VALUES ($1, $2, $3)",
            [row.id, tableName, JSON.stringify(row)]
          );
        }
      }
      await client.query(
        "INSERT INTO app_meta (key, value) VALUES ('session', 'null'::jsonb) ON CONFLICT (key) DO NOTHING"
      );
    }

    const seedDefaults = seedAppState().tables;
    for (const item of seedDefaults.document_checklists || []) {
      await client.query(
        "INSERT INTO app_records (id, table_name, data) VALUES ($1, $2, $3::jsonb) ON CONFLICT (id) DO UPDATE SET data = EXCLUDED.data, updated_at = now()",
        [item.id, "document_checklists", JSON.stringify(item)]
      );
    }

    for (const item of seedDefaults.document_countries || []) {
      await client.query(
        "INSERT INTO app_records (id, table_name, data) VALUES ($1, $2, $3::jsonb) ON CONFLICT (id) DO UPDATE SET data = EXCLUDED.data, updated_at = now()",
        [item.id, "document_countries", JSON.stringify(item)]
      );
    }

    for (const item of seedDefaults.document_degree_types || []) {
      await client.query(
        "INSERT INTO app_records (id, table_name, data) VALUES ($1, $2, $3::jsonb) ON CONFLICT (id) DO UPDATE SET data = EXCLUDED.data, updated_at = now()",
        [item.id, "document_degree_types", JSON.stringify(item)]
      );
    }

    await client.query("COMMIT");
    await getPool()
      .query("CREATE UNIQUE INDEX IF NOT EXISTS idx_auth_users_email_lower ON auth_users (lower(email))")
      .catch(() => {});
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export async function readAppState(options?: { includeStorage?: boolean; table?: string }) {
  await ensureSchema();
  const pool = getPool();
  const includeStorage = options?.includeStorage === true;
  const table = options?.table;

  const [users, records, files] = await Promise.all([
    pool.query("SELECT id, email, password, user_metadata FROM auth_users ORDER BY created_at"),
    table
      ? pool.query("SELECT id, table_name, data FROM app_records WHERE table_name = $1", [table])
      : pool.query("SELECT id, table_name, data FROM app_records"),
    includeStorage
      ? pool.query("SELECT path, data_url FROM app_storage")
      : Promise.resolve({ rows: [] as { path: string; data_url: string }[] }),
  ]);

  const tables: Record<string, any[]> = {};
  for (const row of records.rows) {
    if (!tables[row.table_name]) tables[row.table_name] = [];
    tables[row.table_name].push(parseRecord(row.id, row.data));
  }

  if (!table || table === "university_shortlists" || table === "student_leads") {
    await mergeCounselorSqlShortlists(tables, users.rows).catch((error) => {
      console.error("Could not merge counselor shortlists:", error);
    });
  }

  const storage: Record<string, string> = {};
  for (const row of files.rows) storage[row.path] = row.data_url;

  return {
    authUsers: users.rows.map((row) => ({
      id: row.id,
      email: row.email,
      user_metadata: row.user_metadata,
    })),
    session: null,
    tables,
    storage,
  };
}

function parseRecord(id: string, data: any) {
  let value = data;
  if (typeof value === "string") {
    try {
      value = JSON.parse(value);
    } catch {
      value = {};
    }
  }
  if (!value || typeof value !== "object") value = {};
  return { ...value, id: value.id || id };
}

function asIso(value: any) {
  if (!value) return new Date().toISOString();
  if (value instanceof Date) return value.toISOString();
  const text = String(value);
  return text || new Date().toISOString();
}

function personName(row: any) {
  return `${row?.first_name || ""} ${row?.last_name || ""}`.trim().toLowerCase();
}

function emailKey(value: any) {
  const email = String(value || "").trim().toLowerCase();
  if (!email) return "";
  return email.split("@")[0].replace(/[^a-z0-9]/g, "");
}

function emailsMatch(left: any, right: any) {
  const a = String(left || "").trim().toLowerCase();
  const b = String(right || "").trim().toLowerCase();
  if (!a || !b) return false;
  if (a === b) return true;
  const keyA = emailKey(a);
  const keyB = emailKey(b);
  return Boolean(keyA && keyA === keyB && keyA.length >= 4);
}

function findStudentInDirectory(
  directory: { user_id: string; email: string; name: string }[],
  rawId: string,
  lead?: any
) {
  const id = String(rawId || "");
  const byId = directory.find((person) => person.user_id === id);
  if (byId) return byId;
  const email = lead?.email || lead?.student_email || (id.includes("@") ? id : "");
  const byEmail = directory.find((person) => emailsMatch(person.email, email));
  if (byEmail) return byEmail;
  return null;
}

function pickDirectoryUser(
  directory: { user_id: string; email: string; name: string }[],
  preferredId: string,
  email?: string
) {
  const byId = directory.find((person) => person.user_id === String(preferredId || ""));
  if (byId) return byId;
  return directory.find((person) => emailsMatch(person.email, email)) || null;
}

async function mergeCounselorSqlShortlists(
  tables: Record<string, any[]>,
  authUsers: { id: string; email: string; user_metadata?: any }[]
) {
  const pool = getPool();
  const sql = await pool.query("SELECT * FROM university_shortlists");
  if (!sql.rows.length) return;

  const extraTables = await pool.query(
    "SELECT id, table_name, data FROM app_records WHERE table_name IN ('profiles', 'user_roles', 'student_leads')"
  );
  for (const row of extraTables.rows) {
    if (!tables[row.table_name]) tables[row.table_name] = [];
    const parsed = parseRecord(row.id, row.data);
    if (!tables[row.table_name].some((item) => String(item.id) === String(parsed.id))) {
      tables[row.table_name].push(parsed);
    }
  }

  const jsonLeads = tables.student_leads || [];
  let sqlLeads: any[] = [];
  try {
    sqlLeads = (await pool.query("SELECT * FROM student_leads")).rows;
  } catch {
    sqlLeads = [];
  }

  const profiles = tables.profiles || [];
  const directory = authUsers.map((user) => {
    const profile = profiles.find((row) => String(row.user_id) === String(user.id)) || {};
    const meta = user.user_metadata || {};
    return {
      user_id: String(user.id),
      email: String(user.email || "").toLowerCase(),
      name: personName({
        first_name: profile.first_name || meta.first_name,
        last_name: profile.last_name || meta.last_name,
      }),
    };
  });

  const allLeads = [...jsonLeads, ...sqlLeads];
  const resolveStudent = (rawId: string, emailHint = "") => {
    const id = String(rawId || "");
    const lead = allLeads.find(
      (row) =>
        String(row.id) === id ||
        String(row.user_id) === id ||
        emailsMatch(row.email, emailHint) ||
        emailsMatch(row.email, id)
    );
    return findStudentInDirectory(directory, id, { ...lead, email: emailHint || lead?.email });
  };

  if (!tables.university_shortlists) tables.university_shortlists = [];
  for (const row of sql.rows) {
    const existing = tables.university_shortlists.find((item) => String(item.id) === String(row.id));
    const student = resolveStudent(row.student_id, existing?.student_email || existing?.email || "");
    const kept = pickDirectoryUser(directory, existing?.student_id, existing?.student_email || existing?.email);
    const resolved = student || kept;
    const lead = allLeads.find(
      (item) => String(item.id) === String(row.student_id) || String(item.user_id) === String(row.student_id)
    );
    const now = asIso(row.created_at);
    const mapped = {
      id: String(row.id),
      student_id: resolved?.user_id || String(existing?.student_id || row.student_id || ""),
      student_email: resolved?.email || existing?.student_email || lead?.email || "",
      counselor_id: "local-counselor-1",
      university_id: row.university_id ? String(row.university_id) : `uni-${row.id}`,
      university_name: row.university_name || "",
      course_name: row.course_name || "",
      location: row.location || "",
      counselor_notes: row.counselor_notes || "",
      status: row.status || existing?.status || "recommended",
      priority_level: row.priority_level || existing?.priority_level || "medium",
      student_consent: Boolean(existing?.student_consent || row.student_consent),
      shortlisted_at: asIso(row.shortlisted_at || existing?.shortlisted_at || row.created_at),
      created_at: now,
      updated_at: now,
    };
    const index = tables.university_shortlists.findIndex((item) => String(item.id) === mapped.id);
    if (index >= 0) {
      tables.university_shortlists[index] = {
        ...tables.university_shortlists[index],
        ...mapped,
      };
    } else {
      tables.university_shortlists.push(mapped);
    }
    try {
      await pool.query(
        `INSERT INTO app_records (id, table_name, data)
         VALUES ($1, 'university_shortlists', $2::jsonb)
         ON CONFLICT (id) DO UPDATE SET data = EXCLUDED.data, table_name = EXCLUDED.table_name, updated_at = now()`,
        [mapped.id, JSON.stringify(mapped)]
      );
    } catch (error) {
      console.error("Could not persist counselor shortlist", mapped.id, error);
    }
  }

  try {
    if (!tables.student_leads) tables.student_leads = [];
    for (const row of sqlLeads) {
      const mappedLead = {
        ...row,
        id: String(row.id),
        user_id: row.user_id ? String(row.user_id) : null,
        email: row.email || "",
        created_at: asIso(row.created_at),
        updated_at: asIso(row.updated_at || row.created_at),
      };
      const leadIndex = tables.student_leads.findIndex((item) => String(item.id) === mappedLead.id);
      if (leadIndex >= 0) tables.student_leads[leadIndex] = { ...tables.student_leads[leadIndex], ...mappedLead };
      else tables.student_leads.push(mappedLead);
      await pool.query(
        `INSERT INTO app_records (id, table_name, data)
         VALUES ($1, 'student_leads', $2::jsonb)
         ON CONFLICT (id) DO UPDATE SET data = EXCLUDED.data, table_name = EXCLUDED.table_name, updated_at = now()`,
        [mappedLead.id, JSON.stringify(mappedLead)]
      ).catch(() => null);
    }
  } catch {
    // Student lead copy is optional.
  }
}

function normalizeSession(value: any) {
  if (value == null || value === "null") return null;
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value);
      return parsed && typeof parsed === "object" ? parsed : null;
    } catch {
      return null;
    }
  }
  if (typeof value === "object") return value;
  return null;
}

export async function readAuthState() {
  await ensureSchema();
  return { session: null };
}

export async function writeSession(_session: any) {
  await ensureSchema();
  await getPool().query(
    `INSERT INTO app_meta (key, value) VALUES ('session', 'null'::jsonb)
     ON CONFLICT (key) DO UPDATE SET value = 'null'::jsonb`
  );
}

export async function insertAuthUser(user: { id: string; email: string; password: string; user_metadata?: any }) {
  await ensureSchema();
  await getPool().query(
    "INSERT INTO auth_users (id, email, password, user_metadata) VALUES ($1, $2, $3, $4::jsonb)",
    [user.id, String(user.email || "").trim().toLowerCase(), hashPassword(user.password), JSON.stringify(user.user_metadata || {})]
  );
}

export async function updateAuthPassword(userId: string, password: string) {
  await ensureSchema();
  await getPool().query("UPDATE auth_users SET password = $1 WHERE id = $2", [hashPassword(password), userId]);
}

export async function readStorageFile(filePath: string) {
  await ensureSchema();
  const result = await getPool().query("SELECT data_url FROM app_storage WHERE path = $1", [filePath]);
  return result.rows[0]?.data_url || null;
}

export async function writeStorageFile(filePath: string, dataUrl: string) {
  await ensureSchema();
  await getPool().query(
    `INSERT INTO app_storage (path, data_url) VALUES ($1, $2)
     ON CONFLICT (path) DO UPDATE SET data_url = EXCLUDED.data_url`,
    [filePath, dataUrl]
  );
}

export async function deleteStorageFiles(paths: string[]) {
  if (!paths.length) return;
  await ensureSchema();
  await getPool().query("DELETE FROM app_storage WHERE path = ANY($1::text[])", [paths]);
}

function jsonSafe(_key: string, value: any) {
  if (typeof value === "bigint") return Number(value);
  if (value instanceof Date) return value.toISOString();
  return value;
}

type FilterSpec = {
  op: "eq" | "neq" | "in" | "is" | "contains" | "not" | "or";
  column?: string;
  value?: any;
  operator?: string;
  expression?: string;
};

function rowMatches(row: any, specs: FilterSpec[] = []) {
  return specs.every((spec) => {
    if (spec.op === "eq") {
      if (spec.value === false) return row?.[spec.column!] !== true && row?.[spec.column!] !== "true";
      if (spec.value === true) return row?.[spec.column!] === true || row?.[spec.column!] === "true";
      const actual = row?.[spec.column!];
      return actual === spec.value || String(actual) === String(spec.value);
    }
    if (spec.op === "neq") return row?.[spec.column!] !== spec.value;
    if (spec.op === "in") return Array.isArray(spec.value) && spec.value.includes(row?.[spec.column!]);
    if (spec.op === "is") return row?.[spec.column!] === spec.value;
    if (spec.op === "contains") {
      const current = row?.[spec.column!];
      return Array.isArray(current) && Array.isArray(spec.value) && spec.value.every((item: any) => current.includes(item));
    }
    if (spec.op === "not") {
      if (spec.operator === "is" && spec.value === null) return row?.[spec.column!] != null;
      return row?.[spec.column!] !== spec.value;
    }
    if (spec.op === "or") {
      const clauses = String(spec.expression || "").split(",").map((part) => part.trim());
      return clauses.some((clause) => {
        const ilike = clause.match(/^(.+)\.ilike\.%(.+)%$/);
        if (!ilike) return false;
        return String(row?.[ilike[1]] || "").toLowerCase().includes(ilike[2].toLowerCase());
      });
    }
    return true;
  });
}

export async function mutateAppState(mutation: {
  action: "insert" | "update" | "delete" | "upsert";
  table: string;
  rows?: any[];
  payload?: any;
  filters?: FilterSpec[];
  upsertConflict?: string;
}) {
  await ensureSchema();
  const client = await getPool().connect();
  const now = new Date().toISOString();
  try {
    await client.query("BEGIN");
    const existing = await client.query("SELECT id, data FROM app_records WHERE table_name = $1", [mutation.table]);
    const current = existing.rows.map((row) => ({ ...(row.data || {}), id: row.id }));

    if (mutation.action === "insert") {
      const items = (mutation.rows || []).map((item) => ({
        ...item,
        id: item.id || crypto.randomUUID(),
        created_at: item.created_at || now,
        updated_at: now,
      }));
      for (const item of items) {
        await client.query(
          "INSERT INTO app_records (id, table_name, data) VALUES ($1, $2, $3::jsonb) ON CONFLICT (id) DO UPDATE SET data = EXCLUDED.data, updated_at = now()",
          [item.id, mutation.table, JSON.stringify(item, jsonSafe)]
        );
      }
      await client.query("COMMIT");
      return { data: items.length === 1 ? items[0] : items, count: items.length };
    }

    if (mutation.action === "upsert") {
      const key = mutation.upsertConflict || "id";
      const items = (mutation.rows || []).map((item) => ({
        ...item,
        id: item.id || crypto.randomUUID(),
        created_at: item.created_at || now,
        updated_at: now,
      }));
      for (const item of items) {
        const found = current.find((row) => String(row[key] ?? "") === String(item[key] ?? ""));
        const next = found ? { ...found, ...item, id: found.id, updated_at: now } : item;
        await client.query(
          "INSERT INTO app_records (id, table_name, data) VALUES ($1, $2, $3::jsonb) ON CONFLICT (id) DO UPDATE SET data = EXCLUDED.data, updated_at = now()",
          [next.id, mutation.table, JSON.stringify(next, jsonSafe)]
        );
      }
      await client.query("COMMIT");
      return { data: items, count: items.length };
    }

    const matched = current.filter((row) => rowMatches(row, mutation.filters || []));

    if (mutation.action === "update") {
      const updated = [];
      for (const row of matched) {
        const next = { ...row, ...(mutation.payload || {}), id: row.id, updated_at: now };
        await client.query(
          "UPDATE app_records SET data = $2::jsonb, updated_at = now() WHERE id = $1",
          [row.id, JSON.stringify(next, jsonSafe)]
        );
        updated.push(next);
      }
      await client.query("COMMIT");
      return { data: updated, count: updated.length };
    }

    if (mutation.action === "delete") {
      for (const row of matched) {
        await client.query("DELETE FROM app_records WHERE id = $1", [row.id]);
      }
      await client.query("COMMIT");
      return { data: matched, count: matched.length };
    }

    await client.query("ROLLBACK");
    throw new Error(`Unsupported mutation: ${mutation.action}`);
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}

export async function writeAppState(state: any) {
  await ensureSchema();
  const client = await getPool().connect();
  try {
    await client.query("BEGIN");
    await client.query("DELETE FROM auth_users");
    await client.query("DELETE FROM app_records");
    if (state && Object.prototype.hasOwnProperty.call(state, "storage")) {
      await client.query("DELETE FROM app_storage");
    }
    await client.query("DELETE FROM app_meta");

    for (const user of state.authUsers || []) {
      await client.query(
        "INSERT INTO auth_users (id, email, password, user_metadata) VALUES ($1, $2, $3, $4)",
        [user.id, user.email, user.password, JSON.stringify(user.user_metadata || {})]
      );
    }

    for (const [tableName, rows] of Object.entries(state.tables || {})) {
      for (const row of rows as any[]) {
        const id = row.id || crypto.randomUUID();
        await client.query(
          "INSERT INTO app_records (id, table_name, data) VALUES ($1, $2, $3) ON CONFLICT (id) DO UPDATE SET data = EXCLUDED.data, updated_at = now()",
          [id, tableName, JSON.stringify({ ...row, id })]
        );
      }
    }

    for (const [filePath, dataUrl] of Object.entries(state.storage || {})) {
      await client.query(
        "INSERT INTO app_storage (path, data_url) VALUES ($1, $2)",
        [filePath, dataUrl]
      );
    }

    await client.query(
      "INSERT INTO app_meta (key, value) VALUES ('session', $1::jsonb)",
      [JSON.stringify(state.session ?? null)]
    );

    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}
