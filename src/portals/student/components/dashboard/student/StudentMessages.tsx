import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Bot, Users } from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@student/components/ui/tabs';
import ErrorBoundary from '@student/components/ErrorBoundary';
import ChatInterface from '@student/components/ChatInterface';
import { StudentUnifiedChat } from './StudentUnifiedChat';

/**
 * One place for every conversation a student has with Fly Masters. The
 * counselor and telecaller channels are merged into a single "Team" thread
 * (StudentUnifiedChat) — one timeline, one input box, tagged by who sent
 * each message, instead of two look-alike tabs a student had to hunt
 * between. The AI Advisor stays a separate tab: it's a guided stepper, not
 * freeform chat, and (see StudentUnifiedChat's header comment) has no
 * persisted message-by-message transcript to merge in yet.
 *
 * 'counsellor' and 'telecaller' are kept as accepted URL/defaultTab values
 * and silently mapped to 'team' below, so old links (?tab=counsellor, the
 * /student/chat and /student/telecaller-chat routes) still land on the
 * right tab instead of 404ing or falling back to AI.
 */
type MessageTab = 'ai' | 'team';
type LegacyTab = MessageTab | 'counsellor' | 'telecaller';

const TAB_VALUES: MessageTab[] = ['ai', 'team'];

function normalizeTab(value: LegacyTab | null): MessageTab | null {
  if (value === 'counsellor' || value === 'telecaller') return 'team';
  if (value === 'ai' || value === 'team') return value;
  return null;
}

interface StudentMessagesProps {
  defaultTab?: LegacyTab;
}

export function StudentMessages({ defaultTab = 'ai' }: StudentMessagesProps) {
  const [params, setParams] = useSearchParams();
  const fromUrl = normalizeTab(params.get('tab') as LegacyTab | null);
  const [tab, setTab] = useState<MessageTab>(fromUrl || normalizeTab(defaultTab) || 'ai');

  useEffect(() => {
    if (fromUrl && fromUrl !== tab) {
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
          <Users className="w-5 h-5 text-white" />
        </div>
        <div>
          <h1 className="text-2xl font-bold">Messages</h1>
          <p className="text-muted-foreground">Everyone helping with your application, in one place</p>
        </div>
      </div>

      <Tabs value={tab} onValueChange={selectTab}>
        <TabsList className="grid w-full grid-cols-2 max-w-sm">
          <TabsTrigger value="ai" className="gap-2">
            <Bot className="w-4 h-4" />
            <span className="hidden sm:inline">AI Advisor</span>
            <span className="sm:hidden">AI</span>
          </TabsTrigger>
          <TabsTrigger value="team" className="gap-2">
            <Users className="w-4 h-4" />
            <span>Team Chat</span>
          </TabsTrigger>
        </TabsList>

        <TabsContent value="ai" className="mt-4">
          <ErrorBoundary>
            <ChatInterface />
          </ErrorBoundary>
        </TabsContent>

        <TabsContent value="team" className="mt-4">
          <StudentUnifiedChat embedded />
        </TabsContent>
      </Tabs>
    </div>
  );
}
