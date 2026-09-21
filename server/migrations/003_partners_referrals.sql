-- ===========================================================================
-- 003: agents and freelancers
--
-- One entity, not two portals. An "agent" and a "freelancer" differ only by
-- partners.type and their commission rate, so they share a role, a table and
-- a screen. Referral attribution is a column on the lead, captured either from
-- a /r/<CODE> link or from the code box in the student AI chat.
-- ===========================================================================

CREATE TABLE IF NOT EXISTS partners (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id        TEXT UNIQUE,              -- null until they are given a login
  type           TEXT NOT NULL DEFAULT 'agent',
  referral_code  TEXT UNIQUE NOT NULL,
  full_name      TEXT NOT NULL,
  email          TEXT,
  phone          TEXT,
  branch_id      UUID REFERENCES branches(id),
  commission_rate NUMERIC(5,2) NOT NULL DEFAULT 0,
  commission_basis TEXT NOT NULL DEFAULT 'per_enrollment',
  is_active      BOOLEAN NOT NULL DEFAULT TRUE,
  onboarded_by   TEXT,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT partners_type_valid  CHECK (type IN ('agent','freelancer')),
  CONSTRAINT partners_basis_valid CHECK (commission_basis IN ('per_lead','per_enrollment','percent_of_fee'))
);

CREATE INDEX IF NOT EXISTS idx_partners_code   ON partners(lower(referral_code));
CREATE INDEX IF NOT EXISTS idx_partners_branch ON partners(branch_id);

-- Attribution lives on the lead so it survives reassignment between counsellors.
ALTER TABLE student_leads ADD COLUMN IF NOT EXISTS referred_by_partner_id UUID REFERENCES partners(id);
ALTER TABLE student_leads ADD COLUMN IF NOT EXISTS referral_code_entered  TEXT;
ALTER TABLE student_leads ADD COLUMN IF NOT EXISTS referral_captured_at   TIMESTAMPTZ;
ALTER TABLE student_leads ADD COLUMN IF NOT EXISTS referral_source        TEXT; -- 'link' | 'chat' | 'manual'

CREATE INDEX IF NOT EXISTS idx_leads_partner ON student_leads(referred_by_partner_id);

-- Append-only record of attribution decisions. Deliberately separate from the
-- lead row: the business rule for "who gets credit when a counsellor already
-- owns the lead" is not settled yet, and this keeps the evidence either way.
CREATE TABLE IF NOT EXISTS referral_events (
  id          BIGSERIAL PRIMARY KEY,
  lead_id     UUID,
  partner_id  UUID REFERENCES partners(id),
  code        TEXT,
  source      TEXT,
  outcome     TEXT NOT NULL DEFAULT 'captured', -- captured | rejected_duplicate | rejected_owned | superseded
  reason      TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_referral_events_lead ON referral_events(lead_id, created_at DESC);

-- Commission is recorded, never auto-paid. Payout automation is deliberately
-- out of scope until the attribution rule is agreed.
CREATE TABLE IF NOT EXISTS partner_commissions (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  partner_id  UUID NOT NULL REFERENCES partners(id),
  lead_id     UUID,
  amount      NUMERIC(12,2) NOT NULL DEFAULT 0,
  currency    TEXT NOT NULL DEFAULT 'INR',
  status      TEXT NOT NULL DEFAULT 'pending',
  approved_by TEXT,
  approved_at TIMESTAMPTZ,
  notes       TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT partner_commissions_status_valid CHECK (status IN ('pending','approved','paid','rejected'))
);
CREATE INDEX IF NOT EXISTS idx_commissions_partner ON partner_commissions(partner_id, status);
