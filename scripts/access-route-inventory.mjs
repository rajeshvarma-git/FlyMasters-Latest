// ACCESS-03A: lists every HTTP route with who may call it and whether its handler applies branch
// scope. Read-only; it parses source text, so the result is a map to review, not a proof.
//
//   node scripts/access-route-inventory.mjs [--json]
import { readFileSync, readdirSync } from "node:fs";

const files = [...readdirSync("server/routes").filter((f) => f.endsWith(".mjs")).map((f) => `server/routes/${f}`), "server/index.mjs"];
const ROUTE = /\b(?:router|app)\.(get|post|put|patch|delete)\(\s*(["'`])([^"'`]+)\2\s*,([^]*?)(?=\b(?:router|app)\.(?:get|post|put|patch|delete|use)\(|$)/g;
const GUARDS = ["superAdminAuth", "adminAuth", "branchAdminAuth", "branchHeadAuth", "accountantAuth", "counselorAuth", "telecallerAuth", "staffAuth", "studentAuth", "partnerAuth", "auth", "session", "anySession"];
const SCOPE_USE = /req\.scope|scopeClause|filterToScope|assertInScope|branchIdsFor|visibleBranch/;

const rows = [];
for (const file of files) {
  const src = readFileSync(file, "utf8");
  for (const m of src.matchAll(ROUTE)) {
    const [, method, , path, rest] = m;
    const head = rest.slice(0, 220);
    const alias = [...src.matchAll(/\b(\w+Auth|session|anySession)\s+as\s+(\w+)/g)].reduce((o, a) => ({ ...o, [a[2]]: a[1] }), {});
    const named = Object.keys(alias).find((a) => new RegExp(`\\b${a}\\b`).test(head));
    const inline = head.match(/requireRole\(\s*(\[[^\]]*\]|[A-Z_]+)\s*,/);
    const guard = named ? alias[named] : inline ? `requireRole${inline[1].replace(/\s+/g, "")}` : (GUARDS.find((g) => new RegExp(`\\b${g}\\b`).test(head)) || "none");
    rows.push({ file: file.replace("server/", ""), method: method.toUpperCase(), path, guard, scoped: SCOPE_USE.test(rest) ? "yes" : "no" });
  }
}
if (process.argv.includes("--json")) console.log(JSON.stringify(rows, null, 2));
else {
  const by = {};
  for (const r of rows) by[r.guard] = (by[r.guard] || 0) + 1;
  console.log(`${rows.length} routes. By guard:`, JSON.stringify(by));
  console.log(`Admin-reachable (adminAuth/branchAdminAuth/branchHeadAuth/accountantAuth/staffAuth/auth) with NO branch-scope use in the handler:`);
  for (const r of rows.filter((x) => (["adminAuth", "branchAdminAuth", "branchHeadAuth", "accountantAuth", "staffAuth"].includes(x.guard) || x.guard.startsWith("requireRole")) && x.scoped === "no")) console.log(`  ${r.method.padEnd(6)} ${r.path}  [${r.guard}] ${r.file}`);
}