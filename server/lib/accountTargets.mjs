// ACCESS-03: the facts a policy decision needs about an existing account, read from SQL only.
// Returns null when the account does not exist.
const unique = (list) => [...new Set(list.filter(Boolean).map(String))];

export async function loadAccountTarget(db, id) {
  const account = await db.query("SELECT id, lower(email) AS email FROM auth_users WHERE id = $1", [String(id)]);
  if (!account.rows[0]) return null;
  const [role, memberships, leads] = await Promise.all([
    db.query("SELECT role, branch_id FROM user_roles WHERE user_id = $1", [String(id)]),
    db.query("SELECT branch_id FROM user_branches WHERE user_id = $1", [String(id)]),
    db.query(
      `SELECT DISTINCT branch_id FROM app_records
        WHERE table_name = 'student_leads' AND branch_id IS NOT NULL
          AND (data->>'user_id' = $1 OR ($2 <> '' AND lower(data->>'email') = $2))`,
      [String(id), account.rows[0].email || ""],
    ),
  ]);
  return {
    id: String(id),
    role: role.rows[0]?.role ?? null,
    branchIds: unique([role.rows[0]?.branch_id, ...memberships.rows.map((r) => r.branch_id)]),
    leadBranchIds: unique(leads.rows.map((r) => r.branch_id)),
  };
}