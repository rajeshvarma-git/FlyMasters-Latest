import { FormEvent, useCallback, useEffect, useState } from "react";
import { Bell } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@telecaller/context/AuthContext";
import { api } from "@telecaller/lib/api";
import { markNotificationsReadLocal, useStore } from "@telecaller/lib/store";
import { Badge } from "@telecaller/components/ui/Badge";
import { Button } from "@telecaller/components/ui/Button";
import { Card } from "@telecaller/components/ui/Card";
import { Input, Label, Select, Textarea } from "@telecaller/components/ui/Field";

/**
 * Telecaller self-service: profile, attendance (clock in/out), leave, salary and
 * notifications. Mirrors the counselor portal so every employee has the same basics.
 * Times come from the server, so a device clock cannot change a shift.
 */

type Attendance = { id: string; date: string; clock_in: string | null; clock_out: string | null; total_hours: number | null };
type Leave = { id: string; leave_type: string; start_date: string; end_date: string; reason: string; total_days: number; status: string };
type Salary = { id: string; month: string; year: number; net_salary: number; notes?: string };
type Hr = { today: string; attendance: Attendance[]; leave: Leave[]; salary: Salary[] };

/** HR data refreshes itself every 30s and when the tab regains focus, so there is no Refresh button. */
function useHr() {
  const [hr, setHr] = useState<Hr | null>(null);
  const [error, setError] = useState("");
  const load = useCallback(() => {
    api<Hr>("/telecaller/me/hr").then((d) => { setHr(d); setError(""); }).catch((e) => setError(e instanceof Error ? e.message : "Could not load"));
  }, []);
  useEffect(() => {
    load();
    const timer = setInterval(load, 30000);
    window.addEventListener("focus", load);
    return () => { clearInterval(timer); window.removeEventListener("focus", load); };
  }, [load]);
  return { hr, error, load };
}

const dayLabel = (value: string) => {
  const d = new Date(`${value}T00:00:00`);
  return Number.isNaN(d.getTime()) ? value : d.toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short", year: "numeric" });
};

export function TelecallerProfile() {
  const { user } = useAuth();
  return (
    <div>
      <h1 className="text-2xl font-bold">My profile</h1>
      <Card className="mt-4 p-5">
        <dl className="grid grid-cols-[120px_1fr] gap-x-4 gap-y-2 text-sm">
          <dt className="text-slate-500">Name</dt>
          <dd className="font-medium">{[user?.firstName, user?.lastName].filter(Boolean).join(" ") || "—"}</dd>
          <dt className="text-slate-500">Email</dt>
          <dd className="font-medium">{user?.email || "—"}</dd>
          <dt className="text-slate-500">Phone</dt>
          <dd className="font-medium">{user?.phone || "—"}</dd>
          <dt className="text-slate-500">Role</dt>
          <dd className="font-medium">Telecaller</dd>
        </dl>
        <p className="mt-4 text-xs text-slate-500">To change your details or password, ask an admin.</p>
      </Card>
    </div>
  );
}

export function TelecallerAttendance() {
  const { hr, error, load } = useHr();
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState("");
  const todayRow = hr?.attendance.find((r) => r.date === hr.today);

  const act = async (path: string) => {
    setBusy(true); setActionError("");
    try { await api(path, { method: "POST", body: {} }); load(); }
    catch (e) { setActionError(e instanceof Error ? e.message : "Something went wrong"); }
    finally { setBusy(false); }
  };

  return (
    <div>
      <h1 className="text-2xl font-bold">Attendance</h1>
      <p className="text-slate-600">Clock in once per day, then clock out when your shift ends.</p>
      {(error || actionError) && <p className="mt-2 text-sm text-rose-600">{actionError || error}</p>}
      <Card className="mt-4 flex flex-wrap items-center justify-between gap-3 p-5">
        <div>
          <p className="font-semibold">Today{hr ? ` · ${dayLabel(hr.today)}` : ""}</p>
          <p className="text-sm text-slate-500">
            {todayRow?.clock_in
              ? `In ${todayRow.clock_in.slice(0, 5)}${todayRow.clock_out ? ` · out ${todayRow.clock_out.slice(0, 5)}` : " · still on shift"}`
              : "Not clocked in yet"}
            {todayRow?.total_hours != null ? ` · ${Number(todayRow.total_hours).toFixed(2)} hrs` : ""}
          </p>
        </div>
        <div className="flex gap-2">
          {!todayRow?.clock_in && <Button disabled={busy || !hr} onClick={() => act("/telecaller/me/clock-in")}>Clock in</Button>}
          {todayRow?.clock_in && !todayRow.clock_out && (
            <Button variant="danger" disabled={busy} onClick={() => act("/telecaller/me/clock-out")}>Clock out</Button>
          )}
          {todayRow?.clock_out && <Badge value="present" />}
        </div>
      </Card>
      <div className="mt-4 space-y-2">
        {(hr?.attendance || []).map((row) => (
          <Card key={row.id} className="flex flex-wrap items-center justify-between gap-2 p-4 text-sm">
            <span>{dayLabel(row.date)} · in {row.clock_in?.slice(0, 5) || "—"} · out {row.clock_out?.slice(0, 5) || "—"}</span>
            <span className="text-slate-500">{row.total_hours != null ? `${Number(row.total_hours).toFixed(2)} hrs` : row.clock_out ? "" : "Open"}</span>
          </Card>
        ))}
        {hr && hr.attendance.length === 0 && <p className="text-slate-500">No attendance records yet.</p>}
      </div>
    </div>
  );
}

