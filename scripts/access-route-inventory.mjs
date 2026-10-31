// ACCESS-03A: lists every HTTP route with the roles that may call it and whether its handler
// applies branch scope. Read-only. It parses source text, so it is a map to review, not a proof;
// the reviewed decisions live in server/lib/routeAccessMatrix.mjs, and tests/routeMatrix.test.mjs
// fails whenever this map and that matrix disagree.
//
//   node scripts/access-route-inventory.mjs [--json]
import { readFileSync, readdirSync } from "node:fs";

const ROLE_SETS = {
  ADMIN_ROLES: ["admin", "super_admin"],
  BRANCH_ADMIN_ROLES: ["admin", "super_admin", "branch_head"],
  STAFF_ROLES: ["admin", "super_admin", "branch_head", "counselor", "telecaller", "accountant"],
};
const ROLE_OF = { ADMIN: "admin", SUPER_ADMIN: "super_admin", BRANCH_HEAD: "branch_head", COUNSELOR: "counselor", TELECALLER: "telecaller", ACCOUNTANT: "accountant", STUDENT: "student", PARTNER: "partner" };
// Stacks exported by server/lib/auth.mjs
const SHARED = {
  adminAuth: ["admin", "super_admin", "branch_head"], branchAdminAuth: ["admin", "super_admin", "branch_head"], superAdminAuth: ["super_admin"],
  counselorAuth: ["counselor"], telecallerAuth: ["telecaller"], branchHeadAuth: ["branch_head", "admin", "super_admin"],
  accountantAuth: ["accountant", "admin", "super_admin"], studentAuth: ["student"], partnerAuth: ["partner"],
  staffAuth: ROLE_SETS.STAFF_ROLES, session: ["any signed-in"], anySession: ["any signed-in"],
};

function rolesFrom(text, local = {}) {
  const out = new Set();
  for (const [name, roles] of Object.entries({ ...ROLE_SETS, ...local })) if (new RegExp(`\\b${name}\\b`).test(text)) roles.forEach((r) => out.add(r));
  for (const m of text.matchAll(/ROLES\.([A-Z_]+)/g)) if (ROLE_OF[m[1]]) out.add(ROLE_OF[m[1]]);
  return [...out];
}

