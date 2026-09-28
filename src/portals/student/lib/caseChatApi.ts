import { apiUrl } from '@student/lib/apiBase';

/** The student's single conversation with Fly Masters — server/routes/cases.mjs. */

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

async function call<T>(path: string, init?: RequestInit): Promise<T> {
  const token = studentToken();
  const res = await fetch(apiUrl(`/api${path}`), {
    cache: 'no-store',
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(init?.headers || {}),
    },
  });
  const payload = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((payload as { error?: string }).error || `Request failed (${res.status})`);
  return payload as T;
}

export type CaseSenderRole = 'student' | 'ai' | 'telecaller' | 'counselor' | 'admin';

export interface CaseMessage {
  id: string;
  sender_role: CaseSenderRole;
  sender_id: string | null;
  sender_name: string | null;
  body: string;
  channel: 'app' | 'whatsapp';
  created_at: string;
}

export interface CaseOwner {
  role: 'ai' | 'telecaller' | 'counselor';
  id: string | null;
  name: string;
}

export function getMyCase() {
  return call<{ conversation_id: string; owner: CaseOwner; ai_enabled: boolean; messages: CaseMessage[] }>('/case/me');
}

export function sendCaseMessage(message: string) {
  return call<{ owner: CaseOwner; messages: CaseMessage[] }>('/case/me/messages', {
    method: 'POST',
    body: JSON.stringify({ message }),
  });
}
