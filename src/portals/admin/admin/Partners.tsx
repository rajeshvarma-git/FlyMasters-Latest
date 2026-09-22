import { FormEvent, useEffect, useState } from "react";
import { Handshake, KeyRound, Eye } from "lucide-react";
import { api } from "@admin/lib/api";
import { useAuth } from "@admin/context/AuthContext";
import type { Branch } from "@admin/lib/types";
import { Button } from "@admin/components/ui/Button";
import { Card } from "@admin/components/ui/Card";
import { Input, Label, Select } from "@admin/components/ui/Field";

interface Partner {
  id: string;
  type: "agent" | "freelancer";
  full_name: string;
  business_name: string | null;
  email: string | null;
  phone: string | null;
  referral_code: string;
  commission_rate: string;
  commission_basis: string;
  branch_name: string | null;
  branch_code: string | null;
  is_active: boolean;
  login_enabled: boolean;
  can_view_student_status: boolean;
  show_application_status: boolean;
  show_visa_status: boolean;
  show_next_step: boolean;
  show_document_status: boolean;
  verification_status: string;
  referred_count: number;
  pending_commissions: number;
}

const BASIS_LABEL: Record<string, string> = {
  per_lead: "per lead",
  per_enrollment: "per enrolment",
  percent_of_fee: "% of fee",
};

/**
 * Agents and Freelancers — one screen, two types.
 *
 * Any admin can add a partner and issue their referral code. Only a Super
 * Admin can give them a LOGIN, which is the client's rule and also the moment
 * an external person gains access to data.
 */
