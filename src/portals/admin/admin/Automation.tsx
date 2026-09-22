import { FormEvent, useEffect, useState } from "react";
import { Workflow, Power, PowerOff, OctagonX, FlaskConical } from "lucide-react";
import { api } from "@admin/lib/api";
import { Button } from "@admin/components/ui/Button";
import { Card } from "@admin/components/ui/Card";
import { Input, Label, Select } from "@admin/components/ui/Field";

/**
 * CRM 2.7 — event-driven automation.
 *
 * Two safeguards are deliberate and visible on this screen, because automation
 * is the part of a CRM that can embarrass a business fastest:
 *   - a new rule is created switched OFF, so somebody has to look at it,
 *   - every rule has a daily cap and there is one button that stops all of them.
 */

type Rule = {
  id: string;
  name: string;
  event: string;
  template_id: string | null;
  template_name: string | null;
  channel: string;
  recipient: string;
  delay_minutes: number;
  is_active: boolean;
  max_per_day: number;
  sent_today: number;
  paused_reason: string;
  quiet_start: string | null;
  quiet_end: string | null;
  sent_24h: string;
};

type Template = { id: string; name: string; channel: string; status: string; family_id: string };

const RECIPIENTS = ["student", "counselor", "telecaller", "branch_head", "partner", "accountant"];

const EVENT_LABELS: Record<string, string> = {
  lead_created: "A lead is created",
  lead_assigned: "A lead is assigned",
  lead_transferred: "A lead is transferred",
  student_converted: "A lead becomes a student",
  document_requested: "A document is requested",
  document_rejected: "A document is sent back",
  document_accepted: "A document is accepted",
  application_status_changed: "An application status changes",
  visa_status_changed: "A visa status changes",
  followup_due: "A follow-up falls due",
  followup_missed: "A follow-up is missed",
  deadline_approaching: "A deadline is approaching",
  inactivity: "A student goes quiet",
  fee_due: "A fee is due",
  commission_approved: "A commission is approved",
};

