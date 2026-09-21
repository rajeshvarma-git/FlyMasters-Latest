# Deploy and test — step by step

Run these in order. Do not skip step 0.

---

## Step 0 — Rotate the leaked secret (before anything else)

`flymaster-admin-portal/railway.toml` published this in a public repo:

```
JWT_SECRET=<the old dev secret>  ADMIN_SIGNUP_CODE=<a 6-digit code>
```

A JWT secret is the key that signs "this person is an admin". Anyone who read
that repo can write their own admin token and your server will believe it. The
signup code lets them simply register as an admin instead.

1. Generate a new secret:
   ```
   node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"
   ```
2. Railway → each service → Variables → set `JWT_SECRET` to it, and set a new
   `ADMIN_SIGNUP_CODE`.
3. Remove both from `railway.toml` in the old admin repo.
4. Redeploy. Everyone is signed out and signs in again — that is the point.
5. Check for accounts you do not recognise:
   ```sql
   SELECT u.email, r.role, u.created_at
     FROM auth_users u LEFT JOIN user_roles r ON r.user_id = u.id
    ORDER BY u.created_at DESC LIMIT 50;
   ```
6. Rotate the WhatsApp token and the database password too, if either was ever
   committed.

The new platform refuses to start in production without `JWT_SECRET`, and warns
in the log if you set it back to any of the old development values.

---

## Step 1 — Create the new service (do not touch the old four)

Railway → New → GitHub repo → this repository → same project as your Postgres.

Variables:

| Variable | Value |
|---|---|
| `DATABASE_URL` | Add Reference → Postgres → DATABASE_URL |
| `JWT_SECRET` | the new secret from step 0 |
| `ADMIN_SIGNUP_CODE` | the new code from step 0 |
| `TELECALLER_SIGNUP_CODE` | your own value, or leave unset to switch self-signup off |
| `NODE_ENV` | `production` |

WhatsApp and email variables: copy across from the admin service.

The old four services keep running. Nothing is switched over yet.

---

## Step 2 — Watch the first boot

Railway → Deployments → Logs. A healthy boot looks like this:

```
Fly Masters platform API on port 8788
migrated: 001_baseline.sql
migrated: 002_rbac_branches_audit.sql
migrated: 003_partners_referrals.sql
Database migrated (3 new)
[preflight] accounts: 128  |  roles: admin=2 counselor=6 telecaller=4 student=116  |  leads: 431  |  partners: 0
[preflight] no warnings
```

The migrations are **additive only** — no table is dropped, no column renamed —
so your four existing services keep working against the same database
throughout.

If `[preflight]` prints warnings, fix them before step 3. It tells you about
accounts with no role, leads with no branch, and passwords not yet upgraded.

---

## Step 3 — Run the smoke test

```bash
ADMIN_EMAIL=you@flymasters.in      ADMIN_PASS='...' \
COUNSELOR_EMAIL=acounselor@...     COUNSELOR_PASS='...' \
TELECALLER_EMAIL=atelecaller@...   TELECALLER_PASS='...' \
./scripts/smoke-test.sh https://your-new-service.up.railway.app
```

22 checks. It verifies the service is up, all four portals load, tokens are
required, forged tokens are refused, every role can sign in at the **same**
endpoint, and — the important one — that no role can reach another role's data.

Expected: `passed: 22   failed: 0`. Anything else, stop and fix.

---

## Step 4 — Test by hand, as a human

The smoke test cannot see the screen. Do these yourself:

**The one that matters most — one login:**
1. Sign in at `/admin`. Work for a minute.
2. In the same browser, open `/counselor`. **You should not be asked to sign in
   again** if your account has both. Before the merge you would have been.

**The single staff door:**

Open `/staff`. Sign in as an admin, then a counsellor, then a telecaller (use a
fresh browser tab or a private window each time). Each should land in their own
portal without choosing anything:

| Role | Should land on |
|---|---|
| super_admin, admin, branch_head | `/admin` |
| counselor | `/counselor` |
| telecaller | `/telecaller/queue` |

Also check that an old bookmark still works: `/admin/login` should bounce you
to `/staff`.

**Per portal, confirm the first screen loads with real data:**

| Portal | Check |
|---|---|
| `/admin` | dashboard counts, leads list, a lead detail page |
| `/counselor` | my leads, my students, documents, WhatsApp chat |
| `/telecaller` | queue, open a lead, log a contact, convert |
| `/` | student home, sign up, the AI chat |

**Then try to break it:**
- Sign in as a counselor, then type `/admin` in the address bar. You should be
  bounced, not shown the admin dashboard.
- Sign out in one tab; the other tab should lose access on its next action.

---

## Step 5 — Domains: one link or two

Everything runs from **one deployment**. How many web addresses you hand out is
purely a DNS choice and costs nothing either way.

**Recommended — two hostnames, both pointing at the same service:**

| Hostname | Who uses it |
|---|---|
| `flymasters.in` | students and the public |
| `staff.flymasters.in` | everyone who works for you |

Staff then get **one link to remember**: `staff.flymasters.in`. They sign in
there and land in their own portal automatically.

Why two rather than one: students never see a staff address, the staff link is
short enough to say over the phone, and later you can add IP restrictions or
extra protection to the staff hostname alone without touching the student site.

In Railway: Settings → Networking → Custom Domain, add both. Same service, two
entries. No code change, no extra cost.

**If you prefer one hostname**, that works today with no changes — staff go to
`flymasters.in/staff`.

Move the domains across one at a time, starting with telecaller (fewest users)
and ending with student (most). Internal URLs do not change: `/admin/leads` is
still `/admin/leads`.

---

## Step 6 — Stop, do not delete, the old services

After a few clean days: Railway → each old service → Settings → stop.
Keep the four repositories. They are your rollback.

---

## Rollback

Start the old services again. Because the migrations only added things, the old
code ignores `branches`, `user_roles`, `audit_log` and `partners` entirely.
The one thing to keep in step is `JWT_SECRET` — old and new read the same
variable.
