# Permission Matrix: launch contract v1 (FROZEN)

Stream 1, Milestone 1.1, step 2. Built from baseline commit `2bccf0942a9fdf262c8b953f54c319a470152b55` (`release/initial-mvp`).

**Status: frozen on 2026-11-04.** The five open decisions in Part B were set to the recommended defaults. The owner may
amend any of them until Stream 1 step 4 starts. After that, a change needs an explicit scope decision, and the contract
test `tests/launchContract.test.mjs` must change in the same commit.

Route data comes from the repository's own generator, `node scripts/access-route-inventory.mjs --matrix`, run on the
baseline. The full table (239 routes: 93 enforced, 108 ok, 0 gaps, 38 decisions) is in `route-matrix-2bccf09.md`.
Do not edit that file by hand. It is regenerated from `server/lib/routeAccessMatrix.mjs`.

## Part A. The contract: eight rules, each locked by a test

"Holds today" rules are enforced by passing tests. "Target" rules are agreed launch behaviour that the code does not yet
meet. Their tests are marked `todo` and are switched on when step 4 lands the change.

| Rule | Contract | At `2bccf09` | Test (`tests/launchContract.test.mjs`) |
|---|---|---|---|
| 1 | Super Admin creates Admins. Admin cannot create Admin, Branch Head or Super Admin. | Holds | Passing (2 tests) |
| 2 | Admin creates counselor, telecaller and accountant only inside assigned branches. Only Super Admin creates branches. | Holds **only when `ADMIN_SCOPE_ENFORCED=true`**. When off (the default) an Admin counts as "all branches". | Passing for the policy. Flag is a deployment requirement (Part C). |
| 3 | Branch Head employee creation is disabled. Delegation is deferred. | Holds: no grants are loaded | Passing (3 tests, including a source check that `POST /api/users` passes no grants) |
| 4 | Only Super Admin changes Admin or Branch Head accounts and their branch scope. Nobody changes their own role or branches. | Holds | Passing |
| 5 | Sign-up: public admin sign-up closed in production; telecaller self sign-up off; partner login Super Admin only. **Target:** no default password; public counselor sign-up cannot create new accounts. | First three hold. Target items do not: default `changeme123`, and public counselor sign-up creates accounts. | Three passing, two `todo` |
| 6 | Branch Head cannot remove or transfer staff. University delete, catalog clear, edit and CSV import are Super Admin only. | **Target.** Today both are open to Admin and Branch Head. | Two `todo` |
| 7 | Company-wide configuration (`/api/config/*`, comms rules, reminders, events, approve, retire) is Super Admin only. Branch Head cannot write checklists. | **Target.** Today Admin can write all of it. | Three `todo` |
| 8 | HR is off for this release: disabled unless `HR_ENABLED=true`. | **Target.** HR routes and screens are live. | One `todo` |

Current test result on the baseline: 19 tests, 11 pass, 0 fail, 8 `todo`.

## Part B. The five owner decisions, frozen at the recommended defaults

| # | Decision | Frozen as | Why | Cost to reverse before step 4 |
|---|---|---|---|---|
| 1 | Public counselor sign-up | **Closed for new accounts.** An Admin-created counselor still signs in through the existing path. | Today anyone with an email code gets a counselor login. It breaks the rule that Admin creates employees. `COUNSELOR_SIGNUP_CODE` is declared but never checked. | None |
| 2 | Telecaller self sign-up | **Off.** Leave `TELECALLER_SIGNUP_CODE` unset in production. Admin creates telecallers. | Same reason. Needs no code change. | None |
| 3 | Branch Head remove and transfer of staff | **Not allowed.** Admin (own branches) and Super Admin only. | Removing people is an account lifecycle action. Branch Head creation is already off. | None |
| 4 | HR at launch | **Off** behind `HR_ENABLED` (default off). | Your frozen scope says no HR in this release. **Risk:** counselor attendance and leave screens exist today, so step 4 must hide the screens as well as block the routes. | None. Say so now if existing counselors must keep attendance and leave. |
| 5 | The 38 shared-setting routes | Rulings in Part D | Company-wide settings that affect every branch should not be writable by every Admin on day one. They can be relaxed later. | None |

## Part C. Deployment requirements for the contract to hold

