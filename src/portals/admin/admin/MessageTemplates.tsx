import { FormEvent, useEffect, useState } from "react";
import { MessageSquareText, GitBranch, CheckCircle2, Send, History, Lock } from "lucide-react";
import { api } from "@admin/lib/api";
import { Button } from "@admin/components/ui/Button";
import { Card } from "@admin/components/ui/Card";
import { Input, Label, Select, Textarea } from "@admin/components/ui/Field";

/**
 * CRM 2.7 — approved message templates.
 *
 * Same versioning rule as the checklists: an approved template is immutable.
 * Changing the wording creates a new version, the old one goes inactive and
 * keeps its text, so a message sent last March can still be traced to the
 * exact wording that was live at the time.
 *
 * WhatsApp is the one channel with a second gate: Meta approves templates
 * separately from us, so the CRM refuses to publish a WhatsApp template until
 * the Meta template name is filled in. Pretending otherwise would mean
 * counsellors picking a template that silently fails to send.
 */

type Template = {
  id: string;
  family_id: string;
  code: string;
  name: string;
  category: string;
  channel: string;
  language: string;
  subject: string;
  body: string;
  media_url: string;
  meta_template_name: string;
  meta_approved: boolean;
  version: number;
  status: string;
  change_note: string;
  approved_by: string | null;
  allowed_roles: string[];
  countries: string[];
  student_stages: string[];
  is_bulk_allowed: boolean;
  version_count?: string;
};

const CHANNELS = ["whatsapp", "sms", "email", "portal", "chat", "internal"];
const CATEGORIES = ["follow_up", "document_request", "application_update", "visa_update", "fee_reminder", "greeting", "campaign", "general"];
const ROLES = ["counselor", "telecaller", "branch_head", "admin", "super_admin"];

const tone: Record<string, string> = {
  active: "bg-emerald-100 text-emerald-800",
  pending: "bg-amber-100 text-amber-900",
  draft: "bg-slate-100 text-slate-600",
  inactive: "bg-slate-100 text-slate-500",
  retired: "bg-rose-100 text-rose-700",
};

