import { apiUrl } from '@student/lib/apiBase';

/**
 * The student's own line into the real, live WhatsApp store —
 * server/student/whatsapp.ts, mounted in server/routes/student.mjs ahead of
 * everything else so it claims every /api/whatsapp/* path unconditionally.
 * (server/lib/whatsappService.mjs + routes/core.mjs also define
 * /api/whatsapp/* routes, but they never run: student.mjs's router claims
 * the path first and never falls through to them. server/lib/whatsappStore.mjs
 * + whatsappRoutes.mjs are a third, older copy that was already fully
 * retired and isn't mounted anywhere — see the comment in
 * routes/counselor.mjs above the old WhatsApp block.)
 *
 * NOT the same file as @student/lib/whatsappApi.ts. That file's request/
 * response shapes (conversation_id, verified_at as top-level fields with
 * different casing) don't match what server/student/whatsapp.ts actually
 * accepts and returns — its only two consumers (WhatsAppInbox/
 * WhatsAppVerificationGate) live in the legacy src/portals/student/
 * counselor|dashboard/sections tree, which isn't wired into any live
 * portal's App.tsx, so the mismatch has never been hit at runtime. This file
 * talks to the same endpoints with the shapes the server actually
 * implements, verified by reading server/student/whatsapp.ts directly
 * rather than assumed from that other client.
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

export interface WhatsAppVerificationStatus {
  verified: boolean;
  phone_number: string | null;
  verified_at: string | null;
  user_id: string;
}

export interface WhatsAppThreadMessage {
  id: string;
  conversation_id: string;
  direction: 'inbound' | 'outbound';
  body: string;
  wa_message_id: string | null;
  staff_id: string | null;
  channel?: string;
  is_read: boolean;
  created_at: string;
}

export interface WhatsAppThreadConversation {
  id: string;
  lead_id: string | null;
  user_id: string | null;
  phone_number: string;
  contact_name?: string | null;
  assigned_staff_id?: string | null;
  staff_role?: string | null;
  last_message_at: string | null;
}

export function getWhatsAppVerificationStatus() {
  return call<WhatsAppVerificationStatus>('/whatsapp/verification-status');
}

export function sendWhatsAppOtp(phone: string) {
  return call<{ ok: boolean; phone_number: string; expires_in_seconds: number }>('/whatsapp/send-otp', {
    method: 'POST',
    body: JSON.stringify({ phone_number: phone }),
  });
}

export function verifyWhatsAppOtp(phone: string, code: string) {
  return call<{ ok: boolean; verified: boolean; phone_number: string }>('/whatsapp/verify-otp', {
    method: 'POST',
    body: JSON.stringify({ phone_number: phone, code }),
  });
}

export function getMyWhatsAppThread() {
  return call<{ verified: boolean; conversation: WhatsAppThreadConversation | null; messages: WhatsAppThreadMessage[] }>(
    '/whatsapp/my-thread',
  );
}

export function sendWhatsAppAppMessage(message: string) {
  return call<{ message: WhatsAppThreadMessage; conversation: WhatsAppThreadConversation }>('/whatsapp/app-message', {
    method: 'POST',
    body: JSON.stringify({ message }),
  });
}
