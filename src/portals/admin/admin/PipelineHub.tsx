import { useAdminStore } from "@admin/lib/store";
import { isConvertedStudent } from "@admin/lib/utils";
import TabbedHub from "@admin/admin/TabbedHub";
import Leads from "@admin/admin/Leads";
import Applications from "@admin/admin/Applications";

/** Leads and Applications are one pipeline: a lead becomes a student, then applies. */
export default function PipelineHub() {
  const store = useAdminStore();
  const pending = store.applications.filter((row) => row.status === "pending_counselor" || row.status === "submitted").length;
  return (
    <TabbedHub
      tabs={[
        { key: "leads", label: "Leads", count: store.leads.filter((lead) => !isConvertedStudent(lead)).length, element: <Leads /> },
        { key: "applications", label: "Applications", count: pending, element: <Applications /> },
      ]}
    />
  );
}
