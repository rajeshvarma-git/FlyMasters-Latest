-- ===========================================================================
-- 004: make branch scoping real
--
-- Migration 002 put branch_id on the student_leads TABLE. The application
-- actually reads leads out of app_records (the JSONB blob store) 21 times and
-- from that table only 5 times, so the column was on the wrong side of the
-- system and nothing enforced it.
--
-- This puts branch_id where the data really lives: one indexed column on
-- app_records, which covers every blob-backed entity at once.
--
-- Additive only. Existing rows are assigned to the head-office branch so
-- nothing disappears from anyone's screen after this runs.
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- Branch identity
-- ---------------------------------------------------------------------------
ALTER TABLE branches ADD COLUMN IF NOT EXISTS area TEXT;
ALTER TABLE branches ADD COLUMN IF NOT EXISTS is_head_office BOOLEAN NOT NULL DEFAULT FALSE;

UPDATE branches SET is_head_office = TRUE WHERE code = 'HO';

-- ---------------------------------------------------------------------------
-- The column that makes scoping possible
-- ---------------------------------------------------------------------------
ALTER TABLE app_records ADD COLUMN IF NOT EXISTS branch_id UUID REFERENCES branches(id);

CREATE INDEX IF NOT EXISTS idx_app_records_table_branch
  ON app_records(table_name, branch_id);

-- Only branch-owned record types get a branch. Global reference data
-- (the university catalogue, document checklists, message templates) stays
-- unscoped on purpose — every branch uses the same catalogue, and scoping it
-- would make courses vanish for branch staff.
UPDATE app_records
   SET branch_id = (SELECT id FROM branches WHERE is_head_office LIMIT 1)
 WHERE branch_id IS NULL
   AND table_name IN (
     'student_leads', 'documents', 'applications', 'university_shortlists',
     'private_conversations', 'private_messages', 'notifications',
     'telecaller_conversations', 'telecaller_messages',
     'whatsapp_conversations', 'whatsapp_messages', 'counselors', 'profiles'
   );

-- ---------------------------------------------------------------------------
-- Multi-branch assignment
--
-- The CRM document is explicit: a Branch Head covers "the branch or branches
-- assigned to the Branch Head". user_roles.branch_id stays as the person's
-- home branch; this table is the authoritative list of what they can see.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS user_branches (
  user_id     TEXT NOT NULL,
  branch_id   UUID NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
  assigned_by TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, branch_id)
);

CREATE INDEX IF NOT EXISTS idx_user_branches_user ON user_branches(user_id);

-- Everyone who already has a home branch gets it as their first assignment,
-- so no existing account loses access the moment this deploys.
INSERT INTO user_branches (user_id, branch_id)
SELECT user_id, branch_id FROM user_roles WHERE branch_id IS NOT NULL
ON CONFLICT DO NOTHING;

-- ---------------------------------------------------------------------------
-- Leads moved between branches leave a trail, same as every other change.
-- ---------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_audit_branch ON audit_log(branch_id, created_at DESC);
