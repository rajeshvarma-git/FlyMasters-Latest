import { useEffect, useMemo, useState } from "react";
import { displayName } from "@admin/lib/utils";
import ChatInboxPanel, { type InboxMessage, type InboxThread } from "@admin/components/ChatInboxPanel";
import type { Lead, WhatsAppConversationRow, WhatsAppMessageRow } from "@admin/lib/types";

export function whatsAppThreadIdForLead(leadId: string) {
  return `lead:${leadId}`;
}

export function isWhatsAppLeadThreadId(id: string) {
  return id.startsWith("lead:");
}

interface WhatsAppThreadsProps {
  conversations: WhatsAppConversationRow[];
  messages: WhatsAppMessageRow[];
  leads: Lead[];
  people?: Lead[];
  profileUrl: (lead: Lead | null, conversation: WhatsAppConversationRow | null) => string;
  emptyMessage: string;
  selectedId?: string | null;
  onSelectId?: (id: string) => void;
}

export default function WhatsAppThreads({
  conversations,
  messages,
  leads,
  people,
  profileUrl,
  emptyMessage,
  selectedId: controlledId,
  onSelectId,
}: WhatsAppThreadsProps) {
  const [internalId, setInternalId] = useState<string | null>(null);
  const selectedId = controlledId !== undefined ? controlledId : internalId;
  const setSelectedId = onSelectId || setInternalId;

  const threads = useMemo(() => {
    const buildRow = (lead: Lead | null, conv: WhatsAppConversationRow | null) => {
      const msgs = conv
        ? messages
            .filter((msg) => msg.conversation_id === conv.id)
            .sort((a, b) => String(a.created_at || "").localeCompare(String(b.created_at || "")))
        : [];
      const last = msgs[msgs.length - 1];
      return {
        conv,
        lead,
        msgs,
        thread: {
          id: conv?.id || (lead ? whatsAppThreadIdForLead(lead.id) : conv?.id || ""),
          title: lead
            ? displayName(lead.first_name, lead.last_name, lead.email)
            : `+${conv?.phone_number?.slice(-10) || "—"}`,
          subtitle: lead?.phone
            ? lead.phone
            : conv?.phone_number
              ? `+${conv.phone_number.slice(-10)}`
              : undefined,
          preview: last?.body || "No WhatsApp messages yet",
          lastAt: conv?.last_message_at || null,
          unread: msgs.some((msg) => msg.direction === "inbound" && !msg.is_read),
        } satisfies InboxThread,
      };
    };

    if (people?.length) {
      return people
        .map((person) => {
          const conv =
            conversations.find((row) => String(row.lead_id) === String(person.id)) || null;
          return buildRow(person, conv);
        })
        .sort((a, b) => String(b.thread.lastAt || "").localeCompare(String(a.thread.lastAt || "")));
    }

    return conversations
      .map((conv) => {
        const lead = leads.find((row) => String(row.id) === String(conv.lead_id)) || null;
        return buildRow(lead, conv);
      })
      .sort((a, b) => String(b.thread.lastAt || "").localeCompare(String(a.thread.lastAt || "")));
  }, [conversations, leads, messages, people]);

  useEffect(() => {
    if (!selectedId && threads[0]) setSelectedId(threads[0].thread.id);
  }, [selectedId, setSelectedId, threads]);

  const active =
    threads.find((row) => row.thread.id === selectedId) ||
    threads.find((row) => row.conv?.id === selectedId) ||
    threads[0] ||
    null;

  const getMessages = (threadId: string): InboxMessage[] => {
    const row =
      threads.find((item) => item.thread.id === threadId) ||
      threads.find((item) => item.conv?.id === threadId);
    if (!row) return [];
    return row.msgs.map((msg) => ({
      id: msg.id,
      text: msg.body,
      outbound: msg.direction === "outbound",
      createdAt: msg.created_at,
      system: msg.kind === "system" || msg.staff_id === "system",
    }));
  };

  return (
    <ChatInboxPanel
      threads={threads.map((row) => row.thread)}
      getMessages={getMessages}
      selectedId={active?.thread.id || selectedId}
      onSelect={setSelectedId}
      emptyListMessage={emptyMessage}
      emptyThreadMessage="No WhatsApp messages in this thread yet."
      footerNote="Admin view is read-only. Assigned telecallers and counselors reply from their portal."
      profileHref={active?.lead ? profileUrl(active.lead, active.conv) : undefined}
      variant="sky"
    />
  );
}
