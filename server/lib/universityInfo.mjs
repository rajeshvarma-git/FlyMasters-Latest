/**
 * University information: what an admin writes about a university, and what a
 * student is allowed to see of it.
 *
 * The university itself (id, name, country, city) is the catalogue record the
 * CSV import creates, with a stable id `uni-<hash of country|name>`. That
 * import deletes and recreates its rows, so nothing an admin writes may live
 * on it. The writing lives in one `university_profiles` record per university
 * id, with two copies side by side:
 *
 *   draft      what the admin is editing. Never shown to a student.
 *   published  a frozen snapshot of a draft the admin chose to publish.
 *              This is the only copy a student can read.
 *
 * Everything here is pure (no database) so the rules can be tested directly.
 */
import crypto from "crypto";

export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
export const MAX_PDF_BYTES = 15 * 1024 * 1024;
export const MAX_ASSETS_PER_UNIVERSITY = 80;

export const DEGREE_LEVELS = ["Bachelors", "Masters", "PhD", "Diploma", "Certificate", "Other"];

/** Uploads we accept, by detected type. SVG is deliberately absent: it can carry script. */
export const ASSET_TYPES = {
  "image/png": { ext: "png", max: MAX_IMAGE_BYTES, kind: "image" },
  "image/jpeg": { ext: "jpg", max: MAX_IMAGE_BYTES, kind: "image" },
  "image/webp": { ext: "webp", max: MAX_IMAGE_BYTES, kind: "image" },
  "image/gif": { ext: "gif", max: MAX_IMAGE_BYTES, kind: "image" },
  "application/pdf": { ext: "pdf", max: MAX_PDF_BYTES, kind: "pdf" },
};

export const UNIVERSITY_ID = /^[A-Za-z0-9][A-Za-z0-9_-]{0,119}$/;
export const ASSET_FILE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(png|jpg|webp|gif|pdf)$/;

export function assetPath(universityId, file) {
  return `university-assets/${universityId}/${file}`;
}

/** Real content of the file decides its type, not the name or the data URL header. */
export function sniffType(buffer) {
  if (buffer.length >= 8 && buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return "image/png";
  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return "image/jpeg";
  if (buffer.length >= 6 && /^GIF8[79]a$/.test(buffer.subarray(0, 6).toString("latin1"))) return "image/gif";
  if (buffer.length >= 12 && buffer.subarray(0, 4).toString("latin1") === "RIFF" && buffer.subarray(8, 12).toString("latin1") === "WEBP") return "image/webp";
  if (buffer.length >= 5 && buffer.subarray(0, 5).toString("latin1") === "%PDF-") return "application/pdf";
  return null;
}

/** Splits `data:<mime>;base64,<payload>` and checks the payload really is that kind of file. */
export function parseUpload(dataUrl) {
  const match = /^data:([a-z0-9.+/-]+);base64,([A-Za-z0-9+/=\s]+)$/i.exec(String(dataUrl || ""));
  if (!match) return { error: "Upload a PNG, JPEG, WebP, GIF image or a PDF." };
  const claimed = match[1].toLowerCase();
  const buffer = Buffer.from(match[2].replace(/\s+/g, ""), "base64");
  if (!buffer.length) return { error: "The file is empty." };
  const actual = sniffType(buffer);
  const rule = actual && ASSET_TYPES[actual];
  if (!rule) return { error: "Only PNG, JPEG, WebP, GIF images and PDF files are allowed." };
  if (claimed !== actual && !(claimed === "image/jpg" && actual === "image/jpeg")) {
    return { error: "The file content does not match its type." };
  }
  if (buffer.length > rule.max) {
    return { error: `${rule.kind === "pdf" ? "PDFs" : "Images"} can be at most ${Math.floor(rule.max / (1024 * 1024))} MB.` };
  }
  return { buffer, mime: actual, ext: rule.ext, kind: rule.kind };
}

// ---------------------------------------------------------------- sanitising

const CONTROL = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g;

function clean(value, max) {
  return String(value == null ? "" : value).replace(CONTROL, "").replace(/\r\n?/g, "\n").trim().slice(0, max);
}

/** http(s) only, no embedded credentials. Returns the normalised URL or "". */
export function safeUrl(value) {
  const text = clean(value, 500);
  if (!text) return "";
  try {
    const url = new URL(text);
    if (!/^https?:$/.test(url.protocol)) return null;
    if (url.username || url.password) return null;
    if (!url.hostname || !/[.]|^localhost$/i.test(url.hostname)) return null;
    return url.toString();
  } catch {
    return null;
  }
}

function isoDate(value) {
  const text = clean(value, 10);
  if (!text) return "";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) return null;
  const date = new Date(`${text}T00:00:00Z`);
  return Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== text ? null : text;
}

