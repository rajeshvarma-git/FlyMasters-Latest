-- ===========================================================================
-- 005: the Agent/Freelancer -> Accountant chain
--
-- Migration 003 put the referral columns on the student_leads TABLE. The app
-- reads leads from app_records. Same mistake as branch_id in 002, fixed the
-- same way in 004 -- so the referral link an Agent depends on would have
-- matched nothing and their dashboard would have shown zero students.
--
-- Additive only.
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- Referral attribution, on the table the application actually reads
-- ---------------------------------------------------------------------------
ALTER TABLE app_records ADD COLUMN IF NOT EXISTS referred_by_partner_id UUID REFERENCES partners(id);
ALTER TABLE app_records ADD COLUMN IF NOT EXISTS referral_code_entered  TEXT;
ALTER TABLE app_records ADD COLUMN IF NOT EXISTS referral_source        TEXT;

CREATE INDEX IF NOT EXISTS idx_app_records_partner
  ON app_records(referred_by_partner_id) WHERE referred_by_partner_id IS NOT NULL;

-- Carry across anything 003 managed to record on the table copy.
UPDATE app_records r
   SET referred_by_partner_id = l.referred_by_partner_id,
       referral_code_entered  = l.referral_code_entered,
       referral_source        = l.referral_source
  FROM student_leads l
 WHERE r.table_name = 'student_leads'
   AND r.id = l.id::text
   AND l.referred_by_partner_id IS NOT NULL
   AND r.referred_by_partner_id IS NULL;

-- ---------------------------------------------------------------------------
-- Partner account
--
-- Doc 6.0: "referral link, linked-student count, commission status summary,
-- invoice upload status, accounting notes visibility, account verification".
-- Doc: status visibility is shown "only when Super Admin has enabled this
-- visibility for that Agent or Freelancer account" -- hence the flag, default
-- off.
-- ---------------------------------------------------------------------------
ALTER TABLE partners ADD COLUMN IF NOT EXISTS can_view_student_status BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE partners ADD COLUMN IF NOT EXISTS login_enabled           BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE partners ADD COLUMN IF NOT EXISTS activated_by            TEXT;
ALTER TABLE partners ADD COLUMN IF NOT EXISTS activated_at            TIMESTAMPTZ;
ALTER TABLE partners ADD COLUMN IF NOT EXISTS business_name           TEXT;
ALTER TABLE partners ADD COLUMN IF NOT EXISTS verification_status     TEXT NOT NULL DEFAULT 'pending';

ALTER TABLE partners DROP CONSTRAINT IF EXISTS partners_verification_valid;
ALTER TABLE partners ADD CONSTRAINT partners_verification_valid
  CHECK (verification_status IN ('pending', 'verified', 'suspended', 'terminated'));

-- ---------------------------------------------------------------------------
-- Commission, with the invoice lifecycle the document spells out
--
-- Doc 7.2: "mark invoices as received, under review, clarification required,
-- approved, on hold, rejected, paid, or closed."
-- ---------------------------------------------------------------------------
ALTER TABLE partner_commissions ADD COLUMN IF NOT EXISTS branch_id          UUID REFERENCES branches(id);
ALTER TABLE partner_commissions ADD COLUMN IF NOT EXISTS invoice_status     TEXT NOT NULL DEFAULT 'not_uploaded';
ALTER TABLE partner_commissions ADD COLUMN IF NOT EXISTS invoice_path       TEXT;
ALTER TABLE partner_commissions ADD COLUMN IF NOT EXISTS invoice_uploaded_at TIMESTAMPTZ;
ALTER TABLE partner_commissions ADD COLUMN IF NOT EXISTS payout_reference   TEXT;
ALTER TABLE partner_commissions ADD COLUMN IF NOT EXISTS paid_at            TIMESTAMPTZ;
ALTER TABLE partner_commissions ADD COLUMN IF NOT EXISTS student_name       TEXT;

ALTER TABLE partner_commissions DROP CONSTRAINT IF EXISTS partner_commissions_invoice_valid;
ALTER TABLE partner_commissions ADD CONSTRAINT partner_commissions_invoice_valid
  CHECK (invoice_status IN (
    'not_uploaded', 'received', 'under_review', 'clarification_required',
    'approved', 'on_hold', 'rejected', 'paid', 'closed'
  ));

CREATE INDEX IF NOT EXISTS idx_commissions_branch ON partner_commissions(branch_id, status);

-- ---------------------------------------------------------------------------
-- Accounting notes
--
-- Doc 7.2: notes are "visible to authorized Admins, Super Admin, and relevant
-- Agent/Freelancer accounts" -- so each note carries its own visibility. An
-- internal hold reason is not the same as a clarification request sent to the
-- partner.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS commission_notes (
  id            BIGSERIAL PRIMARY KEY,
  commission_id UUID NOT NULL REFERENCES partner_commissions(id) ON DELETE CASCADE,
  author_id     TEXT,
  author_role   TEXT,
  note_type     TEXT NOT NULL DEFAULT 'note',
  body          TEXT NOT NULL,
  visible_to_partner BOOLEAN NOT NULL DEFAULT FALSE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT commission_notes_type_valid CHECK (note_type IN
    ('note', 'clarification', 'hold_reason', 'tax_note', 'payout_reference', 'payment_confirmation'))
);
CREATE INDEX IF NOT EXISTS idx_commission_notes ON commission_notes(commission_id, created_at DESC);

-- ---------------------------------------------------------------------------
-- Student payments
--
-- Doc 7.2: "service fees, application fees, deposits, refunds, outstanding
-- amounts, receipts, and payment follow-up status."
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS student_payments (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id  TEXT,
  lead_id     TEXT,
  branch_id   UUID REFERENCES branches(id),
  payment_type TEXT NOT NULL DEFAULT 'service_fee',
  amount      NUMERIC(12,2) NOT NULL DEFAULT 0,
  currency    TEXT NOT NULL DEFAULT 'INR',
  status      TEXT NOT NULL DEFAULT 'due',
  receipt_ref TEXT,
  due_date    DATE,
  paid_at     TIMESTAMPTZ,
  recorded_by TEXT,
  notes       TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT student_payments_type_valid CHECK (payment_type IN
    ('service_fee', 'application_fee', 'deposit', 'refund', 'other')),
  CONSTRAINT student_payments_status_valid CHECK (status IN
    ('due', 'partial', 'paid', 'refunded', 'waived', 'overdue'))
);
CREATE INDEX IF NOT EXISTS idx_student_payments_branch ON student_payments(branch_id, status);
CREATE INDEX IF NOT EXISTS idx_student_payments_student ON student_payments(student_id);
