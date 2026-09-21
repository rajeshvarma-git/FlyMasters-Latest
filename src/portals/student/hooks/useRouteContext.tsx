import { useLocation } from 'react-router-dom';

const PORTAL_PREFIXES = ['/student', '/dashboard', '/counselor', '/admin'];

export function isPortalRoute(pathname: string): boolean {
  return PORTAL_PREFIXES.some((prefix) => pathname.startsWith(prefix));
}

export function isPublicRoute(pathname: string): boolean {
  return !isPortalRoute(pathname) && pathname !== '/auth';
}

export function useRouteContext() {
  const location = useLocation();
  const pathname = location.pathname;

  return {
    pathname,
    isPortal: isPortalRoute(pathname),
    isPublic: isPublicRoute(pathname),
    isAuth: pathname === '/auth',
    isStudentPortal: pathname.startsWith('/student') || (pathname.startsWith('/dashboard') && !pathname.includes('/admin')),
    isCounselorPortal: pathname.startsWith('/counselor'),
    isAdminPortal: pathname.startsWith('/admin') || pathname.includes('/dashboard/admin'),
  };
}
