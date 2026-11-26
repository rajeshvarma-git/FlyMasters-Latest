import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import type { AppUser } from "@admin/lib/types";
import { api, endSession, readStoredUser, setAuth } from "@admin/lib/api";
import { refreshStore } from "@admin/lib/store";
import type { WhatsAppChallenge } from "@shared/components/WhatsAppCodeStep";

interface AuthValue {
  user: AppUser | null;
  loading: boolean;
  /** Returns a challenge when a WhatsApp code is needed before the session is given. */
  signIn: (email: string, password: string) => Promise<WhatsAppChallenge | void>;
  completeMfa: (challengeId: string, code: string) => Promise<void>;
  resendMfa: (challengeId: string) => Promise<void>;
  signUp: (input: {
    email: string;
    password: string;
    firstName: string;
    lastName: string;
    phone?: string;
    code?: string;
  }) => Promise<void>;
  signOut: (redirect?: boolean) => Promise<void>;
}

const AuthContext = createContext<AuthValue | null>(null);

/** Roles whose home is the admin portal (see HOME_FOR_ROLE in shared/lib/session.ts). */
const ADMIN_PORTAL_ROLES = ["super_admin", "admin", "branch_head", "accountant"];

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AppUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const boot = async () => {
      // The stored user is shared by every staff portal: only admin-portal
      // roles are let in, and only until the server confirms the role.
      const stored = readStoredUser<AppUser>();
      const storedOk = Boolean(stored && ADMIN_PORTAL_ROLES.includes(String(stored.role)));
      if (storedOk) setUser(stored);
      try {
        const data = await api<{ user: AppUser }>("/me");
        const allowed = ADMIN_PORTAL_ROLES.includes(String(data.user?.role));
        setUser(allowed ? data.user : null);
        if (allowed) await refreshStore();
      } catch (error) {
        const offline = error instanceof Error && /Cannot reach/i.test(error.message);
        if (!offline || !storedOk) setUser(null);
      } finally {
        setLoading(false);
      }
    };
    void boot();
  }, []);

  const value = useMemo<AuthValue>(
    () => ({
      user,
      loading,
      signIn: async (email, password) => {
        const data = await api<{ token?: string; refreshToken?: string | null; user?: AppUser; mfaRequired?: boolean; challengeId?: string; masked?: string }>("/auth/signin", {
          method: "POST",
          auth: false,
          body: { email, password },
        });
        if (data.mfaRequired && data.challengeId) return { challengeId: data.challengeId, masked: data.masked || "" };
        setAuth(data.token as string, data.user as AppUser, data.refreshToken);
        setUser(data.user as AppUser);
        await refreshStore();
      },
      completeMfa: async (challengeId, code) => {
        const data = await api<{ token: string; refreshToken?: string | null; user: AppUser }>("/auth/mfa/verify", {
          method: "POST",
          auth: false,
          body: { challengeId, code },
        });
        setAuth(data.token, data.user, data.refreshToken);
        setUser(data.user);
        await refreshStore();
      },
      resendMfa: async (challengeId) => {
        await api("/auth/mfa/resend", { method: "POST", auth: false, body: { challengeId } });
      },
      signUp: async (input) => {
        if (input.password.length < 6) throw new Error("Password must be at least 6 characters");
        const data = await api<{ token: string; refreshToken?: string | null; user: AppUser }>("/auth/signup", {
          method: "POST",
          auth: false,
          body: input,
        });
        setAuth(data.token, data.user, data.refreshToken);
        setUser(data.user);
        await refreshStore();
      },
      signOut: async (redirect = true) => {
        // Ends the session on the server first: clearing the browser alone used to leave a token that
        // kept working for a week.
        await endSession();
        setUser(null);
        if (redirect) window.location.href = "/";
      },
    }),
    [user, loading],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside AuthProvider");
  return ctx;
}
