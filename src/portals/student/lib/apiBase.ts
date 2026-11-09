// The student portal's URL builder, now on the one shared rule.
//
// It used to resolve the backend itself, and on a native platform with nothing configured it returned
// an emulator address: http://10.0.2.2:8087 on Android, http://localhost:8087 on iOS. Right on an
// emulator, wrong on a real phone, where every request fails as a timeout that looks like a server
// fault. shared/lib/apiBase.ts reports the missing configuration instead, and reads all three
// VITE_API_* names the portals have used, so existing builds keep working.
import { apiBase } from "@shared/lib/apiBase";

/** The backend base. "" means same origin, which is correct on the web. */
export function getApiBase(): string {
  return apiBase();
}

export function apiUrl(path: string): string {
  const base = getApiBase();
  const normalized = path.startsWith("/") ? path : `/${path}`;
  return base ? `${base}${normalized}` : normalized;
}
