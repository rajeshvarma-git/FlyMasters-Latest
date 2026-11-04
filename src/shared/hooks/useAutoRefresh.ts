import { useEffect, useRef } from "react";

/**
 * Keeps a screen in sync without a Refresh button: runs `load` every `intervalMs`
 * while the tab is visible, and once more when the tab regains focus.
 * The latest `load` is always used, so callers need not memoise it.
 */
export function useAutoRefresh(load: () => unknown, intervalMs = 30000) {
  const latest = useRef(load);
  latest.current = load;
  useEffect(() => {
    const run = () => {
      if (document.visibilityState === "visible") void Promise.resolve(latest.current()).catch(() => undefined);
    };
    const timer = window.setInterval(run, intervalMs);
    document.addEventListener("visibilitychange", run);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", run);
    };
  }, [intervalMs]);
}
