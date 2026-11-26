/**
 * The student's first chat asks "which branch is easiest for you to visit?".
 *
 * A student cannot set a branch from the browser (branch is a staff-controlled field on their lead), so the
 * choice goes through here:
 *  - only ACTIVE branches can be chosen;
 *  - skipping, or not choosing, puts the student in Head Office;
 *  - it only applies while nobody has the case yet (no telecaller or counselor assigned) or the lead still has
 *    no branch, so a student can never pull a case out of a branch that is already working on it;
 *  - the lead and the student's profile are stamped together and the choice is kept on the record.
 */

/** Active branches a student may pick, Head Office first. */
export async function listChoosableBranches(pool) {
  const result = await pool.query(
    `SELECT id, name, code, area, city, is_head_office
       FROM branches
      WHERE is_active
      ORDER BY is_head_office DESC, name ASC`,
  );
  return result.rows.map((row) => ({
    id: String(row.id),
    name: row.name,
    area: row.area || row.city || "",
    isHeadOffice: Boolean(row.is_head_office),
  }));
}

/**
 * @param {import("pg").Pool} pool
 * @param {{userId: string, email?: string, role: string}} viewer
 * @param {string|null|undefined} branchId  null/empty = the student skipped
 */
export async function chooseBranchForStudent(pool, viewer, branchId) {
  if (!viewer || viewer.role !== "student") {
    return { status: 403, body: { error: "Only a student can choose a branch here." } };
  }

  const skipped = !branchId;
  const branch = skipped
    ? (await pool.query("SELECT id, name FROM branches WHERE is_head_office AND is_active ORDER BY created_at LIMIT 1")).rows[0]
    : (await pool.query("SELECT id, name FROM branches WHERE id::text = $1 AND is_active", [String(branchId)])).rows[0];
  if (!branch) {
    return {
      status: skipped ? 409 : 400,
      body: { error: skipped ? "Head Office is not set up yet." : "That branch is not available. Please pick another." },
    };
  }

  const email = String(viewer.email || "").trim().toLowerCase();
  const leads = await pool.query(
    `SELECT id, branch_id, data
       FROM app_records
      WHERE table_name = 'student_leads'
        AND (data->>'user_id' = $1 OR ($2 <> '' AND lower(data->>'email') = $2))`,
    [String(viewer.userId), email],
  );
  if (!leads.rows.length) {
    return { status: 404, body: { error: "Your details are not saved yet. Please answer the earlier questions first." } };
  }

  const stamp = { branch_choice: skipped ? "skipped" : "chosen", branch_chosen_at: new Date().toISOString() };
  let changed = 0;
  for (const row of leads.rows) {
    const untouched = !row.data?.assigned_telecaller_id && !row.data?.assigned_counselor_id;
    if (row.branch_id && !untouched) continue; // staff already own this case in a branch
    await pool.query(
      "UPDATE app_records SET branch_id = $2::uuid, data = data || $3::jsonb, updated_at = now() WHERE id = $1",
      [row.id, String(branch.id), JSON.stringify(stamp)],
    );
    changed += 1;
  }

  // The profile carries the choice too (so the chat does not ask again) and the branch if it has none.
  await pool.query(
    `UPDATE app_records
        SET branch_id = COALESCE(branch_id, $2::uuid), data = data || $3::jsonb, updated_at = now()
      WHERE table_name = 'profiles' AND data->>'user_id' = $1`,
    [String(viewer.userId), String(branch.id), JSON.stringify(stamp)],
  ).catch(() => null);

  return {
    status: 200,
    body: { ok: true, branch: { id: String(branch.id), name: branch.name }, skipped, changed },
  };
}
