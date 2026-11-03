# Permission Matrix (launch contract)

Step 2, task S1-M1.2-01. Built from baseline commit `2bccf0942a9fdf262c8b953f54c319a470152b55` (`release/initial-mvp`).
Route data comes from the repository's own generator, `node scripts/access-route-inventory.mjs --matrix`, run on that commit.
The full generated table is in `route-matrix-2bccf09.md`. Do not edit that file by hand: it is regenerated from
`server/lib/routeAccessMatrix.mjs`.

**Result at the baseline:** 239 routes. 93 enforced, 108 ok, 0 gaps, 38 decisions, 0 needing review.
The 38 decisions are all writes to shared settings (listed in Part C) that need an owner ruling.

## Part A. Launch rules compared with what the code does today

| # | Launch rule | What the code does at `2bccf09` | Where | Status |
|---|---|---|---|---|
| 1 | Super Admin creates Admins | `POST /api/users`: an Admin asking for role `admin` is refused (`NEEDS_HIGHER_AUTHORITY`). **But** public `POST /api/auth/signup` also creates `admin` accounts when the sign-up code matches. | `server/lib/accessPolicy.mjs`, `server/routes/core.mjs` (`/api/auth/signup`) | Holds only if public admin sign-up is closed in production |
| 2 | Super Admin assigns Admin branch scope | `PUT /api/users/:id/branches` is policy-checked: an Admin cannot manage Admin or Branch Head accounts, and nobody changes their own branches. | `accessPolicy.mjs`, `core.mjs` | Holds |
| 3 | Admin creates ordinary employees only inside assigned branches | Policy allows Admin to create counselor, telecaller, accountant and student, and only for branches the Admin holds. **This is enforced only when `ADMIN_SCOPE_ENFORCED=true`.** When it is off (the default) every Admin is treated as "all branches". | `accessScope.mjs`, `auth.mjs` (`branchScope`) | **Not enforced by default** |
| 4 | Branch Head employee creation disabled | `POST /api/users` for a Branch Head returns `NEEDS_DELEGATION` because no delegation grants are loaded. Creating the `branch_head` role itself needs Super Admin. | `accessPolicy.mjs` | Holds, by absence of grants. Make it explicit with a test. |
| 5 | Delete reserved for Super Admin | There is no generic delete route at the baseline. Destructive routes that exist: `DELETE /api/universities/:id` and `DELETE /api/universities/catalog` (Admin, Super Admin, Branch Head); `POST /api/counselors/:id/remove` and `POST /api/telecallers/:id/remove` (Admin, Super Admin, Branch Head, branch-scoped). | `core.mjs` | **Not Super Admin only** |
| 6 | Only Super Admin creates branches | `POST /api/branches` is refused for any caller that is branch-limited. With `ADMIN_SCOPE_ENFORCED` off, an Admin is not branch-limited and can create a branch. | `core.mjs` (~line 3779) | Same dependency as rule 3 |
| 7 | Partner (agent) logins | `PUT /api/partners/:id/login` is Super Admin only. | `core.mjs` | Holds |
| 8 | HR excluded | HR routes still exist in the baseline: `GET /api/hr/state` (Admin, Super Admin, Accountant); `PATCH /api/leave/:id` and `POST /api/salary` (Admin, Super Admin, Branch Head); counselor `POST /api/counselor/attendance`, `PATCH /api/counselor/attendance/:id` and `POST /api/counselor/leave`. Excluding HR means hiding the screens or blocking these routes; nothing does that today. Note that a Branch Head can write salary records. | `core.mjs`, `counselor.mjs`, matrix | **Open** |

## Part B. Roles at the baseline

Roles are defined in `server/lib/auth.mjs` (`ROLES`). Branch-limited roles are `branch_head`, `counselor`, `telecaller`, `accountant`
(always). `admin` is branch-limited only when `ADMIN_SCOPE_ENFORCED=true`. `super_admin` is never limited.

