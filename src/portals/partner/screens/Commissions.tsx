import { useEffect, useRef, useState } from "react";
import { Upload } from "lucide-react";
import { api, type Commission } from "@partner/lib/api";

const LABEL: Record<string, string> = {
  not_uploaded: "No invoice yet",
  received: "Invoice received",
  under_review: "Under review",
  clarification_required: "Clarification needed",
  approved: "Approved",
  on_hold: "On hold",
  rejected: "Rejected",
  paid: "Paid",
  closed: "Closed",
};

const TONE: Record<string, string> = {
  pending: "bg-slate-100 text-slate-700",
  approved: "bg-sky-50 text-sky-800",
  paid: "bg-emerald-50 text-emerald-800",
  rejected: "bg-red-50 text-red-700",
};

export default function Commissions() {
  const [rows, setRows] = useState<Commission[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState("");
  const fileFor = useRef<Record<string, HTMLInputElement | null>>({});

  const load = () =>
    api<{ commissions: Commission[] }>("/commissions").then((d) => setRows(d.commissions));

  useEffect(() => { void load().finally(() => setLoading(false)); }, []);

  /** Doc 6.1: upload an invoice against an eligible commission. */
  const upload = async (id: string, file: File) => {
    setBusy(id);
    try {
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result));
        reader.onerror = () => reject(new Error("Could not read that file"));
        reader.readAsDataURL(file);
      });
      await api(`/commissions/${id}/invoice`, { method: "POST", body: { dataUrl } });
      await load();
    } catch (error) {
      window.alert(error instanceof Error ? error.message : "Upload failed");
    } finally {
      setBusy("");
    }
  };

  if (loading) return <p className="text-sm text-slate-500">Loading…</p>;

  return (
    <div className="space-y-4">
      <h1 className="font-semibold text-navy-900">Commissions</h1>

      {rows.length === 0 ? (
        <p className="rounded-2xl border border-slate-200 bg-white px-5 py-10 text-center text-sm text-slate-500">
          Nothing yet. A commission is raised once a student you referred enrols.
        </p>
      ) : (
        rows.map((row) => (
          <div key={row.id} className="rounded-2xl border border-slate-200 bg-white p-5">
            <div className="flex flex-wrap items-center gap-3">
              <p className="font-medium text-navy-900">{row.student_name}</p>
              <span className={`rounded-full px-2 py-1 text-xs ${TONE[row.status] || TONE.pending}`}>
                {row.status}
              </span>
              <span className="text-xs text-slate-500">{LABEL[row.invoice_status] || row.invoice_status}</span>
              <span className="ml-auto font-semibold text-navy-900">
                {Number(row.amount) > 0 ? `₹${Number(row.amount).toLocaleString("en-IN")}` : "To be confirmed"}
              </span>
            </div>

            {row.payout_reference ? (
              <p className="mt-2 text-xs text-slate-600">Payout reference: {row.payout_reference}</p>
            ) : null}

            {row.notes.length > 0 ? (
              <div className="mt-3 space-y-2 rounded-xl bg-slate-50 p-3">
                {row.notes.map((note) => (
                  <div key={note.id} className="text-sm">
                    <span className="mr-2 rounded bg-white px-1.5 py-0.5 text-[11px] uppercase tracking-wide text-slate-500">
                      {note.type.replace("_", " ")}
                    </span>
                    <span className="text-slate-700">{note.body}</span>
                  </div>
                ))}
              </div>
            ) : null}

            {!["paid", "closed"].includes(row.invoice_status) ? (
              <div className="mt-3">
                <input
                  type="file"
                  accept="application/pdf,image/*"
                  className="hidden"
                  ref={(el) => { fileFor.current[row.id] = el; }}
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) void upload(row.id, file);
                    e.target.value = "";
                  }}
                />
                <button
                  type="button"
                  disabled={busy === row.id}
                  onClick={() => fileFor.current[row.id]?.click()}
                  className="flex items-center gap-2 rounded-xl border border-slate-300 px-3 py-1.5 text-sm text-navy-900 disabled:opacity-60"
                >
                  <Upload className="h-4 w-4" />
                  {busy === row.id
                    ? "Uploading…"
                    : row.invoice_status === "not_uploaded" ? "Upload invoice" : "Replace invoice"}
                </button>
              </div>
            ) : null}
          </div>
        ))
      )}
    </div>
  );
}
