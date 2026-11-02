// Super Admin hard-delete for leads/students, staff accounts and partners.
//
// Design rules:
//   * Everything runs in ONE transaction: it all goes or none of it does.
//   * The caller (route) writes the audit row with the snapshot returned here, so a delete is
//     recoverable by hand from audit_log even though nothing is "soft" deleted.
//   * It REFUSES (DeleteRefused, with an HTTP status) rather than orphaning money or work:
//       - a lead/student with a non-rejected partner commission
//       - a staff member who still owns leads or students
//       - a partner who has referrals or commissions (deactivate them instead)
//       - yourself, or another Super Admin
//   * Optional tables (older databases may lack a table or column) are skipped, not fatal.

export class DeleteRefused extends Error {
  constructor(message, status = 409) {
    super(message);
    this.status = status;
  }
}

const MISSING = new Set(["42P01", "42703"]); // undefined_table, undefined_column

/** Runs one statement under a savepoint so a missing optional table cannot abort the transaction. */
async function tryRun(db, sql, params = []) {
  await db.query("SAVEPOINT del_step");
  try {
    const result = await db.query(sql, params);
    await db.query("RELEASE SAVEPOINT del_step");
    return result;
  } catch (error) {
    await db.query("ROLLBACK TO SAVEPOINT del_step");
    await db.query("RELEASE SAVEPOINT del_step");
    if (MISSING.has(String(error?.code))) return { rows: [], rowCount: 0, skipped: true };
    throw error;
  }
}

const count = (r) => Number(r?.rowCount || 0);

export const DELETE_KINDS = ["lead", "student", "staff", "partner"];

// ----------------------------------------------------------------------------- leads / students
async function findLead(db, id) {
  const sql = await tryRun(db, "SELECT * FROM student_leads WHERE id::text = $1", [id]);
  const json = await tryRun(
    db,
    "SELECT id, data FROM app_records WHERE table_name = 'student_leads' AND (id = $1 OR data->>'id' = $1)",
    [id],
  );
  const sqlRow = sql.rows[0] || null;
  const jsonRow = json.rows[0] || null;
  if (!sqlRow && !jsonRow) return null;
  return { sqlRow, jsonRow };
}

export async function deleteLeadOrStudent(db, id) {
  const found = await findLead(db, id);
  if (!found) throw new DeleteRefused("That lead or student no longer exists.", 404);
  const { sqlRow, jsonRow } = found;
  const data = jsonRow?.data || {};

  const leadIds = [...new Set([id, sqlRow?.id, jsonRow?.id, data.id].filter(Boolean).map(String))];
  const userId = String(sqlRow?.user_id || data.user_id || "") || null;
  const keys = [...new Set([...leadIds, ...(userId ? [userId] : [])])];

  // Money first: never delete the lead that a partner commission points at.
  const owed = await tryRun(
    db,
    "SELECT count(*)::int AS n FROM partner_commissions WHERE lead_id::text = ANY($1::text[]) AND status <> 'rejected'",
    [leadIds],
  );
  if (Number(owed.rows[0]?.n || 0) > 0) {
    throw new DeleteRefused(
      "This student has a partner commission on record. Reject or settle the commission in Commissions first, then delete.",
    );
  }

  const snapshot = {
    lead: sqlRow || data,
    email: sqlRow?.email || data.email || null,
    userId,
  };

  const removed = {};
  // Everything in the JSON store that belongs to this person, except shared catalogues/settings.
  removed.records = count(await tryRun(
    db,
    `DELETE FROM app_records
      WHERE table_name NOT IN ('universities','university_programs','system_settings','knowledge_articles',
                               'document_checklists','user_roles','status_vocabulary')
        AND ( id = ANY($1::text[])
           OR data->>'lead_id'    = ANY($2::text[])
           OR data->>'student_id' = ANY($2::text[])
           OR ($3::text IS NOT NULL AND data->>'user_id' = $3::text) )`,
    [leadIds, keys, userId],
  ));

  // The SQL tables.
  removed.privateMessages = count(await tryRun(
    db,
    `DELETE FROM private_messages WHERE conversation_id IN
       (SELECT id FROM private_conversations WHERE student_id::text = ANY($1::text[]))`,
    [keys],
  ));
  removed.privateConversations = count(await tryRun(db, "DELETE FROM private_conversations WHERE student_id::text = ANY($1::text[])", [keys]));
  removed.shortlists = count(await tryRun(db, "DELETE FROM university_shortlists WHERE student_id::text = ANY($1::text[])", [keys]));
  if (userId) {
    removed.documents = count(await tryRun(db, "DELETE FROM documents WHERE user_id::text = $1", [userId]));
    removed.notifications = count(await tryRun(db, "DELETE FROM notifications WHERE user_id::text = $1", [userId]));
  }
  removed.leadRows = count(await tryRun(db, "DELETE FROM student_leads WHERE id::text = ANY($1::text[])", [leadIds]));

  // The portal login, but only if it really is a student's (never remove a staff account here).
  if (userId) {
    const role = await tryRun(db, "SELECT role FROM user_roles WHERE user_id = $1", [userId]);
    const roleName = role.rows[0]?.role;
    if (!roleName || roleName === "student") {
      await tryRun(db, "DELETE FROM auth_sessions WHERE user_id = $1", [userId]);
      await tryRun(db, "DELETE FROM user_roles WHERE user_id = $1", [userId]);
      await tryRun(db, "DELETE FROM user_branches WHERE user_id = $1", [userId]);
      removed.account = count(await tryRun(db, "DELETE FROM auth_users WHERE id = $1", [userId]));
    }
  }
  return { snapshot, removed };
}