export function emptyInfo() {
  return {
    basic: { name: "", country: "", city: "", campus_location: "", overview: "" },
    branding: { logo: null, campus_images: [], gallery: [] },
    programs: [],
    fees: { tuition: "", currency: "", period: "", other_costs: "" },
    admission: { academic: "", english: "", other: "" },
    intakes: [],
    important_dates: [],
    links: { website: "", admissions_page: "", other: [] },
    brochures: [],
  };
}

/**
 * Turns whatever the browser sent into a clean info object, or a list of
 * problems. Unknown keys are dropped. `knownAssets` is the set of file names
 * that actually exist for this university, so a record can only point at its
 * own uploads.
 */
export function sanitizeInfo(input, knownAssets = new Set()) {
  const errors = [];
  const src = input && typeof input === "object" && !Array.isArray(input) ? input : {};
  const out = emptyInfo();
  const bad = (field, message) => errors.push({ field, message });
  const list = (value, max, field) => {
    if (value == null) return [];
    if (!Array.isArray(value)) { bad(field, "Must be a list."); return []; }
    if (value.length > max) bad(field, `At most ${max} entries.`);
    return value.slice(0, max);
  };
  const obj = (value) => (value && typeof value === "object" && !Array.isArray(value) ? value : {});
  const text = (value, max, field) => {
    const raw = String(value == null ? "" : value);
    if (raw.length > max) bad(field, `At most ${max} characters.`);
    return clean(raw, max);
  };
  const asset = (value, field, kind) => {
    const ref = obj(value);
    const file = clean(ref.file, 80);
    if (!file) return null;
    if (!ASSET_FILE.test(file)) { bad(field, "Not a valid uploaded file."); return null; }
    if (!knownAssets.has(file)) { bad(field, "That file was not uploaded for this university."); return null; }
    const isPdf = file.endsWith(".pdf");
    if (kind === "image" && isPdf) { bad(field, "This must be an image."); return null; }
    if (kind === "pdf" && !isPdf) { bad(field, "This must be a PDF."); return null; }
    return { file, caption: text(ref.caption, 200, `${field}.caption`) };
  };
  const url = (value, field) => {
    const result = safeUrl(value);
    if (result === null) { bad(field, "Enter a full web address starting with http:// or https://"); return ""; }
    return result;
  };
  const date = (value, field) => {
    const result = isoDate(value);
    if (result === null) { bad(field, "Use a real date (YYYY-MM-DD)."); return ""; }
    return result;
  };

  const basic = obj(src.basic);
  out.basic = {
    name: text(basic.name, 200, "basic.name"),
    country: text(basic.country, 100, "basic.country"),
    city: text(basic.city, 100, "basic.city"),
    campus_location: text(basic.campus_location, 300, "basic.campus_location"),
    overview: text(basic.overview, 5000, "basic.overview"),
  };

  const branding = obj(src.branding);
  out.branding.logo = asset(branding.logo, "branding.logo", "image");
  out.branding.campus_images = list(branding.campus_images, 12, "branding.campus_images")
    .map((item, i) => asset(item, `branding.campus_images[${i}]`, "image")).filter(Boolean);
  out.branding.gallery = list(branding.gallery, 30, "branding.gallery")
    .map((item, i) => asset(item, `branding.gallery[${i}]`, "image")).filter(Boolean);

  out.programs = list(src.programs, 100, "programs").map((item, i) => {
    const row = obj(item);
    const level = clean(row.degree_level, 30);
    if (level && !DEGREE_LEVELS.includes(level)) bad(`programs[${i}].degree_level`, `Choose one of: ${DEGREE_LEVELS.join(", ")}.`);
    return {
      name: text(row.name, 200, `programs[${i}].name`),
      degree_level: DEGREE_LEVELS.includes(level) ? level : "",
      duration: text(row.duration, 100, `programs[${i}].duration`),
      courses: text(row.courses, 1000, `programs[${i}].courses`),
    };
  }).filter((row, i) => {
    const any = row.name || row.degree_level || row.duration || row.courses;
    if (any && !row.name) bad(`programs[${i}].name`, "Each programme needs a name.");
    return Boolean(any);
  });

  const fees = obj(src.fees);
  const currency = clean(fees.currency, 3).toUpperCase();
  if (clean(fees.currency, 10) && !/^[A-Z]{3}$/.test(clean(fees.currency, 10).toUpperCase())) bad("fees.currency", "Use a 3-letter currency code such as USD, GBP, EUR, INR.");
  out.fees = {
    tuition: text(fees.tuition, 300, "fees.tuition"),
    currency: /^[A-Z]{3}$/.test(currency) ? currency : "",
    period: text(fees.period, 50, "fees.period"),
    other_costs: text(fees.other_costs, 2000, "fees.other_costs"),
  };

  const admission = obj(src.admission);
  out.admission = {
    academic: text(admission.academic, 3000, "admission.academic"),
    english: text(admission.english, 2000, "admission.english"),
    other: text(admission.other, 3000, "admission.other"),
  };

  out.intakes = list(src.intakes, 12, "intakes").map((item, i) => {
    const row = obj(item);
    return {
      period: text(row.period, 100, `intakes[${i}].period`),
      deadline: date(row.deadline, `intakes[${i}].deadline`),
      notes: text(row.notes, 500, `intakes[${i}].notes`),
    };
  }).filter((row, i) => {
    const any = row.period || row.deadline || row.notes;
    if (any && !row.period) bad(`intakes[${i}].period`, "Each intake needs a name, for example Fall 2027.");
    return Boolean(any);
  });

  out.important_dates = list(src.important_dates, 30, "important_dates").map((item, i) => {
    const row = obj(item);
    return { label: text(row.label, 200, `important_dates[${i}].label`), date: date(row.date, `important_dates[${i}].date`) };
  }).filter((row, i) => {
    const any = row.label || row.date;
    if (any && (!row.label || !row.date)) bad(`important_dates[${i}]`, "Each date needs a label and a date.");
    return Boolean(any);
  });

  const links = obj(src.links);
  out.links = {
    website: url(links.website, "links.website"),
    admissions_page: url(links.admissions_page, "links.admissions_page"),
    other: list(links.other, 20, "links.other").map((item, i) => {
      const row = obj(item);
      return { label: text(row.label, 100, `links.other[${i}].label`), url: url(row.url, `links.other[${i}].url`) };
    }).filter((row, i) => {
      const any = row.label || row.url;
      if (any && (!row.label || !row.url)) bad(`links.other[${i}]`, "Each link needs a label and a web address.");
      return Boolean(any);
    }),
  };

  out.brochures = list(src.brochures, 20, "brochures").map((item, i) => {
    const row = obj(item);
    const file = asset(row.file ? { file: row.file, caption: "" } : null, `brochures[${i}].file`, "pdf");
    return { label: text(row.label, 200, `brochures[${i}].label`), file: file ? file.file : null, url: url(row.url, `brochures[${i}].url`) };
  }).filter((row, i) => {
    const any = row.label || row.file || row.url;
    if (any && !row.label) bad(`brochures[${i}].label`, "Each brochure needs a title.");
    if (any && !row.file && !row.url) bad(`brochures[${i}]`, "Upload a PDF or give a web address.");
    return Boolean(any);
  });

  return { info: out, errors };
}

