import { useEffect, useState } from "react";
import { History, Lock } from "lucide-react";
import { api } from "@admin/lib/api";
import { Card } from "@admin/components/ui/Card";
import { Select } from "@admin/components/ui/Field";

/**
 * Developer-only configuration history.
 *
 * The client asked to be able to trace what changed, when, and what it looked
 * like before — but for the developer, not for every staff member. Access is
 * gated server-side by DEVELOPER_EMAILS; this screen simply does not render
 * for anyone else.
 */

type Change = {
  id: string;
  entity_type: string;
  entity_id: string;
  entity_label: string;
  action: string;
  version_from: number | null;
  version_to: number | null;
  diff: Record<string, { from: unknown; to: unknown }>;
  actor_name: string | null;
  actor_role: string | null;
  created_at: string;
};

const LABELS: Record<string, string> = {
  document_master: "Document master",
  document_reason: "Rejection reasons",
  status_vocabulary: "Status words",
  checklist_template: "Country checklist",
  message_template: "Message template",
  communication_rule: "Automation rule",
  auto_response: "Out-of-office reply",
  alert_setting: "Alert rule",
  partner_visibility: "Agent visibility",
};

const show = (value: unknown) => {
  if (value === null || value === undefined) return "—";
  if (Array.isArray(value)) return value.join(", ") || "—";
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
};

export default function ChangeHistory() {
  const [changes, setChanges] = useState<Change[]>([]);
  const [summary, setSummary] = useState<{ entity_type: string; changes: string; first_change: string; last_change: string }[]>([]);
  const [filter, setFilter] = useState("");
  const [denied, setDenied] = useState(false);

  useEffect(() => {
    api<{ changes: Change[] }>(`/config/changes${filter ? `?entity_type=${filter}` : ""}`)
      .then((data) => setChanges(data.changes))
      .catch(() => setDenied(true));
    api<{ summary: typeof summary }>("/config/changes/summary")
      .then((data) => setSummary(data.summary))
      .catch(() => undefined);
  }, [filter]);

  if (denied) {
    return (
      <Card className="p-8 text-center">
        <Lock className="mx-auto h-6 w-6 text-slate-400" />
        <p className="mt-3 text-sm text-slate-600">The configuration history is restricted to the platform developer.</p>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        <History className="h-5 w-5 text-sky-600" />
        <h1 className="text-xl font-semibold text-navy-900">Configuration history</h1>
      </div>
      <p className="max-w-3xl text-sm text-slate-600">
        Every change to a checklist, template, status word, automation rule or alert — what it was, what it
        became, who changed it, and when. Nothing in this platform is deleted; this is the trail that makes
        that useful.
      </p>

      <div className="flex flex-wrap gap-3">
        {summary.map((row) => (
          <Card key={row.entity_type} className="px-4 py-3">
            <p className="text-xs uppercase tracking-wide text-slate-500">{LABELS[row.entity_type] || row.entity_type}</p>
            <p className="text-lg font-semibold text-navy-900">{row.changes}</p>
            <p className="text-xs text-slate-400">since {new Date(row.first_change).toLocaleDateString()}</p>
          </Card>
        ))}
      </div>

      <Select className="w-64" value={filter} onChange={(e) => setFilter(e.target.value)}>
        <option value="">Everything</option>
        {Object.entries(LABELS).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
      </Select>

      <div className="space-y-3">
        {changes.map((change) => (
          <Card key={change.id} className="p-5">
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-700">
                {LABELS[change.entity_type] || change.entity_type}
              </span>
              <span className="text-sm font-medium text-navy-900">{change.entity_label || change.entity_id}</span>
              <span className="text-xs text-slate-500">{change.action}</span>
              {change.version_from !== null && change.version_to !== null && (
                <span className="rounded-full bg-sky-100 px-2 py-0.5 text-xs text-sky-800">
                  v{change.version_from} → v{change.version_to}
                </span>
              )}
              <span className="flex-1" />
              <span className="text-xs text-slate-500">
                {change.actor_name || "system"} · {new Date(change.created_at).toLocaleString()}
              </span>
            </div>

            {Object.keys(change.diff || {}).length > 0 && (
              <div className="mt-3 space-y-1.5">
                {Object.entries(change.diff).map(([field, values]) => (
                  <div key={field} className="grid gap-1 text-xs sm:grid-cols-[160px_1fr]">
                    <span className="font-medium text-slate-600">{field}</span>
                    <span className="text-slate-700">
                      <span className="rounded bg-rose-50 px-1.5 py-0.5 text-rose-700 line-through">{show(values.from)}</span>
                      <span className="mx-2 text-slate-400">→</span>
                      <span className="rounded bg-emerald-50 px-1.5 py-0.5 text-emerald-800">{show(values.to)}</span>
                    </span>
                  </div>
                ))}
              </div>
            )}
          </Card>
        ))}
        {!changes.length && <p className="text-sm text-slate-500">No changes recorded yet.</p>}
      </div>
    </div>
  );
}
