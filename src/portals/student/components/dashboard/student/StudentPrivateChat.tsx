import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
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
  Send, 
  User, 
  Clock,
  CheckCircle2,
  Circle,
  Bot,
  RefreshCw,
  Pencil,
  Check,
  X
} from 'lucide-react';
import { format } from 'date-fns';
import { toast } from 'sonner';

interface PrivateMessage {
  id: string;
  message: string;
  sender_id: string;
  receiver_id: string;
  is_read: boolean;
  created_at: string;
  updated_at?: string;
}

const isMessageEdited = (msg: PrivateMessage) => {
  if (!msg.updated_at) return false;
  return new Date(msg.updated_at).getTime() - new Date(msg.created_at).getTime() > 1000;
};

interface Conversation {
  id: string;
  student_id: string;
  counselor_id: string;
  last_message_at: string | null;
}

export function StudentPrivateChat() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [conversation, setConversation] = useState<Conversation | null>(null);
  const [messages, setMessages] = useState<PrivateMessage[]>([]);
  const [counselorName, setCounselorName] = useState('Your Counselor');
  const [newMessage, setNewMessage] = useState('');
  const [loading, setLoading] = useState(true);
  const [connecting, setConnecting] = useState(false);
  const [sending, setSending] = useState(false);
  const [editingMessageId, setEditingMessageId] = useState<string | null>(null);
  const [editText, setEditText] = useState('');
  const [savingEdit, setSavingEdit] = useState(false);
  const [statusMessage, setStatusMessage] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (user) {
      openChat();
    }
  }, [user]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, loading]);

  useEffect(() => {
    if (!conversation?.id) return;

    const channel = supabase
      .channel(`student-chat-${conversation.id}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'private_messages',
          filter: `conversation_id=eq.${conversation.id}`,
        },
        (payload) => {
          const incoming = payload?.new as PrivateMessage | undefined;
          if (!incoming?.id) return;
          setMessages((prev) => {
            if (prev.some((msg) => msg.id === incoming.id)) return prev;
            return [...prev, incoming];
          });
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'private_messages',
          filter: `conversation_id=eq.${conversation.id}`,
        },
        (payload) => {
          const updated = payload?.new as PrivateMessage | undefined;
          if (!updated?.id) return;
          setMessages((prev) =>
            prev.map((msg) => (msg.id === updated.id ? { ...msg, ...updated } : msg))
          );
        }
      )
      .subscribe();

    const poll = window.setInterval(() => {
      void fetchMessages(conversation.id);
    }, 3000);

    return () => {
      window.clearInterval(poll);
      supabase.removeChannel(channel);
    };
  }, [conversation?.id]);

  const findAssignedCounselorId = async (): Promise<string | null> => {
    if (!user) return null;

    const { data: leadByUser } = await supabase
      .from('student_leads')
      .select('assigned_counselor_id')
      .eq('user_id', user.id)
      .not('assigned_counselor_id', 'is', null)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (leadByUser?.assigned_counselor_id) {
      return leadByUser.assigned_counselor_id;
    }

    if (user.email) {
      const { data: leadByEmail } = await supabase
        .from('student_leads')
        .select('assigned_counselor_id')
        .eq('email', user.email)
        .not('assigned_counselor_id', 'is', null)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (leadByEmail?.assigned_counselor_id) {
        return leadByEmail.assigned_counselor_id;
      }
    }

    return null;
  };

  const rememberAssignment = async (counselorId: string) => {
    void counselorId;
    return;
  };

  const loadCounselorName = async (counselorId: string) => {
    const { data: profile } = await supabase
      .from('profiles')
      .select('first_name, last_name')
      .eq('user_id', counselorId)
      .maybeSingle();

    const name = [profile?.first_name, profile?.last_name].filter(Boolean).join(' ');
    setCounselorName(name || 'Fly Masters Counselor');
  };

  const ensureConversation = async (counselorId: string) => {
    if (!user) return null;

    const { data: existing } = await supabase
      .from('private_conversations')
      .select('*')
      .eq('student_id', user.id)
      .eq('counselor_id', counselorId)
      .maybeSingle();

    if (existing) return existing as Conversation;

    const { data: created, error } = await supabase
      .from('private_conversations')
      .insert({
        student_id: user.id,
        counselor_id: counselorId,
      })
      .select('*')
      .single();

    if (error) {
      const { data: retry } = await supabase
        .from('private_conversations')
        .select('*')
        .eq('student_id', user.id)
        .eq('counselor_id', counselorId)
        .maybeSingle();
      if (retry) return retry as Conversation;
      throw error;
    }

    return created as Conversation;
  };

  const fetchMessages = async (conversationId: string) => {
    const { data, error } = await supabase
      .from('private_messages')
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

      const counselorId = await findAssignedCounselorId();
      if (!counselorId) {
        setConversation(null);
        setStatusMessage('No counselors are available in the system yet.');
        return;
      }

      await rememberAssignment(counselorId);
      const chat = await ensureConversation(counselorId);
      if (!chat) {
        setConversation(null);
        setStatusMessage('Could not start a conversation. Please try again.');
        return;
      }

      setConversation(chat);
      await Promise.all([
        fetchMessages(chat.id),
        loadCounselorName(counselorId),
      ]);
    } catch (error) {
      console.error('Error opening counselor chat:', error);
      setConversation(null);
      setStatusMessage('Could not connect to a counselor. Please try again.');
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
    const optimistic: PrivateMessage = {
      id: crypto.randomUUID(),
      message: text,
      sender_id: user.id,
      receiver_id: conversation.counselor_id,
      is_read: false,
      created_at: new Date().toISOString(),
    };

    try {
      setSending(true);
      setMessages((prev) => [...prev, optimistic]);
      setNewMessage('');

      const { error } = await supabase
        .from('private_messages')
        .insert({
          id: optimistic.id,
          conversation_id: conversation.id,
          sender_id: user.id,
          receiver_id: conversation.counselor_id,
          message: text,
          is_read: false,
          created_at: optimistic.created_at,
        });

      if (error) throw error;

      try {
        await supabase
          .from('private_conversations')
          .update({ last_message_at: new Date().toISOString() })
          .eq('id', conversation.id);
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

  const startEdit = (message: PrivateMessage) => {
    setEditingMessageId(message.id);
    setEditText(message.message);
  };

  const cancelEdit = () => {
    setEditingMessageId(null);
    setEditText('');
  };

  const saveEdit = async () => {
    if (!editingMessageId || !editText.trim() || savingEdit || !user) return;

    const text = editText.trim();
    const messageId = editingMessageId;
    const now = new Date().toISOString();

    try {
      setSavingEdit(true);
      setMessages((prev) =>
        prev.map((msg) =>
          msg.id === messageId ? { ...msg, message: text, updated_at: now } : msg
        )
      );
      setEditingMessageId(null);
      setEditText('');

      const { error } = await supabase
        .from('private_messages')
        .update({ message: text, updated_at: now })
        .eq('id', messageId)
        .eq('sender_id', user.id);

      if (error) throw error;
    } catch (error) {
      console.error('Error editing message:', error);
      toast.error('Failed to edit message');
      if (conversation) await fetchMessages(conversation.id);
    } finally {
      setSavingEdit(false);
    }
  };

  const handleEditKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      saveEdit();
    }
    if (e.key === 'Escape') {
      cancelEdit();
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
            <MessageCircle className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-bold">Counselor Chat</h1>
            <p className="text-muted-foreground">Chat with a Fly Masters counselor</p>
          </div>
        </div>
        
        <Card className="glass-card">
          <CardContent className="text-center py-12 space-y-4">
            <MessageCircle className="w-16 h-16 mx-auto opacity-50" />
            <h3 className="text-lg font-semibold">Connect with a counselor</h3>
            <p className="text-muted-foreground max-w-md mx-auto">
              {statusMessage || 'We will assign an available counselor so you can start chatting.'}
            </p>
            <div className="flex flex-wrap justify-center gap-3 pt-2">
              <Button onClick={connectNow} disabled={connecting}>
                <RefreshCw className={`w-4 h-4 mr-2 ${connecting ? 'animate-spin' : ''}`} />
                {connecting ? 'Connecting...' : 'Connect now'}
              </Button>
              <Button variant="outline" onClick={() => navigate('/chat')}>
                <Bot className="w-4 h-4 mr-2" />
                Talk to AI Advisor
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
          <MessageCircle className="w-5 h-5 text-white" />
        </div>
        <div>
          <h1 className="text-2xl font-bold">Counselor Chat</h1>
          <p className="text-muted-foreground">Chatting with {counselorName}</p>
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
              <CardTitle className="text-base">{counselorName}</CardTitle>
              <CardDescription className="text-xs">Your Study Abroad Counselor</CardDescription>
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
              <MessageCircle className="w-12 h-12 mx-auto mb-4 opacity-50" />
              <p>No messages yet</p>
              <p className="text-sm">Say hello and your counselor will reply here.</p>
            </div>
          ) : (
            messages.map((message) => (
              <div key={message.id} className={`group flex gap-3 ${
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
                  {editingMessageId === message.id ? (
                    <div className="flex flex-col gap-2">
                      <Input
                        value={editText}
                        onChange={(e) => setEditText(e.target.value)}
                        onKeyDown={handleEditKeyPress}
                        autoFocus
                        disabled={savingEdit}
                        className="text-sm h-8 bg-primary-foreground/10 border-primary-foreground/30 text-primary-foreground placeholder:text-primary-foreground/50"
                      />
                      <div className="flex gap-1 justify-end">
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={cancelEdit}
                          disabled={savingEdit}
                          className="h-6 px-2 text-primary-foreground hover:bg-primary-foreground/10"
                        >
                          <X className="w-3 h-3" />
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={saveEdit}
                          disabled={!editText.trim() || savingEdit}
                          className="h-6 px-2 text-primary-foreground hover:bg-primary-foreground/10"
                        >
                          <Check className="w-3 h-3" />
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <>
                      <p className="text-sm">{message.message}</p>
                      <div className="flex items-center gap-1 mt-1">
                        <Clock className="w-3 h-3 opacity-60" />
                        <span className="text-xs opacity-60">
                          {format(new Date(message.created_at), 'HH:mm')}
                        </span>
                        {isMessageEdited(message) && (
                          <span className="text-xs opacity-60 italic">edited</span>
                        )}
                        {message.sender_id === user?.id && (
                          <>
                            <CheckCircle2 className={`w-3 h-3 ${
                              message.is_read ? 'text-blue-400' : 'opacity-40'
                            }`} />
                            <button
                              type="button"
                              onClick={() => startEdit(message)}
                              className="opacity-0 group-hover:opacity-60 hover:!opacity-100 transition-opacity ml-0.5"
                              title="Edit message"
                            >
                              <Pencil className="w-3 h-3" />
                            </button>
                          </>
                        )}
                      </div>
                    </>
                  )}
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
