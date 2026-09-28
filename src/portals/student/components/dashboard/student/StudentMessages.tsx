import { Users } from 'lucide-react';
import { StudentUnifiedChat } from './StudentUnifiedChat';

/**
 * One place for every conversation a student has with Fly Masters: AI
 * advisor, counselor, telecaller and WhatsApp in a single timeline
 * (StudentUnifiedChat). No tabs — the AI advisor's guided questions open
 * inline at the top of the same screen, and everything it says lands in the
 * same timeline as the team's messages.
 *
 * defaultTab is still accepted so old routes/links (/student/chat,
 * /student/telecaller-chat, ?tab=counsellor) keep compiling and landing
 * here; it no longer changes anything.
 */
interface StudentMessagesProps {
  defaultTab?: string;
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function StudentMessages(_props: StudentMessagesProps = {}) {
  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-full bg-gradient-primary flex items-center justify-center">
          <Users className="w-5 h-5 text-white" />
        </div>
        <div>
          <h1 className="text-2xl font-bold">Messages</h1>
          <p className="text-muted-foreground">AI advisor, your counselor, telecaller and WhatsApp — one conversation</p>
        </div>
      </div>

      <StudentUnifiedChat embedded />
    </div>
  );
}
