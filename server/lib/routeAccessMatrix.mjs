// ACCESS-03A: the reviewed action and target-scope rule for every HTTP route.
//
// The route list itself comes from scripts/access-route-inventory.mjs (read from the source), so a
// new route cannot slip in unclassified: tests/routeMatrix.test.mjs fails until it is reviewed here.
// Verdicts were set by reading each handler; they are statements to keep true, and the test checks
// them against the code (an "enforced" route must really apply scope, a "gap" route must still lack it).
//
// scope (what the route's TARGET is, and so what limits the caller):
//   public           no sign-in
//   own              the caller's own records only (student, partner, telecaller, counselor self-service)
//   branch           rows belong to a branch; the caller must be limited to branches they hold
//   global-config    settings and catalogs shared by every branch (not branch-owned data)
//   super-only       Super Admin only
//   viewer-policy    the student app's generic data API, decided by server/student/dataPolicy.ts
// verdict:
//   enforced         the handler limits the caller (detected in code, or via the account policy)
//   ok               nothing branch-owned is reachable, or access is the caller's own
//   gap              branch-owned data or action with NO branch check: must be fixed (03B follow-up)
//   decision         shared configuration that any Admin/Branch Head can still change: owner must decide
//   needs-review     could not be classified from the code alone

export const SCOPES = ["public", "own", "branch", "global-config", "super-only", "viewer-policy"];
export const VERDICTS = ["enforced", "ok", "gap", "decision", "needs-review"];

// Account management is decided by server/lib/accessPolicy.mjs (ACCESS-03B).
const POLICY = {
  "PUT /api/users/:id/role": "staff.role.change",
  "PUT /api/users/:id/password": "staff.password.reset",
  "PUT /api/users/:id/branches": "staff.branches.change",
  "POST /api/users": "staff.create",
};

// Explicit action names that are not just "<area>.read|write".
const ACTION_OVERRIDES = {
  ...POLICY,
  "POST /api/branches": "branch.create",
  "PATCH /api/branches/:id": "branch.update",
  "POST /api/counselors/:id/transfer": "staff.transfer",
  "POST /api/telecallers/:id/transfer": "staff.transfer",
  "POST /api/counselors/:id/remove": "staff.remove",
  "POST /api/telecallers/:id/remove": "staff.remove",
  "PUT /api/partners/:id/login": "partner.login.set",
  "POST /api/leads/:id/branch": "lead.branch.move",
  "POST /api/leads/bulk-assign": "lead.assign",
  "POST /api/leads/bulk-assign-telecaller": "lead.assign",
};

// Branch-owned data or actions that no branch check protects today (found by reading each handler).
const GAPS = {
  "GET /api/students/:id/checklist": "reads any student's checklist and documents by id",
  "PATCH /api/leave/:id": "approves or rejects any counselor's leave",
  "POST /api/notifications": "sends a notification to any user id",
  "POST /api/notifications/broadcast": "broadcasts across all users",
  "GET /api/whatsapp/conversations": "Admin sees every branch's conversations (staffCanViewConversation)",
  "GET /api/whatsapp/conversations/:id/messages": "Admin reads any conversation",
  "POST /api/whatsapp/messages": "Admin-type sender is not branch-limited",
  "POST /api/whatsapp/conversations/:id/read": "any conversation",
  "POST /api/whatsapp/sync-staff": "re-routes conversations across all branches",
  "GET /api/system/alerts": "not branch-filtered",
  "POST /api/system/alerts/run": "runs alerts for every branch",
  "POST /api/system/auto-assign": "assigns telecallers across all branches",
  "PATCH /api/partners/:id": "edits any partner",
  "POST /api/leads/:id/referral": "attaches a referral to any lead",
  "PATCH /api/finance/payments/:id": "updates any payment; the other finance routes check the branch",
  "GET /api/comms/supervision/:kind/:id": "any Admin reads any conversation",
  "POST /api/comms/supervision/:kind/:id/join": "any Admin joins any conversation",
  "POST /api/comms/supervision/:kind/:id/message": "any Admin posts into any conversation",
  "PATCH /api/comms/escalations/:id": "any Admin handles any escalation",
  "GET /api/comms/consent": "reads consent for any subject",
  "PUT /api/comms/consent": "changes consent for any subject",
  "POST /api/salary": "posts a salary record and notification for any counselor id; the counselor's branch is not checked",
};

// Handlers that read and change nothing: they only refuse. Safe by construction.
const REFUSES = {
  "POST /api/leads/:id/convert": "the handler only answers 403 (conversion is done from the counselor portal); nothing is read or changed",
};

