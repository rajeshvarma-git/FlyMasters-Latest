import type { Database } from '@student/integrations/supabase/types';

type UserRole = Database['public']['Enums']['app_role'];

/**
 * Utility functions for role-based access control
 */

// Role hierarchy constants
export const ROLES = {
  STUDENT: 'student' as UserRole,
  TELECALLER: 'telecaller' as UserRole,
  COUNSELOR: 'counselor' as UserRole, 
  ADMIN: 'admin' as UserRole,
  SUPER_ADMIN: 'super_admin' as UserRole,
} as const;

// Role permissions helper
export const hasPermission = (userRole: UserRole | null, requiredRole: UserRole): boolean => {
  if (!userRole) return false;
  
  // Super admin has all permissions
  if (userRole === ROLES.SUPER_ADMIN) return true;
  
  // Admin has counselor and student permissions
  if (userRole === ROLES.ADMIN && [ROLES.COUNSELOR, ROLES.STUDENT].includes(requiredRole)) {
    return true;
  }
  
  // Counselor has student permissions
  if (userRole === ROLES.COUNSELOR && requiredRole === ROLES.STUDENT) {
    return true;
  }
  
  // Direct role match
  return userRole === requiredRole;
};

// Role display names
export const getRoleDisplayName = (role: UserRole | null): string => {
  switch (role) {
    case ROLES.STUDENT:
      return 'Student';
    case ROLES.TELECALLER:
      return 'Telecaller';
    case ROLES.COUNSELOR:
      return 'Counselor';
    case ROLES.ADMIN:
      return 'Admin';
    case ROLES.SUPER_ADMIN:
      return 'Super Admin';
    default:
      return 'Unknown';
  }
};

// Route paths by role
export const getDefaultRoute = (role: UserRole | null): string => {
  if (role === ROLES.COUNSELOR) return '/counselor';
  if (role === ROLES.TELECALLER) return '/dashboard/admin/whatsapp';
  if (role === ROLES.STUDENT) return '/student';
  if (role === ROLES.ADMIN || role === ROLES.SUPER_ADMIN) return '/dashboard';
  if (role) return '/dashboard';
  return '/';
};

export const CHAT_PATH = '/chat';

export const getAuthRedirectPath = (returnPath: string) =>
  `/auth?redirect=${encodeURIComponent(returnPath)}`;

export const resolvePostLoginRedirect = (
  statePath?: string | null,
  queryPath?: string | null
): string | null => {
  const candidate = statePath || queryPath;
  if (candidate && candidate.startsWith('/') && !candidate.startsWith('//')) {
    return candidate;
  }
  return null;
};