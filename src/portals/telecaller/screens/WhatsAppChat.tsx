import { FormEvent, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { MessageCircle, Send } from "lucide-react";
import { api } from "@telecaller/lib/api";
import { refreshStore, useStore } from "@telecaller/lib/store";
import {
  displayName,
  hasSendableWhatsAppNumber,
  initials,
  isConvertedStudent,
  isSystemWhatsAppMessage,
  isWhatsAppWindowOpen,
  leadPhone,
  samePhone,
} from "@telecaller/lib/utils";
import { Card } from "@telecaller/components/ui/Card";
import type { Lead, WhatsAppConversation, WhatsAppMessage } from "@telecaller/lib/types";

function timeLabel(value?: string) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hour12: false });
}

function phoneLabel(value?: string) {
  const digits = String(value || "").replace(/\D/g, "");
  if (digits.length >= 10) return `+${digits.slice(-12, -10) === "91" ? "91 " : ""}${digits.slice(-10)}`;
  return value || "No number";
}

type InboxRow = {
  key: string;
  lead: Lead | null;
  conversation: WhatsAppConversation | null;
};

function extractSentMessage(result: unknown): WhatsAppMessage | null {
  if (!result || typeof result !== "object") return null;
  const body = result as WhatsAppMessage & { message?: WhatsAppMessage };
  if (body.message?.id) return body.message;
  if (body.id) return body;
  return null;
}

function isMissingSendRoute(message: string) {
  return /API route not found|Conversation and message are required|Conversation not found/i.test(message);
}

async function postWhatsAppMessage(
  lead: Lead,
  conversation: WhatsAppConversation | null,
  message: string,
) {
  try {
    const result = await api<unknown>("/whatsapp/messages", {
      method: "POST",
      body: {
        message,
        leadId: lead.id,
        conversationId: conversation?.id,
        phone: leadPhone(lead),
      },
    });
    return extractSentMessage(result);
  } catch (first) {
    const firstMsg = first instanceof Error ? first.message : "";
    try {
      const result = await api<unknown>("/telecaller/whatsapp/messages", {
        method: "POST",
        body: { leadId: lead.id, message },
      });
      return extractSentMessage(result);
    } catch (second) {
      if (isMissingSendRoute(firstMsg) && /API route not found/i.test(second instanceof Error ? second.message : "")) {
        throw new Error(
          "WhatsApp send is not available on the live API yet. Redeploy the Fly Masters admin portal so telecallers can start this chat.",
        );
      }
      throw second instanceof Error ? second : first;
    }
  }
}

function conversationForLead(conversations: WhatsAppConversation[], lead: Lead) {
  return (
    conversations.find((row) => String(row.lead_id) === String(lead.id)) ||
    conversations.find((row) => samePhone(row.phone_number, leadPhone(lead))) ||
    null
  );
}

function buildInbox(leads: Lead[], conversations: WhatsAppConversation[]): InboxRow[] {
  const open = leads.filter((lead) => !isConvertedStudent(lead));
  const used = new Set<string>();
  const rows: InboxRow[] = [];

  for (const lead of open) {
    const conversation = conversationForLead(conversations, lead);
    if (conversation) used.add(String(conversation.id));
    if (!conversation && !leadPhone(lead)) continue;
    rows.push({
      key: conversation?.id || `lead:${lead.id}`,
      lead,
      conversation,
    });
  }

  for (const conversation of conversations) {
    if (used.has(String(conversation.id))) continue;
    rows.push({
      key: conversation.id,
      lead: open.find((lead) => String(lead.id) === String(conversation.lead_id)) || null,
      conversation,
    });
  }

  return rows.sort((a, b) =>
    String(b.conversation?.last_message_at || b.lead?.last_contact_date || b.lead?.created_at || "").localeCompare(
      String(a.conversation?.last_message_at || a.lead?.last_contact_date || a.lead?.created_at || ""),
    ),
  );
}

