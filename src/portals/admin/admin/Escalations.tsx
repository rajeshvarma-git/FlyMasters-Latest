import { useEffect, useState } from "react";
import { Flag } from "lucide-react";
import { api } from "@admin/lib/api";
import { Button } from "@admin/components/ui/Button";
import { Card } from "@admin/components/ui/Card";
import { Input, Select } from "@admin/components/ui/Field";

/**
 * CRM 2.7 — "Receive and review chat escalation reports submitted by Students
 * from Student–Counsellor conversations."
 */

type Escalation = {
  id: string;
  student_id: string;
  counselor_id: string | null;
  conversation_type: string;
  conversation_id: string;
  reported_message: string;
  reason: string;
  category: string;
  status: string;
  handled_by: string | null;
  resolution_note: string;
  created_at: string;
  resolved_at: string | null;
};

const tone: Record<string, string> = {
  open: "bg-rose-100 text-rose-700",
  reviewing: "bg-amber-100 text-amber-900",
  resolved: "bg-emerald-100 text-emerald-800",
  dismissed: "bg-slate-100 text-slate-600",
};

export default function Escalations() {
  const [rows, setRows] = useState<Escalation[]>([]);
  const [status, setStatus] = useState("open");
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [error, setError] = useState("");

  const load = () =>
    api<{ escalations: Escalation[] }>(`/comms/escalations${status ? `?status=${status}` : ""}`)
      .then((data) => setRows(data.escalations))
      .catch((err) => setError(err instanceof Error ? err.message : "Could not load escalations"));

  useEffect(() => { void load(); }, [status]);

  const update = async (row: Escalation, nextStatus: string) => {
    await api(`/comms/escalations/${row.id}`, {
      method: "PATCH",
      body: { status: nextStatus, resolution_note: notes[row.id] || row.resolution_note },
    });
    await load();
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        <Flag className="h-5 w-5 text-sky-600" />
        <h1 className="text-xl font-semibold text-navy-900">Reported conversations</h1>
      </div>
      <p className="max-w-3xl text-sm text-slate-600">
        What students have flagged, and what was done about it. Every change here is recorded against the
        person who made it.
      </p>

      <Select className="w-52" value={status} onChange={(e) => setStatus(e.target.value)}>
        <option value="">Everything</option>
        {["open", "reviewing", "resolved", "dismissed"].map((value) => <option key={value} value={value}>{value}</option>)}
      </Select>

      {error && <p className="text-sm text-rose-600">{error}</p>}

      <div className="space-y-3">
        {rows.map((row) => (
          <Card key={row.id} className="p-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="max-w-2xl">
                <div className="flex items-center gap-2">
                  <span className={`rounded-full px-2 py-0.5 text-xs ${tone[row.status]}`}>{row.status}</span>
                  <span className="text-xs text-slate-500">{new Date(row.created_at).toLocaleString()}</span>
                </div>
                <p className="mt-2 text-sm text-navy-900">{row.reason}</p>
                {row.reported_message && (
                  <p className="mt-2 rounded-xl bg-slate-50 p-3 text-sm text-slate-700">“{row.reported_message}”</p>
                )}
                <p className="mt-2 text-xs text-slate-500">
                  Student {row.student_id}{row.counselor_id ? ` · counsellor ${row.counselor_id}` : ""} · {row.conversation_type}
                </p>
                {row.resolution_note && <p className="mt-2 text-xs text-slate-600">Outcome: {row.resolution_note}</p>}
              </div>
              <div className="flex w-full max-w-sm flex-col gap-2">
                <Input
                  value={notes[row.id] ?? row.resolution_note}
                  onChange={(e) => setNotes({ ...notes, [row.id]: e.target.value })}
                  placeholder="What did you do about it?"
                />
                <div className="flex gap-2">
                  <Button size="sm" variant="secondary" onClick={() => update(row, "reviewing")}>Reviewing</Button>
                  <Button size="sm" onClick={() => update(row, "resolved")}>Resolved</Button>
                  <Button size="sm" variant="ghost" onClick={() => update(row, "dismissed")}>Dismiss</Button>
                </div>
              </div>
            </div>
          </Card>
        ))}
        {!rows.length && <p className="text-sm text-slate-500">Nothing reported.</p>}
      </div>
    </div>
  );
}
