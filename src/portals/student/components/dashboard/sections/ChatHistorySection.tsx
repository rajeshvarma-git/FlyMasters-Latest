import { useState, useEffect } from 'react';
import { useAuth } from '@student/hooks/useAuth';
import { supabase } from '@student/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@student/components/ui/card';
import { Button } from '@student/components/ui/button';
import { Badge } from '@student/components/ui/badge';
import { MessageCircle, Calendar, User, Bot, ExternalLink, Trash2 } from 'lucide-react';
import { useToast } from '@student/hooks/use-toast';
import { Tables } from '@student/integrations/supabase/types';

type ChatSession = Tables<'chat_sessions'>;
type ChatMessage = Tables<'chat_messages'>;

interface ChatSessionWithMessages extends ChatSession {
  messages: ChatMessage[];
  message_count: number;
}

export function ChatHistorySection() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [sessions, setSessions] = useState<ChatSessionWithMessages[]>([]);
  const [expandedSession, setExpandedSession] = useState<string | null>(null);

  useEffect(() => {
    if (user) {
      fetchChatSessions();
    }
  }, [user]);

  const fetchChatSessions = async () => {
    try {
      setLoading(true);

      // First, get chat sessions for the user
      const { data: sessionsData, error: sessionsError } = await supabase
        .from('chat_sessions')
        .select('*')
        .eq('user_id', user?.id)
        .order('updated_at', { ascending: false });

      if (sessionsError) throw sessionsError;

      // Then get message counts for each session
      const sessionsWithMessages: ChatSessionWithMessages[] = [];
      
      for (const session of sessionsData || []) {
        const { data: messagesData, error: messagesError } = await supabase
          .from('chat_messages')
          .select('*')
          .eq('session_id', session.id)
          .order('created_at', { ascending: true });

        if (messagesError) {
          console.error('Error fetching messages:', messagesError);
          continue;
        }

        sessionsWithMessages.push({
          ...session,
          messages: messagesData || [],
          message_count: messagesData?.length || 0,
        });
      }

      setSessions(sessionsWithMessages);
    } catch (error: any) {
      console.error('Error fetching chat sessions:', error);
      toast({
        title: "Error",
        description: "Failed to load your chat history.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const deleteSession = async (sessionId: string) => {
    try {
      const { error } = await supabase
        .from('chat_sessions')
        .delete()
        .eq('id', sessionId)
        .eq('user_id', user?.id);

      if (error) throw error;

      setSessions(prev => prev.filter(session => session.id !== sessionId));
      
      toast({
        title: "Session deleted",
        description: "Chat session has been removed from your history.",
      });
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    }
  };

  const getStageLabel = (stage: number) => {
    const stages = [
      'Started',
      'Country Selected',
      'Qualification Added',
      'Field Selected', 
      'Academic Score',
      'Budget Set',
      'Contact Details',
      'OTP Verified',
      'Completed'
    ];
    return stages[stage - 1] || `Stage ${stage}`;
  };

  const getConversationSummary = (conversationData: any) => {
    if (!conversationData || typeof conversationData !== 'object') return 'No data available';
    
    const data = conversationData;
    const parts = [];
    
    if (data.country) parts.push(`Country: ${data.country}`);
    if (data.qualification) parts.push(`Qualification: ${data.qualification}`);
    if (data.field) parts.push(`Field: ${data.field}`);
    if (data.budget) parts.push(`Budget: $${data.budget}`);
    
    return parts.length > 0 ? parts.join(' • ') : 'Conversation in progress';
  };

  const toggleExpanded = (sessionId: string) => {
    setExpandedSession(expandedSession === sessionId ? null : sessionId);
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-full bg-gradient-primary flex items-center justify-center">
            <MessageCircle className="w-6 h-6 text-white" />
          </div>
          <div>
            <h1 className="text-3xl font-bold">Chat History</h1>
            <p className="text-muted-foreground">Your AI chat conversations</p>
          </div>
        </div>

        <div className="space-y-4">
          {[...Array(3)].map((_, i) => (
            <Card key={i} className="glass-card animate-pulse">
              <CardContent className="p-6">
                <div className="h-6 bg-muted/20 rounded w-1/3 mb-2"></div>
                <div className="h-4 bg-muted/20 rounded w-2/3 mb-4"></div>
                <div className="flex gap-2">
                  <div className="h-6 bg-muted/20 rounded w-20"></div>
                  <div className="h-6 bg-muted/20 rounded w-20"></div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <div className="w-12 h-12 rounded-full bg-gradient-primary flex items-center justify-center">
          <MessageCircle className="w-6 h-6 text-white" />
        </div>
        <div>
          <h1 className="text-3xl font-bold">Chat History</h1>
          <p className="text-muted-foreground">
            {sessions.length > 0 
              ? `${sessions.length} chat sessions found`
              : "No chat sessions yet"
            }
          </p>
        </div>
      </div>

      {sessions.length === 0 ? (
        <Card className="glass-card">
          <CardContent className="p-12 text-center">
            <MessageCircle className="w-16 h-16 text-muted-foreground mx-auto mb-4" />
            <h3 className="text-xl font-semibold mb-2">No Chat History</h3>
            <p className="text-muted-foreground mb-6">
              Start a conversation with our AI to get personalized university recommendations.
            </p>
            <Button asChild>
              <a href="/chat">
                <MessageCircle className="w-4 h-4 mr-2" />
                Start Chat
              </a>
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {sessions.map((session) => (
            <Card key={session.id} className="glass-card">
              <CardHeader className="pb-4">
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-2">
                      <CardTitle className="text-lg">
                        Chat Session #{session.session_id.slice(-8)}
                      </CardTitle>
                      
                      <Badge variant={session.is_completed ? 'default' : 'secondary'}>
                        {getStageLabel(session.current_stage)}
                      </Badge>
                      
                      {session.is_completed && (
                        <Badge className="bg-green-100 text-green-800">Completed</Badge>
                      )}
                    </div>
                    
                    <CardDescription>
                      {getConversationSummary(session.conversation_data)}
                    </CardDescription>
                    
                    <div className="flex items-center gap-4 mt-2 text-sm text-muted-foreground">
                      <div className="flex items-center gap-1">
                        <Calendar className="w-4 h-4" />
                        <span>{new Date(session.updated_at).toLocaleDateString()}</span>
                      </div>
                      
                      <div className="flex items-center gap-1">
                        <MessageCircle className="w-4 h-4" />
                        <span>{session.message_count} messages</span>
                      </div>
                    </div>
                  </div>

                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => toggleExpanded(session.id)}
                    >
                      {expandedSession === session.id ? 'Hide' : 'View'} Messages
                    </Button>
                    
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => deleteSession(session.id)}
                      className="text-red-600 hover:text-red-700"
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              </CardHeader>

              {expandedSession === session.id && (
                <CardContent className="pt-0">
                  <div className="border-t border-border/20 pt-4">
                    <h4 className="font-medium mb-3">Conversation Messages</h4>
                    
                    <div className="space-y-3 max-h-96 overflow-y-auto">
                      {session.messages.map((message) => (
                        <div
                          key={message.id}
                          className={`flex gap-3 ${message.message_type === 'user' ? 'flex-row-reverse' : ''}`}
                        >
                          <div className={`w-8 h-8 rounded-full flex items-center justify-center ${
                            message.message_type === 'user' 
                              ? 'bg-primary/10 text-primary' 
                              : 'bg-muted'
                          }`}>
                            {message.message_type === 'user' ? (
                              <User className="w-4 h-4" />
                            ) : (
                              <Bot className="w-4 h-4" />
                            )}
                          </div>
                          
                          <div className={`flex-1 max-w-xs ${
                            message.message_type === 'user' ? 'text-right' : ''
                          }`}>
                            <div className={`p-3 rounded-lg text-sm ${
                              message.message_type === 'user'
                                ? 'bg-primary text-primary-foreground ml-auto'
                                : 'bg-muted'
                            }`}>
                              {message.content}
                            </div>
                            <div className="text-xs text-muted-foreground mt-1">
                              {new Date(message.created_at).toLocaleTimeString()}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>

                    {!session.is_completed && (
                      <div className="mt-4 p-3 bg-muted/50 rounded-lg">
                        <div className="flex items-center gap-2 text-sm">
                          <ExternalLink className="w-4 h-4" />
                          <span>Continue this conversation</span>
                        </div>
                        <Button size="sm" className="mt-2" asChild>
                          <a href={`/chat?session=${session.session_id}`}>Resume Chat</a>
                        </Button>
                      </div>
                    )}
                  </div>
                </CardContent>
              )}
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}