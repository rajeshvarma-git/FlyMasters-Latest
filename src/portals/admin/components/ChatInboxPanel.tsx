import type { ReactNode } from "react";
import { format } from "date-fns";
import { Link } from "react-router-dom";
import { Card } from "@admin/components/ui/Card";

export interface InboxThread {
  id: string;
  title: string;
  subtitle?: string;
  preview?: string;
  lastAt?: string | null;
  unread?: boolean;
}

export interface InboxMessage {
  id: string;
  text: string;
  outbound: boolean;
  createdAt?: string;
  system?: boolean;
}

function whenLabel(value?: string | null) {
  if (!value) return "";
  const ms = Date.now() - new Date(value).getTime();
  if (Number.isNaN(ms) || ms < 0) return "";
  const days = Math.floor(ms / 86400000);
  if (days === 0) return "Today";
  if (days === 1) return "Yesterday";
  return `${days} days ago`;
}

interface ChatInboxPanelProps {
  threads: InboxThread[];
  getMessages: (threadId: string) => InboxMessage[];
  selectedId: string | null;
  onSelect: (threadId: string) => void;
  emptyListMessage: string;
  emptyThreadMessage?: string;
  footerNote?: string;
  profileHref?: string;
  profileLabel?: string;
  headerNote?: string;
  headerExtra?: ReactNode;
  variant?: "sky" | "emerald" | "counselor";
}

export default function ChatInboxPanel({
  threads,
  getMessages,
  selectedId,
  onSelect,
  emptyListMessage,
  emptyThreadMessage = "No messages in this thread yet.",
  footerNote,
  profileHref,
  profileLabel = "View profile",
  headerNote,
  headerExtra,
  variant = "sky",
}: ChatInboxPanelProps) {
  const activeId = selectedId && threads.some((row) => row.id === selectedId) ? selectedId : threads[0]?.id || null;
  const active = threads.find((row) => row.id === activeId) || null;
  const messages = activeId ? getMessages(activeId) : [];
  const activeClass =
    variant === "emerald" ? "bg-emerald-50" : "bg-sky-50";
  const outboundClass =
    variant === "counselor"
      ? "bg-navy-900 text-white"
      : variant === "emerald"
        ? "bg-emerald-600 text-white"
        : "bg-sky-600 text-white";

  if (threads.length === 0) {
    return <Card className="p-8 text-center text-sm text-slate-500">{emptyListMessage}</Card>;
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[280px_1fr]">
      {headerNote && (
        <Card className={`col-span-full border p-4 text-xs text-slate-700 ${variant === "emerald" ? "border-emerald-100 bg-emerald-50" : "border-sky-100 bg-sky-50"}`}>
          {headerNote}
        </Card>
      )}

      <Card className="max-h-[62vh] overflow-y-auto p-2">
        {threads.map((thread) => (
          <button
            key={thread.id}
            type="button"
            onClick={() => onSelect(thread.id)}
            className={`mb-1 w-full rounded-xl px-3 py-2.5 text-left text-sm ${
              activeId === thread.id ? activeClass : "hover:bg-slate-50"
            }`}
          >
            <div className="flex items-center justify-between gap-2">
              <p className="font-semibold">{thread.title}</p>
              {thread.unread && <span className="h-2 w-2 shrink-0 rounded-full bg-emerald-500" />}
            </div>
            {thread.subtitle && <p className="text-xs text-slate-500">{thread.subtitle}</p>}
            {thread.preview && <p className="truncate text-xs text-slate-500">{thread.preview}</p>}
            {thread.lastAt && <p className="text-[11px] text-slate-400">{whenLabel(thread.lastAt)}</p>}
          </button>
        ))}
      </Card>

      <Card className="flex max-h-[62vh] flex-col overflow-hidden">
        {active && (
          <>
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 p-4">
              <div>
                <p className="font-semibold">{active.title}</p>
                {active.subtitle && <p className="text-xs text-slate-500">{active.subtitle}</p>}
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {headerExtra}
                {profileHref && (
                  <Link to={profileHref} className="text-xs font-semibold text-sky-600 hover:underline">
                    {profileLabel}
                  </Link>
                )}
              </div>
            </div>

            <div className="flex flex-1 flex-col gap-3 overflow-y-auto bg-slate-50 p-4">
              {messages.length === 0 && (
                <p className="py-10 text-center text-sm text-slate-500">{emptyThreadMessage}</p>
              )}
              {messages.map((msg) => {
                if (msg.system) {
                  return (
                    <p key={msg.id} className="text-center text-[11px] text-slate-400">
                      {msg.text}
                    </p>
                  );
                }
                return (
                  <div
                    key={msg.id}
                    className={`max-w-[76%] rounded-2xl px-3.5 py-2.5 text-sm ${
                      msg.outbound
                        ? `self-end rounded-br-sm ${outboundClass}`
                        : "self-start rounded-bl-sm border border-slate-200 bg-white"
                    }`}
                  >
                    <p>{msg.text}</p>
                    {msg.createdAt && (
                      <p className={`mt-1 text-[11px] ${msg.outbound ? "text-white/60" : "text-slate-400"}`}>
                        {format(new Date(msg.createdAt), "PP p")}
                      </p>
                    )}
                  </div>
                );
              })}
            </div>

            {footerNote && (
              <p className="border-t border-slate-200 bg-white p-3 text-xs text-slate-500">{footerNote}</p>
            )}
          </>
        )}
      </Card>
    </div>
  );
}
