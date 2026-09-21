import { useMemo, useState } from "react";
import { format } from "date-fns";
import { Link } from "react-router-dom";
import { MessageCircle } from "lucide-react";
import { useAuth } from "@admin/context/AuthContext";
import { useAdminStore } from "@admin/lib/store";
import { api } from "@admin/lib/api";
import { counselorLabel, displayName, telecallerLabel } from "@admin/lib/utils";
import { Card } from "@admin/components/ui/Card";
import { Button } from "@admin/components/ui/Button";
import type { Lead } from "@admin/lib/types";

function leadLabel(lead: Lead | null | undefined, phone?: string) {
  if (!lead) return phone ? `+${phone.slice(-10)}` : "Unknown contact";
  return displayName(lead.first_name, lead.last_name, lead.email || lead.phone || "Contact");
}

export default function WhatsAppChat() {
  const { user } = useAuth();
  const store = useAdminStore();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");

  const isAdmin = user?.role === "admin" || user?.role === "super_admin";
  const canReply = user?.role === "telecaller" || user?.role === "counselor";

  const conversations = useMemo(() => {
    const rows = [...store.whatsappConversations];
    if (user?.role === "telecaller") {
      return rows.filter(
        (row) => String(row.assigned_staff_id) === user.id && row.staff_role === "telecaller",
      );
    }
    if (user?.role === "counselor") {
      const counselor = store.counselors.find(
        (row) => row.auth_user_id === user.id || row.id === user.id,
      );
      const ids = new Set([counselor?.id, counselor?.auth_user_id, user.id].filter(Boolean).map(String));
      return rows.filter((row) => row.staff_role === "counselor" && ids.has(String(row.assigned_staff_id)));
    }
    return rows.sort((a, b) => String(b.last_message_at || "").localeCompare(String(a.last_message_at || "")));
  }, [store.whatsappConversations, store.counselors, user]);

  const selected =
    conversations.find((item) => item.id === selectedId) || conversations[0] || null;

  const messages = useMemo(
    () =>
      store.whatsappMessages
        .filter((item) => item.conversation_id === selected?.id)
        .sort((a, b) => String(a.created_at).localeCompare(String(b.created_at))),
    [store.whatsappMessages, selected?.id],
  );

  const lead = selected
    ? store.leads.find((row) => String(row.id) === String(selected.lead_id))
    : null;

  async function selectConversation(id: string) {
    setSelectedId(id);
    setError("");
    try {
      await api(`/whatsapp/conversations/${id}/read`, { method: "POST" });
    } catch {
      // Polling will sync read state.
    }
  }

  async function sendReply() {
    if (!selected || !draft.trim() || !canReply) return;
    setSending(true);
    setError("");
    try {
      await api("/whatsapp/messages", {
        method: "POST",
        body: { conversationId: selected.id, message: draft.trim() },
      });
      setDraft("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not send message");
    } finally {
      setSending(false);
    }
  }

  const staffLabel =
    selected?.staff_role === "counselor"
      ? counselorLabel(store.counselors, selected.assigned_staff_id)
      : selected?.staff_role === "telecaller"
        ? telecallerLabel(store.telecallers, selected.assigned_staff_id)
        : "Unassigned — assign telecaller or counselor";

  const assignUrl = lead
    ? lead.entity_type === "student" || lead.lead_status === "converted"
      ? `/students/${lead.id}`
      : `/leads/${lead.id}`
    : null;

  return (
    <div>
      <div className="mb-6 flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-100">
          <MessageCircle className="h-6 w-6 text-emerald-600" />
        </div>
        <div>
          <h1 className="text-2xl font-bold">WhatsApp</h1>
          <p className="text-slate-600">
            {isAdmin
              ? "Monitor only — assign a telecaller (leads) or counselor (students), then they reply from their portal."
              : "Your assigned WhatsApp threads — reply here and messages go to the student or lead on WhatsApp."}
          </p>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-[300px_1fr]">
        <Card className="max-h-[70vh] overflow-y-auto p-2">
          {conversations.map((item) => {
            const rowLead = store.leads.find((row) => String(row.id) === String(item.lead_id));
            const unread = store.whatsappMessages.some(
              (msg) =>
                msg.conversation_id === item.id && msg.direction === "inbound" && !msg.is_read,
            );
            const ownerLabel =
              item.staff_role === "telecaller"
                ? telecallerLabel(store.telecallers, item.assigned_staff_id)
                : item.staff_role === "counselor"
                  ? counselorLabel(store.counselors, item.assigned_staff_id)
                  : "Unassigned";
            return (
              <button
                key={item.id}
                className={`w-full rounded-xl px-3 py-2 text-left text-sm ${
                  selected?.id === item.id ? "bg-emerald-50" : "hover:bg-slate-50"
                }`}
                onClick={() => void selectConversation(item.id)}
              >
                <div className="flex items-center justify-between gap-2">
                  <p className="font-medium">{leadLabel(rowLead, item.phone_number)}</p>
                  {unread && <span className="h-2 w-2 shrink-0 rounded-full bg-emerald-500" />}
                </div>
                <p className="text-xs text-slate-500">+{item.phone_number?.slice(-10) || "—"}</p>
                <p className={`text-[10px] uppercase tracking-wide ${item.assigned_staff_id ? "text-emerald-700" : "text-rose-600"}`}>
                  {ownerLabel}
                </p>
              </button>
            );
          })}
          {conversations.length === 0 && (
            <p className="p-4 text-sm text-slate-500">
              No WhatsApp conversations yet. Messages appear when a lead or student replies on WhatsApp.
            </p>
          )}
        </Card>

        <Card className="flex max-h-[70vh] flex-col p-0">
          {!selected && (
            <p className="p-5 text-sm text-slate-500">Select a conversation to view messages.</p>
          )}
          {selected && (
            <>
              <div className="border-b border-slate-100 px-5 py-3">
                <p className="font-semibold">{leadLabel(lead, selected.phone_number)}</p>
                <p className="text-xs text-slate-500">
                  WhatsApp +{selected.phone_number?.slice(-10)} · {staffLabel}
                </p>
                {isAdmin && !selected.assigned_staff_id && assignUrl && (
                  <Link to={assignUrl} className="mt-2 inline-block text-xs font-semibold text-sky-600 hover:underline">
                    Assign telecaller or counselor →
                  </Link>
                )}
              </div>
              <div className="flex-1 overflow-y-auto p-5">
                {messages.length === 0 && (
                  <p className="text-sm text-slate-500">No messages in this thread yet.</p>
                )}
                {messages.map((item) => {
                  if (item.kind === "system" || item.staff_id === "system") return null;
                  const outbound = item.direction === "outbound";
                  const knownTelecaller = store.telecallers.some((row) => row.id === item.staff_id);
                  const sender =
                    outbound && item.staff_id
                      ? item.staff_id === user?.id
                        ? "You"
                        : knownTelecaller
                          ? telecallerLabel(store.telecallers, item.staff_id)
                          : counselorLabel(store.counselors, item.staff_id)
                      : "";
                  return (
                    <div
                      key={item.id}
                      className={`mb-3 max-w-[80%] rounded-2xl px-3 py-2 text-sm ${
                        outbound ? "ml-auto bg-emerald-600 text-white" : "bg-slate-100 text-slate-900"
                      }`}
                    >
                      {sender && outbound && (
                        <p className="mb-0.5 text-[10px] font-semibold text-emerald-100">{sender}</p>
                      )}
                      <p>{item.body}</p>
                      {item.created_at && (
                        <p className={`mt-1 text-[10px] ${outbound ? "text-emerald-100" : "text-slate-400"}`}>
                          {format(new Date(item.created_at), "PP p")}
                        </p>
                      )}
                    </div>
                  );
                })}
              </div>
              <div className="border-t border-slate-100 p-4">
                {isAdmin && (
                  <p className="mb-2 text-xs text-slate-500">
                    Admin view is read-only. The assigned telecaller or counselor sends replies.
                  </p>
                )}
                {error && <p className="mb-2 text-sm text-rose-600">{error}</p>}
                {canReply ? (
                  <div className="flex gap-2">
                    <input
                      className="flex-1 rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-emerald-500"
                      placeholder="Reply on WhatsApp…"
                      value={draft}
                      onChange={(event) => setDraft(event.target.value)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter" && !event.shiftKey) {
                          event.preventDefault();
                          void sendReply();
                        }
                      }}
                    />
                    <Button disabled={sending || !draft.trim()} onClick={() => void sendReply()}>
                      Send
                    </Button>
                  </div>
                ) : (
                  assignUrl && (
                    <Link to={assignUrl}>
                      <Button variant="secondary" size="sm">
                        Open profile to assign staff
                      </Button>
                    </Link>
                  )
                )}
              </div>
            </>
          )}
        </Card>
      </div>
    </div>
  );
}