export default function MessageTemplates() {
  const [families, setFamilies] = useState<Template[]>([]);
  const [selected, setSelected] = useState<Template | null>(null);
  const [versions, setVersions] = useState<Template[]>([]);
  const [preview, setPreview] = useState<{ body: string; unresolved: string[] } | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({ name: "", category: "follow_up", channel: "whatsapp", body: "" });

  const load = () => api<{ templates: Template[] }>("/comms/templates").then((d) => setFamilies(d.templates));

  useEffect(() => { void load().catch((e) => setError(String(e.message || e))); }, []);

  const open = async (family: Template) => {
    setError(""); setNotice(""); setPreview(null);
    const data = await api<{ versions: Template[] }>(`/comms/templates/${family.family_id}/versions`);
    setVersions(data.versions);
    setSelected(data.versions.find((v) => ["draft", "pending"].includes(v.status)) || data.versions.find((v) => v.status === "active") || data.versions[0]);
  };

  const create = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setBusy(true); setError("");
    try {
      const created = await api<Template>("/comms/templates", { method: "POST", body: form });
      setForm({ name: "", category: "follow_up", channel: "whatsapp", body: "" });
      await load();
      await open(created);
      setNotice("Draft created. Submit it for approval when the wording is right.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create the template");
    } finally { setBusy(false); }
  };

  const saveDraft = async () => {
    if (!selected) return;
    setBusy(true); setError("");
    try {
      await api(`/comms/templates/version/${selected.id}`, { method: "PATCH", body: selected });
      setNotice("Draft saved.");
      await open(selected);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save");
    } finally { setBusy(false); }
  };

  const act = async (path: string, message: string) => {
    if (!selected) return;
    setBusy(true); setError("");
    try {
      await api(`/comms/templates/version/${selected.id}/${path}`, { method: "POST", body: {} });
      await load();
      await open(selected);
      setNotice(message);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not complete that");
    } finally { setBusy(false); }
  };

  const revise = async () => {
    if (!selected) return;
    setBusy(true); setError("");
    try {
      const next = await api<Template & { copied_from_version: number }>(
        `/comms/templates/${selected.family_id}/revise`, { method: "POST", body: {} });
      await load();
      await open(next);
      setNotice(`Version ${next.version} started from version ${next.copied_from_version}. The live one is unchanged until you approve this.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not start a new version");
    } finally { setBusy(false); }
  };

  const runPreview = async () => {
    if (!selected) return;
    const data = await api<{ body: string; unresolved: string[] }>(
      `/comms/templates/version/${selected.id}/preview`,
      { method: "POST", body: { context: { first_name: "Riya", full_name: "Riya Sharma", country: "Canada", document: "Passport", counsellor: "Meera" } } },
    );
    setPreview(data);
  };

  const editable = selected && ["draft", "pending"].includes(selected.status);

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        <MessageSquareText className="h-5 w-5 text-sky-600" />
        <h1 className="text-xl font-semibold text-navy-900">Message templates</h1>
      </div>
      <p className="max-w-3xl text-sm text-slate-600">
        Counsellors and telecallers can only send messages from this list. Use{" "}
        <code className="rounded bg-slate-100 px-1">{"{{first_name}}"}</code> style placeholders — the preview
        shows which ones are still unfilled before anything goes live.
      </p>

      <Card className="p-5">
        <h2 className="mb-4 text-sm font-semibold text-navy-900">New template</h2>
        <form onSubmit={create} className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div className="lg:col-span-2">
            <Label>Name</Label>
            <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Document reminder" required />
          </div>
          <div>
            <Label>Category</Label>
            <Select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}>
              {CATEGORIES.map((category) => <option key={category} value={category}>{category.replace("_", " ")}</option>)}
            </Select>
          </div>
          <div>
            <Label>Channel</Label>
            <Select value={form.channel} onChange={(e) => setForm({ ...form, channel: e.target.value })}>
              {CHANNELS.map((channel) => <option key={channel} value={channel}>{channel}</option>)}
            </Select>
          </div>
          <div className="sm:col-span-2 lg:col-span-4">
            <Label>Message</Label>
            <Textarea value={form.body} onChange={(e) => setForm({ ...form, body: e.target.value })}
              placeholder="Hi {{first_name}}, we still need your {{document}} for your {{country}} application." />
          </div>
          <div><Button type="submit" disabled={busy}>Create draft</Button></div>
        </form>
      </Card>

      {error && <p className="text-sm text-rose-600">{error}</p>}
      {notice && <p className="text-sm text-emerald-700">{notice}</p>}

      <div className="grid gap-6 lg:grid-cols-[320px_1fr]">
        <Card className="p-5">
          <h2 className="mb-3 text-sm font-semibold text-navy-900">All templates</h2>
          <div className="space-y-2">
            {families.map((family) => (
              <button key={family.family_id} onClick={() => open(family)}
                className={`w-full rounded-xl border p-3 text-left transition ${
                  selected?.family_id === family.family_id ? "border-sky-400 bg-sky-50" : "border-slate-100 hover:bg-slate-50"}`}>
                <p className="text-sm font-medium text-navy-900">{family.name}</p>
                <p className="mt-1 flex flex-wrap items-center gap-2 text-xs text-slate-500">
                  <span className={`rounded-full px-2 py-0.5 ${tone[family.status]}`}>v{family.version} · {family.status}</span>
                  <span>{family.channel}</span>
                </p>
              </button>
            ))}
            {!families.length && <p className="text-sm text-slate-500">No templates yet.</p>}
          </div>
        </Card>

        {selected && (
          <div className="space-y-6">
            <Card className="p-5">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h2 className="text-sm font-semibold text-navy-900">
                    {selected.name} <span className="text-slate-400">· version {selected.version}</span>
                  </h2>
                  <p className="mt-1 text-xs text-slate-500">
                    {selected.channel} · {selected.category}
                    {selected.approved_by ? ` · approved by ${selected.approved_by}` : ""}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button size="sm" variant="ghost" onClick={runPreview}>Preview</Button>
                  {editable ? (
                    <>
                      <Button size="sm" variant="secondary" onClick={saveDraft} disabled={busy}>Save</Button>
                      {selected.status === "draft" && (
                        <Button size="sm" variant="secondary" onClick={() => act("submit", "Sent for approval.")} disabled={busy}>
                          <Send className="h-3.5 w-3.5" /> Submit
                        </Button>
                      )}
                      <Button size="sm" onClick={() => act("approve", `Version ${selected.version} is live.`)} disabled={busy}>
                        <CheckCircle2 className="h-3.5 w-3.5" /> Approve &amp; publish
                      </Button>
                    </>
                  ) : (
                    <Button size="sm" variant="secondary" onClick={revise} disabled={busy}>
                      <GitBranch className="h-3.5 w-3.5" /> New version
                    </Button>
                  )}
                </div>
              </div>

              {!editable && (
                <p className="mt-3 flex items-center gap-2 rounded-xl bg-slate-50 p-3 text-xs text-slate-600">
                  <Lock className="h-3.5 w-3.5" />
                  This version is published and cannot be edited. Start a new version — this wording is kept.
                </p>
              )}

              <div className="mt-4 grid gap-4">
                <div>
                  <Label>Message</Label>
                  <Textarea value={selected.body} disabled={!editable}
                    onChange={(e) => setSelected({ ...selected, body: e.target.value })} />
                </div>
                {selected.channel === "whatsapp" && (
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div>
                      <Label>Meta template name</Label>
                      <Input value={selected.meta_template_name} disabled={!editable}
                        onChange={(e) => setSelected({ ...selected, meta_template_name: e.target.value })}
                        placeholder="fm_document_reminder_v1" />
                      <p className="mt-1 text-xs text-slate-500">
                        Meta approves WhatsApp templates separately. Without this, the template cannot go live.
                      </p>
                    </div>
                    <div className="flex items-end">
                      <label className="flex items-center gap-2 text-sm text-slate-700">
                        <input type="checkbox" checked={selected.meta_approved} disabled={!editable}
                          onChange={(e) => setSelected({ ...selected, meta_approved: e.target.checked })} />
                        Approved by Meta
                      </label>
                    </div>
                  </div>
                )}
                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <Label>Who can use it</Label>
                    <div className="flex flex-wrap gap-2">
                      {ROLES.map((role) => (
                        <button key={role} disabled={!editable}
                          onClick={() => setSelected({
                            ...selected,
                            allowed_roles: selected.allowed_roles.includes(role)
                              ? selected.allowed_roles.filter((item) => item !== role)
                              : [...selected.allowed_roles, role],
                          })}
                          className={`rounded-full px-3 py-1 text-xs ${
                            selected.allowed_roles.includes(role) ? "bg-navy-900 text-white" : "bg-slate-100 text-slate-600"}`}>
                          {role}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="flex items-end">
                    <label className="flex items-center gap-2 text-sm text-slate-700">
                      <input type="checkbox" checked={selected.is_bulk_allowed} disabled={!editable}
                        onChange={(e) => setSelected({ ...selected, is_bulk_allowed: e.target.checked })} />
                      Approved for bulk sending
                    </label>
                  </div>
                </div>
                {editable && (
                  <div>
                    <Label>What changed</Label>
                    <Input value={selected.change_note} onChange={(e) => setSelected({ ...selected, change_note: e.target.value })} />
                  </div>
                )}
              </div>

              {preview && (
                <div className="mt-4 rounded-xl bg-slate-50 p-4">
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Preview</p>
                  <p className="mt-2 whitespace-pre-wrap text-sm text-slate-800">{preview.body}</p>
                  {preview.unresolved.length > 0 && (
                    <p className="mt-2 text-xs text-amber-700">
                      Still unfilled: {preview.unresolved.join(", ")}
                    </p>
                  )}
                </div>
              )}
            </Card>

            <Card className="p-5">
              <h3 className="mb-4 flex items-center gap-2 text-sm font-semibold text-navy-900">
                <History className="h-4 w-4" /> Version history
              </h3>
              <div className="space-y-2">
                {versions.map((version) => (
                  <button key={version.id} onClick={() => setSelected(version)}
                    className={`flex w-full items-start gap-3 rounded-xl border p-3 text-left ${
                      selected.id === version.id ? "border-sky-400 bg-sky-50" : "border-slate-100 hover:bg-slate-50"}`}>
                    <span className={`rounded-full px-2 py-0.5 text-xs ${tone[version.status]}`}>v{version.version}</span>
                    <span className="flex-1 text-sm text-slate-700">
                      {version.change_note || "No note"}
                      <span className="mt-1 block truncate text-xs text-slate-400">{version.body}</span>
                    </span>
                  </button>
                ))}
              </div>
            </Card>
          </div>
        )}
      </div>
    </div>
  );
}
