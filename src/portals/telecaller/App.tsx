import { Navigate, Route, Routes } from "react-router-dom";
import { AuthProvider } from "@telecaller/context/AuthContext";
import { ErrorBoundary } from "@telecaller/components/ErrorBoundary";
import { RequireTelecaller } from "@telecaller/components/RequireTelecaller";
import SignIn from "@telecaller/pages/SignIn";
import SignUp from "@telecaller/pages/SignUp";
import NotFound from "@telecaller/pages/NotFound";
import Layout from "@telecaller/screens/Layout";
import Queue from "@telecaller/screens/Queue";
import LeadWorkspace from "@telecaller/screens/LeadWorkspace";
import Converted from "@telecaller/screens/Converted";
import Chat from "@telecaller/screens/Chat";
import WhatsAppChat from "@telecaller/screens/WhatsAppChat";

export default function App() {
  return (
    <ErrorBoundary>
      <AuthProvider>
        <>
          <Routes>
            <Route path="/" element={<SignIn />} />
            <Route path="/signup" element={<SignUp />} />
            <Route path="/login" element={<Navigate to="/" replace />} />
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
              <Route path="/chat" element={<Chat />} />
              <Route path="/converted" element={<Converted />} />
            </Route>
            <Route path="*" element={<NotFound />} />
          </Routes>
        </>
      </AuthProvider>
    </ErrorBoundary>
  );
}
