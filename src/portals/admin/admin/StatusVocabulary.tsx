import { FormEvent, useEffect, useState } from "react";
import { ListChecks } from "lucide-react";
import { api } from "@admin/lib/api";
import { Button } from "@admin/components/ui/Button";
import { Card } from "@admin/components/ui/Card";
import { Input, Label, Select } from "@admin/components/ui/Field";
import { StatusChip } from "@shared/components/StatusBar";

/**
 * CRM 2.6.2 — the status words the Super Admin owns.
 *
 * Counsellors pick from these lists; they cannot type their own. That is what
 * makes the status bar mean the same thing in every branch, and what lets a
 * report count "submitted" without guessing at spelling.
 *
 * A status is never deleted, because historical records point at it. Retiring
 * one removes it from the pickers and leaves the history readable.
 */

const KINDS = [
  { key: "document", label: "Document statuses", hint: "Used on every checklist item." },
  { key: "application", label: "Application statuses", hint: "The student's progress with the university." },
  { key: "visa", label: "Visa statuses", hint: "The visa stage, shown to students and (optionally) agents." },
  { key: "next_step", label: "Next-step statuses", hint: "Who the ball is with right now." },
  { key: "commission_visibility", label: "Commission visibility", hint: "What an agent may see about their commission." },
];

const COLORS = ["slate", "sky", "indigo", "violet", "amber", "emerald", "rose"];
const AUDIENCES = ["staff", "student", "partner"];

type Status = {
  id: string;
  kind: string;
  code: string;
  label: string;
  color: string;
  stage_index: number;
  is_terminal: boolean;
  visible_to: string[];
  is_active: boolean;
};

export default function StatusVocabulary() {
  const [statuses, setStatuses] = useState<Status[]>([]);
  const [kind, setKind] = useState("document");
  const [form, setForm] = useState({ label: "", color: "sky", stage_index: "0", is_terminal: false, visible_to: ["staff", "student", "partner"] });
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const load = () =>
    api<{ statuses: Status[] }>("/config/statuses")
      .then((data) => setStatuses(data.statuses))
      .catch((err) => setError(err instanceof Error ? err.message : "Could not load statuses"));

  useEffect(() => { void load(); }, []);

  const add = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setBusy(true); setError("");
    try {
      await api("/config/statuses", {
        method: "POST",
        body: { ...form, kind, stage_index: Number(form.stage_index || 0) },
      });
      setForm({ label: "", color: "sky", stage_index: "0", is_terminal: false, visible_to: ["staff", "student", "partner"] });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not add the status");
    } finally {
      setBusy(false);
    }
  };

  const retire = async (row: Status) => {
    await api(`/config/statuses/${row.id}`, { method: "PATCH", body: { is_active: false } });
    await load();
  };

  const toggleAudience = (audience: string) => {
    setForm({
      ...form,
      visible_to: form.visible_to.includes(audience)
        ? form.visible_to.filter((item) => item !== audience)
        : [...form.visible_to, audience],
    });
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        <ListChecks className="h-5 w-5 text-sky-600" />
        <h1 className="text-xl font-semibold text-navy-900">Status words</h1>
      </div>
      <p className="max-w-3xl text-sm text-slate-600">
        These are the only statuses a counsellor can pick. Order sets the position on the status bar, and
        the visibility switches decide whether a student or an agent ever sees a given stage.
      </p>

      <Card className="p-5">
        <div className="mb-4 flex flex-wrap gap-2">
          {KINDS.map((entry) => (
            <button
              key={entry.key}
              onClick={() => setKind(entry.key)}
              className={`rounded-xl px-3 py-2 text-sm ${kind === entry.key ? "bg-navy-900 text-white" : "bg-slate-100 text-slate-700 hover:bg-slate-200"}`}
            >
              {entry.label}
            </button>
          ))}
        </div>
        <p className="mb-4 text-xs text-slate-500">{KINDS.find((entry) => entry.key === kind)?.hint}</p>

        <form onSubmit={add} className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
          <div className="lg:col-span-2">
            <Label>Label</Label>
            <Input value={form.label} onChange={(e) => setForm({ ...form, label: e.target.value })} placeholder="Offer received" required />
          </div>
          <div>
            <Label>Colour</Label>
            <Select value={form.color} onChange={(e) => setForm({ ...form, color: e.target.value })}>
              {COLORS.map((color) => <option key={color} value={color}>{color}</option>)}
            </Select>
          </div>
          <div>
            <Label>Position</Label>
            <Input type="number" min="0" value={form.stage_index} onChange={(e) => setForm({ ...form, stage_index: e.target.value })} />
          </div>
          <div className="flex items-end">
            <Button type="submit" disabled={busy}>Add</Button>
          </div>
          <div className="sm:col-span-2 lg:col-span-5 flex flex-wrap items-center gap-4 text-sm text-slate-700">
            <span className="text-xs font-medium uppercase tracking-wide text-slate-500">Visible to</span>
            {AUDIENCES.map((audience) => (
              <label key={audience} className="flex items-center gap-2">
                <input type="checkbox" checked={form.visible_to.includes(audience)} onChange={() => toggleAudience(audience)} />
                {audience}
              </label>
            ))}
            <label className="flex items-center gap-2">
              <input type="checkbox" checked={form.is_terminal} onChange={(e) => setForm({ ...form, is_terminal: e.target.checked })} />
              This is an end state
            </label>
          </div>
        </form>
        {error && <p className="mt-3 text-sm text-rose-600">{error}</p>}
      </Card>

      <Card className="p-5">
        <h2 className="mb-4 text-sm font-semibold text-navy-900">{KINDS.find((entry) => entry.key === kind)?.label}</h2>
        <div className="space-y-2">
          {statuses.filter((row) => row.kind === kind).map((row) => (
            <div key={row.id} className="flex flex-wrap items-center gap-3 rounded-xl border border-slate-100 p-3">
              <span className="w-8 text-xs text-slate-400">{row.stage_index}</span>
              <StatusChip label={row.label} color={row.color} />
              <code className="text-xs text-slate-400">{row.code}</code>
              <span className="text-xs text-slate-500">seen by {(row.visible_to || []).join(", ")}</span>
              {row.is_terminal && <span className="text-xs text-slate-500">end state</span>}
              <span className="flex-1" />
              <Button size="sm" variant="ghost" onClick={() => retire(row)}>Retire</Button>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}