export default function Automation() {
  const [rules, setRules] = useState<Rule[]>([]);
  const [events, setEvents] = useState<string[]>([]);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [form, setForm] = useState({ name: "", event: "", template_id: "", channel: "whatsapp", recipient: "student", delay_minutes: "0", max_per_day: "200" });
  const [testAddress, setTestAddress] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);

  const load = async () => {
    const [ruleData, eventData, templateData] = await Promise.all([
      api<{ rules: Rule[] }>("/comms/rules"),
      api<{ events: string[] }>("/comms/events"),
      api<{ templates: Template[] }>("/comms/templates"),
    ]);
    setRules(ruleData.rules);
    setEvents(eventData.events);
    setTemplates(templateData.templates.filter((row) => row.status === "active"));
  };

  useEffect(() => { void load().catch((e) => setError(String(e.message || e))); }, []);

  const create = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setBusy(true); setError("");
    try {
      await api("/comms/rules", {
        method: "POST",
        body: { ...form, delay_minutes: Number(form.delay_minutes || 0), max_per_day: Number(form.max_per_day || 200) },
      });
      setForm({ name: "", event: "", template_id: "", channel: "whatsapp", recipient: "student", delay_minutes: "0", max_per_day: "200" });
      await load();
      setNotice("Rule created — and left switched off. Test it, then turn it on.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create the rule");
    } finally { setBusy(false); }
  };

  const toggle = async (rule: Rule) => {
    await api(`/comms/rules/${rule.id}`, { method: "PATCH", body: { is_active: !rule.is_active } });
    await load();
  };

  const test = async (rule: Rule) => {
    if (!testAddress) { setError("Enter a test number or email first."); return; }
    setError(""); setNotice("");
    try {
      const result = await api<{ status: string; reason: string }>(
        `/comms/rules/${rule.id}/test`, { method: "POST", body: { address: testAddress, context: { first_name: "Test" } } });
      setNotice(`Test ${result.status}${result.reason ? ` — ${result.reason}` : ""}.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Test failed");
    }
  };

  const stopAll = async () => {
    const result = await api<{ stopped: number }>("/comms/rules/stop-all", { method: "POST", body: { reason: "Stopped from the automation screen" } });
    await load();
    setNotice(`${result.stopped} rule${result.stopped === 1 ? "" : "s"} stopped. Nothing automatic will send until you turn them back on.`);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Workflow className="h-5 w-5 text-sky-600" />
          <h1 className="text-xl font-semibold text-navy-900">Automation</h1>
        </div>
        <Button variant="danger" size="sm" onClick={stopAll}>
          <OctagonX className="h-4 w-4" /> Stop everything
        </Button>
      </div>
      <p className="max-w-3xl text-sm text-slate-600">
        When something happens, send an approved template. Every rule is capped per day, and a rule that
        fails to deliver switches itself off rather than retrying into a wall.
      </p>

      <Card className="p-5">
        <h2 className="mb-4 text-sm font-semibold text-navy-900">New rule</h2>
        <form onSubmit={create} className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div className="lg:col-span-2">
            <Label>Name</Label>
            <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Nudge when a document is sent back" required />
          </div>
          <div>
            <Label>When this happens</Label>
            <Select value={form.event} onChange={(e) => setForm({ ...form, event: e.target.value })} required>
              <option value="">Choose an event…</option>
              {events.map((event) => <option key={event} value={event}>{EVENT_LABELS[event] || event}</option>)}
            </Select>
          </div>
          <div>
            <Label>Send this template</Label>
            <Select value={form.template_id} onChange={(e) => setForm({ ...form, template_id: e.target.value })}>
              <option value="">Choose a live template…</option>
              {templates.map((template) => <option key={template.id} value={template.id}>{template.name} ({template.channel})</option>)}
            </Select>
          </div>
          <div>
            <Label>To</Label>
            <Select value={form.recipient} onChange={(e) => setForm({ ...form, recipient: e.target.value })}>
              {RECIPIENTS.map((recipient) => <option key={recipient} value={recipient}>{recipient}</option>)}
            </Select>
          </div>
          <div>
            <Label>Wait (minutes)</Label>
            <Input type="number" min="0" value={form.delay_minutes} onChange={(e) => setForm({ ...form, delay_minutes: e.target.value })} />
          </div>
          <div>
            <Label>Daily cap</Label>
            <Input type="number" min="1" value={form.max_per_day} onChange={(e) => setForm({ ...form, max_per_day: e.target.value })} />
          </div>
          <div className="flex items-end"><Button type="submit" disabled={busy}>Create (off)</Button></div>
        </form>
      </Card>

      {error && <p className="text-sm text-rose-600">{error}</p>}
      {notice && <p className="text-sm text-emerald-700">{notice}</p>}

      <Card className="p-5">
        <div className="mb-4 flex flex-wrap items-center gap-3">
          <h2 className="text-sm font-semibold text-navy-900">{rules.length} rule{rules.length === 1 ? "" : "s"}</h2>
          <span className="flex-1" />
          <Input className="w-64" value={testAddress} onChange={(e) => setTestAddress(e.target.value)} placeholder="Test number or email" />
        </div>
        <div className="space-y-3">
          {rules.map((rule) => (
            <div key={rule.id} className="rounded-xl border border-slate-100 p-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-medium text-navy-900">{rule.name}</p>
                  <p className="mt-0.5 text-xs text-slate-500">
                    {EVENT_LABELS[rule.event] || rule.event} → {rule.template_name || "no template"} → {rule.recipient}
                    {rule.delay_minutes ? ` after ${rule.delay_minutes} min` : ""}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-slate-500">{rule.sent_24h} sent in 24h · cap {rule.max_per_day}/day</span>
                  <Button size="sm" variant="ghost" onClick={() => test(rule)}><FlaskConical className="h-3.5 w-3.5" /> Test</Button>
                  <Button size="sm" variant={rule.is_active ? "secondary" : "primary"} onClick={() => toggle(rule)}>
                    {rule.is_active ? <><PowerOff className="h-3.5 w-3.5" /> Turn off</> : <><Power className="h-3.5 w-3.5" /> Turn on</>}
                  </Button>
                </div>
              </div>
              {rule.paused_reason && (
                <p className="mt-2 rounded-lg bg-rose-50 p-2 text-xs text-rose-700">Stopped: {rule.paused_reason}</p>
              )}
            </div>
          ))}
          {!rules.length && <p className="text-sm text-slate-500">No rules yet. Nothing sends automatically.</p>}
        </div>
      </Card>
    </div>
  );
}