export default function WhatsAppChat() {
  const store = useStore();
  const [params, setParams] = useSearchParams();
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [liveMessages, setLiveMessages] = useState<WhatsAppMessage[]>([]);

  const inbox = useMemo(
    () => buildInbox(store.leads, store.whatsappConversations),
    [store.leads, store.whatsappConversations],
  );

  useEffect(() => {
    const leadId = params.get("lead");
    if (!leadId) return;
    const match = inbox.find((row) => String(row.lead?.id) === leadId);
    if (match) setSelectedKey(match.key);
  }, [params, inbox]);

  const selected = inbox.find((row) => row.key === selectedKey) || inbox[0] || null;
  const selectedLead = selected?.lead || null;
  const selectedConversation = selected?.conversation || null;

  const thread = useMemo(() => {
    const fromStore = selectedConversation
      ? store.whatsappMessages.filter((row) => row.conversation_id === selectedConversation.id)
      : [];
    const merged = new Map<string, WhatsAppMessage>();
    for (const row of [...fromStore, ...liveMessages]) merged.set(String(row.id), row);
    return [...merged.values()]
      .filter((row) => !isSystemWhatsAppMessage(row))
      .sort((a, b) => String(a.created_at).localeCompare(String(b.created_at)));
  }, [store.whatsappMessages, liveMessages, selectedConversation]);

  const windowOpen = isWhatsAppWindowOpen(thread);
  const title = selectedLead
    ? displayName(selectedLead.first_name, selectedLead.last_name, selectedLead.email)
    : selectedConversation
      ? phoneLabel(selectedConversation.phone_number)
      : "";
  const number = selectedConversation?.phone_number || leadPhone(selectedLead || {});

  useEffect(() => {
    if (!selectedConversation?.id) {
      setLiveMessages([]);
      return;
    }
    let cancelled = false;
    const load = async () => {
      try {
        const raw = await api<unknown>(`/whatsapp/conversations/${selectedConversation.id}/messages`);
        const list = Array.isArray(raw)
          ? (raw as WhatsAppMessage[])
          : ((raw as { messages?: WhatsAppMessage[] }).messages || []);
        if (!cancelled) setLiveMessages(list);
        const hasUnread = list.some(
          (row) => row.direction === "inbound" && !row.is_read && !isSystemWhatsAppMessage(row),
        );
        if (hasUnread) {
          await api(`/whatsapp/conversations/${selectedConversation.id}/read`, { method: "POST" });
        }
      } catch {
        if (!cancelled) setLiveMessages([]);
      }
    };
    void load();
    const timer = window.setInterval(() => void load(), 5000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [selectedConversation?.id]);

  const selectRow = (row: InboxRow) => {
    setSelectedKey(row.key);
    setError("");
    if (row.lead?.id) setParams({ lead: row.lead.id }, { replace: true });
  };

  const lastPreview = (row: InboxRow) => {
    if (!row.conversation) return "Tap to send WhatsApp";
    const msgs = [...store.whatsappMessages, ...liveMessages].filter(
      (m) => m.conversation_id === row.conversation?.id && !isSystemWhatsAppMessage(m),
    );
    return msgs[msgs.length - 1]?.body || "No messages yet";
  };

  const canSend = hasSendableWhatsAppNumber(selectedLead);
  const hasAnyPhone = Boolean(selectedLead && leadPhone(selectedLead));

  const send = async (e: FormEvent) => {
    e.preventDefault();
    const message = draft.trim();
    if (!message || !selectedLead || busy || !canSend) return;
    setBusy(true);
    setError("");
    try {
      const created = await postWhatsAppMessage(selectedLead, selectedConversation, message);
      if (created) setLiveMessages((prev) => [...prev, created]);
      setDraft("");
      await refreshStore();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not send the WhatsApp message.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      <div className="mb-5 flex items-center gap-3">
        <MessageCircle className="h-6 w-6 shrink-0 text-emerald-500" />
        <div>
          <h1 className="text-xl font-bold sm:text-2xl">WhatsApp</h1>
          <p className="text-sm text-slate-600">
            Every lead assigned to you with a phone number is listed here. Replies go out from the Fly Masters business number.
          </p>
        </div>
      </div>

      <Card className="grid overflow-hidden md:h-[65vh] md:grid-cols-[260px_1fr]">
        <div className="max-h-64 overflow-y-auto border-b border-slate-100 md:max-h-none md:border-b-0 md:border-r">
          {inbox.map((row) => {
            const unread =
              !!row.conversation &&
              store.whatsappMessages.some(
                (m) =>
                  m.conversation_id === row.conversation?.id &&
                  m.direction === "inbound" &&
                  !m.is_read &&
                  !isSystemWhatsAppMessage(m),
              );
            const label = row.lead
              ? displayName(row.lead.first_name, row.lead.last_name, row.lead.email)
              : phoneLabel(row.conversation?.phone_number);
            return (
              <button
                key={row.key}
                type="button"
                onClick={() => selectRow(row)}
                className={`block w-full border-b border-slate-100 px-4 py-3 text-left transition last:border-b-0 hover:bg-slate-50 ${
                  selected?.key === row.key ? "bg-emerald-50" : ""
                }`}
              >
                <span className="flex items-center justify-between gap-2">
                  <span className="truncate font-semibold">{label}</span>
                  {unread && <span className="h-2 w-2 shrink-0 rounded-full bg-emerald-500" />}
                </span>
                <span className="block truncate text-sm text-slate-500">{lastPreview(row)}</span>
              </button>
            );
          })}
          {inbox.length === 0 && (
            <p className="p-6 text-center text-sm text-slate-500">
              No WhatsApp leads in your queue yet. When an admin assigns you a lead with a phone number, they appear here.
            </p>
          )}
        </div>

        <div className="flex min-h-[24rem] flex-col md:min-h-0">
          {selected ? (
            <>
              <div className="border-b border-slate-100 px-5 py-3">
                <p className="flex items-center gap-2 font-semibold">
                  <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-emerald-600 text-xs font-bold text-white">
                    {initials(selectedLead?.first_name, selectedLead?.last_name, selectedLead?.email)}
                  </span>
                  {title}
                </p>
                <p className="text-xs text-emerald-700">
                  WhatsApp {phoneLabel(number)}
                  {selectedConversation
                    ? windowOpen
                      ? " · Ready to send"
                      : " · First message may need the lead to have WhatsApp"
                    : " · Type a message to start this chat"}
                </p>
              </div>

              <div className="flex-1 space-y-3 overflow-y-auto px-5 py-4">
                {thread.map((message) => {
                  const mine = message.direction === "outbound";
                  return (
                    <div key={message.id} className={`flex ${mine ? "justify-end" : "justify-start"}`}>
                      <div
                        className={`max-w-[75%] rounded-2xl px-4 py-2.5 text-sm ${
                          mine ? "bg-emerald-600 text-white" : "bg-slate-100 text-slate-800"
                        }`}
                      >
                        <p className="whitespace-pre-wrap">{message.body}</p>
                        <p className={`mt-1 text-[11px] ${mine ? "text-emerald-100" : "text-slate-400"}`}>
                          {timeLabel(message.created_at)}
                        </p>
                      </div>
                    </div>
                  );
                })}
                {thread.length === 0 && (
                  <p className="pt-8 text-center text-sm text-slate-400">
                    No messages yet. Type below and send — it goes to this lead on WhatsApp.
                  </p>
                )}
              </div>

              {error && <p className="px-5 pb-2 text-sm text-rose-600">{error}</p>}
              {!canSend && (
                <p className="px-5 pb-2 text-sm text-amber-700">
                  {hasAnyPhone
                    ? "This number is incomplete. WhatsApp needs a 10-digit Indian number (or country code + number) before you can send."
                    : "Add a 10-digit phone number on this lead before you can send WhatsApp."}
                </p>
              )}

              <form onSubmit={(e) => void send(e)} className="flex items-center gap-2 border-t border-slate-100 p-3">
                <input
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  placeholder={`Message ${title} on WhatsApp`}
                  disabled={!canSend}
                  className="flex-1 rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100 disabled:bg-slate-50"
                />
                <button
                  type="submit"
                  disabled={busy || !draft.trim() || !canSend}
                  className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-emerald-700 disabled:opacity-50"
                >
                  <Send className="h-4 w-4" /> Send
                </button>
              </form>
            </>
          ) : (
            <p className="flex flex-1 items-center justify-center p-8 text-center text-sm text-slate-500">
              Pick a lead on the left to see their WhatsApp chat.
            </p>
          )}
        </div>
      </Card>
    </div>
  );
}