// ----------------------------------------------------------------------------- staff
export async function deleteStaff(db, id, { actorId }) {
  if (String(id) === String(actorId)) throw new DeleteRefused("You cannot delete your own account.", 400);

  const acct = await tryRun(db, "SELECT id, email, user_metadata FROM auth_users WHERE id = $1", [id]);
  const counselor = await tryRun(db, "SELECT id, email FROM counselor_users WHERE id::text = $1", [id]);
  if (!acct.rows[0] && !counselor.rows[0]) throw new DeleteRefused("That employee no longer exists.", 404);

  const roleRow = await tryRun(db, "SELECT role FROM user_roles WHERE user_id = $1", [id]);
  const role = roleRow.rows[0]?.role || null;
  if (role === "super_admin") throw new DeleteRefused("A Super Admin account cannot be deleted from here.", 403);
  if (role === "student" || role === "partner") {
    throw new DeleteRefused("That account is not an employee. Delete it from Leads/Students or Agents & Freelancers.", 400);
  }

  // Work they still own: move it first, so nothing is left without an owner.
  const ownedJson = await tryRun(
    db,
    `SELECT count(*)::int AS n FROM app_records
      WHERE table_name = 'student_leads'
        AND (data->>'assigned_counselor_id' = $1 OR data->>'assigned_telecaller_id' = $1)`,
    [id],
  );
  const ownedSql = await tryRun(
    db,
    "SELECT count(*)::int AS n FROM student_leads WHERE assigned_counselor_id::text = $1 OR assigned_telecaller_id::text = $1",
    [id],
  );
  const owned = Number(ownedJson.rows[0]?.n || 0) + Number(ownedSql.rows[0]?.n || 0);
  if (owned > 0) {
    throw new DeleteRefused(
      `This employee still has ${owned} lead(s)/student(s) assigned. Transfer or reassign them first, then delete.`,
    );
  }

  const snapshot = { email: acct.rows[0]?.email || counselor.rows[0]?.email, role, metadata: acct.rows[0]?.user_metadata || {} };
  const removed = {};
  await tryRun(db, "DELETE FROM auth_sessions WHERE user_id = $1", [id]);
  removed.roles = count(await tryRun(db, "DELETE FROM user_roles WHERE user_id = $1", [id]));
  removed.branches = count(await tryRun(db, "DELETE FROM user_branches WHERE user_id = $1", [id]));
  // Their profile cards only. Case messages and conversation history stay with the student.
  removed.records = count(await tryRun(
    db,
    "DELETE FROM app_records WHERE table_name IN ('profiles','counselors','telecallers') AND (data->>'user_id' = $1 OR id = ANY($2::text[]))",
    [id, [`profile-${id}`, `counselor-${id}`, `telecaller-${id}`]],
  ));
  removed.counselorRow = count(await tryRun(db, "DELETE FROM counselor_users WHERE id::text = $1", [id]));
  removed.account = count(await tryRun(db, "DELETE FROM auth_users WHERE id = $1", [id]));
  // Attendance, leave and salary rows are deliberately KEPT: they are payroll history.
  return { snapshot, removed };
}

// ----------------------------------------------------------------------------- partners
export async function deletePartner(db, id) {
  const partner = await tryRun(db, "SELECT * FROM partners WHERE id::text = $1", [id]);
  if (!partner.rows[0]) throw new DeleteRefused("That agent or freelancer no longer exists.", 404);
  const p = partner.rows[0];

  const refs = await tryRun(
    db,
    `SELECT (SELECT count(*) FROM app_records WHERE referred_by_partner_id = $1::uuid)::int AS referrals,
            (SELECT count(*) FROM partner_commissions WHERE partner_id = $1::uuid)::int AS commissions`,
    [p.id],
  );
  const { referrals = 0, commissions = 0 } = refs.rows[0] || {};
  if (referrals > 0 || commissions > 0) {
    throw new DeleteRefused(
      `This partner has ${referrals} referred student(s) and ${commissions} commission record(s). Deactivate them instead so the history stays intact.`,
    );
  }

  const removed = {};
  if (p.user_id) {
    await tryRun(db, "DELETE FROM auth_sessions WHERE user_id = $1", [p.user_id]);
    await tryRun(db, "DELETE FROM user_roles WHERE user_id = $1", [p.user_id]);
    removed.account = count(await tryRun(db, "DELETE FROM auth_users WHERE id = $1", [p.user_id]));
  }
  await tryRun(db, "DELETE FROM referral_events WHERE partner_id = $1::uuid", [p.id]);
  removed.partner = count(await tryRun(db, "DELETE FROM partners WHERE id = $1::uuid", [p.id]));
  return { snapshot: { name: p.full_name, code: p.referral_code, email: p.email, type: p.type }, removed };
}

/** Runs a delete in a single transaction on a pooled client. */
export async function runDelete(pool, kind, id, { actorId }) {
  if (!DELETE_KINDS.includes(kind)) throw new DeleteRefused("Unknown kind of record.", 400);
  const db = await pool.connect();
  try {
    await db.query("BEGIN");
    const result = kind === "staff"
      ? await deleteStaff(db, id, { actorId })
      : kind === "partner"
        ? await deletePartner(db, id)
        : await deleteLeadOrStudent(db, id);
    await db.query("COMMIT");
    return result;
  } catch (error) {
    await db.query("ROLLBACK").catch(() => {});
    throw error;
  } finally {
    db.release();
  }
}
