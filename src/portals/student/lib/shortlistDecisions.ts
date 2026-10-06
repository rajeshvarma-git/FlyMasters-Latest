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
