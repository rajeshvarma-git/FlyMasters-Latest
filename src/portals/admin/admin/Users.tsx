import { FormEvent, useEffect, useMemo, useState } from "react";
import { ChevronDown, Users } from "lucide-react";
import { api } from "@admin/lib/api";
import { refreshStore, useAdminStore } from "@admin/lib/store";
import { displayName } from "@admin/lib/utils";
import type { Branch, Role } from "@admin/lib/types";
import { Badge } from "@admin/components/ui/Badge";
import { Button } from "@admin/components/ui/Button";
import { Card } from "@admin/components/ui/Card";
import { Input, Label, Select, Textarea } from "@admin/components/ui/Field";

const ROLES: Role[] = ["student", "telecaller", "counselor", "branch_head", "accountant", "admin", "super_admin"];

/**
 * Roles an admin can create, straight from the CRM document.
 * Agents and freelancers are absent on purpose: they never sign in, so they
 * are rows in `partners`, not accounts.
 */
const CREATE_ROLES: Role[] = ["student", "telecaller", "counselor", "branch_head", "accountant"];

/** Roles whose every screen is limited to the branches they are assigned. */
const BRANCH_SCOPED: Role[] = ["branch_head", "counselor", "telecaller", "accountant"];

const ROLE_LABEL: Record<string, string> = {
  student: "Student",
  telecaller: "Tele caller",
  counselor: "Counsellor",
  branch_head: "Branch Head",
  accountant: "Accountant",
  admin: "Admin",
  super_admin: "Super Admin",
};

const label = (role: string) => ROLE_LABEL[role] || role.replace("_", " ");
const COUNSELOR_COUNTRIES = ["UK", "Canada", "Australia", "USA", "Germany", "Ireland", "New Zealand", "UAE", "Study Abroad"];

