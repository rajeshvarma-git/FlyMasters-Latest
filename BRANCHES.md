# Branches, Branch Head and Accountant

Built against the CRM Portal role definitions document. What it says, and what
the code now does.

## The problem this fixed first

Migration 002 added `branch_id` to the **`student_leads` table**. But the
application reads leads from **`app_records`** (the JSONB store) 21 times and
from that table only 5 times. The column was on the side of the system the app
doesn't use, and **no route enforced scoping at all** — `req.scope` existed and
nothing consumed it.

Adding `branch_head` to the role list at that point would have produced a
branch head who signed in and saw every branch's data. Migration 004 puts
`branch_id` on `app_records`, which covers every blob-backed record type at
once, and `loadState()` — the single choke point that 3 routes share — now
filters by it.

## What the document asked for, and where it lives

| Document | Implementation |
|---|---|
| "Only the branch **or branches** assigned to the Branch Head" | `user_branches` junction — a person can hold several branches |
| "Cannot access other branches unless approved" | `branchScope` → `req.scope.branchIds`, applied in `loadState` and `scopedRows` |
| Admin: "Create accounts for Counsellors, Associates, Students, Tele callers, and Agents" | `POST /api/users` with `role` + `branchIds` |
| "Super Admin can create branch accounts directly" | `POST /api/branches`, admin and above |
| Accountant: "payroll, salaries, commissions, invoices, payout tracking across assigned branches" | `GET /api/hr/state`, accountant only, branch-scoped |
| "Salary, banking, tax... visible only to the employee, authorized approver, Accountant, Admin, Super Admin" | accountant is refused `/api/state`; admins keep HR access |

## Branch codes

Generated from the place so staff read something meaningful, not a UUID.
Suggested as you type, editable, uniqueness enforced by the server.

```
Ameerpet   + Hyderabad   ->  HYD-AME
Kukatpally + Hyderabad   ->  HYD-KUK
Vijayawada + Vijayawada  ->  VIJ
a collision              ->  HYD-AME2
```

## Who sees what

| | `/api/state` | `/api/hr/state` | `/api/branches` | Data |
|---|---|---|---|---|
| super_admin | yes | no | all | every branch |
| admin | yes | no | all | every branch |
| branch_head | yes | no | own only | own branches only |
| counselor | no | no | own only | own branches only |
| telecaller | no | no | own only | own branches only |
| accountant | **no** | yes | own only | own branches, finance only |

Verified against a live database with two branches:

```
admin       sees 3 leads: [Ameer1, Ameer2, Kukat1]   branches: [HO, HYD-AME, HYD-KUK]
branch_head sees 2 leads: [Ameer1, Ameer2]           branches: [HYD-AME]
```

Granting the branch head a second branch raised them to 3 leads; removing it
returned them to 2, with no redeploy — role and branches are re-read from the
database on every request.

## Refusals that are deliberate

- A branch-scoped role created with no branch is **refused**. An unscoped
  branch head either sees nothing or sees everything; neither is acceptable.
- `role: "partner"` is **not assignable**. Agents and freelancers never sign in
  — they are rows in `partners` with a referral code, a status link and
  WhatsApp updates. The database CHECK still permits the value so the migration
  stays reversible, but no API path can set it.
- An admin cannot assign a branch they do not themselves manage.
- Only a super admin can create another super admin.
- The accountant menu is restricted **and** so is the endpoint. Hiding a screen
  while leaving `/api/state` open would not be a restriction.

## Two bugs found and fixed while building this

1. **`jsonUpsert` would have moved records between branches.** The
   `ON CONFLICT` clause used `EXCLUDED.branch_id`, which carries the
   head-office default — so an ordinary edit to a Kukatpally lead would have
   silently dragged it to head office. It now uses the explicitly supplied
   branch, or leaves the existing one alone.
2. **Preflight checked the wrong table.** It counted unbranched leads in
   `student_leads` while the app reads `app_records`. It would have reported
   all-clear while leads were invisible to branch staff.

## Still to do

- **Counsellor and telecaller screens are not branch-filtered yet.** Their own
  routes (`/api/counselor/*`, `/api/telecaller/*`) filter by assigned user,
  which is narrower than branch in practice, but they do not yet apply
  `req.scope`. Worth doing before a counsellor ever works two branches.
- **Conversations, messages and notifications** are scoped by user, not branch.
  Correct today because each is addressed to one person; revisit if branch-wide
  inboxes are ever added.
- **Accountant screens are the existing HR page.** Commissions, invoices and
  payout tracking from section 7 of the document do not exist yet.
- **Branch-level reporting** from the document is not built.
