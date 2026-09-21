# Fly Masters Platform

One repository, one deploy, one login for all four portals.

**Two doors, one deployment.**

| URL | Who | Notes |
|---|---|---|
| `/` | Students and the public | the student portal |
| `/staff` | **All staff** | one sign-in for super_admin, admin, branch_head, counselor, telecaller |

After signing in at `/staff` the role decides where you land — nobody picks a
portal, and nobody needs a different link:

| Role | Lands on |
|---|---|
| super_admin, admin, branch_head | `/admin` |
| counselor | `/counselor` |
| telecaller | `/telecaller/queue` |

The old portal sign-in URLs (`/admin/login`, `/counselor/login`,
`/telecaller`) still work — they redirect to `/staff`, so existing bookmarks
are not broken.

## Run locally

```bash
cp .env.example .env      # set DATABASE_URL and JWT_SECRET
npm install
npm run dev               # api on 8788, web on 8080
```

Migrations run automatically at boot. To run them alone: `npm run migrate`.

## Layout

```
server/
  index.mjs            single Express process, mounts every router
  lib/
    env.mjs            one config source; refuses to boot without JWT_SECRET in prod
    db.mjs             one pool; user_roles reads/writes redirect to the real table
    auth.mjs           ONE auth realm: session, requireRole, branchScope, audit
    migrate.mjs        ordered, tracked migrations
  migrations/
    001_baseline.sql            the three old schemas, merged
    002_rbac_branches_audit.sql branches, user_roles table, audit_log
    003_partners_referrals.sql  agents/freelancers, referral attribution
  routes/
    core.mjs           admin + telecaller + shared staff + whatsapp
    counselor.mjs      /api/counselor/*
    student.mjs        /__auth, /__session, /__local_db, /__storage
src/
  App.tsx              picks the portal from the URL, mounts it under a basename
  portals/{admin,counselor,telecaller,student}/
  shared/lib/session.ts   one token for every portal
```

## Adding a role

1. Add it to `ROLES` in `server/lib/auth.mjs`.
2. Add it to the `user_roles_role_valid` CHECK constraint in a new migration.
3. If it is branch-limited, add it to `BRANCH_SCOPED_ROLES` — that is all the
   scoping it needs.

Branch Head is already wired: it is `admin` limited to one `branch_id`, and it
reuses the admin screens.