| Role | Branch limit | Account management (via `accessPolicy.mjs`) |
|---|---|---|
| super_admin | None | Anyone, except changing own role or branches |
| admin | Assigned branches when the flag is on, all branches when off | Counselor, telecaller, accountant, student only, inside own branches |
| branch_head | Own branches | Nothing without a delegation grant (none loaded). Can still call staff remove and transfer routes inside own branches. |
| counselor, telecaller | Own branches | Self-service only |
| accountant | Own branches | Payroll and finance views, branch-scoped |
| partner | Own referrals | Cannot sign in until Super Admin activates the login |
| student | Own records | Own records only |

## Part C. The 38 routes that need an owner ruling

Shared settings that any listed role can change today. "Proposed" is a suggestion for the owner to confirm or change. It is not
a rule until you decide.

| Area | Route | Who can call it today | Owner ruling |
|---|---|---|---|
| alert | `POST /api/alerts/raise` | admin, super_admin | OWNER TO DECIDE |
| checklist | `PATCH /api/checklists/:id` | admin, super_admin, branch_head | OWNER TO DECIDE |
| checklist | `POST /api/checklists` | admin, super_admin, branch_head | OWNER TO DECIDE |
| comms | `PATCH /api/comms/rules/:id` | admin, super_admin | OWNER TO DECIDE |
| comms | `PATCH /api/comms/templates/version/:id` | admin, super_admin | OWNER TO DECIDE |
| comms | `POST /api/comms/events/:event` | admin, super_admin | OWNER TO DECIDE |
| comms | `POST /api/comms/reminders/run` | admin, super_admin | OWNER TO DECIDE |
| comms | `POST /api/comms/rules` | admin, super_admin | OWNER TO DECIDE |
| comms | `POST /api/comms/templates/:familyId/retire` | admin, super_admin | OWNER TO DECIDE |
| comms | `POST /api/comms/templates/:familyId/revise` | admin, super_admin | OWNER TO DECIDE |
| comms | `POST /api/comms/templates/version/:id/approve` | admin, super_admin | OWNER TO DECIDE |
| comms | `POST /api/comms/templates/version/:id/preview` | admin, super_admin, branch_head, counselor, telecaller, accountant | OWNER TO DECIDE |
| comms | `POST /api/comms/templates/version/:id/submit` | admin, super_admin, branch_head, counselor, telecaller, accountant | OWNER TO DECIDE |
| comms | `POST /api/comms/templates` | admin, super_admin | OWNER TO DECIDE |
| comms | `PUT /api/comms/auto-response` | admin, super_admin, branch_head, counselor, telecaller, accountant | OWNER TO DECIDE |
| comms | `PUT /api/comms/reminders` | admin, super_admin | OWNER TO DECIDE |
| config | `PATCH /api/config/documents/:id` | admin, super_admin | OWNER TO DECIDE |
| config | `PATCH /api/config/reasons/:id` | admin, super_admin | OWNER TO DECIDE |
| config | `PATCH /api/config/statuses/:id` | admin, super_admin | OWNER TO DECIDE |
| config | `POST /api/config/checklists/:familyId/retire` | admin, super_admin | OWNER TO DECIDE |
| config | `POST /api/config/checklists/:familyId/revise` | admin, super_admin | OWNER TO DECIDE |
| config | `POST /api/config/checklists/version/:id/publish` | admin, super_admin | OWNER TO DECIDE |
| config | `POST /api/config/checklists` | admin, super_admin | OWNER TO DECIDE |
| config | `POST /api/config/documents` | admin, super_admin | OWNER TO DECIDE |
| config | `POST /api/config/reasons` | admin, super_admin | OWNER TO DECIDE |
| config | `POST /api/config/statuses` | admin, super_admin | OWNER TO DECIDE |
| config | `PUT /api/config/checklists/version/:id/items` | admin, super_admin | OWNER TO DECIDE |
| knowledge | `DELETE /api/knowledge/:id` | any signed-in | OWNER TO DECIDE |
| knowledge | `POST /api/knowledge` | any signed-in | OWNER TO DECIDE |
| knowledge | `PUT /api/knowledge/:id` | any signed-in | OWNER TO DECIDE |
| other | `DELETE /api/universities/:id` | admin, super_admin, branch_head | OWNER TO DECIDE |
| other | `DELETE /api/universities/catalog` | admin, super_admin, branch_head | OWNER TO DECIDE |
| other | `PATCH /api/universities/:id` | admin, super_admin, branch_head | OWNER TO DECIDE |
| other | `POST /api/universities/import-csv` | admin, super_admin, branch_head | OWNER TO DECIDE |
| university | `POST /api/admin/universities/:id/assets` | admin, super_admin | OWNER TO DECIDE |
| university | `POST /api/admin/universities/:id/info/publish` | admin, super_admin | OWNER TO DECIDE |
| university | `POST /api/admin/universities/:id/info/unpublish` | admin, super_admin | OWNER TO DECIDE |
| university | `PUT /api/admin/universities/:id/info` | admin, super_admin | OWNER TO DECIDE |

