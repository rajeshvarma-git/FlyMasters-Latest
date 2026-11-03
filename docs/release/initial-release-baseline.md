# Initial Release Baseline

Task S1-M1.1-01. Facts below were read from the public GitHub history of
`rajeshvarma-git/FlyMasters-Latest` on 2026-11-04. Anything that needs the developer's machine, CI
or staging is marked **UNVERIFIED** with the check that settles it.

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
