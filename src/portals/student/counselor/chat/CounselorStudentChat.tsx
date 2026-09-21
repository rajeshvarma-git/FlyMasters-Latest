import { useState, useEffect, useRef } from 'react';
import { useAuth } from '@student/hooks/useAuth';
import { supabase } from '@student/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@student/components/ui/card';
import { Button } from '@student/components/ui/button';
import { Input } from '@student/components/ui/input';
import { Avatar, AvatarFallback } from '@student/components/ui/avatar';
import { Badge } from '@student/components/ui/badge';
import { Separator } from '@student/components/ui/separator';
import { MessageCircle, Send, User, Clock, CheckCircle2 } from 'lucide-react';
import { format } from 'date-fns';
import { toast } from 'sonner';
import { notifyStudent } from '@student/lib/studentInbox';

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
  student_name: string;
  unread_count: number;
  last_message?: string;
}

export function CounselorStudentChat() {
  const { user } = useAuth();
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeConversation, setActiveConversation] = useState<Conversation | null>(null);
  const [messages, setMessages] = useState<PrivateMessage[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (user) {
      loadConversations();
    }
  }, [user]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  useEffect(() => {
    if (!user?.id) return;

    const channel = supabase
      .channel(`counselor-chats-${user.id}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'private_messages',
        },
        (payload) => {
          const incoming = payload?.new as (PrivateMessage & { conversation_id?: string }) | undefined;
          if (!incoming?.id) return;
          if (activeConversation && incoming.conversation_id === activeConversation.id) {
            setMessages((prev) => {
              if (prev.some((msg) => msg.id === incoming.id)) return prev;
              return [...prev, incoming];
            });
            if (incoming.receiver_id === user.id) {
              markConversationRead(activeConversation.id);
            }
          }
          loadConversations();
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'private_messages',
        },
        (payload) => {
          const updated = payload?.new as (PrivateMessage & { conversation_id?: string }) | undefined;
          if (!updated?.id) return;
          if (activeConversation && updated.conversation_id === activeConversation.id) {
            setMessages((prev) =>
              prev.map((msg) => (msg.id === updated.id ? { ...msg, ...updated } : msg))
            );
          }
          loadConversations();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user?.id, activeConversation?.id]);

  const loadConversations = async () => {
    if (!user) return;

    try {
      const { data: chats, error } = await supabase
        .from('private_conversations')
        .select('*')
        .eq('counselor_id', user.id)
        .order('last_message_at', { ascending: false });

      if (error) throw error;

      const studentIds = [...new Set((chats || []).map((chat) => chat.student_id))];
      const profileMap = new Map<string, { first_name: string | null; last_name: string | null }>();

      if (studentIds.length > 0) {
        const { data: profiles } = await supabase
          .from('profiles')
          .select('user_id, first_name, last_name')
          .in('user_id', studentIds);

        (profiles || []).forEach((profile) => {
          profileMap.set(profile.user_id, profile);
        });
      }

      const conversationRows = await Promise.all(
        (chats || []).map(async (chat) => {
          const profile = profileMap.get(chat.student_id);
          const studentName = [profile?.first_name, profile?.last_name].filter(Boolean).join(' ') || 'Student';

          const { count } = await supabase
            .from('private_messages')
            .select('id', { count: 'exact', head: true })
            .eq('conversation_id', chat.id)
            .eq('receiver_id', user.id)
            .eq('is_read', false);

          const { data: lastRows } = await supabase
            .from('private_messages')
            .select('message')
            .eq('conversation_id', chat.id)
            .order('created_at', { ascending: false })
            .limit(1);

          return {
            id: chat.id,
            student_id: chat.student_id,
            counselor_id: chat.counselor_id,
            last_message_at: chat.last_message_at,
            student_name: studentName,
            unread_count: count || 0,
            last_message: lastRows?.[0]?.message,
          } as Conversation;
        })
      );

      setConversations(conversationRows);
      if (!activeConversation && conversationRows[0]) {
        const first = conversationRows[0];
        setActiveConversation(first);
        await fetchMessages(first.id);
        await markConversationRead(first.id);
      }
    } catch (error) {
      console.error('Error loading conversations:', error);
      toast.error('Failed to load student chats');
    } finally {
      setLoading(false);
    }
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

  const markConversationRead = async (conversationId: string) => {
    if (!user) return;
    await supabase
      .from('private_messages')
      .update({ is_read: true })
      .eq('conversation_id', conversationId)
      .eq('receiver_id', user.id)
      .eq('is_read', false);
  };

  const openConversation = async (conversation: Conversation) => {
    try {
      setActiveConversation(conversation);
      await fetchMessages(conversation.id);
      await markConversationRead(conversation.id);
      setConversations((prev) =>
        prev.map((item) => (item.id === conversation.id ? { ...item, unread_count: 0 } : item))
      );
    } catch (error) {
      console.error('Error opening conversation:', error);
      toast.error('Failed to load messages');
    }
  };

  const sendMessage = async () => {
    if (!activeConversation || !newMessage.trim() || sending || !user) return;

    const text = newMessage.trim();
    try {
      setSending(true);
      const { error } = await supabase.from('private_messages').insert({
        conversation_id: activeConversation.id,
        sender_id: user.id,
        receiver_id: activeConversation.student_id,
        message: text,
        is_read: false,
      });

      if (error) throw error;

      try {
        await notifyStudent({
          userId: activeConversation.student_id,
          type: 'chat',
          title: 'New message from your counselor',
          message: text.length > 140 ? `${text.slice(0, 137)}...` : text,
          actionUrl: '/student/chat',
        });
      } catch (notifyError) {
        console.error('Chat notification failed:', notifyError);
      }

      setNewMessage('');
      try {
        await supabase
          .from('private_conversations')
          .update({ last_message_at: new Date().toISOString() })
          .eq('id', activeConversation.id);
        await fetchMessages(activeConversation.id);
        await loadConversations();
      } catch (refreshError) {
        console.error('Message sent, but refresh failed:', refreshError);
      }
    } catch (error) {
      console.error('Error sending message:', error);
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

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-full bg-gradient-primary flex items-center justify-center">
          <MessageCircle className="w-5 h-5 text-white" />
        </div>
        <div>
          <h1 className="text-2xl font-bold">Student Chat</h1>
          <p className="text-muted-foreground">Reply to students assigned to you</p>
        </div>
      </div>

      {conversations.length === 0 ? (
        <Card className="glass-card">
          <CardContent className="text-center py-12 space-y-3">
            <MessageCircle className="w-16 h-16 mx-auto opacity-50" />
            <h3 className="text-lg font-semibold">No student conversations yet</h3>
            <p className="text-muted-foreground max-w-md mx-auto">
              When a student messages you from their portal, the chat will appear here.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 lg:grid-cols-[280px_1fr] min-h-[600px]">
          <Card className="glass-card overflow-hidden">
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Conversations</CardTitle>
              <CardDescription>{conversations.length} student{conversations.length === 1 ? '' : 's'}</CardDescription>
            </CardHeader>
            <Separator />
            <CardContent className="p-0">
              <div className="max-h-[520px] overflow-y-auto">
                {conversations.map((conversation) => (
                  <button
                    key={conversation.id}
                    type="button"
                    onClick={() => openConversation(conversation)}
                    className={`w-full text-left px-4 py-3 border-b border-border/40 transition-colors ${
                      activeConversation?.id === conversation.id
                        ? 'bg-primary/10'
                        : 'hover:bg-muted/50'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <Avatar className="w-8 h-8">
                        <AvatarFallback className="bg-primary/10 text-primary text-xs">
                          {conversation.student_name[0]}
                        </AvatarFallback>
                      </Avatar>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between gap-2">
                          <p className="text-sm font-medium truncate">{conversation.student_name}</p>
                          {conversation.unread_count > 0 && (
                            <Badge variant="default" className="h-5 min-w-5 px-1.5 text-[10px]">
                              {conversation.unread_count}
                            </Badge>
                          )}
                        </div>
                        <p className="text-xs text-muted-foreground truncate">
                          {conversation.last_message || 'No messages yet'}
                        </p>
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            </CardContent>
          </Card>

          <Card className="glass-card h-[600px] flex flex-col">
            {activeConversation ? (
              <>
                <CardHeader className="pb-4">
                  <div className="flex items-center gap-3">
                    <Avatar className="w-8 h-8">
                      <AvatarFallback className="bg-primary/10 text-primary">
                        <User className="w-4 h-4" />
                      </AvatarFallback>
                    </Avatar>
                    <div>
                      <CardTitle className="text-base">{activeConversation.student_name}</CardTitle>
                      <CardDescription className="text-xs">Assigned student</CardDescription>
                    </div>
                  </div>
                </CardHeader>
                <Separator />
                <CardContent className="flex-1 overflow-y-auto p-4 space-y-4">
                  {messages.length === 0 ? (
                    <div className="text-center py-8 text-muted-foreground">
                      <MessageCircle className="w-12 h-12 mx-auto mb-4 opacity-50" />
                      <p>No messages yet</p>
                      <p className="text-sm">Start the conversation with this student.</p>
                    </div>
                  ) : (
                    messages.map((message) => (
                      <div
                        key={message.id}
                        className={`flex gap-3 ${
                          message.sender_id === user?.id ? 'justify-end' : 'justify-start'
                        }`}
                      >
                        {message.sender_id !== user?.id && (
                          <Avatar className="w-6 h-6 mt-1">
                            <AvatarFallback className="bg-primary/10 text-primary text-xs">
                              <User className="w-3 h-3" />
                            </AvatarFallback>
                          </Avatar>
                        )}
                        <div
                          className={`max-w-[70%] rounded-lg px-3 py-2 ${
                            message.sender_id === user?.id
                              ? 'bg-primary text-primary-foreground'
                              : 'bg-muted'
                          }`}
                        >
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
                              <CheckCircle2
                                className={`w-3 h-3 ${message.is_read ? 'text-blue-400' : 'opacity-40'}`}
                              />
                            )}
                          </div>
                        </div>
                      </div>
                    ))
                  )}
                  <div ref={messagesEndRef} />
                </CardContent>
                <Separator />
                <div className="p-4">
                  <div className="flex gap-2">
                    <Input
                      placeholder="Type a reply..."
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
              </>
            ) : (
              <CardContent className="flex-1 flex items-center justify-center text-muted-foreground">
                Select a student conversation
              </CardContent>
            )}
          </Card>
        </div>
      )}
    </div>
  );
}
