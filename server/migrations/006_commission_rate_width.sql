-- ===========================================================================
-- 006: commission_rate was too narrow to hold a rupee amount
--
-- Migration 003 declared commission_rate as NUMERIC(5,2), which caps at
-- 999.99. That is fine for "10% of fee" and useless for "₹15,000 per
-- enrolment" — and per-enrolment is the basis this client actually uses.
-- Creating a real partner failed with "numeric field overflow".
--
-- The column carries two different kinds of number depending on
-- commission_basis, so it has to be wide enough for the money case:
--
--   per_lead        -> a flat amount per referred lead      (e.g. 500.00)
--   per_enrollment  -> a flat amount per enrolment          (e.g. 15000.00)
--   percent_of_fee  -> a percentage of the student's fee    (e.g. 10.00)
--
-- Splitting it into separate amount and percentage columns would be tidier,
-- but it is one number with one meaning per row, and the basis says which.
-- ===========================================================================

ALTER TABLE partners ALTER COLUMN commission_rate TYPE NUMERIC(12,2);

-- A percentage above 100 is a typo, not a deal. A flat amount is unbounded.
ALTER TABLE partners DROP CONSTRAINT IF EXISTS partners_rate_sane;
ALTER TABLE partners ADD CONSTRAINT partners_rate_sane CHECK (
  commission_rate >= 0
  AND (commission_basis <> 'percent_of_fee' OR commission_rate <= 100)
);
