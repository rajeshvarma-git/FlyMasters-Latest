import { FormEvent, useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { PhoneCall } from "lucide-react";
import { useAuth } from "@telecaller/context/AuthContext";
import { Button } from "@telecaller/components/ui/Button";
import { Card } from "@telecaller/components/ui/Card";
import { Input, Label } from "@telecaller/components/ui/Field";

export default function SignIn() {
  const navigate = useNavigate();
  const { user, loading, signIn } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!loading && user) navigate("/queue", { replace: true });
  }, [user, loading, navigate]);

  const submit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      await signIn(email.trim(), password);
      navigate("/queue", { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not sign in.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-navy-950 px-4">
      <div className="w-full max-w-sm">
        <div className="mb-6 text-center">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-sky-500 text-white">
            <PhoneCall className="h-6 w-6" />
          </div>
          <h1 className="mt-4 text-2xl font-bold text-white">Telecaller sign in</h1>
          <p className="mt-1 text-sm text-slate-400">Fly Masters</p>
        </div>
        <Card className="p-6">
          <form onSubmit={(e) => void submit(e)}>
            <div className="mb-3">
              <Label>Email</Label>
              <Input
                type="email"
                required
                autoComplete="username"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>
            <div className="mb-4">
              <Label>Password</Label>
              <Input
                type="password"
                required
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>
            {error && (
              <p className="mb-3 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
                {error}
              </p>
            )}
            <Button type="submit" className="w-full" disabled={busy}>
              {busy ? "Signing in..." : "Sign in"}
            </Button>
          </form>
          <p className="mt-4 text-center text-xs text-slate-500">
            New telecaller?{" "}
            <Link to="/signup" className="font-medium text-sky-600">
              Create an account
            </Link>
          </p>
        </Card>
      </div>
    </div>
  );
}
