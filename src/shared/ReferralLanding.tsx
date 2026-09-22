import { useEffect, useState } from "react";

/**
 * /r/<CODE> — the shareable referral link.
 *
 * Doc 6.1: "An Agent shares their unique referral link... When the student
 * signs up through that link, the student profile is automatically linked to
 * that Agent's account."
 *
 * The code is remembered and the visitor continues to the normal student
 * sign-up. It is stored rather than sent straight through because a
 * study-abroad decision takes weeks, and the student rarely signs up in the
 * same session they first clicked.
 *
 * The partner's name is confirmed on screen first: a mistyped or misheard code
 * is cheap to fix here and expensive to argue about at commission time.
 */
const KEY = "fm_referral_code";

export function rememberReferral(code: string) {
  try { localStorage.setItem(KEY, code.toUpperCase()); } catch { /* private mode */ }
}

export function readReferral(): string {
  try { return localStorage.getItem(KEY) || ""; } catch { return ""; }
}

export function clearReferral() {
  try { localStorage.removeItem(KEY); } catch { /* private mode */ }
}

export default function ReferralLanding() {
  const code = decodeURIComponent(window.location.pathname.replace(/^\/r\//, "").split("/")[0] || "");
  const [state, setState] = useState<"checking" | "ok" | "bad">("checking");
  const [partner, setPartner] = useState<{ name: string; type: string } | null>(null);

  useEffect(() => {
    if (!code) { setState("bad"); return; }
    fetch(`/api/referral/${encodeURIComponent(code)}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error("unknown"))))
      .then((d) => { rememberReferral(code); setPartner(d.partner); setState("ok"); })
      .catch(() => setState("bad"));
  }, [code]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 px-4">
      <div className="w-full max-w-sm rounded-2xl bg-white p-6 text-center shadow-card">
        <h1 className="text-lg font-semibold text-navy-900">Fly Masters</h1>

        {state === "checking" ? <p className="mt-4 text-sm text-slate-500">Checking your link…</p> : null}

        {state === "ok" && partner ? (
          <>
            <p className="mt-4 text-sm text-slate-700">
              You were referred by <strong className="text-navy-900">{partner.name}</strong>.
            </p>
            <p className="mt-1 text-xs text-slate-500">
              We will keep this with your enquiry. Carry on and create your account.
            </p>
            <a href="/auth" className="mt-5 block rounded-xl bg-navy-900 px-4 py-2.5 text-sm font-semibold text-white">
              Continue
            </a>
            <a href="/" className="mt-3 block text-xs text-slate-500 hover:underline">
              Not you? Continue without a referral
            </a>
          </>
        ) : null}

        {state === "bad" ? (
          <>
            <p className="mt-4 text-sm text-slate-700">We could not recognise that referral link.</p>
            <p className="mt-1 text-xs text-slate-500">
              Check it with the person who sent it, or carry on without one.
            </p>
            <a href="/" className="mt-5 block rounded-xl bg-navy-900 px-4 py-2.5 text-sm font-semibold text-white">
              Continue to Fly Masters
            </a>
          </>
        ) : null}
      </div>
    </div>
  );
}
