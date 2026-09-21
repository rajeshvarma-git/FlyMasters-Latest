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

function programTitle(level: 'UG' | 'PG', stream: string) {
  const field = (stream || 'your chosen field').trim();
  return level === 'UG' ? `Bachelor in ${field}` : `Master in ${field}`;
}

function visaInfo(country: string) {
  const map: Record<string, string> = {
    Nepal: 'Study in Nepal — no overseas student visa required for Nepali citizens',
    USA: '12 months OPT + 24 months STEM extension',
    UK: '2 years Graduate visa',
    Canada: '3 years Post-graduation work permit',
    Australia: '2-4 years Temporary Graduate visa',
    Germany: '18 months job search visa',
    India: 'Domestic study — no student visa for Indian citizens',
  };
  return map[country] || 'Check local student visa rules for this destination';
}

export function matchesCountry(universityCountry: string, wanted: string) {
  const a = universityCountry.toLowerCase();
  const b = wanted.toLowerCase();
  return a === b || a.includes(b) || b.includes(a);
}

export function matchesAnyCountry(universityCountry: string, wanted: string[]) {
  return wanted.some((item) => matchesCountry(universityCountry, normalizeCountry(item)));
}

export async function getRecommendationsForProfile(conversationData: Record<string, any>): Promise<UniversityRecommendation[]> {
  const country = normalizeCountry(conversationData.country);
  const level = inferStudyLevel(conversationData.qualification);
  const stream = conversationData.streamOrProgram || 'your chosen field';

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
      programs: [programTitle(level, stream)],
      tuitionFee: 'Contact for fees',
      duration: level === 'UG' ? '3-4 years' : '1-2 years',
      deadline: 'Rolling admissions',
      languageReq: country === 'Nepal' || country === 'India' ? 'English or local language as required' : 'IELTS 6.5+ or TOEFL 80+',
      postStudyVisa: visaInfo(country),
      ranking: uni.ranking ? `Ranked #${uni.ranking}` : 'Partner university',
      website: uni.website_url || undefined,
    }));
  }

  return [];
}