/** Does this info say anything at all? A publish with nothing in it is refused. */
export function hasContent(info) {
  if (!info) return false;
  const b = info.basic || {};
  return Boolean(
    b.overview || b.campus_location
    || info.branding?.logo || info.branding?.campus_images?.length || info.branding?.gallery?.length
    || info.programs?.length
    || info.fees?.tuition || info.fees?.other_costs
    || info.admission?.academic || info.admission?.english || info.admission?.other
    || info.intakes?.length || info.important_dates?.length
    || info.links?.website || info.links?.admissions_page || info.links?.other?.length
    || info.brochures?.length,
  );
}

/** Every uploaded file a piece of info points at. */
export function assetFilesIn(info) {
  const files = new Set();
  if (!info) return files;
  if (info.branding?.logo?.file) files.add(info.branding.logo.file);
  for (const item of info.branding?.campus_images || []) files.add(item.file);
  for (const item of info.branding?.gallery || []) files.add(item.file);
  for (const item of info.brochures || []) if (item.file) files.add(item.file);
  return files;
}

export function infoHash(info) {
  return crypto.createHash("sha1").update(JSON.stringify(info || null)).digest("hex");
}

export const profileRecordId = (universityId) => `uniinfo-${universityId}`;

/** published | changed (published, with newer unpublished edits) | draft | none */
export function statusOf(record) {
  if (!record) return "none";
  if (record.published) return record.draft && infoHash(record.draft) !== record.published_hash ? "changed" : "published";
  return record.draft ? "draft" : "none";
}

/** What a student may be told: the published copy only, with no admin bookkeeping. */
export function studentView(record, base) {
  if (!record || !record.published) return { university: base || null, info: null };
  return {
    university: base || null,
    info: record.published,
    published_at: record.published_at || null,
  };
}
