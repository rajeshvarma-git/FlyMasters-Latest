import { useState } from "react";
import { HOME_FOR_ROLE, setToken, setStoredUser, type PortalRole } from "./lib/session";

/**
 * One sign-in page for every staff role.
 *
 * Before this, each staff portal had its own sign-in screen on its own URL, so
 * a branch head, a counsellor and a telecaller each had to be told a different
 * link. Now there is one: /staff.
 *
 * It calls the same POST /api/auth/signin that every role already uses, writes
 * the shared token, then sends the person to the portal their role maps to.
 * Each portal's AuthProvider reads that token on load, so nobody signs in twice.
 */

/** Roles that have a portal to land in today. */
const STAFF_ROLES = ["super_admin", "admin", "branch_head", "counselor", "telecaller", "accountant", "partner"];

/** Roles that exist in the database but have no screens built yet. */
const NOT_BUILT_YET: Record<string, string> = {};

export default function StaffSignIn() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setError("");
    setBusy(true);
    try {
      const res = await fetch("/api/auth/signin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim(), password }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.token) {
        throw new Error(data.error || "Wrong email or password.");
      }

      const role = String(data.user?.role || "") as PortalRole;

      // A student account is not refused here — it just belongs somewhere else.
      if (role === "student") {
        setToken(data.token);
        setStoredUser(data.user);
        window.location.href = "/";
        return;
      }
      if (NOT_BUILT_YET[role]) {
        throw new Error(NOT_BUILT_YET[role]);
      }
      const home = STAFF_ROLES.includes(role) ? HOME_FOR_ROLE[role] : undefined;
      if (!home) {
        throw new Error("This account has no staff role assigned. Ask an admin.");
      }

      setToken(data.token);
      setStoredUser(data.user);
      window.location.href = home;
    } catch (err: any) {
      setError(err?.message || "Could not sign in.");
      setBusy(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-navy-950 px-4 py-10">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <h1 className="text-2xl font-bold text-white">Fly Masters</h1>
          <p className="mt-1 text-sm text-slate-400">Sign in</p>
        </div>

        <form
          onSubmit={submit}
          className="rounded-2xl bg-white p-6 shadow-card"
          noValidate
        >
          <label className="block text-sm font-medium text-navy-900" htmlFor="staff-email">
            Email
          </label>
          <input
            id="staff-email"
            type="email"
            autoComplete="username"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 text-sm outline-none focus:border-sky-500"
          />

          <label className="mt-4 block text-sm font-medium text-navy-900" htmlFor="staff-password">
            Password
          </label>
          <input
            id="staff-password"
            type="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 text-sm outline-none focus:border-sky-500"
          />

          {error ? (
            <p role="alert" className="mt-4 rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700">
              {error}
            </p>
          ) : null}

          <button
            type="submit"
            disabled={busy}
            className="mt-6 w-full rounded-xl bg-navy-900 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-navy-800 disabled:opacity-60"
          >
            {busy ? "Signing in…" : "Sign in"}
          </button>

          <p className="mt-4 text-center text-xs text-slate-500">
            You are taken to your own portal automatically.
          </p>
        </form>

        <p className="mt-6 text-center text-xs text-slate-500">
          Looking for the student portal?{" "}
          <a href="/" className="font-medium text-sky-400 hover:underline">
            Go here
          </a>
        </p>
      </div>
    </div>
  );
}
