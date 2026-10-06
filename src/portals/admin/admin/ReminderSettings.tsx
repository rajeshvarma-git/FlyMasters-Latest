import { useEffect, useState } from "react";
import { BellRing, Play, Save } from "lucide-react";
import { api } from "@admin/lib/api";
import { Button } from "@admin/components/ui/Button";
import { Card } from "@admin/components/ui/Card";
import { Input, Label } from "@admin/components/ui/Field";

type Settings = {
  documents: { enabled: boolean; afterDays: number; repeatDays: number; maxReminders: number };
  intake: { enabled: boolean; firstHours: number; secondHours: number };
  whatsapp: { monthlyBudgetInr: number; costPerTemplateInr: number; maxPerHour: number; holdHours: number; sendFrom: number; sendUntil: number };
  usage?: { month: number; hour: number; spentInr: number };
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
        Sent in the student's chat (web app and WhatsApp together) during the sending hours below (India time). Checked every hour.
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

      <div className="mt-5 space-y-3 rounded-lg border border-slate-200 p-4">
        <div className="text-sm font-medium text-navy-900">WhatsApp spend, rate and timing</div>
        <p className="text-xs text-slate-500">
          Free text only works within 24 hours of the student's last message; after that a paid template goes out
          (Marketing about ₹0.86, Utility about ₹0.15 — set the rate that matches your template).
          Over a limit, messages wait in the chat and are sent free when the student replies.
        </p>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-6">
          <div><Label>Monthly budget ₹ (0 = none)</Label><Input type="number" min={0} value={s.whatsapp.monthlyBudgetInr} onChange={(e) => setS({ ...s, whatsapp: { ...s.whatsapp, monthlyBudgetInr: num(e.target.value) } })} /></div>
          <div><Label>Cost per template ₹</Label><Input type="number" min={0.01} step="0.01" value={s.whatsapp.costPerTemplateInr} onChange={(e) => setS({ ...s, whatsapp: { ...s.whatsapp, costPerTemplateInr: num(e.target.value) } })} /></div>
          <div><Label>Max templates per hour</Label><Input type="number" min={1} value={s.whatsapp.maxPerHour} onChange={(e) => setS({ ...s, whatsapp: { ...s.whatsapp, maxPerHour: num(e.target.value) } })} /></div>
          <div><Label>One template per silence (hours)</Label><Input type="number" min={1} max={720} value={s.whatsapp.holdHours} onChange={(e) => setS({ ...s, whatsapp: { ...s.whatsapp, holdHours: num(e.target.value) } })} /></div>
          <div><Label>Reminders from (hour, IST)</Label><Input type="number" min={0} max={23} value={s.whatsapp.sendFrom} onChange={(e) => setS({ ...s, whatsapp: { ...s.whatsapp, sendFrom: num(e.target.value) } })} /></div>
          <div><Label>Reminders until (hour, IST)</Label><Input type="number" min={1} max={24} value={s.whatsapp.sendUntil} onChange={(e) => setS({ ...s, whatsapp: { ...s.whatsapp, sendUntil: num(e.target.value) } })} /></div>
        </div>
        {s.usage && (
          <p className="text-xs text-slate-600">
            This month: <strong>{s.usage.month}</strong> template message{s.usage.month === 1 ? "" : "s"} ≈ <strong>₹{s.usage.spentInr.toFixed(2)}</strong>
            {s.whatsapp.monthlyBudgetInr > 0 ? ` of ₹${s.whatsapp.monthlyBudgetInr}` : ""} · last hour: {s.usage.hour}
          </p>
        )}
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