| Setting | Required value | Why |
|---|---|---|
| `ADMIN_SCOPE_ENFORCED` | `true`. **First** give every existing Admin at least one assigned branch: with the flag on, an Admin with no branch sees no branch data. | Rules 2 and 4 |
| `ADMIN_SIGNUP_CODE` | Unset in production | Rule 5 |
| `ADMIN_SIGNUP_OPEN` | Unset or `false`. **If `true` with no code, anyone can create an Admin.** | Rule 5 |
| `TELECALLER_SIGNUP_CODE` | Unset in production | Decision 2 |
| `HR_ENABLED` | Unset or `false` (after step 4 adds it) | Rule 8 |
| `IDENTITY_STRICT` | Owner decision. Not part of this contract. | Separate rollout switch |

## Part D. The 38 shared-setting routes and their frozen rulings

"Super Admin" means Super Admin only. "Unchanged" means the current guard stays.

| Area | Route | Who can call it today | Frozen ruling | Locked by |
|---|---|---|---|---|
| alert | `POST /api/alerts/raise` | admin, super_admin | Unchanged (Admin and Super Admin) | - |
| checklist | `PATCH /api/checklists/:id` | admin, super_admin, branch_head | Admin and Super Admin (drop Branch Head) | rule 7 |
| checklist | `POST /api/checklists` | admin, super_admin, branch_head | Admin and Super Admin (drop Branch Head) | rule 7 |
| comms | `PATCH /api/comms/rules/:id` | admin, super_admin | Super Admin only | rule 7 |
| comms | `PATCH /api/comms/templates/version/:id` | admin, super_admin | Admin and Super Admin (template author actions) | - |
| comms | `POST /api/comms/events/:event` | admin, super_admin | Super Admin only | rule 7 |
| comms | `POST /api/comms/reminders/run` | admin, super_admin | Super Admin only | rule 7 |
| comms | `POST /api/comms/rules` | admin, super_admin | Super Admin only | rule 7 |
| comms | `POST /api/comms/templates` | admin, super_admin | Admin and Super Admin (template author actions) | - |
| comms | `POST /api/comms/templates/:familyId/retire` | admin, super_admin | Super Admin only | rule 7 |
| comms | `POST /api/comms/templates/:familyId/revise` | admin, super_admin | Admin and Super Admin (template author actions) | - |
| comms | `POST /api/comms/templates/version/:id/approve` | admin, super_admin | Super Admin only | rule 7 |
| comms | `POST /api/comms/templates/version/:id/preview` | admin, super_admin, branch_head, counselor, telecaller, accountant | Unchanged (staff roles listed) | - |
| comms | `POST /api/comms/templates/version/:id/submit` | admin, super_admin, branch_head, counselor, telecaller, accountant | Unchanged (staff roles listed) | - |
| comms | `PUT /api/comms/auto-response` | admin, super_admin, branch_head, counselor, telecaller, accountant | Unchanged; step 4 confirms it edits only the caller's own setting | - |
| comms | `PUT /api/comms/reminders` | admin, super_admin | Super Admin only | rule 7 |
| config | `PATCH /api/config/documents/:id` | admin, super_admin | Super Admin only | rule 7 |
| config | `PATCH /api/config/reasons/:id` | admin, super_admin | Super Admin only | rule 7 |
| config | `PATCH /api/config/statuses/:id` | admin, super_admin | Super Admin only | rule 7 |
| config | `POST /api/config/checklists` | admin, super_admin | Super Admin only | rule 7 |
| config | `POST /api/config/checklists/:familyId/retire` | admin, super_admin | Super Admin only | rule 7 |
| config | `POST /api/config/checklists/:familyId/revise` | admin, super_admin | Super Admin only | rule 7 |
| config | `POST /api/config/checklists/version/:id/publish` | admin, super_admin | Super Admin only | rule 7 |
| config | `POST /api/config/documents` | admin, super_admin | Super Admin only | rule 7 |
| config | `POST /api/config/reasons` | admin, super_admin | Super Admin only | rule 7 |
| config | `POST /api/config/statuses` | admin, super_admin | Super Admin only | rule 7 |
| config | `PUT /api/config/checklists/version/:id/items` | admin, super_admin | Super Admin only | rule 7 |
| knowledge | `DELETE /api/knowledge/:id` | any signed-in | Admin and Super Admin (handler already enforces it) | - |
| knowledge | `POST /api/knowledge` | any signed-in | Admin and Super Admin (handler already enforces it) | - |
| knowledge | `PUT /api/knowledge/:id` | any signed-in | Admin and Super Admin (handler already enforces it) | - |
| other | `DELETE /api/universities/:id` | admin, super_admin, branch_head | Super Admin only | rule 6 |
| other | `DELETE /api/universities/catalog` | admin, super_admin, branch_head | Super Admin only | rule 6 |
| other | `PATCH /api/universities/:id` | admin, super_admin, branch_head | Super Admin only | rule 6 |
| other | `POST /api/universities/import-csv` | admin, super_admin, branch_head | Super Admin only | rule 6 |
| university | `POST /api/admin/universities/:id/assets` | admin, super_admin | Unchanged (Admin and Super Admin) | - |
| university | `POST /api/admin/universities/:id/info/publish` | admin, super_admin | Unchanged (Admin and Super Admin) | - |
| university | `POST /api/admin/universities/:id/info/unpublish` | admin, super_admin | Unchanged (Admin and Super Admin) | - |
| university | `PUT /api/admin/universities/:id/info` | admin, super_admin | Unchanged (Admin and Super Admin) | - |

