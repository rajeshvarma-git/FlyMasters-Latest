# CRM sections 2.6 and 2.7 — what was built

Two sections of the CRM document, built in full: **2.6** (country, document,
university and course configuration, including 2.6.1 alerts and 2.6.2 the
checklist and status workflow) and **2.7** (communication and automation
control).

Everything below is live behind `/api/config/*`, `/api/alerts/*` and
`/api/comms/*`, with admin screens under **Catalog & setup**, **Communication**
and **System** in the left menu.

---

## The rule that shapes all of it: nothing is deleted

The client asked for this explicitly, and it is enforced in the database, the
API and the screens rather than left to discipline.

- A checklist or a message template that changes is **superseded**, never
  overwritten. The old version keeps its row, moves to `inactive`, and stores
  `superseded_by` pointing at the version that replaced it.
- A published version is **immutable**. The API refuses to edit it; the screen
  shows a lock and offers "new version from this" instead.
- A student is **pinned** to the version that was live when their checklist was
  activated. Publishing Canada v2 on Tuesday does not change the requirements
  for the forty students who started on v1 on Monday. The counsellor sees a
  note saying exactly that, so it reads as deliberate rather than stale.
- Retiring a document, a status word or a template hides it from new work and
  leaves every historical reference readable.

## Who can see the history

`config_change_log` records every configuration change: what it was, what it
became, which version replaced which, who did it and when.

It is **not** open to all staff. `GET /api/config/changes` is behind
`developerOnly`, which reads the `DEVELOPER_EMAILS` environment variable:

```
DEVELOPER_EMAILS=you@yourdomain.com,someone@mg3verse.com
```

With that set, only those addresses can read it. With it unset the gate falls
back to super admin alone — never to "any admin". The admin menu hides the
entry for everyone else, so nobody meets a 403 they do not understand.

---

## 2.6 — configuration

| Piece | Where | Note |
|---|---|---|
| Document master | `/documents-master` | One record per document type: description, accepted formats, max size, expiry tracking, sample and review instructions, country scope, retention |
| Rejection reasons | `POST /api/config/reasons` | Seeded with five common ones; the counsellor picks rather than types |
| Status words | `/statuses` | Five lists the Super Admin owns: document, application, visa, commission visibility, next step. Each has a colour, a position on the bar, and per-audience visibility |
| Country checklists | `/checklist-builder` | Versioned, built from the master, by country / stage / course level / intake / institution type |
| Student activation | Student → **Checklist & status** tab, and the counsellor's **Checklists & status** page | Pins the live version, runs duplicate detection |
| Status bar | `@shared/components/StatusBar` | One component, five places. Stages come from the vocabulary, filtered by who is asking |
| Per-agent visibility | Agents screen → **Visibility** | Four switches per agent account: application, visa, next step, documents. Defaults are "show", so nothing changed for existing agents |

### Cross-country duplicates

A student applying to Canada and Australia is asked for their passport once.
When a document is accepted anywhere, the same document on that student's other
checklists is set to `not_required` and points back at the accepted one, so
each country's checklist still tracks its own completeness while the student
uploads once. Activating a second checklist applies the same rule up front and
reports how many items were already covered.

### 2.6.1 — alerts

Settings resolve most-specific-first: **user → role → branch → global**. Each
rule carries priority, tone, channels (bell, toast, sound, banner, push),
colour, display time, snooze and mute permissions, quiet hours, and whether it
respects working hours.

Three gates run before an alert lands: the setting is on, the person is not
muted or snoozed, and it is neither quiet hours nor off-shift. An **urgent**
alert still arrives when those gates would block it — silently. An overdue
follow-up is never lost, it just does not wake anyone at 11pm.

Delivery is `@shared/components/AlertCenter`, mounted in the admin, counsellor
and telecaller layouts. Sound is synthesised with the Web Audio API rather than
shipped as files, so there is nothing to host and the tone can differ by
priority. Browsers block audio until the person has clicked something once —
the first alert of a session may be silent, which is a browser rule, not a bug.

---

## 2.7 — communication

| Piece | Where | Note |
|---|---|---|
| Templates | `/templates` | Versioned and approved. Restricted by role, branch, country, intake, student stage and channel |
| Template picker | Counsellor and admin chat composers | Shows only what the server says this person may use, with placeholders already filled |
| Automation | `/automation` | Event → template → recipient → delay. New rules are created **off** |
| Delivery log | `/comms-log` | `skipped` and `failed` are different things, and the screen says which and why |
| Consent | `PUT /api/comms/consent` | Per student, per channel. An opted-out message is logged as skipped, never sent |
| Out-of-office | `PUT /api/comms/auto-response` | Global, branch or personal, with working hours and response-time wording |
| Supervision | `/supervision` | All three chat stores read through one shape |
| Escalations | `/escalations` | What students reported, and what was done |

### WhatsApp and Meta

Meta approves WhatsApp templates separately from us. The CRM refuses to publish
a WhatsApp template until `meta_template_name` is filled in, because a template
that looks approved here and is not approved there fails silently at send time
— which a counsellor would read as the platform being broken.

### The safeguards on automation

- A new rule is created **switched off**. Somebody has to look at it.
- Every rule has a **daily cap** (`max_per_day`), claimed atomically, so a
  misconfigured rule stops itself instead of sending four hundred messages.
- A delivery failure **pauses the rule** and records why.
- **Stop everything** disables every rule at once, super admin only.
- Every rule can be **tested** against one address before it is turned on.

### Supervision is visible, not covert

Opening a conversation is logged. Joining one writes a system message into the
thread, so the student and the counsellor both see that a supervisor is
present. That is a deliberate choice and worth saying to the client rather than
discovering later.

---

## Verifying it

```
python3 scripts/verify-2.6-2.7.py http://127.0.0.1:8791
```

94 checks, against a **fresh** database (it creates test data and accounts).
It proves the version pinning, the immutability, the duplicate handling, the
status enforcement, the Meta gate, the daily cap, the kill switch, the opt-out
path, and every permission boundary.

## Database

Migration `007_config_and_comms.sql` — additive only, 18 new tables and four
new columns on `partners`, all with safe defaults. Nothing is dropped and
nothing existing is rewritten.

Unlike the legacy data, these are **real tables**, not JSONB inside
`app_records`. This is configuration that gets queried, joined, versioned and
audited, and nothing else reads it — so it does not inherit the trap that
migrations 004 and 005 were written to fix.
