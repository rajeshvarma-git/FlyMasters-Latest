import React, { useEffect } from 'react';
import { Toaster } from "@student/components/ui/toaster";
import { Toaster as Sonner } from "@student/components/ui/sonner";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Routes, Route, useLocation } from "react-router-dom";
import { HelmetProvider } from "react-helmet-async";
import { AuthProvider } from "@student/hooks/useAuth";
import { PWAInstallPrompt } from "@student/components/PWAInstallPrompt";
import { OfflineIndicator } from "@student/components/OfflineIndicator";
import { MobileHeader } from "@student/components/MobileHeader";
import { MobileAssistiveTouch } from "@student/components/mobile/MobileAssistiveTouch";
import { isPortalRoute } from "@student/hooks/useRouteContext";
import Index from "./pages/Index";
import Auth from "./pages/Auth";
import Chat from "./pages/Chat";
import Universities from "./pages/Universities";
import Dashboard from "./pages/Dashboard";
import NotFound from "./pages/NotFound";
import CountryDetail from "./pages/CountryDetail";
import Travel from "./pages/Travel";
import ServiceDetail from "./pages/ServiceDetail";
import { AdminSection } from "./components/dashboard/sections/AdminSection";
import { CounselorLayout } from "./counselor/layout/CounselorLayout";

const queryClient = new QueryClient();

function MobileShell({ children }: { children: React.ReactNode }) {
  const location = useLocation();
  const showPublicMobile = !isPortalRoute(location.pathname) && location.pathname !== '/auth';

  return (
    <>
      {showPublicMobile && <MobileHeader />}
      <main className={`w-full ${showPublicMobile ? 'pt-14 md:pt-0' : ''}`}>
        {children}
      </main>
    </>
  );
}

const App = () => {
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;

    if (import.meta.env.DEV) {
      navigator.serviceWorker.getRegistrations().then(async (registrations) => {
        const hadWorker = registrations.length > 0 || Boolean(navigator.serviceWorker.controller);
        await Promise.all(registrations.map((registration) => registration.unregister()));
        const keys = await caches.keys();
        await Promise.all(keys.map((key) => caches.delete(key)));
        if (hadWorker && !sessionStorage.getItem("cleared-dev-sw")) {
          sessionStorage.setItem("cleared-dev-sw", "1");
          window.location.reload();
        }
      });
      return;
    }

    const register = () => {
      navigator.serviceWorker.register('/sw.js').catch((registrationError) => {
        console.log('SW registration failed: ', registrationError);
      });
    };

    if (document.readyState === 'complete') {
      register();
    } else {
      window.addEventListener('load', register, { once: true });
    }
  }, []);

  return (
    <QueryClientProvider client={queryClient}>
      <HelmetProvider>
        <>
          <AuthProvider>
            <div className="min-h-screen w-full overflow-x-hidden bg-gradient-background">
              <Toaster />
              <Sonner />
              <OfflineIndicator />
              <MobileShell>
                <Routes>
                  <Route path="/" element={<Index />} />
                  <Route path="/chat" element={<Chat />} />
                  <Route path="/universities" element={<Universities />} />
                  <Route path="/travel" element={<Travel />} />
                  <Route path="/services/:slug" element={<ServiceDetail />} />
                  <Route path="/destinations/:slug" element={<CountryDetail />} />
                  <Route path="/dashboard/*" element={<Dashboard />} />
                  <Route path="/student/*" element={<Dashboard />} />
                  <Route path="/counselor/*" element={<CounselorLayout />} />
                  <Route path="/admin/*" element={<div className="p-4 md:p-6"><AdminSection /></div>} />
                  <Route path="/auth" element={<Auth />} />
                  <Route path="*" element={<NotFound />} />
                </Routes>
              </MobileShell>
              <MobileAssistiveTouch />
              <PWAInstallPrompt />
            </div>
          </AuthProvider>
        </>
      </HelmetProvider>
    </QueryClientProvider>
  );
};

export default App;