// Shared configuration changeable by Admin/Branch Head: not branch data, but it affects every branch.
const DECISION_PREFIXES = ["/api/comms/templates", "/api/comms/rules", "/api/comms/reminders", "/api/comms/events", "/api/comms/auto-response",
  "/api/config/", "/api/checklists", "/api/universities", "/api/admin/", "/api/alerts/raise", "/api/knowledge"];

const AREAS = [
  ["/__", "student-data"], ["/api/case", "case"], ["/api/comms", "comms"], ["/api/config", "config"], ["/api/students", "student"],
  ["/api/student-checklist-items", "student"], ["/api/leads", "lead"], ["/api/telecaller", "telecaller"], ["/api/counselor", "counselor"],
  ["/api/document-setup", "document"], ["/api/documents", "document"], ["/api/applications", "application"], ["/api/leave", "hr"],
  ["/api/salary", "hr"], ["/api/hr", "hr"], ["/api/finance", "finance"], ["/api/partners", "partner"], ["/api/partner", "partner"],
  ["/api/branches", "branch"], ["/api/notifications", "notification"], ["/api/system", "system"], ["/api/whatsapp", "whatsapp"],
  ["/api/university", "university"], ["/api/admin", "university"], ["/api/checklists", "checklist"], ["/api/alerts", "alert"],
  ["/api/knowledge", "knowledge"], ["/api/state", "state"], ["/api/auth", "auth"], ["/api/me", "me"], ["/api/referral", "referral"],
  ["/api/health", "health"], ["/api/users", "staff"], ["/api/counselors", "staff"], ["/api/telecallers", "staff"],
];
const area = (path) => (AREAS.find(([p]) => path.startsWith(p)) || [null, "other"])[1];

const ADMINISH = ["admin", "super_admin", "branch_head", "accountant"];

/** route = { key, method, path, who: [roles], scoped: boolean } from the inventory. */
export function classifyRoute(route) {
  const { key, method, path, who, scoped } = route;
  const action = ACTION_OVERRIDES[key] || `${area(path)}.${method === "GET" ? "read" : "write"}`;
  const base = { key, action, who };

  if (who.length === 1 && who[0] === "public") return { ...base, scope: "public", verdict: "ok", note: "no sign-in; no account or branch data" };
  if (path.startsWith("/__")) {
    return path === "/__public_media"
      ? { ...base, scope: "public", verdict: "ok", note: "public images only; student documents are never served here" }
      : { ...base, scope: "viewer-policy", verdict: path === "/__auth" ? "ok" : "enforced", note: "decided by dataPolicy.ts; admins are global viewers only while ADMIN_SCOPE_ENFORCED is off, and branch-aware access for scoped Admins is not built yet" };
  }
  if (POLICY[key]) return { ...base, scope: "branch", verdict: "enforced", note: "checked by accessPolicy.mjs before any write (self-change, whole target scope, privileged roles, delegation)" };
  if (who.length === 1 && who[0] === "super_admin") return { ...base, scope: "super-only", verdict: "enforced", note: "Super Admin only" };
  if (REFUSES[key]) return { ...base, scope: "branch", verdict: "ok", note: REFUSES[key] };
  if (GAPS[key]) return { ...base, scope: key.includes("/branches") ? "global-config" : "branch", verdict: "gap", note: GAPS[key] };

  const adminish = who.some((w) => ADMINISH.includes(w));
  if (!adminish && !who.includes("any signed-in")) {
    return { ...base, scope: "own", verdict: "ok", note: `${who.join("/")} self-service: limited to the caller's own records or assignments (not changed by ACCESS-03)` };
  }
  if (scoped) return { ...base, scope: "branch", verdict: "enforced", note: "branch scope applied in the handler (detected in code)" };
  if (DECISION_PREFIXES.some((p) => path.startsWith(p)) && method !== "GET") {
    return { ...base, scope: "global-config", verdict: "decision", note: "shared setting, writable by every Admin/Branch Head in the list; owner must decide who may change it" };
  }
  if (DECISION_PREFIXES.some((p) => path.startsWith(p)) || /^\/api\/(university-catalog|university-programs|university-info)/.test(path) || path === "/api/branches/suggest-code" || path === "/api/config/statuses") {
    return { ...base, scope: "global-config", verdict: "ok", note: "reads shared configuration, not branch-owned data" };
  }
  if (path.startsWith("/api/case/me") || key === "POST /api/comms/escalations" || key === "GET /api/comms/auto-response/resolve" || path.startsWith("/api/notifications/read") || path.startsWith("/api/alerts/") || path === "/api/me" || path.startsWith("/api/me/") || path.startsWith("/api/student/")) {
    return { ...base, scope: "own", verdict: "ok", note: "the caller's own records" };
  }
  return { ...base, scope: "branch", verdict: "needs-review", note: "admin-reachable and no scope check detected; read the handler and classify" };
}

export const classifyAll = (routes) => routes.map(classifyRoute);