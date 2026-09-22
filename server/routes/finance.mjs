/**
 * Accountant API — CRM document section 7.
 *
 * "The Accountant manages finance-related operations in the CRM, including
 *  student payments, partner commissions, invoice reviews, payout tracking,
 *  accounting notes, and finance reporting across assigned branches."
 *
 * Accountants are branch-scoped like any other staff role, and are refused
 * /api/state entirely — 7.3 says they "cannot change student application
 * status, visa status, counselling ownership, or admission decisions", so they
 * are not given the screens that would let them.
 */
import express from "express";
import { pool } from "../lib/db.mjs";
import { ROLES, ADMIN_ROLES, session, requireRole, branchScope, audit } from "../lib/auth.mjs";

const router = express.Router();

/** Accountants, plus admins and super admins who oversee them. */
const financeAuth = [session, requireRole([ROLES.ACCOUNTANT, ...ADMIN_ROLES], "Finance"), branchScope];

function scoped(scope, column = "branch_id") {
  if (!scope || scope.allBranches) return { clause: "", params: [] };
  return { clause: ` AND ${column} = ANY($1::uuid[])`, params: [scope.branchIds] };
}

// ---------------------------------------------------------------------------
// Commissions
// ---------------------------------------------------------------------------

/**
 * Doc 7.2: "Review Agent and Freelancer commission eligibility based on linked
 * students, application progress, visa status, enrolment status, agreed
 * commission rules, and approval requirements."
 */
router.get("/api/finance/commissions", financeAuth, async (req, res) => {
  try {
    const { clause, params } = scoped(req.scope, "c.branch_id");
    const { rows } = await pool.query(
      `SELECT c.*,
              p.full_name     AS partner_name,
              p.business_name AS partner_business,
              p.type          AS partner_type,
              p.referral_code AS partner_code,
              p.commission_basis,
              p.commission_rate,
              b.name AS branch_name,
              b.code AS branch_code,
              COALESCE(
                (SELECT json_agg(json_build_object(
                          'id', n.id, 'type', n.note_type, 'body', n.body,
                          'visible_to_partner', n.visible_to_partner,
                          'author_role', n.author_role, 'created_at', n.created_at)
                        ORDER BY n.created_at DESC)
                   FROM commission_notes n WHERE n.commission_id = c.id),
                '[]'::json) AS notes
         FROM partner_commissions c
         JOIN partners p ON p.id = c.partner_id
         LEFT JOIN branches b ON b.id = c.branch_id
        WHERE TRUE ${clause}
        ORDER BY c.created_at DESC`,
      params,
    );
    res.json({ commissions: rows });
  } catch (error) {
    res.status(500).json({ error: error.message || "Could not load commissions" });
  }
});

/**
 * Doc 7.2: mark invoices "received, under review, clarification required,
 * approved, on hold, rejected, paid, or closed", and record payout references
 * and payment confirmations.
 *
 * Nothing here pays anybody. It records that a human decided to.
 */
router.patch("/api/finance/commissions/:id", financeAuth, async (req, res) => {
  try {
    const { rows: found } = await pool.query(
      "SELECT * FROM partner_commissions WHERE id = $1", [req.params.id],
    );
    const commission = found[0];
    if (!commission) return res.status(404).json({ error: "Commission not found." });
    if (!req.scope.allBranches && !req.scope.branchIds.includes(String(commission.branch_id || ""))) {
      return res.status(403).json({ error: "That commission belongs to another branch." });
    }

    const fields = [];
    const params = [req.params.id];
    const push = (column, value) => { params.push(value); fields.push(`${column} = $${params.length}`); };

    if (req.body.invoiceStatus !== undefined) push("invoice_status", req.body.invoiceStatus);
    if (req.body.amount !== undefined) push("amount", Number(req.body.amount) || 0);
    if (req.body.payoutReference !== undefined) push("payout_reference", req.body.payoutReference);

    if (req.body.status !== undefined) {
      push("status", req.body.status);
      if (req.body.status === "approved") {
        push("approved_by", req.user.id);
        push("approved_at", new Date().toISOString());
      }
      if (req.body.status === "paid") push("paid_at", new Date().toISOString());
    }

    if (!fields.length) return res.status(400).json({ error: "Nothing to update." });

    const { rows } = await pool.query(
      `UPDATE partner_commissions SET ${fields.join(", ")} WHERE id = $1 RETURNING *`,
      params,
    );
    await audit(req, "commission.update", "partner_commissions", req.params.id, req.body);
    res.json({ commission: rows[0] });
  } catch (error) {
    res.status(500).json({ error: error.message || "Could not update commission" });
  }
});

/**
 * Doc 7.2: notes, remarks, clarification requests, hold reasons, tax notes,
 * payout references and payment confirmations, "visible to authorized Admins,
 * Super Admin, and relevant Agent/Freelancer accounts".
 *
 * Visibility is per note. A hold reason recorded internally is not the same
 * thing as a clarification sent to the partner, and conflating them is how
 * internal remarks end up in front of the person they are about.
 */
