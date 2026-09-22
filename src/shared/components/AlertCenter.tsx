import { useCallback, useEffect, useRef, useState } from "react";
import { AlarmClock, BellRing, X } from "lucide-react";

/**
 * CRM 2.6.1 — the delivery half of the alert system.
 *
 * The configuration half (what is enabled, which tones, quiet hours, working
 * hours, per-branch and per-role rules) is decided server-side; by the time an
 * alert reaches this component the server has already decided it should be
 * heard. This component only renders and plays it.
 *
 * Sound is synthesised with the Web Audio API rather than shipped as files:
 * no assets to host, nothing to 404, and the tone can differ by priority. The
 * browser blocks audio until the person has interacted with the page at least
 * once, so the first alert of a session may be silent — that is a browser
 * rule, not a bug, and the badge still appears.
 */

type Alert = {
  id: string;
  alert_type: string;
  title: string;
  body: string;
  link: string;
  priority: "low" | "normal" | "high" | "urgent";
  sound: string;
  color: string;
  display_ms: number;
};

const TONE: Record<string, { bar: string; ring: string }> = {
  slate: { bar: "bg-slate-400", ring: "border-slate-200" },
  sky: { bar: "bg-sky-500", ring: "border-sky-200" },
  indigo: { bar: "bg-indigo-500", ring: "border-indigo-200" },
  violet: { bar: "bg-violet-500", ring: "border-violet-200" },
  amber: { bar: "bg-amber-500", ring: "border-amber-200" },
  emerald: { bar: "bg-emerald-500", ring: "border-emerald-200" },
  rose: { bar: "bg-rose-500", ring: "border-rose-200" },
};

/** note pattern per tone name, so "urgent" is audibly different from "chime" */
const PATTERNS: Record<string, number[]> = {
  chime: [880, 1175],
  ping: [1320],
  soft: [660],
  urgent: [988, 740, 988, 740],
};

function playTone(name: string) {
  try {
    const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    const notes = PATTERNS[name] || PATTERNS.chime;
    notes.forEach((frequency, index) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.value = frequency;
      const start = ctx.currentTime + index * 0.16;
      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.exponentialRampToValueAtTime(0.18, start + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.15);
      osc.connect(gain).connect(ctx.destination);
      osc.start(start);
      osc.stop(start + 0.16);
    });
    setTimeout(() => ctx.close().catch(() => undefined), 1200);
  } catch {
    // Audio is a nicety. Never let it break the page.
  }
}

export default function AlertCenter({
  fetchJson,
  pollMs = 20000,
}: {
  /** the portal's own api helper, so this component carries no auth logic */
  fetchJson: <T>(path: string, options?: { method?: string; body?: unknown }) => Promise<T>;
  pollMs?: number;
}) {
  const [queue, setQueue] = useState<Alert[]>([]);
  const [unread, setUnread] = useState(0);
  const seen = useRef<Set<string>>(new Set());

  const poll = useCallback(async () => {
    try {
      const data = await fetchJson<{ alerts: Alert[]; unread: number }>("/alerts/feed");
      setUnread(data.unread);
      const fresh = data.alerts.filter((alert) => !seen.current.has(alert.id));
      if (!fresh.length) return;
      fresh.forEach((alert) => seen.current.add(alert.id));
      setQueue((current) => [...fresh, ...current].slice(0, 4));
      const loudest = fresh.find((alert) => alert.sound);
      if (loudest) playTone(loudest.sound);
    } catch {
      // A failed poll is not worth a message. The next one will succeed.
    }
  }, [fetchJson]);

  useEffect(() => {
    void poll();
    const timer = setInterval(poll, pollMs);
    return () => clearInterval(timer);
  }, [poll, pollMs]);

  // Non-urgent toasts fade on their own; urgent ones wait to be dismissed, so
  // an overdue follow-up cannot disappear while nobody is looking.
  useEffect(() => {
    const timers = queue
      .filter((alert) => alert.priority !== "urgent")
      .map((alert) =>
        setTimeout(() => setQueue((current) => current.filter((row) => row.id !== alert.id)), alert.display_ms || 6000),
      );
    return () => timers.forEach(clearTimeout);
  }, [queue]);

  const dismiss = async (alert: Alert) => {
    setQueue((current) => current.filter((row) => row.id !== alert.id));
    setUnread((value) => Math.max(0, value - 1));
    await fetchJson(`/alerts/${alert.id}/read`, { method: "POST", body: {} }).catch(() => undefined);
  };

  const snooze = async (alert: Alert) => {
    setQueue((current) => current.filter((row) => row.id !== alert.id));
    seen.current.delete(alert.id);
    await fetchJson(`/alerts/${alert.id}/snooze`, { method: "POST", body: { minutes: 15 } }).catch(() => undefined);
  };

  return (
    <>
      {unread > 0 && (
        <span
          className="inline-flex items-center gap-1 rounded-full bg-rose-500 px-2 py-0.5 text-[11px] font-semibold text-white"
          title={`${unread} alert${unread === 1 ? "" : "s"} waiting`}
        >
          <BellRing className="h-3 w-3" /> {unread > 9 ? "9+" : unread}
        </span>
      )}

      <div className="pointer-events-none fixed bottom-4 right-4 z-[60] flex w-[min(24rem,calc(100vw-2rem))] flex-col gap-2">
        {queue.map((alert) => {
          const tone = TONE[alert.color] || TONE.sky;
          return (
            <div
              key={alert.id}
              role="status"
              className={`pointer-events-auto flex overflow-hidden rounded-xl border bg-white shadow-lg ${tone.ring}`}
            >
              <span className={`w-1.5 shrink-0 ${tone.bar}`} />
              <div className="flex-1 p-3">
                <div className="flex items-start gap-2">
                  <p className="flex-1 text-sm font-semibold text-navy-900">{alert.title}</p>
                  <button onClick={() => dismiss(alert)} className="text-slate-400 hover:text-slate-700" aria-label="Dismiss">
                    <X className="h-4 w-4" />
                  </button>
                </div>
                {alert.body && <p className="mt-1 text-sm text-slate-600">{alert.body}</p>}
                <div className="mt-2 flex items-center gap-3">
                  {alert.link && (
                    <a href={alert.link} className="text-xs font-medium text-sky-700 hover:underline">Open</a>
                  )}
                  {alert.priority !== "urgent" && (
                    <button onClick={() => snooze(alert)} className="flex items-center gap-1 text-xs text-slate-500 hover:text-slate-800">
                      <AlarmClock className="h-3 w-3" /> Snooze 15m
                    </button>
                  )}
                  {alert.priority === "urgent" && (
                    <span className="rounded-full bg-rose-100 px-2 py-0.5 text-[11px] font-medium text-rose-700">Urgent</span>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </>
  );
}
