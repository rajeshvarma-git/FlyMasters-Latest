import { useEffect, useState } from "react";
import { api, type Referral } from "@partner/lib/api";
import { StatusChip } from "@shared/components/StatusBar";

const STAGE_TONE: Record<string, string> = {
  New: "bg-slate-100 text-slate-700",
  "In discussion": "bg-amber-50 text-amber-800",
  "Application submitted": "bg-sky-50 text-sky-800",
  "Offer received": "bg-indigo-50 text-indigo-800",
  "Visa processing": "bg-violet-50 text-violet-800",
  Enrolled: "bg-emerald-50 text-emerald-800",
};

export default function Referrals() {
  const [rows, setRows] = useState<Referral[]>([]);
  const [statusVisible, setStatusVisible] = useState(false);
  // CRM 2.6.2 — the Super Admin decides, per agent account, which of these
  // the agent sees. The server sends only what is allowed; this just knows
  // which columns to draw.
  const [visibility, setVisibility] = useState({ application: false, visa: false, nextStep: false, documents: false });
  const [loading, setLoading] = useState(true);
  const [summary, setSummary] = useState({ referred: 0, converted: 0, pending: 0, approved: 0, paid: 0 });

  // Kept in step with the Fly Masters team's work without a Refresh button: reloads every 30 s while visible.
  useEffect(() => {
    const load = () => api<{ referrals: Referral[]; summary?: typeof summary; statusVisible: boolean; visibility?: typeof visibility }>("/referrals")
      .then((d) => {
        setRows(d.referrals);
        if (d.summary) setSummary(d.summary);
        setStatusVisible(d.statusVisible);
        if (d.visibility) setVisibility(d.visibility);
      })
      .finally(() => setLoading(false));
    void load();
    const timer = window.setInterval(() => { if (document.visibilityState === "visible") void load().catch(() => undefined); }, 30000);
    return () => window.clearInterval(timer);
  }, []);

  const money = (n: number) => `₹${Number(n).toLocaleString("en-IN")}`;

  if (loading) return <p className="text-sm text-slate-500">Loading…</p>;

  return (
    <div>
    <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-5">
      {[
        ["Referred", String(summary.referred)],
        ["Converted", String(summary.converted)],
        ["Commission pending", money(summary.pending)],
        ["Approved", money(summary.approved)],
        ["Paid", money(summary.paid)],
      ].map(([label, value]) => (
        <div key={label} className="rounded-xl border border-slate-200 bg-white px-4 py-3">
          <p className="text-xs text-slate-500">{label}</p>
          <p className="mt-0.5 text-lg font-semibold text-navy-900">{value}</p>
        </div>
      ))}
    </div>
    <div className="rounded-2xl border border-slate-200 bg-white">
      <div className="flex flex-wrap items-baseline gap-2 border-b border-slate-100 px-5 py-4">
        <h1 className="font-semibold text-navy-900">Students you referred</h1>
        <span className="text-sm text-slate-500">{rows.length} total</span>
        {!statusVisible && rows.length > 0 ? (
          <span className="ml-auto text-xs text-slate-500">
            Progress updates are switched off for your account — ask the Fly Masters team to enable them.
          </span>
        ) : null}
      </div>

      {rows.length === 0 ? (
        <p className="px-5 py-10 text-center text-sm text-slate-500">
          No referrals yet. Share your link or your code and they will appear here.
        </p>
      ) : (
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-100 text-left text-xs uppercase tracking-wide text-slate-500">
              <th className="px-5 py-2">Student</th>
              <th className="px-5 py-2">Interest</th>
              <th className="px-5 py-2">Referred</th>
              <th className="px-5 py-2">Converted</th>
              <th className="px-5 py-2">Commission</th>
              {statusVisible ? <th className="px-5 py-2">Progress</th> : null}
              {statusVisible && visibility.application ? <th className="px-5 py-2">Application</th> : null}
              {statusVisible && visibility.visa ? <th className="px-5 py-2">Visa</th> : null}
              {statusVisible && visibility.nextStep ? <th className="px-5 py-2">Next step</th> : null}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id} className="border-b border-slate-50 last:border-0">
                <td className="px-5 py-3 font-medium text-navy-900">{row.name}</td>
                <td className="px-5 py-3 text-slate-600">{row.country || "—"}</td>
                <td className="px-5 py-3 text-slate-600">
                  {new Date(row.referredOn).toLocaleDateString("en-IN")}
                </td>
                <td className="px-5 py-3">
                  {row.converted
                    ? <span className="rounded-full bg-emerald-50 px-2 py-1 text-xs font-medium text-emerald-800">Converted</span>
                    : <span className="rounded-full bg-slate-100 px-2 py-1 text-xs text-slate-600">Enquiry</span>}
                </td>
                <td className="px-5 py-3 text-slate-700">
                  {row.commission
                    ? <>{money(row.commission.amount)} <span className="ml-1 rounded bg-amber-50 px-1.5 py-0.5 text-[11px] capitalize text-amber-800">{row.commission.status}</span></>
                    : <span className="text-xs text-slate-400">{row.converted ? "—" : "after conversion"}</span>}
                </td>
                {statusVisible ? (
                  <td className="px-5 py-3">
                    <span className={`rounded-full px-2 py-1 text-xs ${STAGE_TONE[row.stage || "New"] || STAGE_TONE.New}`}>
                      {row.stage}
                    </span>
                  </td>
                ) : null}
                {statusVisible && visibility.application ? (
                  <td className="px-5 py-3">
                    {row.applicationStatus
                      ? <StatusChip label={row.applicationStatus.label} color={row.applicationStatus.color} />
                      : <span className="text-xs text-slate-400">—</span>}
                  </td>
                ) : null}
                {statusVisible && visibility.visa ? (
                  <td className="px-5 py-3">
                    {row.visaStatus
                      ? <StatusChip label={row.visaStatus.label} color={row.visaStatus.color} />
                      : <span className="text-xs text-slate-400">—</span>}
                  </td>
                ) : null}
                {statusVisible && visibility.nextStep ? (
                  <td className="px-5 py-3">
                    {row.nextStep && <StatusChip label={row.nextStep.label} color={row.nextStep.color} />}
                    {row.nextStepNote && <p className="mt-1 text-xs text-slate-600">{row.nextStepNote}</p>}
                    {!row.nextStep && !row.nextStepNote && <span className="text-xs text-slate-400">—</span>}
                  </td>
                ) : null}
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
    </div>
  );
}
