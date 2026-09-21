import { useEffect, useState } from 'react';
import { BadgeCheck, Loader2, MessageCircle } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@student/components/ui/card';
import { Button } from '@student/components/ui/button';
import { Input } from '@student/components/ui/input';
import ChatInput from '@student/components/chat/ChatInput';
import {
  getWhatsAppVerificationStatus,
  isValidIndiaMobile,
  normalizeIndiaPhoneInput,
  sendWhatsAppOtp,
  verifyWhatsAppOtp,
  WhatsAppApiError,
} from '@student/lib/whatsappApi';

type GateStep = 'loading' | 'phone' | 'otp' | 'verified';

export function WhatsAppVerificationGate({ children }: { children: React.ReactNode }) {
  const [step, setStep] = useState<GateStep>('loading');
  const [phone, setPhone] = useState('');
  const [displayPhone, setDisplayPhone] = useState('');
  const [status, setStatus] = useState('');
  const [sending, setSending] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const result = await getWhatsAppVerificationStatus();
        if (cancelled) return;
        if (result.verified) {
          setDisplayPhone(result.phone_number || '');
          setStep('verified');
          return;
        }
        if (result.phone_number) {
          setPhone(normalizeIndiaPhoneInput(result.phone_number));
        }
        setStep('phone');
      } catch (error: any) {
        if (cancelled) return;
        setStatus(error.message || 'Could not check WhatsApp verification.');
        setStep('phone');
      }
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  const requestCode = async () => {
    if (!isValidIndiaMobile(phone)) {
      setStatus('Enter a valid 10-digit Indian mobile number.');
      return;
    }
    setSending(true);
    setStatus('');
    try {
      const result = await sendWhatsAppOtp(phone);
      setDisplayPhone(result.phone_number);
      setStep('otp');
    } catch (error: any) {
      if (error instanceof WhatsAppApiError && error.codePending) {
        setDisplayPhone(error.phoneNumber || `+91 ${phone}`);
        setStep('otp');
        setStatus(error.message);
        return;
      }
      setStatus(error.message || 'Could not send the WhatsApp code.');
    } finally {
      setSending(false);
    }
  };

  const submitCode = async (code: string) => {
    setSending(true);
    setStatus('');
    try {
      const result = await verifyWhatsAppOtp(phone, code);
      setDisplayPhone(result.phone_number);
      setStep('verified');
    } catch (error: any) {
      setStatus(error.message || 'Could not verify that code.');
    } finally {
      setSending(false);
    }
  };

  if (step === 'loading') {
    return (
      <Card className="glass-card">
        <CardContent className="py-16 text-center text-muted-foreground">
          <Loader2 className="w-8 h-8 mx-auto mb-3 animate-spin" />
          Checking WhatsApp verification...
        </CardContent>
      </Card>
    );
  }

  if (step === 'verified') {
    return (
      <div className="space-y-4">
        <div className="flex items-center gap-2 text-sm text-emerald-700 bg-emerald-50 border border-emerald-100 rounded-lg px-3 py-2">
          <BadgeCheck className="w-4 h-4" />
          WhatsApp verified{displayPhone ? ` · ${displayPhone}` : ''}
        </div>
        {children}
      </div>
    );
  }

  return (
    <Card className="glass-card max-w-xl">
      <CardHeader>
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-emerald-500/15 text-emerald-600 flex items-center justify-center">
            <MessageCircle className="w-5 h-5" />
          </div>
          <div>
            <CardTitle>{step === 'otp' ? 'Enter the WhatsApp code' : 'Verify your WhatsApp number'}</CardTitle>
            <CardDescription>
              {step === 'otp'
                ? `We sent a 6-digit code to ${displayPhone || 'your WhatsApp'}.`
                : 'Verify once to unlock counselor chat, telecaller chat, and WhatsApp support.'}
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {step === 'phone' ? (
          <>
            <div className="flex gap-2">
              <div className="flex items-center rounded-md border px-3 text-sm text-muted-foreground bg-muted/40">
                +91
              </div>
              <Input
                type="tel"
                inputMode="numeric"
                maxLength={10}
                value={phone}
                onChange={(event) => setPhone(normalizeIndiaPhoneInput(event.target.value))}
                placeholder="10-digit mobile number"
                onKeyDown={(event) => {
                  if (event.key === 'Enter') {
                    event.preventDefault();
                    void requestCode();
                  }
                }}
              />
            </div>
            <Button onClick={() => void requestCode()} disabled={sending || !isValidIndiaMobile(phone)}>
              {sending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
              Send WhatsApp code
            </Button>
          </>
        ) : (
          <div className="-mx-6 -mb-6">
            <ChatInput
              otpMode
              phoneNumber={displayPhone || `+91 ${phone}`}
              isLoading={sending}
              onSendMessage={submitCode}
            />
            <div className="px-6 pb-4">
              <Button variant="ghost" size="sm" onClick={() => setStep('phone')} disabled={sending}>
                Use a different number
              </Button>
            </div>
          </div>
        )}
        {status ? <p className="text-sm text-destructive">{status}</p> : null}
      </CardContent>
    </Card>
  );
}
