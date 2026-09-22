import { useEffect, useState } from "react";
import { Receipt, FileText } from "lucide-react";
import { api } from "@admin/lib/api";
import { Button } from "@admin/components/ui/Button";
import { Card } from "@admin/components/ui/Card";
import { Input, Label, Select } from "@admin/components/ui/Field";

interface Note {
  id: number; type: string; body: string;
  visible_to_partner: boolean; author_role: string; created_at: string;
}
interface Commission {
  id: string; student_name: string; partner_name: string; partner_business: string | null;
  partner_type: string; partner_code: string; amount: string; status: string;
  invoice_status: string; invoice_path: string | null; payout_reference: string | null;
  branch_code: string | null; commission_basis: string; notes: Note[];
}

/** Doc 7.2: received, under review, clarification required, approved, on hold, rejected, paid, closed. */
const INVOICE_STATES = [
  "not_uploaded", "received", "under_review", "clarification_required",
  "approved", "on_hold", "rejected", "paid", "closed",
];
const STATUSES = ["pending", "approved", "paid", "rejected"];

const NOTE_TYPES = [
  ["note", "Internal note"],
  ["clarification", "Clarification request (partner sees this)"],
  ["hold_reason", "Hold reason"],
  ["tax_note", "Tax note"],
  ["payout_reference", "Payout reference"],
  ["payment_confirmation", "Payment confirmation"],
];

/**
 * Accountant — commission and invoice review (CRM document section 7).
 *
 * Nothing here pays anybody. It records that a person decided to, who they
 * were, and why — which is what the document's audit safeguards require.
 */
