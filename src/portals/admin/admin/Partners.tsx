import { FormEvent, useEffect, useState } from "react";
import { useAutoRefresh } from "@shared/hooks/useAutoRefresh";
import { Handshake, KeyRound, Eye } from "lucide-react";
import { useCopy } from "@shared/hooks/useCopy";
import { api } from "@admin/lib/api";
import { useAuth } from "@admin/context/AuthContext";
import type { Branch } from "@admin/lib/types";
import DeleteButton from "@admin/components/DeleteButton";
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
  const { state: copyStatus, copy: copyLink } = useCopy();
  const [copiedId, setCopiedId] = useState("");
  const copyState = { id: copiedId, state: copyStatus };
  const copy = async (text: string, id: string) => {
    setCopiedId(id);
    await copyLink(text);
  };
  // CRM 2.6.2 — status visibility is configurable per agent account, not
  // globally. Defaults are "show", so nothing changes for existing agents
  // until a Super Admin deliberately turns something off.
  const [visibilityFor, setVisibilityFor] = useState<Partner | null>(null);

  const [rows, setRows] = useState<Partner[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [activating, setActivating] = useState<Partner | null>(null);
  // Errors inside the two dialogs are shown in the dialog, not as browser pop-ups.
  const [dialogError, setDialogError] = useState("");
  const [created, setCreated] = useState("");

  const load = () => api<{ partners: Partner[] }>("/partners").then((d) => setRows(d.partners));
  useAutoRefresh(load);

  useEffect(() => {
    void load().catch((e) => setError(e instanceof Error ? e.message : "Could not load partners"));
    void api<{ branches: Branch[] }>("/branches")
      .then((d) => setBranches(d.branches.filter((b) => b.is_active)))
      .catch(() => setBranches([]));
  }, []);

  const create = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const formEl = event.currentTarget;
    const form = new FormData(event.currentTarget);
    setError(""); setCreated(""); setBusy(true);
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
      formEl.reset();
      setCreated(`${String(form.get("fullName"))} was added. Copy their referral link from the list below.`);
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
    setDialogError("");
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
      setDialogError(err instanceof Error ? err.message : "Could not activate login");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold text-navy-900">
            <Handshake className="h-6 w-6 text-sky-600" /> Agents &amp; Freelancers
          </h1>
          <p className="mt-1 max-w-2xl text-sm text-slate-600">
            Partners who refer students. Each gets a referral link straight away; a login is separate and only a
            Super Admin can issue one.
          </p>
        </div>
        {rows.length > 0 && (
          <dl className="flex flex-wrap gap-2 text-sm">
            <div className="rounded-xl border border-slate-200 bg-white px-3 py-2">
              <dt className="text-xs text-slate-500">Partners</dt>
              <dd className="font-semibold tabular-nums text-navy-900">{rows.length}</dd>
            </div>
            <div className="rounded-xl border border-slate-200 bg-white px-3 py-2">
              <dt className="text-xs text-slate-500">Students referred</dt>
              <dd className="font-semibold tabular-nums text-navy-900">{rows.reduce((n, p) => n + (p.referred_count || 0), 0)}</dd>
            </div>
            <div className="rounded-xl border border-slate-200 bg-white px-3 py-2">
              <dt className="text-xs text-slate-500">With a login</dt>
              <dd className="font-semibold tabular-nums text-navy-900">{rows.filter((p) => p.login_enabled).length}</dd>
            </div>
          </dl>
        )}
      </header>

      <Card className="p-5 sm:p-6">
        <div className="mb-5">
          <h2 className="text-base font-semibold text-navy-900">Add a partner</h2>
          <p className="mt-0.5 text-sm text-slate-500">A referral code is created automatically when you add them.</p>
        </div>
        <form onSubmit={create} className="space-y-6">
          <fieldset className="grid gap-x-4 gap-y-5 sm:grid-cols-2 lg:grid-cols-4">
            <legend className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-500">Who they are</legend>
            <div className="min-w-0"><Label>Full name</Label><Input name="fullName" required placeholder="Rajesh Kumar" /></div>
            <div className="min-w-0"><Label>Business name (optional)</Label><Input name="businessName" placeholder="Kumar Overseas" /></div>
            <div className="min-w-0">
              <Label>Type</Label>
              <Select name="type" defaultValue="agent">
                <option value="agent">Agent</option>
                <option value="freelancer">Freelancer</option>
              </Select>
            </div>
            <div className="min-w-0">
              <Label>Branch</Label>
              <Select name="branchId" defaultValue="">
                <option value="">Choose a branch</option>
                {branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
              </Select>
            </div>
            <div className="min-w-0"><Label>Email</Label><Input name="email" type="email" placeholder="name@example.com" /></div>
            <div className="min-w-0"><Label>Phone</Label><Input name="phone" inputMode="tel" placeholder="98765 43210" /></div>
          </fieldset>
          <fieldset className="grid gap-x-4 gap-y-5 border-t border-slate-100 pt-5 sm:grid-cols-2 lg:grid-cols-4">
            <legend className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-500">Commission</legend>
            <div className="min-w-0">
              <Label>Commission basis</Label>
              <Select name="commissionBasis" defaultValue="per_enrollment">
                <option value="per_enrollment">Flat, per enrolment</option>
                <option value="per_lead">Flat, per lead</option>
                <option value="percent_of_fee">Percentage of fee</option>
              </Select>
            </div>
            <div className="min-w-0">
              <Label>Rate</Label>
              <Input name="commissionRate" type="number" step="0.01" min="0" defaultValue="0" />
              <p className="mt-1.5 text-xs text-slate-500">Rupees for a flat amount, percent for a percentage.</p>
            </div>
          </fieldset>
          <div className="flex flex-wrap items-center gap-3">
            <Button type="submit" disabled={busy}>{busy ? "Adding…" : "Add partner"}</Button>
            {error && <p role="alert" className="text-sm font-medium text-rose-700">{error}</p>}
            {created && !error && <p role="status" className="text-sm font-medium text-emerald-700">{created}</p>}
          </div>
        </form>
      </Card>

      <Card className="overflow-hidden p-0">
        <div className="border-b border-slate-100 px-5 py-4">
          <h2 className="text-base font-semibold text-navy-900">All partners</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[860px] text-sm">
            <thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
              <tr>
                <th scope="col" className="px-5 py-3">Partner</th>
                <th scope="col" className="px-5 py-3">Referral code</th>
                <th scope="col" className="px-5 py-3">Branch</th>
                <th scope="col" className="px-5 py-3">Commission</th>
                <th scope="col" className="px-5 py-3 text-right">Referred</th>
                <th scope="col" className="px-5 py-3">Login</th>
                {isSuperAdmin && <th scope="col" className="px-5 py-3 text-right"><span className="sr-only">Actions</span></th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.map((p) => (
                <tr key={p.id} className="align-middle transition hover:bg-slate-50/70">
                  <td className="px-5 py-3.5">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-semibold text-navy-900">{p.business_name || p.full_name}</span>
                      <span className={`rounded-md px-1.5 py-0.5 text-[11px] font-medium capitalize ${p.type === "agent" ? "bg-sky-50 text-sky-700" : "bg-violet-50 text-violet-700"}`}>
                        {p.type}
                      </span>
                    </div>
                    {p.business_name && p.full_name && p.business_name !== p.full_name ? (
                      <p className="mt-0.5 text-xs text-slate-500">{p.full_name}</p>
                    ) : null}
                    {p.email ? <p className="mt-0.5 text-xs text-slate-500">{p.email}</p> : null}
                  </td>
                  <td className="px-5 py-3.5">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="rounded-md bg-slate-100 px-2 py-1 font-mono text-xs text-slate-700">{p.referral_code}</span>
                      <button
                        type="button"
                        onClick={() => void copy(`${window.location.origin}/r/${p.referral_code}`, p.id)}
                        className="rounded-md border border-slate-200 px-2 py-1 text-xs font-medium text-sky-700 hover:bg-sky-50"
                      >
                        {copyState.id === p.id && copyState.state === "copied" ? "Link copied" : copyState.id === p.id && copyState.state === "failed" ? "Copy failed" : "Copy link"}
                      </button>
                    </div>
                  </td>
                  <td className="px-5 py-3.5 text-slate-700">{p.branch_name || <span className="text-slate-400">No branch</span>}</td>
                  <td className="px-5 py-3.5 text-slate-700">
                    <span className="font-medium tabular-nums">
                      {p.commission_basis === "percent_of_fee"
                        ? `${Number(p.commission_rate)}%`
                        : `₹${Number(p.commission_rate).toLocaleString("en-IN")}`}
                    </span>
                    <span className="ml-1 text-xs text-slate-500">{BASIS_LABEL[p.commission_basis]}</span>
                  </td>
                  <td className="px-5 py-3.5 text-right tabular-nums text-slate-700">
                    <span className="font-medium">{p.referred_count}</span>
                    {p.pending_commissions > 0 ? (
                      <span className="ml-2 rounded-md bg-amber-50 px-1.5 py-0.5 text-[11px] font-medium text-amber-800">
                        {p.pending_commissions} pending
                      </span>
                    ) : null}
                  </td>
                  <td className="px-5 py-3.5">
                    <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ${
                      p.login_enabled ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-600"
                    }`}>
                      <span className={`h-1.5 w-1.5 rounded-full ${p.login_enabled ? "bg-emerald-500" : "bg-slate-400"}`} />
                      {p.login_enabled ? "Login active" : "No login"}
                    </span>
                  </td>
                  {isSuperAdmin && (
                    <td className="px-5 py-3.5">
                      <div className="flex flex-wrap items-center justify-end gap-2">
                        {p.login_enabled ? (
                          <button
                            type="button"
                            onClick={() => { setDialogError(""); setVisibilityFor(p); }}
                            className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-medium text-navy-900 hover:bg-slate-50"
                            title="Choose what this partner sees about their students"
                          >
                            <Eye className="h-3.5 w-3.5" /> Visibility
                          </button>
                        ) : (
                          <button
                            type="button"
                            onClick={() => { setDialogError(""); setActivating(p); }}
                            className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-medium text-navy-900 hover:bg-slate-50"
                          >
                            <KeyRound className="h-3.5 w-3.5" /> Give login
                          </button>
                        )}
                        <DeleteButton kind="partner" id={p.id} name={p.business_name || p.full_name} onDeleted={() => void load()} />
                      </div>
                    </td>
                  )}
                </tr>
              ))}
              {rows.length === 0 ? (
                <tr><td colSpan={7} className="px-5 py-8 text-center text-slate-500">No partners yet. Add the first one above.</td></tr>
              ) : null}
            </tbody>
          </table>
        </div>
        {!isSuperAdmin && rows.length > 0 && (
          <p className="border-t border-slate-100 px-5 py-3 text-xs text-slate-500">Only a Super Admin can give a partner a login or change what they see.</p>
        )}
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
            {dialogError && <p role="alert" className="mt-4 text-sm font-medium text-rose-700">{dialogError}</p>}
            <div className="mt-5 flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setVisibilityFor(null)}>Cancel</Button>
              <Button
                onClick={async () => {
                  try {
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
                  } catch (err) {
                    setDialogError(err instanceof Error ? err.message : "Could not save what this partner can see.");
                  }
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
          <Card className="w-full max-w-md p-5 sm:p-6">
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
              {dialogError && <p role="alert" className="text-sm font-medium text-rose-700">{dialogError}</p>}
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
