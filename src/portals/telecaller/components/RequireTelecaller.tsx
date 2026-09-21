import { Navigate } from "react-router-dom";
import { useAuth } from "@telecaller/context/AuthContext";
import type { ReactNode } from "react";

/**
 * Routing guard only. The API re-checks the caller's role on every request, so this
 * decides what to render, not what data is reachable.
 */
export function RequireTelecaller({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50">
        <div className="text-center">
          <div className="mx-auto h-8 w-8 animate-spin rounded-full border-2 border-navy-900 border-t-transparent" />
          <p className="mt-3 text-sm text-slate-500">Loading your queue...</p>
        </div>
      </div>
    );
  }

  if (!user || user.role !== "telecaller") return <Navigate to="/" replace />;
  return <>{children}</>;
}