export function TelecallerLeave() {
  const { hr, error, load } = useHr();
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState("");

  const submit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = e.currentTarget;
    const data = new FormData(form);
    setBusy(true); setFormError("");
    try {
      await api("/telecaller/me/leave", {
        method: "POST",
        body: {
          leave_type: data.get("leave_type"),
          start_date: data.get("start_date"),
          end_date: data.get("end_date") || data.get("start_date"),
          reason: data.get("reason"),
        },
      });
      form.reset();
      load();
    } catch (err) { setFormError(err instanceof Error ? err.message : "Could not submit"); }
    finally { setBusy(false); }
  };

  return (
    <div>
      <h1 className="text-2xl font-bold">Leave</h1>
      {error && <p className="mt-2 text-sm text-rose-600">{error}</p>}
      <Card className="mt-4 p-5">
        <form onSubmit={submit} className="grid gap-3 sm:grid-cols-2">
          <div>
            <Label>Type</Label>
            <Select name="leave_type" defaultValue="casual">
              <option value="casual">Casual</option>
              <option value="sick">Sick</option>
              <option value="earned">Earned</option>
              <option value="unpaid">Unpaid</option>
            </Select>
          </div>
          <div />
          <div><Label>From</Label><Input name="start_date" type="date" required /></div>
          <div><Label>To</Label><Input name="end_date" type="date" required /></div>
          <div className="sm:col-span-2"><Label>Reason</Label><Textarea name="reason" rows={2} required /></div>
          {formError && <p className="text-sm text-rose-600 sm:col-span-2">{formError}</p>}
          <div className="sm:col-span-2"><Button type="submit" disabled={busy}>{busy ? "Sending…" : "Request leave"}</Button></div>
        </form>
      </Card>
      <div className="mt-4 space-y-2">
        {(hr?.leave || []).map((row) => (
          <Card key={row.id} className="flex flex-wrap items-center justify-between gap-2 p-4 text-sm">
            <span className="capitalize">{row.leave_type} · {dayLabel(row.start_date)} → {dayLabel(row.end_date)} · {row.total_days} day{row.total_days === 1 ? "" : "s"}</span>
            <Badge value={row.status} />
          </Card>
        ))}
        {hr && hr.leave.length === 0 && <p className="text-slate-500">No leave requests yet.</p>}
      </div>
    </div>
  );
}

export function TelecallerSalary() {
  const { hr, error } = useHr();
  const rows = hr?.salary || [];
  return (
    <div>
      <h1 className="text-2xl font-bold">Salary</h1>
      {error && <p className="mt-2 text-sm text-rose-600">{error}</p>}
      <div className="mt-4 space-y-2">
        {rows.map((row) => (
          <Card key={row.id} className="flex flex-wrap items-center justify-between gap-2 p-4">
            <div>
              <p className="font-semibold">{row.month} {row.year}</p>
              {row.notes ? <p className="text-sm text-slate-500">{row.notes}</p> : null}
            </div>
            <span className="text-lg font-semibold">₹{Number(row.net_salary).toLocaleString("en-IN")}</span>
          </Card>
        ))}
        {hr && rows.length === 0 && <p className="text-slate-500">No salary records yet.</p>}
      </div>
    </div>
  );
}

export function TelecallerNotifications() {
  const store = useStore();
  const navigate = useNavigate();
  const rows = [...store.notifications].sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)));
  const unread = rows.filter((r) => !r.is_read).length;

  const markAll = () => {
    markNotificationsReadLocal("all");
    api("/telecaller/notifications/read", { method: "POST", body: {} }).catch(() => {});
  };

  return (
    <div>
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Notifications</h1>
        {unread > 0 && <Button variant="secondary" size="sm" onClick={markAll}>Mark all read</Button>}
      </div>
      <div className="mt-4 space-y-2">
        {rows.map((row) => (
          <Card
            key={row.id}
            className={`flex cursor-pointer gap-3 p-4 ${row.is_read ? "" : "border-sky-200 bg-sky-50/40"}`}
          >
            <Bell className="mt-0.5 h-4 w-4 shrink-0 text-sky-600" />
            <button className="min-w-0 flex-1 text-left" onClick={() => row.action_url && navigate(row.action_url)}>
              <p className="text-sm font-semibold">{row.title}</p>
              <p className="text-sm text-slate-600">{row.message}</p>
              <p className="mt-1 text-xs text-slate-400">{new Date(row.created_at).toLocaleString("en-IN")}</p>
            </button>
          </Card>
        ))}
        {rows.length === 0 && <p className="text-slate-500">You're all caught up.</p>}
      </div>
    </div>
  );
}