export function readRoutes() {
  const files = [...readdirSync("server/routes").filter((f) => f.endsWith(".mjs")).map((f) => `server/routes/${f}`), "server/index.mjs"];
  const START = /\b(?:router|app)\.(get|post|put|patch|delete)\(\s*(\[[^\]]*\]|(["'`])[^"'`]+\3)\s*,/g;
  const SCOPE_USE = /req\.scope|scopeClause|filterToScope|assertInScope|scopedRows|authorizeAccountAction|decideAccountAction/;
  const rows = [];
  for (const file of files) {
    const src = readFileSync(file, "utf8");
    // import aliases (adminAuth as auth) and file-local stacks (const commsAdmin = [session, requireRole(...)])
    const guards = {};
    const local = {};
    for (const c of src.matchAll(/^const (\w*ROLES) = \[([^\]]*)\];/gm)) local[c[1]] = rolesFrom(c[2], local);
    for (const a of src.matchAll(/\b(\w+(?:Auth|session))\s+as\s+(\w+)/g)) guards[a[2]] = SHARED[a[1]] || [];
    for (const g of src.matchAll(/^const (\w+) = \[([^]*?)\];/gm)) if (/requireRole\(/.test(g[2]) || /\bsession\b/.test(g[2])) guards[g[1]] = rolesFrom(g[2], local).length ? rolesFrom(g[2], local) : ["any signed-in"];
    for (const [k, v] of Object.entries(SHARED)) if (!guards[k]) guards[k] = v;
    // Helpers that read req.scope count as scope use when a handler calls them (e.g. studentInScope(req, id)).
    const fns = [...src.matchAll(/^(?:async )?function (\w+)\(([^)]*)\)\s*\{([^]*?)\n\}/gm)].map((h) => ({ name: h[1], body: h[3], takesReq: /\breq\b/.test(h[2]) }));
    const helpers = new Set(fns.filter((h) => h.takesReq && /req\.scope/.test(h.body)).map((h) => h.name));
    // follow calls: a helper that calls a scope-aware helper is scope-aware too
    for (let pass = 0; pass < 4; pass++) for (const h of fns) if (!helpers.has(h.name) && h.takesReq && [...helpers].some((n) => new RegExp(`\\b${n}\\(`).test(h.body))) helpers.add(h.name);
    const scopeUse = helpers.size ? new RegExp(`${SCOPE_USE.source}|\\b(?:${[...helpers].join("|")})\\(`) : SCOPE_USE;
    const starts = [...src.matchAll(START)];
    starts.forEach((m, i) => {
      const method = m[1].toUpperCase();
      const paths = [...m[2].matchAll(/["'`]([^"'`]+)["'`]/g)].map((p) => p[1]);
      const rest = src.slice(m.index + m[0].length, i + 1 < starts.length ? starts[i + 1].index : src.length);
      const head = rest.slice(0, 260);
      const inline = head.match(/requireRole\(\s*(\[[^\]]*\]|[A-Z_]+)\s*,/);
      const named = Object.keys(guards).find((g) => new RegExp(`\\b${g}\\b`).test(head));
      const who = inline ? rolesFrom(inline[1], local) : named ? guards[named] : ["public"];
      for (const path of paths) rows.push({ file: file.replace("server/", ""), method, path, key: `${method} ${path}`, who: who.length ? who : ["any signed-in"], scoped: scopeUse.test(rest) });
    });
  }
  // The student app's own HTTP layer (no Express router): /__auth, /__session, /__local_db, /__storage.
  {
    const file = "server/student/httpApi.ts";
    const src = readFileSync(file, "utf8");
    for (const m of src.matchAll(/url === "(\/__[a-z_]+)" && req\.method === "([A-Z]+)"/g)) {
      rows.push({ file: file.replace("server/", ""), method: m[2], path: m[1], key: `${m[2]} ${m[1]}`, who: m[1] === "/__auth" || m[1] === "/__public_media" ? ["public"] : ["any signed-in"], scoped: false });
    }
  }
  return rows;
}

if (process.argv[1]?.endsWith("access-route-inventory.mjs")) {
  const rows = readRoutes();
  if (process.argv.includes("--matrix")) {
    const { classifyAll } = await import("../server/lib/routeAccessMatrix.mjs");
    const m = classifyAll(rows);
    const count = (v) => m.filter((x) => x.verdict === v).length;
    const out = [
      "# ACCESS-03A: route action and target-scope matrix", "",
      "Generated by `node scripts/access-route-inventory.mjs --matrix`. Do not edit by hand: change `server/lib/routeAccessMatrix.mjs`.", "",
      `${m.length} routes: ${count("enforced")} enforced, ${count("ok")} ok, **${count("gap")} gaps**, **${count("decision")} decisions**, ${count("needs-review")} needing review.`, "",
    ];
    for (const verdict of ["gap", "decision", "needs-review", "enforced", "ok"]) {
      const list = m.filter((x) => x.verdict === verdict);
      if (!list.length) continue;
      out.push(`## ${verdict} (${list.length})`, "", "| Route | Action | Who may call | Target scope | Note |", "|---|---|---|---|---|");
      for (const x of list) out.push(`| \`${x.key}\` | ${x.action} | ${x.who.join(", ")} | ${x.scope} | ${x.note} |`);
      out.push("");
    }
    console.log(out.join("\n"));
  } else if (process.argv.includes("--json")) console.log(JSON.stringify(rows, null, 2));
  else {
    const adminish = (r) => r.who.some((w) => ["admin", "super_admin", "branch_head", "accountant", "any signed-in", "public"].includes(w));
    console.log(`${rows.length} routes; ${rows.filter(adminish).length} reachable by Admin-type or unrestricted callers.`);
    for (const r of rows.filter((x) => adminish(x) && !x.scoped)) console.log(`  ${r.method.padEnd(6)} ${r.path}  [${r.who.join("/")}] ${r.file}`);
  }
}