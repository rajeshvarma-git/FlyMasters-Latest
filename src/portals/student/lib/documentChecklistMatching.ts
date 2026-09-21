import { normalizeCountry } from '@student/lib/universityRecommendations';

export interface StudentDocumentProfile {
  countries: string[];
  degreeLevel: string;
  universityIds: string[];
}

export interface DocumentChecklistRecord {
  id: string;
  document_type: string;
  description: string | null;
  is_required: boolean;
  max_file_size_mb: number;
  allowed_file_types: string[];
  country?: string;
  countries?: string[] | null;
  degree_type?: string;
  degree_types?: string[] | null;
  university_id?: string | null;
  display_order?: number | null;
  is_active?: boolean;
}

const DEGREE_ALIASES: Record<string, string> = {
  all: 'All',
  bachelor: 'Bachelors',
  bachelors: 'Bachelors',
  "bachelor's": 'Bachelors',
  master: 'Masters',
  masters: 'Masters',
  "master's": 'Masters',
  phd: 'PhD',
  doctorate: 'PhD',
  diploma: 'Diploma',
  certificate: 'Certificate',
};

export function normalizeDegreeLevel(value: string | undefined | null): string {
  const raw = (value || '').trim();
  if (!raw) return '';
  const alias = DEGREE_ALIASES[raw.toLowerCase()];
  if (alias) return alias;
  return raw.replace(/\b\w/g, (char) => char.toUpperCase());
}

function checklistCountries(item: DocumentChecklistRecord): string[] {
  return [item.country, ...(item.countries || [])]
    .filter(Boolean)
    .map((country) => normalizeCountry(String(country)).toLowerCase())
    .filter(Boolean);
}

function checklistDegrees(item: DocumentChecklistRecord): string[] {
  const types = item.degree_types?.length
    ? item.degree_types
    : item.degree_type
      ? [item.degree_type]
      : [];
  return types.map((degree) => normalizeDegreeLevel(String(degree))).filter(Boolean);
}

export function matchesDocumentChecklist(
  item: DocumentChecklistRecord,
  profile: StudentDocumentProfile
): boolean {
  if (item.is_active === false) return false;

  const profileCountries = profile.countries
    .map((country) => normalizeCountry(country).toLowerCase())
    .filter(Boolean);
  const profileDegree = normalizeDegreeLevel(profile.degreeLevel) || 'Masters';
  const itemCountries = checklistCountries(item);
  const itemDegrees = checklistDegrees(item);

  const countryOk =
    profileCountries.length === 0 ||
    itemCountries.includes('all') ||
    itemCountries.some((country) => profileCountries.includes(country));

  const degreeOk =
    itemDegrees.length === 0 ||
    itemDegrees.includes('All') ||
    itemDegrees.some((degree) => degree.toLowerCase() === profileDegree.toLowerCase());

  const universityOk =
    !item.university_id ||
    profile.universityIds.includes(item.university_id);

  return countryOk && degreeOk && universityOk;
}

export function filterDocumentChecklistsForProfile(
  items: DocumentChecklistRecord[],
  profile: StudentDocumentProfile
): DocumentChecklistRecord[] {
  const matched = items.filter((item) => matchesDocumentChecklist(item, profile));
  const unique = new Map<string, DocumentChecklistRecord>();

  matched
    .sort((a, b) => (a.display_order ?? 999) - (b.display_order ?? 999))
    .forEach((item) => {
      if (!unique.has(item.document_type)) {
        unique.set(item.document_type, item);
      }
    });

  return Array.from(unique.values());
}
