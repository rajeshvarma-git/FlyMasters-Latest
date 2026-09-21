import React from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@student/components/ui/tabs';
import ChatQuestionsManager from './ChatQuestionsManager';
import LiveChatMonitor from './LiveChatMonitor';
import { MessageSquare, Settings, Users } from 'lucide-react';

const ChatManagementTab: React.FC = () => {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-3xl font-bold mb-2">Chat Management</h2>
        <p className="text-muted-foreground">
          Configure chat questions, monitor live conversations, and manage counselor assignments
        </p>
      </div>

      <Tabs defaultValue="monitor" className="w-full">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="monitor" className="flex items-center gap-2">
            <MessageSquare className="w-4 h-4" />
            Live Monitor
          </TabsTrigger>
          <TabsTrigger value="questions" className="flex items-center gap-2">
            <Settings className="w-4 h-4" />
            Questions
          </TabsTrigger>
          <TabsTrigger value="agents" className="flex items-center gap-2">
            <Users className="w-4 h-4" />
            Agents
          </TabsTrigger>
        </TabsList>

        <TabsContent value="monitor" className="mt-6">
          <LiveChatMonitor />
        </TabsContent>

        <TabsContent value="questions" className="mt-6">
          <ChatQuestionsManager />
        </TabsContent>

        <TabsContent value="agents" className="mt-6">
          <div className="text-center py-12">
            <Users className="w-16 h-16 mx-auto mb-4 text-muted-foreground" />
            <h3 className="text-xl font-semibold mb-2">Agent Management</h3>
            <p className="text-muted-foreground">
              Counselor assignment and availability management coming soon
            </p>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default ChatManagementTab;