-- ===========================================================================
-- 002: the permission spine
--
-- Roles used to live as JSONB rows in app_records(table_name='user_roles'),
-- loaded in full and searched in JavaScript on every authenticated request.
-- This promotes them to a real indexed table and introduces branches.
--
-- Safe to run against the existing production database: additive only.
-- ===========================================================================

CREATE TABLE IF NOT EXISTS branches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  code TEXT UNIQUE NOT NULL,
  city TEXT,
  state TEXT,
  address TEXT,
  phone TEXT,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Every existing record belongs to the original office until an admin says otherwise.
INSERT INTO branches (name, code, city)
SELECT 'Head Office', 'HO', 'Hyderabad'
WHERE NOT EXISTS (SELECT 1 FROM branches WHERE code = 'HO');

CREATE TABLE IF NOT EXISTS user_roles (
  user_id     TEXT PRIMARY KEY,
  role        TEXT NOT NULL DEFAULT 'student',
  branch_id   UUID REFERENCES branches(id),
  is_active   BOOLEAN NOT NULL DEFAULT TRUE,
  assigned_by TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT user_roles_role_valid CHECK (role IN
    ('super_admin','admin','branch_head','counselor','telecaller','accountant','partner','student'))
);

CREATE INDEX IF NOT EXISTS idx_user_roles_role   ON user_roles(role);
CREATE INDEX IF NOT EXISTS idx_user_roles_branch ON user_roles(branch_id);

-- Migrate roles out of the JSONB blob store into the real table, once.
INSERT INTO user_roles (user_id, role, branch_id)
SELECT r.data->>'user_id',
       COALESCE(NULLIF(r.data->>'role',''), 'student'),
       (SELECT id FROM branches WHERE code = 'HO')
  FROM app_records r
 WHERE r.table_name = 'user_roles'
   AND COALESCE(r.data->>'user_id','') <> ''
ON CONFLICT (user_id) DO NOTHING;

-- Any auth_user with no role row at all defaults to student, so `session` never
-- has to invent a role for an account that exists.
INSERT INTO user_roles (user_id, role, branch_id)
SELECT u.id, 'student', (SELECT id FROM branches WHERE code = 'HO')
  FROM auth_users u
 WHERE NOT EXISTS (SELECT 1 FROM user_roles ur WHERE ur.user_id = u.id)
ON CONFLICT (user_id) DO NOTHING;

-- Branch columns on the records that get scoped.
ALTER TABLE student_leads          ADD COLUMN IF NOT EXISTS branch_id UUID REFERENCES branches(id);
ALTER TABLE counselor_users        ADD COLUMN IF NOT EXISTS branch_id UUID REFERENCES branches(id);
ALTER TABLE documents              ADD COLUMN IF NOT EXISTS branch_id UUID REFERENCES branches(id);
ALTER TABLE university_shortlists  ADD COLUMN IF NOT EXISTS branch_id UUID REFERENCES branches(id);
ALTER TABLE counselor_attendance   ADD COLUMN IF NOT EXISTS branch_id UUID REFERENCES branches(id);
ALTER TABLE counselor_leave_requests ADD COLUMN IF NOT EXISTS branch_id UUID REFERENCES branches(id);
ALTER TABLE counselor_salary_records ADD COLUMN IF NOT EXISTS branch_id UUID REFERENCES branches(id);

UPDATE student_leads         SET branch_id = (SELECT id FROM branches WHERE code='HO') WHERE branch_id IS NULL;
UPDATE counselor_users       SET branch_id = (SELECT id FROM branches WHERE code='HO') WHERE branch_id IS NULL;
UPDATE documents             SET branch_id = (SELECT id FROM branches WHERE code='HO') WHERE branch_id IS NULL;
UPDATE university_shortlists SET branch_id = (SELECT id FROM branches WHERE code='HO') WHERE branch_id IS NULL;

CREATE INDEX IF NOT EXISTS idx_student_leads_branch ON student_leads(branch_id);
CREATE INDEX IF NOT EXISTS idx_documents_branch     ON documents(branch_id);

-- Who changed what. Required before any external role (partner, branch head)
-- is allowed to touch lead data.
CREATE TABLE IF NOT EXISTS audit_log (
  id         BIGSERIAL PRIMARY KEY,
  actor_id   TEXT,
  actor_role TEXT,
  branch_id  UUID,
  action     TEXT NOT NULL,
  entity     TEXT NOT NULL,
  entity_id  TEXT,
  detail     JSONB NOT NULL DEFAULT '{}'::jsonb,
  ip         TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_audit_entity ON audit_log(entity, entity_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_actor  ON audit_log(actor_id, created_at DESC);
