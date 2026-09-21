import { Component, type ReactNode } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import { AuthProvider } from "@admin/context/AuthContext";
import Auth from "@admin/pages/Auth";
import NotFound from "@admin/pages/NotFound";
import AdminLayout from "@admin/admin/AdminLayout";
import Dashboard from "@admin/admin/Dashboard";
import LeadAlerts from "@admin/admin/Leadalerts";
import Leads from "@admin/admin/Leads";
import LeadDetail from "@admin/admin/Leaddetail";
import CounselorsHub from "@admin/admin/CounselorsHub";
import CounselorDetail from "@admin/admin/Counselordetail";
import StudentDetail from "@admin/admin/Studentdetail";
import Students from "@admin/admin/Students";
import Documents from "@admin/admin/Documents";
import Applications from "@admin/admin/Applications";
import Shortlists from "@admin/admin/Shortlists";
import ChatMonitor from "@admin/admin/ChatMonitor";
import AiChat from "@admin/admin/AiChat";
import WhatsAppChat from "@admin/admin/WhatsAppChat";
import UsersPage from "@admin/admin/Users";
import HR from "@admin/admin/HR";
import Universities from "@admin/admin/Universities";
import Checklists from "@admin/admin/Checklists";
import Notifications from "@admin/admin/Notifications";
import Telecallers from "@admin/admin/Telecallers";
import TelecallerDetail from "@admin/admin/TelecallerDetail";
import Help from "@admin/admin/Help";

class ErrorBoundary extends Component<{ children: ReactNode }, { error: string }> {
  state = { error: "" };

  static getDerivedStateFromError(error: Error) {
    return { error: error.message || "Something went wrong" };
  }

  render() {
    if (this.state.error) {
      return (
        <div className="flex min-h-screen items-center justify-center bg-navy-950 p-6 text-white">
          <div className="max-w-md text-center">
            <h1 className="text-2xl font-bold">The page failed to load</h1>
            <p className="mt-2 text-sm text-slate-300">{this.state.error}</p>
            <button
              className="mt-4 rounded-xl bg-sky-500 px-4 py-2 text-sm font-medium text-navy-950"
              onClick={() => window.location.reload()}
            >
              Reload
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

export default function App() {
  return (
    <ErrorBoundary>
      <AuthProvider>
        <>
          <Routes>
            <Route path="/login" element={<Auth />} />
            <Route path="/signup" element={<Auth />} />
            <Route path="/auth" element={<Navigate to="/login" replace />} />
            <Route
              path="/"
              element={<AdminLayout />}
            >
              <Route index element={<Dashboard />} />
              <Route path="alerts" element={<LeadAlerts />} />
              <Route path="leads" element={<Leads />} />
              <Route path="leads/:id" element={<LeadDetail />} />
              <Route path="unassigned" element={<Navigate to="/counselors?tab=assign" replace />} />
              <Route path="students" element={<Students />} />
              <Route path="students/:id" element={<StudentDetail />} />
              <Route path="documents" element={<Documents />} />
              <Route path="applications" element={<Applications />} />
              <Route path="shortlists" element={<Shortlists />} />
              <Route path="chat" element={<ChatMonitor />} />
              <Route path="whatsapp" element={<WhatsAppChat />} />
              <Route path="ai-chat" element={<AiChat />} />
              <Route path="users" element={<UsersPage />} />
              <Route path="counselors" element={<CounselorsHub />} />
              <Route path="counselors/:id" element={<CounselorDetail />} />
              <Route path="hr" element={<HR />} />
              <Route path="universities" element={<Universities />} />
              <Route path="checklists" element={<Checklists />} />
              <Route path="notifications" element={<Notifications />} />
              <Route path="telecallers" element={<Telecallers />} />
              <Route path="telecallers/:id" element={<TelecallerDetail />} />
              <Route path="help" element={<Help />} />
              <Route path="health" element={<Navigate to="/help" replace />} />
            </Route>
            <Route path="*" element={<NotFound />} />
          </Routes>
        </>
      </AuthProvider>
    </ErrorBoundary>
  );
}
