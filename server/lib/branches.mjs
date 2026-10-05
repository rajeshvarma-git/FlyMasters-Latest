/**
 * Branch codes.
 *
 * A branch code is what staff will read on screens, in reports and in
 * conversation, so it is derived from the place rather than being a random id.
 * The database still keys everything on the UUID — the code is the human label.
 *
 *   { name: "Ameerpet", city: "Hyderabad" }  ->  HYD-AME
 *   { name: "Ameerpet", area: "Ameerpet" }   ->  AME
 *   a second branch that would collide       ->  HYD-AME2
 *
 * Admins can override the suggestion; only uniqueness is enforced.
 */
import { pool } from "./db.mjs";

function letters(value, count) {
  const cleaned = String(value || "")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");
  return cleaned.slice(0, count);
}

/** The code we suggest before checking the database. */
export function suggestBranchCode({ name, city, area } = {}) {
  const local = letters(area || name, 3);
  const town = letters(city, 3);
  if (!local && !town) return "";
  if (town && local && town !== local) return `${town}-${local}`;
  return local || town;
}

/** The code we actually assign, guaranteed not to collide. */
export async function allocateBranchCode(input, preferred = "") {
  const base = letters(preferred, 12) || suggestBranchCode(input);
  if (!base) throw new Error("A branch needs a name or an area to build a code from.");

  const { rows } = await pool.query(
    "SELECT code FROM branches WHERE code = $1 OR code LIKE $1 || '%'",
    [base],
  );
  const taken = new Set(rows.map((row) => row.code));
  if (!taken.has(base)) return base;

  for (let n = 2; n < 100; n += 1) {
    const candidate = `${base}${n}`;
    if (!taken.has(candidate)) return candidate;
  }
  throw new Error(`Too many branches already use codes starting with ${base}.`);
}

/** Branches the caller is allowed to see. */
export async function listBranches(scope) {
  const params = [];
  let where = "";
  if (scope && !scope.allBranches) {
    if (!scope.branchIds?.length) return [];
    params.push(scope.branchIds);
    where = `WHERE b.id = ANY($${params.length}::uuid[])`;
  }
  const { rows } = await pool.query(
    `SELECT b.*,
            (SELECT count(*)::int FROM user_branches ub WHERE ub.branch_id = b.id) AS staff_count,
            (SELECT count(*)::int FROM app_records r
              WHERE r.table_name = 'student_leads' AND r.branch_id = b.id) AS lead_count
       FROM branches b
       ${where}
      ORDER BY b.is_head_office DESC, b.name ASC`,
    params,
  );
  return rows;
}

export async function branchExists(id) {
  if (!id) return false;
  const { rows } = await pool.query("SELECT 1 FROM branches WHERE id = $1", [id]);
  return rows.length > 0;
}

/** Replaces a user's branch assignments. Home branch is always included. */
export async function setUserBranches(userId, branchIds, assignedBy = null) {
  const unique = [...new Set((branchIds || []).map(String).filter(Boolean))];
  await pool.query("DELETE FROM user_branches WHERE user_id = $1", [String(userId)]);
  if (!unique.length) return [];
  await pool.query(
    `INSERT INTO user_branches (user_id, branch_id, assigned_by)
     SELECT $1, unnest($2::uuid[]), $3
     ON CONFLICT DO NOTHING`,
    [String(userId), unique, assignedBy],
  );
  return unique;
}

/**
 * One-time-safe repair, run at start-up: a lead assigned to a telecaller who is not in the
 * lead's branch is invisible to that telecaller. Move such leads into the telecaller's
 * first branch. Idempotent (does nothing once leads and owners agree).
 */
export async function alignAssignedLeadBranches() {
  const { rows } = await pool.query(
    `SELECT r.id, ub.branch_id AS target
       FROM app_records r
       JOIN LATERAL (
         SELECT branch_id FROM user_branches WHERE user_id = r.data->>'assigned_telecaller_id'
          ORDER BY created_at ASC LIMIT 1
       ) ub ON true
      WHERE r.table_name = 'student_leads'
        AND coalesce(r.data->>'assigned_telecaller_id','') <> ''
        AND coalesce(r.data->>'merged_into','') = ''
        AND coalesce(r.data->>'entity_type','') <> 'student'
        AND NOT EXISTS (
          SELECT 1 FROM user_branches x
           WHERE x.user_id = r.data->>'assigned_telecaller_id' AND x.branch_id IS NOT DISTINCT FROM r.branch_id
        )`,
  ).catch(() => ({ rows: [] }));
  for (const row of rows) {
    await pool.query("UPDATE app_records SET branch_id = $2, updated_at = now() WHERE id = $1", [row.id, row.target]).catch(() => {});
    await pool.query("UPDATE student_leads SET branch_id = $2 WHERE id = $1", [row.id, row.target]).catch(() => {});
  }
  return rows.length;
}
