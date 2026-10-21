import { supabase } from '@student/integrations/supabase/client';
import { apiUrl } from '@student/lib/apiBase';

/**
 * The student's side of the shortlist: a green tick (go ahead) or a red cross
 * (not interested) on each university. The counsellor runs the application
 * from there — the student no longer fills in an application form.
 */
async function call<T>(path: string, body: unknown): Promise<T> {
  const { data: { session } } = await supabase.auth.getSession();
  const response = await fetch(apiUrl(path), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token || ''}` },
    body: JSON.stringify(body),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error || 'Something went wrong. Please try again.');
  return payload as T;
}

export type ShortlistDecision = 'accept' | 'decline' | 'undo';

export function decideShortlist(shortlistId: string, decision: ShortlistDecision) {
  return call<{ ok: true; shortlist: Record<string, any> }>(
    `/api/case/me/shortlists/${encodeURIComponent(shortlistId)}/decision`,
    { decision },
  );
}

/** A university the student picked themselves — sent to the counsellor already accepted. */
export function shortlistMyPick(input: { university_id?: string; university_name: string; location?: string; course_name?: string }) {
  return call<{ ok: true; shortlist: Record<string, any>; already?: boolean }>('/api/case/me/shortlists', input);
}

/**
 * "Start Application" on a recommendation. The student never creates an
 * application: this asks their counselor to, and only works once consent has
 * been given. The server answers 409 with a plain explanation otherwise.
 */
export function requestApplicationStart(shortlistId: string) {
  return call<{ ok: true; shortlist: Record<string, any>; already?: boolean }>(
    `/api/case/me/shortlists/${encodeURIComponent(shortlistId)}/request-application`,
    {},
  );
}

export type CatalogUniversity = {
  id?: string; name?: string; country?: string; city?: string; state_province?: string; description?: string;
  established_year?: number; ranking?: number; university_type?: string; website_url?: string; is_tie_up?: boolean; logo_url?: string;
};
export type CatalogProgram = {
  id?: string; university_id?: string; university_name?: string; program_name?: string; country?: string; degree?: string;
  course?: string; specialization?: string; location?: string; city?: string; region?: string; duration?: string; fee?: string;
  language?: string; program_description?: string; eligibility?: string; career?: string; deadline?: string;
};
export type ShortlistDetails = {
  matched_by: 'id' | 'name' | 'university' | null;
  university: CatalogUniversity | null;
  program: CatalogProgram | null;
  programs: CatalogProgram[];
};

/** The real university and programme behind each of the student's shortlist entries, keyed by shortlist id. */
export async function fetchShortlistDetails(): Promise<Record<string, ShortlistDetails>> {
  const { data: { session } } = await supabase.auth.getSession();
  const response = await fetch(apiUrl('/api/case/me/shortlist-details'), {
    headers: { Authorization: `Bearer ${session?.access_token || ''}` },
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error || 'Could not load the university details.');
  return (payload.details || {}) as Record<string, ShortlistDetails>;
}
