// The first Super Admin.
//
// Nothing in the application or the migrations creates one: every account-creating route requires a
// signed-in Super Admin or Admin, so a brand-new database has nobody who can create an Admin and
// employee onboarding cannot start on it. This is the one-off path that breaks that circle, meant to
// be run once per database from scripts/bootstrap-super-admin.mjs.
//
// It is deliberately narrow:
//   * it refuses when the database already has a Super Admin, unless explicitly told otherwise;
//   * it refuses to turn an existing account into a Super Admin, so it can never be used to escalate
//     an ordinary account (use the application's own role change for that, where it is audited);
//   * it writes through createAccount, the canonical account writer, so the login, role and branch
//     memberships are created in one transaction exactly as the admin screens would;
//   * it records a super_admin.bootstrap row in audit_log, without the password.
//
// A Super Admin is global, so it is created with no branch: `needsBranch` excludes the role, and
// pinning one to a single branch would quietly limit what the account can see.
import crypto from "crypto";
import { createAccount, AccountWriteError } from "./accountWrites.mjs";
import { hashPassword } from "./password.mjs";
import { jsonUpsert } from "./db.mjs";

const MIN_PASSWORD = 12;

export async function bootstrapSuperAdmin(pool, {
  email,
  password,
  firstName = "",
  lastName = "",
  allowAdditional = false,
} = {}) {
  const address = String(email || "").trim().toLowerCase();
  const secret = String(password || "");

  if (!address || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(address)) {
    throw new AccountWriteError(400, "Give a valid email address for the first Super Admin.");
  }
  if (secret.length < MIN_PASSWORD) {
    throw new AccountWriteError(400, `The password must be at least ${MIN_PASSWORD} characters.`);
  }

  const existingSupers = await pool.query("SELECT user_id FROM user_roles WHERE role = 'super_admin' LIMIT 1");
  if (existingSupers.rows[0] && !allowAdditional) {
    throw new AccountWriteError(
      409,
      "This database already has a Super Admin. Sign in as that account to create more, or pass --allow-additional if you are certain.",
    );
  }

  const existingAccount = await pool.query("SELECT id FROM auth_users WHERE lower(email) = $1 LIMIT 1", [address]);
  if (existingAccount.rows[0]) {
    throw new AccountWriteError(
      409,
      "An account with that email already exists. This path only creates a new account; change an existing account's role from the admin screens, where it is audited.",
    );
  }

  const id = crypto.randomUUID();
  const created = await createAccount(pool, {
    id,
    email: address,
    passwordHash: hashPassword(secret),
    metadata: { first_name: String(firstName || ""), last_name: String(lastName || "") },
    role: "super_admin",
    branchIds: [],
    assignedBy: null,
  });

  // Without a profile row the portal shows a blank name; the admin screens write one too.
  await jsonUpsert("profiles", {
    id: crypto.randomUUID(),
    user_id: id,
    first_name: String(firstName || ""),
    last_name: String(lastName || ""),
    phone: "",
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  });

  // Audited like any other account creation, minus the password. No request exists here, so the
  // actor is the bootstrap itself rather than a person.
  await pool.query(
    `INSERT INTO audit_log (actor_id, actor_role, branch_id, action, entity, entity_id, detail, ip)
     VALUES (NULL, 'bootstrap', NULL, 'super_admin.bootstrap', 'auth_users', $1, $2::jsonb, NULL)`,
    [id, JSON.stringify({ email: address, additional: Boolean(existingSupers.rows[0]) })],
  );

  return { created: true, id, email: address, branchIds: created.branchIds };
}
