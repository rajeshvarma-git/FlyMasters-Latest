import { useCallback, useEffect, useRef, useState } from 'react';
import { Bot, GraduationCap, Headphones, User, BookOpen, PencilLine, CheckCircle2 } from 'lucide-react';
import { toast } from 'sonner';
import { Card, CardContent } from '@student/components/ui/card';
import EnhancedTypingIndicator from '@student/components/chat/EnhancedTypingIndicator';
import UniversityResults from '@student/components/chat/UniversityResults';
import ExpertHelpSection from '@student/components/chat/ExpertHelpSection';
import ChatInput from '@student/components/chat/ChatInput';
import type { UniversityRecommendation } from '@student/lib/universityRecommendations';
import { getMyCase, sendCaseMessage, type CaseMessage, type CaseOwner } from '@student/lib/caseChatApi';

/**
 * The student's one conversation with Fly Masters, in the original AI chat's
 * look. The AI starts with what the profile already says and asks only
 * what's missing, then shows university recommendations. When a telecaller
 * and later a counselor are assigned, a notice appears and they reply in
 * this same chat. Questions later on are answered by the AI only from Fly
 * Masters' FAQs/policies (checked by staff); anything else goes to the
 * assigned person. Server side: server/routes/cases.mjs.
 */

const ROLE_LABEL: Record<string, string> = {
  telecaller: 'Telecaller',
  counselor: 'Counselor',
  admin: 'Fly Masters',
};

