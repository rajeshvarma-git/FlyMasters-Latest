# Agents and freelancers — the decision, costed

Nothing here is built yet. Migration 003 created the tables; there is no feature
code, on purpose. This document is what to decide before writing any.

---

## First: where the money in this feature actually is

It is natural to compare the options by "which is easier to build". That is the
wrong axis, because the build cost of every option below is one to two days and
the difference between them is hours. Hours of development are the cheapest
thing in this decision.

Here is what the options actually cost, per year, at a realistic scale of
**50 partners and 500 referred leads**:

| Cost | Amount | Notes |
|---|---|---|
| Extra server cost for referral tracking | **₹0** | One column on a table you already have, one index. No new service. |
| Development | 1–2 days, once | Never repeats. |
| **Arguing about who gets paid** | **40–60 hours/year** | Every lead whose referral was not captured is a phone call, a database check, and a relationship. At 30 minutes each, 100 contested leads is six working days of somebody's salary — every year, forever. |
| Partner logins (if you build them) | ongoing, unbounded | 50 external accounts to onboard, reset, support and secure. |

**So the expensive thing is not the feature. It is attribution failure and
partner support.** Every choice below is judged on whether it reduces those two,
not on whether it is quick to write.

---

## Decision 1 — Are "agent" and "freelancer" two systems or one?

**One.** They are already modelled as one:

```
partners(type = 'agent' | 'freelancer', commission_rate, commission_basis)
```

Functionally both do the identical thing: they bring you a student and you pay
them. What differs is the rate, the basis (per lead / per enrollment / % of
fee), and usually the contract. Those are three columns.

Why this matters in cost terms: **two systems cost double forever.** Two
screens to build, two to redesign next year, two payout reports, two sets of
bugs, two places to remember when the commission rule changes. You would be
paying that tax permanently to express a difference that is a dropdown.

If the difference later turns out to be structural — say agents get exclusive
territories and freelancers do not — that is another column, not another system.

---

## Decision 2 — Referral link, or typed code?

### What each one is

**Referral link.** The agent shares `flymasters.in/r/RAJ2026`. The student
clicks it, the code is remembered in their browser, and it attaches itself when
they sign up. The student does nothing.

**Typed code.** During sign-up or in the AI chat the student is asked "Who
referred you?" and types `RAJ2026`.

### How each one fails, and what that failure costs

**The link loses referrals silently.** In India specifically:

- Agents share on WhatsApp. WhatsApp opens links in its own in-app browser. The
  student browses there, then later opens Chrome to actually apply — and the
  remembered code does not come with them.
- Study-abroad decisions take weeks. The student sees the link in March and
  applies in May, arriving through a Google search, not the link.
- Phone to laptop. Incognito. Cleared storage. Shared family devices.

A realistic capture loss is **30–50%**. On 500 referred leads that is 150–250
leads where the agent says "that one was mine" and your database has no record
either way. That is the 40–60 hour line in the table above.

**The typed code is claimable.** It is text, so an agent can tell any student to
type it — including a student who walked into your branch from your own
advertising. The link cannot be faked that way.

**And the link cannot handle your most common case at all.** In study-abroad,
most agent referrals are not a click. The agent physically brings the student,
or calls your counsellor and says "I'm sending someone". There is no link in
that flow. A typed code, or a counsellor entering the partner on the lead, is
the only thing that works.

### The recommendation: both, because they are the same column

The link does not need separate code. `/r/RAJ2026` simply **pre-fills the same
field** the student would otherwise type into. One column, one table, one
validation path, both entry points.

```
Agent shares link  ──►  /r/RAJ2026  ──┐
                                      ├──►  same field, pre-filled or typed
Agent says "type my code" ────────────┘         │
                                                ▼
                                   student_leads.referral_code_entered
                                   student_leads.referred_by_partner_id
                                   referral_events (every attempt, always)
```

Extra cost of doing both instead of one: **half a day, once.** Reduction in the
40–60 hour line: substantial, because the two methods fail in different
situations and cover each other.

### Three implementation rules that matter more than the choice

