import { Users } from 'lucide-react';
import { StudentCaseChat } from './StudentCaseChat';

/**
 * The student's one conversation with Fly Masters (StudentCaseChat): the AI
 * advisor answers first, then the assigned telecaller, then the counselor —
 * same thread, same history, one input box.
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
          <p className="text-muted-foreground">Your AI advisor, telecaller and counselor — all in one chat</p>
        </div>
      </div>

      <StudentCaseChat />
    </div>
  );
}
