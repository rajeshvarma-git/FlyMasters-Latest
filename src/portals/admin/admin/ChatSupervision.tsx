import { useEffect, useState } from "react";
import { Eye, LogIn, ShieldAlert, Send } from "lucide-react";
import { api } from "@admin/lib/api";
import { Button } from "@admin/components/ui/Button";
import { Card } from "@admin/components/ui/Card";
import { Input, Select } from "@admin/components/ui/Field";

/**
 * CRM 2.7 — chat supervision.
 *
 * Reads all three chat stores (WhatsApp, telecaller, student–counsellor)
 * through one shape, so a manager reviewing a complaint does not have to know
 * which system the conversation landed in.
 *
 * Joining is recorded in the thread itself as a system message, and in the
 * supervision log below. Supervision here is visible, not covert — that is a
 * deliberate choice, and worth saying out loud to the client.
 */

type Conversation = {
  kind: string;
  id: string;
  student_id: string;
  student_name: string;
  staff_id: string;
  staff_role: string;
  last_message_at: string;
};

type Message = {
  id: string;
  sender_id: string;
  sender_role: string;
  body: string;
  created_at: string;
  is_system?: boolean;
};

type Event = { id: string; actor_name: string; action: string; note: string; created_at: string };

export default function ChatSupervision() {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [kind, setKind] = useState("");
  const [open, setOpen] = useState<Conversation | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [history, setHistory] = useState<Event[]>([]);
  const [reason, setReason] = useState("");
  const [draft, setDraft] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  useEffect(() => {
    api<{ conversations: Conversation[] }>(`/comms/supervision/conversations${kind ? `?kind=${kind}` : ""}`)
      .then((data) => setConversations(data.conversations))
      .catch((err) => setError(err instanceof Error ? err.message : "Could not load conversations"));
  }, [kind]);

  const view = async (conversation: Conversation) => {
    setOpen(conversation); setError(""); setNotice("");
    const data = await api<{ messages: Message[]; supervision_history: Event[] }>(
      `/comms/supervision/${conversation.kind}/${conversation.id}`);
    setMessages(data.messages);
    setHistory(data.supervision_history);
  };

  const join = async () => {
    if (!open) return;
    await api(`/comms/supervision/${open.kind}/${open.id}/join`, { method: "POST", body: { reason } });
    setNotice("You have joined. Both the student and the counsellor can see that a supervisor is in this conversation.");
    await view(open);
  };

  const send = async () => {
    if (!open || !draft.trim()) return;
    await api(`/comms/supervision/${open.kind}/${open.id}/message`, { method: "POST", body: { message: draft } });
    setDraft("");
    await view(open);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        <Eye className="h-5 w-5 text-sky-600" />
        <h1 className="text-xl font-semibold text-navy-900">Chat supervision</h1>
      </div>
      <p className="max-w-3xl text-sm text-slate-600">
        Every student–staff conversation on the platform, in one place. Opening one is logged; joining one is
        announced in the thread. Use it for escalation, quality review and disputes.
      </p>

      {error && <p className="text-sm text-rose-600">{error}</p>}
      {notice && <p className="text-sm text-emerald-700">{notice}</p>}

      <div className="grid gap-6 lg:grid-cols-[360px_1fr]">
        <Card className="p-5">
          <Select className="mb-3" value={kind} onChange={(e) => setKind(e.target.value)}>
            <option value="">All conversations</option>
            <option value="student">Student &amp; counsellor</option>
            <option value="whatsapp">WhatsApp</option>
            <option value="telecaller">Telecaller</option>
          </Select>
          <div className="max-h-[560px] space-y-2 overflow-y-auto">
            {conversations.map((conversation) => (
              <button key={`${conversation.kind}-${conversation.id}`} onClick={() => view(conversation)}
                className={`w-full rounded-xl border p-3 text-left transition ${
                  open?.id === conversation.id ? "border-sky-400 bg-sky-50" : "border-slate-100 hover:bg-slate-50"}`}>
                <p className="text-sm font-medium text-navy-900">{conversation.student_name || conversation.student_id || "Unknown student"}</p>
                <p className="mt-1 text-xs text-slate-500">
                  {conversation.kind} · {conversation.staff_role}
                  {conversation.last_message_at ? ` · ${new Date(conversation.last_message_at).toLocaleDateString()}` : ""}
                </p>
              </button>
            ))}
            {!conversations.length && <p className="text-sm text-slate-500">No conversations yet.</p>}
          </div>
        </Card>

        {open && (
          <div className="space-y-6">
            <Card className="p-5">
              <div className="mb-4 flex flex-wrap items-center gap-3">
                <h2 className="text-sm font-semibold text-navy-900">{messages.length} message{messages.length === 1 ? "" : "s"}</h2>
                <span className="flex-1" />
                <Input className="w-56" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Why are you joining?" />
                <Button size="sm" onClick={join}><LogIn className="h-3.5 w-3.5" /> Join</Button>
              </div>
              <div className="max-h-[420px] space-y-3 overflow-y-auto">
                {messages.map((message) => (
                  <div key={message.id} className={`rounded-xl p-3 text-sm ${
                    message.is_system ? "bg-amber-50 text-amber-900" : "bg-slate-50 text-slate-800"}`}>
                    <p className="mb-1 text-xs text-slate-500">
                      {message.sender_role || message.sender_id} · {message.created_at ? new Date(message.created_at).toLocaleString() : ""}
                    </p>
                    {message.body}
                  </div>
                ))}
                {!messages.length && <p className="text-sm text-slate-500">No messages in this conversation.</p>}
              </div>
              <div className="mt-4 flex gap-2">
                <Input value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="Write as a supervisor…" />
                <Button onClick={send}><Send className="h-4 w-4" /> Send</Button>
              </div>
            </Card>

            <Card className="p-5">
              <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold text-navy-900">
                <ShieldAlert className="h-4 w-4" /> Who has looked at this
              </h3>
              <div className="space-y-2">
                {history.map((event) => (
                  <p key={event.id} className="text-xs text-slate-600">
                    <span className="font-medium text-navy-900">{event.actor_name}</span> {event.action}
                    {event.note ? ` — ${event.note}` : ""} · {new Date(event.created_at).toLocaleString()}
                  </p>
                ))}
                {!history.length && <p className="text-xs text-slate-500">Nobody has opened this conversation before.</p>}
              </div>
            </Card>
          </div>
        )}
      </div>
    </div>
  );
}
