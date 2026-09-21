import type { User } from '@student/integrations/supabase/client';
import { supabase } from '@student/integrations/supabase/client';
import { ensureStudentCounselorLink } from '@student/lib/ensureStudentCounselorLink';

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
  await ensureStudentCounselorLink(user);

  const counselorIds = new Set<string>();

  const { data: lead } = await supabase
    .from('student_leads')
    .select('assigned_counselor_id')
    .eq('user_id', user.id)
    .maybeSingle();

  if (lead?.assigned_counselor_id) {
    counselorIds.add(lead.assigned_counselor_id);
  }

  if (counselorIds.size === 0) {
    const { data: counselors } = await supabase
      .from('counselors')
      .select('user_id')
      .eq('is_active', true);

    (counselors || []).forEach((row) => {
      if (row.user_id) counselorIds.add(row.user_id);
    });
  }

  if (counselorIds.size === 0) {
    const { data: roles } = await supabase
      .from('user_roles')
      .select('user_id')
      .eq('role', 'counselor');

    (roles || []).forEach((row) => {
      if (row.user_id) counselorIds.add(row.user_id);
    });
  }

  const rows = [...counselorIds].map((counselorId) => ({
    user_id: counselorId,
    notification_type: input.type,
    title: input.title,
    message: input.message,
    additional_data: {
      action_url: input.actionUrl || '/counselor',
      student_id: user.id,
    },
    is_read: false,
    created_at: new Date().toISOString(),
  }));

  if (rows.length > 0) {
    await supabase.from('document_notifications').insert(rows);
  }
}

function studentName(user: User) {
  return [user.user_metadata?.first_name, user.user_metadata?.last_name]
    .filter(Boolean)
    .join(' ') || user.email || 'A student';
}
