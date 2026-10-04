import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import type { Role } from "@counselor/lib/types";
import { api, clearAuth, getToken, readStoredUser, setAuth } from "@counselor/lib/api";
import { refreshStore } from "@counselor/lib/store";

export interface AppUser {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  phone?: string;
}

export type SignUpResult = {
  ok: boolean;
};

interface AuthValue {
  user: AppUser | null;
  role: Role | null;
  loading: boolean;
  roleLoading: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (input: {
    email: string;
    password: string;
    firstName: string;
    lastName: string;
    phone?: string;
    verificationCode: string;
  }) => Promise<SignUpResult>;
  sendVerificationCode: (email: string) => Promise<{ message: string; devHint?: string }>;
  updateProfile: (input: {
    firstName: string;
    lastName: string;
    phone?: string;
    bio?: string;
    specializations?: string[];
  }) => Promise<void>;
  activateCounselor: () => Promise<void>;
  signOut: (redirect?: boolean) => Promise<void>;
}

const AuthContext = createContext<AuthValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AppUser | null>(null);
  const [role, setRole] = useState<Role | null>(null);
  const [loading, setLoading] = useState(true);

  const enter = (next: AppUser) => {
    setUser(next);
    setRole("counselor");
  };

  useEffect(() => {
    const boot = async () => {
      // The stored user is shared by every staff portal: only a counselor's
      // is shown here, and only until the server confirms it.
      const stored = readStoredUser<AppUser & { role?: string }>();
      const storedOk = Boolean(stored && (!stored.role || stored.role === "counselor"));
      if (stored && storedOk) enter(stored);
      try {
        const data = await api<{ user: AppUser }>("/me");
        enter(data.user);
        await refreshStore();
      } catch (error) {
        // Offline: keep the stored counselor. Anything else (not signed in,
        // not a counselor) shows the sign-in page instead of the portal.
        const offline = error instanceof Error && /Cannot reach/i.test(error.message);
        if (!offline || !storedOk) {
          setUser(null);
          setRole(null);
        }
      } finally {
        setLoading(false);
      }
    };
    void boot();
  }, []);

  const value = useMemo<AuthValue>(
    () => ({
      user,
      role,
      loading,
      roleLoading: false,
      signIn: async (email, password) => {
        const data = await api<{ token: string; user: AppUser }>("/auth/signin", {
          method: "POST",
          auth: false,
          body: { email, password },
        });
        setAuth(data.token, data.user);
        enter(data.user);
        await refreshStore();
      },
      signUp: async (input) => {
        if (input.password.length < 6) throw new Error("Password must be at least 6 characters");
        if (!input.verificationCode.trim()) throw new Error("Enter the verification code sent to your email");
        const data = await api<{ token: string; user: AppUser }>("/auth/signup", {
          method: "POST",
          auth: false,
          body: input,
        });
        setAuth(data.token, data.user);
        enter(data.user);
        await refreshStore();
        return { ok: true };
      },
      sendVerificationCode: async (email) => {
        const data = await api<{ message: string; devHint?: string }>("/auth/send-verification-code", {
          method: "POST",
          auth: false,
          body: { email },
        });
        return { message: data.message, devHint: data.devHint };
      },
      updateProfile: async (input) => {
        if (!user) return;
        await api("/profile", {
          method: "PUT",
          body: {
            firstName: input.firstName,
            lastName: input.lastName,
            phone: input.phone ?? "",
            bio: input.bio,
            specializations: input.specializations,
          },
        });
        await refreshStore();
        const next = { ...user, firstName: input.firstName, lastName: input.lastName, phone: input.phone ?? "" };
        setAuth(getToken(), next);
        enter(next);
      },
      activateCounselor: async () => {
        if (user) setRole("counselor");
      },
      signOut: async (redirect = true) => {
        clearAuth();
        setUser(null);
        setRole(null);
        if (redirect) window.location.href = "/";
      },
    }),
    [user, role, loading],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside AuthProvider");
  return ctx;
}
