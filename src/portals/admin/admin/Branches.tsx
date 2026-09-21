import { FormEvent, useEffect, useState } from "react";
import { Building2 } from "lucide-react";
import { api } from "@admin/lib/api";
import { useAuth } from "@admin/context/AuthContext";
import type { Branch } from "@admin/lib/types";
import { Button } from "@admin/components/ui/Button";
import { Card } from "@admin/components/ui/Card";
import { Input, Label } from "@admin/components/ui/Field";

/**
 * Branch management.
 *
 * The code is generated from the place — Ameerpet in Hyderabad becomes
 * HYD-AME — so staff read something meaningful rather than a UUID. It is
 * suggested as you type and can be overridden; only uniqueness is enforced.
 */
export default function Branches() {
  const { user } = useAuth();
  const [branches, setBranches] = useState<Branch[]>([]);
  const [name, setName] = useState("");
  const [city, setCity] = useState("");
  const [area, setArea] = useState("");
  const [code, setCode] = useState("");
  const [codeTouched, setCodeTouched] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const canManage = user?.role === "admin" || user?.role === "super_admin";

  const load = () =>
    api<{ branches: Branch[] }>("/branches")
      .then((data) => setBranches(data.branches))
      .catch((err) => setError(err instanceof Error ? err.message : "Could not load branches"));

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

  const create = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError("");
    setBusy(true);
    try {
      await api("/branches", {
        method: "POST",
        body: { name: name.trim(), city: city.trim(), area: area.trim(), code: code.trim() },
      });
      setName(""); setCity(""); setArea(""); setCode(""); setCodeTouched(false);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create branch");
    } finally {
      setBusy(false);
    }
  };

  const toggleActive = async (branch: Branch) => {
    await api(`/branches/${branch.id}`, { method: "PATCH", body: { is_active: !branch.is_active } });
    await load();
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        <Building2 className="h-5 w-5 text-sky-600" />
        <h1 className="text-xl font-semibold text-navy-900">Branches</h1>
      </div>

      {canManage && (
        <Card>
          <h2 className="mb-4 text-sm font-semibold text-navy-900">Add a branch</h2>
          <form onSubmit={create} className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <div>
              <Label>Branch name</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Ameerpet" required />
            </div>
            <div>
              <Label>City</Label>
              <Input value={city} onChange={(e) => setCity(e.target.value)} placeholder="Hyderabad" />
            </div>
            <div>
              <Label>Area (optional)</Label>
              <Input value={area} onChange={(e) => setArea(e.target.value)} placeholder="Ameerpet" />
            </div>
            <div>
              <Label>Code</Label>
              <Input
                value={code}
                onChange={(e) => { setCodeTouched(true); setCode(e.target.value.toUpperCase()); }}
                placeholder="HYD-AME"
              />
              <p className="mt-1 text-xs text-slate-500">
                {codeTouched ? "Your own code." : "Suggested from the name and city. Edit to override."}
              </p>
            </div>
            <div className="sm:col-span-2 lg:col-span-4">
              <Button type="submit" disabled={busy || !name.trim()}>
                {busy ? "Saving…" : "Create branch"}
              </Button>
            </div>
          </form>
          {error ? <p className="mt-3 text-sm text-red-700">{error}</p> : null}
        </Card>
      )}

      <Card>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-500">
              <th className="pb-2">Branch</th>
              <th className="pb-2">Code</th>
              <th className="pb-2">City</th>
              <th className="pb-2 text-right">Staff</th>
              <th className="pb-2 text-right">Leads</th>
              <th className="pb-2 text-right">Status</th>
            </tr>
          </thead>
          <tbody>
            {branches.map((branch) => (
              <tr key={branch.id} className="border-b border-slate-100 last:border-0">
                <td className="py-3 font-medium text-navy-900">
                  {branch.name}
                  {branch.is_head_office ? (
                    <span className="ml-2 rounded bg-gold-400/20 px-1.5 py-0.5 text-[11px] text-navy-800">
                      Head office
                    </span>
                  ) : null}
                </td>
                <td className="py-3 font-mono text-xs text-slate-600">{branch.code}</td>
                <td className="py-3 text-slate-600">{branch.city || "—"}</td>
                <td className="py-3 text-right text-slate-600">{branch.staff_count ?? 0}</td>
                <td className="py-3 text-right text-slate-600">{branch.lead_count ?? 0}</td>
                <td className="py-3 text-right">
                  {canManage && !branch.is_head_office ? (
                    <button
                      type="button"
                      onClick={() => void toggleActive(branch)}
                      className={`rounded-full px-2 py-1 text-xs ${
                        branch.is_active ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-500"
                      }`}
                    >
                      {branch.is_active ? "Active" : "Inactive"}
                    </button>
                  ) : (
                    <span className="text-xs text-slate-500">{branch.is_active ? "Active" : "Inactive"}</span>
                  )}
                </td>
              </tr>
            ))}
            {branches.length === 0 ? (
              <tr><td colSpan={6} className="py-6 text-center text-slate-500">No branches yet.</td></tr>
            ) : null}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
