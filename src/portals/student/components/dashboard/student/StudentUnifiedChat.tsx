import { useState, useEffect, useRef, useCallback } from 'react';
import { useAuth } from '@student/hooks/useAuth';
import { supabase } from '@student/integrations/supabase/client';
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
} from 'lucide-react';
import { format } from 'date-fns';
import { toast } from 'sonner';
import ErrorBoundary from '@student/components/ErrorBoundary';

/**
 * One real conversation with the Fly Masters team, instead of two separate
 * "Counselor" and "Telecaller" tabs. Under the hood there are still two
 * stores (private_conversations/private_messages for the counselor,
 * telecaller_conversations/telecaller_messages for the telecaller — see
 * server/routes/core.mjs and server/routes/counselor.mjs) because a full
 * schema merge is bigger, riskier work tracked separately. This component
 * fetches both, tags every message with which staff member sent it, and
 * renders one chronologically-sorted timeline with one input box — so from
 * the student's side it reads and behaves like a single thread with
 * whoever is currently assigned to them.
 *
 * The AI Advisor is intentionally NOT folded into this timeline: it has no
 * server-side message-by-message transcript today (src/portals/student/
 * hooks/useChat.tsx only persists a single summarized chat_sessions row),
 * so merging it here would need new persistence first. It stays its own
 * tab in StudentMessages.tsx.
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

type Channel = 'counselor' | 'telecaller';

interface UnifiedMessage {
  id: string;
  message: string;
  sender_id: string;
  receiver_id: string;
  is_read: boolean;
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
  const [messages, setMessages] = useState<UnifiedMessage[]>([]);
  const [activeChannel, setActiveChannel] = useState<Channel>('counselor');
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

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, loading]);

  useEffect(() => {
    if (!counselorConv?.id && !telecallerConv?.id) return;
    const poll = window.setInterval(() => {
      fetchAllMessages(counselorConv, telecallerConv).catch((error) => {
        console.error('Team chat poll failed:', error);
      });
    }, 3000);
    return () => window.clearInterval(poll);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [counselorConv?.id, telecallerConv?.id]);

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

  const fetchAllMessages = useCallback(async (counselor: StoredConversation | null, telecaller: StoredConversation | null) => {
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
      ...(counselorRows.data || []).map((row: Omit<UnifiedMessage, 'channel'>) => ({ ...row, channel: 'counselor' as const })),
      ...(telecallerRows.data || []).map((row: Omit<UnifiedMessage, 'channel'>) => ({ ...row, channel: 'telecaller' as const })),
    ];
    tagged.sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
    setMessages(tagged);
    return tagged;
  }, []);

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

      if (!foundCounselorId && !foundTelecallerId) {
        setCounselorConv(null);
        setTelecallerConv(null);
        setStatusMessage('No one has been assigned to you yet.');
        return;
      }

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

      const tagged = await fetchAllMessages(counselorChat, telecallerChat);

      // Default the reply target to whoever spoke to the student most recently;
      // fall back to counselor (then telecaller) when nobody has said anything yet.
      const lastIncoming = [...tagged].reverse().find((row) => row.sender_id !== user.id);
      if (lastIncoming) {
        setActiveChannel(lastIncoming.channel);
      } else if (counselorChat) {
        setActiveChannel('counselor');
      } else if (telecallerChat) {
        setActiveChannel('telecaller');
      }

      if (!counselorChat && !telecallerChat) {
        setStatusMessage('Could not start a conversation. Please try again.');
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

  const targetChannel: Channel | null = counselorConv && telecallerConv
    ? activeChannel
    : counselorConv
      ? 'counselor'
      : telecallerConv
        ? 'telecaller'
        : null;

  const sendMessage = async () => {
    if (!targetChannel || !newMessage.trim() || sending || !user) return;

    const text = newMessage.trim();
    const isCounselor = targetChannel === 'counselor';
    const conv = isCounselor ? counselorConv : telecallerConv;
    const ownerId = isCounselor ? counselorId : telecallerId;
    if (!conv || !ownerId) return;

    const optimistic: UnifiedMessage = {
      id: crypto.randomUUID(),
      message: text,
      sender_id: user.id,
      receiver_id: ownerId,
      is_read: false,
      created_at: new Date().toISOString(),
      channel: targetChannel,
    };

    try {
      setSending(true);
      setMessages((prev) => [...prev, optimistic]);
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
        await fetchAllMessages(counselorConv, telecallerConv);
      } catch (refreshError) {
        console.error('Message sent, but refresh failed:', refreshError);
      }
    } catch (error) {
      console.error('Error sending message:', error);
      setMessages((prev) => prev.filter((msg) => msg.id !== optimistic.id));
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

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  if (!counselorConv && !telecallerConv) {
    return (
      <div className="space-y-6">
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
      </div>
    );
  }

  const headerNames = [
    counselorConv ? `${counselorName} (Counselor)` : null,
    telecallerConv ? `${telecallerName} (Telecaller)` : null,
  ].filter(Boolean).join(' · ');

  return (
    <div className="space-y-6">
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
              const isMine = message.sender_id === user?.id;
              const meta = CHANNEL_META[message.channel];
              const ChannelIcon = meta.icon;
              const staffName = message.channel === 'counselor' ? counselorName : telecallerName;
              return (
                <div key={message.id} className={`flex gap-3 ${isMine ? 'justify-end' : 'justify-start'}`}>
                  {!isMine && (
                    <Avatar className="w-6 h-6 mt-1">
                      <AvatarFallback className="bg-primary/10 text-primary text-xs">
                        <User className="w-3 h-3" />
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
                      <p className="text-sm">{message.message}</p>
                      <div className="flex items-center gap-1 mt-1">
                        <Clock className="w-3 h-3 opacity-60" />
                        <span className="text-xs opacity-60">{safeTime(message.created_at)}</span>
                        {isMine && (
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
          {counselorConv && telecallerConv && (
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <span>Replying to:</span>
              {(['counselor', 'telecaller'] as Channel[]).map((ch) => {
                const meta = CHANNEL_META[ch];
                const ChannelIcon = meta.icon;
                const isActive = activeChannel === ch;
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
                    {ch === 'counselor' ? counselorName : telecallerName}
                  </button>
                );
              })}
            </div>
          )}
          <div className="flex gap-2">
            <Input
              placeholder="Type your message..."
              value={newMessage}
              onChange={(e) => setNewMessage(e.target.value)}
              onKeyDown={handleKeyPress}
              disabled={sending}
              className="flex-1"
            />
            <Button onClick={sendMessage} disabled={!newMessage.trim() || sending} size="sm">
              <Send className="w-4 h-4" />
            </Button>
          </div>
        </div>
      </Card>
    </div>
  );
}
