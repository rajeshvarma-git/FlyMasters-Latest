/**
 * Which students a required document (a `document_checklists` row) applies to.
 *
 * One rule, used everywhere a checklist is built — the student portal's
 * Documents page (through the data policy), the counsellor's and the admin's
 * per-student checklist — so the three can never disagree again.
 *
 * A row can be aimed at:
 *   - specific students       student_ids: [user or lead ids]   (overrides everything else;
 *                             audience: "students" with no ids applies to nobody)
 *   - one counsellor's students counselor_scope_ids: [that counsellor's ids]
 *   - countries                countries: ["Canada", ...] or ["All"]
 *   - staff only               staff_only: true — never shown to or asked of a student
 *
 * Degree level is no longer offered when creating a document (the client
 * asked for countries and students instead). Old rows that carry a specific
 * degree keep it, so nothing that already existed changes meaning.
 */

const COUNTRY_ALIASES = {
  usa: "USA", us: "USA", america: "USA", "united states": "USA", "united states of america": "USA",
  "u.s.": "USA", "u.s.a.": "USA", "u.s.a": "USA", "united states (usa)": "USA",
  uk: "UK", britain: "UK", england: "UK", "united kingdom": "UK", "great britain": "UK", scotland: "UK",
  wales: "UK", "northern ireland": "UK", "u.k.": "UK",
  canada: "Canada", australia: "Australia", germany: "Germany", ireland: "Ireland",
  "new zealand": "New Zealand", india: "India", nepal: "Nepal", france: "France",
  netherlands: "Netherlands", holland: "Netherlands", "the netherlands": "Netherlands",
  uae: "UAE", "united arab emirates": "UAE",
};

export function normalizeCountry(input) {
  const raw = String(input || "").trim();
  if (!raw) return "";
  return COUNTRY_ALIASES[raw.toLowerCase()] || raw.replace(/\b\w/g, (c) => c.toUpperCase());
}

export function sameCountry(a, b) {
  const x = normalizeCountry(a).toLowerCase();
  const y = normalizeCountry(b).toLowerCase();
  return Boolean(x && y && x === y);
}

const DEGREE_ALIASES = {
  bachelor: "bachelors", bachelors: "bachelors", "bachelor's": "bachelors", ug: "bachelors",
  master: "masters", masters: "masters", "master's": "masters", pg: "masters",
  phd: "phd", doctorate: "phd",
};

function normalizeDegree(value) {
  const raw = String(value || "").trim().toLowerCase();
  return DEGREE_ALIASES[raw] || raw;
}

const list = (value) => (Array.isArray(value) ? value : value == null || value === "" ? [] : [value])
  .map((item) => String(item).trim())
  .filter(Boolean);

/** True for a row created as "particular students" (as opposed to an explicit all-students one). */
export function isStudentAudience(item) {
  return String(item?.audience || "").toLowerCase() === "students";
}

/** The countries a row is limited to; [] means every country. */
export function documentCountries(item) {
  const countries = [...list(item?.countries), ...(list(item?.countries).length ? [] : list(item?.country))];
  if (!countries.length || countries.some((c) => c.toLowerCase() === "all")) return [];
  return [...new Set(countries.map(normalizeCountry))];
}

/**
 * @param item     a document_checklists row
 * @param student  { ids: Iterable<string> (user id + lead ids), countries: string[], degree?: string, counselorIds?: Iterable<string> }
 * @param options  { includeStaffOnly }  staff-facing lists pass true
 */
export function documentAppliesToStudent(item, student, { includeStaffOnly = false } = {}) {
  if (!item || item.is_active === false) return false;
  if (item.staff_only && !includeStaffOnly) return false;

  const ids = new Set([...(student?.ids || [])].map(String).filter(Boolean));
  const targets = list(item.student_ids);
  if (targets.length) return targets.some((id) => ids.has(id));
  // A document created for named students that somehow has none left goes to
  // nobody — it must never quietly widen to a whole country.
  if (isStudentAudience(item)) return false;

  const scope = list(item.counselor_scope_ids);
  if (scope.length) {
    const mine = new Set([...(student?.counselorIds || [])].map(String).filter(Boolean));
    if (!scope.some((id) => mine.has(id))) return false;
  }

  const countries = documentCountries(item);
  if (countries.length) {
    const wanted = (student?.countries || []).map(normalizeCountry).filter(Boolean);
    if (!wanted.some((country) => countries.some((c) => sameCountry(c, country)))) return false;
  }

  const degrees = [...list(item.degree_types), ...(list(item.degree_types).length ? [] : list(item.degree_type))]
    .map(normalizeDegree);
  if (degrees.length && !degrees.includes("all") && student?.degree) {
    if (!degrees.includes(normalizeDegree(student.degree))) return false;
  }
  return true;
}

const typeKey = (value) => String(value || "").trim().toLowerCase();

/**
 * Whether `documentType` is a staff-only document for this student: some row
 * with that name is staff-only, and no ordinary (students-can-see-it) row with
 * the same name applies to the student. Names are compared ignoring case and
 * surrounding spaces, so a different spelling of the name cannot slip past.
 * Upload permission, document requests, record reads and file access all use
 * this one rule, so "Hidden from students" means the same everywhere.
 *
 * @param items    document_checklists rows
 * @param student  the shape documentAppliesToStudent wants ({ ids, countries, ... })
 */
export function isStaffOnlyDocumentType(items, student, documentType) {
  const key = typeKey(documentType);
  if (!key) return false;
  const same = (items || []).filter((item) => typeKey(item?.document_type) === key);
  if (!same.some((item) => item.staff_only)) return false;
  return !same.some((item) => !item.staff_only && documentAppliesToStudent(item, student));
}

/** Lower-cased names of every document type that is staff-only for this student. */
export function staffOnlyDocumentTypes(items, student) {
  const names = new Set((items || []).filter((item) => item?.staff_only).map((item) => typeKey(item.document_type)).filter(Boolean));
  return new Set([...names].filter((name) => isStaffOnlyDocumentType(items, student, name)));
}

/** A student lead row → the shape documentAppliesToStudent wants. */
export function studentForTargeting(lead, extraIds = []) {
  const prefs = lead?.preferences && typeof lead.preferences === "object" ? lead.preferences : {};
  const countries = list(lead?.preferred_countries).length
    ? list(lead.preferred_countries)
    : list(prefs.interested_countries);
  return {
    ids: [lead?.id, lead?.user_id, ...extraIds].filter(Boolean).map(String),
    countries,
    degree: lead?.qualification_level || lead?.degree_level || prefs.degree_level || "",
    counselorIds: [lead?.assigned_counselor_id].filter(Boolean).map(String),
  };
}
