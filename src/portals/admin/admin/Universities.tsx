import { ChangeEvent, useEffect, useMemo, useState } from "react";
import { Building2, ChevronRight, Globe, GraduationCap, Plane, Upload } from "lucide-react";
import { api } from "@admin/lib/api";
import { refreshStore, useAdminStore } from "@admin/lib/store";
import type {
  CatalogCountryRow,
  CatalogDegreeRow,
  CatalogUniversityRow,
  UniversityProgramsPage,
} from "@admin/lib/types";
import { Button } from "@admin/components/ui/Button";
import { Card } from "@admin/components/ui/Card";
import { Input, Label } from "@admin/components/ui/Field";

const PAGE_SIZE = 50;

type BrowseLevel = "countries" | "universities" | "degrees" | "programs";

export default function Universities() {
  const store = useAdminStore();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [replaceExisting, setReplaceExisting] = useState(false);
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(0);

  const [level, setLevel] = useState<BrowseLevel>("countries");
  const [country, setCountry] = useState("");
  const [university, setUniversity] = useState("");
  const [degree, setDegree] = useState("");

  const [countries, setCountries] = useState<CatalogCountryRow[]>([]);
  const [universities, setUniversities] = useState<CatalogUniversityRow[]>([]);
  const [degrees, setDegrees] = useState<CatalogDegreeRow[]>([]);
  const [programs, setPrograms] = useState<UniversityProgramsPage>({
    rows: [],
    total: 0,
    limit: PAGE_SIZE,
    offset: 0,
  });

  const loadCountries = async () => {
    setCountries(await api<CatalogCountryRow[]>("/university-catalog/countries"));
  };

  const loadUniversities = async (nextCountry: string) => {
    const params = new URLSearchParams({ country: nextCountry });
    setUniversities(await api<CatalogUniversityRow[]>(`/university-catalog/universities?${params.toString()}`));
  };

  const loadDegrees = async (nextCountry: string, nextUniversity: string) => {
    const params = new URLSearchParams({ country: nextCountry, university: nextUniversity });
    setDegrees(await api<CatalogDegreeRow[]>(`/university-catalog/degrees?${params.toString()}`));
  };

  const loadPrograms = async (
    nextCountry: string,
    nextUniversity: string,
    nextDegree: string,
    nextQuery = query,
    nextPage = page,
  ) => {
    const params = new URLSearchParams({
      country: nextCountry,
      university: nextUniversity,
      degree: nextDegree,
      limit: String(PAGE_SIZE),
      offset: String(nextPage * PAGE_SIZE),
    });
    if (nextQuery.trim()) params.set("q", nextQuery.trim());
    setPrograms(await api<UniversityProgramsPage>(`/university-programs?${params.toString()}`));
  };

  useEffect(() => {
    void loadCountries().catch((err: Error) => setError(err.message));
  }, [store.universityProgramCount]);

  useEffect(() => {
    if (level === "universities" && country) {
      void loadUniversities(country).catch((err: Error) => setError(err.message));
    }
  }, [level, country, store.universityProgramCount]);

  useEffect(() => {
    if (level === "degrees" && country && university) {
      void loadDegrees(country, university).catch((err: Error) => setError(err.message));
    }
  }, [level, country, university, store.universityProgramCount]);

  useEffect(() => {
    if (level === "programs" && country && university && degree) {
      void loadPrograms(country, university, degree, query, page).catch((err: Error) => setError(err.message));
    }
  }, [level, country, university, degree, query, page, store.universityProgramCount]);

  const upload = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;

    setBusy(true);
    setError("");
    setMessage("");
    try {
      const csv = await file.text();
      const result = await api<{
        ok: boolean;
        universities: number;
        programs: number;
        fileName: string;
        countries: string[];
        replace: boolean;
      }>(
        "/universities/import-csv",
        {
          method: "POST",
          body: { csv, fileName: file.name, replace: replaceExisting },
        },
      );
      const countryText = result.countries?.length ? ` for ${result.countries.join(", ")}` : "";
      const modeText = result.replace ? "Replaced the whole catalog." : "Other countries were kept.";
      setMessage(
        `Imported ${result.programs.toLocaleString()} programs and ${result.universities.toLocaleString()} universities${countryText} from ${result.fileName}. ${modeText}`,
      );
      resetBrowse();
      await refreshStore();
      await loadCountries();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed.");
    } finally {
      setBusy(false);
    }
  };

  const clearCatalog = async () => {
    if (!window.confirm("Remove all universities and programs from the catalog?")) return;
    setBusy(true);
    setError("");
    setMessage("");
    try {
      await api("/universities/catalog", { method: "DELETE" });
      setMessage("Catalog cleared.");
      resetBrowse();
      await refreshStore();
      await loadCountries();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not clear catalog.");
    } finally {
      setBusy(false);
    }
  };

  const resetBrowse = () => {
    setLevel("countries");
    setCountry("");
    setUniversity("");
    setDegree("");
    setQuery("");
    setPage(0);
    setUniversities([]);
    setDegrees([]);
    setPrograms({ rows: [], total: 0, limit: PAGE_SIZE, offset: 0 });
  };

  const openCountry = (name: string) => {
    setCountry(name);
    setUniversity("");
    setDegree("");
    setQuery("");
    setPage(0);
    setLevel("universities");
  };

  const openUniversity = (name: string) => {
    setUniversity(name);
    setDegree("");
    setQuery("");
    setPage(0);
    setLevel("degrees");
  };

  const openDegree = (name: string) => {
    setDegree(name);
    setQuery("");
    setPage(0);
    setLevel("programs");
  };

  const pageCount = useMemo(
    () => Math.max(1, Math.ceil(programs.total / PAGE_SIZE)),
    [programs.total],
  );

  const breadcrumb = [
    { label: "All countries", action: resetBrowse, active: level === "countries" },
    country ? { label: country, action: () => { setLevel("universities"); setUniversity(""); setDegree(""); setPage(0); }, active: level === "universities" } : null,
    university ? { label: university, action: () => { setLevel("degrees"); setDegree(""); setPage(0); }, active: level === "degrees" } : null,
    degree ? { label: degree, action: () => { setLevel("programs"); setPage(0); }, active: level === "programs" } : null,
  ].filter(Boolean) as { label: string; action: () => void; active: boolean }[];

  return (
    <div>
      <div className="mb-6 flex items-center gap-3">
        <Plane className="h-6 w-6 text-sky-500" />
        <div>
          <h1 className="text-2xl font-bold">Universities</h1>
        </div>
      </div>

      <Card className="mb-4 p-5">
        <p className="font-semibold">Upload CSV catalog</p>
        <p className="mt-1 text-sm text-slate-500">
          Upload one CSV per country. By default each upload updates only that country and keeps other countries.
          Check <strong>Replace entire catalog</strong> only when you want to wipe everything and start fresh.
        </p>
        <div className="mt-4 flex flex-wrap items-end gap-4">
          <div>
            <Label>CSV file</Label>
            <Input id="catalog-file" type="file" accept=".csv,.tsv,.txt" disabled={busy} onChange={(e) => void upload(e)} />
          </div>
          <label className="flex items-center gap-2 pb-2 text-sm">
            <input
              type="checkbox"
              checked={replaceExisting}
              onChange={(e) => setReplaceExisting(e.target.checked)}
              disabled={busy}
            />
            Replace entire catalog
          </label>
          <Button type="button" variant="secondary" disabled={busy} onClick={() => void clearCatalog()}>
            Clear catalog
          </Button>
        </div>
        {busy && <p className="mt-3 text-sm text-sky-600">Uploading and saving all rows…</p>}
        {message && <p className="mt-3 text-sm text-emerald-700">{message}</p>}
        {error && <p className="mt-3 text-sm text-rose-600">{error}</p>}
        <div className="mt-4 grid gap-2 sm:grid-cols-3">
          <Card className="p-4">
            <p className="text-xs uppercase tracking-wide text-slate-500">Countries</p>
            <p className="text-2xl font-bold">{countries.length.toLocaleString()}</p>
          </Card>
          <Card className="p-4">
            <p className="text-xs uppercase tracking-wide text-slate-500">Universities</p>
            <p className="text-2xl font-bold">{store.universities.length.toLocaleString()}</p>
          </Card>
          <Card className="p-4">
            <p className="text-xs uppercase tracking-wide text-slate-500">Programs</p>
            <p className="text-2xl font-bold">{store.universityProgramCount.toLocaleString()}</p>
          </Card>
        </div>
      </Card>

      <Card className="p-5">
        <div className="mb-4 flex flex-wrap items-center gap-2 text-sm">
          {breadcrumb.map((item, index) => (
            <div key={item.label} className="flex items-center gap-2">
              {index > 0 && <ChevronRight className="h-4 w-4 text-slate-400" />}
              <button
                type="button"
                className={item.active ? "font-semibold text-sky-700" : "text-slate-600 hover:text-sky-700"}
                onClick={item.action}
              >
                {item.label}
              </button>
            </div>
          ))}
        </div>

        {level === "countries" && (
          <>
            <div className="mb-4 flex items-center gap-2">
              <Globe className="h-5 w-5 text-sky-500" />
              <p className="font-semibold">Choose a country</p>
            </div>
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {countries.map((item) => (
                <button
                  key={item.name}
                  type="button"
                  className="rounded-2xl border border-slate-200 bg-white p-4 text-left transition hover:border-sky-300 hover:bg-sky-50"
                  onClick={() => openCountry(item.name)}
                >
                  <p className="font-semibold">{item.name}</p>
                  <p className="mt-1 text-sm text-slate-500">
                    {item.university_count.toLocaleString()} universities · {item.program_count.toLocaleString()} programs
                  </p>
                </button>
              ))}
              {countries.length === 0 && (
                <Card className="p-8 text-center text-sm text-slate-500 sm:col-span-2 xl:col-span-3">
                  <Upload className="mx-auto mb-3 h-8 w-8 text-slate-300" />
                  No countries yet. Upload a CSV file to start.
                </Card>
              )}
            </div>
          </>
        )}

        {level === "universities" && (
          <>
            <div className="mb-4 flex items-center gap-2">
              <Building2 className="h-5 w-5 text-sky-500" />
              <p className="font-semibold">Universities in {country}</p>
            </div>
            <div className="grid gap-3">
              {universities.map((item) => (
                <button
                  key={item.name}
                  type="button"
                  className="rounded-2xl border border-slate-200 bg-white p-4 text-left transition hover:border-sky-300 hover:bg-sky-50"
                  onClick={() => openUniversity(item.name)}
                >
                  <p className="font-semibold">{item.name}</p>
                  <p className="mt-1 text-sm text-slate-500">
                    {item.location || country} · {item.program_count.toLocaleString()} programs
                  </p>
                </button>
              ))}
            </div>
          </>
        )}

        {level === "degrees" && (
          <>
            <div className="mb-4 flex items-center gap-2">
              <GraduationCap className="h-5 w-5 text-sky-500" />
              <p className="font-semibold">Degree types at {university}</p>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              {degrees.map((item) => (
                <button
                  key={item.name}
                  type="button"
                  className="rounded-2xl border border-slate-200 bg-white p-4 text-left transition hover:border-sky-300 hover:bg-sky-50"
                  onClick={() => openDegree(item.name)}
                >
                  <p className="font-semibold">{item.name}</p>
                  <p className="mt-1 text-sm text-slate-500">{item.program_count.toLocaleString()} programs</p>
                </button>
              ))}
            </div>
          </>
        )}

        {level === "programs" && (
          <>
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="font-semibold">{degree} programs</p>
                <p className="text-sm text-slate-500">
                  {university} · {country} · {programs.total.toLocaleString()} programs
                </p>
              </div>
              <Input
                className="max-w-sm"
                placeholder="Search within these programs..."
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value);
                  setPage(0);
                }}
              />
            </div>
            <div className="grid gap-3">
              {programs.rows.map((item) => (
                <Card key={item.id} className="p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="font-semibold">{item.program_name}</p>
                      <p className="text-sm text-slate-500">
                        {[item.course, item.specialization].filter(Boolean).join(" · ")}
                      </p>
                      <p className="mt-1 text-sm text-slate-500">
                        {item.location || [item.city, item.country].filter(Boolean).join(", ")}
                        {item.duration ? ` · ${item.duration}` : ""}
                        {item.fee ? ` · ${item.fee}` : ""}
                        {item.language ? ` · ${item.language}` : ""}
                      </p>
                      {item.program_description && (
                        <p className="mt-2 line-clamp-2 text-sm text-slate-600">{item.program_description}</p>
                      )}
                    </div>
                    <div className="text-right text-xs text-slate-500">
                      {item.deadline && <p>Deadline: {item.deadline}</p>}
                      {item.source_file && <p>{item.source_file}</p>}
                    </div>
                  </div>
                </Card>
              ))}
              {programs.rows.length === 0 && (
                <Card className="p-8 text-center text-sm text-slate-500">No programs found for this selection.</Card>
              )}
            </div>
            {programs.total > PAGE_SIZE && (
              <div className="mt-4 flex items-center justify-between gap-3">
                <p className="text-sm text-slate-500">
                  Page {page + 1} of {pageCount}
                </p>
                <div className="flex gap-2">
                  <Button size="sm" variant="secondary" disabled={page === 0} onClick={() => setPage((p) => p - 1)}>
                    Previous
                  </Button>
                  <Button
                    size="sm"
                    variant="secondary"
                    disabled={(page + 1) * PAGE_SIZE >= programs.total}
                    onClick={() => setPage((p) => p + 1)}
                  >
                    Next
                  </Button>
                </div>
              </div>
            )}
          </>
        )}
      </Card>
    </div>
  );
}
