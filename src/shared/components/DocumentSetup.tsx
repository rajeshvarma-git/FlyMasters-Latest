import { FormEvent, useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { CheckCircle2, ClipboardList, EyeOff, Search, Users } from "lucide-react";

/**
 * Documents setup — one screen for admin and counsellors (it replaces the
 * admin "Document master" + "Document lists (legacy)" and the counsellor
 * "Set up documents" page, which all edited the same list differently).
 *
 * Choose who a document is for with two pickers:
 *   Countries — a counsellor sees only their own countries (just one → it is
 *               picked for them); "All my countries" / "All countries" ticks all.
 *   Students  — particular students (the default; the server asks exactly those
 *               students and nobody else), or — only if chosen on purpose —
 *               all students. Countries never decide who is asked when
 *               students are named; they only group and narrow the list.
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
  audience?: "students" | "all";
  target_students?: { id: string; name: string; email?: string }[];
  has_other_target_students?: boolean;
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

/** "Asha, Ravi +3 more" for a student-specific row; the server's label otherwise. */
function studentsText(row: DocRow) {
  if (row.audience !== "students" || !row.target_students?.length) return row.students_label;
  const names = row.target_students.map((t) => t.name);
  const shown = names.slice(0, 3).join(", ");
  const extra = names.length - 3;
  return `${shown}${extra > 0 ? ` +${extra} more` : ""}${row.has_other_target_students ? " + other students" : ""}`;
}

const inputClass =
  "w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-sky-400 focus:ring-2 focus:ring-sky-100";
const labelClass = "mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500";
const chip = "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold";

function StudentPicker({
  students,
  selected,
  onChange,
  wantedCountries,
}: {
  students: Student[];
  selected: string[];
  onChange: (ids: string[]) => void;
  /** When set, the list starts narrowed to students interested in these countries (view only — it never decides who is asked). */
  wantedCountries?: string[];
}) {
  const [query, setQuery] = useState("");
  const [narrow, setNarrow] = useState(true);
  const canNarrow = Boolean(wantedCountries?.length);
  const choices = useMemo(() => {
    const q = query.trim().toLowerCase();
    const wanted = new Set((wantedCountries || []).map((c) => c.toLowerCase()));
    return students
      .filter((s) => !(canNarrow && narrow) || !s.countries.length || s.countries.some((c) => wanted.has(c.toLowerCase())))
      .filter((s) => !q || `${s.name} ${s.email}`.toLowerCase().includes(q));
  }, [students, query, narrow, canNarrow, wantedCountries]);
  const byId = useMemo(() => new Map(students.map((s) => [s.id, s])), [students]);
  const toggle = (id: string, on: boolean) => onChange(on ? [...new Set([...selected, id])] : selected.filter((x) => x !== id));
  return (
    <div className="mt-2">
      {selected.length ? (
        <div className="mb-2 flex flex-wrap gap-1">
          {selected.map((id) => (
            <button
              key={id}
              type="button"
              title="Remove"
              onClick={() => toggle(id, false)}
              className={`${chip} bg-sky-50 text-sky-800 hover:bg-sky-100`}
            >
              {byId.get(id)?.name || "Student"} ×
            </button>
          ))}
        </div>
      ) : null}
      <div className="relative">
        <Search className="pointer-events-none absolute left-2 top-2.5 h-4 w-4 text-slate-400" />
        <input className={`${inputClass} pl-8`} placeholder="Search students" value={query} onChange={(e) => setQuery(e.target.value)} />
      </div>
      {canNarrow ? (
        <label className="mt-2 flex items-center gap-2 text-xs text-slate-600">
          <input type="checkbox" checked={narrow} onChange={(e) => setNarrow(e.target.checked)} />
          Only list students interested in the chosen countries (untick to pick any of your students)
        </label>
      ) : null}
      <div className="mt-2 max-h-44 space-y-1 overflow-y-auto">
        {choices.map((student) => (
          <label key={student.id} className="flex items-center gap-2 text-sm text-slate-700">
            <input type="checkbox" checked={selected.includes(student.id)} onChange={(e) => toggle(student.id, e.target.checked)} />
            <span className="truncate">
              {student.name}
              <span className="text-xs text-slate-400">
                {student.countries.length ? ` · ${student.countries.join(", ")}` : ""}
                {student.email ? ` · ${student.email}` : ""}
              </span>
            </span>
          </label>
        ))}
        {!choices.length ? <p className="text-xs text-slate-500">No students match.</p> : null}
      </div>
      <p className="mt-1 text-xs text-slate-500">
        {selected.length ? `${selected.length} chosen — only they will be asked.` : "Nobody chosen yet — choose at least one student."}
      </p>
    </div>
  );
}

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
  const [othersOn, setOthersOn] = useState(false);
  const [customCountries, setCustomCountries] = useState<string[]>([]);
  const [customDraft, setCustomDraft] = useState("");
  // Particular students is the default; "all students" must be chosen on purpose.
  const [everyone, setEveryone] = useState(false);
  const [picked, setPicked] = useState<string[]>([]);
  // editing the students of an existing document
  const [editingId, setEditingId] = useState("");
  const [editPicked, setEditPicked] = useState<string[]>([]);

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

  // Custom countries count only while Others is ticked (and only admins see it).
  const pickedCountries = [...countries, ...(isAdmin && othersOn ? customCountries : [])];
  const chosenCountries = singleCountry ? [singleCountry] : allCountries ? data?.countries || [] : pickedCountries;

  const resetForm = () => {
    setName("");
    setDescription("");
    setTypes("pdf,jpg,png");
    setSize(20);
    setRequired(true);
    setStaffOnly(false);
    setAllCountries(true);
    setCountries([]);
    setOthersOn(false);
    setCustomCountries([]);
    setCustomDraft("");
    setEveryone(false);
    setPicked([]);
  };

  const addCustomCountry = () => {
    const value = customDraft.trim().replace(/\s+/g, " ");
    if (!value) return;
    const lower = value.toLowerCase();
    const exists = [...(data?.countries || []), ...pickedCountries].some((c) => c.toLowerCase() === lower);
    if (!exists) setCustomCountries((list) => [...list, value]);
    setCustomDraft("");
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setError("");
    setNotice("");
    if (!allCountries && isAdmin && othersOn && customDraft.trim()) {
      setError(`Press Add to include "${customDraft.trim()}" as a country, or clear the box.`);
      return;
    }
    if (!singleCountry && !allCountries && !pickedCountries.length) {
      setError("Choose at least one country, or tick all countries.");
      return;
    }
    if (!everyone && !picked.length) {
      setError("Choose at least one student, or choose all students on purpose.");
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
          countries: singleCountry ? [singleCountry] : allCountries ? [] : pickedCountries,
          all_students: everyone,
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

  const patch = async (row: DocRow, change: Partial<DocRow> & { student_ids?: string[] }, done: string) => {
    setError("");
    setNotice("");
    try {
      await request(`/document-setup/${encodeURIComponent(row.id)}`, { method: "PATCH", body: change });
      setEditingId("");
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
            choose the particular students it is for — only they will be asked.
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
              <details className="group rounded-lg border border-slate-200 bg-white">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-2 px-3 py-2 text-sm text-slate-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-200">
                  <span>{allCountries ? (isAdmin ? "All countries" : "All my countries") : `${pickedCountries.length} chosen`}</span>
                  <span aria-hidden="true" className="text-xs text-slate-400 group-open:rotate-180">▼</span>
                </summary>
                <div className="space-y-2 border-t border-slate-100 p-3">
                  <label className="flex items-center gap-2 text-sm font-medium text-slate-800">
                    <input type="checkbox" checked={allCountries} onChange={(e) => { setAllCountries(e.target.checked); setCountries([]); setOthersOn(false); setCustomCountries([]); }} />
                    {isAdmin ? "All countries" : "All my countries"}
                  </label>
                  {!allCountries ? (
                    <div className="grid grid-cols-2 gap-1">
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
                      {isAdmin ? (
                        <label className="flex items-center gap-2 text-sm text-slate-700">
                          <input type="checkbox" checked={othersOn} onChange={(e) => setOthersOn(e.target.checked)} />
                          Others
                        </label>
                      ) : null}
                    </div>
                  ) : null}
                  {!allCountries && isAdmin && othersOn ? (
                    <div className="space-y-2">
                      <div className="flex gap-2">
                        <input
                          className={inputClass}
                          placeholder="Type a country name"
                          aria-label="Other country name"
                          value={customDraft}
                          onChange={(e) => setCustomDraft(e.target.value)}
                          onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addCustomCountry(); } }}
                        />
                        <button type="button" onClick={addCustomCountry} className="shrink-0 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">Add</button>
                      </div>
                      {customCountries.length ? (
                        <div className="flex flex-wrap gap-2">
                          {customCountries.map((country) => (
                            <span key={country} className={`${chip} bg-slate-100 text-slate-700`}>
                              {country}
                              <button
                                type="button"
                                aria-label={`Remove ${country}`}
                                className="ml-1 text-slate-500 hover:text-slate-900"
                                onClick={() => setCustomCountries((list) => list.filter((c) => c !== country))}
                              >
                                ×
                              </button>
                            </span>
                          ))}
                        </div>
                      ) : null}
                    </div>
                  ) : null}
                </div>
              </details>
            )}
          </div>

          {/* Students */}
          <div>
            <label className={labelClass}>Students</label>
            <div className="rounded-lg border border-slate-200 p-3">
              <div className="flex flex-wrap gap-4 text-sm">
                <label className="flex items-center gap-2">
                  <input type="radio" checked={!everyone} onChange={() => setEveryone(false)} />
                  Particular students only
                </label>
                <label className="flex items-center gap-2">
                  <input type="radio" checked={everyone} onChange={() => { setEveryone(true); setPicked([]); }} />
                  {isAdmin ? "All students" : "All my students"}
                </label>
              </div>
              {!everyone ? (
                <StudentPicker
                  students={data?.students || []}
                  selected={picked}
                  onChange={setPicked}
                  wantedCountries={singleCountry || !allCountries ? chosenCountries : undefined}
                />
              ) : (
                <p className="mt-2 text-xs text-amber-700">
                  Every {isAdmin ? "student" : "one of your students"}{!singleCountry && !allCountries ? " in the chosen countries" : ""} will be asked for this document.
                </p>
              )}
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
                <Users className="mb-0.5 inline h-3 w-3" /> {studentsText(row)}
                {row.legacy_degrees?.length ? ` · (older rule: ${row.legacy_degrees.join(", ")} only)` : ""}
              </p>
              <p className="mt-0.5 text-xs text-slate-400">
                {(row.allowed_file_types || []).join(", ") || "pdf"} · max {row.max_file_size_mb || 20} MB
              </p>
              {editingId === row.id ? (
                <div className="mt-3 rounded-xl border border-slate-200 bg-slate-50 p-3">
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Students for this document</p>
                  <StudentPicker students={data?.students || []} selected={editPicked} onChange={setEditPicked} />
                  {row.has_other_target_students ? (
                    <p className="mt-1 text-xs text-slate-500">Other students outside your list are on this document too; they stay as they are.</p>
                  ) : null}
                  <div className="mt-2 flex gap-2">
                    <button
                      type="button"
                      disabled={!editPicked.length}
                      className="rounded-lg bg-sky-600 px-3 py-1 text-xs font-semibold text-white hover:bg-sky-700 disabled:opacity-50"
                      onClick={() => void patch(row, { student_ids: editPicked }, `Students updated for "${row.document_type}".`)}
                    >
                      Save students
                    </button>
                    <button type="button" className="rounded-lg border border-slate-200 px-3 py-1 text-xs font-medium text-slate-700 hover:bg-white" onClick={() => setEditingId("")}>
                      Cancel
                    </button>
                  </div>
                </div>
              ) : null}
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
                  {row.audience === "students" ? (
                    <button
                      type="button"
                      className="rounded-lg border border-slate-200 px-3 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50"
                      onClick={() => {
                        setEditingId(editingId === row.id ? "" : row.id);
                        setEditPicked((row.target_students || []).map((t) => t.id));
                      }}
                    >
                      Edit students
                    </button>
                  ) : null}
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
