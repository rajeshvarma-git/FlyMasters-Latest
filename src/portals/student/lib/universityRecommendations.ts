import { supabase } from '@student/integrations/supabase/client';

export interface UniversityRecommendation {
  id: string;
  name: string;
  location: string;
  programs: string[];
  tuitionFee: string;
  duration: string;
  deadline: string;
  languageReq: string;
  postStudyVisa: string;
  ranking: string;
  website?: string;
  imageUrl?: string | null;
}

const COUNTRY_ALIASES: Record<string, string> = {
  nepal: 'Nepal',
  usa: 'USA',
  us: 'USA',
  america: 'USA',
  'united states': 'USA',
  'united states of america': 'USA',
  uk: 'UK',
  britain: 'UK',
  england: 'UK',
  'united kingdom': 'UK',
  canada: 'Canada',
  australia: 'Australia',
  germany: 'Germany',
  ireland: 'Ireland',
  'new zealand': 'New Zealand',
  india: 'India',
  france: 'France',
  netherlands: 'Netherlands',
  holland: 'Netherlands',
  'the netherlands': 'Netherlands',
  'u.s.': 'USA',
  'u.s.a.': 'USA',
  'u.s.a': 'USA',
  'united states (usa)': 'USA',
  'great britain': 'UK',
  scotland: 'UK',
  wales: 'UK',
  'northern ireland': 'UK',
  'u.k.': 'UK',
  uae: 'UAE',
  'united arab emirates': 'UAE',
  'south korea': 'South Korea',
  korea: 'South Korea',
  'republic of korea': 'South Korea',
};

export function normalizeCountry(input: string | undefined): string {
  const raw = (input || '').trim();
  if (!raw) return '';
  return COUNTRY_ALIASES[raw.toLowerCase()] || raw.replace(/\b\w/g, (char) => char.toUpperCase());
}

export function inferStudyLevel(qualification: string | undefined): 'UG' | 'PG' {
  const text = (qualification || '').toLowerCase();
  if (/(12|twelfth|high school|\+2|plus two|intermediate|a[- ]?level|bachelor|b\.?tech|b\.?sc|undergraduate|ug\b)/.test(text)) {
    return 'UG';
  }
  return 'PG';
}

/**
 * True when both name the same country, whatever spelling each side uses
 * ("USA" in a student's plan, "United States" in the university catalogue).
 * Whole-word fallback only, so "UK" never matches "Ukraine".
 */
export function matchesCountry(universityCountry: string, wanted: string) {
  const a = normalizeCountry(universityCountry).toLowerCase();
  const b = normalizeCountry(wanted).toLowerCase();
  if (!a || !b) return false;
  if (a === b) return true;
  const word = (hay: string, needle: string) => new RegExp(`\\b${needle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`).test(hay);
  return word(a, b) || word(b, a);
}

export function matchesAnyCountry(universityCountry: string, wanted: string[]) {
  return wanted.some((item) => matchesCountry(universityCountry, normalizeCountry(item)));
}

export async function getRecommendationsForProfile(conversationData: Record<string, any>): Promise<UniversityRecommendation[]> {
  const country = normalizeCountry(conversationData.country);

  const { data: rows } = await supabase
    .from('universities')
    .select('*')
    .eq('is_active', true);

  const matched = (rows || []).filter((row) => matchesCountry(row.country, country));

  if (matched.length > 0) {
    return matched.slice(0, 6).map((uni) => ({
      id: uni.id,
      name: uni.name,
      location: [uni.city, uni.country].filter(Boolean).join(', '),
      programs: ["Course availability needs confirmation"],
      tuitionFee: 'Contact for fees',
      duration: 'Duration to be confirmed',
      deadline: 'Deadline to be confirmed',
      languageReq: 'Entry requirements to be confirmed',
      postStudyVisa: 'Check official visa guidance for your nationality and course',
      ranking: uni.ranking ? `Ranked #${uni.ranking}` : 'University catalogue',
      website: uni.website_url || undefined,
      imageUrl: uni.campus_image_url || uni.logo_url || null,
    }));
  }

  return [];
}
