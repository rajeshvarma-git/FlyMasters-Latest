import { FormEvent, useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { PhoneCall } from "lucide-react";
import { useAuth } from "@telecaller/context/AuthContext";
import { Button } from "@telecaller/components/ui/Button";
import { Card } from "@telecaller/components/ui/Card";
import { Input, Label } from "@telecaller/components/ui/Field";

export default function SignUp() {
  const navigate = useNavigate();
  const { user, loading, signUp } = useAuth();
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
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
      await signUp({
        email: email.trim(),
        password,
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        phone: phone.trim(),
        code: code.trim(),
      });
      navigate("/queue", { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create account.");
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
          <h1 className="mt-4 text-2xl font-bold text-white">Create telecaller account</h1>
          <p className="mt-1 text-sm text-slate-400">Fly Masters</p>
        </div>
        <Card className="p-6">
          <form onSubmit={(e) => void submit(e)}>
            <div className="mb-3 grid grid-cols-2 gap-3">
              <div>
                <Label>First name</Label>
                <Input
                  required
                  autoComplete="given-name"
                  value={firstName}
                  onChange={(e) => setFirstName(e.target.value)}
                />
              </div>
              <div>
                <Label>Last name</Label>
                <Input
                  required
                  autoComplete="family-name"
                  value={lastName}
                  onChange={(e) => setLastName(e.target.value)}
                />
              </div>
            </div>
            <div className="mb-3">
              <Label>Phone</Label>
              <Input
                type="tel"
                autoComplete="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
              />
            </div>
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
            <div className="mb-3">
              <Label>Password</Label>
              <Input
                type="password"
                required
                minLength={6}
                autoComplete="new-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>
            <div className="mb-4">
              <Label>Signup code</Label>
              <Input
                required
                autoComplete="off"
                value={code}
                onChange={(e) => setCode(e.target.value)}
                placeholder="From your admin"
              />
            </div>
            {error && (
              <p className="mb-3 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
                {error}
              </p>
            )}
            <Button type="submit" className="w-full" disabled={busy}>
              {busy ? "Creating account..." : "Create account"}
            </Button>
          </form>
          <p className="mt-4 text-center text-xs text-slate-500">
            Already have an account?{" "}
            <Link to="/" className="font-medium text-sky-600">
              Sign in
            </Link>
          </p>
        </Card>
      </div>
    </div>
  );
}
