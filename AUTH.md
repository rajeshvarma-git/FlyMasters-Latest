# Logins: what is shared now, and what is not

## The short answer

**Staff share one login. Students still have a separate one.**

| | Admin / Counselor / Telecaller | Student |
|---|---|---|
| Sign-in endpoint | `POST /api/auth/signin` | `POST /__auth` |
| What the token is | a **JWT** — signed text the server can verify without looking anything up | an **opaque token** — a random string that is a row in `auth_sessions` |
| Expires | 7 days | 30 days |
| Stored in the browser as | `sessionStorage["fm_token"]` | `localStorage["flymasters.student.session.v2"]` |
| Checked by | `server/lib/auth.mjs` | `server/student/studentAuth.ts` |
| Role checked on every request | yes, re-read from `user_roles` | no — being a student is assumed |

Before the merge there were **three** separate logins (admin, counselor,
student) with three different signing secrets. There are now **two**. A staff
member who works in two portals signs in once. A student is still on a separate
path.

## Is that good or not?

**It is fine to deploy. It is not fine to leave.** Three specific reasons.

### 1. The two paths treat the same password table differently

Both read the same `auth_users` table, and — good news — both hash passwords
the same way (`scrypt`). The same password works on both paths. That means
unifying them later will not force anyone to reset a password.

But the student path has a fallback the staff path does not:

```ts
// server/student/password.ts
if (stored.startsWith("scrypt:")) { ...proper check... }
return stored === password;   // <- plaintext comparison
```

If any old row still holds a plaintext password, the **student** endpoint
accepts it and the **staff** endpoint refuses it. The same account, two
different security standards.

This is partly self-healing: on a successful sign-in the code immediately
re-hashes to scrypt, and there is rate limiting. The boot-time `[preflight]`
check now counts how many such rows are left and prints it in the deploy log.
If that number is 0, this is already closed.

### 2. Turning off an account only half works

Setting `user_roles.is_active = false` cuts off staff at their next request,
because the JWT path re-reads the role from the database every time.

It does **nothing** to a student. Their token is a row in `auth_sessions` that
nobody consults `user_roles` for, so a removed student keeps access for up to
30 days. Right now, deactivating a student means deleting their session rows by
hand.

### 3. It is on the path of the feature you want next

The referral code gets entered during student sign-up. That request goes
through `/__auth` and the generic JSONB store — the one part of the system with
**no role checks and no audit trail**. Partner attribution, the thing money
depends on, would be written by the least supervised code path you have.

That is why this gets fixed before the partner feature, not after.

## What to do, and when

**Do not fix it during the cutover.** Unifying student auth touches sign-up,
sign-in, session restore, password reset and the mobile app. Doing it in the
same deploy as the four-into-one merge means that when something breaks you
will not know which change caused it. Deploy the merge, prove it works, then do
this as its own change with its own test.

### The plan, after the merge is live

1. `/__auth` keeps its current request and response shape so the student
   frontend needs no changes — but internally it issues a **JWT** from
   `server/lib/auth.mjs` instead of an `auth_sessions` row.
2. Accept both token types during a transition window. An opaque token still
   works until it expires; a JWT is issued on every new sign-in.
3. Student requests then run through the same `session()` middleware, so
   `is_active` works for students too.
4. After 30 days, every opaque token has expired. Delete the dual-path code and
   `auth_sessions` with it.

Nobody is logged out, nobody resets a password, and it ships as one reviewable
change.

**Estimate: 2–3 days including testing.** It should sit between "merge is live
and tested" and "start the partner feature".
