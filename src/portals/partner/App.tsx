import { useEffect, useState } from "react";
import { Route, Routes, NavLink, Navigate } from "react-router-dom";
import { Handshake, Users, Receipt, LogOut } from "lucide-react";
import { api, type PartnerProfile } from "@partner/lib/api";
import { clearSession } from "@shared/lib/session";
import Referrals from "@partner/screens/Referrals";
import Commissions from "@partner/screens/Commissions";

/**
 * Agent / Freelancer portal.
 *
 * Two screens only: the students they referred, and what they are owed.
 * Everything is scoped server-side to this partner's own id — there is no
 * branch view and no all-students view, by design.
 */
export default function App() {
  const [profile, setProfile] = useState<PartnerProfile | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    void api<{ partner: PartnerProfile }>("/me")
      .then((d) => setProfile(d.partner))
      .catch((e) => setError(e instanceof Error ? e.message : "Could not load your account"));
  }, []);

  if (error) {
    return (
      <div className="flex min-h-screen items-center justify-center p-6">
        <div className="max-w-sm text-center">
          <p className="text-sm text-red-700">{error}</p>
          <button
            className="mt-4 rounded-xl bg-navy-900 px-4 py-2 text-sm text-white"
            onClick={() => { clearSession(); window.location.href = "/staff"; }}
          >
            Sign in again
          </button>
        </div>
      </div>
    );
  }

  if (!profile) {
    return <div className="flex min-h-screen items-center justify-center text-sm text-slate-500">Loading…</div>;
  }

  const link = `${window.location.origin}${profile.referralLink}`;

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center gap-4 px-4 py-4">
          <Handshake className="h-6 w-6 text-sky-600" />
          <div className="mr-auto">
            <p className="font-semibold text-navy-900">{profile.businessName || profile.name}</p>
            <p className="text-xs capitalize text-slate-500">
              {profile.type}
              {profile.branch ? ` · ${profile.branch.name}` : ""}
              {` · code ${profile.code}`}
            </p>
          </div>
          <button
            onClick={() => { clearSession(); window.location.href = "/staff"; }}
            className="flex items-center gap-1 text-sm text-slate-600 hover:text-navy-900"
          >
            <LogOut className="h-4 w-4" /> Sign out
          </button>
        </div>

        <div className="mx-auto max-w-5xl px-4 pb-4">
          <div className="rounded-xl border border-sky-200 bg-sky-50 p-3">
            <p className="text-xs font-medium text-navy-900">Your referral link</p>
            <div className="mt-1 flex flex-wrap items-center gap-2">
              <code className="break-all rounded bg-white px-2 py-1 text-xs text-slate-700">{link}</code>
              <button
                onClick={() => void navigator.clipboard?.writeText(link)}
                className="rounded-lg bg-navy-900 px-3 py-1 text-xs text-white"
              >
                Copy
              </button>
              <span className="text-xs text-slate-500">
                or ask the student to enter <strong>{profile.code}</strong> when they sign up
              </span>
            </div>
          </div>
        </div>

        <nav className="mx-auto flex max-w-5xl gap-1 px-4">
          {[
            { to: "/referrals", label: "My students", icon: Users },
            { to: "/commissions", label: "Commissions", icon: Receipt },
          ].map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) =>
                `flex items-center gap-2 border-b-2 px-3 py-2 text-sm ${
                  isActive ? "border-sky-500 font-medium text-navy-900" : "border-transparent text-slate-600"
                }`
              }
            >
              <item.icon className="h-4 w-4" />
              {item.label}
            </NavLink>
          ))}
        </nav>
      </header>

      <main className="mx-auto max-w-5xl px-4 py-6">
        <Routes>
          <Route path="/" element={<Navigate to="/referrals" replace />} />
          <Route path="/referrals" element={<Referrals />} />
          <Route path="/commissions" element={<Commissions />} />
          <Route path="*" element={<Navigate to="/referrals" replace />} />
        </Routes>
      </main>
    </div>
  );
}
