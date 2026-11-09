import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Activity, X } from "lucide-react";
import { api } from "@admin/lib/api";
import { useAutoRefresh } from "@shared/hooks/useAutoRefresh";
import { Card } from "@admin/components/ui/Card";

type Working = "working" | "finished" | "leave" | "not_clocked_in" | "unknown";
type Role = "counselor" | "telecaller" | "accountant" | "branch_head" | "admin";

interface Employee {
  id: string;
  name: string;
  email: string;
  role: Role;
  roleLabel: string;
  branches: { id: string; name: string }[];
  account: "enabled" | "disabled";
  working: Working;
}

interface Detail {
  employee: Employee;
  profile: { phone: string };
  working: { state: Working; clockIn: string | null; clockOut: string | null; hours: number | null; leave: string | null };
  history: { date: string; clock_in: string | null; clock_out: string | null; total_hours: number | null }[];
  workload: { openLeads: number; students: number } | null;
}

// "Unknown" means there is no clock-in or leave data for this person. It is never shown as Working or Not working.
const WORKING_LABEL: Record<Working, { text: string; dot: string; chip: string }> = {
  working: { text: "Working · clocked in", dot: "bg-emerald-500", chip: "bg-emerald-50 text-emerald-700" },
  finished: { text: "Clocked out", dot: "bg-slate-400", chip: "bg-slate-100 text-slate-600" },
  leave: { text: "On leave", dot: "bg-amber-500", chip: "bg-amber-50 text-amber-700" },
  not_clocked_in: { text: "Not clocked in today", dot: "bg-rose-500", chip: "bg-rose-50 text-rose-700" },
  unknown: { text: "Unknown", dot: "bg-slate-300", chip: "bg-slate-100 text-slate-500" },
};

const ROLES: { key: Role; label: string }[] = [
  { key: "counselor", label: "Counselors" },
  { key: "telecaller", label: "Telecallers" },
  { key: "accountant", label: "Accountants" },
  { key: "branch_head", label: "Branch Heads" },
  { key: "admin", label: "Admins" },
];

const profilePath = (employee: Employee) =>
  employee.role === "counselor" ? `/counselors/${employee.id}`
    : employee.role === "telecaller" ? `/telecallers/${employee.id}`
    : null;

const branchText = (employee: Employee) => (employee.branches.length ? employee.branches.map((b) => b.name).join(", ") : "No branch");

/** Every employee role in one live list: the server decides who the caller may see. Accountants have no
 * detail screen of their own, so their row simply has no "Open full profile" link. */
