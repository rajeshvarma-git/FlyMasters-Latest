import { Navigate, Route, Routes } from "react-router-dom";
import { AuthProvider } from "@telecaller/context/AuthContext";
import { ErrorBoundary } from "@telecaller/components/ErrorBoundary";
import { RequireTelecaller } from "@telecaller/components/RequireTelecaller";
import RedirectToStaffSignIn from "@shared/RedirectToStaffSignIn";
import SignUp from "@telecaller/pages/SignUp";
import NotFound from "@telecaller/pages/NotFound";
import Layout from "@telecaller/screens/Layout";
import Queue from "@telecaller/screens/Queue";
import LeadWorkspace from "@telecaller/screens/LeadWorkspace";
import Converted from "@telecaller/screens/Converted";
import CaseInbox from "@shared/components/CaseInbox";
import WhatsAppChat from "@telecaller/screens/WhatsAppChat";
import {
  TelecallerAttendance, TelecallerLeave, TelecallerNotifications, TelecallerProfile, TelecallerSalary,
} from "@telecaller/screens/MyWork";

export default function App() {
  return (
    <ErrorBoundary>
      <AuthProvider>
        <>
          <Routes>
            {/* one staff door: /staff. Signup keeps its own page. */}
            <Route path="/" element={<RedirectToStaffSignIn />} />
            <Route path="/signup" element={<SignUp />} />
            <Route path="/login" element={<RedirectToStaffSignIn />} />
            <Route
              element={
                <RequireTelecaller>
                  <Layout />
                </RequireTelecaller>
              }
            >
              <Route path="/queue" element={<Queue />} />
              <Route path="/leads/:id" element={<LeadWorkspace />} />
              <Route path="/whatsapp" element={<WhatsAppChat />} />
              <Route path="/chat" element={<CaseInbox title="Student Chat" />} />
              <Route path="/converted" element={<Converted />} />
              <Route path="/notifications" element={<TelecallerNotifications />} />
              <Route path="/profile" element={<TelecallerProfile />} />
              <Route path="/attendance" element={<TelecallerAttendance />} />
              <Route path="/leave" element={<TelecallerLeave />} />
              <Route path="/salary" element={<TelecallerSalary />} />
            </Route>
            <Route path="*" element={<NotFound />} />
          </Routes>
        </>
      </AuthProvider>
    </ErrorBoundary>
  );
}
