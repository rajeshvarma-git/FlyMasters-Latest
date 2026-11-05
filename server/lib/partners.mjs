/**
 * Agents and Freelancers.
 *
 * One entity, two types, per the client's decision and the CRM document's
 * combined Agent/Freelancer persona. They never self-register: an admin
 * creates the partner record, and only a Super Admin may attach a login
 * ("upon activation from super admin only").
 */
import crypto from "crypto";
import { pool } from "./db.mjs";

/** Referral codes people type or read aloud: no 0/O/1/I ambiguity. */
const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

function randomSuffix(length = 4) {
  const bytes = crypto.randomBytes(length);
  let out = "";
  for (let i = 0; i < length; i += 1) out += ALPHABET[bytes[i] % ALPHABET.length];
  return out;
}

function nameStem(value) {
  return String(value || "")
    .toUpperCase()
    .replace(/[^A-Z]/g, "")
    .slice(0, 4) || "PTNR";
}

/** e.g. Rajesh Kumar -> RAJE-7K2M */
export async function allocateReferralCode(name) {
  const stem = nameStem(name);
  for (let attempt = 0; attempt < 12; attempt += 1) {
    const code = `${stem}-${randomSuffix()}`;
    const { rows } = await pool.query("SELECT 1 FROM partners WHERE upper(referral_code) = $1", [code]);
    if (!rows.length) return code;
  }
  throw new Error("Could not allocate a unique referral code. Try a different name.");
}

/** Resolve a code a student typed, or one that arrived on a /r/<CODE> link. */
export async function partnerByCode(code) {
  const cleaned = String(code || "").trim().toUpperCase();
  if (!cleaned) return null;
  const { rows } = await pool.query(
    `SELECT * FROM partners
      WHERE upper(referral_code) = $1
        AND is_active
        AND verification_status IN ('pending', 'verified')`,
    [cleaned],
  );
  return rows[0] || null;
}

export async function partnerForUser(userId) {
  const { rows } = await pool.query("SELECT * FROM partners WHERE user_id = $1", [String(userId)]);
  return rows[0] || null;
}

/**
 * Attach a referral code to a lead.
 *
 * The attribution rule, which is a business rule rather than a technical one:
 *   - first valid code wins
 *   - accepted while nobody has taken ownership of the lead
 *   - recorded but NOT paid once a counsellor or telecaller already owns it
 *   - a partner cannot refer themselves
 *
 * Every attempt is written to referral_events, including the refusals, so a
 * commission dispute has evidence instead of two people remembering
 * differently.
 */
export async function attachReferral(leadId, code, { source = "chat", lead = null } = {}) {
  const partner = await partnerByCode(code);
  const record = async (outcome, reason, partnerId = null) => {
    await pool.query(
      `INSERT INTO referral_events (lead_id, partner_id, code, source, outcome, reason)
       VALUES ($1::uuid, $2, $3, $4, $5, $6)`,
      [isUuid(leadId) ? leadId : null, partnerId, String(code || ""), source, outcome, reason],
    ).catch(() => {});
    return { ok: outcome === "captured", outcome, reason, partner: partnerId ? partner : null };
  };

  if (!partner) return record("rejected_unknown", "No active partner has that code.");

  const { rows } = await pool.query(
    "SELECT data, referred_by_partner_id FROM app_records WHERE id = $1 AND table_name = 'student_leads'",
    [String(leadId)],
  );
  const row = rows[0];
  const data = row?.data || lead || {};

  if (row?.referred_by_partner_id) {
    return record("rejected_duplicate", "This lead already has a referral.", partner.id);
  }

  const email = String(data.email || "").trim().toLowerCase();
  const phone = String(data.phone || "").replace(/\D/g, "");
  if (
    (email && email === String(partner.email || "").trim().toLowerCase()) ||
    (phone && phone.length > 6 && phone === String(partner.phone || "").replace(/\D/g, ""))
  ) {
    return record("rejected_self", "A partner cannot refer themselves.", partner.id);
  }

  const owned = Boolean(data.assigned_counselor_id || data.assigned_telecaller_id);
  if (owned) {
    // Visible and disputable, but not payable. This is the line to check with
    // the client before go-live: it decides whether agents feel cheated or
    // branch staff feel robbed of leads they generated themselves.
    return record("rejected_owned", "A counsellor or telecaller already owns this lead.", partner.id);
  }

  // Doc 6.1: "If an Agent or Freelancer is assigned to a specific branch, the
  // referral link can automatically connect the student to that branch's lead
  // pool." So attribution moves the lead into the partner's branch — otherwise
  // the referral lands wherever it was typed and the branch that owns the
  // relationship never sees it.
  //
  // The attribution and its referral_events row go in ONE transaction. This decides whether a partner
  // is paid, so an attribution with no event row would be a claim with no trail, and an event row with
  // no attribution would be a trail to nothing. The UPDATE also clears the pending marker a sign-up
  // leaves behind (see referral_code_submitted in studentAuth.ts) and refuses to overwrite an
  // attribution that landed first, so two attempts at once cannot both believe they won.
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const updated = await client.query(
      `UPDATE app_records
          SET referred_by_partner_id = $2,
              referral_code_entered  = $3,
              referral_source        = $4,
              branch_id              = COALESCE($5::uuid, branch_id),
              data                   = data - 'referral_code_submitted',
              updated_at = now()
        WHERE id = $1 AND table_name = 'student_leads' AND referred_by_partner_id IS NULL`,
      [String(leadId), partner.id, String(code).toUpperCase(), source, partner.branch_id || null],
    );
    if (!updated.rowCount) {
      await client.query("ROLLBACK");
      return record("rejected_duplicate", "This lead already has a referral.", partner.id);
    }
    await client.query(
      `INSERT INTO referral_events (lead_id, partner_id, code, source, outcome, reason)
       VALUES ($1::uuid, $2, $3, $4, 'captured', NULL)`,
      [isUuid(leadId) ? leadId : null, partner.id, String(code || ""), source],
    );
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    throw error;
  } finally {
    client.release();
  }
  return { ok: true, outcome: "captured", reason: null, partner };
}