export default function UsersPage() {
  const store = useAdminStore();
  const [query, setQuery] = useState("");
  const [branches, setBranches] = useState<Branch[]>([]);
  const [selectedBranches, setSelectedBranches] = useState<string[]>([]);

  useEffect(() => {
    void api<{ branches: Branch[] }>("/branches")
      .then((data) => setBranches(data.branches.filter((b) => b.is_active)))
      .catch(() => setBranches([]));
  }, []);

  const toggleBranch = (id: string) =>
    setSelectedBranches((current) =>
      current.includes(id) ? current.filter((item) => item !== id) : [...current, id],
    );
  const [roleFilter, setRoleFilter] = useState("all");
  const [busy, setBusy] = useState(false);
  const [createRole, setCreateRole] = useState<Role>("student");
  const [counselorCountries, setCounselorCountries] = useState<string[]>([]);
  const [counselorBio, setCounselorBio] = useState("");

  const users = useMemo(() => {
    const q = query.trim().toLowerCase();
    return store.users
      .filter((user) => roleFilter === "all" || user.role === roleFilter)
      .filter((user) => `${user.first_name} ${user.last_name} ${user.email}`.toLowerCase().includes(q));
  }, [store.users, query, roleFilter]);

  const toggleCounselorCountry = (country: string) => {
    setCounselorCountries((current) =>
      current.includes(country) ? current.filter((item) => item !== country) : [...current, country],
    );
  };

  const resetCreateForm = (form: HTMLFormElement) => {
    form.reset();
    setCreateRole("student");
    setCounselorCountries([]);
    setCounselorBio("");
    setSelectedBranches([]);
  };

  const createUser = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const data = new FormData(e.currentTarget);
    const role = String(data.get("role"));
    if (role === "counselor" && counselorCountries.length === 0) {
      window.alert("Choose at least one country specialization for the counselor.");
      return;
    }
    // A branch-scoped account with no branch can see nothing at all, so this is
    // blocked here as well as on the server.
    if (BRANCH_SCOPED.includes(role as Role) && selectedBranches.length === 0) {
      window.alert(`Choose at least one branch for this ${label(role)}.`);
      return;
    }
    setBusy(true);
    try {
      await api("/users", {
        method: "POST",
        body: {
          firstName: String(data.get("firstName")),
          lastName: String(data.get("lastName")),
          email: String(data.get("email")),
          password: String(data.get("password")),
          phone: String(data.get("phone") || ""),
          role,
          branchIds: selectedBranches,
          ...(role === "counselor"
            ? {
                specializations: counselorCountries.join(", "),
                bio: counselorBio.trim(),
              }
            : {}),
        },
      });
      resetCreateForm(e.currentTarget);
      await refreshStore();
    } catch (error) {
      window.alert(error instanceof Error ? error.message : "Could not create user");
    } finally {
      setBusy(false);
    }
  };

  const setRole = async (id: string, role: string) => {
    await api(`/users/${id}/role`, { method: "PUT", body: { role } });
    await refreshStore();
  };

  const resetPassword = async (id: string) => {
    const password = window.prompt("New password (min 6 characters)");
    if (!password) return;
    try {
      await api(`/users/${id}/password`, { method: "PUT", body: { password } });
      window.alert("Password updated.");
    } catch (error) {
      window.alert(error instanceof Error ? error.message : "Could not update password");
    }
  };

  return (
    <div>
      <div className="mb-6 flex items-center gap-3">
        <Users className="h-6 w-6 text-sky-500" />
        <div>
          <h1 className="text-2xl font-bold">User management</h1>
        </div>
      </div>

      <Card className="mb-4 p-5">
        <p className="font-semibold">Create account</p>
        <p className="mt-1 text-sm text-slate-500">
          Enter name, email, password, and phone. Choose student, telecaller, or counselor — counselor accounts need profile details below.
        </p>
        <form className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3" onSubmit={(e) => void createUser(e)}>
          <div><Label>First name</Label><Input name="firstName" required /></div>
          <div><Label>Last name</Label><Input name="lastName" required /></div>
          <div><Label>Email</Label><Input name="email" type="email" required /></div>
          <div><Label>Password</Label><Input name="password" type="password" minLength={6} required /></div>
          <div><Label>Phone</Label><Input name="phone" /></div>
          <div>
            <Label>Role</Label>
            <Select
              name="role"
              value={createRole}
              onChange={(e) => setCreateRole(e.target.value as Role)}
            >
              {CREATE_ROLES.map((role) => (
                <option key={role} value={role}>{label(role)}</option>
              ))}
            </Select>
          </div>

          {BRANCH_SCOPED.includes(createRole) && (
            <div className="col-span-full rounded-xl border border-navy-200 bg-navy-50/60 p-4">
              <div className="mb-1 text-sm font-semibold text-navy-900">
                Branches for this {label(createRole)}
              </div>
              <p className="mb-3 text-xs text-slate-600">
                {createRole === "branch_head"
                  ? "A Branch Head can cover more than one branch. They will see only the branches ticked here."
                  : "This person will only see leads, students and records belonging to the branches ticked here."}
              </p>
              {branches.length === 0 ? (
                <p className="text-sm text-amber-700">
                  No branches yet — create one under Branches first.
                </p>
              ) : (
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
                  {branches.map((branch) => {
                    const checked = selectedBranches.includes(branch.id);
                    return (
                      <label
                        key={branch.id}
                        className={`flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-sm ${
                          checked ? "border-sky-500 bg-white" : "border-slate-200 bg-white/60"
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => toggleBranch(branch.id)}
                          className="h-4 w-4"
                        />
                        <span className="font-medium text-navy-900">{branch.name}</span>
                        <span className="ml-auto text-xs text-slate-500">{branch.code}</span>
                      </label>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {createRole === "counselor" && (
            <div className="col-span-full rounded-xl border border-sky-200 bg-sky-50/60 p-4">
              <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-navy-900">
                <ChevronDown className="h-4 w-4 text-sky-600" />
                Counselor profile details
              </div>
              <div className="grid gap-4 lg:grid-cols-2">
                <div>
                  <Label>Country specializations</Label>
                  <p className="mb-2 text-xs text-slate-500">
                    Used when assigning students by preferred country. Pick at least one.
                  </p>
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                    {COUNSELOR_COUNTRIES.map((country) => {
                      const checked = counselorCountries.includes(country);
                      return (
                        <label
                          key={country}
                          className={`flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-sm transition ${
                            checked
                              ? "border-sky-400 bg-white font-medium text-sky-900"
                              : "border-slate-200 bg-white text-slate-700 hover:border-sky-200"
                          }`}
                        >
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() => toggleCounselorCountry(country)}
                            className="rounded border-slate-300 text-sky-600 focus:ring-sky-500"
                          />
                          {country}
                        </label>
                      );
                    })}
                  </div>
                </div>
                <div>
                  <Label>Bio (optional)</Label>
                  <Textarea
                    value={counselorBio}
                    onChange={(e) => setCounselorBio(e.target.value)}
                    placeholder="Short intro shown on the counselor profile — experience, languages, focus areas..."
                  />
                </div>
              </div>
            </div>
          )}

          <div className="col-span-full flex items-end">
            <Button type="submit" disabled={busy}>
              {busy ? "Creating..." : `Create ${createRole.replace("_", " ")}`}
            </Button>
          </div>
        </form>
      </Card>

      <div className="mb-4 flex flex-wrap gap-3">
        <Input className="max-w-sm" placeholder="Search users..." value={query} onChange={(e) => setQuery(e.target.value)} />
        <Select className="w-44" value={roleFilter} onChange={(e) => setRoleFilter(e.target.value)}>
          <option value="all">All roles</option>
          {ROLES.map((role) => <option key={role} value={role}>{label(role)}</option>)}
        </Select>
      </div>

      <div className="grid gap-3">
        {users.map((user) => (
          <Card key={user.id} className="flex flex-wrap items-center justify-between gap-3 p-4">
            <div>
              <p className="font-medium">{displayName(user.first_name, user.last_name, user.email)}</p>
              <p className="text-xs text-slate-500">{user.email} · {user.phone || "No phone"}</p>
            </div>
            <div className="flex items-center gap-2">
              <Badge value={user.role} />
              <Select className="w-36" value={user.role} onChange={(e) => void setRole(user.id, e.target.value)}>
                {ROLES.map((role) => <option key={role} value={role}>{label(role)}</option>)}
              </Select>
              <Button size="sm" variant="secondary" onClick={() => void resetPassword(user.id)}>Reset password</Button>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}
