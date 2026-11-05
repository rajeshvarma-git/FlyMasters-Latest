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

### Not verified (blocked or out of scope here)
- **CI:** runs `#74` (`cdc810c`) and `#75` (`60cd9f9`) failed in 2 to 3 seconds with "The job was not started because your account is locked due to a billing issue". No step executed, so this is not a pass. The workflow was then disabled by the repository owner. Nothing about the code is proven by CI until the account lock is cleared and the workflow is enabled again.
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

### Known open defects (not fixed on this branch)
- Student-portal side of the same threads (`server/routes/student.mjs`, `/__auth` and the student chat routes) was not read or changed here.
- Not exercised against a real WhatsApp provider: the "no outbound message on refusal" check stubs the network and asserts nothing is sent; the allowed send path stops at its own phone validation in tests.
- Reported by review, not re-verified here: permanent deletion commits before its audit entry is written; referral attachment errors are logged after signup commits, so attribution can be lost; Team Status omits the Accountant role.

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
