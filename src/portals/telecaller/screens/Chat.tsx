import { FormEvent, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { MessageCircle, Send } from "lucide-react";
import { useAuth } from "@telecaller/context/AuthContext";
import { api } from "@telecaller/lib/api";
import { refreshStore, useStore } from "@telecaller/lib/store";
import { displayName, hasStudentPortalAccount, initials } from "@telecaller/lib/utils";
import { Card } from "@telecaller/components/ui/Card";
import type { Conversation } from "@telecaller/lib/types";

function timeLabel(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hour12: false });
}

export default function Chat() {
  const { user } = useAuth();
  const store = useStore();
  const [params, setParams] = useSearchParams();
  const [selectedStudentId, setSelectedStudentId] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const chattable = useMemo(() => store.leads.filter((lead) => hasStudentPortalAccount(lead)), [store.leads]);

  const conversationByStudent = useMemo(() => {
    const map = new Map<string, Conversation>();
    for (const conversation of store.conversations) map.set(String(conversation.student_id), conversation);
    return map;
  }, [store.conversations]);

  const started = useMemo(
    () =>
      chattable
        .filter((lead) => conversationByStudent.has(String(lead.user_id)))
        .sort((a, b) => {
          const ca = conversationByStudent.get(String(a.user_id))?.last_message_at || "";
          const cb = conversationByStudent.get(String(b.user_id))?.last_message_at || "";
          return cb.localeCompare(ca);
        }),
    [chattable, conversationByStudent],
  );

  const notStarted = useMemo(
    () => chattable.filter((lead) => !conversationByStudent.has(String(lead.user_id))),
    [chattable, conversationByStudent],
  );

  const lastMessageFor = (studentId: string) => {
    const conversation = conversationByStudent.get(studentId);
    if (!conversation) return "";
    const mine = store.messages.filter((m) => m.conversation_id === conversation.id);
    return mine[mine.length - 1]?.message || "";
  };

  // A lead id in the URL (arriving from the queue or a lead's workspace) opens that lead's thread.
  useEffect(() => {
    const leadId = params.get("lead");
    if (!leadId) return;
    const lead = store.leads.find((row) => row.id === leadId);
    if (lead?.user_id) setSelectedStudentId(String(lead.user_id));
  }, [params, store.leads]);

  const selectedLead = chattable.find((lead) => String(lead.user_id) === selectedStudentId) || null;
  const conversation = selectedStudentId ? conversationByStudent.get(selectedStudentId) : undefined;
  const thread = conversation ? store.messages.filter((m) => m.conversation_id === conversation.id) : [];

  useEffect(() => {
    if (!conversation) return;
    const hasUnread = store.messages.some(
      (m) => m.conversation_id === conversation.id && String(m.receiver_id) === String(user?.id) && !m.is_read,
    );
    if (hasUnread) void api(`/telecaller/conversations/${conversation.id}/read`, { method: "POST" });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conversation?.id]);

  const selectLead = (studentId: string, leadId: string) => {
    setSelectedStudentId(studentId);
    setError("");
    setParams({ lead: leadId }, { replace: true });
  };

  const send = async (e: FormEvent) => {
    e.preventDefault();
    const message = draft.trim();
    if (!message || !selectedStudentId || busy) return;
    setBusy(true);
    setError("");
    try {
      const conv =
        conversation || (await api<Conversation>("/telecaller/conversations", { method: "POST", body: { studentId: selectedStudentId } }));
      await api("/telecaller/messages", { method: "POST", body: { conversationId: conv.id, message } });
      setDraft("");
      await refreshStore();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not send the message.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      <div className="mb-5 flex items-center gap-3">
        <MessageCircle className="h-6 w-6 shrink-0 text-sky-500" />
        <div>
          <h1 className="text-xl font-bold sm:text-2xl">Chat</h1>
          <p className="text-sm text-slate-600">Message leads who already have a student portal account.</p>
        </div>
      </div>

      <Card className="grid overflow-hidden md:h-[65vh] md:grid-cols-[260px_1fr]">
        <div className="max-h-64 overflow-y-auto border-b border-slate-100 md:max-h-none md:border-b-0 md:border-r">
          {started.map((lead) => {
            const studentId = String(lead.user_id);
            const conv = conversationByStudent.get(studentId);
            const unread = conv
              ? store.messages.some(
                  (m) => m.conversation_id === conv.id && String(m.receiver_id) === String(user?.id) && !m.is_read,
                )
              : false;
            return (
              <button
                key={lead.id}
                type="button"
                onClick={() => selectLead(studentId, lead.id)}
                className={`block w-full border-b border-slate-100 px-4 py-3 text-left transition last:border-b-0 hover:bg-slate-50 ${
                  selectedStudentId === studentId ? "bg-sky-50" : ""
                }`}
              >
                <span className="flex items-center justify-between gap-2">
                  <span className="truncate font-semibold">{displayName(lead.first_name, lead.last_name, lead.email)}</span>
                  {unread && <span className="h-2 w-2 shrink-0 rounded-full bg-sky-500" />}
                </span>
                <span className="block truncate text-sm text-slate-500">{lastMessageFor(studentId) || "No messages yet"}</span>
              </button>
            );
          })}

          {notStarted.length > 0 && (
            <p className="border-t border-slate-100 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
              Start a chat
            </p>
          )}
          {notStarted.map((lead) => (
            <button
              key={lead.id}
              type="button"
              onClick={() => selectLead(String(lead.user_id), lead.id)}
              className={`block w-full border-b border-slate-100 px-4 py-3 text-left transition last:border-b-0 hover:bg-slate-50 ${
                selectedStudentId === String(lead.user_id) ? "bg-sky-50" : ""
              }`}
            >
              <span className="truncate font-semibold text-slate-700">
                {displayName(lead.first_name, lead.last_name, lead.email)}
              </span>
            </button>
          ))}

          {chattable.length === 0 && (
            <p className="p-6 text-center text-sm text-slate-500">
              None of your leads have a student portal account yet.
            </p>
          )}
        </div>

        <div className="flex min-h-[24rem] flex-col md:min-h-0">
          {selectedLead ? (
            <>
              <div className="border-b border-slate-100 px-5 py-3">
                <p className="flex items-center gap-2 font-semibold">
                  <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-navy-900 text-xs font-bold text-white">
                    {initials(selectedLead.first_name, selectedLead.last_name, selectedLead.email)}
                  </span>
                  {displayName(selectedLead.first_name, selectedLead.last_name, selectedLead.email)}
                </p>
                <p className="text-xs text-sky-700">Student portal chat</p>
              </div>

              <div className="flex-1 space-y-3 overflow-y-auto px-5 py-4">
                {thread.map((m) => {
                  const mine = String(m.sender_id) === String(user?.id);
                  return (
                    <div key={m.id} className={`flex ${mine ? "justify-end" : "justify-start"}`}>
                      <div
                        className={`max-w-[75%] rounded-2xl px-4 py-2.5 text-sm ${
                          mine ? "bg-navy-950 text-white" : "bg-slate-100 text-slate-800"
                        }`}
                      >
                        <p className="whitespace-pre-wrap">{m.message}</p>
                        <p className={`mt-1 text-[11px] ${mine ? "text-slate-300" : "text-slate-400"}`}>
                          {timeLabel(m.created_at)}
                        </p>
                      </div>
                    </div>
                  );
                })}
                {thread.length === 0 && (
                  <p className="pt-8 text-center text-sm text-slate-400">
                    No messages yet. Say hello to start the conversation.
                  </p>
                )}
              </div>

              {error && <p className="px-5 pb-2 text-sm text-rose-600">{error}</p>}

              <form onSubmit={(e) => void send(e)} className="flex items-center gap-2 border-t border-slate-100 p-3">
                <input
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  placeholder={`Message ${displayName(selectedLead.first_name, selectedLead.last_name, selectedLead.email)}`}
                  className="flex-1 rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-100"
                />
                <button
                  type="submit"
                  disabled={busy || !draft.trim()}
                  className="inline-flex items-center gap-1.5 rounded-xl bg-navy-900 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-navy-800 disabled:opacity-50"
                >
                  <Send className="h-4 w-4" /> Send
                </button>
              </form>
            </>
          ) : (
            <p className="flex flex-1 items-center justify-center p-8 text-center text-sm text-slate-500">
              Pick a lead on the left to start messaging.
            </p>
          )}
        </div>
      </Card>
    </div>
  );
}
