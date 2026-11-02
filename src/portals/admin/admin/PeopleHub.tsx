import { useAdminStore } from "@admin/lib/store";
import { isConvertedStudent } from "@admin/lib/utils";
import TabbedHub from "@admin/admin/TabbedHub";
import Students from "@admin/admin/Students";
import Counselors from "@admin/admin/Counselors";
import Unassigned from "@admin/admin/Unassigned";

/** One page for the customer and the staff who serve them: Students, Counselors, and assigning one to the other. */
export default function PeopleHub() {
  const store = useAdminStore();
  const waiting = store.leads.filter((lead) => isConvertedStudent(lead) && !lead.assigned_counselor_id).length;
  return (
    <TabbedHub
      tabs={[
        { key: "students", label: "Students", count: store.leads.filter((lead) => isConvertedStudent(lead)).length, element: <Students /> },
        { key: "counselors", label: "Counselors", count: store.counselors.filter((row) => row.is_active !== false).length, element: <Counselors hideHeader /> },
        { key: "assign", label: "Assign counselor", count: waiting, element: <Unassigned hideHeader /> },
      ]}
    />
  );
}
