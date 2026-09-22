import { FormEvent, useEffect, useState } from "react";
import { ClipboardList, GitBranch, History, Rocket, Plus, Lock } from "lucide-react";
import { api } from "@admin/lib/api";
import { Button } from "@admin/components/ui/Button";
import { Card } from "@admin/components/ui/Card";
import { Input, Label, Select, Textarea } from "@admin/components/ui/Field";

/**
 * CRM 2.6 / 2.6.2 — versioned country checklists.
 *
 * The rule the client asked for, enforced in the UI as well as the API:
 * a published checklist is never edited. Changing it creates a new version.
 * The old one stays, marked inactive, and every student who started on it
 * keeps seeing exactly what they started with.
 */

type Template = {
  id: string;
  family_id: string;
  name: string;
  country: string;
  application_stage: string;
  visa_stage: string;
  course_level: string;
  intake: string;
  institution_type: string;
  version: number;
  status: "draft" | "active" | "inactive";
  change_note: string;
  published_at: string | null;
  superseded_by: string | null;
  created_by: string | null;
  created_at: string;
  version_count?: string;
  item_count?: string;
};

type Item = {
  id: string;
  document_master_id: string;
  requirement: string;
  condition_note: string;
  name: string;
  code: string;
};

type Doc = { id: string; name: string; code: string };

const REQUIREMENTS = ["mandatory", "optional", "conditional", "time_sensitive"];

const statusTone: Record<string, string> = {
  active: "bg-emerald-100 text-emerald-800",
  draft: "bg-amber-100 text-amber-900",
  inactive: "bg-slate-100 text-slate-600",
};

