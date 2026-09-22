/**
 * ONE auth realm for every portal.
 *
 * Before the merge there were four:
 *   admin      - jwt, role read from DB per request, requireRole()  (the good one)
 *   counselor  - jwt with its OWN secret, no role check at all, claims trusted
 *   telecaller - no backend; borrowed the admin API
 *   student    - separate opaque session tokens in auth_sessions
 *
 * Everything below is now the single implementation. Adding a role is a line in
 * ROLES; adding a branch-scoped role is a line in BRANCH_SCOPED_ROLES.
 */
import jwt from "jsonwebtoken";
import { JWT_SECRET } from "./env.mjs";
import { pool } from "./db.mjs";

export const ROLES = Object.freeze({
  SUPER_ADMIN: "super_admin",
  ADMIN: "admin",
  BRANCH_HEAD: "branch_head",
  COUNSELOR: "counselor",
  TELECALLER: "telecaller",
  ACCOUNTANT: "accountant",
  // Agents and freelancers. One role, one table, two types. They sign in only
  // after a Super Admin activates the account, and they see nothing but the
  // students they themselves referred.
  PARTNER: "partner",
  STUDENT: "student",
});

export const ALL_ROLES = Object.values(ROLES);

/** Roles that manage other people's records. */
export const ADMIN_ROLES = [ROLES.ADMIN, ROLES.SUPER_ADMIN];
/** Admin-equivalent inside one branch only. */
export const BRANCH_ADMIN_ROLES = [...ADMIN_ROLES, ROLES.BRANCH_HEAD];
export const STAFF_ROLES = [...BRANCH_ADMIN_ROLES, ROLES.COUNSELOR, ROLES.TELECALLER, ROLES.ACCOUNTANT];

/**
 * Roles whose every query is restricted to their own branch_id.
 * super_admin is deliberately absent: it sees all branches.
 */
export const BRANCH_SCOPED_ROLES = [
  ROLES.BRANCH_HEAD,
  ROLES.COUNSELOR,
  ROLES.TELECALLER,
  ROLES.ACCOUNTANT,
];

export function signUser(user) {
  return jwt.sign(
    { id: user.id, email: user.email, role: user.role, branch_id: user.branch_id || null },
    JWT_SECRET,
    { expiresIn: "7d" },
  );
}

/**
 * Role and branch are re-read from the database on every request, so a demoted,
 * moved or deleted account loses access immediately rather than at token expiry.
 * One indexed query instead of the old full-table scan of user_roles.
 */
async function identityFor(userId) {
  const result = await pool.query(
    `SELECT u.id,
            u.email,
            COALESCE(r.role, 'student') AS role,
            r.branch_id,
            r.is_active,
            COALESCE(
              (SELECT array_agg(ub.branch_id) FROM user_branches ub WHERE ub.user_id = u.id),
              CASE WHEN r.branch_id IS NULL THEN '{}'::uuid[] ELSE ARRAY[r.branch_id] END
            ) AS branch_ids
       FROM auth_users u
       LEFT JOIN user_roles r ON r.user_id = u.id
      WHERE u.id = $1`,
    [String(userId)],
  );
  return result.rows[0] || null;
}

export async function session(req, res, next) {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : "";
  if (!token) return res.status(401).json({ error: "Sign in required" });

  let claims;
  try {
    claims = jwt.verify(token, JWT_SECRET);
  } catch {
    return res.status(401).json({ error: "Session expired. Sign in again." });
  }

  try {
    const identity = await identityFor(claims.id);
    if (!identity) return res.status(401).json({ error: "Account no longer exists." });
    if (identity.is_active === false) return res.status(403).json({ error: "Account is disabled." });

    req.user = {
      id: identity.id,
      email: identity.email,
      role: identity.role,
      branch_id: identity.branch_id || null,
      branch_ids: (identity.branch_ids || []).map(String).filter(Boolean),
    };
    next();
  } catch (error) {
    res.status(500).json({ error: error.message || "Could not verify session" });
  }
}

/**
 * Accepts EITHER realm's token.
 *
 * Staff carry a signed JWT; the student portal still carries an opaque token
 * in `auth_sessions` (see routes/student.mjs — unifying the two is Phase 1
 * work and deliberately not done during the merge). A handful of endpoints
 * are legitimately used by both: a student reading their own status bar, and
 * a student reporting a conversation. Rather than duplicate those routes per
 * realm, this middleware resolves whichever token arrived.
 *
 * It never widens anyone's access: a student resolved this way gets
 * role "student", and every route using it still checks ownership.
 */
export async function anySession(req, res, next) {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : "";
  if (!token) return res.status(401).json({ error: "Sign in required" });

  try {
    const claims = jwt.verify(token, JWT_SECRET);
    const identity = await identityFor(claims.id);
    if (identity && identity.is_active !== false) {
      req.user = {
        id: identity.id,
        email: identity.email,
        role: identity.role,
        branch_id: identity.branch_id || null,
        branch_ids: (identity.branch_ids || []).map(String).filter(Boolean),
      };
      return next();
    }
  } catch {
    // not a staff JWT — fall through to the student realm
  }

  try {
    const { rows } = await pool.query(
      `SELECT s.user_id, s.expires_at, u.email
         FROM auth_sessions s JOIN auth_users u ON u.id = s.user_id
        WHERE s.token = $1 LIMIT 1`,
      [token],
    );
    const row = rows[0];
    if (!row) return res.status(401).json({ error: "Session expired. Sign in again." });
    if (new Date(row.expires_at).getTime() <= Date.now()) {
      return res.status(401).json({ error: "Session expired. Sign in again." });
    }
    req.user = {
      id: String(row.user_id),
      email: row.email,
      role: ROLES.STUDENT,
      branch_id: null,
      branch_ids: [],
    };
    req.studentRealm = true;
    return next();
  } catch (error) {
    return res.status(500).json({ error: error.message || "Could not verify session" });
  }
}