/**
 * Attributes referrals whose sign-up attribution never landed.
 *
 * A sign-up stores the code it was given on the lead (`referral_code_submitted`) inside the sign-up
 * transaction, then attributes it afterwards so a bad code cannot block the sign-up. When that second
 * step fails for an infrastructure reason, the marker is what is left to work from. This walks those
 * leads and tries again. It skips any lead that already has a referral, so it never overwrites an
 * attribution a person made by hand, and it is safe to run as often as you like.
 */
export async function recoverPendingReferrals({ limit = 200 } = {}) {
  const { rows } = await pool.query(
    `SELECT id, data->>'referral_code_submitted' AS code
       FROM app_records
      WHERE table_name = 'student_leads'
        AND referred_by_partner_id IS NULL
        AND NULLIF(trim(data->>'referral_code_submitted'), '') IS NOT NULL
      ORDER BY created_at ASC
      LIMIT $1`,
    [Math.max(1, Math.min(1000, Number(limit) || 200))],
  );
  const report = { considered: rows.length, captured: 0, rejected: 0, failed: 0, outcomes: {} };
  for (const row of rows) {
    try {
      const result = await attachReferral(row.id, row.code, { source: "recovery" });
      report.outcomes[result.outcome] = (report.outcomes[result.outcome] || 0) + 1;
      if (result.ok) report.captured += 1;
      else report.rejected += 1;
    } catch (error) {
      // The marker stays, so the next run tries again rather than losing the referral.
      report.failed += 1;
      console.error("referral recovery failed for lead", row.id, error?.message || error);
    }
  }
  return report;
}

function isUuid(value) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(value || ""));
}

/**
 * Raise a commission when a referred lead converts.
 *
 * Recorded as pending; never paid automatically. A human approves every payout
 * — the document requires it and so does anyone who has watched an automated
 * commission engine pay the wrong person.
 */
export async function raiseCommissionForLead(leadId, { branchId = null, studentName = "" } = {}) {
  const { rows } = await pool.query(
    "SELECT referred_by_partner_id, branch_id, data FROM app_records WHERE id = $1 AND table_name = 'student_leads'",
    [String(leadId)],
  );
  const lead = rows[0];
  if (!lead?.referred_by_partner_id) return null;

  const existing = await pool.query(
    "SELECT id FROM partner_commissions WHERE partner_id = $1 AND lead_id = $2::uuid",
    [lead.referred_by_partner_id, isUuid(leadId) ? leadId : null],
  ).catch(() => ({ rows: [] }));
  if (existing.rows[0]) return existing.rows[0];

  const { rows: partnerRows } = await pool.query("SELECT * FROM partners WHERE id = $1", [lead.referred_by_partner_id]);
  const partner = partnerRows[0];
  if (!partner) return null;

  const name = studentName ||
    [lead.data?.first_name, lead.data?.last_name].filter(Boolean).join(" ") ||
    lead.data?.email || "Referred student";

  const { rows: created } = await pool.query(
    `INSERT INTO partner_commissions (partner_id, lead_id, amount, branch_id, student_name, status)
     VALUES ($1, $2::uuid, $3, $4, $5, 'pending')
     RETURNING *`,
    [
      partner.id,
      isUuid(leadId) ? leadId : null,
      // per_lead and per_enrollment are flat amounts, so the figure is known
      // the moment the commission is raised. percent_of_fee needs the
      // student's actual fee, which finance fills in on review.
      ["per_lead", "per_enrollment"].includes(partner.commission_basis) ? partner.commission_rate : 0,
      // The partner's branch owns the commission: that branch's accountant is
      // the one who reviews and pays it.
      partner.branch_id || branchId || lead.branch_id || null,
      name,
    ],
  );
  return created[0];
}

/** Partners the caller may see. Branch-scoped for everyone below admin. */
export async function listPartners(scope) {
  const params = [];
  let where = "";
  if (scope && !scope.allBranches) {
    if (!scope.branchIds?.length) return [];
    params.push(scope.branchIds);
    where = `WHERE p.branch_id = ANY($${params.length}::uuid[])`;
  }
  const { rows } = await pool.query(
    `SELECT p.*,
            b.name AS branch_name,
            b.code AS branch_code,
            (SELECT count(*)::int FROM app_records r
              WHERE r.table_name = 'student_leads' AND r.referred_by_partner_id = p.id) AS referred_count,
            (SELECT count(*)::int FROM partner_commissions c
              WHERE c.partner_id = p.id AND c.status = 'pending') AS pending_commissions
       FROM partners p
       LEFT JOIN branches b ON b.id = p.branch_id
       ${where}
      ORDER BY p.created_at DESC`,
    params,
  );
  return rows;
}
