import { useEffect, useState } from "react";

/**
 * Unread student-chat messages for the signed-in staff member, for the
 * "Student Chat" badge in the side panel. It reads the same inbox the chat
 * screen uses (/api/case/inbox), so the badge and the per-student counts in
 * the chat list always agree. (The counsellor badge used to count the old
 * private-message table, which the chat screen no longer uses.)
 */
export function useCaseUnread(intervalMs = 30000) {
  const [unread, setUnread] = useState(0);
  useEffect(() => {
    let alive = true;
    const load = async () => {
      try {
        const token = sessionStorage.getItem("fm_token") || "";
        if (!token) return;
        const res = await fetch("/api/case/inbox", { cache: "no-store", headers: { Authorization: `Bearer ${token}` } });
        if (!res.ok) return;
        const data = (await res.json()) as { conversations?: { unread?: number }[] };
        if (alive) setUnread((data.conversations || []).reduce((sum, item) => sum + Number(item.unread || 0), 0));
      } catch {
        // A missed refresh just keeps the last count.
      }
    };
    void load();
    const timer = window.setInterval(() => void load(), intervalMs);
    const onFocus = () => void load();
    window.addEventListener("focus", onFocus);
    return () => {
      alive = false;
      window.clearInterval(timer);
      window.removeEventListener("focus", onFocus);
    };
  }, [intervalMs]);
  return unread;
}
