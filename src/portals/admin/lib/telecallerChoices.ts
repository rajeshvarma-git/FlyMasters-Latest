import type { Telecaller } from "./types";

/**
 * Who may be offered as the telecalling person on a lead: people in the lead's branch.
 *
 * The picker used to list telecallers from every branch, so an admin could choose someone the server
 * then refused (403 CROSS_BRANCH), shown as a browser pop-up. Now:
 *  - a lead with a branch offers only people who work in that branch;
 *  - a lead with no branch yet offers everyone (only a Super Admin sees those, and the branch is set first);
 *  - the person already assigned is always kept, so the picker never shows the wrong name;
 *  - someone the server sent without branch information is kept rather than hidden;
 *  - a suspended person is never offered (unless already assigned, so the picker shows who holds it);
 *  - the Super Admin, who has every access, is offered everyone: any branch, suspended people included
 *    (labelled by the caller with suspendedLabel).
 */
/** Can this person be given new work? Not if their account is suspended or removed. */
export function canTakeWork(row: { is_active?: boolean | null; suspended?: boolean | null }) {
  return row.is_active !== false && row.suspended !== true;
}

/** Who a picker offers: everyone for the Super Admin, otherwise only people who can take work. */
export function offerableTo(superAdmin: boolean) {
  return (row: { is_active?: boolean | null; suspended?: boolean | null }) => superAdmin || canTakeWork(row);
}

/** " · access suspended" after the name of someone who cannot normally take work. */
export function suspendedLabel(row: { is_active?: boolean | null; suspended?: boolean | null }) {
  return canTakeWork(row) ? "" : " · access suspended";
}

export function telecallerChoices(
  telecallers: Telecaller[],
  lead: { branch_id?: string | null; assigned_telecaller_id?: string | null },
  { superAdmin = false }: { superAdmin?: boolean } = {},
): Telecaller[] {
  const branch = lead.branch_id ? String(lead.branch_id) : "";
  return telecallers.filter((row) => {
    if (superAdmin) return true;
    if (lead.assigned_telecaller_id && String(row.id) === String(lead.assigned_telecaller_id)) return true;
    if (!canTakeWork(row)) return false;
    if (!branch || !row.branch_ids) return true;
    return row.branch_ids.map(String).includes(branch);
  });
}
