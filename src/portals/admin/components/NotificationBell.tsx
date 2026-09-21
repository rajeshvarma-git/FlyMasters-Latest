import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { Bell } from "lucide-react";
import { useAdminStore } from "@admin/lib/store";
import { Button } from "@admin/components/ui/Button";

function formatWhen(value: string) {
  return new Date(value).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function NotificationBell() {
  const store = useAdminStore();
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  const items = useMemo(
    () =>
      [...store.notifications].sort((a, b) =>
        String(b.created_at || "").localeCompare(String(a.created_at || "")),
      ),
    [store.notifications],
  );

  const unread = items.filter((row) => !row.is_read).length;

  useEffect(() => {
    if (!open) return;
    const onClick = (event: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [open]);

  return (
    <div ref={rootRef} className="relative">
      <Button
        variant="ghost"
        size="sm"
        className="relative h-10 w-10 rounded-full p-0 text-slate-600 hover:bg-slate-200"
        aria-label="Notifications"
        onClick={() => setOpen((value) => !value)}
      >
        <Bell className="h-5 w-5" />
        {unread > 0 && (
          <span className="absolute right-1 top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-rose-500 px-1 text-[10px] font-bold text-white">
            {unread > 9 ? "9+" : unread}
          </span>
        )}
      </Button>

      {open && (
        <div className="absolute right-0 top-full z-50 mt-2 w-[min(22rem,calc(100vw-2rem))] overflow-hidden rounded-xl border border-slate-200 bg-white shadow-lg">
          <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
            <p className="text-sm font-bold text-slate-900">Notifications</p>
            {unread > 0 && <span className="text-xs font-medium text-rose-600">{unread} unread</span>}
          </div>

          <div className="max-h-80 overflow-y-auto">
            {items.length === 0 && (
              <p className="px-4 py-8 text-center text-sm text-slate-500">No notifications yet.</p>
            )}
            {items.slice(0, 12).map((row) => (
              <div
                key={row.id}
                className={`border-b border-slate-100 px-4 py-3 last:border-b-0 ${
                  row.is_read ? "bg-white" : "bg-sky-50/60"
                }`}
              >
                <p className="text-sm font-medium text-slate-900">{row.title}</p>
                <p className="mt-0.5 text-sm text-slate-600">{row.message}</p>
                {row.created_at && (
                  <p className="mt-1 text-[11px] text-slate-400">{formatWhen(row.created_at)}</p>
                )}
              </div>
            ))}
          </div>

          <div className="border-t border-slate-200 bg-slate-50 px-4 py-2">
            <Link
              to="/notifications"
              className="block py-1.5 text-center text-sm font-semibold text-sky-700 hover:text-sky-900"
              onClick={() => setOpen(false)}
            >
              Open notifications
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
