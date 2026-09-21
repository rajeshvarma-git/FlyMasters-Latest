import { useEffect, useState } from "react";
import { api } from "@telecaller/lib/api";
import type { TelecallerState, WhatsAppConversation, WhatsAppMessage } from "@telecaller/lib/types";

const empty: TelecallerState = {
  leads: [],
  notifications: [],
  counselors: [],
  conversations: [],
  messages: [],
  whatsappConversations: [],
  whatsappMessages: [],
};

const listeners = new Set<() => void>();
let cache: TelecallerState = empty;
let lastError = "";
let inFlight: Promise<void> | null = null;

function emit() {
  listeners.forEach((fn) => fn());
}

export function getStore() {
  return cache;
}

export function clearStore() {
  cache = empty;
  lastError = "";
  emit();
}

function asList<T>(value: unknown): T[] {
  if (Array.isArray(value)) return value as T[];
  if (value && typeof value === "object") {
    const body = value as { conversations?: T[]; messages?: T[] };
    if (Array.isArray(body.conversations)) return body.conversations;
    if (Array.isArray(body.messages)) return body.messages;
  }
  return [];
}

function mergeById<T extends { id?: string }>(primary: T[], extra: T[]) {
  const map = new Map<string, T>();
  for (const row of [...primary, ...extra]) {
    const id = String(row?.id || "");
    if (id) map.set(id, row);
  }
  return [...map.values()];
}

async function loadWhatsAppInbox() {
  try {
    const data = await api<{ conversations?: WhatsAppConversation[]; messages?: WhatsAppMessage[] }>(
      "/telecaller/whatsapp",
    );
    return {
      conversations: asList<WhatsAppConversation>(data.conversations ?? data),
      messages: asList<WhatsAppMessage>(data.messages),
    };
  } catch {
    // Older API builds only expose the shared staff WhatsApp routes.
  }

  try {
    const raw = await api<unknown>("/whatsapp/conversations");
    const conversations = asList<WhatsAppConversation>(raw);
    const messageGroups = await Promise.all(
      conversations.slice(0, 50).map(async (conversation) => {
        try {
          const rawMessages = await api<unknown>(`/whatsapp/conversations/${conversation.id}/messages`);
          return asList<WhatsAppMessage>(rawMessages);
        } catch {
          return [];
        }
      }),
    );
    return { conversations, messages: messageGroups.flat() };
  } catch {
    return { conversations: [] as WhatsAppConversation[], messages: [] as WhatsAppMessage[] };
  }
}

/** Coalesces concurrent refreshes so several mounted components cause one request. */
export async function refreshStore() {
  if (inFlight) return inFlight;
  inFlight = (async () => {
    try {
      const state = await api<TelecallerState>("/telecaller/state");
      const inbox = await loadWhatsAppInbox();
      cache = {
        ...empty,
        ...state,
        conversations: state.conversations || [],
        messages: state.messages || [],
        notifications: state.notifications || [],
        whatsappConversations: mergeById(state.whatsappConversations || [], inbox.conversations),
        whatsappMessages: mergeById(state.whatsappMessages || [], inbox.messages),
      };
      lastError = "";
    } catch (error) {
      lastError = error instanceof Error ? error.message : "Could not load your leads";
    } finally {
      inFlight = null;
      emit();
    }
  })();
  return inFlight;
}

export function markNotificationsReadLocal(ids: string[] | "all") {
  cache = {
    ...cache,
    notifications: cache.notifications.map((row) =>
      ids === "all" || ids.includes(row.id) ? { ...row, is_read: true } : row,
    ),
  };
  emit();
}

/** One shared poll for the whole app, regardless of how many components subscribe. */
let poll: number | null = null;

function startPolling() {
  if (poll !== null) return;
  poll = window.setInterval(() => {
    if (document.visibilityState === "visible") void refreshStore();
  }, 8000);
}

function stopPolling() {
  if (poll === null || listeners.size > 0) return;
  window.clearInterval(poll);
  poll = null;
}

export function useStore() {
  const [data, setData] = useState(getStore);
  const [error, setError] = useState(lastError);
  useEffect(() => {
    const fn = () => {
      setData({ ...getStore() });
      setError(lastError);
    };
    listeners.add(fn);
    startPolling();
    void refreshStore();
    return () => {
      listeners.delete(fn);
      stopPolling();
    };
  }, []);
  return { ...data, error };
}
