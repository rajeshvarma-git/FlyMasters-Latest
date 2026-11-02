import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Activity, ChevronDown, ChevronUp } from "lucide-react";
import { format } from "date-fns";
import { useAdminStore } from "@admin/lib/store";
import { displayName, isConvertedStudent } from "@admin/lib/utils";
import { Card } from "@admin/components/ui/Card";
import type { AttendanceRow } from "@admin/lib/types";

type State = "working" | "finished" | "leave" | "away";

const STATE_LABEL: Record<State, { text: string; dot: string; chip: string }> = {
  working: { text: "Working · clocked in", dot: "bg-emerald-500", chip: "bg-emerald-50 text-emerald-700" },
  finished: { text: "Clocked out", dot: "bg-slate-400", chip: "bg-slate-100 text-slate-600" },
  leave: { text: "On leave", dot: "bg-amber-500", chip: "bg-amber-50 text-amber-700" },
  away: { text: "Not working · not clocked in", dot: "bg-rose-500", chip: "bg-rose-50 text-rose-700" },
};

interface Person {
  id: string;
  alt?: string | null;
  name: string;
  role: "Counselor" | "Telecaller";
  email: string;
  phone: string;
  active: boolean;
  detailPath: string;
}

/** Everyone who clocks in — counselors and telecallers — in one live list. Updates with the shared store. */
export default function TeamStatus() {
  const store = useAdminStore();
  const [open, setOpen] = useState<string | null>(null);
  const [filter, setFilter] = useState<"all" | State>("all");
  const today = format(new Date(), "yyyy-MM-dd");

  const people: Person[] = useMemo(
    () => [
      ...store.counselors.map((row) => ({
        id: row.id, alt: row.auth_user_id, role: "Counselor" as const, active: row.is_active !== false,
        name: displayName(row.first_name, row.last_name, row.email), email: row.email, phone: row.phone || "",
        detailPath: `/counselors/${row.id}`,
      })),
      ...store.telecallers.map((row) => ({
        id: row.id, alt: null, role: "Telecaller" as const, active: row.is_active !== false,
        name: displayName(row.first_name, row.last_name, row.email), email: row.email, phone: row.phone || "",
        detailPath: `/telecallers/${row.id}`,
      })),
    ],
    [store.counselors, store.telecallers],
  );

  const rows = useMemo(() => {
    return people
      .filter((person) => person.active)
      .map((person) => {
        const ids = [person.id, person.alt].filter(Boolean) as string[];
        const history = store.attendance
          .filter((row) => ids.includes(row.counselor_id))
          .sort((a, b) => b.date.localeCompare(a.date));
        const todayRow: AttendanceRow | undefined = history.find((row) => row.date === today);
        const onLeave = store.leave.find(
          (leave) => ids.includes(leave.counselor_id) && leave.status === "approved"
            && String(leave.start_date).slice(0, 10) <= today && String(leave.end_date).slice(0, 10) >= today,
        );
        let state: State = "away";
        if (todayRow?.clock_in && !todayRow.clock_out) state = "working";
        else if (todayRow?.clock_in) state = "finished";
        else if (onLeave) state = "leave";
        const assigned = store.leads.filter((lead) =>
          person.role === "Counselor"
            ? ids.includes(String(lead.assigned_counselor_id))
            : lead.assigned_telecaller_id === person.id);
        return { person, state, todayRow, history: history.slice(0, 7), onLeave, assigned };
      });
  }, [people, store.attendance, store.leave, store.leads, today]);

  const counts = rows.reduce<Record<State, number>>((acc, row) => ({ ...acc, [row.state]: acc[row.state] + 1 }), { working: 0, finished: 0, leave: 0, away: 0 });
  const shown = rows.filter((row) => filter === "all" || row.state === filter);

  return (
    <div>
      <div className="mb-6 flex items-center gap-3">
        <Activity className="h-6 w-6 text-sky-500" />
        <div>
          <h1 className="text-2xl font-bold">Team status</h1>
          <p className="text-slate-600">Who is working right now — counselors, telecallers and every other staff member who clocks in. Click a person for details.</p>
        </div>
      </div>

      <div className="mb-4 flex flex-wrap gap-2">
        {([["all", `Everyone (${rows.length})`], ["working", `Working (${counts.working})`], ["finished", `Clocked out (${counts.finished})`], ["leave", `On leave (${counts.leave})`], ["away", `Not working (${counts.away})`]] as const).map(([key, label]) => (
          <button
            key={key}
            type="button"
            onClick={() => setFilter(key)}
            className={`rounded-full border px-3 py-1 text-sm font-medium ${filter === key ? "border-sky-500 bg-sky-50 text-sky-800" : "border-slate-200 text-slate-600 hover:bg-slate-50"}`}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="grid gap-3">
        {shown.map(({ person, state, todayRow, history, onLeave, assigned }) => {
          const meta = STATE_LABEL[state];
          const expanded = open === `${person.role}-${person.id}`;
          return (
            <Card key={`${person.role}-${person.id}`} className="overflow-hidden">
              <button
                type="button"
                onClick={() => setOpen(expanded ? null : `${person.role}-${person.id}`)}
                className="flex w-full items-center justify-between gap-3 px-5 py-4 text-left hover:bg-slate-50"
              >
                <div className="flex min-w-0 items-center gap-3">
                  <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${meta.dot}`} />
                  <div className="min-w-0">
                    <p className="truncate font-semibold">{person.name}</p>
                    <p className="truncate text-xs text-slate-500">{person.role} · {person.email}</p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${meta.chip}`}>{meta.text}</span>
                  {expanded ? <ChevronUp className="h-4 w-4 text-slate-400" /> : <ChevronDown className="h-4 w-4 text-slate-400" />}
                </div>
              </button>
              {expanded && (
                <div className="border-t border-slate-100 bg-slate-50/60 px-5 py-4 text-sm">
                  <dl className="grid grid-cols-[130px_1fr] gap-x-4 gap-y-1.5">
                    <dt className="text-slate-500">Phone</dt><dd>{person.phone || "—"}</dd>
                    <dt className="text-slate-500">Today</dt>
                    <dd>
                      {todayRow?.clock_in
                        ? `In ${todayRow.clock_in.slice(0, 5)}${todayRow.clock_out ? ` · Out ${todayRow.clock_out.slice(0, 5)} · ${todayRow.total_hours?.toFixed(2) ?? "—"} hrs` : " · still working"}`
                        : onLeave ? `On approved leave (${onLeave.leave_type})` : "Has not clocked in"}
                    </dd>
                    <dt className="text-slate-500">Workload</dt>
                    <dd>
                      {assigned.filter((lead) => !isConvertedStudent(lead)).length} open leads · {assigned.filter((lead) => isConvertedStudent(lead)).length} students
                    </dd>
                  </dl>
                  <p className="mb-1 mt-4 font-semibold">Last 7 days</p>
                  {history.length === 0 ? (
                    <p className="text-slate-500">No attendance recorded yet.</p>
                  ) : (
                    <ul className="divide-y divide-slate-100 rounded-lg border border-slate-100 bg-white">
                      {history.map((row) => (
                        <li key={row.id} className="flex justify-between px-3 py-1.5">
                          <span>{row.date}</span>
                          <span className="text-slate-600">
                            {row.clock_in?.slice(0, 5) || "—"} → {row.clock_out?.slice(0, 5) || "…"}
                            {row.total_hours != null ? ` · ${row.total_hours.toFixed(1)} h` : ""}
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                  <Link to={person.detailPath} className="mt-3 inline-block font-semibold text-sky-700 hover:underline">
                    Open full profile
                  </Link>
                </div>
              )}
            </Card>
          );
        })}
        {shown.length === 0 && <Card className="p-8 text-center text-sm text-slate-500">Nobody in this view.</Card>}
      </div>
    </div>
  );
}
