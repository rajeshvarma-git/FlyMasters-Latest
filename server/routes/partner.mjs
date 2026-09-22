/**
 * Agent / Freelancer portal API.
 *
 * Everything here is filtered by req.partner.id. There is no branch fallback
 * and no "all" case: an agent sees the students they referred and nothing
 * else, which is exactly what the CRM document requires —
 *
 *   "An Agent who refers five students can see only those five linked
 *    students... cannot view students referred by other Agents, branch-wide
 *    student lists, or all students in the system."
 */
import express from "express";
import { pool } from "../lib/db.mjs";
import { partnerAuth } from "../lib/auth.mjs";

const router = express.Router();

/**
 * The stages an agent is allowed to see, in the document's own words:
 * "application submitted, offer received, visa processing in progress, visa
 * approved, commission pending, invoice uploaded, commission paid".
 *
 * Deliberately coarse. An agent gets progress, not the counsellor's notes.
 */
function publicStage(lead) {
  const stage = String(lead.lead_stage || lead.lead_status || "").toLowerCase();
  const converted = lead.entity_type === "student" || stage === "converted";
  if (stage.includes("visa")) return "Visa processing";
  if (stage.includes("offer")) return "Offer received";
  if (stage.includes("applic")) return "Application submitted";
  if (converted) return "Enrolled";
  if (stage.includes("hot")) return "In discussion";
  return "New";
}

router.get("/api/partner/me", partnerAuth, async (req, res) => {
  const p = req.partner;
  const { rows: branch } = await pool.query("SELECT name, code FROM branches WHERE id = $1", [p.branch_id]).catch(() => ({ rows: [] }));
  res.json({
    partner: {
      id: p.id,
      type: p.type,
      name: p.full_name,
      businessName: p.business_name,
      code: p.referral_code,
      email: p.email,
      phone: p.phone,
      branch: branch?.[0] || null,
      commissionBasis: p.commission_basis,
      commissionRate: p.commission_rate,
      verification: p.verification_status,
      canViewStudentStatus: p.can_view_student_status,
      // Doc 6.1: the shareable link that ties a signup back to this partner.
      referralLink: `/r/${p.referral_code}`,
    },
  });
});

/** The students this partner referred. Nobody else's, ever. */
router.get("/api/partner/referrals", partnerAuth, async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT id, data, created_at
         FROM app_records
        WHERE table_name = 'student_leads'
          AND referred_by_partner_id = $1
        ORDER BY created_at DESC`,
      [req.partner.id],
    );

    const referrals = rows.map((row) => {
      const lead = row.data || {};
      const base = {
        id: row.id,
        name: [lead.first_name, lead.last_name].filter(Boolean).join(" ") || "Unnamed",
        country: lead.field_of_interest || (lead.preferred_countries || [])[0] || "",
        referredOn: row.created_at,
      };
      // Doc 6.0: status is shown "only when Super Admin has enabled this
      // visibility for that Agent or Freelancer account".
      if (!req.partner.can_view_student_status) return base;
      return { ...base, stage: publicStage(lead) };
    });

    res.json({ referrals, statusVisible: req.partner.can_view_student_status });
  } catch (error) {
    res.status(500).json({ error: error.message || "Could not load referrals" });
  }
});

/** Commission records plus the accounting notes marked visible to partners. */
router.get("/api/partner/commissions", partnerAuth, async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT c.*,
              COALESCE(
                (SELECT json_agg(json_build_object(
                          'id', n.id, 'type', n.note_type, 'body', n.body, 'created_at', n.created_at)
                        ORDER BY n.created_at DESC)
                   FROM commission_notes n
                  WHERE n.commission_id = c.id AND n.visible_to_partner),
                '[]'::json) AS notes
         FROM partner_commissions c
        WHERE c.partner_id = $1
        ORDER BY c.created_at DESC`,
      [req.partner.id],
    );
    res.json({ commissions: rows });
  } catch (error) {
    res.status(500).json({ error: error.message || "Could not load commissions" });
  }
});

/**
 * Upload an invoice against an eligible commission.
 *
 * Doc 6.1: "Once a commission becomes eligible, the Agent or Freelancer can
 * upload an invoice against the linked student record."
 *
 * Stored in app_storage as a data URL, matching how every other document in
 * this system is held. Only the partner's own commissions, and only while the
 * accounting team has not already closed them.
 */
router.post("/api/partner/commissions/:id/invoice", partnerAuth, async (req, res) => {
  try {
    const dataUrl = String(req.body.dataUrl || "");
    if (!dataUrl.startsWith("data:")) return res.status(400).json({ error: "Attach a PDF or image of the invoice." });
    if (dataUrl.length > 8_000_000) return res.status(400).json({ error: "Invoice is too large. Keep it under about 6 MB." });

    const { rows } = await pool.query(
      "SELECT * FROM partner_commissions WHERE id = $1 AND partner_id = $2",
      [req.params.id, req.partner.id],
    );
    const commission = rows[0];
    if (!commission) return res.status(404).json({ error: "Commission not found." });
    if (["paid", "closed"].includes(commission.invoice_status)) {
      return res.status(400).json({ error: "This commission is already closed." });
    }

    const path = `invoices/${req.partner.id}/${commission.id}.bin`;
    await pool.query(
      "INSERT INTO app_storage (path, data_url) VALUES ($1,$2) ON CONFLICT (path) DO UPDATE SET data_url = EXCLUDED.data_url",
      [path, dataUrl],
    );
    await pool.query(
      `UPDATE partner_commissions
          SET invoice_path = $2, invoice_status = 'received', invoice_uploaded_at = now()
        WHERE id = $1`,
      [commission.id, path],
    );
    res.json({ ok: true, invoiceStatus: "received" });
  } catch (error) {
    res.status(500).json({ error: error.message || "Could not upload invoice" });
  }
});

export default router;
