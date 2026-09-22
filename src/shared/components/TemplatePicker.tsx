import { useEffect, useState } from "react";
import { FileText, X } from "lucide-react";

/**
 * CRM 2.7 — the counsellor's and telecaller's side of the template rules.
 *
 * The list comes from /api/comms/templates/usable, which has already applied
 * every restriction the Super Admin set: role, branch, country, intake,
 * student stage and channel. Nothing is filtered in the browser, so there is
 * no way to reach a template by guessing a URL.
 *
 * Placeholders are filled from the student in front of the person, and any
 * that could not be filled are shown before the message is inserted rather
 * than being sent as a literal {{first_name}} to a real student.
 */

type Template = {
  id: string;
  name: string;
  category: string;
  channel: string;
  body: string;
  media_url: string;
};

function render(body: string, context: Record<string, string>) {
  return body.replace(/\{\{\s*([a-zA-Z0-9_.]+)\s*\}\}/g, (_match, key) => context[key] ?? `{{${key}}}`);
}

export default function TemplatePicker({
  fetchJson,
  channel,
  context = {},
  onPick,
}: {
  fetchJson: <T>(path: string, options?: { method?: string; body?: unknown }) => Promise<T>;
  channel?: string;
  context?: Record<string, string>;
  onPick: (text: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open) return;
    const params = new URLSearchParams();
    if (channel) params.set("channel", channel);
    if (context.country) params.set("country", context.country);
    if (context.stage) params.set("stage", context.stage);
    fetchJson<{ templates: Template[] }>(`/comms/templates/usable?${params}`)
      .then((data) => setTemplates(data.templates))
      .catch((err) => setError(err instanceof Error ? err.message : "Could not load templates"));
  }, [open, channel, context.country, context.stage, fetchJson]);

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-700 hover:bg-slate-50"
        title="Insert an approved message"
      >
        <FileText className="h-4 w-4" /> Templates
      </button>

      {open && (
        <div className="absolute bottom-full right-0 z-50 mb-2 w-[min(26rem,calc(100vw-2rem))] overflow-hidden rounded-xl border border-slate-200 bg-white shadow-lg">
          <div className="flex items-center justify-between border-b border-slate-100 px-3 py-2">
            <p className="text-sm font-semibold text-navy-900">Approved messages</p>
            <button onClick={() => setOpen(false)} className="text-slate-400 hover:text-slate-700"><X className="h-4 w-4" /></button>
          </div>

          <div className="max-h-80 overflow-y-auto">
            {error && <p className="p-3 text-sm text-rose-600">{error}</p>}
            {templates.map((template) => {
              const filled = render(template.body, context);
              const unresolved = filled.includes("{{");
              return (
                <button
                  key={template.id}
                  onClick={() => { onPick(filled); setOpen(false); }}
                  className="block w-full border-b border-slate-50 p-3 text-left hover:bg-slate-50"
                >
                  <p className="text-sm font-medium text-navy-900">{template.name}</p>
                  <p className="mt-0.5 text-xs text-slate-500">{template.category.replace("_", " ")} · {template.channel}</p>
                  <p className="mt-1 line-clamp-2 text-xs text-slate-600">{filled}</p>
                  {unresolved && (
                    <p className="mt-1 text-[11px] text-amber-700">Some details are missing — check before sending.</p>
                  )}
                </button>
              );
            })}
            {!templates.length && !error && (
              <p className="p-4 text-sm text-slate-500">
                No approved templates for this conversation yet. A Super Admin adds them under Message templates.
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
