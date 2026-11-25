import { isConvertedStudent, isOpenLead } from "./utils";

/**
 * A counselor can hold two different kinds of work, and every screen must count them the same way:
 *  - telecalling leads: open leads where they are the telecalling person (or, for older records, the
 *    counselor on a lead that is not converted yet);
 *  - counseling students: converted students where they are the assigned counselor.
 *
 * The dashboard used to count a converted student as "mine" when the counselor had only made the calls
 * (assigned_telecaller_id), while My Students lists only students they counsel. A counselor who did the
 * calling saw a bigger number on the dashboard than in their list (found in review, 25 Nov 2026).
 */
type LeadLike = {
  id?: string | null;
  user_id?: string | null;
  email?: string | null;
  assigned_counselor_id?: string | null;
  assigned_telecaller_id?: string | null;
  entity_type?: string;
  lead_status?: string;
  lead_stage?: string;
};

export function counselingStudents<T extends LeadLike>(leads: T[], userId?: string | null): T[] {
  if (!userId) return [];
  const seen = new Set<string>();
  return leads.filter((lead) => {
    if (lead.assigned_counselor_id !== userId || !isConvertedStudent(lead)) return false;
    const key = lead.user_id ? `u:${lead.user_id}` : `e:${(lead.email || "").trim().toLowerCase()}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function telecallingLeads<T extends LeadLike>(leads: T[], userId?: string | null): T[] {
  if (!userId) return [];
  return leads.filter(
    (lead) => (lead.assigned_counselor_id === userId || lead.assigned_telecaller_id === userId) && isOpenLead(lead),
  );
}

/** Of the leads this person telecalled, how many they converted (0-100). */
export function telecallingConversionRate(leads: LeadLike[], userId?: string | null): number {
  if (!userId) return 0;
  const called = leads.filter((lead) => lead.assigned_telecaller_id === userId);
  if (!called.length) return 0;
  return Math.round((called.filter((lead) => isConvertedStudent(lead)).length / called.length) * 100);
}
