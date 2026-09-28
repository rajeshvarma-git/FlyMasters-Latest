import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useAuth } from '@student/hooks/useAuth';
import { supabase } from '@student/integrations/supabase/client';
import {
  getWhatsAppVerificationStatus,
  getMyWhatsAppThread,
  sendWhatsAppAppMessage,
  sendWhatsAppOtp,
  verifyWhatsAppOtp,
} from '@student/lib/whatsappUnifiedApi';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@student/components/ui/card';
import { Button } from '@student/components/ui/button';
import { Input } from '@student/components/ui/input';
import { Avatar, AvatarFallback } from '@student/components/ui/avatar';
import { Badge } from '@student/components/ui/badge';
import { Separator } from '@student/components/ui/separator';
import {
  MessageCircle,
  Phone,
  Send,
  User,
  Clock,
  CheckCircle2,
  Circle,
  RefreshCw,
  Users,
  Bot,
  ChevronDown,
  ChevronUp,
  ShieldCheck,
} from 'lucide-react';
import { format } from 'date-fns';
import { toast } from 'sonner';
import ErrorBoundary from '@student/components/ErrorBoundary';
import ChatInterface from '@student/components/ChatInterface';

/**
 * One real conversation with the Fly Masters team — counselor, telecaller,
 * AI advisor, and WhatsApp — instead of four look-alike places to check.
 *
 * Under the hood there are still separate stores (private_conversations/
 * private_messages for the counselor, telecaller_conversations/
 * telecaller_messages for the telecaller, ai_chat_messages for the AI
 * advisor, whatsapp_conversations/whatsapp_messages for WhatsApp — see
 * server/routes/core.mjs, server/routes/counselor.mjs, useChat.tsx, and
 * server/lib/whatsappStore.mjs) — a real schema merge into one case
 * conversation is bigger work tracked separately. This component fetches
 * all four, tags every message with its source, and renders one
 * chronologically-sorted timeline instead.
 *
 * The AI advisor's history is read-only in this timeline (it's a durable
 * transcript — see useChat.tsx's ai_chat_messages persistence — not a
 * summary that forgets what was said). Continuing the AI's own guided
 * questions still uses its own input below, expandable inline on this same
 * page rather than hidden behind a separate top-level tab, because the AI
 * flow is a structured step-by-step wizard (country, budget, field of
 * interest -> university matches), not freeform chat — forcing it into the
 * same send box as the human channels would break that wizard's state
 * machine. Everything it has ever said still shows up in the merged
 * timeline below either way.
 *
 * WhatsApp is fully read/write here: once the student verifies their
 * WhatsApp number (OTP over the real Meta Cloud API — see
 * whatsappUnifiedApi.ts), messages sent from this box go out over
 * WhatsApp via the same store staff already see on their WhatsApp inbox
 * screens (src/portals/counselor/counselor/WhatsAppChat.tsx and the
 * telecaller equivalent), and WhatsApp replies from staff show up here.
 */
function safeTime(value: string | null | undefined): string {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  try {
    return format(date, 'HH:mm');
  } catch {
    return '';
  }
}

type Channel = 'counselor' | 'telecaller' | 'ai' | 'whatsapp';
type SendableChannel = 'counselor' | 'telecaller' | 'whatsapp';

interface UnifiedMessage {
  id: string;
  message: string;
  isMine: boolean;
  is_read?: boolean;
  created_at: string;
  channel: Channel;
}

interface StoredConversation {
  id: string;
  student_id: string;
  last_message_at: string | null;
}

const CHANNEL_META: Record<Channel, { label: string; icon: typeof MessageCircle; badge: string; bubbleStaff: string }> = {
  counselor: { label: 'Counselor', icon: MessageCircle, badge: 'bg-sky-100 text-sky-700', bubbleStaff: 'bg-sky-50 border border-sky-100' },
  telecaller: { label: 'Telecaller', icon: Phone, badge: 'bg-violet-100 text-violet-700', bubbleStaff: 'bg-violet-50 border border-violet-100' },
  ai: { label: 'AI Advisor', icon: Bot, badge: 'bg-amber-100 text-amber-700', bubbleStaff: 'bg-amber-50 border border-amber-100' },
  whatsapp: { label: 'WhatsApp', icon: Phone, badge: 'bg-emerald-100 text-emerald-700', bubbleStaff: 'bg-emerald-50 border border-emerald-100' },
};

