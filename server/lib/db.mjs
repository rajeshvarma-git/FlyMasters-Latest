import pg from "pg";
import { DATABASE_URL, IS_PRODUCTION } from "./env.mjs";

export const pool = new pg.Pool({
  connectionString: DATABASE_URL,
  ssl:
    IS_PRODUCTION && !/127\.0\.0\.1|localhost/.test(DATABASE_URL)
      ? { rejectUnauthorized: false }
      : undefined,
  max: Number(process.env.PG_POOL_MAX || 10),
  idleTimeoutMillis: 30000,
});

pool.on("error", (error) => {
  console.error("Postgres pool error:", error.message || error);
});

/**
 * The legacy portals stored most domain data as JSONB blobs in `app_records`
 * (table_name, data) and then filtered in JavaScript. That is kept here for
 * compatibility, but reads are now scoped in SQL rather than by loading the
 * whole table into memory on every request.
 */

/**
 * user_roles moved out of the JSONB blob store into a real table in migration
 * 002, because `session` reads it on every request and the old path loaded the
 * whole table and searched it in JavaScript.
 *
 * Seventeen call sites across the ported routes still read and write it through
 * jsonTable/jsonUpsert, so those two functions redirect for this one table name
 * instead of every caller being rewritten. Same API, indexed lookup, one source
 * of truth for authorisation.
 */
async function readUserRoles() {
  const result = await pool.query(
    "SELECT user_id, role, branch_id, is_active, created_at FROM user_roles ORDER BY created_at DESC",
  );
  return result.rows.map((row) => ({
    id: `role-${row.user_id}`,
    user_id: row.user_id,
    role: row.role,
    branch_id: row.branch_id,
    is_active: row.is_active,
    created_at: row.created_at,
  }));
}

async function writeUserRole(data) {
  const userId = String(data.user_id || "");
  if (!userId) throw new Error("user_roles requires user_id");
  const result = await pool.query(
    `INSERT INTO user_roles (user_id, role, branch_id)
     VALUES ($1, $2, COALESCE($3::uuid, (SELECT id FROM branches WHERE code = 'HO')))
     ON CONFLICT (user_id) DO UPDATE
       SET role = EXCLUDED.role,
           branch_id = COALESCE(EXCLUDED.branch_id, user_roles.branch_id),
           updated_at = now()
     RETURNING user_id, role, branch_id, is_active, created_at`,
    [userId, String(data.role || "student"), data.branch_id || null],
  );
  const row = result.rows[0];
  return { id: `role-${row.user_id}`, ...row };
}

export async function jsonTable(tableName, { limit = null } = {}) {
  if (tableName === "user_roles") return readUserRoles();
  const sql = limit
    ? "SELECT id, data, created_at FROM app_records WHERE table_name = $1 ORDER BY created_at DESC LIMIT $2"
    : "SELECT id, data, created_at FROM app_records WHERE table_name = $1 ORDER BY created_at DESC";
  const params = limit ? [tableName, limit] : [tableName];
  const result = await pool.query(sql, params);
  return result.rows.map((row) => ({ id: row.id, ...row.data, created_at: row.created_at }));
}

export async function jsonFind(tableName, field, value) {
  const result = await pool.query(
    "SELECT id, data, created_at FROM app_records WHERE table_name = $1 AND data->>$2 = $3 LIMIT 1",
    [tableName, field, String(value)],
  );
  const row = result.rows[0];
  return row ? { id: row.id, ...row.data, created_at: row.created_at } : null;
}

export async function jsonUpsert(tableName, data) {
  if (tableName === "user_roles") return writeUserRole(data);
  const id = String(data.id || "");
  const payload = { ...data };
  delete payload.created_at;
  const result = await pool.query(
    `INSERT INTO app_records (id, table_name, data)
     VALUES (COALESCE(NULLIF($1, ''), gen_random_uuid()::text), $2, $3::jsonb)
     ON CONFLICT (id) DO UPDATE SET data = app_records.data || EXCLUDED.data, updated_at = now()
     RETURNING id, data, created_at`,
    [id, tableName, JSON.stringify(payload)],
  );
  const row = result.rows[0];
  return { id: row.id, ...row.data, created_at: row.created_at };
}

export async function withTransaction(fn) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await fn(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}
