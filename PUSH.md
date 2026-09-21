# Putting this on GitHub and deploying it

This is a fresh repository. It does **not** replace your four existing repos —
leave those exactly where they are. They are your rollback.

## What you are pushing

A git repository with two commits, already made. Nothing is connected to
GitHub yet — there is no remote, so nothing can go to the wrong place.

```
$ git log --oneline
<hash>  Clear deploy blockers; add preflight, smoke test and decision docs
<hash>  Merge four portals into one platform
```

## Step 1 — Unpack it

Download `flymaster-platform.tar.gz`, then:

```bash
tar -xzf flymaster-platform.tar.gz
cd flymaster-platform
git log --oneline          # you should see the two commits above
```

`node_modules` and `dist` are not in the archive — they are rebuilt by
`npm install` and by Railway.

## Step 2 — Create the new repo and push

With the GitHub CLI:

```bash
gh repo create flymaster-platform --private --source=. --remote=origin --push
```

Or by hand — create an **empty** repo called `flymaster-platform` on GitHub
(no README, no .gitignore, no licence), then:

```bash
git remote add origin https://github.com/rajeshvarma-git/flymaster-platform.git
git branch -M main
git push -u origin main
```

**Make it private.** The four existing repos are public, which is how the
signing key ended up published. There is no reason for this one to be public.

## Step 3 — Check nothing secret went up

```bash
git log -p --all | grep -iE "JWT_SECRET=|SIGNUP_CODE=|postgres://|postgresql://" | grep -v example
```

Expect no output. `.env` is in `.gitignore` and was never committed;
`.env.example` has placeholders only.

## Step 4 — Deploy on Railway

New → Deploy from GitHub repo → `flymaster-platform` → same project as your
Postgres, so `DATABASE_URL` can be referenced.

Variables:

| Variable | Value |
|---|---|
| `DATABASE_URL` | Add Reference → Postgres → DATABASE_URL |
| `JWT_SECRET` | a **new** random value (see DEPLOY.md step 0) |
| `ADMIN_SIGNUP_CODE` | a **new** value |
| `NODE_ENV` | `production` |

Copy the WhatsApp and email variables across from the admin service.

`railway.toml` in this repo already sets the build and start commands and the
`/api/health` health check. You should not need to configure those by hand.

Then follow `DEPLOY.md` from step 2 — watch the boot log, run the smoke test,
test by hand, move the domains.

## If the first deploy fails

| Log says | Cause | Fix |
|---|---|---|
| `Refusing to start: JWT_SECRET must be set` | variable missing | set it |
| `Refusing to start: DATABASE_URL must be set` | reference not added | Variables → Add Reference → Postgres |
| `vite: not found` | dev dependencies skipped | confirm the build command is `npm ci --include=dev && npm run build` |
| `Cannot find module '@capacitor/core'` | same cause | same fix |
| `Migration ... failed` | the database rejected a migration | copy the error; nothing was half-applied, each migration runs in a transaction |

The old four services keep serving traffic the whole time. A failed deploy here
costs you nothing but the time to read the log.
