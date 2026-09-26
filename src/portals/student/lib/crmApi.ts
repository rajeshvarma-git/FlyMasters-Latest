import { apiUrl } from '@student/lib/apiBase';

/**
 * A direct line from the student portal to the CRM API.
 *
 * The portal's other data access goes through the supabase-shaped shim, which
 * reads and writes the JSONB record store. The checklist configuration built
 * for CRM 2.6 lives in real tables instead, so this small helper talks to the
 * CRM endpoints with the student's own session token.
 *
 * Kept separate from the shim deliberately: the shim's job is to keep the
 * portal's original Supabase-style calls working, and mixing a second data
 * model into it is how the two would drift.
 */

const SESSION_KEY = 'flymasters.student.session.v2';

function studentToken(): string {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    if (!raw) return '';
    const parsed = JSON.parse(raw);
    if (parsed?.expires_at && Date.parse(parsed.expires_at) <= Date.now()) return '';
    return String(parsed?.access_token || '');
  } catch {
    return '';
  }
}

export async function crmGet<T>(path: string): Promise<T> {
  const token = studentToken();
  const res = await fetch(apiUrl(`/api${path}`), {
    cache: 'no-store',
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  const payload = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((payload as { error?: string }).error || `Request failed (${res.status})`);
  return payload as T;
}

/** One item on the checklist a counsellor activated for this student. */
export type AssignedChecklistItem = {
  id: string;
  document_type: string;
  description: string;
  is_required: boolean;
  requirement: string;
  max_file_size_mb: number;
  allowed_file_types: string[];
  sample_instructions: string;
  requires_expiry: boolean;
  expires_on: string | null;
  document_id: string | null;
  status: string;
  status_label: string;
  status_color: string;
  next_step_note: string;
  rejection_reason: string;
  /** already accepted on another country's checklist — do not ask for it twice */
  already_available: boolean;
};

export type AssignedChecklist = {
  id: string;
  country: string;
  family_id: string;
  name: string;
  version: number;
  course_level: string;
  intake: string;
  activated_at: string;
  progress: number;
  items: AssignedChecklistItem[];
};

export type AssignedChecklistResponse = {
  activated: boolean;
  reason?: string;
  student_id?: string;
  next_step_note?: string;
  checklists: AssignedChecklist[];
};

export function fetchAssignedChecklists() {
  return crmGet<AssignedChecklistResponse>('/student/checklists');
}
