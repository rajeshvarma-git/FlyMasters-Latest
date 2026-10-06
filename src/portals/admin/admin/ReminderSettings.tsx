import { useEffect, useState } from "react";
import { BellRing, Play, Save } from "lucide-react";
import { api } from "@admin/lib/api";
import { Button } from "@admin/components/ui/Button";
import { Card } from "@admin/components/ui/Card";
import { Input, Label } from "@admin/components/ui/Field";

type Settings = {
  documents: { enabled: boolean; afterDays: number; repeatDays: number; maxReminders: number };
  intake: { enabled: boolean; firstHours: number; secondHours: number };
  lastRunAt: string | null;
  lastResult: {
    documents?: { reminders?: number; students?: number; skipped?: string; error?: string } | null;
    intake?: { nudged?: number; error?: string } | null;
  } | null;
};

/**
 * Automatic reminders that need no template set-up. They are posted in the student's one chat,
 * so they reach the web app and WhatsApp together (the approved follow-up template when the
 * 24-hour window is closed). Sent between 9am and 8pm India time only.
 */
export default function ReminderSettings() {
  const [s, setS] = useState<Settings | null>(null);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState("");
  const [error, setError] = useState("");

  const load = async () => setS(await api<Settings>("/comms/reminders"));
  useEffect(() => { void load().catch((e) => setError(String(e.message || e))); }, []);

  if (!s) return error ? <p className="text-sm text-red-600">{error}</p> : null;

  const num = (v: string) => (v === "" ? 0 : Number(v));
  const save = async () => {
    setBusy(true); setError(""); setNote("");
    try {
      setS(await api<Settings>("/comms/reminders", { method: "PUT", body: s }));
      setNote("Saved.");
    } catch (e) { setError(e instanceof Error ? e.message : "Could not save"); }
    finally { setBusy(false); }
  };
  const runNow = async () => {
    setBusy(true); setError(""); setNote("");
    try {
      const r = await api<NonNullable<Settings["lastResult"]>>("/comms/reminders/run", { method: "POST", body: {} });
      await load();
      setNote(`Ran now — document reminders: ${r.documents?.reminders ?? 0} student(s), intake nudges: ${r.intake?.nudged ?? 0}.`);
    } catch (e) { setError(e instanceof Error ? e.message : "Could not run"); }
    finally { setBusy(false); }
  };

  return (
    <Card className="p-5">
      <div className="mb-1 flex items-center gap-2">
        <BellRing className="h-4 w-4 text-sky-600" />
        <h2 className="text-sm font-semibold text-navy-900">Automatic reminders</h2>
      </div>
      <p className="mb-4 max-w-3xl text-xs text-slate-500">
        Sent in the student's chat (web app and WhatsApp together), 9am–8pm India time only. No template needed. Checked every hour.
      </p>

      <div className="grid gap-5 lg:grid-cols-2">
        <div className="space-y-3 rounded-lg border border-slate-200 p-4">
          <label className="flex items-center gap-2 text-sm font-medium text-navy-900">
            <input type="checkbox" checked={s.documents.enabled} onChange={(e) => setS({ ...s, documents: { ...s.documents, enabled: e.target.checked } })} />
            Remind about documents still missing
          </label>
          <div className="grid grid-cols-3 gap-3">
            <div><Label>First reminder after (days)</Label><Input type="number" min={1} max={30} value={s.documents.afterDays} onChange={(e) => setS({ ...s, documents: { ...s.documents, afterDays: num(e.target.value) } })} /></div>
            <div><Label>Then every (days)</Label><Input type="number" min={1} max={30} value={s.documents.repeatDays} onChange={(e) => setS({ ...s, documents: { ...s.documents, repeatDays: num(e.target.value) } })} /></div>
            <div><Label>At most (times)</Label><Input type="number" min={1} max={10} value={s.documents.maxReminders} onChange={(e) => setS({ ...s, documents: { ...s.documents, maxReminders: num(e.target.value) } })} /></div>
          </div>
          <p className="text-xs text-slate-500">Starts from the day a counselor requests a document. Stops as soon as the student uploads it.</p>
        </div>

        <div className="space-y-3 rounded-lg border border-slate-200 p-4">
          <label className="flex items-center gap-2 text-sm font-medium text-navy-900">
            <input type="checkbox" checked={s.intake.enabled} onChange={(e) => setS({ ...s, intake: { ...s.intake, enabled: e.target.checked } })} />
            Nudge students who stopped halfway through the questions
          </label>
          <div className="grid grid-cols-2 gap-3">
            <div><Label>First nudge after (hours)</Label><Input type="number" min={1} max={72} value={s.intake.firstHours} onChange={(e) => setS({ ...s, intake: { ...s.intake, firstHours: num(e.target.value) } })} /></div>
            <div><Label>Second nudge after (hours)</Label><Input type="number" min={2} max={240} value={s.intake.secondHours} onChange={(e) => setS({ ...s, intake: { ...s.intake, secondHours: num(e.target.value) } })} /></div>
          </div>
          <p className="text-xs text-slate-500">Repeats the question they were on. Only while the AI still owns the student. Never more than twice.</p>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <Button size="sm" onClick={save} disabled={busy}><Save className="h-4 w-4" /> Save</Button>
        <Button size="sm" variant="secondary" onClick={runNow} disabled={busy}><Play className="h-4 w-4" /> Run now</Button>
        <span className="text-xs text-slate-500">
          {s.lastRunAt ? `Last run ${new Date(s.lastRunAt).toLocaleString()}` : "Not run yet"}
          {s.lastResult?.documents?.reminders != null ? ` · ${s.lastResult.documents.reminders} document reminder(s)` : ""}
          {s.lastResult?.intake?.nudged != null ? ` · ${s.lastResult.intake.nudged} nudge(s)` : ""}
        </span>
        {note && <span className="text-xs text-emerald-700">{note}</span>}
        {error && <span className="text-xs text-red-600">{error}</span>}
      </div>
    </Card>
  );
}
