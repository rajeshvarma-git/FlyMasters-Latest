import { useAuth } from '@student/hooks/useAuth';
import { Navigate, Routes, Route } from 'react-router-dom';
import { useLocation } from 'react-router-dom';
import { CounselorSidebar } from './CounselorSidebar';
import { CounselorDashboard } from '@student/counselor/dashboard/CounselorDashboard';
import { MyLeads } from '@student/counselor/leads/MyLeads';
import { MyStudents } from '@student/counselor/students/MyStudents';
import { UniversityShortlisting } from '@student/counselor/shortlists/UniversityShortlisting';
import { CounselorStudentChat } from '@student/counselor/chat/CounselorStudentChat';
import { WhatsAppInbox } from '@student/components/whatsapp/WhatsAppInbox';
import { CounselorProfileForm } from '@student/counselor/profile/CounselorProfileForm';
import { LeaveManagement } from '@student/counselor/hr/LeaveManagement';
import { AttendanceTracking } from '@student/counselor/hr/AttendanceTracking';
import { SalaryRecords } from '@student/counselor/hr/SalaryRecords';
import { StudentDocumentReview } from '@student/counselor/documents/CounselorDocumentReview';
import { StudentNotifications } from '@student/counselor/notifications/CounselorNotifications';
import { MobilePortalHeader } from '@student/components/mobile/MobilePortalHeader';
import { getCounselorHeaderTitle } from '@student/components/mobile/CounselorMobileNav';

export function CounselorLayout() {
  const { user, loading, roleLoading, userRole, isAdmin } = useAuth();
  const location = useLocation();
  const isLoading = loading || roleLoading;
  const header = getCounselorHeaderTitle(location.pathname);

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gradient-background flex items-center justify-center">
        <div className="glass-card p-8">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto"></div>
          <p className="mt-4 text-muted-foreground">Loading counselor portal...</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/auth" replace />;
  }

  if (userRole !== 'counselor' && !isAdmin) {
    return <Navigate to="/dashboard" replace />;
  }

  return (
    <div className="min-h-screen flex w-full max-w-full overflow-x-hidden bg-gradient-background">
      <CounselorSidebar />
      <MobilePortalHeader
        title={header.title}
        subtitle={header.subtitle}
        showBack={header.showBack}
        backTo={header.backTo}
      />
      <main className="mobile-scroll-area flex-1 overflow-y-auto overflow-x-hidden md:pt-0 pt-[60px] pb-6 md:pb-0">
        <Routes>
          <Route index element={<div className="mobile-page-content"><CounselorDashboard /></div>} />
          <Route path="leads" element={<div className="mobile-page-content"><MyLeads /></div>} />
          <Route path="students" element={<div className="mobile-page-content"><MyStudents /></div>} />
          <Route path="shortlists" element={<div className="mobile-page-content"><UniversityShortlisting /></div>} />
          <Route path="chat" element={<div className="mobile-page-content"><CounselorStudentChat /></div>} />
          <Route path="whatsapp" element={<div className="mobile-page-content"><WhatsAppInbox subtitle="WhatsApp threads for your assigned students" /></div>} />
          <Route path="documents" element={<div className="mobile-page-content"><StudentDocumentReview /></div>} />
          <Route path="profile" element={<div className="mobile-page-content"><CounselorProfileForm /></div>} />
          <Route path="leave" element={<div className="mobile-page-content"><LeaveManagement /></div>} />
          <Route path="attendance" element={<div className="mobile-page-content"><AttendanceTracking /></div>} />
          <Route path="salary" element={<div className="mobile-page-content"><SalaryRecords /></div>} />
          <Route path="notifications" element={<div className="mobile-page-content"><StudentNotifications /></div>} />
        </Routes>
      </main>
    </div>
  );
}
