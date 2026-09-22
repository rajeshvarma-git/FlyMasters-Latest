import { Component, type ReactNode } from "react";
import RedirectToStaffSignIn from "@shared/RedirectToStaffSignIn";
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
import Branches from "@admin/admin/Branches";
import Partners from "@admin/admin/Partners";
import Finance from "@admin/admin/Finance";
import HR from "@admin/admin/HR";
import Universities from "@admin/admin/Universities";
import Checklists from "@admin/admin/Checklists";
import DocumentMaster from "@admin/admin/DocumentMaster";
import ChecklistBuilder from "@admin/admin/ChecklistBuilder";
import StatusVocabulary from "@admin/admin/StatusVocabulary";
import AlertSettings from "@admin/admin/AlertSettings";
import MessageTemplates from "@admin/admin/MessageTemplates";
import Automation from "@admin/admin/Automation";
import CommsLog from "@admin/admin/CommsLog";
import ChatSupervision from "@admin/admin/ChatSupervision";
import Escalations from "@admin/admin/Escalations";
import ChangeHistory from "@admin/admin/ChangeHistory";
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
            {/* one staff door: /staff. Signup keeps its own page. */}
            <Route path="/login" element={<RedirectToStaffSignIn />} />
            <Route path="/signup" element={<Auth />} />
            <Route path="/auth" element={<RedirectToStaffSignIn />} />
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
              <Route path="branches" element={<Branches />} />
              <Route path="partners" element={<Partners />} />
              <Route path="finance" element={<Finance />} />
              <Route path="counselors" element={<CounselorsHub />} />
              <Route path="counselors/:id" element={<CounselorDetail />} />
              <Route path="hr" element={<HR />} />
              <Route path="universities" element={<Universities />} />
              <Route path="checklists" element={<Checklists />} />
              {/* CRM 2.6 — document master, versioned checklists, status words */}
              <Route path="documents-master" element={<DocumentMaster />} />
              <Route path="checklist-builder" element={<ChecklistBuilder />} />
              <Route path="statuses" element={<StatusVocabulary />} />
              <Route path="alert-settings" element={<AlertSettings />} />
              {/* CRM 2.7 — templates, automation, supervision */}
              <Route path="templates" element={<MessageTemplates />} />
              <Route path="automation" element={<Automation />} />
              <Route path="comms-log" element={<CommsLog />} />
              <Route path="supervision" element={<ChatSupervision />} />
              <Route path="escalations" element={<Escalations />} />
              <Route path="change-history" element={<ChangeHistory />} />
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
