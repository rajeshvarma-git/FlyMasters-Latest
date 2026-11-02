import { useAdminStore } from "@admin/lib/store";
import { isConvertedStudent } from "@admin/lib/utils";
import TabbedHub from "@admin/admin/TabbedHub";
import Students from "@admin/admin/Students";
import CounselorsHub from "@admin/admin/CounselorsHub";

/** Students first (the customer); the counselors who serve them sit beside, not in a second menu entry. */
export default function PeopleHub() {
  const store = useAdminStore();
  return (
    <TabbedHub
      tabs={[
        { key: "students", label: "Students", count: store.leads.filter((lead) => isConvertedStudent(lead)).length, element: <Students /> },
        { key: "counselors", label: "Counselors", count: store.counselors.filter((row) => row.is_active !== false).length, element: <CounselorsHub /> },
      ]}
    />
  );
}
