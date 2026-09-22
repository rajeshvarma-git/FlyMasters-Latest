import { getToken, clearSession } from "@shared/lib/session";

/** Partner portal API client. Same shared token as every other portal. */
export async function api<T = unknown>(
  path: string,
  options: { method?: string; body?: unknown } = {},
): Promise<T> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;

  const res = await fetch(`/api/partner${path}`, {
    method: options.method || "GET",
    headers,
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  });

  const raw = await res.text();
  let data: any = {};
  try { data = raw ? JSON.parse(raw) : {}; } catch { /* non-JSON error page */ }

  if (res.status === 401) {
    clearSession();
    window.location.href = "/staff";
    throw new Error("Session expired.");
  }
  if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
  return data as T;
}

export interface Referral {
  id: string;
  name: string;
  country: string;
  referredOn: string;
  stage?: string;
}

export interface CommissionNote {
  id: number;
  type: string;
  body: string;
  created_at: string;
}

export interface Commission {
  id: string;
  student_name: string;
  amount: string;
  currency: string;
  status: string;
  invoice_status: string;
  payout_reference: string | null;
  paid_at: string | null;
  notes: CommissionNote[];
}

export interface PartnerProfile {
  id: string;
  type: "agent" | "freelancer";
  name: string;
  businessName: string | null;
  code: string;
  email: string | null;
  phone: string | null;
  branch: { name: string; code: string } | null;
  commissionBasis: string;
  commissionRate: string;
  verification: string;
  canViewStudentStatus: boolean;
  referralLink: string;
}
