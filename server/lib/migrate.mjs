// Ordered, tracked migrations. The old portals each ran their own
// CREATE TABLE IF NOT EXISTS block at boot, in whatever order the services
// happened to start, against one shared database. That is what caused drift.
import { readFileSync, readdirSync } from "fs";
import path from "path";
import { pool } from "./db.mjs";
import { ROOT } from "./env.mjs";

const DIR = path.join(ROOT, "server", "migrations");

export async function migrate() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      name TEXT PRIMARY KEY,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);

  const applied = new Set(
    (await pool.query("SELECT name FROM schema_migrations")).rows.map((r) => r.name),
  );

  const files = readdirSync(DIR).filter((f) => f.endsWith(".sql")).sort();
  for (const file of files) {
    if (applied.has(file)) continue;
    const sql = readFileSync(path.join(DIR, file), "utf8");
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await client.query(sql);
      await client.query("INSERT INTO schema_migrations (name) VALUES ($1)", [file]);
      await client.query("COMMIT");
      console.log(`migrated: ${file}`);
    } catch (error) {
      await client.query("ROLLBACK");
      throw new Error(`Migration ${file} failed: ${error.message}`);
    } finally {
      client.release();
    }
  }
  return files.length - applied.size;
}