interface StudentUnifiedChatProps {
  /** True when this renders inside the unified Messages tabs — skip the
   * page-level header there so it doesn't duplicate the "Messages" title. */
  embedded?: boolean;
}

export function StudentUnifiedChat({ embedded = false }: StudentUnifiedChatProps = {}) {
  return (
    <ErrorBoundary>
      <StudentUnifiedChatInner embedded={embedded} />
    </ErrorBoundary>
  );
}

function StudentUnifiedChatInner({ embedded }: { embedded: boolean }) {
  const { user } = useAuth();
  const [counselorId, setCounselorId] = useState<string | null>(null);
  const [telecallerId, setTelecallerId] = useState<string | null>(null);
  const [counselorConv, setCounselorConv] = useState<StoredConversation | null>(null);
  const [telecallerConv, setTelecallerConv] = useState<StoredConversation | null>(null);
  const [counselorName, setCounselorName] = useState('Your Counselor');
  const [telecallerName, setTelecallerName] = useState('Your Telecaller');
  const [aiMessages, setAiMessages] = useState<UnifiedMessage[]>([]);
  const [aiOpen, setAiOpen] = useState(false);
  const [aiEverOpened, setAiEverOpened] = useState(false);

  const [whatsappVerified, setWhatsappVerified] = useState<boolean | null>(null);
  const [whatsappConvId, setWhatsappConvId] = useState<string | null>(null);
  const [whatsappMessages, setWhatsappMessages] = useState<UnifiedMessage[]>([]);
  const [waPhoneInput, setWaPhoneInput] = useState('');
  const [waOtpSent, setWaOtpSent] = useState(false);
  const [waCodeInput, setWaCodeInput] = useState('');
  const [waBusy, setWaBusy] = useState(false);
  const [waError, setWaError] = useState('');

  const [humanMessages, setHumanMessages] = useState<UnifiedMessage[]>([]);
  const [activeChannel, setActiveChannel] = useState<SendableChannel>('counselor');
  const [newMessage, setNewMessage] = useState('');
  const [loading, setLoading] = useState(true);
  const [connecting, setConnecting] = useState(false);
  const [sending, setSending] = useState(false);
  const [statusMessage, setStatusMessage] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (user) openChat();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  // One source of truth per channel (humanMessages, aiMessages, whatsappMessages),
  // merged here for display instead of a fourth piece of state — avoids two
  // different fetchers racing to write the same "messages" array.
  const messages = useMemo(() => {
    const merged = [...humanMessages, ...aiMessages, ...whatsappMessages];
    merged.sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
    return merged;
  }, [humanMessages, aiMessages, whatsappMessages]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, loading]);

  useEffect(() => {
    if (!counselorConv?.id && !telecallerConv?.id && !whatsappVerified) return;
    const poll = window.setInterval(() => {
      refreshAll().catch((error) => {
        console.error('Team chat poll failed:', error);
      });
    }, 3000);
    return () => window.clearInterval(poll);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [counselorConv?.id, telecallerConv?.id, whatsappVerified]);

  const findAssignedId = async (column: 'assigned_counselor_id' | 'assigned_telecaller_id'): Promise<string | null> => {
    if (!user) return null;

    const { data: leadByUser } = await supabase
      .from('student_leads')
      .select(column)
      .eq('user_id', user.id)
      .not(column, 'is', null)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    const fromUser = (leadByUser as Record<string, string> | null)?.[column];
    if (fromUser) return fromUser;

    if (user.email) {
      const { data: leadByEmail } = await supabase
        .from('student_leads')
        .select(column)
        .eq('email', user.email)
        .not(column, 'is', null)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      const fromEmail = (leadByEmail as Record<string, string> | null)?.[column];
      if (fromEmail) return fromEmail;
    }

    return null;
  };

  const loadName = async (staffId: string, set: (name: string) => void, fallback: string) => {
    const { data: profile } = await supabase
      .from('profiles')
      .select('first_name, last_name')
      .eq('user_id', staffId)
      .maybeSingle();

    const name = [profile?.first_name, profile?.last_name].filter(Boolean).join(' ');
    set(name || fallback);
  };

  const ensureConversation = async (
    table: 'private_conversations' | 'telecaller_conversations',
    ownerColumn: 'counselor_id' | 'telecaller_id',
    ownerId: string,
  ): Promise<StoredConversation | null> => {
    if (!user) return null;

    const { data: existing } = await supabase
      .from(table)
      .select('*')
      .eq('student_id', user.id)
      .eq(ownerColumn, ownerId)
      .maybeSingle();

    if (existing) return existing as StoredConversation;

    const { data: created, error } = await supabase
      .from(table)
      .insert({ student_id: user.id, [ownerColumn]: ownerId })
      .select('*')
      .single();

    if (error) {
      const { data: retry } = await supabase
        .from(table)
        .select('*')
        .eq('student_id', user.id)
        .eq(ownerColumn, ownerId)
        .maybeSingle();
      if (retry) return retry as StoredConversation;
      throw error;
    }

    return created as StoredConversation;
  };

  const fetchHumanMessages = useCallback(async (counselor: StoredConversation | null, telecaller: StoredConversation | null) => {
    const [counselorRows, telecallerRows] = await Promise.all([
      counselor
        ? supabase.from('private_messages').select('*').eq('conversation_id', counselor.id).order('created_at', { ascending: true })
        : Promise.resolve({ data: [], error: null }),
      telecaller
        ? supabase.from('telecaller_messages').select('*').eq('conversation_id', telecaller.id).order('created_at', { ascending: true })
        : Promise.resolve({ data: [], error: null }),
    ]);

    if (counselorRows.error) throw counselorRows.error;
    if (telecallerRows.error) throw telecallerRows.error;

    const tagged: UnifiedMessage[] = [
      ...(counselorRows.data || []).map((row: { id: string; message: string; sender_id: string; is_read: boolean; created_at: string }) => ({
        id: row.id,
        message: row.message,
        isMine: row.sender_id === user?.id,
        is_read: row.is_read,
        created_at: row.created_at,
        channel: 'counselor' as const,
      })),
      ...(telecallerRows.data || []).map((row: { id: string; message: string; sender_id: string; is_read: boolean; created_at: string }) => ({
        id: row.id,
        message: row.message,
        isMine: row.sender_id === user?.id,
        is_read: row.is_read,
        created_at: row.created_at,
        channel: 'telecaller' as const,
      })),
    ];
    setHumanMessages(tagged);
    return tagged;
  }, [user?.id]);

  const fetchAiMessages = useCallback(async () => {
    if (!user) return;
    const { data, error } = await supabase
      .from('ai_chat_messages')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: true });
    if (error) return;
    const tagged: UnifiedMessage[] = (data || []).map((row: { id: string; content: string; role: string; created_at: string }) => ({
      id: row.id,
      message: row.content,
      isMine: row.role === 'user',
      created_at: row.created_at,
      channel: 'ai' as const,
    }));
    setAiMessages(tagged);
  }, [user]);

  const fetchWhatsApp = useCallback(async () => {
    try {
      const thread = await getMyWhatsAppThread();
      setWhatsappVerified(thread.verified);
      if (!thread.verified || !thread.conversation) {
        setWhatsappConvId(null);
        setWhatsappMessages([]);
        return;
      }
      setWhatsappConvId(thread.conversation.id);
      const tagged: UnifiedMessage[] = (thread.messages || [])
        .filter((row) => row.channel !== 'system')
        .map((row) => ({
          id: row.id,
          message: row.body,
          isMine: row.direction === 'inbound',
          is_read: row.is_read,
          created_at: row.created_at,
          channel: 'whatsapp' as const,
        }));
      setWhatsappMessages(tagged);
    } catch (error) {
      console.warn('WhatsApp thread load skipped:', error);
    }
  }, []);

  const refreshAll = useCallback(async () => {
    await Promise.all([
      fetchHumanMessages(counselorConv, telecallerConv),
      fetchAiMessages(),
      fetchWhatsApp(),
    ]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [counselorConv, telecallerConv, fetchHumanMessages, fetchAiMessages, fetchWhatsApp]);

  const openChat = async () => {
    if (!user) return;

    try {
      setLoading(true);
      setStatusMessage('');

      const [foundCounselorId, foundTelecallerId] = await Promise.all([
        findAssignedId('assigned_counselor_id'),
        findAssignedId('assigned_telecaller_id'),
      ]);
      setCounselorId(foundCounselorId);
      setTelecallerId(foundTelecallerId);

      const [counselorChat, telecallerChat] = await Promise.all([
        foundCounselorId ? ensureConversation('private_conversations', 'counselor_id', foundCounselorId) : Promise.resolve(null),
        foundTelecallerId ? ensureConversation('telecaller_conversations', 'telecaller_id', foundTelecallerId) : Promise.resolve(null),
      ]);
      setCounselorConv(counselorChat);
      setTelecallerConv(telecallerChat);

      await Promise.all([
        foundCounselorId ? loadName(foundCounselorId, setCounselorName, 'Fly Masters Counselor') : Promise.resolve(),
        foundTelecallerId ? loadName(foundTelecallerId, setTelecallerName, 'Fly Masters Telecaller') : Promise.resolve(),
      ]);

      const [taggedHuman] = await Promise.all([
        fetchHumanMessages(counselorChat, telecallerChat),
        fetchAiMessages(),
        fetchWhatsApp(),
      ]);

      // Default the reply target to whoever (human) spoke to the student most
      // recently; WhatsApp and AI are never the default send target.
      const lastIncoming = [...taggedHuman].reverse().find((row) => !row.isMine);
      if (lastIncoming) {
        setActiveChannel(lastIncoming.channel as SendableChannel);
      } else if (counselorChat) {
        setActiveChannel('counselor');
      } else if (telecallerChat) {
        setActiveChannel('telecaller');
      }

      if (!counselorChat && !telecallerChat) {
        setStatusMessage('No one has been assigned to you yet.');
      }
    } catch (error) {
      console.error('Error opening team chat:', error);
      setCounselorConv(null);
      setTelecallerConv(null);
      setStatusMessage('Could not connect to your team. Please try again.');
      toast.error('Failed to load chat');
    } finally {
      setLoading(false);
      setConnecting(false);
    }
  };

  const connectNow = async () => {
    setConnecting(true);
    await openChat();
  };

  const sendableChannels: SendableChannel[] = [
    ...(counselorConv ? (['counselor'] as const) : []),
    ...(telecallerConv ? (['telecaller'] as const) : []),
    ...(whatsappVerified && whatsappConvId ? (['whatsapp'] as const) : []),
  ];

  const targetChannel: SendableChannel | null = sendableChannels.includes(activeChannel)
    ? activeChannel
    : sendableChannels[0] || null;

  const sendMessage = async () => {
    if (!targetChannel || !newMessage.trim() || sending || !user) return;

    const text = newMessage.trim();

    if (targetChannel === 'whatsapp') {
      const optimistic: UnifiedMessage = {
        id: crypto.randomUUID(),
        message: text,
        isMine: true,
        created_at: new Date().toISOString(),
        channel: 'whatsapp',
      };
      try {
        setSending(true);
        setWhatsappMessages((prev) => [...prev, optimistic]);
        setNewMessage('');
        await sendWhatsAppAppMessage(text);
        await fetchWhatsApp();
      } catch (error) {
        console.error('Error sending WhatsApp message:', error);
        setWhatsappMessages((prev) => prev.filter((msg) => msg.id !== optimistic.id));
        setNewMessage(text);
        toast.error(error instanceof Error ? error.message : 'Failed to send WhatsApp message');
      } finally {
        setSending(false);
      }
      return;
    }

    const isCounselor = targetChannel === 'counselor';
    const conv = isCounselor ? counselorConv : telecallerConv;
    const ownerId = isCounselor ? counselorId : telecallerId;
    if (!conv || !ownerId) return;

    const optimistic: UnifiedMessage = {
      id: crypto.randomUUID(),
      message: text,
      isMine: true,
      is_read: false,
      created_at: new Date().toISOString(),
      channel: targetChannel,
    };

    try {
      setSending(true);
      setHumanMessages((prev) => [...prev, optimistic]);
      setNewMessage('');

      const table = isCounselor ? 'private_messages' : 'telecaller_messages';
      const convTable = isCounselor ? 'private_conversations' : 'telecaller_conversations';

      const { error } = await supabase.from(table).insert({
        id: optimistic.id,
        conversation_id: conv.id,
        sender_id: user.id,
        receiver_id: ownerId,
        message: text,
        is_read: false,
        created_at: optimistic.created_at,
      });

      if (error) throw error;

      try {
        await supabase.from(convTable).update({ last_message_at: new Date().toISOString() }).eq('id', conv.id);
        if (!isCounselor) {
          // Parity with the old standalone telecaller chat: nudge the telecaller's notification feed.
          await supabase.from('notifications').insert({
            user_id: ownerId,
            title: 'New message from your lead',
            message: text.slice(0, 140),
            type: 'info',
            action_url: '/chat',
            is_read: false,
          });
        }
        await fetchHumanMessages(counselorConv, telecallerConv);
      } catch (refreshError) {
        console.error('Message sent, but refresh failed:', refreshError);
      }
    } catch (error) {
      console.error('Error sending message:', error);
      setHumanMessages((prev) => prev.filter((msg) => msg.id !== optimistic.id));
      setNewMessage(text);
      toast.error('Failed to send message');
    } finally {
      setSending(false);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  const sendWaOtp = async () => {
    setWaError('');
    if (!waPhoneInput.trim()) {
      setWaError('Enter your WhatsApp number.');
      return;
    }
    try {
      setWaBusy(true);
      await sendWhatsAppOtp(waPhoneInput.trim());
      setWaOtpSent(true);
    } catch (error) {
      setWaError(error instanceof Error ? error.message : 'Could not send the code.');
    } finally {
      setWaBusy(false);
    }
  };

  const verifyWaOtp = async () => {
    setWaError('');
    if (!waCodeInput.trim()) {
      setWaError('Enter the 6-digit code.');
      return;
    }
    try {
      setWaBusy(true);
      await verifyWhatsAppOtp(waPhoneInput.trim(), waCodeInput.trim());
      setWaOtpSent(false);
      setWaCodeInput('');
      await fetchWhatsApp();
      toast.success('WhatsApp connected');
    } catch (error) {
      setWaError(error instanceof Error ? error.message : 'Could not verify that code.');
    } finally {
      setWaBusy(false);
    }
  };

  useEffect(() => {
    if (whatsappVerified === false) {
      getWhatsAppVerificationStatus()
        .then((status) => {
          if (status.phone_number) setWaPhoneInput(status.phone_number);
        })
        .catch(() => undefined);
    }
  }, [whatsappVerified]);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  const hasAnyConversation = !!counselorConv || !!telecallerConv || (whatsappVerified && !!whatsappConvId);

  const headerNames = [
    counselorConv ? `${counselorName} (Counselor)` : null,
    telecallerConv ? `${telecallerName} (Telecaller)` : null,
    whatsappVerified && whatsappConvId ? 'WhatsApp' : null,
  ].filter(Boolean).join(' · ') || 'your Fly Masters team';

  const aiPanel = (
    <Card className="glass-card">
      <button
        type="button"
        onClick={() => {
          setAiOpen((v) => !v);
          setAiEverOpened(true);
        }}
        className="flex w-full items-center justify-between gap-3 p-4 text-left"
      >
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-full bg-amber-100 flex items-center justify-center">
            <Bot className="w-4 h-4 text-amber-700" />
          </div>
          <div>
            <p className="text-sm font-semibold">AI Advisor</p>
            <p className="text-xs text-muted-foreground">
              {aiMessages.length > 0 ? 'Continue your university matching chat' : 'Answer a few quick questions for university matches'}
            </p>
          </div>
        </div>
        {aiOpen ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
      </button>
      {aiOpen && (
        <div className="border-t px-2 pb-2">
          <ErrorBoundary>
            <ChatInterface />
          </ErrorBoundary>
        </div>
      )}
    </Card>
  );

  if (!hasAnyConversation) {
    return (
      <div className="space-y-4">
        {!embedded && (
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-gradient-primary flex items-center justify-center">
              <Users className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 className="text-2xl font-bold">Team Chat</h1>
              <p className="text-muted-foreground">Message the people working on your application</p>
            </div>
          </div>
        )}

        {aiPanel}

        <Card className="glass-card">
          <CardContent className="text-center py-12 space-y-4">
            <Users className="w-16 h-16 mx-auto opacity-50" />
            <h3 className="text-lg font-semibold">Connect with your team</h3>
            <p className="text-muted-foreground max-w-md mx-auto">
              {statusMessage || 'We will look up your assigned counselor and telecaller so you can start chatting.'}
            </p>
            <div className="flex flex-wrap justify-center gap-3 pt-2">
              <Button onClick={connectNow} disabled={connecting}>
                <RefreshCw className={`w-4 h-4 mr-2 ${connecting ? 'animate-spin' : ''}`} />
                {connecting ? 'Connecting...' : 'Connect now'}
              </Button>
            </div>
          </CardContent>
        </Card>

        {whatsappVerified === false && (
          <WhatsAppVerifyCard
            phone={waPhoneInput}
            setPhone={setWaPhoneInput}
            otpSent={waOtpSent}
            code={waCodeInput}
            setCode={setWaCodeInput}
            busy={waBusy}
            error={waError}
            onSendOtp={sendWaOtp}
            onVerify={verifyWaOtp}
          />
        )}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {!embedded && (
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-gradient-primary flex items-center justify-center">
            <Users className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-bold">Team Chat</h1>
            <p className="text-muted-foreground">Chatting with {headerNames}</p>
          </div>
        </div>
      )}

      {(aiOpen || aiEverOpened || aiMessages.length === 0) && aiPanel}

      <Card className="glass-card h-[600px] flex flex-col">
        <CardHeader className="pb-4">
          <div className="flex items-center gap-3">
            <Avatar className="w-8 h-8">
              <AvatarFallback className="bg-primary/10 text-primary">
                <Users className="w-4 h-4" />
              </AvatarFallback>
            </Avatar>
            <div className="min-w-0">
              <CardTitle className="text-base truncate">{headerNames}</CardTitle>
              <CardDescription className="text-xs">Your Fly Masters team</CardDescription>
            </div>
            <Badge variant="outline" className="ml-auto shrink-0">
              <Circle className="w-2 h-2 mr-1 fill-green-500 text-green-500" />
              Available
            </Badge>
          </div>
        </CardHeader>

        <Separator />

        <CardContent className="flex-1 overflow-y-auto p-4 space-y-4">
          {messages.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <Users className="w-12 h-12 mx-auto mb-4 opacity-50" />
              <p>No messages yet</p>
              <p className="text-sm">Say hello and your team will reply here.</p>
            </div>
          ) : (
            messages.map((message) => {
              const isMine = message.isMine;
              const meta = CHANNEL_META[message.channel];
              const ChannelIcon = meta.icon;
              const staffName = message.channel === 'counselor'
                ? counselorName
                : message.channel === 'telecaller'
                  ? telecallerName
                  : message.channel === 'ai'
                    ? 'Fly Masters AI'
                    : 'WhatsApp';
              return (
                <div key={message.id} className={`flex gap-3 ${isMine ? 'justify-end' : 'justify-start'}`}>
                  {!isMine && (
                    <Avatar className="w-6 h-6 mt-1">
                      <AvatarFallback className="bg-primary/10 text-primary text-xs">
                        {message.channel === 'ai' ? <Bot className="w-3 h-3" /> : <User className="w-3 h-3" />}
                      </AvatarFallback>
                    </Avatar>
                  )}
                  <div className="max-w-[70%]">
                    {!isMine && (
                      <div className={`mb-1 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium ${meta.badge}`}>
                        <ChannelIcon className="w-2.5 h-2.5" />
                        {staffName} · {meta.label}
                      </div>
                    )}
                    <div className={`rounded-lg px-3 py-2 ${isMine ? 'bg-primary text-primary-foreground' : meta.bubbleStaff}`}>
                      <p className="text-sm whitespace-pre-wrap">{message.message}</p>
                      <div className="flex items-center gap-1 mt-1">
                        <Clock className="w-3 h-3 opacity-60" />
                        <span className="text-xs opacity-60">{safeTime(message.created_at)}</span>
                        {isMine && message.channel !== 'ai' && (
                          <CheckCircle2 className={`w-3 h-3 ${message.is_read ? 'text-blue-400' : 'opacity-40'}`} />
                        )}
                      </div>
                    </div>
                  </div>
                  {isMine && (
                    <Avatar className="w-6 h-6 mt-1">
                      <AvatarFallback className="bg-secondary text-secondary-foreground text-xs">
                        {user?.email?.[0].toUpperCase()}
                      </AvatarFallback>
                    </Avatar>
                  )}
                </div>
              );
            })
          )}
          <div ref={messagesEndRef} />
        </CardContent>

        <Separator />

        <div className="p-4 space-y-2">
          {sendableChannels.length > 1 && (
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <span>Replying to:</span>
              {sendableChannels.map((ch) => {
                const meta = CHANNEL_META[ch];
                const ChannelIcon = meta.icon;
                const isActive = targetChannel === ch;
                const label = ch === 'counselor' ? counselorName : ch === 'telecaller' ? telecallerName : 'WhatsApp';
                return (
                  <button
                    key={ch}
                    type="button"
                    onClick={() => setActiveChannel(ch)}
                    className={`inline-flex items-center gap-1 rounded-full px-2 py-1 font-medium transition-colors ${
                      isActive ? meta.badge : 'bg-muted text-muted-foreground hover:bg-muted/80'
                    }`}
                  >
                    <ChannelIcon className="w-3 h-3" />
                    {label}
                  </button>
                );
              })}
            </div>
          )}
          <div className="flex gap-2">
            <Input
              placeholder={targetChannel === 'whatsapp' ? 'Message on WhatsApp...' : 'Type your message...'}
              value={newMessage}
              onChange={(e) => setNewMessage(e.target.value)}
              onKeyDown={handleKeyPress}
              disabled={sending || !targetChannel}
              className="flex-1"
            />
            <Button onClick={sendMessage} disabled={!newMessage.trim() || sending || !targetChannel} size="sm">
              <Send className="w-4 h-4" />
            </Button>
          </div>
        </div>
      </Card>

      {whatsappVerified === false && (
        <WhatsAppVerifyCard
          phone={waPhoneInput}
          setPhone={setWaPhoneInput}
          otpSent={waOtpSent}
          code={waCodeInput}
          setCode={setWaCodeInput}
          busy={waBusy}
          error={waError}
          onSendOtp={sendWaOtp}
          onVerify={verifyWaOtp}
        />
      )}
    </div>
  );
}

function WhatsAppVerifyCard({
  phone,
  setPhone,
  otpSent,
  code,
  setCode,
  busy,
  error,
  onSendOtp,
  onVerify,
}: {
  phone: string;
  setPhone: (v: string) => void;
  otpSent: boolean;
  code: string;
  setCode: (v: string) => void;
  busy: boolean;
  error: string;
  onSendOtp: () => void;
  onVerify: () => void;
}) {
  return (
    <Card className="glass-card border-emerald-100">
      <CardContent className="p-4 space-y-3">
        <div className="flex items-center gap-2">
          <ShieldCheck className="w-4 h-4 text-emerald-600" />
          <p className="text-sm font-semibold">Connect WhatsApp</p>
        </div>
        <p className="text-xs text-muted-foreground">
          Verify your WhatsApp number once, and your team can reach you there too — including sending documents
          directly on WhatsApp — all in this same chat.
        </p>
        {!otpSent ? (
          <div className="flex gap-2">
            <Input
              placeholder="10-digit WhatsApp number"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              disabled={busy}
              className="flex-1"
            />
            <Button onClick={onSendOtp} disabled={busy} size="sm">
              Send code
            </Button>
          </div>
        ) : (
          <div className="flex gap-2">
            <Input
              placeholder="6-digit code"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              disabled={busy}
              className="flex-1"
            />
            <Button onClick={onVerify} disabled={busy} size="sm">
              Verify
            </Button>
          </div>
        )}
        {error && <p className="text-xs text-rose-600">{error}</p>}
      </CardContent>
    </Card>
  );
}
