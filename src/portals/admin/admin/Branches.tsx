import { FormEvent, useEffect, useMemo, useState } from "react";
import { Building2, MapPin, Plus, Users, PhoneCall } from "lucide-react";
import { api } from "@admin/lib/api";
import { useAuth } from "@admin/context/AuthContext";
import type { Branch } from "@admin/lib/types";
import { Button } from "@admin/components/ui/Button";
import { Card } from "@admin/components/ui/Card";
import { Input, Label } from "@admin/components/ui/Field";

/**
 * Branch management.
 *
 * The code is generated from the place (Ameerpet in Hyderabad becomes HYD-AME) so staff read something
 * meaningful rather than a UUID. It is suggested as you type and can be overridden; only uniqueness is
 * enforced.
 *
 * Switching a branch off used to happen on a single click of its green "Active" pill, with no warning.
 * It is now a separate Deactivate button that asks for confirmation on the page, and the status pill
 * only shows the state.
 */

// "hyderabad" and "Hyderabad" were both stored; show them the same way.
const titleCase = (value?: string | null) =>
  (value || "").trim().replace(/\s+/g, " ").replace(/\b\p{L}/gu, (c) => c.toUpperCase());

export default function Branches() {
  const { user } = useAuth();
  const [branches, setBranches] = useState<Branch[]>([]);
  const [loading, setLoading] = useState(true);
  const [name, setName] = useState("");
  const [city, setCity] = useState("");
  const [area, setArea] = useState("");
  const [code, setCode] = useState("");
  const [codeTouched, setCodeTouched] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [created, setCreated] = useState("");
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  const [togglingId, setTogglingId] = useState<string | null>(null);
  const [listError, setListError] = useState("");

  const canManage = user?.role === "admin" || user?.role === "super_admin";

  const load = () =>
    api<{ branches: Branch[] }>("/branches")
      .then((data) => setBranches(data.branches))
      .catch((err) => setListError(err instanceof Error ? err.message : "Could not load branches."))
      .finally(() => setLoading(false));

  useEffect(() => {
    void load();
  }, []);

  // Preview the code the server would allocate, as the person types.
  useEffect(() => {
    if (codeTouched || (!name && !city && !area)) return;
    const params = new URLSearchParams({ name, city, area });
    void api<{ code: string }>(`/branches/suggest-code?${params.toString()}`)
      .then((data) => setCode(data.code))
      .catch(() => undefined);
  }, [name, city, area, codeTouched]);

  const sorted = useMemo(
    () =>
      [...branches].sort(
        (a, b) =>
          Number(b.is_head_office) - Number(a.is_head_office) ||
          Number(b.is_active) - Number(a.is_active) ||
          a.name.localeCompare(b.name),
      ),
    [branches],
  );
  const totals = useMemo(
    () => ({
      active: branches.filter((b) => b.is_active).length,
      staff: branches.reduce((sum, b) => sum + (b.staff_count ?? 0), 0),
      leads: branches.reduce((sum, b) => sum + (b.lead_count ?? 0), 0),
    }),
    [branches],
  );

  const create = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError("");
    setCreated("");
    setBusy(true);
    try {
      await api("/branches", {
        method: "POST",
        body: { name: name.trim(), city: city.trim(), area: area.trim(), code: code.trim() },
      });
      setCreated(`${titleCase(name)} was created.`);
      setName(""); setCity(""); setArea(""); setCode(""); setCodeTouched(false);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create the branch.");
    } finally {
      setBusy(false);
    }
  };

  const setActive = async (branch: Branch, active: boolean) => {
    setTogglingId(branch.id);
    setListError("");
    try {
      await api(`/branches/${branch.id}`, { method: "PATCH", body: { is_active: active } });
      setConfirmingId(null);
      await load();
    } catch (err) {
      setListError(err instanceof Error ? err.message : "Could not change this branch.");
    } finally {
      setTogglingId(null);
    }
  };

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold text-navy-900">
            <Building2 className="h-6 w-6 text-sky-600" /> Branches
          </h1>
          <p className="mt-1 text-sm text-slate-600">
            Each branch keeps its own staff, leads and students. Staff work only in the branches they are given.
          </p>
        </div>
        {!loading && branches.length > 0 && (
          <dl className="flex flex-wrap gap-2 text-sm">
            <div className="rounded-xl border border-slate-200 bg-white px-3 py-2">
              <dt className="text-xs text-slate-500">Active branches</dt>
              <dd className="font-semibold tabular-nums text-navy-900">{totals.active} of {branches.length}</dd>
            </div>
            <div className="rounded-xl border border-slate-200 bg-white px-3 py-2">
              <dt className="text-xs text-slate-500">Staff</dt>
              <dd className="font-semibold tabular-nums text-navy-900">{totals.staff}</dd>
            </div>
            <div className="rounded-xl border border-slate-200 bg-white px-3 py-2">
              <dt className="text-xs text-slate-500">Leads</dt>
              <dd className="font-semibold tabular-nums text-navy-900">{totals.leads}</dd>
            </div>
          </dl>
        )}
      </header>

      {canManage && (
        <Card className="p-5 sm:p-6">
          <div className="mb-5">
            <h2 className="text-base font-semibold text-navy-900">Add a branch</h2>
            <p className="mt-0.5 text-sm text-slate-500">The code is suggested from the name and city. You can change it.</p>
          </div>
          <form onSubmit={create} className="grid gap-x-4 gap-y-5 sm:grid-cols-2 lg:grid-cols-4">
            <div className="min-w-0">
              <Label>Branch name</Label>
              <Input id="branch-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Ameerpet" required />
            </div>
            <div className="min-w-0">
              <Label>City</Label>
              <Input id="branch-city" value={city} onChange={(e) => setCity(e.target.value)} placeholder="Hyderabad" />
            </div>
            <div className="min-w-0">
              <Label>Area (optional)</Label>
              <Input id="branch-area" value={area} onChange={(e) => setArea(e.target.value)} placeholder="Ameerpet" />
            </div>
            <div className="min-w-0">
              <Label>Code</Label>
              <Input
                id="branch-code"
                className="font-mono uppercase"
                value={code}
                onChange={(e) => { setCodeTouched(true); setCode(e.target.value.toUpperCase()); }}
                placeholder="HYD-AME"
              />
              <p className="mt-1.5 text-xs text-slate-500">
                {codeTouched ? "Your own code." : "Suggested automatically."}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-3 sm:col-span-2 lg:col-span-4">
              <Button type="submit" disabled={busy || !name.trim()}>
                <Plus className="h-4 w-4" />
                {busy ? "Creating…" : "Create branch"}
              </Button>
              {error && <p role="alert" className="text-sm font-medium text-rose-700">{error}</p>}
              {created && !error && <p role="status" className="text-sm font-medium text-emerald-700">{created}</p>}
            </div>
          </form>
        </Card>
      )}

      <Card className="overflow-hidden p-0">
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
          <h2 className="text-base font-semibold text-navy-900">All branches</h2>
          {listError && <p role="alert" className="text-sm font-medium text-rose-700">{listError}</p>}
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-sm">
            <thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
              <tr>
                <th scope="col" className="px-5 py-3">Branch</th>
                <th scope="col" className="px-5 py-3">Code</th>
                <th scope="col" className="px-5 py-3">City</th>
                <th scope="col" className="px-5 py-3 text-right">Staff</th>
                <th scope="col" className="px-5 py-3 text-right">Leads</th>
                <th scope="col" className="px-5 py-3">Status</th>
                {canManage && <th scope="col" className="px-5 py-3 text-right"><span className="sr-only">Actions</span></th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading && (
                <tr><td colSpan={7} className="px-5 py-8 text-center text-slate-500">Loading branches…</td></tr>
              )}
              {!loading && sorted.length === 0 && (
                <tr><td colSpan={7} className="px-5 py-8 text-center text-slate-500">No branches yet. Add the first one above.</td></tr>
              )}
              {sorted.map((branch) => {
                // The City column already shows the city, so only the area goes under the name.
                const place = titleCase(branch.area);
                return (
                  <tr key={branch.id} className={`align-middle transition hover:bg-slate-50/70 ${branch.is_active ? "" : "bg-slate-50/50"}`}>
                    <td className="px-5 py-3.5">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className={`font-semibold ${branch.is_active ? "text-navy-900" : "text-slate-500"}`}>{titleCase(branch.name)}</span>
                        {branch.is_head_office && (
                          <span className="rounded-md bg-amber-100 px-1.5 py-0.5 text-[11px] font-medium text-amber-800">Head office</span>
                        )}
                      </div>
                      {place && place !== titleCase(branch.name) && (
                        <p className="mt-0.5 flex items-center gap-1 text-xs text-slate-500"><MapPin className="h-3 w-3" /> {place}</p>
                      )}
                    </td>
                    <td className="px-5 py-3.5">
                      <span className="rounded-md bg-slate-100 px-2 py-1 font-mono text-xs text-slate-700">{branch.code}</span>
                    </td>
                    <td className="px-5 py-3.5 text-slate-700">{titleCase(branch.city) || "—"}</td>
                    <td className="px-5 py-3.5 text-right tabular-nums text-slate-700">
                      <span className="inline-flex items-center gap-1.5"><Users className="h-3.5 w-3.5 text-slate-400" />{branch.staff_count ?? 0}</span>
                    </td>
                    <td className="px-5 py-3.5 text-right tabular-nums text-slate-700">
                      <span className="inline-flex items-center gap-1.5"><PhoneCall className="h-3.5 w-3.5 text-slate-400" />{branch.lead_count ?? 0}</span>
                    </td>
                    <td className="px-5 py-3.5">
                      <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ${
                        branch.is_active ? "bg-emerald-50 text-emerald-700" : "bg-slate-200 text-slate-600"
                      }`}>
                        <span className={`h-1.5 w-1.5 rounded-full ${branch.is_active ? "bg-emerald-500" : "bg-slate-400"}`} />
                        {branch.is_active ? "Active" : "Inactive"}
                      </span>
                    </td>
                    {canManage && (
                      <td className="px-5 py-3.5 text-right">
                        {branch.is_head_office ? (
                          <span className="text-xs text-slate-400">Always active</span>
                        ) : confirmingId === branch.id ? (
                          <div role="group" aria-label={`Confirm deactivating ${branch.name}`} className="inline-flex flex-wrap items-center justify-end gap-2">
                            <span className="text-xs text-rose-800">
                              Deactivate? {branch.staff_count ?? 0} staff and {branch.lead_count ?? 0} leads stay as they are.
                            </span>
                            <Button size="sm" variant="danger" disabled={togglingId === branch.id} onClick={() => void setActive(branch, false)}>
                              {togglingId === branch.id ? "Saving…" : "Yes, deactivate"}
                            </Button>
                            <Button size="sm" variant="secondary" disabled={togglingId === branch.id} onClick={() => setConfirmingId(null)}>Cancel</Button>
                          </div>
                        ) : branch.is_active ? (
                          <Button size="sm" variant="ghost" onClick={() => setConfirmingId(branch.id)}>Deactivate</Button>
                        ) : (
                          <Button size="sm" variant="secondary" disabled={togglingId === branch.id} onClick={() => void setActive(branch, true)}>
                            {togglingId === branch.id ? "Saving…" : "Activate"}
                          </Button>
                        )}
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
