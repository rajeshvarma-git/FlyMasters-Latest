/**
 * University information as the admin writes it and the student reads it.
 * The server (server/lib/universityInfo.mjs) is the authority on what is
 * valid; these types only describe the shape it returns.
 */
export const DEGREE_LEVELS = ["Bachelors", "Masters", "PhD", "Diploma", "Certificate", "Other"] as const;

export type AssetRef = { file: string; caption: string };
export type UniversityInfo = {
  basic: { name: string; country: string; city: string; campus_location: string; overview: string };
  branding: { logo: AssetRef | null; campus_images: AssetRef[]; gallery: AssetRef[] };
  programs: { name: string; degree_level: string; duration: string; courses: string }[];
  fees: { tuition: string; currency: string; period: string; other_costs: string };
  admission: { academic: string; english: string; other: string };
  intakes: { period: string; deadline: string; notes: string }[];
  important_dates: { label: string; date: string }[];
  links: { website: string; admissions_page: string; other: { label: string; url: string }[] };
  brochures: { label: string; file: string | null; url: string }[];
};

export type UniversityInfoStatus = "none" | "draft" | "published" | "changed";

export function emptyUniversityInfo(): UniversityInfo {
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

/** Fills any section a stored record lacks, so screens can rely on the full shape. */
export function normalizeUniversityInfo(value: Partial<UniversityInfo> | null | undefined): UniversityInfo {
  const empty = emptyUniversityInfo();
  if (!value) return empty;
  return {
    basic: { ...empty.basic, ...(value.basic || {}) },
    branding: { ...empty.branding, ...(value.branding || {}) },
    programs: value.programs || [],
    fees: { ...empty.fees, ...(value.fees || {}) },
    admission: { ...empty.admission, ...(value.admission || {}) },
    intakes: value.intakes || [],
    important_dates: value.important_dates || [],
    links: { ...empty.links, ...(value.links || {}), other: value.links?.other || [] },
    brochures: value.brochures || [],
  };
}

export const STATUS_LABEL: Record<UniversityInfoStatus, string> = {
  none: "No information yet",
  draft: "Draft - not visible to students",
  published: "Published",
  changed: "Published - newer edits not published",
};

export function formatDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isNaN(date.getTime())
    ? value
    : date.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric", timeZone: "UTC" });
}