Proposed defaults, by area:
- **comms (13)** and **config (11)**: company-wide messaging and configuration that affect every branch. Proposed: Super Admin only for publish, approve, retire and rule changes; keep preview and submit for staff.
- **university deletes and import** (4 routes under "other"): destructive and company-wide. Proposed: Super Admin only.
- **knowledge (3)**: the handler already restricts changes to Admin and Super Admin (`EDIT_ROLES` in `server/routes/knowledge.mjs`). The matrix says "any signed-in" only because it reads the route guard, not the handler. Proposed: keep.
- **checklist (2)** and **alert (1)**: owner decides.

## Part D. Changes needed to meet the launch contract

| # | Change | Where |
|---|---|---|
| 1 | Set `ADMIN_SCOPE_ENFORCED=true`. **First** give every existing Admin at least one assigned branch: an Admin with no branch gets no branch access once it is on. | Environment (Railway), `server/lib/accessScope.mjs` |
| 2 | Keep public admin sign-up closed in production. `ADMIN_SIGNUP_CODE` unset and `ADMIN_SIGNUP_OPEN` not `true`. **If `ADMIN_SIGNUP_OPEN=true` and no code is set, anyone can create an Admin.** | Environment, `core.mjs` `/api/auth/signup` |
| 3 | Decide whether public counselor sign-up stays. `POST /api/counselor/auth/signup` needs only an email verification code. `COUNSELOR_SIGNUP_CODE` is declared and imported but never checked, so it protects nothing. | `server/routes/counselor.mjs` |
| 4 | Remove the default password. `POST /api/users` falls back to `changeme123` when no password is sent. Require a password or generate a one-time one. | `core.mjs` (~line 2866) |
| 5 | Decide Branch Head remove and transfer of staff (`/api/counselors/:id/remove|transfer`, `/api/telecallers/:id/remove|transfer`). | `core.mjs` |
| 6 | Apply the Part C rulings to the 38 routes. | `routeAccessMatrix.mjs` verdicts and the route guards |
| 7 | Move destructive deletes to Super Admin only. | `core.mjs` university delete routes, staff remove routes |
| 8 | Hide or block HR screens and routes for launch. | Portals and `core.mjs` |
| 9 | Add contract tests, `tests/launchContract.test.mjs`, using the pure function `decideAccountAction`. Cases: Branch Head cannot create staff, Admin cannot create Admin, Admin cannot act outside assigned branches. | `tests/` |

## Not verified

- How the first Super Admin account is created: no seed was found in the migrations or scripts. Check `user_roles` on staging and production.
- Behaviour with `ADMIN_SCOPE_ENFORCED=true`: read from code and comments, not run. Tests were not run for this document.
- Telecaller sign-up branch assignment (`/api/auth/telecaller-signup`) was not read.
