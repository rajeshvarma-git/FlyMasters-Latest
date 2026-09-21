import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Bell } from "lucide-react";
import { useAuth } from "@telecaller/context/AuthContext";
import { api } from "@telecaller/lib/api";
import { markNotificationsReadLocal, refreshStore, useStore } from "@telecaller/lib/store";
import { displayName, isSystemWhatsAppMessage } from "@telecaller/lib/utils";
import type { Lead, NotificationRow, WhatsAppConversation } from "@telecaller/lib/types";

type FeedItem = {
  id: string;
  title: string;
  message: string;
  created_at: string;
  unread: boolean;
  href: string;
  source: "notice" | "whatsapp" | "chat";
};

function formatWhen(value?: string) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleString(undefined, {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

function telecallerHref(url?: string) {
  const value = String(url || "");
  if (!value) return "/queue";
  if (
    value.startsWith("/whatsapp") ||
    value.startsWith("/chat") ||
    value.startsWith("/queue") ||
    value.startsWith("/leads") ||
    value.startsWith("/converted")
  ) {
    return value;
  }
  const lead = value.match(/[?&]lead=([^&]+)/);
  if (lead) return `/whatsapp?lead=${lead[1]}`;
  if (/whatsapp/i.test(value)) return "/whatsapp";
  if (/chat/i.test(value)) return "/chat";
  return "/queue";
}

function leadName(lead?: Lead | null) {
  if (!lead) return "Lead";
  return displayName(lead.first_name, lead.last_name, lead.email || lead.phone || "Lead");
}

function leadForConversation(leads: Lead[], conversation?: WhatsAppConversation | null) {
  if (!conversation) return null;
  return leads.find((lead) => String(lead.id) === String(conversation.lead_id)) || null;
}

function buildFeed(
  notifications: NotificationRow[],
  store: ReturnType<typeof useStore>,
  userId?: string,
): FeedItem[] {
  const notices: FeedItem[] = notifications.map((row) => ({
    id: row.id,
    title: row.title || "Notification",
    message: row.message || "",
    created_at: row.created_at || "",
    unread: !row.is_read,
    href: telecallerHref(row.action_url),
    source: "notice",
  }));

  const usedHrefs = new Set(notices.filter((row) => row.unread).map((row) => row.href));

  const waByThread = new Map<string, FeedItem>();
  for (const message of store.whatsappMessages) {
    if (message.direction !== "inbound" || message.is_read || isSystemWhatsAppMessage(message)) continue;
    const conversation = store.whatsappConversations.find((row) => row.id === message.conversation_id);
    const lead = leadForConversation(store.leads, conversation);
    const href = lead ? `/whatsapp?lead=${lead.id}` : "/whatsapp";
    if (usedHrefs.has(href)) continue;
    const current = waByThread.get(message.conversation_id);
    if (current && String(current.created_at) >= String(message.created_at)) continue;
    waByThread.set(message.conversation_id, {
      id: `wa:${message.conversation_id}`,
      title: `WhatsApp · ${leadName(lead)}`,
      message: message.body || "New WhatsApp message",
      created_at: message.created_at,
      unread: true,
      href,
      source: "whatsapp",
    });
  }

  const chatByThread = new Map<string, FeedItem>();
  for (const message of store.messages) {
    if (String(message.receiver_id) !== String(userId || "") || message.is_read) continue;
    const conversation = store.conversations.find((row) => row.id === message.conversation_id);
    const lead = store.leads.find(
      (row) => String(row.user_id) === String(conversation?.student_id) || String(row.id) === String(conversation?.student_id),
    );
    const href = lead ? `/chat?lead=${lead.id}` : "/chat";
    if (usedHrefs.has(href)) continue;
    const current = chatByThread.get(message.conversation_id);
    if (current && String(current.created_at) >= String(message.created_at)) continue;
    chatByThread.set(message.conversation_id, {
      id: `chat:${message.conversation_id}`,
      title: `Chat · ${leadName(lead)}`,
      message: message.message || "New portal message",
      created_at: message.created_at,
      unread: true,
      href,
      source: "chat",
    });
  }

  return [...notices, ...waByThread.values(), ...chatByThread.values()].sort((a, b) =>
    String(b.created_at).localeCompare(String(a.created_at)),
  );
}

function alertBrowser(title: string, body: string) {
  if (typeof Notification === "undefined" || Notification.permission !== "granted") return;
  try {
    new Notification(title, { body, tag: "flymasters-telecaller" });
  } catch {
    // Browser may block Notification if the page is not focused.
  }
}

export default function NotificationBell() {
  const store = useStore();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const seenRef = useRef<Set<string>>(new Set());
  const primedRef = useRef(false);

  const items = useMemo(() => buildFeed(store.notifications || [], store, user?.id), [store, user?.id]);
  const unread = items.filter((row) => row.unread).length;

  useEffect(() => {
    if (!open) return;
    const onClick = (event: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [open]);

  useEffect(() => {
    const incoming = items.filter((row) => row.unread && (row.source === "whatsapp" || row.source === "chat"));
    const ids = incoming.map((row) => row.id);
    if (!primedRef.current) {
      ids.forEach((id) => seenRef.current.add(id));
      primedRef.current = true;
      return;
    }
    const fresh = incoming.filter((row) => !seenRef.current.has(row.id));
    fresh.forEach((row) => seenRef.current.add(row.id));
    const latest = fresh[0];
    if (latest) alertBrowser(latest.title, latest.message);
  }, [items]);

  const markRead = async (ids: string[] | "all") => {
    const noticeIds =
      ids === "all"
        ? (store.notifications || []).filter((row) => !row.is_read).map((row) => row.id)
        : ids.filter((id) => !id.startsWith("wa:") && !id.startsWith("chat:"));
    markNotificationsReadLocal(ids === "all" ? "all" : noticeIds);
    if (noticeIds.length) {
      try {
        await api("/telecaller/notifications/read", { method: "POST", body: { ids: noticeIds } });
      } catch {
        // Older APIs do not have this route; local unread state still updates.
      }
    }
    if (ids !== "all") return;
    const waIds = [
      ...new Set(
        store.whatsappMessages
          .filter((row) => row.direction === "inbound" && !row.is_read && !isSystemWhatsAppMessage(row))
          .map((row) => row.conversation_id),
      ),
    ];
    const chatIds = [
      ...new Set(
        store.messages
          .filter((row) => String(row.receiver_id) === String(user?.id || "") && !row.is_read)
          .map((row) => row.conversation_id),
      ),
    ];
    await Promise.all([
      ...waIds.map((id) => api(`/whatsapp/conversations/${id}/read`, { method: "POST" }).catch(() => null)),
      ...chatIds.map((id) => api(`/telecaller/conversations/${id}/read`, { method: "POST" }).catch(() => null)),
    ]);
    await refreshStore();
  };

  const openItem = async (item: FeedItem) => {
    setOpen(false);
    if (item.source === "notice" && item.unread) await markRead([item.id]);
    navigate(item.href);
    void refreshStore();
  };

  const toggle = () => {
    setOpen((value) => !value);
    if (typeof Notification !== "undefined" && Notification.permission === "default") {
      void Notification.requestPermission();
    }
  };

  return (
    <div ref={rootRef} className="relative shrink-0">
      <button
        type="button"
        onClick={toggle}
        className="relative flex h-9 w-9 items-center justify-center rounded-full bg-white/15 text-white transition hover:bg-white/25"
        aria-label={unread ? `${unread} unread notifications` : "Notifications"}
        title="Notifications"
      >
        <Bell className="h-5 w-5" strokeWidth={2.25} />
        {unread > 0 && (
          <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-rose-500 px-1 text-[10px] font-bold leading-none text-white">
            {unread > 9 ? "9+" : unread}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-full z-50 mt-2 w-[min(22rem,calc(100vw-2rem))] overflow-hidden rounded-xl border border-slate-200 bg-white shadow-lg">
          <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
            <p className="text-sm font-bold text-slate-900">Notifications</p>
            {unread > 0 && (
              <button
                type="button"
                className="text-xs font-semibold text-sky-700 hover:text-sky-900"
                onClick={() => void markRead("all")}
              >
                Mark all read
              </button>
            )}
          </div>

          <div className="max-h-80 overflow-y-auto">
            {items.length === 0 && (
              <p className="px-4 py-8 text-center text-sm text-slate-500">No notifications yet.</p>
            )}
            {items.slice(0, 20).map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => void openItem(item)}
                className={`block w-full border-b border-slate-100 px-4 py-3 text-left last:border-b-0 ${
                  item.unread ? "bg-sky-50/80" : "bg-white"
                }`}
              >
                <p className="text-sm font-medium text-slate-900">{item.title}</p>
                {item.message && <p className="mt-0.5 line-clamp-2 text-sm text-slate-600">{item.message}</p>}
                {item.created_at && (
                  <p className="mt-1 text-[11px] text-slate-400">{formatWhen(item.created_at)}</p>
                )}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
