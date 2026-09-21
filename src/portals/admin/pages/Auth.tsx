import { FormEvent, useEffect, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { Shield } from "lucide-react";
import { Button } from "@admin/components/ui/Button";
import { Card } from "@admin/components/ui/Card";
import { Input, Label } from "@admin/components/ui/Field";
import { useAuth } from "@admin/context/AuthContext";

export default function Auth() {
  const location = useLocation();
  const isSignup = location.pathname === "/signup";
  const [mode, setMode] = useState<"login" | "signup">(isSignup ? "signup" : "login");
  const [email, setEmail] = useState(isSignup ? "" : "admin@local.test");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [phone, setPhone] = useState("");
  const [signupCode, setSignupCode] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const navigate = useNavigate();
  const { user, loading, signIn, signUp } = useAuth();

  useEffect(() => {
    if (!loading && user) navigate("/", { replace: true });
  }, [user, loading, navigate]);

  useEffect(() => {
    const signup = location.pathname === "/signup";
    setMode(signup ? "signup" : "login");
    setError("");
    setPassword("");
    setConfirmPassword("");
    setSignupCode("");
    if (signup) {
      setEmail("");
    } else if (!email || email === "") {
      setEmail("admin@local.test");
    }
  }, [location.pathname]);

  const switchMode = (next: "login" | "signup") => {
    setError("");
    setPassword("");
    setConfirmPassword("");
    setSignupCode("");
    navigate(next === "signup" ? "/signup" : "/", { replace: true });
  };

  const onSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError("");

    if (mode === "signup") {
      if (password.length < 6) {
        setError("Password must be at least 6 characters.");
        return;
      }
      if (password !== confirmPassword) {
        setError("Passwords do not match.");
        return;
      }
      if (!firstName.trim() || !lastName.trim()) {
        setError("First name and last name are required.");
        return;
      }
    }

    setBusy(true);
    try {
      if (mode === "login") {
        await signIn(email, password);
      } else {
        await signUp({
          email,
          password,
          firstName: firstName.trim(),
          lastName: lastName.trim(),
          phone: phone.trim(),
          code: signupCode.trim() || undefined,
        });
      }
      navigate("/", { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-navy-950 px-4 py-8">
      <div className="pointer-events-none absolute inset-0 bg-hero-grid" />
      <Card className="relative w-full max-w-md p-8 text-navy-900">
        <div className="mb-6 flex items-center gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-full bg-sky-500 text-white">
            <Shield className="h-5 w-5" />
          </span>
          <div>
            <p className="font-bold leading-tight">Fly Masters</p>
            <p className="text-xs uppercase tracking-widest text-slate-500">Admin portal</p>
          </div>
        </div>

        <h1 className="text-2xl font-bold">{mode === "login" ? "Sign in" : "Create admin account"}</h1>
        <p className="mt-1 text-sm text-slate-500">
          {mode === "login"
            ? "Manage students, counselors, documents, and HR from one control center."
            : "Register as an admin to manage leads, students, counselors, and operations."}
        </p>

        <form className="mt-6 space-y-3" onSubmit={(e) => void onSubmit(e)}>
          {mode === "signup" && (
            <>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>First name</Label>
                  <Input
                    name="firstName"
                    required
                    autoComplete="given-name"
                    placeholder="Fly"
                    value={firstName}
                    onChange={(e) => setFirstName(e.target.value)}
                  />
                </div>
                <div>
                  <Label>Last name</Label>
                  <Input
                    name="lastName"
                    required
                    autoComplete="family-name"
                    placeholder="Admin"
                    value={lastName}
                    onChange={(e) => setLastName(e.target.value)}
                  />
                </div>
              </div>
              <div>
                <Label>Phone (optional)</Label>
                <Input
                  name="phone"
                  type="tel"
                  autoComplete="tel"
                  placeholder="+91 98765 43210"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                />
              </div>
              <div>
                <Label>Signup code</Label>
                <Input
                  name="signupCode"
                  autoComplete="off"
                  placeholder="From your Fly Masters admin"
                  value={signupCode}
                  onChange={(e) => setSignupCode(e.target.value)}
                />
              </div>
            </>
          )}
          <div>
            <Label>Email</Label>
            <Input
              name="email"
              type="email"
              required
              autoComplete="username"
              placeholder={mode === "signup" ? "you@company.com" : "admin@local.test"}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>
          <div>
            <Label>Password</Label>
            <Input
              name="password"
              type="password"
              required
              autoComplete={mode === "login" ? "current-password" : "new-password"}
              minLength={6}
              placeholder={mode === "signup" ? "At least 6 characters" : ""}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>
          {mode === "signup" && (
            <div>
              <Label>Confirm password</Label>
              <Input
                name="confirmPassword"
                type="password"
                required
                autoComplete="new-password"
                minLength={6}
                placeholder="Re-enter password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
              />
            </div>
          )}
          {error && (
            <p className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p>
          )}
          <Button className="w-full" type="submit" disabled={busy || loading}>
            {busy ? "Please wait..." : mode === "login" ? "Sign in" : "Create account"}
          </Button>
        </form>

        <p className="mt-4 text-center text-sm text-slate-500">
          {mode === "login" ? (
            <>
              New admin?{" "}
              <button type="button" className="font-medium text-sky-700 hover:underline" onClick={() => switchMode("signup")}>
                Create account
              </button>
            </>
          ) : (
            <>
              Already have an account?{" "}
              <button type="button" className="font-medium text-sky-700 hover:underline" onClick={() => switchMode("login")}>
                Sign in
              </button>
            </>
          )}
        </p>

        {mode === "login" && (
          <p className="mt-3 text-center text-xs text-slate-500">
            Local admin:{" "}
            <Link to="/login" className="font-medium text-navy-800 hover:underline">
              admin@local.test
            </Link>{" "}
            / admin123
          </p>
        )}

        {mode === "signup" && (
          <p className="mt-3 text-center text-xs text-slate-500">
            Production signup needs a signup code from an existing admin, or ask them to create your account under Users.
            Telecaller and counselor accounts are created separately.
          </p>
        )}
      </Card>
    </div>
  );
}