export default function TeamStatus() {
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [branches, setBranches] = useState<{ id: string; name: string }[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState("");
  const [role, setRole] = useState<"all" | Role>("all");
  const [branch, setBranch] = useState("all");
  const [working, setWorking] = useState<"all" | Working>("all");
  const [selected, setSelected] = useState<string | null>(null);
  const [detail, setDetail] = useState<Detail | null>(null);
  const [detailError, setDetailError] = useState("");

  const load = useCallback(async () => {
    try {
      const data = await api<{ employees: Employee[]; branches: { id: string; name: string }[] }>("/team-status");
      setEmployees(data.employees);
      setBranches(data.branches);
      setError("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load team status.");
    } finally {
      setLoaded(true);
    }
  }, []);

  const loadDetail = useCallback(async (id: string) => {
    try {
      setDetail(await api<Detail>(`/team-status/${encodeURIComponent(id)}`));
      setDetailError("");
    } catch (err) {
      setDetail(null);
      setDetailError(err instanceof Error ? err.message : "Could not load this employee.");
    }
  }, []);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => {
    setDetail(null);
    setDetailError("");
    if (selected) void loadDetail(selected);
  }, [selected, loadDetail]);
  useAutoRefresh(() => Promise.all([load(), selected ? loadDetail(selected) : undefined]));

  const shown = employees.filter((e) =>
    (role === "all" || e.role === role)
    && (branch === "all" || e.branches.some((b) => b.id === branch))
    && (working === "all" || e.working === working));
  const count = (key: Working) => employees.filter((e) => e.working === key).length;

  const chip = (active: boolean) =>
    `rounded-full border px-3 py-1 text-sm font-medium ${active ? "border-sky-500 bg-sky-50 text-sky-800" : "border-slate-200 text-slate-600 hover:bg-slate-50"}`;

  return (
    <div>
      <div className="mb-6 flex items-center gap-3">
        <Activity className="h-6 w-6 text-sky-500" />
        <div>
          <h1 className="text-2xl font-bold">Team status</h1>
          <p className="text-slate-600">Counselors, telecallers, accountants, branch heads and admins you manage. Working status comes from clock-in records; where there are none it shows Unknown.</p>
        </div>
      </div>

      <div className="mb-3 flex flex-wrap gap-2">
        <button type="button" className={chip(role === "all")} onClick={() => setRole("all")}>All roles ({employees.length})</button>
        {ROLES.map(({ key, label }) => (
          <button key={key} type="button" className={chip(role === key)} onClick={() => setRole(key)}>
            {label} ({employees.filter((e) => e.role === key).length})
          </button>
        ))}
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <label className="flex items-center gap-2 text-sm text-slate-600">
          Branch
          <select value={branch} onChange={(event) => setBranch(event.target.value)} className="rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-sm">
            <option value="all">All branches</option>
            {branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
          </select>
        </label>
        <label className="flex items-center gap-2 text-sm text-slate-600">
          Working status
          <select value={working} onChange={(event) => setWorking(event.target.value as "all" | Working)} className="rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-sm">
            <option value="all">Any</option>
            {(Object.keys(WORKING_LABEL) as Working[]).map((key) => (
              <option key={key} value={key}>{WORKING_LABEL[key].text} ({count(key)})</option>
            ))}
          </select>
        </label>
      </div>

      {error && <Card className="mb-3 border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">{error}</Card>}

      <div className="grid gap-3">
        {shown.map((employee) => {
          const meta = WORKING_LABEL[employee.working];
          return (
            <Card key={employee.id} className="overflow-hidden">
              <button
                type="button"
                onClick={() => setSelected(employee.id)}
                className="flex w-full items-center justify-between gap-3 px-5 py-4 text-left hover:bg-slate-50"
              >
                <div className="flex min-w-0 items-center gap-3">
                  <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${meta.dot}`} />
                  <div className="min-w-0">
                    <p className="truncate font-semibold">{employee.name}</p>
                    <p className="truncate text-xs text-slate-500">{employee.roleLabel} · {branchText(employee)}</p>
                  </div>
                </div>
                <div className="flex flex-wrap items-center justify-end gap-2">
                  <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${employee.account === "enabled" ? "bg-sky-50 text-sky-700" : "bg-slate-200 text-slate-600"}`}>
                    Account {employee.account}
                  </span>
                  <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${meta.chip}`}>{meta.text}</span>
                </div>
              </button>
            </Card>
          );
        })}
        {loaded && shown.length === 0 && !error && (
          <Card className="p-8 text-center text-sm text-slate-500">
            {employees.length === 0 ? "No employees in your authorized scope." : "Nobody matches these filters."}
          </Card>
        )}
      </div>

      {selected && (
        <div className="fixed inset-0 z-40 flex justify-end bg-slate-900/30" onClick={() => setSelected(null)}>
          <aside
            role="dialog"
            aria-label="Employee details"
            className="h-full w-full max-w-md overflow-y-auto bg-white p-6 shadow-xl"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="mb-4 flex items-start justify-between gap-3">
              <div>
                <h2 className="text-xl font-bold">{detail?.employee.name || employees.find((e) => e.id === selected)?.name || "Employee"}</h2>
                <p className="text-sm text-slate-500">{detail ? `${detail.employee.roleLabel} · ${branchText(detail.employee)}` : ""}</p>
              </div>
              <button type="button" onClick={() => setSelected(null)} aria-label="Close" className="rounded-full p-1.5 text-slate-500 hover:bg-slate-100">
                <X className="h-5 w-5" />
              </button>
            </div>

            {detailError && <p className="rounded-lg bg-rose-50 p-3 text-sm text-rose-700">{detailError}</p>}
            {!detail && !detailError && <p className="text-sm text-slate-500">Loading…</p>}

            {detail && (
              <div className="text-sm">
                <dl className="grid grid-cols-[130px_1fr] gap-x-4 gap-y-1.5">
                  <dt className="text-slate-500">Email</dt><dd className="break-all">{detail.employee.email || "—"}</dd>
                  <dt className="text-slate-500">Phone</dt><dd>{detail.profile.phone || "—"}</dd>
                  <dt className="text-slate-500">Account</dt><dd className="capitalize">{detail.employee.account}</dd>
                  <dt className="text-slate-500">Working status</dt>
                  <dd>
                    {WORKING_LABEL[detail.working.state].text}
                    {detail.working.state === "working" && detail.working.clockIn ? ` · in ${detail.working.clockIn.slice(0, 5)}` : ""}
                    {detail.working.state === "finished" && detail.working.clockIn
                      ? ` · ${detail.working.clockIn.slice(0, 5)} → ${detail.working.clockOut?.slice(0, 5) ?? "…"}${detail.working.hours != null ? ` · ${detail.working.hours.toFixed(1)} h` : ""}`
                      : ""}
                    {detail.working.state === "leave" && detail.working.leave ? ` (${detail.working.leave})` : ""}
                    {detail.working.state === "unknown" && <span className="block text-xs text-slate-500">No clock-in or leave data for this person.</span>}
                  </dd>
                  {detail.workload && (
                    <>
                      <dt className="text-slate-500">Workload</dt>
                      <dd>{detail.workload.openLeads} open leads · {detail.workload.students} students</dd>
                    </>
                  )}
                </dl>

                <p className="mb-1 mt-5 font-semibold">Last 7 days</p>
                {detail.history.length === 0 ? (
                  <p className="text-slate-500">No clock-in records.</p>
                ) : (
                  <ul className="divide-y divide-slate-100 rounded-lg border border-slate-100">
                    {detail.history.map((row) => (
                      <li key={row.date} className="flex justify-between px-3 py-1.5">
                        <span>{row.date}</span>
                        <span className="text-slate-600">
                          {row.clock_in?.slice(0, 5) || "—"} → {row.clock_out?.slice(0, 5) || "…"}
                          {row.total_hours != null ? ` · ${row.total_hours.toFixed(1)} h` : ""}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}

                {profilePath(detail.employee) && (
                  <Link to={profilePath(detail.employee)!} className="mt-5 inline-block font-semibold text-sky-700 hover:underline">
                    Open full profile
                  </Link>
                )}
              </div>
            )}
          </aside>
        </div>
      )}
    </div>
  );
}
