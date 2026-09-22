import { useEffect, useState } from "react";
import { ScrollText } from "lucide-react";
import { api } from "@admin/lib/api";
import { Card } from "@admin/components/ui/Card";
import { Select } from "@admin/components/ui/Field";

/**
 * CRM 2.7 — "Review communication delivery status, failure logs, opt-out
 * records, consent, sender configuration, template usage, and communication
 * history."
 *
 * The distinction this screen exists to make: `skipped` is not `failed`. A
 * message the platform deliberately did not send — because the student opted
 * out, or it was quiet hours — reads differently from one that tried and broke.
 */

type Entry = {
  id: string;
  channel: string;
  recipient_type: string;
  recipient_id: string;
  recipient_addr: string;
  student_id: string | null;
  status: string;
  skip_reason: string;
  error: string;
  body_preview: string;
  sent_by: string | null;
  created_at: string;
};

const tone: Record<string, string> = {
  sent: "bg-emerald-100 text-emerald-800",
  delivered: "bg-emerald-100 text-emerald-800",
  read: "bg-emerald-100 text-emerald-800",
  queued: "bg-sky-100 text-sky-800",
  skipped: "bg-slate-100 text-slate-600",
  failed: "bg-rose-100 text-rose-700",
};

const REASONS: Record<string, string> = {
  opted_out: "the student asked not to be contacted on this channel",
  quiet_hours: "it was quiet hours for this rule",
  daily_cap: "the rule hit its daily cap",
  template_not_active: "the template is not live",
  meta_template_missing: "the WhatsApp template is not approved by Meta",
  no_recipient: "nobody to send it to",
  rule_paused: "the rule was switched off before it sent",
  email_not_configured: "no email provider is connected",
  sms_not_configured: "no SMS provider is connected",
};

export default function CommsLog() {
  const [log, setLog] = useState<Entry[]>([]);
  const [summary, setSummary] = useState<{ status: string; count: string }[]>([]);
  const [status, setStatus] = useState("");
  const [channel, setChannel] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    const params = new URLSearchParams();
    if (status) params.set("status", status);
    if (channel) params.set("channel", channel);
    api<{ log: Entry[]; last_7_days: { status: string; count: string }[] }>(`/comms/log?${params}`)
      .then((data) => { setLog(data.log); setSummary(data.last_7_days); })
      .catch((err) => setError(err instanceof Error ? err.message : "Could not load the log"));
  }, [status, channel]);

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        <ScrollText className="h-5 w-5 text-sky-600" />
        <h1 className="text-xl font-semibold text-navy-900">Communication log</h1>
      </div>

      <div className="flex flex-wrap gap-3">
        {summary.map((row) => (
          <Card key={row.status} className="px-4 py-3">
            <p className="text-xs uppercase tracking-wide text-slate-500">{row.status}</p>
            <p className="text-lg font-semibold text-navy-900">{row.count}</p>
            <p className="text-xs text-slate-400">last 7 days</p>
          </Card>
        ))}
      </div>

      <Card className="p-5">
        <div className="mb-4 flex flex-wrap gap-3">
          <Select className="w-44" value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="">Every status</option>
            {["sent", "queued", "skipped", "failed"].map((value) => <option key={value} value={value}>{value}</option>)}
          </Select>
          <Select className="w-44" value={channel} onChange={(e) => setChannel(e.target.value)}>
            <option value="">Every channel</option>
            {["whatsapp", "email", "sms", "portal", "chat"].map((value) => <option key={value} value={value}>{value}</option>)}
          </Select>
        </div>

        {error && <p className="mb-3 text-sm text-rose-600">{error}</p>}

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100 text-left text-xs uppercase tracking-wide text-slate-500">
                <th className="py-2 pr-4">When</th>
                <th className="py-2 pr-4">Channel</th>
                <th className="py-2 pr-4">To</th>
                <th className="py-2 pr-4">Message</th>
                <th className="py-2 pr-4">Outcome</th>
              </tr>
            </thead>
            <tbody>
              {log.map((entry) => (
                <tr key={entry.id} className="border-b border-slate-50 align-top">
                  <td className="py-3 pr-4 text-xs text-slate-500">{new Date(entry.created_at).toLocaleString()}</td>
                  <td className="py-3 pr-4 text-slate-600">{entry.channel}</td>
                  <td className="py-3 pr-4 text-slate-600">{entry.recipient_addr || entry.recipient_id}</td>
                  <td className="max-w-md py-3 pr-4 text-slate-700">{entry.body_preview}</td>
                  <td className="py-3 pr-4">
                    <span className={`rounded-full px-2 py-0.5 text-xs ${tone[entry.status] || tone.skipped}`}>{entry.status}</span>
                    {entry.skip_reason && (
                      <p className="mt-1 text-xs text-slate-500">Not sent because {REASONS[entry.skip_reason] || entry.skip_reason}.</p>
                    )}
                    {entry.error && <p className="mt-1 text-xs text-rose-600">{entry.error}</p>}
                  </td>
                </tr>
              ))}
              {!log.length && <tr><td colSpan={5} className="py-8 text-center text-sm text-slate-500">Nothing sent yet.</td></tr>}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
