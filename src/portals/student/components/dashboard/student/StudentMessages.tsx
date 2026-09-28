import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Bot, MessageCircle, Phone } from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@student/components/ui/tabs';
import ErrorBoundary from '@student/components/ErrorBoundary';
import ChatInterface from '@student/components/ChatInterface';
import { StudentPrivateChat } from './StudentPrivateChat';
import { StudentTelecallerChat } from './StudentTelecallerChat';

/**
 * One place for every conversation a student has with Fly Masters: the AI
 * advisor, their counselor, and their telecaller. Each channel still talks
 * to its own conversation store under the hood (chat_sessions,
 * private_conversations, telecaller_conversations) — merging those into one
 * thread is bigger, riskier work tracked separately. This screen is the MVP
 * version of "one chat": one page, one set of tabs, nothing to hunt for.
 */
type MessageTab = 'ai' | 'counsellor' | 'telecaller';

const TAB_VALUES: MessageTab[] = ['ai', 'counsellor', 'telecaller'];

interface StudentMessagesProps {
  defaultTab?: MessageTab;
}

export function StudentMessages({ defaultTab = 'ai' }: StudentMessagesProps) {
  const [params, setParams] = useSearchParams();
  const fromUrl = params.get('tab') as MessageTab | null;
  const [tab, setTab] = useState<MessageTab>(fromUrl && TAB_VALUES.includes(fromUrl) ? fromUrl : defaultTab);

  useEffect(() => {
    if (fromUrl && TAB_VALUES.includes(fromUrl) && fromUrl !== tab) {
      setTab(fromUrl);
    }
    // Only react to the URL changing (e.g. a sidebar link with ?tab=), not to our own setTab calls.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fromUrl]);

  const selectTab = (value: string) => {
    const next = value as MessageTab;
    setTab(next);
    setParams(next === 'ai' ? {} : { tab: next }, { replace: true });
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-full bg-gradient-primary flex items-center justify-center">
          <MessageCircle className="w-5 h-5 text-white" />
        </div>
        <div>
          <h1 className="text-2xl font-bold">Messages</h1>
          <p className="text-muted-foreground">Everyone helping with your application, in one place</p>
        </div>
      </div>

      <Tabs value={tab} onValueChange={selectTab}>
        <TabsList className="grid w-full grid-cols-3 max-w-xl">
          <TabsTrigger value="ai" className="gap-2">
            <Bot className="w-4 h-4" />
            <span className="hidden sm:inline">AI Advisor</span>
            <span className="sm:hidden">AI</span>
          </TabsTrigger>
          <TabsTrigger value="counsellor" className="gap-2">
            <MessageCircle className="w-4 h-4" />
            <span className="hidden sm:inline">Counselor</span>
            <span className="sm:hidden">Counselor</span>
          </TabsTrigger>
          <TabsTrigger value="telecaller" className="gap-2">
            <Phone className="w-4 h-4" />
            <span className="hidden sm:inline">Telecaller</span>
            <span className="sm:hidden">Telecaller</span>
          </TabsTrigger>
        </TabsList>

        <TabsContent value="ai" className="mt-4">
          <ErrorBoundary>
            <ChatInterface />
          </ErrorBoundary>
        </TabsContent>

        <TabsContent value="counsellor" className="mt-4">
          <StudentPrivateChat />
        </TabsContent>

        <TabsContent value="telecaller" className="mt-4">
          <StudentTelecallerChat />
        </TabsContent>
      </Tabs>
    </div>
  );
}