router.post("/api/finance/commissions/:id/notes", financeAuth, async (req, res) => {
  try {
    const body = String(req.body.body || "").trim();
    if (!body) return res.status(400).json({ error: "Write the note first." });

    const { rows: found } = await pool.query(
      "SELECT branch_id FROM partner_commissions WHERE id = $1", [req.params.id],
    );
    if (!found[0]) return res.status(404).json({ error: "Commission not found." });
    if (!req.scope.allBranches && !req.scope.branchIds.includes(String(found[0].branch_id || ""))) {
      return res.status(403).json({ error: "That commission belongs to another branch." });
    }

    const { rows } = await pool.query(
      `INSERT INTO commission_notes (commission_id, author_id, author_role, note_type, body, visible_to_partner)
       VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
      [
        req.params.id, req.user.id, req.user.role,
        String(req.body.noteType || "note"), body,
        // A clarification request is pointless if the partner cannot read it.
        req.body.visibleToPartner === true || req.body.noteType === "clarification",
      ],
    );
    await audit(req, "commission.note", "partner_commissions", req.params.id, { noteType: req.body.noteType });
    res.json({ note: rows[0] });
  } catch (error) {
    res.status(500).json({ error: error.message || "Could not add note" });
  }
});

/** The invoice the partner uploaded, for review. */
router.get("/api/finance/commissions/:id/invoice", financeAuth, async (req, res) => {
  try {
    const { rows } = await pool.query(
      "SELECT invoice_path, branch_id FROM partner_commissions WHERE id = $1", [req.params.id],
    );
    const row = rows[0];
    if (!row?.invoice_path) return res.status(404).json({ error: "No invoice uploaded." });
    if (!req.scope.allBranches && !req.scope.branchIds.includes(String(row.branch_id || ""))) {
      return res.status(403).json({ error: "That commission belongs to another branch." });
    }
    const { rows: file } = await pool.query("SELECT data_url FROM app_storage WHERE path = $1", [row.invoice_path]);
    if (!file[0]) return res.status(404).json({ error: "Invoice file is missing." });
    res.json({ dataUrl: file[0].data_url });
  } catch (error) {
    res.status(500).json({ error: error.message || "Could not load invoice" });
  }
});

// ---------------------------------------------------------------------------
// Student payments — doc 7.2
// ---------------------------------------------------------------------------

router.get("/api/finance/payments", financeAuth, async (req, res) => {
  try {
    const { clause, params } = scoped(req.scope);
    const { rows } = await pool.query(
      `SELECT * FROM student_payments WHERE TRUE ${clause} ORDER BY created_at DESC`, params,
    );
    res.json({ payments: rows });
  } catch (error) {
    res.status(500).json({ error: error.message || "Could not load payments" });
  }
});

router.post("/api/finance/payments", financeAuth, async (req, res) => {
  try {
    const branchId = req.body.branchId || (req.scope.allBranches ? null : req.scope.branchId);
    if (!req.scope.allBranches && !req.scope.branchIds.includes(String(branchId || ""))) {
      return res.status(403).json({ error: "You can only record payments for your own branches." });
    }
    const { rows } = await pool.query(
      `INSERT INTO student_payments
         (student_id, lead_id, branch_id, payment_type, amount, currency, status, receipt_ref, due_date, notes, recorded_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *`,
      [
        req.body.studentId || null, req.body.leadId || null, branchId,
        req.body.paymentType || "service_fee", Number(req.body.amount) || 0,
        req.body.currency || "INR", req.body.status || "due",
        req.body.receiptRef || null, req.body.dueDate || null,
        req.body.notes || null, req.user.id,
      ],
    );
    await audit(req, "payment.create", "student_payments", rows[0].id, { amount: rows[0].amount });
    res.json({ payment: rows[0] });
  } catch (error) {
    res.status(500).json({ error: error.message || "Could not record payment" });
  }
});

router.patch("/api/finance/payments/:id", financeAuth, async (req, res) => {
  try {
    const fields = [];
    const params = [req.params.id];
    for (const [key, column] of [["status", "status"], ["amount", "amount"], ["receiptRef", "receipt_ref"], ["notes", "notes"]]) {
      if (req.body[key] === undefined) continue;
      params.push(req.body[key]);
      fields.push(`${column} = $${params.length}`);
    }
    if (req.body.status === "paid") fields.push("paid_at = now()");
    if (!fields.length) return res.status(400).json({ error: "Nothing to update." });

    const { rows } = await pool.query(
      `UPDATE student_payments SET ${fields.join(", ")} WHERE id = $1 RETURNING *`, params,
    );
    if (!rows[0]) return res.status(404).json({ error: "Payment not found." });
    await audit(req, "payment.update", "student_payments", req.params.id, req.body);
    res.json({ payment: rows[0] });
  } catch (error) {
    res.status(500).json({ error: error.message || "Could not update payment" });
  }
});

// ---------------------------------------------------------------------------
// Finance summary — doc 7.2 "branch-wise and organization-level finance
// reports for commissions, pending invoices, paid invoices, student payments,
// outstanding balances".
// ---------------------------------------------------------------------------

router.get("/api/finance/summary", financeAuth, async (req, res) => {
  try {
    const { clause, params } = scoped(req.scope);
    const [commissions, invoices, payments] = await Promise.all([
      pool.query(
        `SELECT status, count(*)::int AS n, COALESCE(sum(amount),0)::numeric AS total
           FROM partner_commissions WHERE TRUE ${clause} GROUP BY status`, params),
      pool.query(
        `SELECT invoice_status, count(*)::int AS n
           FROM partner_commissions WHERE TRUE ${clause} GROUP BY invoice_status`, params),
      pool.query(
        `SELECT status, count(*)::int AS n, COALESCE(sum(amount),0)::numeric AS total
           FROM student_payments WHERE TRUE ${clause} GROUP BY status`, params),
    ]);
    res.json({
      commissions: commissions.rows,
      invoices: invoices.rows,
      payments: payments.rows,
      scope: req.scope.allBranches ? "all branches" : `${req.scope.branchIds.length} branch(es)`,
    });
  } catch (error) {
    res.status(500).json({ error: error.message || "Could not build summary" });
  }
});

export default router;
