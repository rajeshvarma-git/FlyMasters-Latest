// Creates the FIRST Super Admin on a database that has none.
//
// Every account-creating route needs a signed-in Super Admin or Admin, so a brand-new database has
// nobody who can create an Admin and employee onboarding cannot start. Run this once per database.
//
//   node scripts/bootstrap-super-admin.mjs --email boss@example.com --name "First Boss"
//
// The password is NOT a command-line argument, because arguments end up in shell history and in the
// process list. Put it in the environment for the one command:
//
//   PowerShell:   $env:BOOTSTRAP_PASSWORD = "..."; node scripts/bootstrap-super-admin.mjs --email boss@example.com
//   bash:         BOOTSTRAP_PASSWORD='...' node scripts/bootstrap-super-admin.mjs --email boss@example.com
//
// It reads DATABASE_URL the same way the server does, so point it at the database you mean. It
// refuses if that database already has a Super Admin (--allow-additional overrides), and it refuses
// to promote an existing account: change a role from the admin screens, where it is audited.
import { pool } from "../server/lib/db.mjs";
import { bootstrapSuperAdmin } from "../server/lib/bootstrapSuperAdmin.mjs";

const args = process.argv.slice(2);
const value = (flag) => {
  const i = args.indexOf(flag);
  return i >= 0 ? args[i + 1] : undefined;
};
const has = (flag) => args.includes(flag);

if (has("--help") || has("-h")) {
  console.log(`
Create the first Super Admin.

  --email <address>        required
  --name "First Last"      optional, shown in the portal
  --allow-additional       create one even though the database already has a Super Admin
  --help                   this text

The password comes from the BOOTSTRAP_PASSWORD environment variable, minimum 12 characters.
`.trim());
  process.exit(0);
}

const email = value("--email");
const name = String(value("--name") || "").trim();
const [firstName = "", ...rest] = name ? name.split(/\s+/) : [];
const password = process.env.BOOTSTRAP_PASSWORD || "";

if (!email) {
  console.error("Give --email. Run with --help for the full usage.");
  process.exit(2);
}
if (!password) {
  console.error("Set BOOTSTRAP_PASSWORD in the environment. It is not taken as an argument, so it stays out of shell history.");
  process.exit(2);
}

try {
  const result = await bootstrapSuperAdmin(pool, {
    email,
    password,
    firstName,
    lastName: rest.join(" "),
    allowAdditional: has("--allow-additional"),
  });
  console.log(`Created Super Admin ${result.email} (id ${result.id}).`);
  console.log("Sign in on the staff page with that email and the password you set, then change it from the portal.");
  process.exit(0);
} catch (error) {
  console.error(`Could not create the Super Admin: ${error?.message || error}`);
  process.exit(1);
} finally {
  await pool.end().catch(() => {});
}
