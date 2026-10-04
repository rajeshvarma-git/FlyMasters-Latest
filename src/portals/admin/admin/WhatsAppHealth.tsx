import { useEffect, useState } from "react";
import { CheckCircle2, RefreshCw, XCircle } from "lucide-react";
import { api } from "@admin/lib/api";
import { Card } from "@admin/components/ui/Card";

/**
 * "Is WhatsApp working?" for admins: what is configured on the server, and
 * what the last incoming messages and outgoing replies actually did.
 * Server: GET /api/whatsapp/diagnostics (server/student/whatsapp.ts).
 */

type Diagnostics = {
  config: Record<string, boolean | string>;
  problems: string[];
  webhook_url: string;
  since: string;
  recent_webhooks: { at: string; result: string; messages: number; from?: string; detail?: string }[];
  recent_sends: { at: string; to: string; ok: boolean; error?: string }[];
};

const CONFIG_LABELS: [string, string][] = [
  ["access_token", "Access token"],
  ["phone_number_id", "Phone number ID"],
  ["verify_token", "Webhook verify token"],
  ["app_secret", "App secret (signature check)"],
];

const RESULT_TEXT: Record<string, string> = {
  answered: "Received and handled",
  skipped: "Received, not handled",
  received: "Received (processing)",
  status_update: "Delivery/read update",
  duplicate: "Duplicate (already had it)",
  rejected_signature: "Rejected — signature",
  error: "Error",
};

const when = (iso: string) => new Date(iso).toLocaleString(undefined, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", second: "2-digit" });

export default function WhatsAppHealth() {
  const [data, setData] = useState<Diagnostics | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const load = async () => {
    setLoading(true);
    setError("");
    try {
      setData(await api<Diagnostics>("/whatsapp/diagnostics"));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load WhatsApp status");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const ok = data && data.problems.length === 0;

  return (
    <Card className="mb-6 p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 font-semibold">
            {data ? (ok ? <CheckCircle2 className="h-5 w-5 text-emerald-600" /> : <XCircle className="h-5 w-5 text-red-600" />) : null}
            WhatsApp health
          </h2>
          <p className="text-xs text-slate-500">
            Send "hi" from a phone to the Fly Masters WhatsApp number, then press Refresh. Logs start from the last server restart{data ? ` (${when(data.since)})` : ""}.
          </p>
        </div>
        <button type="button" onClick={load} className="inline-flex items-center gap-1 rounded-lg border px-2.5 py-1.5 text-xs hover:bg-slate-50">
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} /> Refresh
        </button>
      </div>

      {error && <p className="mt-3 text-sm text-red-600">{error}</p>}

      {data && (
        <div className="mt-3 space-y-3 text-sm">
          <div className="flex flex-wrap gap-2">
            {CONFIG_LABELS.map(([key, label]) => (
              <span key={key} className={`rounded-full px-2 py-0.5 text-xs ${data.config[key] ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-700"}`}>
                {data.config[key] ? "✓" : "✗"} {label}
              </span>
            ))}
            <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-600">
              Callback URL: {window.location.origin}
              {data.webhook_url}
            </span>
          </div>

          {data.problems.length > 0 && (
            <ul className="list-disc space-y-1 rounded-lg bg-red-50 p-3 pl-6 text-xs text-red-800">
              {data.problems.map((p) => (
                <li key={p}>{p}</li>
              ))}
            </ul>
          )}

          <div className="grid gap-3 md:grid-cols-2">
            <div>
              <p className="mb-1 text-xs font-semibold uppercase text-slate-500">Incoming (last {data.recent_webhooks.length})</p>
              {data.recent_webhooks.length === 0 ? (
                <p className="text-xs text-slate-500">Nothing has arrived yet.</p>
              ) : (
                <ul className="max-h-56 divide-y overflow-y-auto rounded-lg border text-xs">
                  {data.recent_webhooks.map((w, i) => (
                    <li key={`${w.at}-${i}`} className="px-2 py-1.5">
                      <span className="text-slate-400">{when(w.at)}</span>{" "}
                      <span className={w.result === "answered" ? "text-emerald-700" : w.result.startsWith("rejected") || w.result === "error" ? "text-red-700" : "text-slate-700"}>
                        {RESULT_TEXT[w.result] || w.result}
                      </span>
                      {w.from ? <span className="text-slate-500"> · from {w.from}</span> : null}
                      {w.detail ? <p className="text-slate-500">{w.detail}</p> : null}
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <div>
              <p className="mb-1 text-xs font-semibold uppercase text-slate-500">Outgoing replies (last {data.recent_sends.length})</p>
              {data.recent_sends.length === 0 ? (
                <p className="text-xs text-slate-500">No reply has been sent yet.</p>
              ) : (
                <ul className="max-h-56 divide-y overflow-y-auto rounded-lg border text-xs">
                  {data.recent_sends.map((s, i) => (
                    <li key={`${s.at}-${i}`} className="px-2 py-1.5">
                      <span className="text-slate-400">{when(s.at)}</span> to {s.to}{" "}
                      <span className={s.ok ? "text-emerald-700" : "text-red-700"}>{s.ok ? "sent" : "failed"}</span>
                      {s.error ? <p className="text-red-700">{s.error}</p> : null}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </div>
      )}
    </Card>
  );
}
