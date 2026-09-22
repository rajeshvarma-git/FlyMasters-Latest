import { FormEvent, useEffect, useState } from "react";
import { FileText, Plus, Archive, RotateCcw } from "lucide-react";
import { api } from "@admin/lib/api";
import { Button } from "@admin/components/ui/Button";
import { Card } from "@admin/components/ui/Card";
import { Input, Label, Textarea } from "@admin/components/ui/Field";

/**
 * CRM 2.6 — the document master.
 *
 * One record per document type, defined once and reused by every country
 * checklist. Changing the passport rule here changes it for all twelve
 * checklists, which is the whole reason the master is separate from the
 * checklists rather than fused into them.
 *
 * Nothing is deleted. Retiring a document hides it from new checklists and
 * leaves every historical reference intact.
 */

type DocumentMasterRow = {
  id: string;
  code: string;
  name: string;
  description: string;
  accepted_formats: string[];
  max_size_mb: string | number;
  naming_convention: string;
  requires_expiry: boolean;
  validity_months: number | null;
  sample_instructions: string;
  review_instructions: string;
  country_scope: string[];
  restricted_visible: boolean;
  secure_download: boolean;
  retention_days: number | null;
  is_active: boolean;
};

const blank = {
  name: "",
  description: "",
  accepted_formats: "pdf,jpg",
  max_size_mb: "10",
  sample_instructions: "",
  review_instructions: "",
  naming_convention: "",
  country_scope: "All",
  requires_expiry: false,
  validity_months: "",
  restricted_visible: false,
  secure_download: false,
};