export default function Finance() {
  const [rows, setRows] = useState<Commission[]>([]);
  const [summary, setSummary] = useState<any>(null);
  const [open, setOpen] = useState<string>("");
  const [busy, setBusy] = useState(false);

  const load = async () => {
    const [c, s] = await Promise.all([
      api<{ commissions: Commission[] }>("/finance/commissions"),
      api<any>("/finance/summary"),
    ]);
    setRows(c.commissions);
    setSummary(s);
  };

  useEffect(() => { void load().catch(() => undefined); }, []);

  const patch = async (id: string, body: Record<string, unknown>) => {
    setBusy(true);
    try { await api(`/finance/commissions/${id}`, { method: "PATCH", body }); await load(); }
    catch (e) { window.alert(e instanceof Error ? e.message : "Update failed"); }
    finally { setBusy(false); }
  };

  const addNote = async (id: string, form: HTMLFormElement) => {
    const data = new FormData(form);
    const body = String(data.get("body") || "").trim();
    if (!body) return;
    setBusy(true);
    try {
      await api(`/finance/commissions/${id}/notes`, {
        method: "POST",
        body: {
          body,
          noteType: String(data.get("noteType")),
          visibleToPartner: data.get("visible") === "on",
        },
      });
      form.reset();
      await load();
    } catch (e) { window.alert(e instanceof Error ? e.message : "Could not add note"); }
    finally { setBusy(false); }
  };

  const viewInvoice = async (id: string) => {
    try {
      const { dataUrl } = await api<{ dataUrl: string }>(`/finance/commissions/${id}/invoice`);
      const w = window.open();
      if (w) w.document.write(`<iframe src="${dataUrl}" style="border:0;width:100%;height:100%"></iframe>`);
    } catch (e) { window.alert(e instanceof Error ? e.message : "No invoice"); }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        <Receipt className="h-5 w-5 text-sky-600" />
        <h1 className="text-xl font-semibold text-navy-900">Commissions &amp; invoices</h1>
        {summary ? <span className="text-sm text-slate-500">{summary.scope}</span> : null}
      </div>

      {summary ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {summary.commissions.map((c: any) => (
            <Card key={c.status} className="py-3">
              <p className="text-xs uppercase tracking-wide text-slate-500">{c.status}</p>
              <p className="text-lg font-semibold text-navy-900">
                ₹{Number(c.total).toLocaleString("en-IN")}
              </p>
              <p className="text-xs text-slate-500">{c.n} commission(s)</p>
            </Card>
          ))}
        </div>
      ) : null}

      {rows.map((row) => (
        <Card key={row.id}>
          <div className="flex flex-wrap items-center gap-3">
            <div className="mr-auto">
              <p className="font-medium text-navy-900">{row.student_name}</p>
              <p className="text-xs text-slate-500">
                {row.partner_business || row.partner_name} · {row.partner_type} · {row.partner_code}
                {row.branch_code ? ` · ${row.branch_code}` : ""}
              </p>
            </div>
            <Input
              className="w-32"
              type="number"
              defaultValue={row.amount}
              onBlur={(e) => {
                const v = Number(e.target.value);
                if (v !== Number(row.amount)) void patch(row.id, { amount: v });
              }}
            />
            <Select className="w-32" value={row.status} disabled={busy}
              onChange={(e) => void patch(row.id, { status: e.target.value })}>
              {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
            </Select>
            <Select className="w-44" value={row.invoice_status} disabled={busy}
              onChange={(e) => void patch(row.id, { invoiceStatus: e.target.value })}>
              {INVOICE_STATES.map((s) => <option key={s} value={s}>{s.replace(/_/g, " ")}</option>)}
            </Select>
            {row.invoice_path ? (
              <button onClick={() => void viewInvoice(row.id)}
                className="flex items-center gap-1 rounded-lg border border-slate-300 px-2 py-1.5 text-xs">
                <FileText className="h-3 w-3" /> Invoice
              </button>
            ) : null}
            <button onClick={() => setOpen(open === row.id ? "" : row.id)}
              className="rounded-lg border border-slate-300 px-2 py-1.5 text-xs">
              Notes ({row.notes.length})
            </button>
          </div>

          {open === row.id ? (
            <div className="mt-4 space-y-3 rounded-xl bg-slate-50 p-4">
              {row.notes.map((n) => (
                <div key={n.id} className="text-sm">
                  <span className="mr-2 rounded bg-white px-1.5 py-0.5 text-[11px] uppercase tracking-wide text-slate-500">
                    {n.type.replace(/_/g, " ")}
                  </span>
                  {n.visible_to_partner ? (
                    <span className="mr-2 rounded bg-sky-100 px-1.5 py-0.5 text-[11px] text-sky-800">partner sees</span>
                  ) : (
                    <span className="mr-2 rounded bg-slate-200 px-1.5 py-0.5 text-[11px] text-slate-600">internal</span>
                  )}
                  <span className="text-slate-700">{n.body}</span>
                </div>
              ))}

              <form onSubmit={(e) => { e.preventDefault(); void addNote(row.id, e.currentTarget); }}
                className="grid gap-2 sm:grid-cols-[1fr_auto]">
                <Input name="body" placeholder="Add a note, clarification or payout reference…" />
                <Select name="noteType" className="w-64" defaultValue="note">
                  {NOTE_TYPES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                </Select>
                <label className="flex items-center gap-2 text-xs text-slate-600">
                  <input type="checkbox" name="visible" className="h-4 w-4" />
                  Make this visible to the partner
                </label>
                <Button type="submit" disabled={busy}>Add note</Button>
              </form>

              <div className="pt-2">
                <Label>Payout reference</Label>
                <Input defaultValue={row.payout_reference || ""} placeholder="NEFT / UTR number"
                  onBlur={(e) => {
                    if (e.target.value !== (row.payout_reference || "")) {
                      void patch(row.id, { payoutReference: e.target.value });
                    }
                  }} />
              </div>
            </div>
          ) : null}
        </Card>
      ))}

      {rows.length === 0 ? (
        <Card><p className="py-8 text-center text-sm text-slate-500">No commissions yet.</p></Card>
      ) : null}
    </div>
  );
}
