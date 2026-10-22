import { ChangeEvent, ReactNode, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, FileText, ImagePlus, Plus, Trash2, Upload } from "lucide-react";
import { api, getToken } from "@admin/lib/api";
import { Button } from "@admin/components/ui/Button";
import { Card } from "@admin/components/ui/Card";
import { Input, Label, Select, Textarea } from "@admin/components/ui/Field";
import { AuthImage, openAssetInTab } from "@shared/components/AuthAsset";
import {
  DEGREE_LEVELS, STATUS_LABEL, emptyUniversityInfo, normalizeUniversityInfo,
  type AssetRef, type UniversityInfo, type UniversityInfoStatus,
} from "@shared/universityInfo";

type Payload = {
  university: { id: string; name: string; country: string; city: string; website_url: string };
  info: {
    draft: UniversityInfo | null;
    published: UniversityInfo | null;
    status: UniversityInfoStatus;
    draft_updated_at: string | null;
    published_at: string | null;
  };
};

const IMAGE_MAX = 5 * 1024 * 1024;
const PDF_MAX = 15 * 1024 * 1024;

const STATUS_STYLE: Record<UniversityInfoStatus, string> = {
  none: "bg-slate-100 text-slate-700",
  draft: "bg-amber-100 text-amber-800",
  published: "bg-emerald-100 text-emerald-800",
  changed: "bg-sky-100 text-sky-800",
};

function readAsDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(new Error("Could not read that file."));
    reader.readAsDataURL(file);
  });
}

function Thumb({ url, asset, onRemove, onCaption }: { url: string; asset: AssetRef; onRemove: () => void; onCaption: (value: string) => void }) {
  return (
    <div className="w-40 space-y-1">
      <AuthImage url={url} getToken={getToken} alt={asset.caption || "University image"} className="h-24 w-40 rounded-lg border border-slate-200 object-cover" />
      <Input placeholder="Caption (optional)" value={asset.caption} maxLength={200} onChange={(e) => onCaption(e.target.value)} />
      <button type="button" className="text-xs text-rose-600 hover:underline" onClick={onRemove}>Remove</button>
    </div>
  );
}

function Section({ title, hint, children, id }: { title: string; hint?: string; children: ReactNode; id: string }) {
  return (
    <Card className="mb-4 p-5">
      <div data-testid={`section-${id}`}>
        <h2 className="text-base font-semibold">{title}</h2>
        {hint && <p className="mt-0.5 text-sm text-slate-500">{hint}</p>}
        <div className="mt-4 space-y-4">{children}</div>
      </div>
    </Card>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <Label>{label}</Label>
      {children}
    </div>
  );
}

