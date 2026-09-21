import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Shield, Target } from "lucide-react";
import { useAdminStore } from "@admin/lib/store";
import { isConvertedStudent } from "@admin/lib/utils";
import Unassigned from "@admin/admin/Unassigned";
import Counselors from "@admin/admin/Counselors";

type Tab = "assign" | "counselors";

function parseTab(value: string | null): Tab {
  return value === "assign" ? "assign" : "counselors";
}

export default function CounselorsHub() {
  const [searchParams, setSearchParams] = useSearchParams();
  const store = useAdminStore();
  const [tab, setTab] = useState<Tab>(() => parseTab(searchParams.get("tab")));

  useEffect(() => {
    setTab(parseTab(searchParams.get("tab")));
  }, [searchParams]);

  const unassigned = store.leads.filter((lead) => isConvertedStudent(lead) && !lead.assigned_counselor_id).length;
  const counselorCount = store.counselors.filter((counselor) => counselor.is_active !== false).length;

  const selectTab = (key: Tab) => {
    setTab(key);
    const next = new URLSearchParams(searchParams);
    if (key === "counselors") next.delete("tab");
    else next.set("tab", key);
    setSearchParams(next, { replace: true });
  };

  return (
    <div>
      <div className="mb-6 flex items-center gap-3">
        <Shield className="h-6 w-6 text-sky-500" />
        <div>
          <h1 className="text-2xl font-bold">Counselors</h1>
        </div>
      </div>

      <div className="mb-6 flex gap-1 overflow-x-auto border-b border-slate-200">
        <button
          type="button"
          onClick={() => selectTab("assign")}
          className={`-mb-px flex shrink-0 items-center gap-2 border-b-2 px-3.5 py-2.5 text-sm font-semibold transition ${
            tab === "assign" ? "border-sky-500 text-navy-900" : "border-transparent text-slate-500 hover:text-navy-900"
          }`}
        >
          <Target className="h-4 w-4" />
          Counselor Assign
          {unassigned > 0 && (
            <span
              className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${
                tab === "assign" ? "bg-gold-100 text-gold-900" : "bg-slate-100 text-slate-600"
              }`}
            >
              {unassigned}
            </span>
          )}
        </button>
        <button
          type="button"
          onClick={() => selectTab("counselors")}
          className={`-mb-px flex shrink-0 items-center gap-2 border-b-2 px-3.5 py-2.5 text-sm font-semibold transition ${
            tab === "counselors" ? "border-sky-500 text-navy-900" : "border-transparent text-slate-500 hover:text-navy-900"
          }`}
        >
          <Shield className="h-4 w-4" />
          Counselors
          {counselorCount > 0 && (
            <span
              className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${
                tab === "counselors" ? "bg-sky-100 text-sky-800" : "bg-slate-100 text-slate-600"
              }`}
            >
              {counselorCount}
            </span>
          )}
        </button>
      </div>

      {tab === "assign" ? <Unassigned hideHeader /> : <Counselors hideHeader />}
    </div>
  );
}
