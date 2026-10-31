// ACCESS-03B rollout check (read-only): which Admin accounts would lose all branch access if
// ADMIN_SCOPE_ENFORCED were switched on, and what each Admin would see.
//
//   node scripts/admin-scope-check.mjs
//
// Nothing is changed. Fix every "NO BRANCH" line (Users -> branches) BEFORE enabling the switch;
// the intended branches must be confirmed by a person, never guessed.
import pg from "pg";
import { DATABASE_URL } from "../server/lib/env.mjs";

const client = new pg.Client({ connectionString: DATABASE_URL });
await client.connect();
try {
  await client.query("BEGIN READ ONLY");
  const { rows } = await client.query(`
    SELECT u.id, u.email, r.is_active, r.branch_id AS home,
           COALESCE(array_agg(b.code ORDER BY b.code) FILTER (WHERE b.code IS NOT NULL), '{}') AS branches
      FROM user_roles r
      JOIN auth_users u ON u.id = r.user_id
 LEFT JOIN user_branches ub ON ub.user_id = r.user_id
 LEFT JOIN branches b ON b.id = ub.branch_id
     WHERE r.role = 'admin'
  GROUP BY u.id, u.email, r.is_active, r.branch_id
  ORDER BY u.email`);
  await client.query("ROLLBACK");
  const mask = (e) => `${String(e).slice(0, 1)}***@${String(e).split("@")[1] || ""}`;
  let none = 0;
  for (const a of rows) {
    const has = a.branches.length > 0 || a.home;
    if (!has) none++;
    console.log(`${has ? "ok       " : "NO BRANCH"}  ${mask(a.email)}  ${a.is_active === false ? "(disabled) " : ""}branches: ${a.branches.join(", ") || "none"}`);
  }
  console.log(`\n${rows.length} admin account(s); ${none} would have NO branch access once ADMIN_SCOPE_ENFORCED=true.`);
  console.log(none ? "Do not enable the switch yet." : "Every admin has a branch. Review the lists above, then the switch can be enabled on staging.");
} finally {
  await client.end();
}