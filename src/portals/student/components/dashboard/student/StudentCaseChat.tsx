import { useCallback, useEffect, useRef, useState } from 'react';
import { Bot, Send, User, Headphones, GraduationCap } from 'lucide-react';
import { format } from 'date-fns';
import { toast } from 'sonner';
import { Card } from '@student/components/ui/card';
import { Button } from '@student/components/ui/button';
import { Input } from '@student/components/ui/input';
import { getMyCase, sendCaseMessage, type CaseMessage, type CaseOwner } from '@student/lib/caseChatApi';

/**
 * The student's one conversation with Fly Masters. The AI advisor answers
 * first; once a telecaller and then a counselor are assigned they reply in
 * this same thread with the whole history in front of them. The student
 * never picks who to message — the server routes it (server/routes/cases.mjs).
 */

const ROLE_LABEL: Record<string, string> = {
  ai: 'AI Advisor',
  telecaller: 'Telecaller',
  counselor: 'Counselor',
  admin: 'Fly Masters',
};

function time(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  try {
    return format(date, 'dd MMM, HH:mm');
  } catch {
    return '';
  }
}

function RoleIcon({ role }: { role: string }) {
  const cls = 'w-4 h-4';
  if (role === 'ai') return <Bot className={cls} />;
  if (role === 'telecaller') return <Headphones className={cls} />;
  if (role === 'counselor') return <GraduationCap className={cls} />;
  return <User className={cls} />;
}

function ownerLine(owner: CaseOwner | null) {
  if (!owner) return '';
  if (owner.role === 'ai') return 'AI Advisor is helping you now';
  return `${owner.name} (${ROLE_LABEL[owner.role]}) is helping you now`;
}

export function StudentCaseChat({ className = '' }: { className?: string }) {
  const [messages, setMessages] = useState<CaseMessage[]>([]);
  const [owner, setOwner] = useState<CaseOwner | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);
  const lastCount = useRef(0);

  const load = useCallback(async () => {
    const data = await getMyCase();
    setMessages(data.messages);
    setOwner(data.owner);
    setLoadError('');
  }, []);

  useEffect(() => {
    load()
      .catch((error) => setLoadError(error instanceof Error ? error.message : 'Could not load your chat.'))
      .finally(() => setLoading(false));
    const poll = window.setInterval(() => {
      if (document.visibilityState !== 'visible') return;
      load().catch(() => {});
    }, 5000);
    return () => window.clearInterval(poll);
  }, [load]);

  useEffect(() => {
    if (messages.length !== lastCount.current) {
      lastCount.current = messages.length;
      endRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages]);

  const send = async () => {
    const body = text.trim();
    if (!body || sending) return;
    setText('');
    setSending(true);
    const temp: CaseMessage = {
      id: `temp-${Date.now()}`,
      sender_role: 'student',
      sender_id: null,
      sender_name: null,
      body,
      channel: 'app',
      created_at: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, temp]);
    try {
      const result = await sendCaseMessage(body);
      setOwner(result.owner);
      setMessages((prev) => [...prev.filter((m) => m.id !== temp.id), ...result.messages]);
    } catch (error) {
      setMessages((prev) => prev.filter((m) => m.id !== temp.id));
      setText(body);
      toast.error(error instanceof Error ? error.message : 'Message not sent');
    } finally {
      setSending(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[300px]">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  }

  if (loadError) {
    return (
      <Card className="p-6 text-center text-muted-foreground">
        {loadError === 'Students only' ? 'This chat is for student accounts.' : loadError}
      </Card>
    );
  }

  return (
    <Card className={`flex flex-col h-[70vh] min-h-[480px] overflow-hidden ${className}`}>
      <div className="flex items-center gap-3 border-b px-4 py-3">
        <div className="w-9 h-9 rounded-full bg-primary/10 text-primary flex items-center justify-center">
          <RoleIcon role={owner?.role || 'ai'} />
        </div>
        <div className="min-w-0">
          <p className="text-sm font-semibold">Fly Masters</p>
          <p className="text-xs text-muted-foreground truncate">{ownerLine(owner)}</p>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-muted/20">
        {messages.map((m) => {
          const mine = m.sender_role === 'student';
          const label = mine
            ? 'You'
            : m.sender_role === 'ai'
              ? 'AI Advisor'
              : `${m.sender_name || ROLE_LABEL[m.sender_role] || 'Fly Masters'} · ${ROLE_LABEL[m.sender_role] || ''}`;
          return (
            <div key={m.id} className={`flex ${mine ? 'justify-end' : 'justify-start'}`}>
              <div
                className={`max-w-[80%] rounded-2xl px-4 py-2 shadow-sm ${
                  mine
                    ? 'bg-primary text-primary-foreground rounded-br-sm'
                    : m.sender_role === 'ai'
                      ? 'bg-background border rounded-bl-sm'
                      : 'bg-amber-50 border border-amber-100 text-foreground rounded-bl-sm'
                }`}
              >
                <p className={`text-[11px] font-medium mb-0.5 flex items-center gap-1 ${mine ? 'opacity-80' : 'text-muted-foreground'}`}>
                  {!mine && <RoleIcon role={m.sender_role} />}
                  {label}
                </p>
                <p className="text-sm whitespace-pre-wrap break-words">{m.body}</p>
                <p className={`text-[10px] mt-1 ${mine ? 'opacity-70' : 'text-muted-foreground'}`}>
                  {time(m.created_at)}
                  {m.channel === 'whatsapp' ? ' · via WhatsApp' : ''}
                </p>
              </div>
            </div>
          );
        })}
        {sending && owner?.role === 'ai' && (
          <p className="text-xs text-muted-foreground flex items-center gap-1">
            <Bot className="w-3 h-3" /> AI Advisor is typing…
          </p>
        )}
        <div ref={endRef} />
      </div>

      <form
        className="flex gap-2 border-t p-3"
        onSubmit={(e) => {
          e.preventDefault();
          send();
        }}
      >
        <Input
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Type your message…"
          maxLength={2000}
          disabled={sending}
        />
        <Button type="submit" disabled={sending || !text.trim()}>
          <Send className="w-4 h-4" />
        </Button>
      </form>
    </Card>
  );
}