export default function Partners() {
  const { user } = useAuth();
  const isSuperAdmin = user?.role === "super_admin";
  // CRM 2.6.2 — status visibility is configurable per agent account, not
  // globally. Defaults are "show", so nothing changes for existing agents
  // until a Super Admin deliberately turns something off.
  const [visibilityFor, setVisibilityFor] = useState<Partner | null>(null);

  const [rows, setRows] = useState<Partner[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [activating, setActivating] = useState<Partner | null>(null);

  const load = () => api<{ partners: Partner[] }>("/partners").then((d) => setRows(d.partners));

  useEffect(() => {
    void load().catch((e) => setError(e instanceof Error ? e.message : "Could not load partners"));
    void api<{ branches: Branch[] }>("/branches")
      .then((d) => setBranches(d.branches.filter((b) => b.is_active)))
      .catch(() => setBranches([]));
  }, []);

  const create = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setError(""); setBusy(true);
    try {
      await api("/partners", {
        method: "POST",
        body: {
          fullName: String(form.get("fullName")),
          businessName: String(form.get("businessName") || ""),
          type: String(form.get("type")),
          email: String(form.get("email") || ""),
          phone: String(form.get("phone") || ""),
          branchId: String(form.get("branchId") || "") || undefined,
          commissionBasis: String(form.get("commissionBasis")),
          commissionRate: Number(form.get("commissionRate") || 0),
        },
      });
      event.currentTarget.reset();
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create partner");
    } finally {
      setBusy(false);
    }
  };

  const activate = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!activating) return;
    const form = new FormData(event.currentTarget);
    setBusy(true);
    try {
      await api(`/partners/${activating.id}/login`, {
        method: "PUT",
        body: {
          email: String(form.get("email")),
          password: String(form.get("password")),
          canViewStudentStatus: form.get("canViewStatus") === "on",
        },
      });
      setActivating(null);
      await load();
    } catch (err) {
      window.alert(err instanceof Error ? err.message : "Could not activate login");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        <Handshake className="h-5 w-5 text-sky-600" />
        <h1 className="text-xl font-semibold text-navy-900">Agents &amp; Freelancers</h1>
      </div>

      <Card>
        <h2 className="mb-1 text-sm font-semibold text-navy-900">Add a partner</h2>
        <p className="mb-4 text-xs text-slate-600">
          A referral code is generated automatically. The partner can start referring straight away —
          a login is separate, and only a Super Admin can issue one.
        </p>
        <form onSubmit={create} className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div><Label>Full name</Label><Input name="fullName" required placeholder="Rajesh Kumar" /></div>
          <div><Label>Business name</Label><Input name="businessName" placeholder="optional" /></div>
          <div>
            <Label>Type</Label>
            <Select name="type" defaultValue="agent">
              <option value="agent">Agent</option>
              <option value="freelancer">Freelancer</option>
            </Select>
          </div>
          <div>
            <Label>Branch</Label>
            <Select name="branchId">
              <option value="">— select —</option>
              {branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
            </Select>
          </div>
          <div><Label>Email</Label><Input name="email" type="email" /></div>
          <div><Label>Phone</Label><Input name="phone" /></div>
          <div>
            <Label>Commission basis</Label>
            <Select name="commissionBasis" defaultValue="per_enrollment">
              <option value="per_enrollment">Flat, per enrolment</option>
              <option value="per_lead">Flat, per lead</option>
              <option value="percent_of_fee">Percentage of fee</option>
            </Select>
          </div>
          <div>
            <Label>Rate</Label>
            <Input name="commissionRate" type="number" step="0.01" min="0" defaultValue="0" />
            <p className="mt-1 text-xs text-slate-500">₹ for flat, % for percentage</p>
          </div>
          <div className="sm:col-span-2 lg:col-span-4">
            <Button type="submit" disabled={busy}>{busy ? "Saving…" : "Add partner"}</Button>
          </div>
        </form>
        {error ? <p className="mt-3 text-sm text-red-700">{error}</p> : null}
      </Card>

      <Card>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-500">
              <th className="pb-2">Partner</th>
              <th className="pb-2">Code</th>
              <th className="pb-2">Branch</th>
              <th className="pb-2">Commission</th>
              <th className="pb-2 text-right">Referred</th>
              <th className="pb-2 text-right">Login</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((p) => (
              <tr key={p.id} className="border-b border-slate-100 last:border-0">
                <td className="py-3">
                  <span className="font-medium text-navy-900">{p.business_name || p.full_name}</span>
                  <span className="ml-2 rounded bg-slate-100 px-1.5 py-0.5 text-[11px] capitalize text-slate-600">
                    {p.type}
                  </span>
                  {p.email ? <p className="text-xs text-slate-500">{p.email}</p> : null}
                </td>
                <td className="py-3 font-mono text-xs text-slate-700">{p.referral_code}</td>
                <td className="py-3 text-slate-600">{p.branch_name || "—"}</td>
                <td className="py-3 text-slate-600">
                  {p.commission_basis === "percent_of_fee"
                    ? `${Number(p.commission_rate)}%`
                    : `₹${Number(p.commission_rate).toLocaleString("en-IN")}`}
                  <span className="ml-1 text-xs text-slate-400">{BASIS_LABEL[p.commission_basis]}</span>
                </td>
                <td className="py-3 text-right text-slate-600">
                  {p.referred_count}
                  {p.pending_commissions > 0 ? (
                    <span className="ml-2 rounded bg-amber-50 px-1.5 py-0.5 text-[11px] text-amber-800">
                      {p.pending_commissions} pending
                    </span>
                  ) : null}
                </td>
                <td className="py-3 text-right">
                  {p.login_enabled && isSuperAdmin ? (
                    <button
                      onClick={() => setVisibilityFor(p)}
                      className="mr-2 inline-flex items-center gap-1 rounded-lg border border-slate-300 px-2 py-1 text-xs text-navy-900"
                      title="Choose what this agent sees about their students"
                    >
                      <Eye className="h-3 w-3" /> Visibility
                    </button>
                  ) : null}
                  {p.login_enabled ? (
                    <span className="rounded-full bg-emerald-50 px-2 py-1 text-xs text-emerald-700">Active</span>
                  ) : isSuperAdmin ? (
                    <button
                      onClick={() => setActivating(p)}
                      className="flex items-center gap-1 rounded-lg border border-slate-300 px-2 py-1 text-xs text-navy-900"
                    >
                      <KeyRound className="h-3 w-3" /> Give login
                    </button>
                  ) : (
                    <span className="text-xs text-slate-400">Super Admin only</span>
                  )}
                </td>
              </tr>
            ))}
            {rows.length === 0 ? (
              <tr><td colSpan={6} className="py-6 text-center text-slate-500">No partners yet.</td></tr>
            ) : null}
          </tbody>
        </table>
      </Card>

      {visibilityFor ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-navy-950/50 p-4">
          <Card className="w-full max-w-md p-5">
            <h2 className="mb-1 font-semibold text-navy-900">
              What {visibilityFor.business_name || visibilityFor.full_name} can see
            </h2>
            <p className="mb-4 text-xs text-slate-600">
              Applies only to the students this agent referred. Turning something off hides it immediately;
              it does not affect their commissions.
            </p>
            <div className="space-y-3 text-sm text-slate-700">
              {([
                ["show_application_status", "Application status"],
                ["show_visa_status", "Visa status"],
                ["show_next_step", "Next step and the counsellor's note"],
                ["show_document_status", "Document checklist progress"],
              ] as const).map(([key, label]) => (
                <label key={key} className="flex items-center gap-3">
                  <input
                    type="checkbox"
                    checked={Boolean(visibilityFor[key])}
                    onChange={(e) => setVisibilityFor({ ...visibilityFor, [key]: e.target.checked })}
                  />
                  {label}
                </label>
              ))}
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setVisibilityFor(null)}>Cancel</Button>
              <Button
                onClick={async () => {
                  await api(`/partners/${visibilityFor.id}/visibility`, {
                    method: "PUT",
                    body: {
                      show_application_status: visibilityFor.show_application_status,
                      show_visa_status: visibilityFor.show_visa_status,
                      show_next_step: visibilityFor.show_next_step,
                      show_document_status: visibilityFor.show_document_status,
                    },
                  });
                  setVisibilityFor(null);
                  await load();
                }}
              >
                Save
              </Button>
            </div>
          </Card>
        </div>
      ) : null}

      {activating ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-navy-950/50 p-4">
          <Card className="w-full max-w-md">
            <h2 className="mb-1 font-semibold text-navy-900">
              Give {activating.business_name || activating.full_name} a login
            </h2>
            <p className="mb-4 text-xs text-slate-600">
              This lets an external person sign in. They will see only the students they referred.
            </p>
            <form onSubmit={activate} className="space-y-3">
              <div><Label>Email</Label><Input name="email" type="email" defaultValue={activating.email || ""} required /></div>
              <div><Label>Password</Label><Input name="password" type="password" minLength={6} required /></div>
              <label className="flex items-center gap-2 text-sm text-slate-700">
                <input type="checkbox" name="canViewStatus" className="h-4 w-4" />
                Let them see each student&apos;s progress
              </label>
              <div className="flex gap-2 pt-2">
                <Button type="submit" disabled={busy}>{busy ? "Activating…" : "Activate"}</Button>
                <button type="button" onClick={() => setActivating(null)} className="px-3 text-sm text-slate-600">
                  Cancel
                </button>
              </div>
            </form>
          </Card>
        </div>
      ) : null}
    </div>
  );
}
