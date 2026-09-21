# Cutover and rollout

## 0. Do this before anything else

`flymaster-admin-portal/railway.toml` shipped the live signing key and the admin
signup code in a public repository:

```
startCommand = "JWT_SECRET=flymasters-admin-dev-secret ADMIN_SIGNUP_CODE=850065 npm run start:prod"
```

Anyone who read that repo could sign an admin token and call the production API.

1. Set a fresh `JWT_SECRET` (48 random bytes) and a new `ADMIN_SIGNUP_CODE` in
   Railway Variables.
2. Redeploy. Every existing session is invalidated; everyone signs in again.
3. Review `auth_users` and `user_roles` for accounts nobody recognises.
4. Rotate the WhatsApp token and database password if either was ever in source.

## 1. Deploy the platform beside the old services

Do not delete anything yet. Create one new Railway service from this repo,
pointed at the same Postgres, with the variables from `.env.example`.

On boot it runs three migrations. All are additive — no drops, no renames — so
the four existing services keep working against the same database.

## 2. Verify

```
GET  /api/health                      -> {"ok":true}
POST /api/auth/signin                 -> a token for ANY role
GET  /api/me                          -> 200 for every role
GET  /api/state           as counselor -> 403
GET  /api/counselor/state as admin     -> 403
GET  /api/telecaller/state as admin    -> 403
```

Then open `/`, `/admin`, `/counselor`, `/telecaller` and sign in once. A staff
member who works in two portals should not be asked to sign in twice.

## 3. Switch the domains

Point each existing hostname at the new service, or move the custom domain.
Old URLs keep working: `/admin/leads` is still `/admin/leads`.

## 4. Stop the old services

Once traffic is on the new one for a few days, stop — do not delete — the three
old Railway services. Keep the repositories; they are the rollback.

## Rollback

Redeploy the old services. The migrations are additive, so the old code ignores
`branches`, `user_roles`, `audit_log`, `partners`. The one thing to redo is the
`JWT_SECRET`, which both old and new read from the same variable.

---

# What changed

## Four services became one

| | Before | After |
|---|---|---|
| Railway services | 4 (+ Postgres) | 1 (+ Postgres) |
| Express/Node servers | 3 | 1 |
| JWT secrets | 3 different | 1 |
| Logins for staff | up to 3 | 1 |
| Schema bootstraps racing on one DB | 3 | 1 ordered migration set |
| WhatsApp implementations | 2 | 1 |
| Builds per change | up to 4 | 1 |

## Dead code removed

- `server/index.mjs` (admin): 9,883 lines, of which **6,090 were four older
  copies of the file commented out**. Only the last 3,397 lines ever ran.
- `src/App.tsx` (admin): 602 lines, 476 commented out the same way.

## Security fixes made in the merge

1. **Signing key in a public repo** — see step 0. `JWT_SECRET` now has no
   production fallback; the server exits rather than boot with a default.
2. **Counselor API had no role check.** Its `auth` middleware verified the JWT
   and trusted the claims. Any valid counselor-realm token reached every
   counselor route. All counselor routes now run `session -> requireRole ->
   branchScope`, and the role is re-read from the database per request.
3. **WhatsApp routes granted staff access to anyone.** The counselor service's
   `verifyJwt` returned `{ ...claims, role: "counselor" }` for any valid token,
   so a student or telecaller token reached staff-only chat routes.
4. **Roles were a JSONB blob.** `roleFor` loaded every row of
   `app_records(table_name='user_roles')` and searched it in JavaScript on every
   authenticated request. It is now one indexed lookup on a real table with a
   CHECK constraint on the role name.

## The permission spine (migration 002)

`branches`, `user_roles(user_id, role, branch_id, is_active)`, `audit_log`, and
`branch_id` on every scoped table, backfilled to a seeded "Head Office" branch
so nothing changes behaviour on day one.

`server/lib/auth.mjs` exposes `branchScope`, which sets `req.scope` to either
`{allBranches:true}` (super_admin, admin) or `{allBranches:false, branchId}`
(branch_head, counselor, telecaller, accountant). A branch-scoped account with
no branch is refused rather than silently shown everything.

**Branch Head needs no new screens.** It is admin, scoped.

## Agents and freelancers (migration 003)

Schema only — no feature code, by design.

`partners(type: agent|freelancer, referral_code, commission_rate,
commission_basis)`. One entity, one screen, one role. `student_leads` gains
`referred_by_partner_id`, `referral_code_entered`, `referral_source`.
`referral_events` is append-only so attribution disputes have evidence.

The blocking question is a business rule, not code: **if a lead enters an agent
code but a counsellor already owns them, who gets credit, and for how long?**
`referral_events.outcome` has `rejected_owned` and `superseded` ready for
whichever answer you choose.

## Deliberately NOT built

Load balancing, microservices, separate partner portals, commission payout
automation, full payroll, Accountant workflows. None are justified below roughly
5,000 leads, and each adds a monthly cost line.

---

# Known gaps

1. **32 TypeScript errors, all pre-existing, all in the student portal.** It
   never ran `tsc` (its build script was `vite build`), so they were never
   surfaced. `npm run build` matches that behaviour. `npm run typecheck:staff`
   shows the other three portals are clean. Fixing the student portal's types is
   its own task.
2. **Student auth is still separate.** The student app uses opaque tokens in
   `auth_sessions` via `/__auth`. Its handler is mounted unchanged so the merge
   is behaviour-preserving. Moving it onto the shared JWT session is the next
   step, and it is the last piece of "one login".
3. **Three WhatsApp endpoints not ported** — `/api/whatsapp/status`,
   `/api/whatsapp/app-message`, `/api/whatsapp/my-thread` existed only in the
   counselor implementation. Confirm nothing calls them before deleting
   `server/lib/whatsappRoutes.mjs`.
4. **Portal source trees are not deduplicated.** Each portal keeps its own
   `App.tsx`, `lib/api.ts`, `components/ui/Button.tsx` and so on, because they
   collide by path. One repo, one deploy and one login did not require merging
   them, and merging them blindly would have. Pulling the shared UI into
   `src/shared` is a follow-up with no deadline.
5. **The student bundle is 3 MB** (744 kB gzipped). It is code-split, so opening
   `/admin` does not download it, but it deserves its own pass.
6. **The student portal still runs its own `ensureSchema`** at first request,
   creating tables it already owns. Harmless (all `IF NOT EXISTS`) but it should
   move into the migration set.
