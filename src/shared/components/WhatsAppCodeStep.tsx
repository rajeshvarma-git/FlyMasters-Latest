import { useEffect, useRef, useState } from "react";

/**
 * The second step of sign-in: "enter the 6-digit code we sent to your WhatsApp".
 * Shared by every login page (staff, admin, counselor, student). It only collects the code; the page decides
 * how to check it and what happens next.
 */
export type WhatsAppChallenge = { challengeId: string; masked: string };

type Props = {
  masked: string;
  /** Throw (or reject) with a message to show under the box. */
  onVerify: (code: string) => Promise<void>;
  /** Ask for a fresh code. Throw with a message if it cannot be sent. */
  onResend: () => Promise<void>;
  onBack: () => void;
};

export default function WhatsAppCodeStep({ masked, onVerify, onResend, onBack }: Props) {
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [wait, setWait] = useState(30);
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => { input.current?.focus(); }, []);
  useEffect(() => {
    if (wait <= 0) return;
    const t = setTimeout(() => setWait((w) => w - 1), 1000);
    return () => clearTimeout(t);
  }, [wait]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (code.length !== 6) { setError("Enter the 6-digit code."); return; }
    setBusy(true); setError("");
    try { await onVerify(code); }
    catch (err: any) { setError(err?.message || "That code did not work."); setCode(""); input.current?.focus(); }
    finally { setBusy(false); }
  }

  async function resend() {
    setError(""); setBusy(true);
    try { await onResend(); setWait(30); setCode(""); }
    catch (err: any) { setError(err?.message || "Could not send a new code."); }
    finally { setBusy(false); }
  }

  return (
    <form onSubmit={submit} className="space-y-4" noValidate>
      <div>
        <p className="text-sm font-semibold text-slate-900">Check your WhatsApp</p>
        <p className="mt-1 text-sm text-slate-600">We sent a 6-digit code to <span className="font-medium">{masked}</span>.</p>
      </div>
      <input
        ref={input}
        value={code}
        onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
        inputMode="numeric"
        autoComplete="one-time-code"
        maxLength={6}
        aria-label="6-digit WhatsApp code"
        placeholder="______"
        className="w-full rounded-lg border border-slate-300 px-3 py-3 text-center text-2xl tracking-[0.5em] text-slate-900 outline-none focus:border-sky-500"
      />
      {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
      <button type="submit" disabled={busy || code.length !== 6} className="w-full rounded-lg bg-sky-600 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50">
        {busy ? "Checking…" : "Verify and sign in"}
      </button>
      <div className="flex items-center justify-between text-sm">
        <button type="button" onClick={onBack} className="text-slate-500 underline">Back</button>
        <button type="button" onClick={resend} disabled={busy || wait > 0} className="text-sky-700 underline disabled:text-slate-400 disabled:no-underline">
          {wait > 0 ? `Send again in ${wait}s` : "Send again"}
        </button>
      </div>
    </form>
  );
}
