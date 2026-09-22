# Agents, Freelancers and the Accountant — what was built

Against CRM document sections 6 (Agent/Freelancer) and 7 (Accountant).

## The chain

```
Agent shares /r/CODE  ─┐
                       ├─► lead tagged with partner  ─► lead MOVES to the
Student types CODE  ───┘      + referral_events log      partner's branch (doc 6.1)
                                                                │
                                          counsellor converts ──┤
                                                                ▼
                                           commission raised, status = pending
                                                                │
                              accountant of THAT branch reviews ┤
                                                                ▼
                        approve / hold / reject · notes · payout reference
                                                                │
                                              agent sees status ┘  (only notes
                                                                    marked visible)
```

## Verified against a live database

```
Rajesh (agent)      sees 2: ['Anil Test', 'Bina Test']
Sneha (freelancer)  sees 1: ['Chandu Test']

agent /api/state               403      agent /api/finance/commissions  403
agent /api/counselor/state     403      agent /api/partners             403
agent /api/telecaller/state    403      agent /api/branches             403

accountant sees 3 commissions, all HYD-AME, none from other branches
agent sees the clarification note; the internal hold reason does not appear
```

## From the document, and where it landed

| Doc | Built |
|---|---|
| 6.0 "partner code, referral link, linked-student count, commission status, invoice upload status, accounting notes visibility, verification status" | `partners` table + partner dashboard header |
| 6.0 status visible "only when Super Admin has enabled this visibility for that account" | `partners.can_view_student_status`, default **off** |
| 6.1 referral link ties the signup to the partner | `/r/<CODE>` landing, code remembered, partner name confirmed on screen |
| 6.1 "the referral link can automatically connect the student to that branch's lead pool" | attribution moves the lead into the partner's branch |
| 6.1 "can see only those five linked students" | every partner query filtered by `referred_by_partner_id` |
| 6.1 invoice upload against a linked student | `POST /api/partner/commissions/:id/invoice` |
| 7.2 invoice states: received, under review, clarification required, approved, on hold, rejected, paid, closed | all eight, as a CHECK constraint |
| 7.2 notes "visible to authorized Admins, Super Admin, and relevant Agent/Freelancer accounts" | `commission_notes.visible_to_partner`, per note |
| 7.2 student payments: service fees, application fees, deposits, refunds, outstanding | `student_payments` table + API |
| 7.2 branch-wise finance reports | `GET /api/finance/summary` |
| 7.3 "cannot change application status, visa status, counselling ownership" | accountant is refused `/api/state` outright |

## Client's rule, honoured

> "agents/freelancers will be very limited, that too upon activation from super admin only"

Any admin can create a partner and issue their code — they can start referring
immediately. Only `superAdminAuth` can attach a **login**, and that action is
written to `audit_log`. An admin attempting it gets `403 Super admin access
required`.

## Deliberate decisions

- **Internal notes are separate from clarifications.** A hold reason recorded
  for the branch head is not the same thing as a question sent to the partner.
  Conflating them is how internal remarks end up in front of the person they
  are about.
- **Nothing pays automatically.** A commission is recorded, a human approves,
  and the payout reference is typed in by that human.
- **Status visibility is off by default**, because the document says a Super
  Admin must enable it per account.
- **Flat-rate commissions carry their amount on creation**; percentage-of-fee
  ones are left at zero until finance knows the student's actual fee.

## Bugs found and fixed while building

1. **Referral columns were on the wrong table again.** Migration 003 put
   `referred_by_partner_id` on `student_leads`; the app reads `app_records`.
   Every agent dashboard would have shown zero students. Migration 005 moves
   it, and carries across anything already recorded.
2. **`commission_rate` was `NUMERIC(5,2)`** — capped at 999.99. This client
   pays ₹15,000 per enrolment, so creating a real partner failed with
   "numeric field overflow". Migration 006 widens it and adds a check that a
   *percentage* cannot exceed 100.
3. **Referred leads stayed in the wrong branch.** Doc 6.1 says a partner's
   referral should join that branch's lead pool; attribution now moves it, so
   the branch that owns the relationship — and its accountant — actually sees it.

## Not built

- Visa status: **no field for it exists anywhere in the system**, so the agent
  dashboard cannot show it. A data question for the client, not a build task.
- Payroll beyond the existing salary/leave tables — payslip generation,
  reimbursements, deductions, incentives, arrears, bonuses.
- Refunds and outstanding-balance reporting beyond the stored rows.
- Associate role.
