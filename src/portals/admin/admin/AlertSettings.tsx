import { useEffect, useState } from "react";
import { BellRing, Volume2, VolumeX } from "lucide-react";
import { api } from "@admin/lib/api";
import { Button } from "@admin/components/ui/Button";
import { Card } from "@admin/components/ui/Card";
import { Input, Label, Select } from "@admin/components/ui/Field";

/**
 * CRM 2.6.1 — configurable sound and visual alerts.
 *
 * Settings resolve most-specific-first: user, then role, then branch, then the
 * global default. An admin edits any level; a branch head edits their own
 * branch only, which the API enforces as well as this screen.
 */

type Setting = {
  id: string;
  scope_type: string;
  scope_id: string;
  alert_type: string;
  enabled: boolean;
  sound_enabled: boolean;
  tone: string;
  priority: string;
  channels: string[];
  color: string;
  display_ms: number;
  can_snooze: boolean;
  can_mute: boolean;
  quiet_start: string | null;
  quiet_end: string | null;
  respect_hours: boolean;
};

const LABELS: Record<string, string> = {
  lead_assigned: "A lead is assigned to someone",
  lead_transferred: "A lead is transferred between staff",
  branch_lead_arrived: "A new lead arrives for the branch",
  followup_due: "A follow-up is due",
  followup_overdue: "A follow-up is overdue",
  hot_lead_update: "A lead is marked hot",
  missed_response: "A student has not been answered",
  document_rejected: "A document is sent back",
  application_status_changed: "An application status changes",
  escalation_raised: "A student reports a conversation",
};

const CHANNELS = ["bell", "toast", "sound", "banner", "push"];
const TONES = ["chime", "ping", "urgent", "soft"];
const PRIORITIES = ["low", "normal", "high", "urgent"];

export default function AlertSettings() {
  const [settings, setSettings] = useState<Setting[]>([]);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const load = () =>
    api<{ settings: Setting[] }>("/alerts/settings")
      .then((data) => setSettings(data.settings))
      .catch((err) => setError(err instanceof Error ? err.message : "Could not load alert settings"));

  useEffect(() => { void load(); }, []);

  const save = async (row: Setting, patch: Partial<Setting>) => {
    setError(""); setNotice("");
    try {
      await api("/alerts/settings", { method: "PUT", body: { ...row, ...patch } });
      setSettings((current) => current.map((item) => (item.id === row.id ? { ...item, ...patch } : item)));
      setNotice("Saved.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save");
    }
  };

  const toggleChannel = (row: Setting, channel: string) => {
    const channels = row.channels.includes(channel)
      ? row.channels.filter((item) => item !== channel)
      : [...row.channels, channel];
    void save(row, { channels });
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        <BellRing className="h-5 w-5 text-sky-600" />
        <h1 className="text-xl font-semibold text-navy-900">Alerts</h1>
      </div>
      <p className="max-w-3xl text-sm text-slate-600">
        What makes a noise, what shows a badge, and when the platform stays quiet. Urgent alerts still
        arrive during quiet hours and outside working hours — they simply arrive silently, so an overdue
        follow-up is never lost.
      </p>

      {error && <p className="text-sm text-rose-600">{error}</p>}
      {notice && <p className="text-sm text-emerald-700">{notice}</p>}

      <div className="space-y-3">
        {settings.map((row) => (
          <Card key={row.id} className="p-5">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <p className="text-sm font-semibold text-navy-900">{LABELS[row.alert_type] || row.alert_type}</p>
                <p className="mt-0.5 text-xs text-slate-500">
                  {row.scope_type === "global" ? "Default for everyone" : `${row.scope_type}: ${row.scope_id}`}
                </p>
              </div>
              <label className="flex items-center gap-2 text-sm text-slate-700">
                <input type="checkbox" checked={row.enabled} onChange={(e) => save(row, { enabled: e.target.checked })} />
                On
              </label>
            </div>

            <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <div>
                <Label>Priority</Label>
                <Select value={row.priority} onChange={(e) => save(row, { priority: e.target.value })}>
                  {PRIORITIES.map((priority) => <option key={priority} value={priority}>{priority}</option>)}
                </Select>
              </div>
              <div>
                <Label>Sound</Label>
                <Select value={row.tone} onChange={(e) => save(row, { tone: e.target.value })}>
                  {TONES.map((tone) => <option key={tone} value={tone}>{tone}</option>)}
                </Select>
              </div>
              <div>
                <Label>Quiet from</Label>
                <Input type="time" value={row.quiet_start || ""} onChange={(e) => save(row, { quiet_start: e.target.value })} />
              </div>
              <div>
                <Label>Quiet until</Label>
                <Input type="time" value={row.quiet_end || ""} onChange={(e) => save(row, { quiet_end: e.target.value })} />
              </div>
            </div>

            <div className="mt-4 flex flex-wrap items-center gap-2">
              {CHANNELS.map((channel) => (
                <button
                  key={channel}
                  onClick={() => toggleChannel(row, channel)}
                  className={`rounded-full px-3 py-1 text-xs ${
                    row.channels.includes(channel) ? "bg-navy-900 text-white" : "bg-slate-100 text-slate-600"
                  }`}
                >
                  {channel}
                </button>
              ))}
              <span className="flex-1" />
              <Button size="sm" variant="ghost" onClick={() => save(row, { sound_enabled: !row.sound_enabled })}>
                {row.sound_enabled ? <><Volume2 className="h-3.5 w-3.5" /> Sound on</> : <><VolumeX className="h-3.5 w-3.5" /> Silent</>}
              </Button>
              <label className="flex items-center gap-2 text-xs text-slate-600">
                <input type="checkbox" checked={row.respect_hours} onChange={(e) => save(row, { respect_hours: e.target.checked })} />
                Respect working hours
              </label>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}
