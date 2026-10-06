import { FormEvent, useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { CheckCircle2, ClipboardList, EyeOff, Search, Users } from "lucide-react";

/**
 * Documents setup — one screen for admin and counsellors (it replaces the
 * admin "Document master" + "Document lists (legacy)" and the counsellor
 * "Set up documents" page, which all edited the same list differently).
 *
 * Choose who a document is for with two dropdown-style pickers:
 *   Countries — a counsellor sees only their own countries (just one → it is
 *               picked for them); "All my countries" / "All countries" ticks all.
 *   Students  — everyone (in those countries), or particular students only.
 * Degree level is gone; "staff only" keeps a document off the student portal.
 */

type DocRow = {
  id: string;
  document_type: string;
  description?: string;
  is_required?: boolean;
  is_active?: boolean;
  staff_only?: boolean;
  allowed_file_types?: string[];
  max_file_size_mb?: number;
  countries_label: string;
  students_label: string;
  legacy_degrees?: string[];
  source?: string;
  created_by_role?: string;
  can_edit: boolean;
};

type Student = { id: string; lead_id: string; name: string; email: string; countries: string[] };

type SetupResponse = {
  documents: DocRow[];
  countries: string[];
  countries_from_profile: boolean;
  students: Student[];
  role: string;
};

async function request<T>(path: string, init?: { method?: string; body?: unknown }): Promise<T> {
  const token = sessionStorage.getItem("fm_token") || "";
  const res = await fetch(`/api${path}`, {
    method: init?.method || "GET",
    cache: "no-store",
    headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: init?.body ? JSON.stringify(init.body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((data as { error?: string }).error || `Request failed (${res.status})`);
  return data as T;
}

const inputClass =
  "w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-sky-400 focus:ring-2 focus:ring-sky-100";
const labelClass = "mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500";
const chip = "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold";

export default function DocumentSetup({ title = "Documents setup", backSlot }: { title?: string; backSlot?: ReactNode }) {
  const [data, setData] = useState<SetupResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [search, setSearch] = useState("");

  // form
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [types, setTypes] = useState("pdf,jpg,png");
  const [size, setSize] = useState(20);
  const [required, setRequired] = useState(true);
  const [staffOnly, setStaffOnly] = useState(false);
  const [allCountries, setAllCountries] = useState(true);
  const [countries, setCountries] = useState<string[]>([]);
  const [everyone, setEveryone] = useState(true);
  const [picked, setPicked] = useState<string[]>([]);
  const [studentQuery, setStudentQuery] = useState("");

  const isAdmin = data?.role === "admin" || data?.role === "super_admin";
  const singleCountry = !isAdmin && data?.countries_from_profile && data.countries.length === 1 ? data.countries[0] : "";

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      setData(await request<SetupResponse>("/document-setup"));
      setError("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load documents.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
    // Another admin or counsellor may add one meanwhile.
    const poll = window.setInterval(() => void load(true), 30000);
    return () => window.clearInterval(poll);
  }, [load]);

  const chosenCountries = singleCountry ? [singleCountry] : allCountries ? data?.countries || [] : countries;

  const studentChoices = useMemo(() => {
    const q = studentQuery.trim().toLowerCase();
    const wanted = new Set(chosenCountries.map((c) => c.toLowerCase()));
    return (data?.students || [])
      .filter((s) => allCountries && !singleCountry ? true : !s.countries.length || s.countries.some((c) => wanted.has(c.toLowerCase())))
      .filter((s) => !q || `${s.name} ${s.email}`.toLowerCase().includes(q));
  }, [data, studentQuery, allCountries, singleCountry, chosenCountries]);

  const resetForm = () => {
    setName("");
    setDescription("");
    setTypes("pdf,jpg,png");
    setSize(20);
    setRequired(true);
    setStaffOnly(false);
    setAllCountries(true);
    setCountries([]);
    setEveryone(true);
    setPicked([]);
    setStudentQuery("");
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setError("");
    setNotice("");
    if (!singleCountry && !allCountries && !countries.length) {
      setError("Choose at least one country, or tick all countries.");
      return;
    }
    if (!everyone && !picked.length) {
      setError("Choose at least one student, or send it to all students.");
      return;
    }
    setBusy(true);
    try {
      const result = await request<{ document: DocRow }>("/document-setup", {
        method: "POST",
        body: {
          document_type: name,
          description,
          allowed_file_types: types,
          max_file_size_mb: size,
          is_required: required,
          staff_only: staffOnly,
          all_countries: singleCountry ? false : allCountries,
          countries: singleCountry ? [singleCountry] : allCountries ? [] : countries,
          student_ids: everyone ? [] : picked,
        },
      });
      resetForm();
      setNotice(
        `"${result.document.document_type}" added — ${result.document.students_label.toLowerCase()}, ${result.document.countries_label.toLowerCase()}.` +
          (!everyone && !staffOnly ? " They have been told to upload it." : ""),
      );
      await load(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not add the document.");
    } finally {
      setBusy(false);
    }
  };

  const patch = async (row: DocRow, change: Partial<DocRow>, done: string) => {
    setError("");
    setNotice("");
    try {
      await request(`/document-setup/${encodeURIComponent(row.id)}`, { method: "PATCH", body: change });
      setNotice(done);
      await load(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not update the document.");
    }
  };

  const rows = (data?.documents || []).filter((row) =>
    !search.trim() || `${row.document_type} ${row.description || ""} ${row.countries_label} ${row.students_label}`.toLowerCase().includes(search.trim().toLowerCase()));

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start gap-3">
        {backSlot}
        <div>
          <div className="flex items-center gap-2">
            <ClipboardList className="h-6 w-6 text-sky-500" />
            <h1 className="text-2xl font-bold text-slate-900">{title}</h1>
          </div>
          <p className="mt-1 max-w-3xl text-sm text-slate-600">
            The documents students upload on Student Portal → Documents. Pick the countries and the students each one is for —
            choose particular students to send it to them only.
          </p>
        </div>
      </div>

      {error ? <div className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">{error}</div> : null}
      {notice ? (
        <div className="flex items-start gap-2 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">
          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" /> {notice}
        </div>
      ) : null}

      <form onSubmit={(e) => void submit(e)} className="space-y-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <p className="font-semibold text-slate-900">Add a document</p>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className={labelClass}>Document</label>
            <input className={inputClass} required value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Passport, GIC letter, SOP" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelClass}>File types</label>
              <input className={inputClass} value={types} onChange={(e) => setTypes(e.target.value)} />
            </div>
            <div>
              <label className={labelClass}>Max size (MB)</label>
              <input className={inputClass} type="number" min={1} max={100} value={size} onChange={(e) => setSize(Number(e.target.value) || 20)} />
            </div>
          </div>
          <div className="sm:col-span-2">
            <label className={labelClass}>What the student should upload</label>
            <textarea className={`${inputClass} min-h-[70px]`} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Colour scan of the photo page, showing the expiry date." />
          </div>

          {/* Countries */}
          <div>
            <label className={labelClass}>Countries</label>
            {singleCountry ? (
              <p className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700">
                {singleCountry} <span className="text-xs text-slate-500">(your country)</span>
              </p>
            ) : (
              <div className="rounded-lg border border-slate-200 p-3">
                <label className="flex items-center gap-2 text-sm font-medium text-slate-800">
                  <input type="checkbox" checked={allCountries} onChange={(e) => { setAllCountries(e.target.checked); setCountries([]); }} />
                  {isAdmin ? "All countries" : "All my countries"}
                </label>
                {!allCountries ? (
                  <div className="mt-2 grid grid-cols-2 gap-1">
                    {(data?.countries || []).map((country) => (
                      <label key={country} className="flex items-center gap-2 text-sm text-slate-700">
                        <input
                          type="checkbox"
                          checked={countries.includes(country)}
                          onChange={(e) => setCountries((list) => e.target.checked ? [...list, country] : list.filter((c) => c !== country))}
                        />
                        {country}
                      </label>
                    ))}
                  </div>
                ) : null}
              </div>
            )}
          </div>

          {/* Students */}
          <div>
            <label className={labelClass}>Students</label>
            <div className="rounded-lg border border-slate-200 p-3">
              <div className="flex flex-wrap gap-4 text-sm">
                <label className="flex items-center gap-2">
                  <input type="radio" checked={everyone} onChange={() => { setEveryone(true); setPicked([]); }} />
                  {isAdmin ? "All students" : "All my students"}
                </label>
                <label className="flex items-center gap-2">
                  <input type="radio" checked={!everyone} onChange={() => setEveryone(false)} />
                  Particular students only
                </label>
              </div>
              {!everyone ? (
                <div className="mt-2">
                  <div className="relative">
                    <Search className="pointer-events-none absolute left-2 top-2.5 h-4 w-4 text-slate-400" />
                    <input className={`${inputClass} pl-8`} placeholder="Search students" value={studentQuery} onChange={(e) => setStudentQuery(e.target.value)} />
                  </div>
                  <div className="mt-2 max-h-44 space-y-1 overflow-y-auto">
                    {studentChoices.map((student) => (
                      <label key={student.id} className="flex items-center gap-2 text-sm text-slate-700">
                        <input
                          type="checkbox"
                          checked={picked.includes(student.id)}
                          onChange={(e) => setPicked((list) => e.target.checked ? [...list, student.id] : list.filter((id) => id !== student.id))}
                        />
                        <span className="truncate">
                          {student.name}
                          <span className="text-xs text-slate-400">
                            {student.countries.length ? ` · ${student.countries.join(", ")}` : ""}
                            {student.email ? ` · ${student.email}` : ""}
                          </span>
                        </span>
                      </label>
                    ))}
                    {!studentChoices.length ? <p className="text-xs text-slate-500">No students match.</p> : null}
                  </div>
                  {picked.length ? <p className="mt-1 text-xs text-slate-500">{picked.length} chosen — only they will be asked.</p> : null}
                </div>
              ) : null}
            </div>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-5 text-sm text-slate-700">
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={required} onChange={(e) => setRequired(e.target.checked)} /> Required
          </label>
          <label className="flex items-center gap-2" title="Kept for staff; not shown to or asked of students">
            <input type="checkbox" checked={staffOnly} onChange={(e) => setStaffOnly(e.target.checked)} /> Staff only (students don&apos;t see it)
          </label>
          <button
            type="submit"
            disabled={busy}
            className="ml-auto rounded-xl bg-sky-600 px-4 py-2 text-sm font-semibold text-white hover:bg-sky-700 disabled:opacity-60"
          >
            {busy ? "Adding…" : "Add document"}
          </button>
        </div>
      </form>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm font-semibold text-slate-700">{rows.length} document{rows.length === 1 ? "" : "s"}</p>
        <div className="relative w-full max-w-xs">
          <Search className="pointer-events-none absolute left-2 top-2.5 h-4 w-4 text-slate-400" />
          <input className={`${inputClass} pl-8`} placeholder="Search documents" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
      </div>

      <div className="space-y-3">
        {loading && !data ? <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center text-sm text-slate-500">Loading…</div> : null}
        {rows.map((row) => (
          <div key={row.id} className={`flex flex-wrap items-start justify-between gap-3 rounded-2xl border border-slate-200 bg-white p-4 ${row.is_active === false ? "opacity-70" : ""}`}>
            <div className="min-w-0">
              <p className="font-semibold text-slate-900">{row.document_type}</p>
              {row.description ? <p className="text-sm text-slate-500">{row.description}</p> : null}
              <p className="mt-1 text-xs text-slate-500">
                <span className="font-medium">Countries:</span> {row.countries_label}
                {" · "}
                <Users className="mb-0.5 inline h-3 w-3" /> {row.students_label}
                {row.legacy_degrees?.length ? ` · (older rule: ${row.legacy_degrees.join(", ")} only)` : ""}
              </p>
              <p className="mt-0.5 text-xs text-slate-400">
                {(row.allowed_file_types || []).join(", ") || "pdf"} · max {row.max_file_size_mb || 20} MB
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {row.is_required !== false ? <span className={`${chip} bg-orange-100 text-orange-800`}>Required</span> : null}
              {row.staff_only ? <span className={`${chip} bg-slate-800 text-white`}><EyeOff className="h-3 w-3" /> Staff only</span> : null}
              <span className={`${chip} ${row.is_active === false ? "bg-slate-100 text-slate-600" : "bg-emerald-100 text-emerald-800"}`}>
                {row.is_active === false ? (row.source === "document_master" ? "Country checklists only" : "Not asked") : "Asked of students"}
              </span>
              {!row.can_edit ? <span className={`${chip} bg-sky-50 text-sky-700`}>Set by {row.created_by_role === "admin" || !row.created_by_role ? "admin" : "another counsellor"}</span> : null}
              {row.can_edit ? (
                <>
                  <button
                    type="button"
                    className="rounded-lg border border-slate-200 px-3 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50"
                    onClick={() => void patch(row, { is_active: row.is_active === false }, row.is_active === false ? `"${row.document_type}" is now asked of students.` : `"${row.document_type}" is no longer asked.`)}
                  >
                    {row.is_active === false ? "Ask students" : "Stop asking"}
                  </button>
                  <button
                    type="button"
                    className="rounded-lg border border-slate-200 px-3 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50"
                    onClick={() => void patch(row, { staff_only: !row.staff_only }, row.staff_only ? `"${row.document_type}" is visible to students again.` : `"${row.document_type}" is now staff only.`)}
                  >
                    {row.staff_only ? "Show to students" : "Make staff only"}
                  </button>
                </>
              ) : null}
            </div>
          </div>
        ))}
        {!loading && data && !rows.length ? (
          <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center text-sm text-slate-500">No documents yet.</div>
        ) : null}
      </div>
    </div>
  );
}
