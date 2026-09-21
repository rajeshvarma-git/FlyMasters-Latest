import { apiUrl } from '@student/lib/apiBase';

const SESSION_KEY = 'flymasters.student.session.v2';

export type WhatsAppConversation = {
  id: string;
  lead_id: string | null;
  user_id: string | null;
  phone_number: string;
  assigned_staff_id: string | null;
  staff_role: string | null;
  student_name: string;
  last_message: string;
  last_message_at: string | null;
  unread_count: number;
  whatsapp_verified: boolean;
  created_at: string;
};

export type WhatsAppMessage = {
  id: string;
  conversation_id: string;
  direction: 'inbound' | 'outbound';
  body: string;
  wa_message_id?: string | null;
  staff_id?: string | null;
  is_read?: boolean;
  created_at: string;
};

export type WhatsAppVerificationStatus = {
  verified: boolean;
  phone_number: string | null;
  verified_at: string | null;
};

function getSessionToken() {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    if (!raw) return '';
    const session = JSON.parse(raw);
    return String(session?.access_token || '');
  } catch {
    return '';
  }
}

export class WhatsAppApiError extends Error {
  status: number;
  retryAfterSeconds?: number;
  codePending?: boolean;
  phoneNumber?: string;

  constructor(payload: Record<string, any>, status: number) {
    super(payload.error || `Request failed (${status})`);
    this.name = 'WhatsAppApiError';
    this.status = status;
    this.retryAfterSeconds = payload.retry_after_seconds;
    this.codePending = Boolean(payload.code_pending);
    this.phoneNumber = payload.phone_number;
  }
}

async function whatsappFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const token = getSessionToken();
  const response = await fetch(apiUrl(path), {
    cache: 'no-store',
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(init?.headers || {}),
    },
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new WhatsAppApiError(payload, response.status);
  }
  return payload as T;
}

export function normalizeIndiaPhoneInput(value: string) {
  const digits = value.replace(/\D/g, '');
  if (digits.startsWith('91') && digits.length >= 12) return digits.slice(-10);
  if (digits.startsWith('0') && digits.length === 11) return digits.slice(1);
  return digits.slice(0, 10);
}

export function isValidIndiaMobile(value: string) {
  return /^[6-9]\d{9}$/.test(normalizeIndiaPhoneInput(value));
}

export function getWhatsAppVerificationStatus() {
  return whatsappFetch<WhatsAppVerificationStatus>('/api/whatsapp/verification-status');
}

export function sendWhatsAppOtp(phone: string) {
  return whatsappFetch<{ ok: boolean; phone_number: string; expires_in_seconds: number }>(
    '/api/whatsapp/send-otp',
    { method: 'POST', body: JSON.stringify({ phone_number: phone }) }
  );
}

export function verifyWhatsAppOtp(phone: string, code: string) {
  return whatsappFetch<{ ok: boolean; verified: boolean; phone_number: string }>(
    '/api/whatsapp/verify-otp',
    { method: 'POST', body: JSON.stringify({ phone_number: phone, code }) }
  );
}

export function listWhatsAppConversations() {
  return whatsappFetch<{ conversations: WhatsAppConversation[] }>('/api/whatsapp/conversations');
}

export function listWhatsAppMessages(conversationId: string) {
  return whatsappFetch<{ messages: WhatsAppMessage[] }>(
    `/api/whatsapp/conversations/${encodeURIComponent(conversationId)}/messages`
  );
}

export function sendWhatsAppReply(conversationId: string, body: string) {
  return whatsappFetch<{ ok: boolean; message: WhatsAppMessage }>('/api/whatsapp/messages', {
    method: 'POST',
    body: JSON.stringify({ conversation_id: conversationId, body }),
  });
}

export function markWhatsAppConversationRead(conversationId: string) {
  return whatsappFetch<{ ok: boolean; count: number }>(
    `/api/whatsapp/conversations/${encodeURIComponent(conversationId)}/read`,
    { method: 'POST' }
  );
}
