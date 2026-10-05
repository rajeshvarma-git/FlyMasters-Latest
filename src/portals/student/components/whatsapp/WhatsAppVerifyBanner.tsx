import { useEffect, useState } from 'react';
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

/**
 * Small box above the student's chat: "verify your WhatsApp number". Sending the code and
 * entering it is all it does. Once the number is verified the server merges any WhatsApp
 * chat from that number into this student's one chat, and `onVerified` reloads it.
 * Renders nothing when already verified (or while checking).
 */
export function WhatsAppVerifyBanner({ onVerified }: { onVerified?: () => void }) {
  const [step, setStep] = useState<'checking' | 'phone' | 'otp' | 'done'>('checking');
  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');

  useEffect(() => {
    let cancelled = false;
    getWhatsAppVerificationStatus()
      .then((result) => {
        if (cancelled) return;
        if (result.verified) return setStep('done');
        if (result.phone_number) setPhone(normalizeIndiaPhoneInput(result.phone_number));
        setStep('phone');
      })
      .catch(() => !cancelled && setStep('done'));
    return () => {
      cancelled = true;
    };
  }, []);

  if (step === 'checking' || step === 'done') return null;

  const sendCode = async () => {
    if (!isValidIndiaMobile(phone)) return setMessage('Enter a valid 10-digit Indian mobile number.');
    setBusy(true);
    setMessage('');
    try {
      await sendWhatsAppOtp(phone);
      setStep('otp');
      setMessage('Code sent. Check your WhatsApp.');
    } catch (error) {
      if (error instanceof WhatsAppApiError && error.codePending) {
        setStep('otp');
        setMessage(error.message);
      } else {
        setMessage(error instanceof Error ? error.message : 'Could not send the code.');
      }
    } finally {
      setBusy(false);
    }
  };

  const verify = async () => {
    if (!/^\d{4,8}$/.test(code.trim())) return setMessage('Enter the 6-digit code.');
    setBusy(true);
    setMessage('');
    try {
      await verifyWhatsAppOtp(phone, code.trim());
      setStep('done');
      onVerified?.();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Could not verify that code.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="border-b bg-emerald-50/70 px-4 py-3 text-sm">
      <div className="flex items-center gap-2 font-medium text-emerald-800">
        <MessageCircle className="h-4 w-4" />
        Verify your WhatsApp number
        <BadgeCheck className="h-4 w-4 opacity-40" />
      </div>
      <p className="mt-1 text-xs text-muted-foreground">
        We send a 6-digit code to your WhatsApp. Once verified, your WhatsApp chat and this chat become one.
      </p>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        {step === 'phone' ? (
          <>
            <span className="rounded-md border bg-background px-2 py-2 text-xs text-muted-foreground">+91</span>
            <Input
              type="tel"
              inputMode="numeric"
              maxLength={10}
              value={phone}
              onChange={(event) => setPhone(normalizeIndiaPhoneInput(event.target.value))}
              placeholder="10-digit mobile number"
              className="h-9 w-48"
              onKeyDown={(event) => event.key === 'Enter' && (event.preventDefault(), void sendCode())}
            />
            <Button size="sm" onClick={() => void sendCode()} disabled={busy || !isValidIndiaMobile(phone)}>
              {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Send code
            </Button>
          </>
        ) : (
          <>
            <Input
              inputMode="numeric"
              maxLength={8}
              value={code}
              onChange={(event) => setCode(event.target.value.replace(/\D/g, ''))}
              placeholder="6-digit code"
              className="h-9 w-40"
              onKeyDown={(event) => event.key === 'Enter' && (event.preventDefault(), void verify())}
            />
            <Button size="sm" onClick={() => void verify()} disabled={busy || code.length < 4}>
              {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Verify
            </Button>
            <Button size="sm" variant="ghost" onClick={() => { setStep('phone'); setCode(''); setMessage(''); }} disabled={busy}>
              Change number
            </Button>
          </>
        )}
      </div>
      {message ? <p className="mt-2 text-xs text-muted-foreground">{message}</p> : null}
    </div>
  );
}
