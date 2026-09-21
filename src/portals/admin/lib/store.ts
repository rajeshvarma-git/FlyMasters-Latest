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

export async function refreshStore() {
  try {
    // Accountants get the finance slice; everyone else gets the full admin
    // state. The server decides what each role may read — this only picks the
    // right door rather than acting as the restriction itself.
    const role = readStoredUser<{ role?: string }>()?.role;
    cache = await api<AdminState>(role === "accountant" ? "/hr/state" : "/state");
    lastError = "";
    emit();
  } catch (error) {
    lastError = error instanceof Error ? error.message : "Could not load admin data";
    emit();
  }
}

export function useAdminStore() {
  const [data, setData] = useState(getStore);
  const [error, setError] = useState(getStoreError);
  useEffect(() => {
    void refreshStore();
    const unsub = subscribeStore(() => {
      setData({ ...getStore() });
      setError(getStoreError());
    });
    const poll = window.setInterval(() => {
      void refreshStore();
    }, 5000);
    return () => {
      unsub();
      window.clearInterval(poll);
    };
  }, []);
  return { ...data, error };
}
