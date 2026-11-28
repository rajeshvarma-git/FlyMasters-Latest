/**
 * Who holds which work: ONE definition, used by the admin Dashboard's workload list and by the server's
 * Transfer work screen. The two used to count separately and disagreed (reported 28 Nov 2026: Dashboard
 * said counsellor 1 had 4 students, Transfer work said 5).
 *
 *  - a counselor's students are converted records whose counselor is one of that person's ids;
 *  - a telecaller's leads are open (not converted) records whose telecaller is one of their ids.
 *
 * A person can carry more than one id (a counselor has a login id and a counselor record id), so the
 * caller passes every id that person's records may carry. The lead list must be the same one the
 * portal shows (duplicates folded together), which on the server is loadWorkLeads().
 */
export interface WorkLead {
  entity_type?: string | null;
  lead_status?: string | null;
  assigned_counselor_id?: string | null;
  assigned_telecaller_id?: string | null;
}

export function isConverted(lead: WorkLead) {
  return lead.entity_type === "student" || lead.lead_status === "converted";
}

const holds = (ids: Iterable<string | null | undefined>, value?: string | null) => {
  if (!value) return false;
  for (const id of ids) if (id && String(id) === String(value)) return true;
  return false;
};

/** Converted students this person counsels. */
export function studentsCounseledBy<T extends WorkLead>(leads: T[], ids: Iterable<string | null | undefined>): T[] {
  const list = [...ids];
  return leads.filter((lead) => isConverted(lead) && holds(list, lead.assigned_counselor_id));
}

/** Open leads this person is calling. */
export function leadsCalledBy<T extends WorkLead>(leads: T[], ids: Iterable<string | null | undefined>): T[] {
  const list = [...ids];
  return leads.filter((lead) => !isConverted(lead) && holds(list, lead.assigned_telecaller_id));
}
