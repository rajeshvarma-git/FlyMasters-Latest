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
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground md:hidden">Your AI advisor, telecaller and counselor — all in one chat</p>
      <StudentCaseChat />
    </div>
  );
}
