import { supabase } from '@student/integrations/supabase/client';
import { apiUrl } from '@student/lib/apiBase';
import type { UniversityInfo } from '@shared/universityInfo';

export type PublishedUniversity = {
  university: { id: string; name: string; country: string; city: string; website_url: string } | null;
  /** null when the admin has not published anything for this university. */
  info: UniversityInfo | null;
  published_at?: string | null;
};

export async function studentToken(): Promise<string> {
  const { data: { session } } = await supabase.auth.getSession();
  return session?.access_token || '';
}

/** The published information for one university: the same record the admin portal manages. */
export async function fetchUniversityInfo(universityId: string): Promise<PublishedUniversity> {
  const response = await fetch(apiUrl(`/api/university-info/${encodeURIComponent(universityId)}`), {
    headers: { Authorization: `Bearer ${await studentToken()}` },
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error || 'Could not load the university information.');
  return payload as PublishedUniversity;
}

export const universityAssetUrl = (universityId: string, file: string) =>
  apiUrl(`/api/university-info/${encodeURIComponent(universityId)}/assets/${file}`);
