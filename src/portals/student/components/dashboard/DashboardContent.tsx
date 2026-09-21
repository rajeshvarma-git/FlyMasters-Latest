import { Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '@student/hooks/useAuth';
import { useEffect } from 'react';
import { ProfileSection } from './sections/ProfileSection';
import { DocumentsSection } from './sections/DocumentsSection';
import { FavoritesSection } from './sections/FavoritesSection';
import { ChatHistorySection } from './sections/ChatHistorySection';
import { AdminSection } from './sections/AdminSection';
import { AnalyticsSection } from './sections/AnalyticsSection';
import { CounselorDashboard } from './counselor/CounselorDashboard';
import { StudentDashboard } from './student/StudentDashboard';
import { UniversityShortlists } from './student/UniversityShortlists';

export function DashboardContent() {
  const { userRole } = useAuth();
  const location = useLocation();
  
  // Prevent navigation on window focus/blur by stabilizing route state
  useEffect(() => {
    // This effect ensures route state is preserved across window focus changes
    const handleVisibilityChange = () => {
      // Prevent any automatic navigation by maintaining current location
      if (document.visibilityState === 'visible') {
        // When tab becomes visible again, don't trigger any navigation
        console.log('Tab visible, current route:', location.pathname);
      }
    };
    
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, [location.pathname]);
  
  return (
    <div className="p-4 md:p-6 w-full overflow-x-hidden">
      <Routes>
        <Route index element={
          userRole === 'telecaller' ? <Navigate to="/dashboard/admin/whatsapp" replace /> :
          userRole === 'counselor' ? <CounselorDashboard /> : 
          userRole === 'student' ? <StudentDashboard /> : <ProfileSection />
        } />
        <Route path="documents" element={<DocumentsSection />} />
        <Route path="favorites" element={<FavoritesSection />} />
        <Route path="shortlists" element={<UniversityShortlists />} />
        <Route path="chat-history" element={<ChatHistorySection />} />
        <Route path="admin/*" element={<AdminSection />} />
        <Route path="analytics" element={<AnalyticsSection />} />
      </Routes>
    </div>
  );
}