# Employee and User Onboarding Path Map

Step 2, task S1-M1.2-02. Built from baseline commit `2bccf0942a9fdf262c8b953f54c319a470152b55`. Every path below was read
from the code. Line numbers are for `server/routes/core.mjs` and `server/routes/counselor.mjs` at that commit and may shift.

## Paths by role

| Role | How the account is created | Who can do it | Branch assignment | Notes |
|---|---|---|---|---|
| Super Admin | `POST /api/users` with role `super_admin` | Super Admin only (the route says so explicitly) | None needed | The first Super Admin is **not created anywhere in the code or migrations I read**. UNVERIFIED: check `user_roles` on staging and production. |
| Admin | (a) `POST /api/users` with role `admin` | Super Admin only. An Admin asking for this is refused. | `PUT /api/users/:id/branches`, Super Admin only for Admin accounts | Needs at least one assigned branch once `ADMIN_SCOPE_ENFORCED=true`, otherwise the Admin sees no branch data. |
| Admin | (b) Public `POST /api/auth/signup` | Anyone with the sign-up code | None at creation | **Closed in production unless `ADMIN_SIGNUP_CODE` is set or `ADMIN_SIGNUP_OPEN=true`.** With `ADMIN_SIGNUP_OPEN=true` and no code, anyone can create an Admin. |
| Branch Head | `POST /api/users` with role `branch_head` | Super Admin only (privileged role) | Super Admin assigns branches | Cannot create employees: `NEEDS_DELEGATION` (no grants loaded). |
| Counselor | (a) `POST /api/users` with role `counselor` | Admin or Super Admin. At least one branch is required. An Admin can only use branches they hold. | At creation | Refused with 400 if no branch is given. |
| Counselor | (b) Public `POST /api/counselor/auth/signup` | Anyone with a verified email code | **None. Created "pending" with no branch.** | No branch access until an Admin assigns one. `COUNSELOR_SIGNUP_CODE` exists in config but is never checked. |
| Telecaller | (a) `POST /api/users` with role `telecaller` | Admin or Super Admin, branch required, same rules as counselor | At creation | |
| Telecaller | (b) Public `POST /api/auth/telecaller-signup` | Anyone with `TELECALLER_SIGNUP_CODE` | Not read | Returns 403 "Self signup is switched off" when the code is unset. |
| Accountant | `POST /api/users` with role `accountant` | Admin or Super Admin, branch required | At creation | |
| Student | Student app sign-in `POST /__auth` (public), or `POST /api/users` with role `student` (default role) | Student self-service, or Admin or Super Admin | Through the lead's branch | |
| Partner (agent) | Partner record, then `PUT /api/partners/:id/login` | Super Admin only | n/a | Partners never sign in until a Super Admin activates the login. |

## Rules that apply to every `POST /api/users` request

In the order the handler checks them:

1. Email required, password at least 6 characters. **If no password is sent it defaults to `changeme123`.**
2. Role must be in the assignable list (`partner` is excluded on purpose).
3. Only a Super Admin can create a Super Admin.
4. `decideAccountAction` (`server/lib/accessPolicy.mjs`) judges role and branches. Admin: counselor, telecaller, accountant, student only, inside own branches. Branch Head: denied without a delegation grant.
5. A branch-limited role must have at least one branch.
6. A caller who is not unrestricted cannot assign branches they do not hold.
7. Every branch must exist; the email must be new.
8. Login, role and branches are written together in one transaction, then the action is audited (`user.create`).

## Where this maps to launch rules

| Launch rule | Path that satisfies it | Path that breaks it today |
|---|---|---|
| Super Admin creates Admins | `POST /api/users` | Public admin sign-up if enabled |
| Admin creates ordinary employees in assigned branches | `POST /api/users` with `ADMIN_SCOPE_ENFORCED=true` | Same route with the flag off: Admin can use any branch |
| Branch Head employee creation disabled | `POST /api/users` returns `NEEDS_DELEGATION` | None found |
| Nobody gets access without an owner's decision | Pending counselor has no branch access | Public counselor sign-up creates a login without any Admin action |

## Decisions needed before launch

1. Keep or close public counselor self sign-up (`POST /api/counselor/auth/signup`).
2. Keep or close telecaller self sign-up (set or unset `TELECALLER_SIGNUP_CODE`).
3. Remove the `changeme123` default password.
4. Set `ADMIN_SCOPE_ENFORCED=true` after every Admin has an assigned branch.
5. Confirm how the first Super Admin is created in each environment.

## Not verified

Behaviour was read from code, not run. The telecaller sign-up branch assignment and the exact first screen each role lands on
were not read.