1. **Make the field visible, not hidden behind "Have a referral code?"** A
   collapsed link is not clicked, and an uncaptured referral is a dispute.
2. **Show the partner's name back** once the code is recognised: "Referred by
   Rajesh Kumar — is that right?" This catches typos at the only moment they
   are cheap to fix, and it stops the student entering a code they misheard.
3. **Write every attempt to `referral_events`, including the rejected ones.**
   This is the single highest-value line of code in the feature. When an agent
   disputes, you open one table and the answer is there. Without it, every
   dispute is an argument with no evidence, and that is the cost you are trying
   to avoid.

---

## Decision 3 — Do partners get a login?

**Not in version one.** This is the one place where the cost genuinely scales.

Fifty partners with logins is fifty external user accounts: onboarding, password
resets, "I can't get in" on a Sunday, and fifty more people who can reach lead
data. That support load never stops, and it starts the day you launch.

Two cheaper ways to give a partner visibility:

| Option | What the partner gets | Cost |
|---|---|---|
| **Signed status link** | `flymasters.in/p/<token>` — a read-only page showing only their own referrals and each one's stage. No password, no account, revocable by deleting the token. | ~1 day, then nothing |
| **Weekly WhatsApp update** | "3 of your referrals moved to application stage this week." | See below |

WhatsApp costs in India as of January 2026 are per message, not per
conversation: **utility ₹0.145, marketing ₹1.09, service replies free** inside
the 24-hour window that opens when the partner messages you.

- 50 partners × 4 updates/month as **utility** = 200 messages = **₹29/month**.
- The same as **marketing** = **₹218/month**, 7.5× more for identical content.

So: send partner updates as **utility templates**, never marketing, and reply
inside the service window where it is free. Getting this template category right
costs nothing and saves more per month than the entire server bill difference.

Build the partner portal only when partners ask for it repeatedly — and by then
you will know what they actually want to see, instead of guessing.

---

## Decision 4 — The attribution rule (this one is yours, not the developer's)

This is the only genuinely blocking question, and no amount of code answers it.
Here is a concrete default. Approve it, or change the numbers.

> 1. **First code wins.** The first valid code recorded against a lead holds.
> 2. **A code entered before a counsellor has logged contact is accepted.**
> 3. **A code entered after a counsellor has logged contact is recorded but not
>    paid** — stored as `outcome = 'rejected_owned'`, visible to both sides, so
>    the agent can dispute it with evidence rather than by phone.
> 4. **90-day window.** If the student enrolls more than 90 days after the code
>    was entered, the referral lapses.
> 5. **No self-referral.** A code is refused if the lead's email or phone
>    matches the partner's own.
> 6. **An admin can override any of the above**, and the override is written to
>    `audit_log` with who did it and why.

`referral_events.outcome` already has `captured`, `rejected_duplicate`,
`rejected_owned` and `superseded` ready for whichever version you choose.

Rule 3 is the one to think hardest about. It is the difference between "agents
feel cheated" and "your branch staff feel robbed of leads they generated". Pick
the side you can defend to both, write it into the partner contract, and then
the software just enforces what the contract says.

---

## What to build, in order, once the merge is live and tested

| # | Work | Days | Why this order |
|---|---|---|---|
| 1 | Partner records + referral code on the lead + `referral_events` | 2 | Nothing else works without attribution being recorded. |
| 2 | Code field in student sign-up and the AI chat, with name confirmation | 1 | The capture path that works for offline referrals. |
| 3 | `/r/<CODE>` link that pre-fills the same field | 0.5 | Same column, covers the online path. |
| 4 | Partner list + referral report inside the existing admin portal | 2 | Your team needs to see it before partners do. |
| 5 | Signed read-only status link for partners | 1 | Visibility without accounts. |
| 6 | Commission calculation — recorded, approved by a human, never auto-paid | 3 | Only once real referrals exist and the rule has survived contact with reality. |

**Deliberately not on this list:** a partner portal with logins, automated
payouts, and a separate freelancer system. Each is a permanent cost line, and
none of them becomes harder to add later because you waited.
