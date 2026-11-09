// Team Status: one canonical list of employees (Counselor, Telecaller, Accountant, Branch Head, Admin)
// with two SEPARATE statuses.
//
// Accountant belongs here because it is an ordinary branch-scoped employee like the others
// (SCOPED_ROLES and ORDINARY_STAFF both include it, and an Admin may create one). Super Admin and
// Student stay out: the first is global rather than branch staff, the second is not an employee.
//
//   account  "enabled" | "disabled"      whether the login may be used. Says nothing about presence.
//   working  "working" | "finished" | "leave" | "not_clocked_in" | "unknown"
//            derived ONLY from clock-in / approved-leave rows. When there is no such data for the
//            person at all, it is "unknown": an enabled account is never read as "working", and a
//            missing record is never read as "not working".
//
// Pure functions, no database: the route loads the rows, these decide. Tested in tests/teamStatus.test.mjs.
import { allInScope } from "./scopeGuards.mjs";

export const TEAM_ROLES = ["counselor", "telecaller", "accountant", "branch_head", "admin"];
export const ROLE_LABEL = { counselor: "Counselor", telecaller: "Telecaller", accountant: "Accountant", branch_head: "Branch Head", admin: "Admin" };
export const WORKING = ["working", "finished", "leave", "not_clocked_in", "unknown"];

const norm = (value) => String(value || "").trim().toLowerCase();
const ids = (list) => [...new Set((list || []).map(String).filter(Boolean))];

/**
 * Employees from the user directory, one per person.
 * `users` rows come from loadUsers() (id, email, role, branch_ids, is_active...). `counselors` rows
 * give the extra ids a person's attendance may be filed under (the counselor profile id).
 * Two rows for the same email (account + profile-only row) collapse to the one with a login.
 */
export function buildEmployees({ users, counselors = [], branches = [] }) {
  const branchName = new Map(branches.map((b) => [String(b.id), b.name || b.code || "Branch"]));
  const byEmail = new Map();
  for (const user of users) {
    if (!TEAM_ROLES.includes(user.role)) continue;
    const key = norm(user.email) || `id:${user.id}`;
    const current = byEmail.get(key);
    // Prefer the row that carries branches (the real account) over a profile-only echo.
    if (!current || (user.branch_ids?.length || 0) > (current.branch_ids?.length || 0)) byEmail.set(key, user);
  }
  return [...byEmail.values()].map((user) => {
    const email = norm(user.email);
    const profileIds = counselors
      .filter((c) => (email && norm(c.email) === email) || String(c.auth_user_id || "") === String(user.id))
      .flatMap((c) => [c.id, c.auth_user_id, c.user_id]);
    const branchIds = ids(user.branch_ids?.length ? user.branch_ids : user.branch_id ? [user.branch_id] : []);
    const name = [user.first_name, user.last_name].filter(Boolean).join(" ").trim() || user.email || "Unnamed";
    return {
      id: String(user.id),
      aliases: ids([user.id, ...profileIds]),
      name,
      email: user.email || "",
      phone: user.phone || "",
      role: user.role,
      roleLabel: ROLE_LABEL[user.role],
      branchIds,
      branches: branchIds.map((id) => ({ id, name: branchName.get(id) || "Branch" })),
      account: user.is_active === false ? "disabled" : "enabled",
    };
  });
}

/** Same rule for the list and for a direct request: every branch of the person must be in the viewer's scope. */
export const employeeVisible = (scope, employee) => allInScope(scope, employee.branchIds);

/**
 * Working status from real rows only.
 *   today's clock-in without clock-out  -> working
 *   today's clock-in and clock-out      -> finished
 *   approved leave covering today       -> leave
 *   no row today, but they have clocked in before -> not_clocked_in
 *   no attendance or leave data at all  -> unknown
 */
export function workingStatus(employee, { today, attendance = [], leave = [], everClocked = new Set() }) {
  const mine = new Set(employee.aliases);
  const todayRow = attendance.find((row) => mine.has(String(row.counselor_id)) && String(row.date).slice(0, 10) === today && row.clock_in);
  if (todayRow) {
    return { state: todayRow.clock_out ? "finished" : "working", clockIn: todayRow.clock_in, clockOut: todayRow.clock_out || null, hours: todayRow.total_hours ?? null, leave: null };
  }
  const onLeave = leave.find((row) => mine.has(String(row.counselor_id)) && row.status === "approved"
    && String(row.start_date).slice(0, 10) <= today && String(row.end_date).slice(0, 10) >= today);
  if (onLeave) return { state: "leave", clockIn: null, clockOut: null, hours: null, leave: onLeave.leave_type || "leave" };
  const hasHistory = employee.aliases.some((id) => everClocked.has(id));
  return { state: hasHistory ? "not_clocked_in" : "unknown", clockIn: null, clockOut: null, hours: null, leave: null };
}

/** One list row. Never includes data beyond what the list shows. */
export function teamRow(employee, context) {
  const working = workingStatus(employee, context);
  return {
    id: employee.id, name: employee.name, email: employee.email, role: employee.role, roleLabel: employee.roleLabel,
    branches: employee.branches, account: employee.account, working: working.state,
  };
}

export function buildTeamList({ users, counselors, branches, scope, ...context }) {
  return buildEmployees({ users, counselors, branches })
    .filter((employee) => employeeVisible(scope, employee))
    .map((employee) => teamRow(employee, context))
    .sort((a, b) => a.roleLabel.localeCompare(b.roleLabel) || a.name.localeCompare(b.name));
}
