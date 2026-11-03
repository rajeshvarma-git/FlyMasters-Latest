# Onboarding Trace: screen to API to writer to database

Step 3 of Milestone 1.1. Read from baseline `2bccf0942a9fdf262c8b953f54c319a470152b55`. Nothing here was run against a database; every finding below is from reading code. Line numbers are `server/routes/core.mjs` unless stated.

## 1. The five creation paths

| # | Screen | API | Writer | Tables written | One transaction? |
|---|---|---|---|---|---|
| A | Admin > Users (`src/portals/admin/admin/Users.tsx:104`) | `POST /api/users` (2866) | `createAccount` (`server/lib/accountWrites.mjs`) | `auth_users`, `user_roles`, `user_branches` | **Yes, for these three only** |
| A2 | same, role = counselor | same | `INSERT INTO counselor_users`, `jsonUpsert("counselors")` | `counselor_users`, `app_records` | **No. After the commit.** |
| A3 | same, any role | same | `jsonUpsert("profiles")` | `app_records` (table `profiles`) | **No. After the commit.** |
| B | Admin sign-up page (`AuthContext.signUp`) | `POST /api/auth/signup` (1625) | `createAccount`, then `jsonUpsert("profiles")` | as A, role `admin`, no branch | No for profile |
| C | Telecaller sign-up | `POST /api/auth/telecaller-signup` (1681) | `createAccount` (`allowUnassigned`), then profile, then notifications | as A | No for profile |
| D | Counselor portal sign-up | `POST /api/counselor/auth/signup` (`counselor.mjs` 944) | `INSERT counselor_users`, then `publishCounselorAccount` to `createAccount`, `profiles`, `counselors` | all of the above | No |
| E | Student app | `POST /__auth` (`server/routes/student.mjs`) | not traced | not traced | not traced |

## 2. Login path (all staff roles)

1. Screen `src/shared/StaffSignIn.tsx` posts to `POST /api/auth/signin` (1753).
2. The server limits attempts per email (8) and per IP (30) in memory, in 15 minutes. The counter is per process, so it is not shared across instances.
3. Password is checked against `auth_users.password` (scrypt). Older non-scrypt hashes are upgraded on a good sign-in.
4. `resolveAccountIdentity` reads `user_roles` and `user_branches` and refuses disabled or role-less accounts before any token is issued.
5. The profile name and phone come from `jsonTable("profiles")`, which loads every profile row and filters in memory.
6. `signUser` issues a JWT, valid 7 days. The screen stores it with `setToken`, then moves to `HOME_FOR_ROLE[role]`.
7. Every later request goes through `session` (`server/lib/auth.mjs`), which **re-reads role, enabled state and branches from SQL**. A demoted or disabled account loses access on its next request, even with a valid token.
8. On a page load the admin portal calls `GET /api/me` (`AuthContext.boot`). A failed call clears the user.

Sign-out is `clearAuth()` in the browser only. There is no refresh endpoint and no server-side token revocation. The token stays valid for its 7 days, but `session` still blocks a disabled account.

## 3. Confirmed inconsistencies (ranked for Step 4)

| # | Finding | Evidence | Effect | Fix |
|---|---|---|---|---|
| T1 | **Half-created accounts.** The login, role and branches commit first. The profile write (and for counselors the `counselor_users` and `counselors` writes) run afterwards, outside the transaction. | `core.mjs` 2938 and 2955 onward (A); 1664 (B); 1715 (C) | If a later write fails, the person can sign in, has no profile (or no counselor row), and a retry returns "An account with this email already exists." | Write the profile and counselor rows with the same client inside `createAccount`, or delete the new account on failure. Test: force the profile write to fail and assert no `auth_users` row remains. |
| T2 | **`POST /api/users` has no `try/catch` around the writes after `createAccount`.** The app uses Express 4 (`^4.21.2`) with no async wrapper. | `core.mjs` 2866 onward; no `try` anywhere in the handler | A thrown error in the profile or counselor insert becomes an unhandled promise rejection, and the request can hang instead of returning a clean 500. | Wrap the handler body, same shape as B and C. |
| T3 | `changeme123` default password. | 2868 | Anyone who knows the default can sign in as a new account when the creator sent no password. | Already Step 4 item 1. |
| T4 | Public counselor sign-up creates accounts with no admin action. | `counselor.mjs` 992 to 1001 | Matrix rule 5. | Already Step 4 item 2. |
| T5 | Two stored passwords for a counselor created in A2: scrypt in `auth_users` and bcrypt in `counselor_users`. A password reset in one place does not change the other. | 2955 (bcrypt) and 2924 (scrypt) | Counselor portal and admin portal can disagree about the password. UNVERIFIED which store each counselor sign-in reads. | Decide the single source before launch. Do not fix in Step 4 unless a test shows a real mismatch. |
| T6 | `INSERT INTO counselor_users ... ON CONFLICT (email) DO UPDATE` overwrites an existing row's password and profile fields. | 2955 | Creating a counselor whose email exists only in `counselor_users` replaces that row's password. | Refuse when a `counselor_users` row exists for an email that is not in `auth_users`. Low severity. |
| T7 | Profiles are JSON rows in `app_records`, and sign-in and `/api/me` load all of them each time. | 1784, 1798 | Correct but gets slower with more people. Not a launch blocker. | Record only. |

## 4. What already holds (so Step 5 can lock it)

- Duplicate email: pre-check plus the unique index; error code 23505 is mapped to 400 in `createAccount`.
- Login, role and branches are created together or not at all (`inTransaction`). A branch-scoped role with no branch is refused unless `allowUnassigned`.
- A caller cannot assign a branch they do not hold, and unknown branches are refused (2866 to 2921).
- Branch Head creation is refused by `decideAccountAction` (locked by `tests/launchContract.test.mjs`).
- A disabled or role-less account never gets a token (step 4 of section 2).

## 5. Step 4 order, with the trace added

1. T3, remove `changeme123` (contract rule 5).
2. T4, close public counselor creation (rule 5).
3. **T1 and T2, make account creation all-or-nothing and return clean errors.** This is the main finding of this step and is not in the permission matrix.
4. Staff remove and transfer (rule 6), university rules (rule 6), config and comms rules (rule 7), checklists (rule 7).
5. `HR_ENABLED` (rule 8).

## 6. Not verified

- Student sign-in (`/__auth`) and the counselor portal's own sign-in route were not read.
- Which password store the counselor portal reads (T5).
- No database was run. T1 and T2 follow from the code order; Step 5 proves them with a failing-write test.
- The first Super Admin is still not created anywhere in the code or migrations read.
