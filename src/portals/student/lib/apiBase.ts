import { Capacitor } from '@capacitor/core';

/** Backend base URL. Empty string = same origin (Vite dev server or unified production server). */
export function getApiBase(): string {
  const configured = import.meta.env.VITE_API_URL as string | undefined;
  if (configured?.trim()) {
    const url = configured.trim().replace(/\/$/, '');
    // Avoid a localhost build-time URL breaking deployed browsers.
    if (typeof window !== 'undefined') {
      const isLocalConfigured = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i.test(url);
      const isDeployedOrigin = !/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i.test(window.location.origin);
      if (isLocalConfigured && isDeployedOrigin) {
        return '';
      }
    }
    return url;
  }

  if (Capacitor.isNativePlatform()) {
    if (Capacitor.getPlatform() === 'android') return 'http://10.0.2.2:8087';
    return 'http://localhost:8087';
  }

  return '';
}

export function apiUrl(path: string): string {
  const base = getApiBase();
  const normalized = path.startsWith('/') ? path : `/${path}`;
  return base ? `${base}${normalized}` : normalized;
}
