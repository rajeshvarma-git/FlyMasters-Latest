import { normalizeCountry } from '@student/lib/universityRecommendations';

export const SUPPORTED_COUNTRIES = [
  'USA',
  'UK',
  'Canada',
  'Australia',
  'Germany',
  'Ireland',
  'New Zealand',
  'India',
  'Nepal',
  'France',
  'Netherlands',
] as const;

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

const GIBBERISH = /^[bcdfghjklmnpqrstvwxyz\d]{5,}$/i;

export function isValidCountry(input: string): boolean {
  const trimmed = input.trim();
  if (!trimmed) return false;
  const normalized = normalizeCountry(trimmed);
  if (SUPPORTED_COUNTRIES.includes(normalized as (typeof SUPPORTED_COUNTRIES)[number])) {
    return true;
  }
  return trimmed.toLowerCase() in COUNTRY_ALIASES;
}

export function formatCountryList() {
  return 'USA, UK, Canada, Australia, Germany, Ireland, New Zealand, India, or Nepal';
}

export function validateChatStep(
  stepKey: string,
  value: string
): { valid: boolean; error?: string; normalized?: string } {
  const trimmed = value.trim();

  if (!trimmed) {
    return { valid: false, error: 'Please enter an answer before continuing.' };
  }

  switch (stepKey) {
    case 'country': {
      if (!isValidCountry(trimmed)) {
        return {
          valid: false,
          error: `Please enter a supported study destination such as ${formatCountryList()}.`,
        };
      }
      return { valid: true, normalized: normalizeCountry(trimmed) };
    }

    case 'qualification': {
      if (!/[a-zA-Z]/.test(trimmed) || GIBBERISH.test(trimmed.replace(/\s/g, ''))) {
        return {
          valid: false,
          error: "Please enter your qualification (for example 12th, Bachelor's, or Master's).",
        };
      }
      return { valid: true };
    }

    case 'streamOrProgram': {
      if (trimmed.length < 3 || !/[a-zA-Z]{3,}/.test(trimmed) || GIBBERISH.test(trimmed.replace(/\s/g, ''))) {
        return {
          valid: false,
          error: 'Please enter a real field of study (for example Computer Science, Business, or Nursing).',
        };
      }
      return { valid: true };
    }

    case 'academicScore': {
      if (!/\d/.test(trimmed)) {
        return {
          valid: false,
          error: 'Please enter your score with numbers (for example 85%, 3.5 GPA, or 8.2 CGPA).',
        };
      }
      return { valid: true };
    }

    case 'budget': {
      if (!/\d/.test(trimmed)) {
        return {
          valid: false,
          error: 'Please enter your budget with an amount (for example 20 lakhs, $25,000, or ₹15,00,000).',
        };
      }
      return { valid: true };
    }

    default:
      return { valid: true };
  }
}