export function UniversityInfoEditor({ universityId, onBack }: { universityId: string; onBack: () => void }) {
  const [payload, setPayload] = useState<Payload | null>(null);
  const [info, setInfo] = useState<UniversityInfo>(emptyUniversityInfo());
  const [stamp, setStamp] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState("");
  const [message, setMessage] = useState("");
  const [errors, setErrors] = useState<string[]>([]);
  const [loadError, setLoadError] = useState("");
  const fileInput = useRef<HTMLInputElement | null>(null);
  const uploadTarget = useRef<{ kind: "image" | "pdf"; apply: (file: string) => void } | null>(null);

  const applyPayload = useCallback((data: Payload, keepEdits = false) => {
    setPayload(data);
    setStamp(data.info.draft_updated_at);
    if (!keepEdits) {
      // Start from what the admin last saved. A brand-new record starts from the catalogue's own facts only.
      const seeded = normalizeUniversityInfo(data.info.draft);
      if (!data.info.draft) {
        seeded.basic.name = data.university.name;
        seeded.basic.country = data.university.country;
        seeded.basic.city = data.university.city;
        seeded.links.website = data.university.website_url || "";
      }
      setInfo(seeded);
      setDirty(false);
    }
  }, []);

  useEffect(() => {
    let live = true;
    setPayload(null);
    setLoadError("");
    api<Payload>(`/admin/universities/${encodeURIComponent(universityId)}/info`)
      .then((data) => { if (live) applyPayload(data); })
      .catch((error: Error) => { if (live) setLoadError(error.message); });
    return () => { live = false; };
  }, [universityId, applyPayload]);

  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  const edit = (change: (draft: UniversityInfo) => void) => {
    setInfo((current) => {
      const next = JSON.parse(JSON.stringify(current)) as UniversityInfo;
      change(next);
      return next;
    });
    setDirty(true);
    setMessage("");
  };

  const status: UniversityInfoStatus = useMemo(() => {
    if (!payload) return "none";
    // Unsaved edits to a published university count as newer unpublished changes.
    if (dirty && payload.info.published) return "changed";
    if (dirty && payload.info.status === "none") return "draft";
    return payload.info.status;
  }, [payload, dirty]);

  const showProblems = (error: unknown) => {
    const list = (error as { problems?: { field: string; message: string }[] })?.problems;
    setErrors(list?.length ? list.map((item) => `${item.field}: ${item.message}`) : [error instanceof Error ? error.message : "Something went wrong."]);
  };

  /** api() throws a plain Error; re-read the body for the field list when the server sent one. */
  const send = async (path: string, method: string, body: unknown) => {
    const token = getToken();
    const response = await fetch(`/api${path}`, {
      method,
      headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: JSON.stringify(body),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw Object.assign(new Error(data.error || "Something went wrong."), { problems: data.problems });
    return data as Payload;
  };

  const base = `/admin/universities/${encodeURIComponent(universityId)}/info`;

  const save = async () => {
    setBusy("save"); setErrors([]); setMessage("");
    try {
      const data = await send(base, "PUT", { info, expected_updated_at: stamp });
      applyPayload(data);
      setMessage("Draft saved. Students cannot see it until you publish.");
    } catch (error) { showProblems(error); } finally { setBusy(""); }
  };

  const publish = async () => {
    setBusy("publish"); setErrors([]); setMessage("");
    try {
      const data = await send(`${base}/publish`, "POST", { info, expected_updated_at: stamp });
      applyPayload(data);
      setMessage("Published. Students can now see this information.");
    } catch (error) { showProblems(error); } finally { setBusy(""); }
  };

  const unpublish = async () => {
    if (!window.confirm("Hide this university's information from students? Your draft is kept.")) return;
    setBusy("unpublish"); setErrors([]); setMessage("");
    try {
      const data = await send(`${base}/unpublish`, "POST", {});
      applyPayload(data, dirty);
      setMessage("Unpublished. Students no longer see this information. Your draft is kept.");
    } catch (error) { showProblems(error); } finally { setBusy(""); }
  };

  // ---- uploads (images and brochures), through the server's validation
  const pickFile = (kind: "image" | "pdf", apply: (file: string) => void) => {
    uploadTarget.current = { kind, apply };
    if (fileInput.current) {
      fileInput.current.accept = kind === "pdf" ? "application/pdf" : "image/png,image/jpeg,image/webp,image/gif";
      fileInput.current.click();
    }
  };

  const onFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    const target = uploadTarget.current;
    if (!file || !target) return;
    setErrors([]); setMessage("");
    const limit = target.kind === "pdf" ? PDF_MAX : IMAGE_MAX;
    if (file.size > limit) { setErrors([`${file.name} is too large. ${target.kind === "pdf" ? "PDFs" : "Images"} can be at most ${limit / (1024 * 1024)} MB.`]); return; }
    setBusy("upload");
    try {
      const dataUrl = await readAsDataUrl(file);
      const result = await api<{ file: string }>(`/admin/universities/${encodeURIComponent(universityId)}/assets`, { method: "POST", body: { dataUrl } });
      target.apply(result.file);
    } catch (error) { showProblems(error); } finally { setBusy(""); }
  };

  const assetUrl = (file: string) => `/api/university-info/${encodeURIComponent(universityId)}/assets/${file}`;

  if (loadError) {
    return (
      <div>
        <Button variant="secondary" onClick={onBack}><ArrowLeft className="h-4 w-4" /> Back to universities</Button>
        <p className="mt-4 text-sm text-rose-600" role="alert">{loadError}</p>
      </div>
    );
  }
  if (!payload) return <p className="text-sm text-slate-500">Loading university information…</p>;

  const published = payload.info.published;
  const textInput = (value: string, set: (v: string) => void, props: { max?: number; placeholder?: string; type?: string } = {}) => (
    <Input type={props.type} value={value} maxLength={props.max} placeholder={props.placeholder} onChange={(e) => set(e.target.value)} />
  );

  return (
    <div data-testid="university-info-editor">
      <input ref={fileInput} type="file" className="hidden" onChange={(e) => void onFile(e)} data-testid="info-file-input" />
      <div className="sticky top-0 z-10 -mx-1 mb-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-100 bg-white/95 p-4 shadow-card backdrop-blur">
        <div className="min-w-0">
          <Button variant="ghost" size="sm" onClick={() => { if (!dirty || window.confirm("Leave without saving your changes?")) onBack(); }}>
            <ArrowLeft className="h-4 w-4" /> Back to universities
          </Button>
          <h1 className="mt-1 truncate text-xl font-bold" data-testid="editor-title">{payload.university.name}</h1>
          <p className="text-sm text-slate-500">{[payload.university.city, payload.university.country].filter(Boolean).join(", ")}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className={`rounded-full px-3 py-1 text-xs font-medium ${STATUS_STYLE[status]}`} data-testid="info-status">{STATUS_LABEL[status]}{dirty ? " (unsaved edits)" : ""}</span>
          <Button variant="secondary" disabled={Boolean(busy) || !dirty} onClick={() => void save()} data-testid="save-draft">{busy === "save" ? "Saving…" : "Save draft"}</Button>
          <Button disabled={Boolean(busy)} onClick={() => void publish()} data-testid="publish">{busy === "publish" ? "Publishing…" : published ? "Save & publish changes" : "Publish"}</Button>
          {published && <Button variant="danger" disabled={Boolean(busy)} onClick={() => void unpublish()} data-testid="unpublish">Unpublish</Button>}
        </div>
      </div>

      {message && <p className="mb-3 rounded-xl bg-emerald-50 px-4 py-2 text-sm text-emerald-800" role="status" data-testid="info-message">{message}</p>}
      {errors.length > 0 && (
        <div className="mb-3 rounded-xl bg-rose-50 px-4 py-3 text-sm text-rose-700" role="alert" data-testid="info-errors">
          <p className="font-medium">Nothing was saved. Please fix:</p>
          <ul className="mt-1 list-disc pl-5">{errors.map((line) => <li key={line}>{line}</li>)}</ul>
        </div>
      )}
      <p className="mb-4 text-sm text-slate-500">
        Only what you <strong>publish</strong> is visible to students. Leave a field empty if you do not have the information; nothing is filled in for you.
      </p>

      <Section id="basic" title="Basic details">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="University name">{textInput(info.basic.name, (v) => edit((d) => { d.basic.name = v; }), { max: 200 })}</Field>
          <Field label="Country">{textInput(info.basic.country, (v) => edit((d) => { d.basic.country = v; }), { max: 100 })}</Field>
          <Field label="City">{textInput(info.basic.city, (v) => edit((d) => { d.basic.city = v; }), { max: 100 })}</Field>
          <Field label="Campus location">{textInput(info.basic.campus_location, (v) => edit((d) => { d.basic.campus_location = v; }), { max: 300, placeholder: "Address or area of the main campus" })}</Field>
        </div>
        <Field label="Overview">
          <Textarea rows={5} maxLength={5000} value={info.basic.overview} onChange={(e) => edit((d) => { d.basic.overview = e.target.value; })} />
        </Field>
      </Section>

      <Section id="branding" title="Branding and images" hint="PNG, JPEG, WebP or GIF, up to 5 MB each.">
        <div>
          <Label>Logo</Label>
          {info.branding.logo ? (
            <Thumb url={assetUrl(info.branding.logo.file)} asset={info.branding.logo} onRemove={() => edit((d) => { d.branding.logo = null; })} onCaption={(v) => edit((d) => { if (d.branding.logo) d.branding.logo.caption = v; })} />
          ) : (
            <Button variant="secondary" size="sm" disabled={busy === "upload"} onClick={() => pickFile("image", (file) => edit((d) => { d.branding.logo = { file, caption: "" }; }))} data-testid="upload-logo">
              <ImagePlus className="h-4 w-4" /> Upload logo
            </Button>
          )}
        </div>
        {([["campus_images", "Campus images", 12], ["gallery", "Image gallery", 30]] as const).map(([key, title, max]) => (
          <div key={key}>
            <Label>{`${title} (${info.branding[key].length}/${max})`}</Label>
            <div className="flex flex-wrap gap-3">
              {info.branding[key].map((asset, index) => (
                <Thumb key={`${asset.file}-${index}`} url={assetUrl(asset.file)} asset={asset}
                  onRemove={() => edit((d) => { d.branding[key].splice(index, 1); })}
                  onCaption={(v) => edit((d) => { d.branding[key][index].caption = v; })} />
              ))}
              {info.branding[key].length < max && (
                <Button variant="secondary" size="sm" disabled={busy === "upload"} onClick={() => pickFile("image", (file) => edit((d) => { d.branding[key].push({ file, caption: "" }); }))} data-testid={`upload-${key}`}>
                  <ImagePlus className="h-4 w-4" /> Add image
                </Button>
              )}
            </div>
          </div>
        ))}
      </Section>

      <Section id="programs" title="Programmes" hint="Programmes you want students to see for this university.">
        {info.programs.map((program, index) => (
          <div key={index} className="grid gap-3 rounded-xl border border-slate-100 p-3 sm:grid-cols-4" data-testid="program-row">
            <Field label="Programme name">{textInput(program.name, (v) => edit((d) => { d.programs[index].name = v; }), { max: 200 })}</Field>
            <Field label="Degree level">
              <Select value={program.degree_level} onChange={(e) => edit((d) => { d.programs[index].degree_level = e.target.value; })}>
                <option value="">Not specified</option>
                {DEGREE_LEVELS.map((level) => <option key={level} value={level}>{level}</option>)}
              </Select>
            </Field>
            <Field label="Duration">{textInput(program.duration, (v) => edit((d) => { d.programs[index].duration = v; }), { max: 100, placeholder: "e.g. 1 year" })}</Field>
            <Field label="Available courses">{textInput(program.courses, (v) => edit((d) => { d.programs[index].courses = v; }), { max: 1000 })}</Field>
            <button type="button" className="text-left text-xs text-rose-600 hover:underline sm:col-span-4" onClick={() => edit((d) => { d.programs.splice(index, 1); })}><Trash2 className="mr-1 inline h-3 w-3" />Remove programme</button>
          </div>
        ))}
        <Button variant="secondary" size="sm" onClick={() => edit((d) => { d.programs.push({ name: "", degree_level: "", duration: "", courses: "" }); })} data-testid="add-program"><Plus className="h-4 w-4" /> Add programme</Button>
      </Section>

      <Section id="fees" title="Fees">
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Tuition fees">{textInput(info.fees.tuition, (v) => edit((d) => { d.fees.tuition = v; }), { max: 300, placeholder: "e.g. 21,000" })}</Field>
          <Field label="Currency (3 letters)">{textInput(info.fees.currency, (v) => edit((d) => { d.fees.currency = v.toUpperCase(); }), { max: 3, placeholder: "GBP" })}</Field>
          <Field label="Per">{textInput(info.fees.period, (v) => edit((d) => { d.fees.period = v; }), { max: 50, placeholder: "year / semester" })}</Field>
        </div>
        <Field label="Other cost information">
          <Textarea rows={3} maxLength={2000} value={info.fees.other_costs} onChange={(e) => edit((d) => { d.fees.other_costs = e.target.value; })} />
        </Field>
      </Section>

      <Section id="admission" title="Admission requirements">
        <Field label="Academic qualifications"><Textarea rows={3} maxLength={3000} value={info.admission.academic} onChange={(e) => edit((d) => { d.admission.academic = e.target.value; })} /></Field>
        <Field label="English-language requirements"><Textarea rows={3} maxLength={2000} value={info.admission.english} onChange={(e) => edit((d) => { d.admission.english = e.target.value; })} /></Field>
        <Field label="Other admission criteria"><Textarea rows={3} maxLength={3000} value={info.admission.other} onChange={(e) => edit((d) => { d.admission.other = e.target.value; })} /></Field>
      </Section>

      <Section id="intakes" title="Intakes and deadlines">
        {info.intakes.map((intake, index) => (
          <div key={index} className="grid gap-3 rounded-xl border border-slate-100 p-3 sm:grid-cols-3" data-testid="intake-row">
            <Field label="Intake">{textInput(intake.period, (v) => edit((d) => { d.intakes[index].period = v; }), { max: 100, placeholder: "e.g. Fall 2027" })}</Field>
            <Field label="Application deadline">{textInput(intake.deadline, (v) => edit((d) => { d.intakes[index].deadline = v; }), { type: "date" })}</Field>
            <Field label="Notes">{textInput(intake.notes, (v) => edit((d) => { d.intakes[index].notes = v; }), { max: 500 })}</Field>
            <button type="button" className="text-left text-xs text-rose-600 hover:underline sm:col-span-3" onClick={() => edit((d) => { d.intakes.splice(index, 1); })}><Trash2 className="mr-1 inline h-3 w-3" />Remove intake</button>
          </div>
        ))}
        <Button variant="secondary" size="sm" onClick={() => edit((d) => { d.intakes.push({ period: "", deadline: "", notes: "" }); })} data-testid="add-intake"><Plus className="h-4 w-4" /> Add intake</Button>
        <div className="border-t border-slate-100 pt-4">
          <Label>Other relevant dates</Label>
          {info.important_dates.map((item, index) => (
            <div key={index} className="mb-2 grid gap-3 sm:grid-cols-[1fr_12rem_auto]" data-testid="date-row">
              {textInput(item.label, (v) => edit((d) => { d.important_dates[index].label = v; }), { max: 200, placeholder: "e.g. Scholarship deadline" })}
              {textInput(item.date, (v) => edit((d) => { d.important_dates[index].date = v; }), { type: "date" })}
              <button type="button" aria-label="Remove date" className="text-rose-600" onClick={() => edit((d) => { d.important_dates.splice(index, 1); })}><Trash2 className="h-4 w-4" /></button>
            </div>
          ))}
          <Button variant="secondary" size="sm" onClick={() => edit((d) => { d.important_dates.push({ label: "", date: "" }); })}><Plus className="h-4 w-4" /> Add date</Button>
        </div>
      </Section>

      <Section id="links" title="Documents and links" hint="Official links must start with http:// or https://.">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Official website">{textInput(info.links.website, (v) => edit((d) => { d.links.website = v; }), { max: 500, placeholder: "https://" })}</Field>
          <Field label="Admissions page">{textInput(info.links.admissions_page, (v) => edit((d) => { d.links.admissions_page = v; }), { max: 500, placeholder: "https://" })}</Field>
        </div>
        <div>
          <Label>Other official links</Label>
          {info.links.other.map((link, index) => (
            <div key={index} className="mb-2 grid gap-3 sm:grid-cols-[14rem_1fr_auto]" data-testid="link-row">
              {textInput(link.label, (v) => edit((d) => { d.links.other[index].label = v; }), { max: 100, placeholder: "Label" })}
              {textInput(link.url, (v) => edit((d) => { d.links.other[index].url = v; }), { max: 500, placeholder: "https://" })}
              <button type="button" aria-label="Remove link" className="text-rose-600" onClick={() => edit((d) => { d.links.other.splice(index, 1); })}><Trash2 className="h-4 w-4" /></button>
            </div>
          ))}
          <Button variant="secondary" size="sm" onClick={() => edit((d) => { d.links.other.push({ label: "", url: "" }); })}><Plus className="h-4 w-4" /> Add link</Button>
        </div>
        <div className="border-t border-slate-100 pt-4">
          <Label>Brochures</Label>
          {info.brochures.map((brochure, index) => (
            <div key={index} className="mb-2 grid gap-3 sm:grid-cols-[14rem_1fr_auto]" data-testid="brochure-row">
              {textInput(brochure.label, (v) => edit((d) => { d.brochures[index].label = v; }), { max: 200, placeholder: "Title" })}
              {brochure.file ? (
                <button type="button" className="inline-flex items-center gap-2 text-left text-sm text-sky-700 hover:underline"
                  onClick={() => void openAssetInTab(assetUrl(brochure.file as string), getToken).catch((e: Error) => setErrors([e.message]))}>
                  <FileText className="h-4 w-4" /> Uploaded PDF - open
                </button>
              ) : (
                <div className="flex gap-2">
                  {textInput(brochure.url, (v) => edit((d) => { d.brochures[index].url = v; }), { max: 500, placeholder: "https:// link to a brochure" })}
                  <Button variant="secondary" size="sm" disabled={busy === "upload"} onClick={() => pickFile("pdf", (file) => edit((d) => { d.brochures[index].file = file; d.brochures[index].url = ""; }))}>
                    <Upload className="h-4 w-4" /> PDF
                  </Button>
                </div>
              )}
              <button type="button" aria-label="Remove brochure" className="text-rose-600" onClick={() => edit((d) => { d.brochures.splice(index, 1); })}><Trash2 className="h-4 w-4" /></button>
            </div>
          ))}
          <Button variant="secondary" size="sm" onClick={() => edit((d) => { d.brochures.push({ label: "", file: null, url: "" }); })} data-testid="add-brochure"><Plus className="h-4 w-4" /> Add brochure</Button>
        </div>
      </Section>
    </div>
  );
}
