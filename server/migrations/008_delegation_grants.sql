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
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  action            TEXT NOT NULL CHECK (action IN ('staff.create', 'grants.manage')),
  -- Both people must be real accounts. No cascade: an account with grants cannot vanish silently.
  grantee_id        TEXT NOT NULL REFERENCES auth_users(id),
  grantor_id        TEXT NOT NULL REFERENCES auth_users(id),
  parent_grant_id   UUID REFERENCES delegation_grants(id),
  roles             TEXT[] NOT NULL,
  branch_ids        UUID[] NOT NULL,
  reason            TEXT NOT NULL,
  expires_at        TIMESTAMPTZ,
  -- The audit rows written in the same transaction as the issue / the revocation.
  issue_audit_id    BIGINT NOT NULL REFERENCES audit_log(id),
  revoked_at        TIMESTAMPTZ,
  revoked_by        TEXT REFERENCES auth_users(id),
  revocation_reason TEXT,
  revoke_audit_id   BIGINT REFERENCES audit_log(id),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- Only ordinary employee roles can ever be delegated; never Admin, Branch Head or Super Admin.
  -- A list containing NULL is refused (array_position finds NULL elements).
  CONSTRAINT delegation_roles_valid CHECK (
    cardinality(roles) > 0
    AND array_position(roles, NULL) IS NULL
    AND roles <@ ARRAY['counselor', 'telecaller', 'accountant']::text[]
  ),
  CONSTRAINT delegation_branches_present CHECK (cardinality(branch_ids) > 0 AND array_position(branch_ids, NULL) IS NULL),
  CONSTRAINT delegation_reason_present CHECK (length(btrim(reason)) > 0 AND length(reason) <= 500),
  CONSTRAINT delegation_no_self_grant CHECK (grantee_id <> grantor_id),
  -- grants.manage comes from a Super Admin only: no parent, so authority cannot be passed onward.
  CONSTRAINT delegation_manage_has_no_parent CHECK (action <> 'grants.manage' OR parent_grant_id IS NULL),
  -- A revocation is complete or absent: when, by whom, why, and its audit row.
  CONSTRAINT delegation_revocation_complete CHECK (
    (revoked_at IS NULL AND revoked_by IS NULL AND revocation_reason IS NULL AND revoke_audit_id IS NULL)
    OR (revoked_at IS NOT NULL AND revoked_by IS NOT NULL AND length(btrim(coalesce(revocation_reason, ''))) > 0 AND revoke_audit_id IS NOT NULL)
  ),
  CONSTRAINT delegation_expiry_after_creation CHECK (expires_at IS NULL OR expires_at > created_at)
);

-- Every branch in a grant must be a real, active branch (an array cannot carry foreign keys).
CREATE OR REPLACE FUNCTION delegation_grants_check_branches() RETURNS trigger AS $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM unnest(NEW.branch_ids) AS b(id)
    WHERE b.id IS NOT NULL   -- NULL elements are refused by delegation_branches_present, not here
      AND NOT EXISTS (SELECT 1 FROM branches WHERE branches.id = b.id AND branches.is_active)
  ) THEN
    RAISE EXCEPTION 'delegation grant names a branch that does not exist or is inactive'
      USING ERRCODE = '23503', CONSTRAINT = 'delegation_branches_exist';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS delegation_grants_branches ON delegation_grants;
CREATE TRIGGER delegation_grants_branches
  BEFORE INSERT OR UPDATE OF branch_ids ON delegation_grants
  FOR EACH ROW EXECUTE FUNCTION delegation_grants_check_branches();

CREATE INDEX IF NOT EXISTS idx_delegation_grantee ON delegation_grants(grantee_id, action) WHERE revoked_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_delegation_parent  ON delegation_grants(parent_grant_id) WHERE parent_grant_id IS NOT NULL;
