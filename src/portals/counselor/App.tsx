import { Component, type ReactNode } from "react";
import RedirectToStaffSignIn from "@shared/RedirectToStaffSignIn";
import { Navigate, Route, Routes } from "react-router-dom";
import { AuthProvider } from "@counselor/context/AuthContext";
import { RequireAuth } from "@counselor/components/RequireAuth";
import Auth from "@counselor/pages/Auth";
import NotFound from "@counselor/pages/NotFound";
import CounselorLayout from "@counselor/counselor/CounselorLayout";
import CounselorHome from "@counselor/counselor/CounselorHome";
import MyLeads from "@counselor/counselor/MyLeads";
import MyStudents from "@counselor/counselor/MyStudents";
import Shortlists from "@counselor/counselor/Shortlists";
import CounselorChat from "@counselor/counselor/CounselorChat";
import { WhatsAppLeadsChat, WhatsAppStudentsChat } from "@counselor/counselor/WhatsAppChat";
import Documents from "@counselor/counselor/Documents";
import DocumentsSetup from "@counselor/counselor/DocumentsSetup";
import Applications from "@counselor/counselor/Applications";
import {
  AttendancePage,
  CounselorProfile,
  LeavePage,
  NotificationsPage,
  SalaryPage,
} from "@counselor/counselor/AccountPages";

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
          {/* one staff door: /staff */}
          <Route path="/login" element={<RedirectToStaffSignIn />} />
          <Route path="/auth" element={<RedirectToStaffSignIn />} />

          <Route
            path="/"
            element={
              <RequireAuth roles={["counselor"]}>
                <CounselorLayout />
              </RequireAuth>
            }
          >
            <Route index element={<CounselorHome />} />
            <Route path="leads" element={<MyLeads />} />
            <Route path="students" element={<MyStudents />} />
            <Route path="shortlists" element={<Shortlists />} />
            <Route path="chat" element={<CounselorChat />} />
            <Route path="whatsapp" element={<Navigate to="/whatsapp/students" replace />} />
            <Route path="whatsapp/leads" element={<WhatsAppLeadsChat />} />
            <Route path="whatsapp/students" element={<WhatsAppStudentsChat />} />
            <Route path="documents" element={<Documents />} />
            <Route path="documents/setup" element={<DocumentsSetup />} />
            <Route path="applications" element={<Applications />} />
            <Route path="notifications" element={<NotificationsPage />} />
            <Route path="profile" element={<CounselorProfile />} />
            <Route path="leave" element={<LeavePage />} />
            <Route path="attendance" element={<AttendancePage />} />
            <Route path="salary" element={<SalaryPage />} />
          </Route>

          <Route path="*" element={<NotFound />} />
        </Routes>
      </>
    </AuthProvider>
    </ErrorBoundary>
  );
}
