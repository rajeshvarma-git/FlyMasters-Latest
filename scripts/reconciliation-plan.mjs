// ACCESS-02B: build and check the reconciliation plan. Reads and writes JSON files only.
//
//   node scripts/reconciliation-plan.mjs make  audit-local.json  --out plan.json
//   node scripts/reconciliation-plan.mjs check plan.json
//
// `make` never overwrites an existing --out file (so reviewer edits are not lost).
// `check` exits 1 until every entry is approved or rejected with full evidence.
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { buildPlan, summarizePlan, validatePlan } from "../server/lib/reconciliationPlan.mjs";

const [cmd, file, ...rest] = process.argv.slice(2);
const read = (f) => JSON.parse(readFileSync(f, "utf8"));

if (cmd === "make" && file) {
  const out = rest.includes("--out") ? rest[rest.indexOf("--out") + 1] : null;
  if (!out) { console.error("usage: make <audit.json> --out <plan.json>"); process.exit(2); }
  if (existsSync(out)) { console.error(`${out} already exists; not overwriting reviewer edits. Choose another name.`); process.exit(2); }
  const plan = buildPlan(read(file));
  writeFileSync(out, JSON.stringify(plan, null, 2));
  console.log(`plan written to ${out}:`, JSON.stringify(summarizePlan(plan)));
  console.log("Every entry is 'unresolved'. Fill in proposed / reason / status for each, then run: check", out);
} else if (cmd === "check" && file) {
  const plan = read(file);
  console.log(JSON.stringify(summarizePlan(plan)));
  const problems = validatePlan(plan);
  for (const p of problems) console.log(`- ${p.id}: ${p.problem}`);
  console.log(problems.length ? `\nNOT READY: ${problems.length} problem(s).` : "\nReady for ACCESS-02E.");
  process.exit(problems.length ? 1 : 0);
} else {
  console.error("usage:\n  make <audit.json> --out <plan.json>\n  check <plan.json>");
  process.exit(2);
}