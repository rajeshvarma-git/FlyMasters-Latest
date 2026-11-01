-- ===========================================================================
-- 008: bounded delegation (ACCESS-03C)
--
-- A grant lets one person do one narrow thing for specific roles in specific branches.
--   grants.manage  Super Admin -> Admin:        may issue 'staff.create' grants inside these roles/branches.
--   staff.create   Super Admin or Admin -> Branch Head: may create these roles in these branches.
-- A staff.create grant issued by an Admin points at the grants.manage grant that allowed it
-- (parent_grant_id), so revoking or expiring the parent also stops the child.
--
-- Additive only. Nothing reads this table until the 03C routes use it.
-- ===========================================================================

CREATE TABLE IF NOT EXISTS delegation_grants (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  action          TEXT NOT NULL CHECK (action IN ('staff.create', 'grants.manage')),
  grantee_id      TEXT NOT NULL,
  grantor_id      TEXT NOT NULL,
  parent_grant_id UUID REFERENCES delegation_grants(id),
  roles           TEXT[] NOT NULL,
  branch_ids      UUID[] NOT NULL,
  expires_at      TIMESTAMPTZ,
  revoked_at      TIMESTAMPTZ,
  revoked_by      TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- Only ordinary employee roles can ever be delegated; never Admin, Branch Head or Super Admin.
  CONSTRAINT delegation_roles_valid CHECK (
    cardinality(roles) > 0 AND roles <@ ARRAY['counselor', 'telecaller', 'accountant']::text[]
  ),
  CONSTRAINT delegation_branches_present CHECK (cardinality(branch_ids) > 0),
  CONSTRAINT delegation_no_self_grant CHECK (grantee_id <> grantor_id),
  -- grants.manage comes from a Super Admin only: no parent, so authority cannot be passed onward.
  CONSTRAINT delegation_manage_has_no_parent CHECK (action <> 'grants.manage' OR parent_grant_id IS NULL),
  CONSTRAINT delegation_revocation_complete CHECK ((revoked_at IS NULL) = (revoked_by IS NULL)),
  CONSTRAINT delegation_expiry_after_creation CHECK (expires_at IS NULL OR expires_at > created_at)
);

CREATE INDEX IF NOT EXISTS idx_delegation_grantee ON delegation_grants(grantee_id, action) WHERE revoked_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_delegation_parent  ON delegation_grants(parent_grant_id) WHERE parent_grant_id IS NOT NULL;
