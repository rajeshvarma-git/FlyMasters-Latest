import { useState, useEffect } from 'react';
import { supabase } from '@student/integrations/supabase/client';

export interface SearchResult {
  id: string;
  title: string;
  description: string;
  category: string;
  path: string;
  icon?: string;
}

interface UseGlobalSearchProps {
  userRole: string | null;
  userId: string | undefined;
}

export function useGlobalSearch({ userRole, userId }: UseGlobalSearchProps) {
  const [recentSearches, setRecentSearches] = useState<SearchResult[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  // Load recent searches from localStorage
  useEffect(() => {
    if (userId) {
      const stored = localStorage.getItem(`recent-searches-${userId}`);
      if (stored) {
        try {
          setRecentSearches(JSON.parse(stored));
        } catch (error) {
          console.error('Error loading recent searches:', error);
        }
      }
    }
  }, [userId]);

  // Save recent searches to localStorage
  const saveRecentSearch = (result: SearchResult) => {
    if (!userId) return;
    const updated = [result, ...recentSearches.filter(r => r.id !== result.id)].slice(0, 5);
    setRecentSearches(updated);
    localStorage.setItem(`recent-searches-${userId}`, JSON.stringify(updated));
  };

  // Get search results based on role
  const search = async (query: string): Promise<SearchResult[]> => {
    if (!query.trim()) return [];
    
    setIsLoading(true);
    try {
      const results: SearchResult[] = [];
      const lowerQuery = query.toLowerCase();

      if (userRole === 'admin' || userRole === 'super_admin') {
        // Admin search options
        const adminOptions: SearchResult[] = [
          { id: 'admin-users', title: 'User Management', description: 'Manage users, roles and permissions', category: 'Admin', path: '/dashboard/admin/users', icon: 'Users' },
          { id: 'admin-students', title: 'Student Leads', description: 'View and manage student applications', category: 'Admin', path: '/dashboard/admin/students', icon: 'GraduationCap' },
          { id: 'admin-counselors', title: 'Counselor Management', description: 'Manage counselor assignments and performance', category: 'Admin', path: '/dashboard/admin/counselors', icon: 'UserCheck' },
          { id: 'admin-hr', title: 'HR Management', description: 'Employee attendance, leave, and salary', category: 'Admin', path: '/dashboard/admin/hr', icon: 'Briefcase' },
          { id: 'admin-universities', title: 'Universities', description: 'Manage university listings and courses', category: 'Admin', path: '/dashboard/admin/universities', icon: 'Building' },
          { id: 'admin-documents', title: 'Document Management', description: 'Review and manage student documents', category: 'Admin', path: '/dashboard/admin/documents', icon: 'FileText' },
          { id: 'admin-analytics', title: 'Analytics', description: 'View system analytics and reports', category: 'Admin', path: '/dashboard/analytics', icon: 'BarChart' },
          { id: 'admin-chat', title: 'Chat Monitoring', description: 'Monitor live chat conversations', category: 'Admin', path: '/dashboard/admin/chat', icon: 'MessageSquare' },
          { id: 'admin-whatsapp', title: 'WhatsApp Inbox', description: 'Reply to student WhatsApp messages', category: 'Admin', path: '/dashboard/admin/whatsapp', icon: 'MessageSquare' },
          { id: 'admin-marketing', title: 'Marketing Automation', description: 'Manage campaigns and outreach', category: 'Admin', path: '/dashboard/admin/marketing', icon: 'Megaphone' },
          { id: 'admin-settings', title: 'System Settings', description: 'Configure system settings', category: 'Admin', path: '/dashboard/admin/settings', icon: 'Settings' },
        ];

        // Search students
        try {
          const { data: students, error } = await supabase
            .from('profiles')
            .select('*')
            .or(`full_name.ilike.%${query}%`)
            .limit(5);

          if (students && !error) {
            students.forEach((student: any) => {
              results.push({
                id: `student-${student.id}`,
                title: student.full_name || 'Unknown',
                description: student.id,
                category: 'Students',
                path: `/dashboard/admin/students?search=${student.id}`,
                icon: 'User'
              });
            });
          }
        } catch (error) {
          console.error('Error searching students:', error);
        }

        // Add matching admin options
        adminOptions.forEach(option => {
          if (option.title.toLowerCase().includes(lowerQuery) || 
              option.description.toLowerCase().includes(lowerQuery)) {
            results.push(option);
          }
        });

      } else if (userRole === 'counselor') {
        // Counselor search options
        const counselorOptions: SearchResult[] = [
          { id: 'counselor-dashboard', title: 'Dashboard', description: 'View your dashboard overview', category: 'Navigation', path: '/dashboard', icon: 'LayoutDashboard' },
          { id: 'counselor-leads', title: 'My Leads', description: 'View assigned student leads', category: 'Students', path: '/dashboard', icon: 'Users' },
          { id: 'counselor-attendance', title: 'Attendance', description: 'Track your attendance and shifts', category: 'HR', path: '/dashboard', icon: 'Clock' },
          { id: 'counselor-leave', title: 'Leave Requests', description: 'Apply for leave and check status', category: 'HR', path: '/dashboard', icon: 'Calendar' },
          { id: 'counselor-salary', title: 'Salary Records', description: 'View your salary details', category: 'HR', path: '/dashboard', icon: 'DollarSign' },
          { id: 'counselor-profile', title: 'My Profile', description: 'Update your profile information', category: 'Settings', path: '/dashboard/profile', icon: 'User' },
        ];

        // Search assigned students
        if (userId) {
          try {
            const { data: assignedStudents } = await supabase
              .from('student_leads')
              .select(`
                user_id,
                profiles!student_leads_user_id_fkey(first_name, last_name, email)
              `)
              .eq('assigned_counselor_id', userId);

            if (assignedStudents) {
              assignedStudents.forEach((lead: any) => {
                const profile = lead.profiles;
                if (profile) {
                  const fullName = `${profile.first_name} ${profile.last_name}`;
                  if (fullName.toLowerCase().includes(lowerQuery) || 
                      profile.email.toLowerCase().includes(lowerQuery)) {
                    results.push({
                      id: `student-${lead.user_id}`,
                      title: fullName,
                      description: profile.email,
                      category: 'My Students',
                      path: `/dashboard?student=${lead.user_id}`,
                      icon: 'User'
                    });
                  }
                }
              });
            }
          } catch (error) {
            console.error('Error searching assigned students:', error);
          }
        }

        // Add matching counselor options
        counselorOptions.forEach(option => {
          if (option.title.toLowerCase().includes(lowerQuery) || 
              option.description.toLowerCase().includes(lowerQuery)) {
            results.push(option);
          }
        });

      } else if (userRole === 'student') {
        // Student search options
        const studentOptions: SearchResult[] = [
          { id: 'student-dashboard', title: 'Dashboard', description: 'View your dashboard', category: 'Navigation', path: '/dashboard', icon: 'LayoutDashboard' },
          { id: 'student-profile', title: 'My Profile', description: 'Update your profile information', category: 'Settings', path: '/dashboard/profile', icon: 'User' },
          { id: 'student-universities', title: 'Universities', description: 'Browse and search universities', category: 'Applications', path: '/dashboard/universities', icon: 'Building' },
          { id: 'student-shortlists', title: 'My Shortlists', description: 'View your university shortlists', category: 'Applications', path: '/dashboard/shortlists', icon: 'Bookmark' },
          { id: 'student-applications', title: 'Applications', description: 'Track your application status', category: 'Applications', path: '/dashboard/applications', icon: 'FileCheck' },
          { id: 'student-documents', title: 'Documents', description: 'Manage your documents', category: 'Documents', path: '/dashboard/documents', icon: 'FileText' },
          { id: 'student-chat', title: 'Chat with Counselor', description: 'Message your assigned counselor', category: 'Support', path: '/dashboard/chat', icon: 'MessageSquare' },
          { id: 'student-notifications', title: 'Notifications', description: 'View your notifications', category: 'Updates', path: '/dashboard/notifications', icon: 'Bell' },
        ];

        // Add matching student options
        studentOptions.forEach(option => {
          if (option.title.toLowerCase().includes(lowerQuery) || 
              option.description.toLowerCase().includes(lowerQuery)) {
            results.push(option);
          }
        });
      }

      return results;
    } catch (error) {
      console.error('Search error:', error);
      return [];
    } finally {
      setIsLoading(false);
    }
  };

  return {
    search,
    recentSearches,
    saveRecentSearch,
    isLoading
  };
}
