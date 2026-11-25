import { useEffect, useState } from "react";
import { api, readStoredUser } from "@admin/lib/api";
import type { AdminState } from "@admin/lib/types";

const empty: AdminState = {
  users: [],
  counselors: [],
  telecallers: [],
  leads: [],
  documents: [],
  applications: [],
  applicationEvents: [],
  shortlists: [],
  conversations: [],
  messages: [],
  telecallerConversations: [],
  telecallerMessages: [],
  whatsappConversations: [],
  whatsappMessages: [],
  leave: [],
  attendance: [],
  salary: [],
  notifications: [],
  universities: [],
  universityProgramCount: 0,
  checklists: [],
  chatSessions: [],
  chatMessages: [],
};

const listeners = new Set<() => void>();
let cache: AdminState = empty;
let lastError = "";

function emit() {
  listeners.forEach((fn) => fn());
}

export function subscribeStore(fn: () => void) {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

export function getStore() {
  return cache;
}

export function getStoreError() {
  return lastError;
}

// ---- one request at a time, one poller for the whole portal -------------------------------------
//
// Every component that reads admin data used to start its OWN five-second poller and fire its own
// request on mount, and nothing stopped two identical requests running at once. One screen mounts
// several such components, so it sent several /api/state calls every five seconds. Against a tiny
// local database each returned in milliseconds and nobody noticed. On production each one was slow,
// so a new batch started before the last had finished, they queued for the same database
// connections, every one got slower, and the pile grew: 15+ requests pending at once and a 29-second
// wait for the portal to open (found 21 Nov 2026, on the live app).
//
// Now: at most ONE request in flight - a caller arriving mid-request gets the same promise; ONE
// timer however many components are mounted, counted by subscribers; a mount skips the fetch when
// the data is already fresh; and nothing polls while the tab is hidden.

const POLL_MS = 5000;
let inFlight: Promise<void> | null = null;
let fetchedAt = 0;
let subscribers = 0;
let poller: number | null = null;

export function refreshStore(): Promise<void> {
  if (inFlight) return inFlight;
  inFlight = (async () => {
    try {
      // Accountants get the finance slice; everyone else gets the full admin
      // state. The server decides what each role may read — this only picks the
      // right door rather than acting as the restriction itself.
      const role = readStoredUser<{ role?: string }>()?.role;
      cache = await api<AdminState>(role === "accountant" ? "/hr/state" : "/state");
      fetchedAt = Date.now();
      lastError = "";
      emit();
    } catch (error) {
      lastError = error instanceof Error ? error.message : "Could not load admin data";
      emit();
    } finally {
      inFlight = null;
    }
  })();
  return inFlight;
}

/** For tests: how many timers are running and whether a request is in flight. */
export function pollingState() {
  return { subscribers, polling: poller !== null, inFlight: inFlight !== null };
}

function tick() {
  // A hidden tab has nobody looking at it; it catches up when it is shown again.
  if (typeof document !== "undefined" && document.visibilityState === "hidden") return;
  void refreshStore();
}

function startPolling() {
  subscribers += 1;
  if (poller === null) poller = window.setInterval(tick, POLL_MS);
}

function stopPolling() {
  subscribers = Math.max(0, subscribers - 1);
  if (subscribers === 0 && poller !== null) {
    window.clearInterval(poller);
    poller = null;
  }
}

export function useAdminStore() {
  const [data, setData] = useState(getStore);
  const [error, setError] = useState(getStoreError);
  useEffect(() => {
    // Fresh enough already? Then this mount does not need its own request.
    if (Date.now() - fetchedAt > POLL_MS) void refreshStore();
    const unsub = subscribeStore(() => {
      setData({ ...getStore() });
      setError(getStoreError());
    });
    startPolling();
    return () => {
      unsub();
      stopPolling();
    };
  }, []);
  return { ...data, error };
}