export default function DocumentMaster() {
  const [rows, setRows] = useState<DocumentMasterRow[]>([]);
  const [form, setForm] = useState({ ...blank });
  const [showRetired, setShowRetired] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const load = () =>
    api<{ documents: DocumentMasterRow[] }>(`/config/documents${showRetired ? "?all=1" : ""}`)
      .then((data) => setRows(data.documents))
      .catch((err) => setError(err instanceof Error ? err.message : "Could not load documents"));

  useEffect(() => {
    void load();
  }, [showRetired]);

  const create = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError("");
    setBusy(true);
    try {
      await api("/config/documents", {
        method: "POST",
        body: {
          ...form,
          accepted_formats: form.accepted_formats,
          country_scope: form.country_scope,
          max_size_mb: Number(form.max_size_mb || 10),
          validity_months: form.validity_months ? Number(form.validity_months) : null,
        },
      });
      setForm({ ...blank });
      setNotice("Document added. It is now available to every checklist.");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not add the document");
    } finally {
      setBusy(false);
    }
  };

  const toggle = async (row: DocumentMasterRow) => {
    await api(`/config/documents/${row.id}`, { method: "PATCH", body: { is_active: !row.is_active } });
    setNotice(row.is_active
      ? `"${row.name}" retired. Existing checklists that use it are untouched.`
      : `"${row.name}" is available again.`);
    await load();
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        <FileText className="h-5 w-5 text-sky-600" />
        <h1 className="text-xl font-semibold text-navy-900">Document master</h1>
      </div>
      <p className="max-w-3xl text-sm text-slate-600">
        Define each document once. Country checklists are then built by picking from this list, so a rule
        like the passport file size is written in one place rather than repeated per country.
      </p>

      <Card className="p-5">
        <h2 className="mb-4 flex items-center gap-2 text-sm font-semibold text-navy-900">
          <Plus className="h-4 w-4" /> Add a document
        </h2>
        <form onSubmit={create} className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <div className="lg:col-span-1">
            <Label>Document name</Label>
            <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Passport" required />
          </div>
          <div>
            <Label>Accepted formats</Label>
            <Input value={form.accepted_formats} onChange={(e) => setForm({ ...form, accepted_formats: e.target.value })} placeholder="pdf,jpg" />
          </div>
          <div>
            <Label>Maximum size (MB)</Label>
            <Input type="number" min="1" value={form.max_size_mb} onChange={(e) => setForm({ ...form, max_size_mb: e.target.value })} />
          </div>
          <div className="sm:col-span-2 lg:col-span-3">
            <Label>What the student sees</Label>
            <Textarea
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              placeholder="Photo page of your passport, in colour, showing your name and the expiry date."
            />
          </div>
          <div className="sm:col-span-2 lg:col-span-3">
            <Label>Upload instructions</Label>
            <Input
              value={form.sample_instructions}
              onChange={(e) => setForm({ ...form, sample_instructions: e.target.value })}
              placeholder="Scan the full page — no cropped corners."
            />
          </div>
          <div className="sm:col-span-2 lg:col-span-3">
            <Label>Review instructions (staff only)</Label>
            <Input
              value={form.review_instructions}
              onChange={(e) => setForm({ ...form, review_instructions: e.target.value })}
              placeholder="Check the name matches the application exactly."
            />
          </div>
          <div>
            <Label>Countries it applies to</Label>
            <Input value={form.country_scope} onChange={(e) => setForm({ ...form, country_scope: e.target.value })} placeholder="All" />
          </div>
          <div>
            <Label>Validity (months, optional)</Label>
            <Input type="number" value={form.validity_months} onChange={(e) => setForm({ ...form, validity_months: e.target.value })} />
          </div>
          <div className="flex flex-col justify-end gap-2 text-sm text-slate-700">
            <label className="flex items-center gap-2">
              <input type="checkbox" checked={form.requires_expiry} onChange={(e) => setForm({ ...form, requires_expiry: e.target.checked })} />
              Track an expiry date
            </label>
            <label className="flex items-center gap-2">
              <input type="checkbox" checked={form.restricted_visible} onChange={(e) => setForm({ ...form, restricted_visible: e.target.checked })} />
              Restricted — staff only
            </label>
          </div>
          <div className="sm:col-span-2 lg:col-span-3">
            <Button type="submit" disabled={busy}>{busy ? "Saving…" : "Add document"}</Button>
          </div>
        </form>
        {error && <p className="mt-3 text-sm text-rose-600">{error}</p>}
        {notice && <p className="mt-3 text-sm text-emerald-700">{notice}</p>}
      </Card>

      <Card className="p-5">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-navy-900">{rows.length} document{rows.length === 1 ? "" : "s"}</h2>
          <label className="flex items-center gap-2 text-sm text-slate-600">
            <input type="checkbox" checked={showRetired} onChange={(e) => setShowRetired(e.target.checked)} />
            Show retired
          </label>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100 text-left text-xs uppercase tracking-wide text-slate-500">
                <th className="py-2 pr-4">Document</th>
                <th className="py-2 pr-4">Formats</th>
                <th className="py-2 pr-4">Max size</th>
                <th className="py-2 pr-4">Expiry</th>
                <th className="py-2 pr-4">Countries</th>
                <th className="py-2 pr-4" />
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id} className={`border-b border-slate-50 ${row.is_active ? "" : "opacity-50"}`}>
                  <td className="py-3 pr-4">
                    <p className="font-medium text-navy-900">{row.name}</p>
                    <p className="text-xs text-slate-500">{row.description || row.code}</p>
                  </td>
                  <td className="py-3 pr-4 text-slate-600">{(row.accepted_formats || []).join(", ")}</td>
                  <td className="py-3 pr-4 text-slate-600">{Number(row.max_size_mb)} MB</td>
                  <td className="py-3 pr-4 text-slate-600">{row.requires_expiry ? "Tracked" : "—"}</td>
                  <td className="py-3 pr-4 text-slate-600">{(row.country_scope || []).join(", ")}</td>
                  <td className="py-3 pr-4 text-right">
                    <Button size="sm" variant="secondary" onClick={() => toggle(row)}>
                      {row.is_active ? <><Archive className="h-3.5 w-3.5" /> Retire</> : <><RotateCcw className="h-3.5 w-3.5" /> Restore</>}
                    </Button>
                  </td>
                </tr>
              ))}
              {!rows.length && (
                <tr><td colSpan={6} className="py-8 text-center text-sm text-slate-500">No documents yet. Add the first one above.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
