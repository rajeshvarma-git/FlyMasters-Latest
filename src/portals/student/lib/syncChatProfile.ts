import { supabase } from '@student/integrations/supabase/client';
import type { ChatContext } from '@student/lib/chatContext';

type ExistingProfile = {
  id?: string;
  first_name?: string | null;
  last_name?: string | null;
  full_name?: string | null;
  phone?: string | null;
  interested_countries?: string[] | null;
  degree_level?: string | null;
  course_preferences?: string | null;
  bachelors_score?: string | null;
  masters_score?: string | null;
  twelfth_grade_score?: string | null;
  tenth_grade_score?: string | null;
  student_notes?: string | null;
} | null;

function mapQualificationToDegreeLevel(qualification: string): string {
  const lower = qualification.toLowerCase();
  if (lower.includes('phd') || lower.includes('doctor')) return 'PhD';
  if (lower.includes('master')) return 'Masters';
  if (lower.includes('bachelor') || lower.includes('b.tech') || lower.includes('b.sc') || lower.includes('undergrad')) {
    return 'Bachelors';
  }
  if (lower.includes('diploma')) return 'Diploma';
  if (lower.includes('certificate')) return 'Certificate';
  if (lower.includes('12') || lower.includes('twelfth') || lower.includes('+2')) return 'Bachelors';
  return qualification;
}

function mapScoreFields(qualification: string | undefined, score: string) {
  const lower = (qualification || '').toLowerCase();
  if (lower.includes('master')) return { masters_score: score };
  if (lower.includes('bachelor') || lower.includes('b.') || lower.includes('undergrad')) {
    return { bachelors_score: score };
  }
  if (lower.includes('12') || lower.includes('twelfth') || lower.includes('+2')) {
    return { twelfth_grade_score: score };
  }
  if (lower.includes('10') || lower.includes('tenth')) return { tenth_grade_score: score };
  return { twelfth_grade_score: score };
}

function mergeCountries(existing: string[] | null | undefined, country: string): string[] {
  const list = Array.isArray(existing) ? [...existing] : [];
  if (!list.includes(country)) list.unshift(country);
  return list;
}

function splitName(fullName: string) {
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  return {
    first_name: parts[0] || '',
    last_name: parts.slice(1).join(' '),
    full_name: fullName.trim(),
  };
}

function appendBudgetNote(existing: string | null | undefined, budget: string): string {
  const line = `Study budget (AI chat): ${budget}`;
  if (!existing?.trim()) return line;
  if (existing.includes(budget)) return existing;
  return `${existing.trim()}\n${line}`;
}

export function buildProfileUpdateFromChat(chat: ChatContext, existing: ExistingProfile) {
  const update: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  };

  if (chat.country) {
    update.interested_countries = mergeCountries(existing?.interested_countries, chat.country);
  }
  if (chat.qualification) {
    update.degree_level = mapQualificationToDegreeLevel(chat.qualification);
  }
  if (chat.streamOrProgram) {
    update.course_preferences = chat.streamOrProgram;
  }
  if (chat.academicScore) {
    Object.assign(update, mapScoreFields(chat.qualification, chat.academicScore));
  }
  if (chat.budget) {
    update.student_notes = appendBudgetNote(existing?.student_notes, chat.budget);
  }
  if (chat.phone) {
    update.phone = chat.phone;
  }
  if (chat.fullName) {
    const names = splitName(chat.fullName);
    update.first_name = names.first_name;
    update.last_name = names.last_name;
    update.full_name = names.full_name;
  }

  return update;
}

export async function saveChatDataToProfile(
  userId: string,
  userEmail: string | undefined,
  chat: ChatContext,
  existingProfile: ExistingProfile,
  sessionId?: string
): Promise<void> {
  const profileUpdate = buildProfileUpdateFromChat(chat, existingProfile);

  if (Object.keys(profileUpdate).length <= 1) return;

  const { data: existing } = await supabase
    .from('profiles')
    .select('id')
    .eq('user_id', userId)
    .maybeSingle();

  const profileId = existing?.id || crypto.randomUUID();
  const { error: profileError } = await supabase.from('profiles').upsert(
    {
      id: profileId,
      user_id: userId,
      ...profileUpdate,
    },
    { onConflict: 'id' }
  );

  if (profileError) {
    throw new Error(profileError.message);
  }

  const { data: existingLead } = await supabase
    .from('student_leads')
    .select('id, preferences, notes')
    .eq('user_id', userId)
    .maybeSingle();

  const leadPreferences = {
    ...((existingLead?.preferences as Record<string, unknown> | null) || {}),
    ...(chat.country ? { interested_countries: mergeCountries(existingProfile?.interested_countries, chat.country) } : {}),
    ...(chat.qualification ? { degree_level: mapQualificationToDegreeLevel(chat.qualification) } : {}),
    ...(chat.streamOrProgram ? { course_preferences: chat.streamOrProgram } : {}),
    ...(chat.academicScore ? mapScoreFields(chat.qualification, chat.academicScore) : {}),
    ...(chat.budget ? { study_budget: chat.budget } : {}),
    ai_chat_updated_at: new Date().toISOString(),
  };

  const leadPayload: Record<string, unknown> = {
    id: existingLead?.id || crypto.randomUUID(),
    user_id: userId,
    email: userEmail || '',
    lead_source: 'ai_chat',
    updated_at: new Date().toISOString(),
    last_activity_at: new Date().toISOString(),
    preferences: leadPreferences,
  };

  if (chat.country) {
    leadPayload.preferred_countries = mergeCountries(existingProfile?.interested_countries, chat.country);
  }
  if (chat.qualification) {
    leadPayload.qualification_level = mapQualificationToDegreeLevel(chat.qualification);
    leadPayload.current_qualification = chat.qualification;
  }
  if (chat.streamOrProgram) {
    leadPayload.field_of_interest = chat.streamOrProgram;
    leadPayload.stream_or_program = chat.streamOrProgram;
  }
  if (chat.academicScore) leadPayload.academic_score = chat.academicScore;
  if (chat.budget) {
    leadPayload.notes = appendBudgetNote(existingLead?.notes, chat.budget);
  }
  if (chat.phone) leadPayload.phone = chat.phone;
  if (chat.fullName) {
    const names = splitName(chat.fullName);
    leadPayload.first_name = names.first_name;
    leadPayload.last_name = names.last_name;
  }
  if (sessionId) leadPayload.chat_session_id = sessionId;

  const { error: leadError } = await supabase
    .from('student_leads')
    .upsert(leadPayload, { onConflict: 'id' });

  if (leadError) {
    console.warn('Student lead sync skipped:', leadError.message);
  }
}
