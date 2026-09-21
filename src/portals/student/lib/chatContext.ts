import { normalizeCountry } from '@student/lib/universityRecommendations';
import { isValidCountry } from '@student/lib/chatValidation';

export type ChatStepKey =
  | 'country'
  | 'qualification'
  | 'streamOrProgram'
  | 'academicScore'
  | 'budget';

export interface ChatContext {
  fullName?: string;
  email?: string;
  phone?: string;
  country?: string;
  qualification?: string;
  streamOrProgram?: string;
  academicScore?: string;
  budget?: string;
}

export interface ChatStep {
  key: ChatStepKey;
  question: string;
  reply: (value: string) => string;
  finalReply?: (value: string) => string;
}

export const ACADEMIC_STEPS: ChatStep[] = [
  {
    key: 'country',
    question: 'Which country would you love to study in? (For example: USA, UK, Canada, Australia, Germany, or Nepal)',
    reply: (value) =>
      `Great choice — ${value}! What is your highest qualification? (for example 12th, Bachelor's, or Master's)`,
  },
  {
    key: 'qualification',
    question: "What is your highest qualification?",
    reply: (value) =>
      `Got it, ${value}. Which field or program are you most interested in? (for example Computer Science, Business, or Nursing)`,
  },
  {
    key: 'streamOrProgram',
    question: 'Which field of study interests you?',
    reply: (value) =>
      `${value} is a strong path. What is your academic score — percentage or GPA?`,
  },
  {
    key: 'academicScore',
    question: 'What is your academic score?',
    reply: (value) =>
      `Thanks, ${value} noted. What is your estimated study budget? (for example 20 lakhs or $25,000)`,
  },
  {
    key: 'budget',
    question: 'What is your study budget?',
    reply: (value) => `Budget noted: ${value}.`,
    finalReply: () => 'Perfect — I have everything I need. Let me find universities that match your profile.',
  },
];

type AuthUser = { id?: string; email?: string | null } | null;
type UserProfile = {
  full_name?: string | null;
  first_name?: string | null;
  last_name?: string | null;
  phone?: string | null;
  country?: string | null;
  interested_countries?: string[] | null;
  degree_level?: string | null;
  course_preferences?: string | null;
  bachelors_degree?: string | null;
  masters_degree?: string | null;
  bachelors_score?: string | null;
  masters_score?: string | null;
  twelfth_grade_score?: string | null;
  tenth_grade_score?: string | null;
} | null;

function pickCountry(profile: UserProfile): string | undefined {
  const candidates = [
    profile?.interested_countries?.[0],
    profile?.country,
  ].filter(Boolean) as string[];

  for (const candidate of candidates) {
    if (isValidCountry(candidate)) {
      return normalizeCountry(candidate);
    }
  }
  return undefined;
}

function pickQualification(profile: UserProfile): string | undefined {
  if (profile?.degree_level?.trim()) return profile.degree_level.trim();
  if (profile?.masters_degree?.trim()) return "Master's";
  if (profile?.bachelors_degree?.trim()) return "Bachelor's";
  if (profile?.twelfth_grade_score?.trim()) return '12th';
  return undefined;
}

function pickStream(profile: UserProfile): string | undefined {
  if (profile?.course_preferences?.trim()) return profile.course_preferences.trim();
  if (profile?.masters_degree?.trim()) return profile.masters_degree.trim();
  if (profile?.bachelors_degree?.trim()) return profile.bachelors_degree.trim();
  return undefined;
}

function pickScore(profile: UserProfile): string | undefined {
  return (
    profile?.masters_score?.trim() ||
    profile?.bachelors_score?.trim() ||
    profile?.twelfth_grade_score?.trim() ||
    profile?.tenth_grade_score?.trim() ||
    undefined
  );
}

export function buildChatContext(user: AuthUser, profile: UserProfile): ChatContext {
  const fullName =
    profile?.full_name?.trim() ||
    [profile?.first_name, profile?.last_name].filter(Boolean).join(' ').trim();

  return {
    ...(fullName ? { fullName } : {}),
    ...(user?.email ? { email: user.email } : {}),
    ...(profile?.phone?.trim() ? { phone: profile.phone.trim() } : {}),
    ...(pickCountry(profile) ? { country: pickCountry(profile)! } : {}),
    ...(pickQualification(profile) ? { qualification: pickQualification(profile)! } : {}),
    ...(pickStream(profile) ? { streamOrProgram: pickStream(profile)! } : {}),
    ...(pickScore(profile) ? { academicScore: pickScore(profile)! } : {}),
  };
}

export function getActiveSteps(context: ChatContext): ChatStep[] {
  return ACADEMIC_STEPS.filter((step) => !context[step.key]);
}

export function buildWelcomeMessage(
  context: ChatContext,
  activeSteps: ChatStep[],
  profile: UserProfile
): string {
  const firstName = profile?.first_name?.trim() || context.fullName?.split(/\s+/)[0];
  const greeting = firstName
    ? `Hi ${firstName}! 👋 I'm your AI study abroad advisor from Fly Masters.`
    : `Hi there! 👋 I'm your AI study abroad advisor from Fly Masters.`;

  const known: string[] = [];
  if (context.country) known.push(`destination: ${context.country}`);
  if (context.qualification) known.push(`qualification: ${context.qualification}`);
  if (context.streamOrProgram) known.push(`field: ${context.streamOrProgram}`);
  if (context.academicScore) known.push(`score: ${context.academicScore}`);

  const profileNote =
    known.length > 0
      ? ` I've loaded your profile (${known.join(', ')}).`
      : '';

  if (activeSteps.length === 0) {
    return `${greeting}${profileNote} Let me find universities that match you.`;
  }

  return `${greeting}${profileNote}\n\n${activeSteps[0].question}`;
}
