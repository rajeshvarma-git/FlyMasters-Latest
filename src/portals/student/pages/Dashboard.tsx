import { useAuth } from '@student/hooks/useAuth';
import { Navigate } from 'react-router-dom';
import { SidebarProvider } from '@student/components/ui/sidebar';
import { DashboardSidebar } from '@student/components/dashboard/DashboardSidebar';
import { DashboardContent } from '@student/components/dashboard/DashboardContent';
import { AdminQuickAccess } from '@student/components/AdminQuickAccess';
import { StudentLayout } from '@student/components/dashboard/student/StudentLayout';

const Dashboard = () => {
  const { user, loading, roleLoading, userRole, isAdmin } = useAuth();
  const isLoading = loading || roleLoading;

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gradient-background flex items-center justify-center">
        <div className="glass-card p-8">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto"></div>
          <p className="mt-4 text-muted-foreground">Loading dashboard...</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/auth" replace />;
  }

  // Ensure we have role loaded before deciding layout
  if (!userRole) {
    return (
      <div className="min-h-screen bg-gradient-background flex items-center justify-center">
        <div className="glass-card p-8">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto"></div>
          <p className="mt-4 text-muted-foreground">Loading your profile...</p>
        </div>
      </div>
    );
  }

  // Route based on ACTUAL role, not hierarchical permissions
  // Check in order: admin -> counselor -> student
  if (userRole === 'admin' || userRole === 'super_admin' || userRole === 'telecaller') {
    return (
      <SidebarProvider>
        <div className="min-h-screen flex w-full overflow-x-hidden bg-gradient-background">
          <DashboardSidebar />
          <main className="flex-1 w-full overflow-x-hidden">
            <DashboardContent />
          </main>
          <AdminQuickAccess />
        </div>
      </SidebarProvider>
    );
  }

  if (userRole === 'counselor') {
    return <Navigate to="/counselor" replace />;
  }

  // Default to student layout for student role or fallback
  return <StudentLayout />;
};

export default Dashboard;