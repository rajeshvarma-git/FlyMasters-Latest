// ACCESS-02A: read-only account consistency audit.
//
//   node scripts/audit-accounts.mjs [--out report.json] [--show-emails]
//
// Makes NO changes. All reads run in one READ ONLY, REPEATABLE READ transaction,
// so every check sees the same snapshot and Postgres rejects any write.
// Emails are masked unless --show-emails is given. Passwords, tokens, documents
// and conversation content are never selected.
import pg from "pg";
import { execSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import { DATABASE_URL } from "../server/lib/env.mjs";
import { analyzeAccounts, summarize } from "../server/lib/accountConsistency.mjs";
import { targetIdentity } from "../server/lib/targetIdentity.mjs";

const args = process.argv.slice(2);
const outFile = args.includes("--out") ? args[args.indexOf("--out") + 1] : null;
const showEmails = args.includes("--show-emails");
const maskEmail = (email) => {
  if (!email || showEmails) return email ?? null;
  const [local, domain = ""] = String(email).split("@");
  return `${local.slice(0, 1)}***@${domain}`;
};

const client = new pg.Client({ connectionString: DATABASE_URL });
await client.connect();
let report;
try {
  await client.query("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY");
  const rows = async (sql) => (await client.query(sql)).rows;

  const [meta] = await rows("SELECT now() AS at, current_database() AS db");
  const snapshot = {
    accounts: await rows("SELECT id, email FROM auth_users"),
    sqlRoles: await rows("SELECT user_id, role, branch_id, is_active FROM user_roles"),
    jsonRoles: await rows("SELECT id AS record_id, data->>'user_id' AS user_id, data->>'role' AS role FROM app_records WHERE table_name = 'user_roles'"),
    memberships: await rows("SELECT user_id, branch_id FROM user_branches"),
    branches: await rows("SELECT id, is_active FROM branches"),
    profiles: await rows("SELECT data->>'user_id' AS user_id, data->>'is_active' AS is_active, data->>'disabled' AS disabled, data->>'role' AS role FROM app_records WHERE table_name = 'profiles' AND COALESCE(data->>'user_id','') <> ''"),
    counselorRecords: await rows("SELECT id, data->>'user_id' AS user_id FROM app_records WHERE table_name = 'counselors' AND COALESCE(data->>'user_id','') <> ''"),
    counselorLogins: await rows("SELECT id::text AS id, email FROM counselor_users"),
  };
  await client.query("ROLLBACK");

  let commit = "unknown";
  try { commit = execSync("git rev-parse HEAD", { stdio: ["ignore", "pipe", "ignore"] }).toString().trim(); } catch {}

  const findings = analyzeAccounts(snapshot, { maskEmail });
  report = {
    generated_at: meta.at,
    database: meta.db,
    target: targetIdentity({ url: DATABASE_URL, database: meta.db }),
    code_commit: commit,
    totals: Object.fromEntries(Object.entries(snapshot).map(([k, v]) => [k, v.length])),
    summary: summarize(findings),
    findings,
  };
} finally {
  await client.end();
}

if (outFile) writeFileSync(outFile, JSON.stringify(report, null, 2));
console.log(`ACCESS-02A audit | db=${report.database} | ${new Date(report.generated_at).toISOString()} | commit=${report.code_commit.slice(0, 7)}`);
console.log(Object.entries(report.totals).map(([k, v]) => `${k}=${v}`).join(" ") + "\n");
for (const s of report.summary) console.log(`${s.count ? "!!" : "ok"} [${s.severity.padEnd(6)}] ${s.code}: ${s.count}  - ${s.title}`);
if (!outFile) console.log("\nRe-run with --out report.json for per-account detail.");