// ACCESS-02E: apply an approved reconciliation plan. DRY RUN unless told otherwise.
//
//   node scripts/reconciliation-apply.mjs plan.json                       (dry run: changes nothing)
//   node scripts/reconciliation-apply.mjs plan.json --apply --confirm-db <database name>
//
// --apply refuses to run unless --confirm-db equals the database you are connected to, so a
// plan cannot be applied to the wrong environment by accident. A before/after log is written
// next to the plan (or --log file) so every change can be reversed by hand.
import pg from "pg";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { DATABASE_URL } from "../server/lib/env.mjs";
import { applyPlan } from "../server/lib/reconciliationApply.mjs";

const args = process.argv.slice(2);
const file = args.find((a) => !a.startsWith("--"));
const flag = (n) => (args.includes(n) ? args[args.indexOf(n) + 1] : null);
const apply = args.includes("--apply");
if (!file) { console.error("usage: reconciliation-apply.mjs <plan.json> [--apply --confirm-db <name>] [--log file]"); process.exit(2); }

const plan = JSON.parse(readFileSync(file, "utf8"));
const pool = new pg.Pool({ connectionString: DATABASE_URL });
try {
  const db = (await pool.query("SELECT current_database() AS db")).rows[0].db;
  if (apply && flag("--confirm-db") !== db) {
    console.error(`REFUSED: connected to database "${db}" but --confirm-db was "${flag("--confirm-db")}". Nothing changed.`);
    process.exit(2);
  }
  const logFile = flag("--log") || file.replace(/\.json$/, "") + (apply ? ".applied.json" : ".dryrun.json");
  if (apply && existsSync(logFile)) { console.error(`REFUSED: ${logFile} exists; choose another --log so an earlier record is not overwritten.`); process.exit(2); }

  const run = await applyPlan(pool, plan, { dryRun: !apply });
  if (!run.ok) {
    console.log("NOT APPLIED:", run.refused);
    for (const p of run.problems) console.log(`- ${p.id}: ${p.problem}`);
    process.exit(1);
  }
  writeFileSync(logFile, JSON.stringify({ database: db, at: new Date().toISOString(), dry_run: run.dryRun, results: run.results }, null, 2));
  console.log(`ACCESS-02E ${run.dryRun ? "DRY RUN (nothing changed)" : "APPLIED"} | db=${db}`);
  console.log(JSON.stringify(run.summary));
  for (const r of run.results.filter((x) => !["applied", "would_apply", "already_applied"].includes(x.outcome))) {
    console.log(`- ${r.id}: ${r.outcome} ${JSON.stringify(r.detail ?? "")}`);
  }
  console.log(`log: ${logFile}`);
  process.exit(run.results.some((r) => ["failed", "invalid", "stale"].includes(r.outcome)) ? 1 : 0);
} finally {
  await pool.end();
}