function time(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function Avatar({ role }: { role: string }) {
  if (role === 'student') {
    return (
      <div className="flex-shrink-0 w-10 h-10 rounded-full bg-accent-cyan flex items-center justify-center ml-3 shadow-card">
        <User className="w-5 h-5 text-white" />
      </div>
    );
  }
  const Icon = role === 'telecaller' ? Headphones : role === 'counselor' ? GraduationCap : Bot;
  const bg = role === 'ai' ? 'bg-gradient-primary' : 'bg-emerald-600';
  return (
    <div className={`flex-shrink-0 w-10 h-10 rounded-full ${bg} flex items-center justify-center mr-3 shadow-card`}>
      <Icon className="w-5 h-5 text-white" />
    </div>
  );
}

function Bubble({ m }: { m: CaseMessage }) {
  const isUser = m.sender_role === 'student';
  const isStaff = m.sender_role === 'telecaller' || m.sender_role === 'counselor' || m.sender_role === 'admin';
  return (
    <div className={`flex ${isUser ? 'justify-end' : 'justify-start'} mb-4 animate-scale-in`}>
      {!isUser && <Avatar role={m.sender_role} />}
      <div
        className={`max-w-[85%] sm:max-w-[75%] p-4 rounded-2xl break-words shadow-card ${
          isUser
            ? 'bg-gradient-primary text-white rounded-br-md'
            : isStaff
              ? 'bg-emerald-50 border border-emerald-100 text-foreground rounded-bl-md'
              : 'bg-card backdrop-blur-sm border border-border/50 text-foreground rounded-bl-md'
        }`}
      >
        {isStaff && (
          <p className="text-xs font-semibold text-emerald-700 mb-1">
            {m.sender_name || 'Fly Masters'} · {ROLE_LABEL[m.sender_role]}
          </p>
        )}
        <p className="text-sm leading-relaxed whitespace-pre-wrap">{m.body}</p>
        {m.source === 'faq' && (
          <p className="text-[11px] mt-2 text-muted-foreground flex items-center gap-1">
            {m.review_status === 'corrected' ? (
              <><PencilLine className="w-3 h-3" /> Corrected by {m.reviewed_by_name || 'your advisor'}</>
            ) : m.review_status === 'approved' ? (
              <><CheckCircle2 className="w-3 h-3" /> Checked by {m.reviewed_by_name || 'your advisor'}</>
            ) : (
              <><BookOpen className="w-3 h-3" /> From Fly Masters FAQs</>
            )}
          </p>
        )}
        <span className={`text-xs mt-2 block ${isUser ? 'opacity-80' : 'opacity-60'}`}>
          {time(m.created_at)}
          {m.channel === 'whatsapp' ? ' · via WhatsApp' : ''}
        </span>
      </div>
      {isUser && <Avatar role="student" />}
    </div>
  );
}

interface StudentCaseChatProps {
  /** Fills its parent (the floating chat panel) with smaller spacing. */
  compact?: boolean;
  /** Called when a link in compact mode asks to open the full Messages page. */
  onOpenFull?: () => void;
  /** Lets the floating panel show who is helping in its own header. */
  onOwnerChange?: (owner: CaseOwner | null) => void;
}

export function StudentCaseChat({ compact = false, onOpenFull, onOwnerChange }: StudentCaseChatProps = {}) {
  const [messages, setMessages] = useState<CaseMessage[]>([]);
  const [owner, setOwner] = useState<CaseOwner | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
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
    onOwnerChange?.(owner);
  }, [owner, onOwnerChange]);

  useEffect(() => {
    if (messages.length !== lastCount.current) {
      lastCount.current = messages.length;
      endRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, sending]);

  const send = async (body: string) => {
    if (!body.trim() || sending) return;
    setSending(true);
    const temp: CaseMessage = {
      id: `temp-${Date.now()}`,
      kind: 'text',
      sender_role: 'student',
      sender_id: null,
      sender_name: null,
      body,
      data: null,
      channel: 'app',
      source: null,
      sources: [],
      review_status: null,
      reviewed_by_name: null,
      created_at: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, temp]);
    try {
      const result = await sendCaseMessage(body);
      setOwner(result.owner);
      setMessages((prev) => [...prev.filter((m) => m.id !== temp.id), ...result.messages]);
    } catch (error) {
      setMessages((prev) => prev.filter((m) => m.id !== temp.id));
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
      <Card className="p-6 text-center text-muted-foreground max-w-4xl mx-auto">
        {loadError === 'Students only' ? 'This chat is for student accounts.' : loadError}
      </Card>
    );
  }

  const lastRecIndex = messages.map((m) => m.kind).lastIndexOf('recommendations');

  const body = (
    <>
          {!compact && owner && owner.role !== 'ai' && (
            <div className="flex items-center gap-2 border-b px-4 py-2 text-xs text-muted-foreground">
              {owner.role === 'telecaller' ? <Headphones className="w-4 h-4" /> : <GraduationCap className="w-4 h-4" />}
              Your {ROLE_LABEL[owner.role].toLowerCase()}: <span className="font-medium text-foreground">{owner.name}</span>
            </div>
          )}
          <div
            className={`flex-1 overflow-y-auto space-y-1 bg-gradient-to-b from-background/50 to-background ${compact ? 'p-3' : 'p-4 sm:p-6'}`}
            role="log"
            aria-label="Chat conversation"
            aria-live="polite"
          >
            {messages.map((m, index) => {
              if (m.kind === 'system') {
                return (
                  <div key={m.id} className="flex justify-center my-4">
                    <div className="max-w-[90%] rounded-full bg-primary/10 text-primary px-4 py-2 text-xs sm:text-sm text-center">
                      {m.body}
                    </div>
                  </div>
                );
              }
              if (m.kind === 'recommendations') {
                const unis = (m.data?.universities || []) as UniversityRecommendation[];
                if (compact) {
                  return (
                    <div key={m.id}>
                      <Bubble m={m} />
                      {unis.length > 0 && (
                        <div className="-mt-2 mb-4 ml-[52px] rounded-xl border border-border/60 bg-card p-3 text-sm">
                          <ul className="space-y-1">
                            {unis.map((u) => (
                              <li key={u.id} className="flex items-start gap-2">
                                <span className="mt-1.5 h-1.5 w-1.5 flex-none rounded-full bg-primary" />
                                <span><span className="font-medium">{u.name}</span> <span className="text-muted-foreground">· {u.location}</span></span>
                              </li>
                            ))}
                          </ul>
                          {onOpenFull && (
                            <button type="button" onClick={onOpenFull} className="mt-2 text-xs font-medium text-primary hover:underline">
                              See full details →
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  );
                }
                return (
                  <div key={m.id}>
                    <Bubble m={m} />
                    {unis.length > 0 && (
                      <div className="animate-scale-in mb-4">
                        <UniversityResults universities={unis} />
                      </div>
                    )}
                    {index === lastRecIndex && (
                      <div className="animate-slide-in-left mb-4">
                        <ExpertHelpSection />
                      </div>
                    )}
                  </div>
                );
              }
              return <Bubble key={m.id} m={m} />;
            })}
            {sending && <EnhancedTypingIndicator />}
            <div ref={endRef} />
          </div>

          <ChatInput onSendMessage={send} isLoading={sending} otpMode={false} phoneNumber="" />
    </>
  );

  if (compact) {
    return <div className="flex h-full min-h-0 flex-col">{body}</div>;
  }

  return (
    <div className="max-w-4xl mx-auto p-2 sm:p-4 h-[600px] sm:h-[700px] flex flex-col animate-scale-in" role="main">
      <Card className="flex-1 flex flex-col shadow-hover backdrop-blur-sm border-border/50 min-h-0">
        <CardContent className="flex-1 flex flex-col p-0 min-h-0">{body}</CardContent>
      </Card>
    </div>
  );
}
