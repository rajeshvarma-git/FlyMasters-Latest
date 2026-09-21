import { useEffect, useRef, useState } from 'react';
import { format } from 'date-fns';
import { Clock, MessageCircle, Send, User } from 'lucide-react';
import { Avatar, AvatarFallback } from '@student/components/ui/avatar';
import { Badge } from '@student/components/ui/badge';
import { Button } from '@student/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@student/components/ui/card';
import { Input } from '@student/components/ui/input';
import { Separator } from '@student/components/ui/separator';
import { toast } from 'sonner';
import {
  listWhatsAppConversations,
  listWhatsAppMessages,
  markWhatsAppConversationRead,
  sendWhatsAppReply,
  type WhatsAppConversation,
  type WhatsAppMessage,
} from '@student/lib/whatsappApi';

type Props = {
  title?: string;
  subtitle?: string;
};

export function WhatsAppInbox({
  title = 'WhatsApp',
  subtitle = 'Reply to students on WhatsApp',
}: Props) {
  const [conversations, setConversations] = useState<WhatsAppConversation[]>([]);
  const [active, setActive] = useState<WhatsAppConversation | null>(null);
  const [messages, setMessages] = useState<WhatsAppMessage[]>([]);
  const [draft, setDraft] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const refreshConversations = async (keepId?: string) => {
    const { conversations: next } = await listWhatsAppConversations();
    setConversations(next);
    if (keepId) {
      const match = next.find((item) => item.id === keepId);
      if (match) setActive(match);
    }
  };

  const openConversation = async (conversation: WhatsAppConversation) => {
    setActive(conversation);
    const { messages: thread } = await listWhatsAppMessages(conversation.id);
    setMessages(thread);
    if (conversation.unread_count > 0) {
      await markWhatsAppConversationRead(conversation.id);
      await refreshConversations(conversation.id);
    }
  };

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        await refreshConversations(active?.id);
      } catch (error: any) {
        if (!cancelled) toast.error(error.message || 'Could not load WhatsApp conversations.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    void load();
    const timer = window.setInterval(() => {
      void (async () => {
        try {
          await refreshConversations(active?.id);
          if (active?.id) {
            const { messages: thread } = await listWhatsAppMessages(active.id);
            setMessages(thread);
          }
        } catch {
          // keep last successful snapshot
        }
      })();
    }, 4000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [active?.id]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const sendReply = async () => {
    if (!active || !draft.trim()) return;
    setSending(true);
    try {
      const { message } = await sendWhatsAppReply(active.id, draft.trim());
      setMessages((prev) => [...prev, message]);
      setDraft('');
      await refreshConversations(active.id);
    } catch (error: any) {
      toast.error(error.message || 'Could not send the WhatsApp reply.');
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-full bg-emerald-500/15 text-emerald-600 flex items-center justify-center">
          <MessageCircle className="w-5 h-5" />
        </div>
        <div>
          <h1 className="text-2xl font-bold">{title}</h1>
          <p className="text-muted-foreground">{subtitle}</p>
        </div>
      </div>

      {loading ? (
        <Card className="glass-card">
          <CardContent className="py-16 text-center text-muted-foreground">Loading WhatsApp inbox...</CardContent>
        </Card>
      ) : conversations.length === 0 ? (
        <Card className="glass-card">
          <CardContent className="text-center py-12 space-y-3">
            <MessageCircle className="w-16 h-16 mx-auto opacity-50 text-emerald-600" />
            <h3 className="text-lg font-semibold">No WhatsApp conversations yet</h3>
            <p className="text-muted-foreground max-w-md mx-auto">
              Incoming student messages appear here after they verify their number and write to the business WhatsApp.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 lg:grid-cols-[280px_1fr] min-h-[600px]">
          <Card className="glass-card overflow-hidden">
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Conversations</CardTitle>
              <CardDescription>
                {conversations.length} thread{conversations.length === 1 ? '' : 's'}
              </CardDescription>
            </CardHeader>
            <Separator />
            <CardContent className="p-0">
              <div className="max-h-[520px] overflow-y-auto">
                {conversations.map((conversation) => (
                  <button
                    key={conversation.id}
                    type="button"
                    onClick={() => void openConversation(conversation)}
                    className={`w-full text-left px-4 py-3 border-b border-border/40 transition-colors ${
                      active?.id === conversation.id ? 'bg-emerald-500/10' : 'hover:bg-muted/50'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <Avatar className="w-8 h-8">
                        <AvatarFallback className="bg-emerald-500/15 text-emerald-700 text-xs">
                          {(conversation.student_name || 'W')[0]}
                        </AvatarFallback>
                      </Avatar>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between gap-2">
                          <p className="text-sm font-medium truncate">{conversation.student_name}</p>
                          {conversation.unread_count > 0 && (
                            <Badge className="h-5 min-w-5 px-1.5 text-[10px] bg-emerald-600">
                              {conversation.unread_count}
                            </Badge>
                          )}
                        </div>
                        <p className="text-xs text-muted-foreground truncate">{conversation.phone_number}</p>
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
            {active ? (
              <>
                <CardHeader className="pb-4">
                  <div className="flex items-center gap-3">
                    <Avatar className="w-8 h-8">
                      <AvatarFallback className="bg-emerald-500/15 text-emerald-700">
                        <User className="w-4 h-4" />
                      </AvatarFallback>
                    </Avatar>
                    <div>
                      <CardTitle className="text-base">{active.student_name}</CardTitle>
                      <CardDescription className="text-xs">
                        {active.phone_number}
                        {active.whatsapp_verified ? ' · verified' : ''}
                      </CardDescription>
                    </div>
                  </div>
                </CardHeader>
                <Separator />
                <CardContent className="flex-1 overflow-y-auto p-4 space-y-4">
                  {messages.length === 0 ? (
                    <div className="text-center py-8 text-muted-foreground">
                      <MessageCircle className="w-12 h-12 mx-auto mb-4 opacity-50" />
                      <p>No messages yet</p>
                    </div>
                  ) : (
                    messages.map((message) => (
                      <div
                        key={message.id}
                        className={`flex gap-3 ${message.direction === 'outbound' ? 'justify-end' : 'justify-start'}`}
                      >
                        {message.direction === 'inbound' && (
                          <Avatar className="w-6 h-6 mt-1">
                            <AvatarFallback className="bg-emerald-500/15 text-emerald-700 text-xs">
                              <User className="w-3 h-3" />
                            </AvatarFallback>
                          </Avatar>
                        )}
                        <div
                          className={`max-w-[70%] rounded-lg px-3 py-2 ${
                            message.direction === 'outbound'
                              ? 'bg-emerald-600 text-white'
                              : 'bg-muted'
                          }`}
                        >
                          <p className="text-sm whitespace-pre-wrap">{message.body}</p>
                          <div className="flex items-center gap-1 mt-1">
                            <Clock className="w-3 h-3 opacity-60" />
                            <span className="text-xs opacity-60">
                              {format(new Date(message.created_at), 'HH:mm')}
                            </span>
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
                      placeholder="Type a WhatsApp reply..."
                      value={draft}
                      onChange={(event) => setDraft(event.target.value)}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter' && !event.shiftKey) {
                          event.preventDefault();
                          void sendReply();
                        }
                      }}
                      disabled={sending}
                      className="flex-1"
                    />
                    <Button onClick={() => void sendReply()} disabled={!draft.trim() || sending} size="sm">
                      <Send className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              </>
            ) : (
              <CardContent className="flex-1 flex items-center justify-center text-muted-foreground">
                Select a WhatsApp conversation
              </CardContent>
            )}
          </Card>
        </div>
      )}
    </div>
  );
}
