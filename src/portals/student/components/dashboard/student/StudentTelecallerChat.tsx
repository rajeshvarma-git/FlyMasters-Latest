import { useState, useEffect, useRef } from 'react';
import { useAuth } from '@student/hooks/useAuth';
import { supabase } from '@student/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@student/components/ui/card';
import { Button } from '@student/components/ui/button';
import { Input } from '@student/components/ui/input';
import { Avatar, AvatarFallback } from '@student/components/ui/avatar';
import { Badge } from '@student/components/ui/badge';
import { Separator } from '@student/components/ui/separator';
import {
  Phone,
  Send,
  User,
  Clock,
  CheckCircle2,
  Circle,
  RefreshCw
} from 'lucide-react';
import { format } from 'date-fns';
import { toast } from 'sonner';

interface TelecallerMessage {
  id: string;
  message: string;
  sender_id: string;
  receiver_id: string;
  is_read: boolean;
  created_at: string;
}

interface Conversation {
  id: string;
  student_id: string;
  telecaller_id: string;
  last_message_at: string | null;
}

export function StudentTelecallerChat() {
  const { user } = useAuth();
  const [conversation, setConversation] = useState<Conversation | null>(null);
  const [messages, setMessages] = useState<TelecallerMessage[]>([]);
  const [telecallerName, setTelecallerName] = useState('Your Telecaller');
  const [newMessage, setNewMessage] = useState('');
  const [loading, setLoading] = useState(true);
  const [connecting, setConnecting] = useState(false);
  const [sending, setSending] = useState(false);
  const [statusMessage, setStatusMessage] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (user) openChat();
  }, [user]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, loading]);

  useEffect(() => {
    if (!conversation?.id) return;
    const poll = window.setInterval(() => {
      void fetchMessages(conversation.id);
    }, 3000);
    return () => window.clearInterval(poll);
  }, [conversation?.id]);

  const findAssignedTelecallerId = async (): Promise<string | null> => {
    if (!user) return null;

    const { data: leadByUser } = await supabase
      .from('student_leads')
      .select('assigned_telecaller_id')
      .eq('user_id', user.id)
      .not('assigned_telecaller_id', 'is', null)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (leadByUser?.assigned_telecaller_id) {
      return leadByUser.assigned_telecaller_id;
    }

    if (user.email) {
      const { data: leadByEmail } = await supabase
        .from('student_leads')
        .select('assigned_telecaller_id')
        .eq('email', user.email)
        .not('assigned_telecaller_id', 'is', null)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (leadByEmail?.assigned_telecaller_id) {
        return leadByEmail.assigned_telecaller_id;
      }
    }

    return null;
  };

  const loadTelecallerName = async (telecallerId: string) => {
    const { data: profile } = await supabase
      .from('profiles')
      .select('first_name, last_name')
      .eq('user_id', telecallerId)
      .maybeSingle();

    const name = [profile?.first_name, profile?.last_name].filter(Boolean).join(' ');
    setTelecallerName(name || 'Fly Masters Telecaller');
  };

  const ensureConversation = async (telecallerId: string) => {
    if (!user) return null;

    const { data: existing } = await supabase
      .from('telecaller_conversations')
      .select('*')
      .eq('student_id', user.id)
      .eq('telecaller_id', telecallerId)
      .maybeSingle();

    if (existing) return existing as Conversation;

    const { data: created, error } = await supabase
      .from('telecaller_conversations')
      .insert({
        student_id: user.id,
        telecaller_id: telecallerId,
      })
      .select('*')
      .single();

    if (error) {
      const { data: retry } = await supabase
        .from('telecaller_conversations')
        .select('*')
        .eq('student_id', user.id)
        .eq('telecaller_id', telecallerId)
        .maybeSingle();
      if (retry) return retry as Conversation;
      throw error;
    }

    return created as Conversation;
  };

  const fetchMessages = async (conversationId: string) => {
    const { data, error } = await supabase
      .from('telecaller_messages')
      .select('*')
      .eq('conversation_id', conversationId)
      .order('created_at', { ascending: true });

    if (error) throw error;
    setMessages(data || []);
  };

  const openChat = async () => {
    if (!user) return;

    try {
      setLoading(true);
      setStatusMessage('');

      const telecallerId = await findAssignedTelecallerId();
      if (!telecallerId) {
        setConversation(null);
        setStatusMessage('No telecaller has been assigned to you yet.');
        return;
      }

      const chat = await ensureConversation(telecallerId);
      if (!chat) {
        setConversation(null);
        setStatusMessage('Could not start a conversation. Please try again.');
        return;
      }

      setConversation(chat);
      await Promise.all([
        fetchMessages(chat.id),
        loadTelecallerName(telecallerId),
      ]);
    } catch (error) {
      console.error('Error opening telecaller chat:', error);
      setConversation(null);
      setStatusMessage('Could not connect to your telecaller. Please try again.');
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

  const sendMessage = async () => {
    if (!conversation || !newMessage.trim() || sending || !user) return;

    const text = newMessage.trim();
    const optimistic: TelecallerMessage = {
      id: crypto.randomUUID(),
      message: text,
      sender_id: user.id,
      receiver_id: conversation.telecaller_id,
      is_read: false,
      created_at: new Date().toISOString(),
    };

    try {
      setSending(true);
      setMessages((prev) => [...prev, optimistic]);
      setNewMessage('');

      const { error } = await supabase
        .from('telecaller_messages')
        .insert({
          id: optimistic.id,
          conversation_id: conversation.id,
          sender_id: user.id,
          receiver_id: conversation.telecaller_id,
          message: text,
          is_read: false,
          created_at: optimistic.created_at,
        });

      if (error) throw error;

      try {
        await supabase
          .from('telecaller_conversations')
          .update({ last_message_at: new Date().toISOString() })
          .eq('id', conversation.id);
        await supabase.from('notifications').insert({
          user_id: conversation.telecaller_id,
          title: 'New message from your lead',
          message: text.slice(0, 140),
          type: 'info',
          action_url: '/chat',
          is_read: false,
        });
        await fetchMessages(conversation.id);
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

  if (!conversation) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-gradient-primary flex items-center justify-center">
            <Phone className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-bold">Telecaller Chat</h1>
            <p className="text-muted-foreground">Message the telecaller working on your application</p>
          </div>
        </div>

        <Card className="glass-card">
          <CardContent className="text-center py-12 space-y-4">
            <Phone className="w-16 h-16 mx-auto opacity-50" />
            <h3 className="text-lg font-semibold">Connect with your telecaller</h3>
            <p className="text-muted-foreground max-w-md mx-auto">
              {statusMessage || 'We will look up your assigned telecaller so you can start chatting.'}
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

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-full bg-gradient-primary flex items-center justify-center">
          <Phone className="w-5 h-5 text-white" />
        </div>
        <div>
          <h1 className="text-2xl font-bold">Telecaller Chat</h1>
          <p className="text-muted-foreground">Chatting with {telecallerName}</p>
        </div>
      </div>

      <Card className="glass-card h-[600px] flex flex-col">
        <CardHeader className="pb-4">
          <div className="flex items-center gap-3">
            <Avatar className="w-8 h-8">
              <AvatarFallback className="bg-primary/10 text-primary">
                <User className="w-4 h-4" />
              </AvatarFallback>
            </Avatar>
            <div>
              <CardTitle className="text-base">{telecallerName}</CardTitle>
              <CardDescription className="text-xs">Your Fly Masters Telecaller</CardDescription>
            </div>
            <Badge variant="outline" className="ml-auto">
              <Circle className="w-2 h-2 mr-1 fill-green-500 text-green-500" />
              Available
            </Badge>
          </div>
        </CardHeader>

        <Separator />

        <CardContent className="flex-1 overflow-y-auto p-4 space-y-4">
          {messages.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <Phone className="w-12 h-12 mx-auto mb-4 opacity-50" />
              <p>No messages yet</p>
              <p className="text-sm">Say hello and your telecaller will reply here.</p>
            </div>
          ) : (
            messages.map((message) => (
              <div key={message.id} className={`flex gap-3 ${
                message.sender_id === user?.id ? 'justify-end' : 'justify-start'
              }`}>
                {message.sender_id !== user?.id && (
                  <Avatar className="w-6 h-6 mt-1">
                    <AvatarFallback className="bg-primary/10 text-primary text-xs">
                      <User className="w-3 h-3" />
                    </AvatarFallback>
                  </Avatar>
                )}
                <div className={`max-w-[70%] rounded-lg px-3 py-2 ${
                  message.sender_id === user?.id
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-muted'
                }`}>
                  <p className="text-sm">{message.message}</p>
                  <div className="flex items-center gap-1 mt-1">
                    <Clock className="w-3 h-3 opacity-60" />
                    <span className="text-xs opacity-60">
                      {format(new Date(message.created_at), 'HH:mm')}
                    </span>
                    {message.sender_id === user?.id && (
                      <CheckCircle2 className={`w-3 h-3 ${
                        message.is_read ? 'text-blue-400' : 'opacity-40'
                      }`} />
                    )}
                  </div>
                </div>
                {message.sender_id === user?.id && (
                  <Avatar className="w-6 h-6 mt-1">
                    <AvatarFallback className="bg-secondary text-secondary-foreground text-xs">
                      {user?.email?.[0].toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                )}
              </div>
            ))
          )}
          <div ref={messagesEndRef} />
        </CardContent>

        <Separator />

        <div className="p-4">
          <div className="flex gap-2">
            <Input
              placeholder="Type your message..."
              value={newMessage}
              onChange={(e) => setNewMessage(e.target.value)}
              onKeyDown={handleKeyPress}
              disabled={sending}
              className="flex-1"
            />
            <Button
              onClick={sendMessage}
              disabled={!newMessage.trim() || sending}
              size="sm"
            >
              <Send className="w-4 h-4" />
            </Button>
          </div>
        </div>
      </Card>
    </div>
  );
}
