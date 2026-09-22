import { useEffect, useState } from "react";
import { api, type Referral } from "@partner/lib/api";

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
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    void api<{ referrals: Referral[]; statusVisible: boolean }>("/referrals")
      .then((d) => { setRows(d.referrals); setStatusVisible(d.statusVisible); })
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <p className="text-sm text-slate-500">Loading…</p>;

  return (
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
              {statusVisible ? <th className="px-5 py-2">Progress</th> : null}
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
                {statusVisible ? (
                  <td className="px-5 py-3">
                    <span className={`rounded-full px-2 py-1 text-xs ${STAGE_TONE[row.stage || "New"] || STAGE_TONE.New}`}>
                      {row.stage}
                    </span>
                  </td>
                ) : null}
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
