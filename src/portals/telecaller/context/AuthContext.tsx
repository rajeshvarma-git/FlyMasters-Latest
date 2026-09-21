import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import type { AppUser } from "@telecaller/lib/types";
import { api, clearAuth, readStoredUser, setAuth } from "@telecaller/lib/api";
import { clearStore, refreshStore } from "@telecaller/lib/store";

interface SignUpInput {
  email: string;
  password: string;
  firstName: string;
  lastName: string;
  phone?: string;
  code: string;
}

interface AuthValue {
  user: AppUser | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (input: SignUpInput) => Promise<void>;
  signOut: () => void;
}

const AuthContext = createContext<AuthValue | null>(null);

const WRONG_PORTAL =
  "This site is for telecallers. Admins should use the admin portal, students and counselors their own sites.";

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AppUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const boot = async () => {
      const stored = readStoredUser<AppUser>();
      if (stored?.role === "telecaller") setUser(stored);
      try {
        const data = await api<{ user: AppUser }>("/me");
        if (data.user.role !== "telecaller") {
          clearAuth();
          setUser(null);
        } else {
          setUser(data.user);
          await refreshStore();
        }
      } catch {
        setUser(null);
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
        const data = await api<{ token: string; user: AppUser }>("/auth/signin", {
          method: "POST",
          auth: false,
          body: { email, password },
        });
        // The API lets admins sign in too. This site does not.
        if (data.user.role !== "telecaller") throw new Error(WRONG_PORTAL);
        setAuth(data.token, data.user);
        setUser(data.user);
        await refreshStore();
      },
      signUp: async ({ email, password, firstName, lastName, phone, code }) => {
        const data = await api<{ token: string; user: AppUser }>("/auth/telecaller-signup", {
          method: "POST",
          auth: false,
          body: { email, password, firstName, lastName, phone, code },
        });
        setAuth(data.token, data.user);
        setUser(data.user);
        await refreshStore();
      },
      signOut: () => {
        clearAuth();
        clearStore();
        setUser(null);
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
