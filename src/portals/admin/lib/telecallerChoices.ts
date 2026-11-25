import type { Telecaller } from "./types";

/**
 * Who may be offered as the telecalling person on a lead: people in the lead's branch.
 *
 * The picker used to list telecallers from every branch, so an admin could choose someone the server
 * then refused (403 CROSS_BRANCH), shown as a browser pop-up. Now:
 *  - a lead with a branch offers only people who work in that branch;
 *  - a lead with no branch yet offers everyone (only a Super Admin sees those, and the branch is set first);
 *  - the person already assigned is always kept, so the picker never shows the wrong name;
 *  - someone the server sent without branch information is kept rather than hidden.
 */
export function telecallerChoices(
  telecallers: Telecaller[],
  lead: { branch_id?: string | null; assigned_telecaller_id?: string | null },
): Telecaller[] {
  const branch = lead.branch_id ? String(lead.branch_id) : "";
  if (!branch) return telecallers;
  return telecallers.filter((row) => {
    if (lead.assigned_telecaller_id && String(row.id) === String(lead.assigned_telecaller_id)) return true;
    if (!row.branch_ids) return true;
    return row.branch_ids.map(String).includes(branch);
  });
}
