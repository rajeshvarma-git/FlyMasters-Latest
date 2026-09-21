import React, { useEffect, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@student/components/ui/card';
import { Badge } from '@student/components/ui/badge';
import { Button } from '@student/components/ui/button';
import { ScrollArea } from '@student/components/ui/scroll-area';
import { supabase } from '@student/integrations/supabase/client';
import { useChatSound } from '@student/hooks/useChatSound';
import { MessageSquare, User, Clock } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

interface ActiveChat {
  id: string;
  student_name: string;
  student_email: string;
  chat_type: 'ai' | 'manual';
  started_at: string;
  assigned_agent_id?: string;
  message_count?: number;
}

const LiveChatMonitor: React.FC = () => {
  const [activeChats, setActiveChats] = useState<ActiveChat[]>([]);
  const { playNotification } = useChatSound();
  const navigate = useNavigate();

  useEffect(() => {
    fetchActiveChats();

    // Subscribe to new conversations
    const channel = supabase
      .channel('chat_conversations_changes')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'chat_conversations'
        },
        (payload) => {
          playNotification();
          fetchActiveChats();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const fetchActiveChats = async () => {
    const { data, error } = await supabase
      .from('chat_conversations')
      .select(`
        id,
        student_name,
        student_email,
        chat_type,
        started_at,
        assigned_agent_id
      `)
      .eq('is_active', true)
      .order('started_at', { ascending: false });

    if (!error && data) {
      setActiveChats(data as ActiveChat[]);
    }
  };

  const assignCounselor = async (chatId: string) => {
    // Navigate to assignment page or open modal
    navigate(`/dashboard?assign=${chatId}`);
  };

  const getElapsedTime = (startedAt: string) => {
    const start = new Date(startedAt);
    const now = new Date();
    const diff = Math.floor((now.getTime() - start.getTime()) / 1000 / 60);
    return `${diff}m ago`;
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle>Live Chat Monitor</CardTitle>
            <CardDescription>Active conversations happening right now</CardDescription>
          </div>
          <Badge variant="secondary" className="text-lg">
            {activeChats.length} Active
          </Badge>
        </div>
      </CardHeader>
      <CardContent>
        <ScrollArea className="h-[500px]">
          <div className="space-y-3">
            {activeChats.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">
                <MessageSquare className="w-12 h-12 mx-auto mb-3 opacity-50" />
                <p>No active chats at the moment</p>
              </div>
            ) : (
              activeChats.map((chat) => (
                <div
                  key={chat.id}
                  className="flex items-center gap-4 p-4 bg-muted/50 rounded-lg border hover:border-primary transition-all"
                >
                  <div className="w-10 h-10 rounded-full bg-gradient-primary flex items-center justify-center">
                    <User className="w-5 h-5 text-white" />
                  </div>
                  
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <p className="font-medium">{chat.student_name || 'Anonymous'}</p>
                      <Badge variant={chat.chat_type === 'ai' ? 'default' : 'secondary'}>
                        {chat.chat_type === 'ai' ? 'AI Chat' : 'Manual'}
                      </Badge>
                    </div>
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <Clock className="w-3 h-3" />
                      <span>{getElapsedTime(chat.started_at)}</span>
                      {chat.student_email && (
                        <>
                          <span>•</span>
                          <span>{chat.student_email}</span>
                        </>
                      )}
                    </div>
                  </div>

                  {!chat.assigned_agent_id && chat.chat_type === 'manual' && (
                    <Button
                      size="sm"
                      onClick={() => assignCounselor(chat.id)}
                    >
                      Assign
                    </Button>
                  )}
                </div>
              ))
            )}
          </div>
        </ScrollArea>
      </CardContent>
    </Card>
  );
};

export default LiveChatMonitor;