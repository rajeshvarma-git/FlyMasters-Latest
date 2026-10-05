import { useCallback, useEffect, useRef, useState } from 'react';
import { BadgeCheck, Loader2, MessageCircle } from 'lucide-react';
import { Button } from '@student/components/ui/button';
import { Input } from '@student/components/ui/input';
import {
  getWhatsAppVerificationStatus,
  isValidIndiaMobile,
  normalizeIndiaPhoneInput,
  sendWhatsAppOtp,
  verifyWhatsAppOtp,
  WhatsAppApiError,
} from '@student/lib/whatsappApi';

type Step = 'idle' | 'sending' | 'otp' | 'phone' | 'verified';

/**
 * "Verify your WhatsApp number" popup.
 *
 * It opens by itself as soon as the student has given a mobile number in the chat and that number
 * isn't verified yet. It sends the code once, then waits for the student to type or paste it —
 * it verifies automatically at 6 digits and closes. `checkKey` changes whenever the chat gets new
 * messages, which is how it notices that the number has just been given.
 * Once verified, the server merges any WhatsApp chat from that number into this student's one
 * chat and `onVerified` reloads it.
 */
export function WhatsAppVerifyBanner({ onVerified, checkKey }: { onVerified?: () => void; checkKey?: number }) {
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<Step>('idle');
  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  const [message, setMessage] = useState('');
  const [wait, setWait] = useState(0);
  const verifiedRef = useRef(false);
  const autoSentFor = useRef('');
  const busyRef = useRef(false);

  const startWait = (seconds: number) => setWait(Math.max(0, Math.ceil(seconds)));
  useEffect(() => {
    if (wait <= 0) return;
    const timer = window.setTimeout(() => setWait((value) => value - 1), 1000);
    return () => window.clearTimeout(timer);
  }, [wait]);

  const sendCode = useCallback(async (number: string) => {
    if (busyRef.current) return;
    if (!isValidIndiaMobile(number)) {
      setStep('phone');
      setMessage('Enter a valid 10-digit Indian mobile number.');
      return;
    }
    busyRef.current = true;
    setStep('sending');
    setMessage('');
    try {
      await sendWhatsAppOtp(number);
      setStep('otp');
      setMessage('Code sent to your WhatsApp.');
      startWait(60);
    } catch (error) {
      if (error instanceof WhatsAppApiError && error.codePending) {
        setStep('otp');
        setMessage(error.message);
        startWait(error.retryAfterSeconds || 30);
      } else {
        setStep('phone');
        setMessage(error instanceof Error ? error.message : 'Could not send the code.');
      }
    } finally {
      busyRef.current = false;
    }
  }, []);

  // Look at the verification status whenever the chat changes; open the popup when a number exists
  // but isn't verified, and send the code once for that number.
  useEffect(() => {
    if (verifiedRef.current || open) return;
    let cancelled = false;
    getWhatsAppVerificationStatus()
      .then((result) => {
        if (cancelled || verifiedRef.current) return;
        if (result.verified) {
          verifiedRef.current = true;
          return;
        }
        const number = result.phone_number ? normalizeIndiaPhoneInput(result.phone_number) : '';
        if (!number) return; // number not given yet — the chat will ask for it
        setPhone(number);
        setOpen(true);
        if (autoSentFor.current !== number) {
          autoSentFor.current = number;
          void sendCode(number);
        } else {
          setStep('otp');
        }
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [checkKey, open, sendCode]);

  const verify = useCallback(
    async (value: string) => {
      if (busyRef.current) return;
      busyRef.current = true;
      setMessage('');
      try {
        await verifyWhatsAppOtp(phone, value);
        verifiedRef.current = true;
        setStep('verified');
        window.setTimeout(() => {
          setOpen(false);
          onVerified?.();
        }, 900);
      } catch (error) {
        setCode('');
        setMessage(error instanceof Error ? error.message : 'That code did not work. Try again.');
      } finally {
        busyRef.current = false;
      }
    },
    [phone, onVerified],
  );

  const onCodeChange = (raw: string) => {
    const digits = raw.replace(/\D/g, '').slice(0, 6);
    setCode(digits);
    if (digits.length === 6) void verify(digits);
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[80] flex items-end justify-center bg-black/40 p-4 sm:items-center" role="dialog" aria-modal="true" aria-label="Verify your WhatsApp number">
      <div className="w-full max-w-sm rounded-2xl border bg-background p-5 shadow-xl">
        <div className="flex items-center gap-2 text-base font-semibold text-emerald-700">
          {step === 'verified' ? <BadgeCheck className="h-5 w-5" /> : <MessageCircle className="h-5 w-5" />}
          {step === 'verified' ? 'WhatsApp verified' : 'Verify your WhatsApp number'}
        </div>

        {step === 'verified' ? (
          <p className="mt-2 text-sm text-muted-foreground">Done. Your WhatsApp chat and this chat are now one.</p>
        ) : step === 'phone' ? (
          <>
            <p className="mt-2 text-sm text-muted-foreground">Enter the mobile number that has WhatsApp. We'll send a 6-digit code to it.</p>
            <div className="mt-3 flex items-center gap-2">
              <span className="rounded-md border bg-muted px-2 py-2 text-sm text-muted-foreground">+91</span>
              <Input
                autoFocus
                type="tel"
                inputMode="numeric"
                maxLength={10}
                value={phone}
                onChange={(event) => setPhone(normalizeIndiaPhoneInput(event.target.value))}
                placeholder="10-digit mobile number"
                onKeyDown={(event) => event.key === 'Enter' && (event.preventDefault(), void sendCode(phone))}
              />
            </div>
            <Button className="mt-3 w-full" onClick={() => void sendCode(phone)} disabled={!isValidIndiaMobile(phone)}>
              Send code
            </Button>
          </>
        ) : (
          <>
            <p className="mt-2 text-sm text-muted-foreground">
              {step === 'sending' ? 'Sending a code to ' : 'Type or paste the 6-digit code we sent to '}
              <span className="font-medium text-foreground">+91 {phone}</span> on WhatsApp.
            </p>
            <Input
              autoFocus
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              value={code}
              disabled={step === 'sending'}
              onChange={(event) => onCodeChange(event.target.value)}
              placeholder="••••••"
              className="mt-3 h-12 text-center text-2xl tracking-[0.5em]"
            />
            {step === 'sending' ? (
              <p className="mt-2 flex items-center gap-2 text-xs text-muted-foreground">
                <Loader2 className="h-3 w-3 animate-spin" /> Sending…
              </p>
            ) : null}
            <div className="mt-3 flex items-center justify-between text-xs">
              <button
                type="button"
                className="text-muted-foreground underline disabled:no-underline disabled:opacity-60"
                disabled={wait > 0 || step === 'sending'}
                onClick={() => void sendCode(phone)}
              >
                {wait > 0 ? `Resend code in ${wait}s` : 'Resend code'}
              </button>
              <button
                type="button"
                className="text-muted-foreground underline"
                onClick={() => {
                  setStep('phone');
                  setCode('');
                  setMessage('');
                }}
              >
                Change number
              </button>
            </div>
          </>
        )}

        {message && step !== 'verified' ? <p className="mt-3 text-xs text-muted-foreground">{message}</p> : null}

      </div>
    </div>
  );
}
