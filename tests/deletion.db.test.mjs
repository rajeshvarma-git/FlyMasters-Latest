// Super Admin delete against a real PostgreSQL. Opt-in, like the other .db tests:
//   set TEST_DATABASE_URL=postgresql://user:pass@localhost:5432/anydb   (cmd)
//   npm test
// Works in a throwaway schema and drops it afterwards.
import test from "node:test";
import { randomBytes } from "node:crypto";
import pg from "pg";
import { SCHEMA, runScenarios } from "./deletion.scenarios.mjs";

const URL = process.env.TEST_DATABASE_URL;
const skip = URL ? false : "set TEST_DATABASE_URL to run the PostgreSQL checks";
const schema = `tdel_${randomBytes(4).toString("hex")}`;

test("super admin delete: refuses unsafe deletes, removes only the target's data", { skip }, async () => {
  const admin = new pg.Pool({ connectionString: URL });
  await admin.query(`CREATE SCHEMA ${schema}`);
  const pool = new pg.Pool({ connectionString: URL, options: `-c search_path=${schema}` });
  try {
    await pool.query(SCHEMA);
    await runScenarios(pool);
  } finally {
    await pool.end();
    await admin.query(`DROP SCHEMA ${schema} CASCADE`);
    await admin.end();
  }
});
