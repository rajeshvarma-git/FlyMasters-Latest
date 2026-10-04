import type { User } from '@student/integrations/supabase/client';
import { supabase } from '@student/integrations/supabase/client';
import { apiUrl } from '@student/lib/apiBase';

export async function notifyCounselorsOfStudentDocument(user: User, documentType: string, fileName: string) {
  return notifyAssignedCounselors(user, {
    type: 'upload_success',
    title: 'New student document',
    message: `${studentName(user)} submitted ${documentType}: ${fileName}. Open Counselor Documents to review.`,
    actionUrl: '/counselor/documents',
  });
}

export async function notifyAssignedCounselors(
  user: User,
  input: { type: string; title: string; message: string; actionUrl?: string }
) {
  const { data: { session } } = await supabase.auth.getSession();
  const response = await fetch(apiUrl('/api/case/me/notifications'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token || ''}` },
    body: JSON.stringify({ title: input.title, message: input.message }),
  });
  if (!response.ok) {
    const payload = await response.json().catch(() => ({}));
    throw new Error(payload.error || 'Could not notify your advisor.');
  }

}

function studentName(user: User) {
  return [user.user_metadata?.first_name, user.user_metadata?.last_name]
    .filter(Boolean)
    .join(' ') || user.email || 'A student';
}
