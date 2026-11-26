import { apiUrl } from '@student/lib/apiBase';

const SESSION_KEY = 'flymasters.student.session.v2';

export type BranchOption = { id: string; name: string; area: string; isHeadOffice: boolean };

function token() {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    return raw ? String(JSON.parse(raw)?.access_token || '') : '';
  } catch {
    return '';
  }
}

async function call<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(apiUrl(path), {
    ...init,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token()}`, ...(init?.headers || {}) },
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload?.error || `Request failed (${response.status})`);
  return payload as T;
}

/** Active branches the student may pick from, Head Office first. */
export async function fetchBranchOptions(): Promise<BranchOption[]> {
  const result = await call<{ branches: BranchOption[] }>('/__branches');
  return result.branches || [];
}

/** branchId null = the student skipped, which means Head Office. */
export function saveBranchChoice(branchId: string | null) {
  return call<{ ok: boolean; branch: { id: string; name: string }; skipped: boolean }>('/__branch_choice', {
    method: 'POST',
    body: JSON.stringify({ branchId }),
  });
}
