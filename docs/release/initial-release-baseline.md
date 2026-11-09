# Initial Release Baseline

Task S1-M1.1-01. Facts below were read from the public GitHub history of
`rajeshvarma-git/FlyMasters-Latest` on 2026-11-04. Anything that needs the developer's machine, CI
or staging is marked **UNVERIFIED** with the check that settles it.

## Current state (updated 2026-11-05, after the merge)

Base for this update: `main` at `e03afb9` (GitHub merge of PR #2, `release/initial-mvp` at `60cd9f9`).

### What `main` contains now
- All ACCESS work (01, 02, 03A, 03B) **and** ACCESS-03C-1 (delegation grants, migration `008`). Nothing issues delegation grants yet, so it is dormant.
- Referral tracking (`feat/referral-tracking`) and the telecaller portal (`feat/telecaller-portal`), merged into the release.
- Record deletion (`POST /api/admin/delete/:kind/:id`) is **Super Admin only**: the telecaller branch's Admin delete allowance was reverted (`cdc810c`).
- Telecaller HR follows the single `HR_ENABLED` switch and is off unless it is on (`60cd9f9`). `TELECALLER_HR_ENABLED=true` or `false` overrides it for telecallers only.
- Dependencies: non-breaking `npm audit fix`; `serve` is a devDependency.
- Staff remove and transfer (`/api/{telecallers,counselors}/:id/{remove,transfer}`): Admin and Super Admin (S1-M1.1 step 4c), resolved in favour of the release rule when the telecaller branch was merged.

### Migrations
- Required: `001` to `009` (`server/migrations/`). `008` adds the delegation-grants table; `009` widens the HR id columns to TEXT.
- `008` was edited after its first commit. The runner tracks by file name, so a database that applied the old `008` is not re-migrated; any change to grants later needs a new migration (`010` or later).
- A deployed test environment booted from `main` on 2026-11-04 and logged `Database schema up to date`.

### Changes on this branch (`fix/s1-m1-onboarding-acceptance`, on top of `main` at `e03afb9`)
1. Counselor creation (`POST /api/users`): when a write fails after the login is saved, the cleanup now also removes the `counselor_users` row the request created, and restores a `counselor_users` row that already existed for that email (the request used to overwrite it). Pre-existing records are preserved.
2. Telecaller queue (`GET /api/telecaller/state`): a lead is in the queue only when it is assigned to the telecaller **and** sits in a branch they currently belong to. The queue used to load all leads and filter by assignment alone, so a stale or wrong assignment could show a lead from another branch. A lead with no branch stays out of every branch-scoped queue until an admin assigns one.
3. Telecaller access by direct id (S1-M1.2): one rule for every route that takes a lead, chat or WhatsApp thread id: the lead is assigned to the caller **now** and sits in a branch they belong to **now** (`ownedLead` and `ownedStudentLead` take the caller's `req.scope` and reuse `checkLeadInScope`; the scope argument is required so a new route cannot omit it). Covered: contact, patch, convert, WhatsApp send by lead id, open chat, send chat message, mark chat read, the counselor "convert as telecaller" route, and the shared `/api/whatsapp/*` list, messages, send and read routes for telecallers (`managerSeesConversation` leaves telecallers to assignment alone, so they now also go through `telecallerOwnsThread`). The chat and WhatsApp-thread lists in `GET /api/telecaller/state` and `GET /api/telecaller/whatsapp` follow the same rule. Every check runs before any write, notification or outbound message. Behaviour changes to know about: a WhatsApp thread whose lead cannot be found is refused, not guessed; a telecaller with no branch cannot add a lead (it would have no branch and be invisible to everyone, including them).

### Verification actually run (2026-11-05, local, Linux, Node 22)
| Check | Result |
|---|---|
| `npm run typecheck` | passed |
| `npm run build` | passed |
| `main` at `e03afb9`, full suite against a real PostgreSQL 17.5 | 622 tests, 622 passed, 0 failed, 0 skipped (first run of the 58 database tests) |
| This branch, full suite against PostgreSQL 17.5 | 660 tests, 660 passed, 0 failed, 0 skipped |
| This branch, no database (default `npm test`) | 568 passed, 0 failed, 92 skipped (the database tests) |
| New tests without the telecaller access fix | 16 failed (contact, patch, convert and WhatsApp on a stale cross-branch or no-branch lead; chats after reassignment or a branch move; branch change by direct id; lead creation without a branch; four WhatsApp thread cases), so they detect the defect |
| New tests without the earlier counselor and queue fixes (`ffbe1c5`) | 6 failed |

The database was a throwaway PostgreSQL 17.5 on one machine. CI is configured for `postgres:16`, so a green CI run is still the independent check.

## Step 3 ruling: test executability closed on local evidence, CI gap recorded (2026-11-06)

Step 3 of the plan asks for "isolated staging and executable CI/database tests". Those are two
deliverables and they are in different states, so they are recorded separately rather than closed together.

### Closed: the database tests are executable and have been executed

The 125 opt-in database tests were the real risk in this deliverable, because for weeks nothing had ever
run them. They now run, and they pass, on two machines and two PostgreSQL major versions:

| Run | Database | Result |
|---|---|---|
| `main` at `e03afb9`, another machine | PostgreSQL 17.5 | 622 tests, 622 passed, 0 failed, 0 skipped |
| `fix/s1-m1-onboarding-acceptance` at `caccd4f`, another machine | PostgreSQL 17.5 | 660 tests, 660 passed, 0 failed, 0 skipped |
| `main` at `1b22c70`, this machine | PostgreSQL **16.15** | 660 tests, 660 passed, 0 failed, 0 skipped |
| `main` at `b574b7c` content, this machine | PostgreSQL **16.15** | 693 tests, 693 passed, 0 failed, 0 skipped |

16.15 is the major version the CI workflow is configured for (`postgres:16`), so the suite is green on
both the version CI would use and the version the other machine had. `npm run typecheck` and
`npm run build` pass on the same commits. **Decision (owner, 2026-11-06): Step 3's test-executability
half is closed on this evidence** rather than waiting on GitHub.

### The gap this leaves, stated plainly

**No CI run has ever executed a single step of this workflow.** Runs `#73` and `#74` (`cdc810c`) failed
in 2 to 3 seconds with "The job was not started because your account is locked due to a billing issue",
and no run has been created at all for `14484eb`, `a8716cd`, `b574b7c` or `1273502`: the run count has
been stuck at 74 since 2026-11-04, so Actions is switched off for the repository on top of the account
lock. A billing lock produces failing runs; it does not suppress them.

This repository is public, and GitHub Actions on standard GitHub-hosted runners is free for public
repositories, so this is not a minutes overage on this repository: it is an account-level payment
failure that suspends Actions across the account. Clearing it needs the account's billing page and the
repository's Actions settings, in that order.

So the evidence above is from two developer machines, not from an independent, reproducible environment.
Nobody has verified that the workflow file itself works, including the `postgres:16` service block added
for these tests. `workflow_dispatch` was added to the workflow (`1273502`) so a run can be started from
the Actions tab the moment Actions is re-enabled; that run is still the check that closes this gap
properly, and it should be recorded here when it happens.

### Still open: isolated staging

The other half of Step 3 — an isolated staging environment on the release code with its own database —
does **not** exist. It is not closed by the evidence above, and it is a prerequisite for Step 5
(demonstrate onboarding), so it is tracked there. A further blocker for a clean staging database is
recorded below: nothing in the code or the migrations creates the first Super Admin.

### Not verified (blocked or out of scope here)
- **CI:** see the Step 3 ruling above. No CI run has executed a step; the account is billing-locked and Actions is disabled for the repository. Nothing about the code is proven by CI.
- **First Super Admin on a clean database: solved.** `scripts/bootstrap-super-admin.mjs` creates one (see below). Check any database with `SELECT user_id FROM user_roles WHERE role = 'super_admin';` and run the script only if it returns no rows.

## First Super Admin bootstrap (2026-11-06)

No code path or migration created the first Super Admin: every account-creating route needs a signed-in
Super Admin or Admin, so a brand-new database had nobody who could create an Admin and Step 5 could not
start on it. `scripts/bootstrap-super-admin.mjs` plus `server/lib/bootstrapSuperAdmin.mjs` close that.

    $env:BOOTSTRAP_PASSWORD = "<at least 12 characters>"
    node scripts/bootstrap-super-admin.mjs --email boss@example.com --name "First Boss"

It reads `DATABASE_URL` the way the server does, so it acts on whichever database that names.

Deliberately narrow, so it cannot become a back door:
- It refuses when the database already has a Super Admin (`--allow-additional` overrides).
- It refuses to promote an account that already exists, so it can never escalate an ordinary account;
  role changes belong in the admin screens, where they are audited.
- The password comes from `BOOTSTRAP_PASSWORD`, never an argument, so it stays out of shell history and
  the process list. Minimum 12 characters.
- It writes through `createAccount`, the canonical account writer, so login, role and memberships are
  one transaction exactly as the admin screens do it, and it adds the profile row the portal needs.
- The Super Admin is created with no branch, because the role is global and pinning it to one branch
  would quietly limit what the account can see.
- It records `super_admin.bootstrap` in `audit_log`, without the password.

`hashPassword` and `verifyPassword` moved from `server/routes/core.mjs` to `server/lib/password.mjs`
unchanged, so the bootstrap writes passwords through the same implementation the sign-in route verifies
them with rather than a second copy that could drift. The existing sign-in tests cover the move.

Verification: 6 new real-PostgreSQL tests, including signing the new account in through the
application's own `POST /api/auth/signin` and reading the role back from `GET /api/me`; refusal when a
Super Admin exists; refusal to promote an existing email; refusal of a short password and a malformed
address with nothing written; and the no-branch assertion. The script itself was also run end to end
against a fresh database: it created the account, refused the second run, and refused a short password.
Full suite 699 tests, 699 passed, 0 failed on PostgreSQL 16.15; typecheck and build clean.

Note for staging configuration: `ensureAdminUser()` in `core.mjs` seeds `admin@local.test` with the
password `admin123`, and is skipped when `IS_PRODUCTION` is true (`NODE_ENV=production` **or** any
Railway environment). On Railway it therefore never runs. Anywhere else, set `NODE_ENV=production` or
that account exists with a known password.
- **Staging acceptance:** Super Admin creates Admin; Admin creates Telecaller and Counselor in their branch; each logs in to the correct portal; unauthorized creation and cross-branch access fail; disabled employees lose access. **Blocked**: it needs a signed-in session on the deployed environment.
- **Deployed commit:** the hosting dashboard shows a deployment id, not the git SHA served. Confirm it matches `e03afb9`.
- **Configuration:** `ADMIN_SCOPE_ENFORCED=true`, `IDENTITY_STRICT`, public staff sign-up closed, `HR_ENABLED` off: values on the deployed environment are not recorded here and are **UNVERIFIED**.
- **Test data warnings** logged at startup of the deployed environment: some accounts with no role row (treated as students) and some leads with no branch (invisible to branch-scoped staff). Assign roles and branches from the admin screens.

### Changes on branch `fix/s1-m1-2-counselor-conversation-scope` (on top of `main` at `1b22c70`)

Stream 1, Milestone 1.2. Closes the first known open defect below: counselor conversation, message, WhatsApp
and attachment access used assignment alone, with no branch check. One rule now, the same one the telecaller
routes already follow: the student's lead must be assigned to the counselor **now** and sit in a branch they
belong to **now**.

- `myAssignedLeads(counselorId, scope)` takes the caller's scope and passes it to `jsonTable("student_leads", { scope })`,
  filtering the legacy SQL `student_leads` rows by `branch_id` as well. A lead with no branch stays out of every
  branch-limited view. Called without a scope it behaves exactly as before, so no other call site changed meaning.
- `counselorOwnsStudent(counselorId, studentRef, scope)` **requires** the scope (it throws when it is omitted,
  as `leadInCallerScope` does for telecallers), so a new counselor route cannot quietly fall back to assignment alone.
- New `counselorOwnsConversation()` applies the same rule to a chat thread by its id.
- Routes covered: `POST /api/counselor/conversations`, `POST /api/counselor/messages`,
  `PATCH /api/counselor/messages/:id` (own message is no longer enough), `POST /api/counselor/conversations/:id/read`
  (checked before any write), `GET /api/counselor/state` (thread and message lists), `GET /api/counselor/documents/:id/file`
  and `PATCH /api/counselor/documents/:id` (attachments), plus document targeting in `documentSetup.mjs`.
- WhatsApp: new `counselorOwnsThread()` in `core.mjs`, mirroring `telecallerOwnsThread`, on the list, messages,
  send and read routes. `staffCanViewConversation` still checks assignment; this adds the branch half. A thread
  whose lead cannot be found is refused rather than guessed.
- Admin and Super Admin access is unchanged: an all-branches scope short-circuits every check, and a test asserts
  a Super Admin still reads a thread in any branch.
- Consequence worth knowing: because the counselor's lead list comes from the same helper, it is now branch-scoped
  too. That is the counselor counterpart of the telecaller queue fix in `ffbe1c5`.

### Verification actually run (2026-11-05, Linux, Node 22) — automated checks only

This section records **automated verification**. It is not release acceptance; see "Release acceptance" below.
### Changes on branch `fix/s1-m1-2-delete-audit-atomic` (on top of `main` at `1b22c70`)

Stream 1, Milestone 1.2. Closes the recorded defect "permanent deletion commits before its audit entry is
written". Nothing in a delete is soft-deleted, so `audit_log` holds the only copy of what was removed, and
`deletion.mjs` says so in its own design note. The audit row was nevertheless written after `COMMIT` by
`audit()`, which logs and swallows every failure, so a lost audit write left a permanent, unrecoverable
delete and a 200 response.

- New `auditOn(db, req, ...)` in `auth.mjs` writes the audit row on a caller-supplied client and lets a
  failure through. `audit()` is now a thin best-effort wrapper around it (log and swallow), unchanged for
  the ~90 other call sites where the action has already happened and a lost audit row must not fail the request.
- `runDelete(pool, kind, id, { actorId, writeAudit })` calls `writeAudit(db, result)` with the transaction
  client after the rows are gone and **before** `COMMIT`. Throwing rolls the whole delete back.
- `POST /api/admin/delete/:kind/:id` passes `writeAudit`, so the snapshot, the removed counts and the reason
  commit with the delete or not at all. A failed audit write now answers 500 ("Nothing was changed") and the
  record is still there to delete again.

### Verification actually run (2026-11-06, Linux, Node 22) — automated checks only

Automated verification, not release acceptance.

| Check | Result |
|---|---|
| `npm run typecheck` | passed |
| `npm run build` | passed |
| This branch, full suite against a real PostgreSQL **16.15** | 679 tests, 679 passed, 0 failed, 0 skipped |
| This branch, no database (default `npm test`) | 679 tests, 568 passed, 0 failed, 111 skipped |
| `main` at `1b22c70`, full suite against PostgreSQL 16.15 (independent re-run of the figures recorded above) | 660 tests, 660 passed, 0 failed, 0 skipped |
| The 19 new tests **without** the fix | 10 failed (chat open and message send on a cross-branch or unbranched lead; the state thread and message list; an attachment after the lead moved branch; branch change; WhatsApp history, list, send and read by direct id), so they detect the defect |

Both the `main` figures and this branch's were produced on PostgreSQL 16.15, the major version CI is configured for;
the earlier `main` run was on 17.5, so the suite is now green on both. This is a second machine, not CI.

### Release acceptance (separate from the automated checks above)

**Still pending.** No commit is accepted for release until the deployed walkthrough passes. Outstanding:
Super Admin creates Admin; Admin creates Telecaller and Counselor in their branch; each signs in to the correct
portal; unauthorized creation and cross-branch access fail; disabled employees lose access. Also pending: the SHA
actually served by the deployed environment, and its values for `ADMIN_SCOPE_ENFORCED`, `IDENTITY_STRICT` and `HR_ENABLED`.
| This branch, full suite against a real PostgreSQL **16.15** | 666 tests, 666 passed, 0 failed, 0 skipped |
| This branch, no database (default `npm test`) | 666 tests, 568 passed, 0 failed, 98 skipped |
| The 6 new tests **without** the fix | 4 failed (a blocked audit write left the lead deleted and reported success; the retry case; and both `runDelete` contract cases), so they detect the defect |

### Referral attribution and recovery (on top of `main` at `a8716cd`)

Stream 1, Milestone 1.2. Closes the recorded defect "referral attachment errors are logged after signup
commits, so attribution can be lost". A referral decides whether a partner is paid.

Sign-up attributes the code after the account commits, and that ordering is deliberate: a bad or expired
code must never block a sign-up. The gap was what happened when attribution failed for an infrastructure
reason instead of a bad code — the code existed only in the request, so the referral was gone for good
with nothing but a log line.

- The sign-up transaction now stores the submitted code on the lead as `referral_code_submitted`, so the
  code is durable before anything can fail. Sign-up behaviour is unchanged: a bad code still does not block it.
- `attachReferral` writes the attribution and its `referral_events` row in ONE transaction, and clears the
  marker as it captures. An attribution with no event row would be a claim with no trail; an event row with
  no attribution would be a trail to nothing. A failed event write now rolls the attribution back and throws.
- The attribution UPDATE requires `referred_by_partner_id IS NULL` and checks `rowCount`, so two attempts at
  once cannot both believe they won; the loser is reported as `rejected_duplicate` instead of silently
  overwriting. (Concurrency is argued from the SQL, not covered by a test.)
- New `recoverPendingReferrals({ limit })` walks leads that still carry a marker and have no referral, and
  tries again with `source: "recovery"`. It skips any lead that already has a referral, so it never
  overwrites an attribution a person made by hand, and it is safe to re-run. A lead whose retry throws keeps
  its marker for the next run.
- New `POST /api/referrals/recover` (Super Admin only, audited as `referral.recover`) runs it. Super Admin
  because recovery moves leads between branches and decides who is paid.

### Verification actually run (2026-11-06, Linux, Node 22) — automated checks only

Automated verification, not release acceptance.

| Check | Result |
|---|---|
| `npm run typecheck` | passed |
| `npm run build` | passed |
| Full suite against a real PostgreSQL **16.15** | 693 tests, 693 passed, 0 failed, 0 skipped |
| No database (default `npm test`) | 693 tests, 568 passed, 0 failed, 125 skipped |
| The 8 new tests **without** the fix | 5 failed (the code was not kept; recovery did not exist; and a captured attribution stood with no event row), so they detect the defect |

## Executable acceptance, and a defect it found (2026-11-06)

`scripts/acceptance-onboarding.mjs` is the Step 5 acceptance criteria as a runnable script against a
deployed environment. It creates two branches and four accounts, exercises the chain, and deletes the
accounts it made.

    $env:ACCEPTANCE_URL = "https://<staging-host>"
    $env:SUPER_EMAIL = "boss@example.com"; $env:SUPER_PASSWORD = "..."
    node scripts/acceptance-onboarding.mjs --allow-writes

It writes data, so it refuses to start without `--allow-writes`. `--keep` leaves what it created in
place. Everything it makes is named with the run timestamp. Exit code 0 means every check passed.

### First run: 34 passed, 2 failed (local instance, 2026-11-06)

Run against the application started locally on PostgreSQL 16.15 with a Super Admin created by
`scripts/bootstrap-super-admin.mjs`. Not a deployed environment, and `NODE_ENV` was not `production`
(the production boot guard refuses a localhost database), so the deployed run is still required.

Passed: health; no token, forged token and wrong password refused; public counselor sign-up closed; HR
off; Super Admin sign-in and role; branch creation; **Super Admin creates an Admin scoped to one
branch; that Admin signs in with that branch only; that Admin creates a Telecaller and a Counselor in
it; both sign in and resolve to their own role**; an Admin cannot create an Admin, Super Admin or
Branch Head; an Admin cannot create staff in a branch they do not hold; duplicate email refused; a
Telecaller and a Counselor cannot create accounts; a second Admin in another branch cannot remove or
change the role of the first branch's staff; an Admin cannot delete an account.

### DEFECT (now fixed, see below): removing a staff member did not revoke their access

Both failures are the same defect, and it is not a script bug:

- `POST /api/counselors/:id/remove` returns `{ ok: true }`, and the removed Counselor then signs in
  successfully and is issued a token with role `counselor` and their branch intact.
- `POST /api/telecallers/:id/remove` behaves the same way.

Mechanism, read from the database after a removal: `auth_users` has **no** `is_active` column. The
`is_active` that `resolveAccountIdentity` honours (`ACCOUNT_DISABLED`, 403) is `user_roles.is_active`,
and a removal leaves that row untouched — role `counselor`, `is_active = true`, branch still set. The
removal path unassigns leads and marks some JSON records inactive, and `deactivateCounselor` calls
`jsonDelete` on what it believes is a role record, but roles are read from SQL (`readUserRoles()` is
special-cased in `db.mjs`), so that delete removes nothing that governs sign-in.

Effect: an employee removed from the company keeps a working login, their role and their branch scope
until someone deletes the account outright. This breaks the frozen Step 5 criterion "disabled employees
lose access", and no route anywhere in the codebase sets `user_roles.is_active = false`, so there is no
way to suspend an account at all today.

### FIXED, with suspend and restore (owner decision: disable the login, keep the record)

- Removing a Counselor or a Telecaller now sets `user_roles.is_active = false` as part of the removal,
  so sign-in answers 403 `ACCOUNT_DISABLED` and every later request is refused. The account, its
  history and its audit trail stay.
- New `POST /api/users/:id/suspend` and `POST /api/users/:id/restore`: Admin and Super Admin, inside
  their own branches (rule 6, the same class of action as removing or transferring staff). Restore also
  undoes a removal. Both are audited as `staff.suspend` / `staff.restore` with an optional reason.
- Refusals: you cannot suspend yourself, a Super Admin account cannot be suspended through this path,
  an unknown account answers 404, and an Admin cannot reach staff outside their branches.
- `routeAccessMatrix.mjs` names the two new actions, so the launch-contract drift guard covers them.

Verification: 9 new real-PostgreSQL tests, including removal-then-sign-in for both roles, the
suspend/restore round trip with its audit rows, branch scope, the self and Super Admin refusals, and a
guard-level check that only Admin and Super Admin reach the routes. The acceptance runner was then
re-run against a local instance: **36 passed, 0 failed**, the two previously failing checks among them.
Full suite 708 tests, 708 passed on PostgreSQL 16.15; typecheck and build clean.

## Accountant included in Team Status (2026-11-09)

Recorded defect, now closed. `TEAM_ROLES` listed Counselor, Telecaller, Branch Head and Admin, and a
test asserted Accountants were excluded, so an Accountant appeared on no team screen at all.

Accountant is an ordinary branch-scoped employee: it is in `SCOPED_ROLES` (it cannot work without a
branch) and in `ORDINARY_STAFF` (an Admin may create one), and its portal home is `/admin/finance`.
So it belongs in Team Status beside the rest. Super Admin and Student remain excluded, for the reasons
now written next to the list: the first is global rather than branch staff, the second is not an employee.

Accountants have no detail screen of their own, so their row has no "Open full profile" link; the
client already guarded that link, so nothing else changed. Server, screen and the role tab were updated
together, and the three team-status tests that encoded the old exclusion were updated to require the
Accountant instead.

## Independent verification of the database suite (2026-11-09)

The owner ran the full suite against their own PostgreSQL, on the tree now on `main`:
**708 tests, 708 passed, 0 failed, 0 skipped**. That reproduces the figures recorded above on a third
machine and a third database, independent of the two developer machines that produced them. A run
without `TEST_DATABASE_URL` reports 568 passed and 140 skipped; those 140 are the opt-in database tests,
not failures.

## Acceptance widened, and a validation gap it found (2026-11-09)

`scripts/acceptance-onboarding.mjs` now also covers the parts of the M1.2 acceptance list that HTTP can
reach, and reports **52 passed, 0 failed** against a local instance.

Added:
- **Invalid submissions:** a malformed email, a branch-scoped role with no branch, and a missing password.
- **Password reset:** an Admin resets a staff password in their own branch, the old password then fails
  and the new one works. (`PUT /api/users/:id/password` already rewrites the counselor-portal password
  too, so the two stores do not diverge.)
- **Existing sessions, which was the open question.** A token lasts days, so what matters is whether a
  request made with an already-issued token is still honoured after the account changes. Verified: the
  same token is refused as soon as the account is suspended, works again after restore, and reports the
  NEW role after a role change — because `session` re-reads role and branches from SQL on every request.

### DEFECT found and fixed: staff creation accepted any string as an email

`POST /api/users` accepted `not-an-email`, created a working account, and that account signed in. There
was no email validation on any creation path.

Effect: an account nobody can be reached at cannot have its password reset or be notified, and duplicate
detection keys on email, so a typo quietly creates a second parallel account for the same person. The
Super Admin bootstrap validated the address while the main route did not.

Fixed in `createAccount`, the one writer every creation path goes through, so the admin screens, both
sign-up routes and the bootstrap now share the rule. Pragmatic rather than RFC-exact: a local part, an
@, and a domain with a dot, none containing spaces. Covered by `tests/accountWrites.test.mjs`.

### Still not covered by the runner (covered by the database suite instead)

Lead reassignment between counselors, student-portal isolation, and the counselor and telecaller
cross-branch rules are exercised by the opt-in PostgreSQL tests
(`counselorConversationScope.db.test.mjs`, `telecallerQueue.db.test.mjs`, `staffSuspend.db.test.mjs`),
not by the HTTP runner. The deployed run should still include a browser pass for logout, reload and
direct navigation per role, which HTTP cannot show.

### Storage note for staging

Uploaded files are **not** on disk and not in object storage: `app_storage (path, data_url)` keeps them
in PostgreSQL as base64 data URLs. So staging needs no bucket or volume — its database *is* the file
store — but documents uploaded during testing will grow that database.

## M1.3 groundwork: the mobile layer was never wired up (2026-11-09)

M1.3 reads as a verification task ("test login/logout and protected navigation on both platforms"), but
there was nothing to verify. Capacitor is in `package.json` — core, android, ios, CLI and four plugins —
and the code was never connected:

- **No native projects.** No `capacitor.config.ts`, no `android/`, no `ios/`. `npx cap add` had never run.
- **`initCapacitor()` was never called by anything.** The splash screen would never hide and Android's
  back button was unhandled.
- **Three different env names for the backend URL** across the portals: `VITE_API_BASE_URL` (telecaller),
  `VITE_API_URL` (student), `VITE_API_TARGET` (declared, unused).

Two of those would have broken a device build in ways that look like server faults:

**Relative requests cannot reach the backend from a WebView.** Admin, counselor and partner built
`fetch("/api/...")`. There is no server origin in the shell, so that resolves against
`capacitor://localhost` (iOS) or `http://localhost` (Android) and never leaves the device.

**`sessionStorage` is emptied when the operating system reclaims the app.** Staff tokens were in
`sessionStorage`, so a staff user would be signed out every time they left the app long enough for the
WebView to be destroyed.

### What is now in place

- `capacitor.config.ts` (appId `com.flymasters.app`, webDir `dist`), with the `npx cap add` steps and the
  build-time URL requirement written in it. The native project folders are **not** committed: generating
  them needs the platform tools, and whether to commit them is a decision for whoever does.
- `src/shared/lib/native.ts` — one answer to "is this the shell", plus `initNative()`, now actually
  called from `src/main.tsx`.
- `src/shared/lib/apiBase.ts` — one resolver for every portal. On the web it returns `""`, so relative
  requests behave exactly as before. On a native platform it returns the configured absolute URL,
  accepting all three env names, and when nothing is configured it **says so** instead of guessing an
  emulator address. The old student resolver returned `http://10.0.2.2:8087` on Android and
  `http://localhost:8087` on iOS, which is right on an emulator and wrong on a phone. All five API
  clients (admin, counselor, telecaller, partner, student) now go through it.
- `src/shared/lib/tokenStore.ts` — `localStorage` on a device, `sessionStorage` in a browser. The web
  rule is unchanged and deliberate: a staff token should not outlive the tab on a shared machine.

Verified: 10 new tests in `tests/nativeShell.test.mjs`, written as pure rules taking `native` as an
argument so they need no device — the web base stays empty, a configured base wins, all three names are
accepted in order, a native build with nothing configured reports it, a web build stays quiet, storage
follows the platform, every API client uses the shared base and none builds a relative `/api` URL, no
emulator address survives in the source, and the entry point starts the shell. A production build was
checked for the emulator addresses: gone. 719/719 on PostgreSQL 16.15; typecheck and build clean.

### Still open for M1.3, and needing a decision

- **Token storage is not secure storage.** `localStorage` in a WebView is readable on a rooted or
  jailbroken device, and the JWT lasts seven days with no server-side revocation. Options:
  `@capacitor/preferences` with an encrypted store, or a shorter token with a refresh endpoint (there is
  no refresh endpoint today). Not decided.
- **The native projects still have to be generated** on a machine with Android Studio, and with Xcode
  and CocoaPods for iOS, then `npx cap sync` after each web build.
- **Deep links and the hardware back button beyond the top level** are unhandled apart from
  `App.exitApp()` at the root.
- Nothing has been run on a device or emulator. The authentication checks M1.3 asks for are the last
  step, after the above.

## Business journey acceptance, Stream 2 (2026-11-09)

`scripts/acceptance-journey.mjs` runs milestones 2.1 and 2.2 end to end against a deployed environment,
the same shape as the onboarding runner. **31 passed, 0 failed** against a local instance.

The point is not whether each route works alone — the suite covers that — but whether ownership and
history survive every step, and whether the branch next door stays out. The sequence:

1. An Admin captures a lead with the details conversion needs.
2. The Admin assigns it to a telecaller; it appears in that telecaller's own queue.
3. The telecaller records two follow-ups. Checked: the status moved (`warm` then `hot`), **both** notes
   are still on the lead so call history accumulates rather than overwriting, and the lead still belongs
   to the same telecaller afterwards.
4. The telecaller converts it.
5. The Admin hands it to a counselor; the student appears for that counselor. Checked: the telecaller's
   id is **still on the record**, so the work that produced the conversion is not lost in the handoff.
6. The counselor requests a document and reads the student's checklist.

Isolation, at every point: a counselor in the other branch cannot request a document from this student,
cannot read the checklist, never sees the student in their own list, and the lead cannot be assigned to a
counselor outside the Admin's branches.

Cleanup deletes the lead before the staff, because an account that still holds leads cannot be deleted —
the right refusal, which would otherwise leave the run's accounts behind. Branches remain: there is no
branch delete route.

### The student's own half, added the same day: 47 passed, 0 failed

Milestone 2.2's gate ends at "document upload/review", which needs a signed-in student, so the script now
carries a second person all the way through:

7. A student **registers** through `POST /__auth`, which is how the student journey actually starts.
8. The Super Admin places that lead in branch One; the telecaller takes it, fills in the details
   conversion needs, and converts it; the Admin hands it to the counselor.
9. The counselor requests a passport. The student **uploads the file** to their own folder and records
   the document row through the student data API.
10. The counselor **opens the file and approves it**, and the approval shows on the student's checklist,
    so the next step is visible.

Refusals at each point: the student cannot upload into another student's folder, and the other branch's
counselor can neither open nor review the document.

### Four behaviours this exercise established, worth knowing

- **A registered person is a lead, not a student.** `bulk-assign` skips anything not converted
  (`if (!converted) continue`), so a self-registered student cannot be handed to a counselor until a
  telecaller converts them. The script follows that real path rather than short-cutting it.
- **`bulk-assign` answers `ok: true` with `count: 0` when it assigns nothing.** A caller checking only the
  status would believe an assignment happened. Every assignment check here asserts `count`.
- **A student may set `status` only to `"uploaded"`.** Anything else is refused with "Document review is
  controlled by staff", which is correct and worth knowing before writing an upload client.
- **An employee holding leads cannot be deleted** (409, "Transfer or reassign them first"), so cleanup
  deletes the lead and the student before the staff.

## Milestone 2.3: delivery outcomes, and a defect in the webhook (2026-11-09)

2.3's gate has two halves. "Assigned participants share the correct conversation" was closed by the
counselor and telecaller scope work above. This is the other half: "enabled channels show delivery
outcomes".

### DEFECT: the staff webhook could move a message's status backwards

There are two WhatsApp paths. The case path (`server/student/whatsapp.ts`) applies
`deliveryStatusPatch`, the ordering rule `waDelivery.test.mjs` pins. The staff-portal webhook
(`server/lib/whatsappRoutes.mjs`) did not: it wrote whatever status arrived straight onto the message.

Meta does not guarantee the order of status webhooks, so a late `sent` arriving after `delivered` moved
the message backwards and showed staff an outcome it had already passed. A `failed` receipt arriving
after a real delivery did the same. The rule existed and was tested; it simply was not wired into this
path — the same class of defect as the counselor scope and the Capacitor layer.

Fixed by applying `deliveryStatusPatch` in the webhook. The row keeps `delivery_status` for the staff
screens that read it, and now also carries `wa_status` and `wa_status_at`, which is what the ordering
rule reads on the next receipt.

### Verified with real webhook payloads

`tests/waWebhookDelivery.db.test.mjs` posts Meta-shaped payloads at the actual route and reads the row
back, so it covers the wiring rather than the rule in isolation. **6 of its 7 tests fail without the
fix.** Covered: the normal advance through sent → delivered → read; a late `sent` after `delivered`
refused; `read` holding against a later `delivered`; a `failed` after delivery ignored because the
message did arrive; a `failed` before delivery recorded with the provider's reason, which is what staff
need to act on; an unknown message id changing nothing while still answering 200, as a webhook must; and
malformed receipts (zero, NaN, unknown status) ignored rather than written.

726/726 on PostgreSQL 16.15; typecheck and build clean.

### What 2.3 still needs, and only a provider can give

Nothing here proves Meta actually sends these payloads to this endpoint, or that credentials, templates
and the business phone id are right. That needs one live send and one real receipt against the deployed
environment. Everything between the payload arriving and staff seeing the outcome is now covered.

### What is still NOT covered
- **Commission on conversion.** `commissionOnConvert` runs on the conversion path and is not asserted here.
- (The application step is now covered end to end — see below.)

### The application step, the middle of 2.2's gate: 59 passed, 0 failed

2.2's gate reads "counselor handoff → **application** → document upload/review → next step". The
document half was covered; the application itself was only unit-tested. The journey now runs it:

11. The counselor shortlists a university for the student.
12. Starting an application **before the student accepts is refused (409)** — checked before the
    acceptance rather than assumed after it.
13. The student accepts the university from their own portal.
14. The counselor starts the application; **starting it twice reuses the same one** rather than creating
    a duplicate, which is the behaviour `applicationWorkflow.test.mjs` pins at unit level.
15. The counselor submits it to the university, then records an offer.
16. The student sees **their own** application at `offer_received` — the "next step" in the gate — and a
    second registered student cannot see it.

Refusals throughout: the other branch's counselor cannot start an application for this student and
cannot change one.

One correction worth recording: the student portal reads its applications through the data API
(`GET /__local_db?table=applications`), which filters rows to the signed-in student;
`/api/case/me/shortlist-details` returns university catalogue detail, not application status.

## Stream 3 begun: deployed commit and schema visibility (2026-11-09)

Milestone 3.1 asks for "isolated staging, CI, migrations and deployed commit visibility". Staging and CI
need infrastructure. The visibility half did not exist at all and is now built.

Until now a deployed environment reported nothing about itself — `/api/health` answered ok, service and
time — so the only way to know what a host was running was to trust whoever deployed it. That is the
question every acceptance run has to answer first: **a green run against an unknown commit proves
nothing**, and "confirm the SHA the deployed environment serves" has been an open item since the baseline.

- `GET /api/version` reports the commit, the short commit, the branch, the environment name and the
  schema version (`{applied, latest}` from `schema_migrations`). Open on purpose: confirming which commit
  a host serves is something anyone on the team does without an account, and for a public repository the
  commit is public anyway. No configuration values, no secrets. A null commit is reported as null rather
  than guessed, because "nobody can say what this host runs" is the finding.
- `GET /api/health` now carries the short commit too, since that is the first call every acceptance run
  makes.
- `server/lib/buildInfo.mjs` resolves the commit from whichever variable the platform sets — Railway's
  `RAILWAY_GIT_COMMIT_SHA` and `RAILWAY_GIT_BRANCH` first, then the Vercel, Heroku and generic names — so
  this keeps working if the host changes. Nothing is read from the repository at runtime: a deployed
  container usually has no `.git`.
- **Both acceptance scripts now print the commit, branch, environment and schema version before any
  check**, and fail if the environment cannot say which commit it is. So an acceptance run is now
  self-documenting evidence rather than a bare pass count.

The launch-contract drift guard flagged `/api/version` as a new unauthenticated route, which is the guard
working; it is now in the known-public list in `tests/routeMatrix.test.mjs` with the reason beside it.

Verified: 6 new tests in `tests/buildInfo.test.mjs` over the pure resolver (Railway's names, the other
platforms', precedence, blank values, and the null case), and the route exercised against a running
instance with `RAILWAY_GIT_COMMIT_SHA` set — it reported `2ed40d9` on `main` with 9 migrations applied,
latest `009_staff_hr_text_ids.sql`, and the journey run printed it. 732/732 on PostgreSQL 16.15;
typecheck and build clean.

### What 3.1 still needs

Staging and CI, both infrastructure. When staging exists, `GET /api/version` answers the two questions
that were previously unanswerable from outside: which commit it serves, and whether all nine migrations
applied.

## Milestone 3.3: recovery checks, and two defects they found (2026-11-09)

3.3 asks that "recovery checks pass". Nothing tested recovery, and `deletion.mjs` makes a specific
promise in its own design note: nothing is soft-deleted, so the audit row is the only copy, and "a
delete is recoverable by hand from audit_log". Testing that promise broke it twice.

### DEFECT 1: the snapshot could not put the person back

The delete removed everything belonging to a student — profile, documents, applications, conversations,
messages, shortlists, notifications and the portal login — while the snapshot held only
`{ lead, email, userId }`. So of all that, exactly one row was recoverable. Worse, uploaded files live in
`app_storage` keyed by path, and the `documents` rows naming those paths were deleted too, leaving the
files as orphaned blobs with nothing to match them to a person.

The snapshot now carries the rows themselves: every matching `app_records` row with its `table_name` and
`branch_id`, the `auth_users` row, and the role rows. Capped at 2000 rows so one very chatty student
cannot write an unbounded audit row, with `truncated: true` when the cap is hit — a partial snapshot says
so rather than looking complete.

### DEFECT 2: a "permanent" delete left the message bodies behind

A `whatsapp_messages` row reaches its person only through `conversation_id`; it carries no lead, student
or user id. The delete matched on those three only, so **the message bodies survived**. A deleted
student's WhatsApp history stayed in the database, orphaned and unreachable through the app but fully
present — a data-retention problem as much as a correctness one. The delete now follows
`conversation_id` into `whatsapp_conversations`, `private_conversations` and `conversations`.

### The check itself

`tests/deleteRecovery.db.test.mjs` builds a student with the history a real one accumulates — profile,
document with a stored file, application, conversation, message — then:

1. asserts the delete removes all of it, message bodies included;
2. asserts the snapshot contains a row for each table, the message body, the document's `file_path` and
   the login;
3. **rebuilds the student from the snapshot alone** and asserts the result is the same size as the
   original, the conversation history is back, the login works and the restored document still points at
   a file that exists in storage;
4. asserts a snapshot forced past the cap reports `truncated`.

All four fail before the fix. 736/736 on PostgreSQL 16.15; typecheck and build clean.

### What 3.3 still needs

- **A database-level restore drill.** Files live in PostgreSQL (`app_storage`), so a database restore is
  also the file restore; a `pg_dump`/`pg_restore` rehearsal against staging has not been done.
- (Staff deletion now carries the same guarantee — see below.)

### Staff deletion made recoverable too

The staff snapshot held `email`, `role` and `metadata`: enough to say who was deleted, not enough to put
them back. Same asymmetry, same reasoning — `audit_log` is the only copy.

It now carries the profile and counselor/telecaller cards, the `auth_users` row, the role rows with their
`is_active`, the branch memberships and the counselor-portal login, all captured before the deletes run.
`payrollKept: true` records that attendance, leave and salary are deliberately **not** deleted and so are
deliberately absent from the snapshot, rather than leaving that ambiguous.

Three more tests: the snapshot contains each of those; an employee **rebuilt from the snapshot alone** has
their login, role, branch membership and cards back and can sign in; and payroll history is confirmed to
survive the delete. Two of the three fail before the fix; the payroll one already held and is now pinned
so it keeps holding.
- Web acceptance and the mobile device checks, which the rest of this document covers.

## Milestone 3.2: responsive screens checked at phone width (2026-11-09)

The mobile shell wraps this same web app, so a screen that overflows in a 390px browser overflows on the
device. That half of 3.2 is checkable without a device, and it is where mobile layout actually breaks.

`scripts/responsive-audit.mjs` signs in, renders every portal screen at 390x844 and reports page-level
horizontal overflow, blank renders, and controls too small to hit with a thumb.

    npx playwright install chromium
    $env:AUDIT_PASSWORD = "..."
    node scripts/responsive-audit.mjs --url http://localhost:8788 --email boss@example.com

Playwright is deliberately **not** a project dependency: nothing in the build uses it, and this is a
check you run. The script says so if it is missing, and `PLAYWRIGHT_MODULE` points it at a global install.
Read-only — it signs in, looks, and writes nothing. It prints the deployed commit first, like the
acceptance scripts.

### Result: 18 of 18 screens fit, which is the good news

Every admin, counselor, telecaller and sign-in screen renders at 390px with **no page-level horizontal
overflow and no blank screens**. The app was already responsive; this records it rather than assuming it.

Two small-target findings, both fixed: a 13px checkbox on Universities (now 20px inside a 36px label
row), and a 20px block link on the Dashboard (now padded to 28px, which costs nothing on a desktop).

### Two refinements the first run needed, so the report can be trusted

- **A tab strip inside a deliberately scrollable box** was flagged as overflow. It is meant to be wider
  than the screen — the person swipes it — so an element is only a problem when no scrollable ancestor
  explains it.
- **A link inside a sentence**, and a checkbox inside a label, were flagged as small targets. Text is
  the height of text, and a checkbox is tapped by its label. Both are now judged correctly; a bare count
  of "small controls" was not actionable, so each is named with its height and label.

### What 3.2 still needs

A device or emulator: file handling (the picker, the camera, downloads), navigation including the
hardware back button beyond the top level, and session transport under a real network. The native
projects have to be generated first — see the M1.3 groundwork section.

### Known open defects (not fixed on this branch)
- Student-portal side of the same threads (`server/routes/student.mjs`, `/__auth` and the student chat routes) was not read or changed here.
- Not exercised against a real WhatsApp provider: the "no outbound message on refusal" check stubs the network and asserts nothing is sent; the allowed send path stops at its own phone validation in tests.
- (Resolved: the deletion/audit ordering, referral attribution, staff access revocation and Team Status Accountant defects are all fixed above.)
- Referral recovery is manual: `POST /api/referrals/recover` has no schedule and no admin screen, so someone has to run it after an outage. A count of pending markers is not surfaced anywhere.

---

> Everything below is the historical baseline recorded on 2026-11-04, before the merge. It is kept for traceability. Where it conflicts with the section above, the section above is current.

## Selected baseline
- Integration branch: `release/initial-mvp` (created in worktree `../FlyMasters-release`)
- Starting commit: `2bccf0942a9fdf262c8b953f54c319a470152b55` (ACCESS-03B, tip of `feat/access-03-scoped-admin-delegation`)
- Reason for selection: newest commit that contains ACCESS-01, 02, 03A and 03B and contains no 03C.
  `main` (`97d42af`) is an ancestor of this commit with no commits of its own beyond it, so nothing on
  `main` is left out. `main` itself lacks all ACCESS work and must not be used.

## Starting checkout state (Task 1, run 2026-11-04)
- Checkout: `D:\flymaster_latest_update\FlyMasters-Latest`, branch `feat/telecaller-portal` at `99b3b15`, identical to `origin/feat/telecaller-portal`.
- Uncommitted: `package-lock.json` only (saved as `..\pre-baseline-package-lock.patch`). No stashes, one worktree, one local branch.
- Commits on no remote: none. Reflog mentions of 03C: none.
- Release worktree created: `D:\flymaster_latest_update\FlyMasters-Release`, branch `release/initial-mvp`, `HEAD` equals `2bccf0942a9fdf262c8b953f54c319a470152b55` (checked).

## Included ACCESS work
- ACCESS-01: 2 commits (`649ff20`, `cbf9209`). Branch `fix/access-01a-role-grant-authz` tip `f81c186` is in the baseline.
- ACCESS-02: 11 commits (`ec72d8d` to `fe18c8b`). Branches `feat/access-02a-account-audit` (`41f2b29`) and `feat/access-02cd-identity-and-writes` (`fe18c8b`) are in the baseline.
- ACCESS-03A: 3 commits (`3721bc2`, `e1fba78` and one more). Route inventory and matrix: `scripts/access-route-inventory.mjs`, `server/lib/routeAccessMatrix.mjs`, `tests/routeMatrix.test.mjs`.
- ACCESS-03B: 7 commits (`8622edb` to `2bccf09`). Account policy: `server/lib/accessPolicy.mjs`, scope: `server/lib/accessScope.mjs`.
- Evidence for inclusion: `git log 2bccf09 --grep="ACCESS-0x"` returns every commit of 01, 02, 03A and 03B
  (counts 2, 11, 3, 7 equal the counts across all branches). Re-run the ancestor loop in Task 2 to confirm.

## Preserved/deferred work
- ACCESS-03C-1 branch and commit: `feat/access-03c-delegation-grants`, commits `d12ce47` and `de0f3ad`
  (tip `de0f3ad`). Adds `server/migrations/008_delegation_grants.sql` and `server/lib/delegationPolicy.mjs`.
  Not in the baseline (`git merge-base --is-ancestor de0f3ad 2bccf09` returned exit code 1). Preserved by tag
  `preserve/access-03c-1`, which already existed locally and on origin when this task ran (push reported up-to-date).
  Tag target verified 2026-11-04: `git rev-parse preserve/access-03c-1^{commit}` and `git rev-parse de0f3ad` both print
  `de0f3ad4d421a8b1a5ca0b604b730537e44445ae`.
- ACCESS-03C-2 location or availability: not found in the checkout above (no local-only commits, no stashes, no reflog
  mention, one worktree) and not on origin. Treated as UNAVAILABLE here. Any other clone or machine is UNVERIFIED.
- Other excluded changes:
  - `feat/telecaller-portal` (`99b3b15`): 30 commits on top of the baseline. It also contains 03C-1, migration 009 and
    a delete rule that lets Admin delete students and staff (`9594c38`), which conflicts with the launch rule.
    Selected commits are taken later as lanes.
  - `feat/referral-tracking` (`02b6bec`): not in the baseline. Check separately.

## Release boundaries
- HR excluded. (Open decision: telecaller clock-in, leave and salary. See telecaller commits `a6e120b`, `cd14683`, `d150e04`, which need migration 009.)
- Delegation deferred.
- Branch Head employee creation disabled. Today this holds only because no delegation grants are loaded; the contract test in Step 2 makes it explicit.
- Web first; shared backend for future Android/iOS.

## Migration and configuration prerequisites
- Required migrations: `001` to `007` (`server/migrations/`). Applied once, tracked by file name in table `schema_migrations`.
- Existing migration 008 upgrade condition: the baseline has no 008. 008 exists only on the 03C and telecaller branches, and was
  edited after first commit (`d12ce47` created it, `de0f3ad` changed it). The runner tracks by file name, so an edited 008 is
  never re-applied. If any database already applied the old 008, enabling 03C later needs a new migration (010 or later), not an edit of 008.
- Required configuration names (values never recorded here):
  - `ADMIN_SCOPE_ENFORCED`: **must be `true`.** When off (default) Admin sees every branch, so the launch rule
    "Admin works only in assigned branches" is not enforced. Missing from `.env.example`.
  - `IDENTITY_STRICT`: rollout switch for strict role and branch checks. Decision needed before staging. Missing from `.env.example`.
  - `ADMIN_SIGNUP_CODE` unset and `ADMIN_SIGNUP_OPEN` not `true` in production, so public admin sign-up stays closed.
  - `TELECALLER_SIGNUP_CODE`, `COUNSELOR_SIGNUP_CODE`: decide whether self sign-up stays on.
  - `JWT_SECRET`, `DATABASE_URL`, `ALLOWED_ORIGINS`, `PUBLIC_APP_URL`, `NODE_ENV`, email and WhatsApp settings (see `.env.example`).
- Staging applied migrations: **UNVERIFIED.** Settle with `SELECT name FROM schema_migrations ORDER BY name;` on staging.
  Also record whether `ADMIN_SCOPE_ENFORCED` and `IDENTITY_STRICT` are set there.

## Verification
- CI run and result: **UNVERIFIED.** Workflow runs install, typecheck, test, build (`.github/workflows/ci.yml`).
  Record the run id for `2bccf09` or `release/initial-mvp`, and the step count. A run with zero executed steps is not a pass.
- Checks actually executed (2026-11-04, local checkout): ancestry loop found 2, 11, 3 and 7 commits for ACCESS-01, 02, 03A and 03B,
  with none missing from `2bccf09`; 03C-1 confirmed excluded (exit code 1); worktree `HEAD` matches the baseline SHA. Tests were not run.
- Staging verification: **UNVERIFIED.**
- Remaining blockers: CI result for the baseline, staging migrations and flags, 03C-2 on any other machine, and the open scope decisions
  (HR, telecaller self sign-up, `IDENTITY_STRICT`).

## Next task
Map employee onboarding and freeze the launch permission contract.