export function requireRole(roles, label = "Authorized") {
  const allowed = Array.isArray(roles) ? roles : [roles];
  return (req, res, next) => {
    if (!allowed.includes(req.user?.role)) {
      return res.status(403).json({ error: `${label} access required.` });
    }
    next();
  };
}

/**
 * Resolves the signed-in partner and their own-records-only scope.
 *
 * This is the narrowest scope in the system and the only one held by someone
 * outside the company. It is keyed to the partner's own id, never to a branch:
 * two agents in the same branch compete with each other, so branch-level
 * visibility would leak one's pipeline to the other.
 */
export async function partnerScope(req, res, next) {
  try {
    const { rows } = await pool.query(
      "SELECT * FROM partners WHERE user_id = $1",
      [String(req.user.id)],
    );
    const partner = rows[0];
    if (!partner) return res.status(403).json({ error: "No partner record for this account." });
    if (!partner.is_active || !partner.login_enabled) {
      return res.status(403).json({ error: "This partner account is not active. Ask the Fly Masters team." });
    }
    if (partner.verification_status === "suspended" || partner.verification_status === "terminated") {
      return res.status(403).json({ error: "This partner account is suspended." });
    }
    req.partner = partner;
    req.scope = { allBranches: false, branchIds: [], branchId: partner.branch_id || null, partnerId: partner.id };
    next();
  } catch (error) {
    res.status(500).json({ error: error.message || "Could not verify partner account" });
  }
}

/**
 * Attaches req.scope — the branch filter every data route must apply.
 *   { allBranches: true }                -> super_admin / admin: no filter
 *   { allBranches: false, branchId: id } -> everyone else: WHERE branch_id = id
 *
 * A branch-scoped user with no branch assigned is refused rather than silently
 * given everything, which is the failure mode that leaks data between branches.
 */
export function branchScope(req, res, next) {
  const role = req.user?.role;
  if (!BRANCH_SCOPED_ROLES.includes(role)) {
    req.scope = { allBranches: true, branchIds: [], branchId: null };
    return next();
  }
  const branchIds = req.user?.branch_ids || [];
  if (!branchIds.length) {
    return res.status(403).json({ error: "No branch assigned to this account. Ask an admin." });
  }
  // branchId stays as the home branch, used when stamping new records.
  req.scope = {
    allBranches: false,
    branchIds,
    branchId: req.user?.branch_id || branchIds[0],
  };
  next();
}

/** Appends a branch predicate to a query. Keeps scoping in SQL, not in JavaScript. */
export function scopeClause(scope, column = "branch_id", params = []) {
  if (!scope || scope.allBranches) return { text: "", params };
  params.push(scope.branchIds);
  return { text: ` AND ${column} = ANY($${params.length}::uuid[])`, params };
}

export function assertInScope(scope, row, column = "branch_id") {
  if (!scope || scope.allBranches) return true;
  const value = String(row?.[column] || "");
  return Boolean(value) && scope.branchIds.map(String).includes(value);
}

/** Filters an already-loaded array of records down to the caller's branches. */
export function filterToScope(scope, rows, column = "branch_id") {
  if (!scope || scope.allBranches) return rows;
  const allowed = new Set(scope.branchIds.map(String));
  return rows.filter((row) => allowed.has(String(row?.[column] || "")));
}

/** Write-side audit trail. Never throws into the request path. */
export async function audit(req, action, entity, entityId, detail = {}) {
  try {
    await pool.query(
      `INSERT INTO audit_log (actor_id, actor_role, branch_id, action, entity, entity_id, detail, ip)
       VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8)`,
      [
        req.user?.id || null,
        req.user?.role || null,
        req.user?.branch_id || null,
        action,
        entity,
        entityId ? String(entityId) : null,
        JSON.stringify(detail || {}),
        req.headers["x-forwarded-for"]?.split(",")[0]?.trim() || req.ip || null,
      ],
    );
  } catch (error) {
    console.error("audit_log write failed:", error.message || error);
  }
}

// Ready-made middleware stacks, mirroring the old names so ported routes keep working.
// Branch heads use the admin screens, restricted to their own branches by
// branchScope. The CRM document: "Manage daily branch operations ... Only the
// branch or branches assigned to the Branch Head."
export const adminAuth = [session, requireRole(BRANCH_ADMIN_ROLES, "Admin"), branchScope];
export const branchAdminAuth = [session, requireRole(BRANCH_ADMIN_ROLES, "Admin"), branchScope];
export const superAdminAuth = [session, requireRole([ROLES.SUPER_ADMIN], "Super admin"), branchScope];
export const counselorAuth = [session, requireRole([ROLES.COUNSELOR], "Counselor"), branchScope];
export const telecallerAuth = [session, requireRole([ROLES.TELECALLER], "Telecaller"), branchScope];
export const branchHeadAuth = [session, requireRole([ROLES.BRANCH_HEAD, ...ADMIN_ROLES], "Branch head"), branchScope];
export const accountantAuth = [session, requireRole([ROLES.ACCOUNTANT, ...ADMIN_ROLES], "Accountant"), branchScope];
export const studentAuth = [session, requireRole([ROLES.STUDENT], "Student")];
export const partnerAuth = [session, requireRole([ROLES.PARTNER], "Partner"), partnerScope];
export const staffAuth = [session, requireRole(STAFF_ROLES, "Staff"), branchScope];
