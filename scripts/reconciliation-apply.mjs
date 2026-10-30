// ACCESS-02E: apply an approved reconciliation plan. DRY RUN unless told otherwise.
//
//   node scripts/reconciliation-apply.mjs plan.json                       (dry run: changes nothing)
//   node scripts/reconciliation-apply.mjs plan.json --apply --confirm-db <database name>
//
// The plan records the database (host, port, name) its audit came from; it is refused for any
// other database. --apply also needs --confirm-db to equal the connected database name.
// Every change is written to a journal (<plan>.applied.jsonl) and fsynced BEFORE it is committed,
// so evidence exists even if this process is killed; if the journal cannot be written, that
// entry is rolled back and the run stops.
import pg from "pg";
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync, existsSync, openSync, writeSync, fsyncSync, closeSync } from "node:fs";
import { DATABASE_URL } from "../server/lib/env.mjs";
import { applyPlan } from "../server/lib/reconciliationApply.mjs";
import { targetIdentity } from "../server/lib/targetIdentity.mjs";

const args = process.argv.slice(2);
const file = args.find((a) => !a.startsWith("--"));
const flag = (n) => (args.includes(n) ? args[args.indexOf(n) + 1] : null);
const apply = args.includes("--apply");
if (!file) { console.error("usage: reconciliation-apply.mjs <plan.json> [--apply --confirm-db <name>] [--log file]"); process.exit(2); }

const raw = readFileSync(file);
const plan = JSON.parse(raw.toString("utf8"));
const pool = new pg.Pool({ connectionString: DATABASE_URL });
let fd = null;
try {
  const db = (await pool.query("SELECT current_database() AS db")).rows[0].db;
  const target = targetIdentity({ url: DATABASE_URL, database: db });
  if (apply && flag("--confirm-db") !== db) {
    console.error(`REFUSED: connected to database "${db}" but --confirm-db was "${flag("--confirm-db")}". Nothing changed.`);
    process.exit(2);
  }
  const logFile = flag("--log") || file.replace(/\.json$/, "") + (apply ? ".applied.jsonl" : ".dryrun.json");
  if (apply && existsSync(logFile)) { console.error(`REFUSED: ${logFile} exists; choose another --log so an earlier record is not overwritten.`); process.exit(2); }

  let journal;
  if (apply) {
    fd = openSync(logFile, "wx");
    const write = (obj) => { writeSync(fd, JSON.stringify({ at: new Date().toISOString(), ...obj }) + "\n"); fsyncSync(fd); };
    write({ event: "start", database: target, plan_sha256: createHash("sha256").update(raw).digest("hex") });
    journal = {
      prepared: async (r) => write({ event: "prepared", ...r }),   // before/after, written before COMMIT
      committed: async (r) => write({ event: "committed", ...r }),
    };
  }

  const run = await applyPlan(pool, plan, { dryRun: !apply, target, journal });
  if (!run.ok) {
    console.log("NOT APPLIED:", run.refused);
    for (const p of run.problems) console.log(`- ${p.id}: ${p.problem}`);
    process.exit(1);
  }
  if (apply) { writeSync(fd, JSON.stringify({ at: new Date().toISOString(), event: "finished", halted: run.halted, summary: run.summary }) + "\n"); fsyncSync(fd); }
  else writeFileSync(logFile, JSON.stringify({ database: target, at: new Date().toISOString(), dry_run: true, results: run.results }, null, 2));
  console.log(`ACCESS-02E ${run.dryRun ? "DRY RUN (nothing changed)" : "APPLIED"} | db=${db}`);
  console.log(JSON.stringify(run.summary));
  for (const r of run.results.filter((x) => !["applied", "would_apply", "already_applied"].includes(x.outcome))) {
    console.log(`- ${r.id}: ${r.outcome} ${JSON.stringify(r.detail ?? "")}`);
  }
  if (run.halted) console.log("STOPPED EARLY: the change journal could not be written. Fix the disk or path, then re-run; finished entries are skipped as already_applied.");
  console.log(`log: ${logFile}`);
  process.exit(run.halted || run.results.some((r) => ["failed", "invalid", "stale"].includes(r.outcome)) ? 1 : 0);
} finally {
  if (fd !== null) closeSync(fd);
  await pool.end();
}