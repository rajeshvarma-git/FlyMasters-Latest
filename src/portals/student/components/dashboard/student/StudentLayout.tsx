import { useEffect, useState } from 'react';
import { useAuth } from '@student/hooks/useAuth';
import { Navigate, Routes, Route, useLocation, useNavigate } from 'react-router-dom';
import { User } from 'lucide-react';
import { ensureStudentCounselorLink } from '@student/lib/ensureStudentCounselorLink';
import { loadStudentInbox } from '@student/lib/studentInbox';
import { StudentSidebar } from './StudentSidebar';
import { StudentContent } from './StudentContent';
import { StudentProfileForm } from './StudentProfileForm';
import { UniversityShortlists } from './UniversityShortlists';
import { StudentUniversities } from './StudentUniversities';
import { StudentDocuments } from './StudentDocuments';
import { StudentApplications } from './StudentApplications';
import { StudentPrivateChat } from './StudentPrivateChat';
import { StudentTelecallerChat } from './StudentTelecallerChat';
import { StudentNotifications } from './StudentNotifications';
import { MobilePortalHeader } from '@student/components/mobile/MobilePortalHeader';
import { getStudentHeaderTitle } from '@student/components/mobile/StudentMobileNav';

export function StudentLayout() {
  const { user, loading, roleLoading, isStudent } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [unreadCount, setUnreadCount] = useState(0);
  const isLoading = loading || roleLoading;
  const header = getStudentHeaderTitle(location.pathname);

  useEffect(() => {
    if (user) void ensureStudentCounselorLink(user);
  }, [user?.id]);

  useEffect(() => {
    if (!user?.id) return;
    const load = async () => {
      try {
        const items = await loadStudentInbox(user.id);
        setUnreadCount(items.filter((item) => !item.is_read).length);
      } catch {
        setUnreadCount(0);
      }
    };
    void load();
    const poll = window.setInterval(() => void load(), 10000);
    return () => window.clearInterval(poll);
  }, [user?.id]);

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gradient-background flex items-center justify-center">
        <div className="glass-card p-8">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto"></div>
          <p className="mt-4 text-muted-foreground">Loading your dashboard...</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/auth" replace />;
  }

  if (!isStudent) {
    return <Navigate to="/dashboard" replace />;
  }

  return (
    <div className="min-h-screen flex w-full max-w-full overflow-x-hidden bg-gradient-background">
      <StudentSidebar />
      <MobilePortalHeader
        title={header.title}
        subtitle={header.subtitle}
        showBack={header.showBack}
        backTo={header.backTo}
        unreadCount={unreadCount}
        onNotificationsClick={() => navigate('/student/notifications')}
      />
      <main className="mobile-scroll-area flex-1 overflow-y-auto overflow-x-hidden md:pt-0 pt-[60px] pb-6 md:pb-0">
        <Routes>
          <Route index element={<StudentContent />} />
          <Route path="profile" element={
            <div className="mobile-page-content">
              <div className="mb-6">
                <h1 className="text-3xl font-bold flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-gradient-primary flex items-center justify-center">
                    <User className="w-5 h-5 text-white" />
                  </div>
                  My Profile
                </h1>
                <p className="text-muted-foreground mt-2">
                  Fill personal details, academics, and the countries you want to study in — then click Save Profile.
                </p>
              </div>
              <StudentProfileForm />
            </div>
          } />
          <Route path="universities" element={
            <div className="mobile-page-content">
              <StudentUniversities />
            </div>
          } />
          <Route path="shortlists" element={
            <div className="mobile-page-content">
              <UniversityShortlists />
            </div>
          } />
          <Route path="documents" element={
            <div className="mobile-page-content">
              <StudentDocuments />
            </div>
          } />
          <Route path="applications" element={
            <div className="mobile-page-content">
              <StudentApplications />
            </div>
          } />
          <Route path="chat" element={
            <div className="mobile-page-content">
              <StudentPrivateChat />
            </div>
          } />
          <Route path="telecaller-chat" element={
            <div className="mobile-page-content">
              <StudentTelecallerChat />
            </div>
          } />
          <Route path="notifications" element={
            <div className="mobile-page-content">
              <StudentNotifications />
            </div>
          } />
        </Routes>
      </main>
    </div>
  );
}