## Part E. Roles at the baseline (reference)

Roles are defined in `server/lib/auth.mjs`. Branch-limited roles are `branch_head`, `counselor`, `telecaller`, `accountant`
(always). `admin` is branch-limited only when `ADMIN_SCOPE_ENFORCED=true`. `super_admin` is never limited.

| Role | Branch limit | Account management (`server/lib/accessPolicy.mjs`) |
|---|---|---|
| super_admin | None | Anyone, except changing own role or branches |
| admin | Assigned branches when the flag is on, all branches when off | Counselor, telecaller, accountant, student only, inside own branches |
| branch_head | Own branches | Nothing without a delegation grant (none loaded) |
| counselor, telecaller | Own branches | Self-service only |
| accountant | Own branches | Payroll and finance views, branch-scoped |
| partner | Own referrals | Cannot sign in until Super Admin activates the login |
| student | Own records | Own records only |

## Part F. Step 4 work this contract creates

| # | Change | Where | Turns on test |
|---|---|---|---|
| 1 | Remove the `changeme123` default; require a password or generate a one-time one | `server/routes/core.mjs`, `POST /api/users` (line 2868) | rule 5 |
| 2 | Refuse new accounts in public counselor sign-up; keep the existing-counselor sign-in branch | `server/routes/counselor.mjs`, `POST /api/counselor/auth/signup` | rule 5 |
| 3 | Staff remove and transfer: Admin and Super Admin only | `core.mjs`, `/api/counselors/:id/remove|transfer`, `/api/telecallers/:id/remove|transfer` | rule 6 |
| 4 | University delete, catalog clear, edit, CSV import: Super Admin only | `core.mjs`, `/api/universities/*` | rule 6 |
| 5 | Config writes, comms rules, reminders, events, approve, retire: Super Admin only | `core.mjs`, `server/routes/comms.mjs`, `server/routes/config.mjs` | rule 7 |
| 6 | Drop Branch Head from checklist writes | `/api/checklists` | rule 7 |
| 7 | `HR_ENABLED` flag: block HR routes and hide HR screens | `core.mjs`, `counselor.mjs`, portals | rule 8 |
| 8 | After each change: remove the `todo` option from its test, regenerate `route-matrix-2bccf09.md` as a new matrix file for the release commit, and update the verdicts in `server/lib/routeAccessMatrix.mjs` | `tests/`, `server/lib/routeAccessMatrix.mjs` | all |

## Not verified

- How the first Super Admin account is created. No seed was found. Check `user_roles` on staging and production.
- Behaviour with `ADMIN_SCOPE_ENFORCED=true` was read from code and comments, not run against a database.
- `PUT /api/comms/auto-response` is open to every staff role. Step 4 must confirm it only edits the caller's own setting.
- `POST /api/checklists` and `PATCH /api/checklists/:id`: their handlers were not read. The ruling removes Branch Head only.
