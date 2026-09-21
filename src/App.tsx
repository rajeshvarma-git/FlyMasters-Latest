import { Suspense, lazy, useMemo } from "react";
import { BrowserRouter } from "react-router-dom";

/**
 * Platform shell.
 *
 * One router, one bundle entry, four portals. The portal is chosen from the URL
 * prefix and mounted under a matching `basename`, so each portal keeps the
 * absolute paths it already used ("/queue", "/leads/:id") and every navigate()
 * inside it stays within its own prefix. No portal route tables were rewritten.
 *
 * React.lazy keeps this a code-split build: opening /admin does not download the
 * student portal, which is by far the largest of the four.
 */
const AdminApp = lazy(() => import("@admin/App"));
const CounselorApp = lazy(() => import("@counselor/App"));
const TelecallerApp = lazy(() => import("@telecaller/App"));
const StudentApp = lazy(() => import("@student/App"));

type PortalKey = "admin" | "counselor" | "telecaller" | "student";

const PORTALS: Record<Exclude<PortalKey, "student">, { basename: string; shell: string }> = {
  admin: { basename: "/admin", shell: "staff-shell" },
  counselor: { basename: "/counselor", shell: "staff-shell" },
  telecaller: { basename: "/telecaller", shell: "staff-shell" },
};

function resolvePortal(pathname: string): PortalKey {
  if (pathname === "/admin" || pathname.startsWith("/admin/")) return "admin";
  if (pathname === "/counselor" || pathname.startsWith("/counselor/")) return "counselor";
  if (pathname === "/telecaller" || pathname.startsWith("/telecaller/")) return "telecaller";
  return "student";
}

function Loading() {
  return (
    <div className="flex min-h-screen items-center justify-center text-sm text-slate-500">
      Loading…
    </div>
  );
}

export default function App() {
  // Read once per load. Crossing portals is a full navigation, which is correct:
  // the portals do not share React state and each mounts under its own basename.
  const portal = useMemo(() => resolvePortal(window.location.pathname), []);

  if (portal === "student") {
    return (
      <BrowserRouter>
        <Suspense fallback={<Loading />}>
          <StudentApp />
        </Suspense>
      </BrowserRouter>
    );
  }

  const { basename, shell } = PORTALS[portal];
  const Portal =
    portal === "admin" ? AdminApp : portal === "counselor" ? CounselorApp : TelecallerApp;

  return (
    <div className={shell}>
      <BrowserRouter basename={basename}>
        <Suspense fallback={<Loading />}>
          <Portal />
        </Suspense>
      </BrowserRouter>
    </div>
  );
}
