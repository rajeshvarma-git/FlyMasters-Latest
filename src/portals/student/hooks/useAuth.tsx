import * as React from 'react';
import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { User, Session, supabase } from '@student/integrations/supabase/client';
import type { Database } from '@student/integrations/supabase/types';

type UserRole = Database['public']['Enums']['app_role'];
type UserProfile = Database['public']['Tables']['profiles']['Row'];

interface AuthContextType {
  user: User | null;
  session: Session | null;
  userRole: UserRole | null;
  userProfile: UserProfile | null;
  loading: boolean;
  roleLoading: boolean;
  profileLoading: boolean;
  signUp: (email: string, password: string, firstName: string, lastName: string) => Promise<{ error: any }>;
  signIn: (email: string, password: string) => Promise<{ error: any }>;
  signOut: () => Promise<void>;
  resetPassword: (email: string) => Promise<{ error: any }>;
  updatePassword: (newPassword: string) => Promise<{ error: any }>;
  hasRole: (role: UserRole) => boolean;
  isAdmin: boolean;
  isCounselor: boolean;
  isTelecaller: boolean;
  isStudent: boolean;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  session: null,
  userRole: null,
  userProfile: null,
  loading: true,
  roleLoading: false,
  profileLoading: false,
  signUp: async () => ({ error: null }),
  signIn: async () => ({ error: null }),
  signOut: async () => {},
  resetPassword: async () => ({ error: null }),
  updatePassword: async () => ({ error: null }),
  hasRole: () => false,
  isAdmin: false,
  isCounselor: false,
  isTelecaller: false,
  isStudent: false,
});

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

interface AuthProviderProps {
  children: ReactNode;
}

export const AuthProvider = ({ children }: AuthProviderProps) => {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [userRole, setUserRole] = useState<UserRole | null>(null);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [roleLoading, setRoleLoading] = useState(false);
  const [profileLoading, setProfileLoading] = useState(false);

  // Helper functions to fetch role and profile
  const fetchUserRole = async (userId: string) => {
    try {
      setRoleLoading(true);
      console.log('🔄 Fetching user role for:', userId);
      console.log('Current user role state before fetch:', userRole);
      
      const { data, error } = await supabase
        .from('user_roles')
        .select('role')
        .eq('user_id', userId);
      
      console.log('📊 Role fetch response:', { data, error });
      
      if (error) {
        console.error('❌ Error fetching user role:', error);
        setUserRole('student');
        return;
      }

      if (!data || data.length === 0) {
        console.log('⚠️ No roles found for user, defaulting to student');
        setUserRole('student');
        return;
      }
      
      // Role hierarchy: super_admin > admin > counselor > student
      const roleHierarchy = ['super_admin', 'admin', 'counselor', 'telecaller', 'student'];
      let highestRole: UserRole = 'student';
      
      // Get unique roles to handle duplicates
      const uniqueRoles = [...new Set(data.map(r => r.role))];
      
      for (const hierarchyRole of roleHierarchy) {
        if (uniqueRoles.includes(hierarchyRole as UserRole)) {
          highestRole = hierarchyRole as UserRole;
          break;
        }
      }
      
      console.log('✅ Fetched user roles:', uniqueRoles, 'Using highest role:', highestRole);
      console.log('🎯 Setting user role to:', highestRole);
      setUserRole(highestRole);
      console.log('✨ User role state after setting:', highestRole);
    } catch (error) {
      console.error('❌ Unexpected error fetching user role:', error);
      setUserRole('student');
    } finally {
      console.log('🏁 Role loading complete, final role state will be checked');
      setRoleLoading(false);
    }
  };

  const fetchUserProfile = async (userId: string) => {
    try {
      setProfileLoading(true);
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('user_id', userId)
        .maybeSingle();
      
      if (error) {
        console.error('Error fetching user profile:', error);
        setUserProfile(null);
        return;
      }
      
      setUserProfile(data);
    } catch (error) {
      console.error('Error fetching user profile:', error);
      setUserProfile(null);
    } finally {
      setProfileLoading(false);
    }
  };

  useEffect(() => {
    // Set up auth state listener FIRST
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, session) => {
        setSession(session);
        setUser(session?.user ?? null);
        setLoading(false);

        if (!session) {
          setUserRole(null);
          setUserProfile(null);
          setRoleLoading(false);
        } else if (session.user?.id) {
          fetchUserRole(session.user.id);
          fetchUserProfile(session.user.id);
        }
      }
    );

    // THEN check for existing session
    supabase.auth.getSession()
      .then(({ data: { session } }) => {
        setSession(session);
        setUser(session?.user ?? null);
        if (session?.user?.id) {
          fetchUserRole(session.user.id);
          fetchUserProfile(session.user.id);
        } else {
          setRoleLoading(false);
        }
      })
      .catch((error) => {
        console.error("Failed to restore session:", error);
        setSession(null);
        setUser(null);
        setRoleLoading(false);
      })
      .finally(() => {
        setLoading(false);
      });

    return () => subscription.unsubscribe();
  }, []);

  const signUp = async (
    email: string,
    password: string,
    firstName: string,
    lastName: string
  ) => {
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: `${window.location.origin}/`,
        data: {
          first_name: firstName,
          last_name: lastName,
        },
      },
    });
    return { error };
  };

  const signIn = async (email: string, password: string) => {
    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });

      if (error) throw error;
      if (data.session?.user?.id) {
        fetchUserRole(data.session.user.id);
        fetchUserProfile(data.session.user.id);
      }
      return { error: null };
    } catch (error) {
      return { error };
    }
  };

  const signOut = async () => {
    try {
      // Clear role and profile state
      setUserRole(null);
      setUserProfile(null);
      
      await supabase.auth.signOut();
      // Force page reload for clean state
      window.location.href = '/auth';
    } catch (error) {
      console.error('Error signing out:', error);
    }
  };

  const resetPassword = async (email: string) => {
    try {
      const redirectUrl = `${window.location.origin}/auth?type=recovery`;
      
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: redirectUrl,
      });
      
      return { error };
    } catch (error) {
      return { error };
    }
  };

  const updatePassword = async (newPassword: string) => {
    try {
      const { error } = await supabase.auth.updateUser({
        password: newPassword,
      });
      
      return { error };
    } catch (error) {
      return { error };
    }
  };

  // Role checking utility functions
  const hasRole = (role: UserRole): boolean => {
    return userRole === role;
  };

  const isAdmin = !roleLoading && (hasRole('admin') || hasRole('super_admin'));
  const isCounselor = !roleLoading && (hasRole('counselor') || isAdmin);
  const isTelecaller = !roleLoading && hasRole('telecaller');
  const isStudent = !roleLoading && (hasRole('student') || isCounselor);
  
  // Debug logging for role states (only log once when role changes)
  useEffect(() => {
    if (!roleLoading) {
      console.log('🎭 Role state update:', {
        userRole,
        isAdmin,
        isCounselor,
        isTelecaller,
        isStudent,
        roleLoading
      });
    }
  }, [userRole, roleLoading]);


  const value = {
    user,
    session,
    userRole,
    userProfile,
    loading,
    roleLoading,
    profileLoading,
    signUp,
    signIn,
    signOut,
    resetPassword,
    updatePassword,
    hasRole,
    isAdmin,
    isCounselor,
    isTelecaller,
    isStudent,
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
};