export default function ChecklistBuilder() {
  const [families, setFamilies] = useState<Template[]>([]);
  const [docs, setDocs] = useState<Doc[]>([]);
  const [selected, setSelected] = useState<Template | null>(null);
  const [versions, setVersions] = useState<Template[]>([]);
  const [items, setItems] = useState<Item[]>([]);
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({ name: "", country: "", course_level: "All", intake: "All", visa_stage: "All" });

  const loadFamilies = () =>
    api<{ checklists: Template[] }>("/config/checklists").then((data) => setFamilies(data.checklists));

  useEffect(() => {
    void loadFamilies().catch((e) => setError(String(e.message || e)));
    void api<{ documents: Doc[] }>("/config/documents").then((d) => setDocs(d.documents)).catch(() => undefined);
  }, []);

  const open = async (family: Template) => {
    setError(""); setNotice("");
    const data = await api<{ versions: Template[] }>(`/config/checklists/${family.family_id}/versions`);
    setVersions(data.versions);
    const live = data.versions.find((v) => v.status === "draft") || data.versions.find((v) => v.status === "active") || data.versions[0];
    await openVersion(live);
  };

  const openVersion = async (version: Template) => {
    setSelected(version);
    const data = await api<{ template: Template; items: Item[] }>(`/config/checklists/version/${version.id}`);
    setItems(data.items);
    setDraft(Object.fromEntries(data.items.map((item) => [item.document_master_id, item.requirement])));
  };

  const create = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setBusy(true); setError("");
    try {
      const created = await api<Template>("/config/checklists", { method: "POST", body: form });
      setForm({ name: "", country: "", course_level: "All", intake: "All", visa_stage: "All" });
      await loadFamilies();
      await open(created);
      setNotice("Draft created. Tick the documents it needs, then publish.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create the checklist");
    } finally {
      setBusy(false);
    }
  };

  const saveItems = async () => {
    if (!selected) return;
    setBusy(true); setError("");
    try {
      await api(`/config/checklists/version/${selected.id}/items`, {
        method: "PUT",
        body: {
          items: Object.entries(draft)
            .filter(([, requirement]) => requirement && requirement !== "none")
            .map(([document_master_id, requirement], index) => ({ document_master_id, requirement, display_order: index })),
        },
      });
      await openVersion(selected);
      setNotice("Draft saved.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save the draft");
    } finally {
      setBusy(false);
    }
  };

  const publish = async () => {
    if (!selected) return;
    setBusy(true); setError("");
    try {
      await api(`/config/checklists/version/${selected.id}/publish`, { method: "POST", body: {} });
      await loadFamilies();
      await open(selected);
      setNotice(`Version ${selected.version} is live. The previous version is kept and marked inactive — students already on it are unaffected.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not publish");
    } finally {
      setBusy(false);
    }
  };

  const revise = async () => {
    if (!selected) return;
    setBusy(true); setError("");
    try {
      const next = await api<Template & { copied_from_version: number }>(
        `/config/checklists/${selected.family_id}/revise`,
        { method: "POST", body: { change_note: selected.change_note } },
      );
      await loadFamilies();
      await open(next);
      setNotice(`Version ${next.version} started as a copy of version ${next.copied_from_version}. Nothing is live until you publish it.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not start a new version");
    } finally {
      setBusy(false);
    }
  };

  const editable = selected?.status === "draft";

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        <ClipboardList className="h-5 w-5 text-sky-600" />
        <h1 className="text-xl font-semibold text-navy-900">Country checklists</h1>
      </div>
      <p className="max-w-3xl text-sm text-slate-600">
        A checklist is built from the document master and published as a version. Publishing a new version
        never changes what a student already mid-application sees — they stay on the version that was live
        when their checklist was activated.
      </p>

      <Card className="p-5">
        <h2 className="mb-4 flex items-center gap-2 text-sm font-semibold text-navy-900">
          <Plus className="h-4 w-4" /> New checklist
        </h2>
        <form onSubmit={create} className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
          <div className="lg:col-span-2">
            <Label>Name</Label>
            <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Canada — Masters" required />
          </div>
          <div>
            <Label>Country</Label>
            <Input value={form.country} onChange={(e) => setForm({ ...form, country: e.target.value })} placeholder="Canada" />
          </div>
          <div>
            <Label>Course level</Label>
            <Input value={form.course_level} onChange={(e) => setForm({ ...form, course_level: e.target.value })} />
          </div>
          <div className="flex items-end">
            <Button type="submit" disabled={busy}>Create draft</Button>
          </div>
        </form>
      </Card>

      {error && <p className="text-sm text-rose-600">{error}</p>}
      {notice && <p className="text-sm text-emerald-700">{notice}</p>}

      <div className="grid gap-6 lg:grid-cols-[320px_1fr]">
        <Card className="p-5">
          <h2 className="mb-3 text-sm font-semibold text-navy-900">All checklists</h2>
          <div className="space-y-2">
            {families.map((family) => (
              <button
                key={family.family_id}
                onClick={() => open(family)}
                className={`w-full rounded-xl border p-3 text-left transition ${
                  selected?.family_id === family.family_id ? "border-sky-400 bg-sky-50" : "border-slate-100 hover:bg-slate-50"
                }`}
              >
                <p className="text-sm font-medium text-navy-900">{family.name}</p>
                <p className="mt-1 flex items-center gap-2 text-xs text-slate-500">
                  <span className={`rounded-full px-2 py-0.5 ${statusTone[family.status]}`}>v{family.version} · {family.status}</span>
                  <span>{family.version_count} version{family.version_count === "1" ? "" : "s"}</span>
                </p>
              </button>
            ))}
            {!families.length && <p className="text-sm text-slate-500">No checklists yet.</p>}
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
                    {selected.country} · {selected.course_level} · {selected.intake}
                    {selected.published_at ? ` · published ${new Date(selected.published_at).toLocaleDateString()}` : ""}
                  </p>
                </div>
                <div className="flex gap-2">
                  {editable ? (
                    <>
                      <Button size="sm" variant="secondary" onClick={saveItems} disabled={busy}>Save draft</Button>
                      <Button size="sm" onClick={publish} disabled={busy}><Rocket className="h-3.5 w-3.5" /> Publish</Button>
                    </>
                  ) : (
                    <Button size="sm" variant="secondary" onClick={revise} disabled={busy}>
                      <GitBranch className="h-3.5 w-3.5" /> New version from this
                    </Button>
                  )}
                </div>
              </div>

              {!editable && (
                <p className="mt-3 flex items-center gap-2 rounded-xl bg-slate-50 p-3 text-xs text-slate-600">
                  <Lock className="h-3.5 w-3.5" />
                  This version is published and cannot be edited. Start a new version to change it — this one is kept exactly as it is.
                </p>
              )}

              {editable && (
                <div className="mt-4">
                  <Label>What changed, and why</Label>
                  <Textarea
                    value={selected.change_note}
                    onChange={(e) => setSelected({ ...selected, change_note: e.target.value })}
                    placeholder="Proof of funds is now mandatory for Canada from the January intake."
                  />
                </div>
              )}
            </Card>

            <Card className="p-5">
              <h3 className="mb-4 text-sm font-semibold text-navy-900">Documents in this version</h3>
              <div className="space-y-2">
                {docs.map((doc) => {
                  const value = draft[doc.id] || "none";
                  return (
                    <div key={doc.id} className="flex items-center gap-3 rounded-xl border border-slate-100 p-3">
                      <span className="flex-1 text-sm text-navy-900">{doc.name}</span>
                      <Select
                        className="w-48"
                        value={value}
                        disabled={!editable}
                        onChange={(e) => setDraft({ ...draft, [doc.id]: e.target.value })}
                      >
                        <option value="none">Not in this checklist</option>
                        {REQUIREMENTS.map((requirement) => (
                          <option key={requirement} value={requirement}>{requirement.replace("_", " ")}</option>
                        ))}
                      </Select>
                    </div>
                  );
                })}
                {!docs.length && <p className="text-sm text-slate-500">Add documents to the master first.</p>}
              </div>
              <p className="mt-3 text-xs text-slate-500">{items.length} document{items.length === 1 ? "" : "s"} saved on this version.</p>
            </Card>

            <Card className="p-5">
              <h3 className="mb-4 flex items-center gap-2 text-sm font-semibold text-navy-900">
                <History className="h-4 w-4" /> Version history
              </h3>
              <div className="space-y-2">
                {versions.map((version) => (
                  <button
                    key={version.id}
                    onClick={() => openVersion(version)}
                    className={`flex w-full items-center gap-3 rounded-xl border p-3 text-left ${
                      selected.id === version.id ? "border-sky-400 bg-sky-50" : "border-slate-100 hover:bg-slate-50"
                    }`}
                  >
                    <span className={`rounded-full px-2 py-0.5 text-xs ${statusTone[version.status]}`}>v{version.version}</span>
                    <span className="flex-1 text-sm text-slate-700">{version.change_note || "No note"}</span>
                    <span className="text-xs text-slate-400">
                      {version.item_count} docs · {new Date(version.created_at).toLocaleDateString()}
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
