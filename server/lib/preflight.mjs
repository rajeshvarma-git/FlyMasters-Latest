/**
 * Boot-time self-check.
 *
 * The four old services failed silently in ways nobody saw until a user hit
 * them: a missing role row, a lead with no branch, a password still stored in
 * plaintext. This prints the state of those things on every boot so a bad
 * deploy is visible in the Railway log instead of in a support call.
 *
 * Read-only. It never blocks startup.
 */
import { existsSync } from "fs";
import path from "path";
import { pool } from "./db.mjs";
import { ROOT, IS_PRODUCTION, JWT_SECRET } from "./env.mjs";

const WEAK_SECRETS = [
  "flymasters-admin-dev-secret",
  "flymasters-counselor-dev-secret",
  "flymasters-local-dev-only-secret",
  "change-me",
];

export async function preflight() {
  const lines = [];
  const warnings = [];

  if (WEAK_SECRETS.includes(JWT_SECRET)) {
    warnings.push(
      "JWT_SECRET is one of the old hardcoded development values. It was published " +
        "in railway.toml in a public repository. Rotate it in Railway Variables.",
    );
  }

  if (!existsSync(path.join(ROOT, "dist", "index.html"))) {
    warnings.push("dist/index.html is missing — the frontend was not built. Run `npm run build`.");
  }

  try {
    const [users, roles, orphans, plaintext, leads, unbranched, partners] = await Promise.all([
      pool.query("SELECT count(*)::int AS n FROM auth_users"),
      pool.query("SELECT role, count(*)::int AS n FROM user_roles GROUP BY role ORDER BY role"),
      pool.query(
        "SELECT count(*)::int AS n FROM auth_users u WHERE NOT EXISTS (SELECT 1 FROM user_roles r WHERE r.user_id = u.id)",
      ),
      pool.query("SELECT count(*)::int AS n FROM auth_users WHERE password NOT LIKE 'scrypt:%'"),
      pool.query("SELECT count(*)::int AS n FROM student_leads"),
      pool.query("SELECT count(*)::int AS n FROM student_leads WHERE branch_id IS NULL"),
      pool.query("SELECT count(*)::int AS n FROM partners"),
    ]);

    lines.push(`accounts: ${users.rows[0].n}`);
    lines.push(`roles: ${roles.rows.map((r) => `${r.role}=${r.n}`).join(" ") || "none"}`);
    lines.push(`leads: ${leads.rows[0].n}`);
    lines.push(`partners: ${partners.rows[0].n}`);

    if (orphans.rows[0].n > 0) {
      warnings.push(
        `${orphans.rows[0].n} account(s) have no row in user_roles. They will be treated as students. ` +
          "Run migration 002 or assign roles in the admin portal.",
      );
    }
    if (plaintext.rows[0].n > 0) {
      warnings.push(
        `${plaintext.rows[0].n} account(s) still have a non-scrypt password. The student sign-in path ` +
          "accepts these and upgrades them on next login; the staff path rejects them. " +
          "Ask those users to sign in, or reset them.",
      );
    }
    if (unbranched.rows[0].n > 0) {
      warnings.push(
        `${unbranched.rows[0].n} lead(s) have no branch_id. Branch-scoped roles will not see them.`,
      );
    }
  } catch (error) {
    warnings.push(`preflight queries failed: ${error.message || error}`);
  }

  console.log(`[preflight] ${lines.join("  |  ")}`);
  for (const warning of warnings) console.warn(`[preflight] WARNING: ${warning}`);
  if (!warnings.length) console.log("[preflight] no warnings");

  return { lines, warnings };
}
