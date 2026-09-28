import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Bell, CheckCheck, CheckCircle2, AlertTriangle, XCircle, Info } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { Popover, PopoverContent, PopoverTrigger } from '@student/components/ui/popover';
import { loadStudentInbox, markInboxRead, type StudentInboxItem } from '@student/lib/studentInbox';

/**
 * Bell in the student top bar: unread count, and a drop-down of the latest
 * notifications (same source as the Notifications page) — click one to go to
 * it, "Mark all read", or "See all".
 */

function TypeIcon({ type }: { type: string }) {
  if (type === 'success') return <CheckCircle2 className="h-4 w-4 text-emerald-600" />;
  if (type === 'warning') return <AlertTriangle className="h-4 w-4 text-amber-600" />;
  if (type === 'error') return <XCircle className="h-4 w-4 text-destructive" />;
  return <Info className="h-4 w-4 text-primary" />;
}

function ago(value: string) {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  try {
    return formatDistanceToNow(d, { addSuffix: true });
  } catch {
    return '';
  }
}

export function StudentNotificationsMenu({
  userId,
  className,
  onCountChange,
}: {
  userId?: string;
  className: string;
  onCountChange?: (count: number) => void;
}) {
  const navigate = useNavigate();
  const [items, setItems] = useState<StudentInboxItem[]>([]);
  const [open, setOpen] = useState(false);

  const load = useCallback(async () => {
    if (!userId) return;
    try {
      const list = await loadStudentInbox(userId);
      list.sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)));
      setItems(list);
    } catch {
      /* keep what we have */
    }
  }, [userId]);

  useEffect(() => {
    void load();
    const poll = window.setInterval(() => {
      if (document.visibilityState === 'visible') void load();
    }, 15000);
    return () => window.clearInterval(poll);
  }, [load]);

  useEffect(() => {
    if (open) void load();
  }, [open, load]);

  const unread = items.filter((i) => !i.is_read);
  useEffect(() => {
    onCountChange?.(unread.length);
  }, [unread.length, onCountChange]);

  const openItem = async (item: StudentInboxItem) => {
    setOpen(false);
    if (!item.is_read) {
      setItems((list) => list.map((i) => (i.id === item.id ? { ...i, is_read: true } : i)));
      void markInboxRead([item.id]);
    }
    if (item.action_url) navigate(item.action_url);
  };

  const markAll = async () => {
    const ids = unread.map((i) => i.id);
    setItems((list) => list.map((i) => ({ ...i, is_read: true })));
    await markInboxRead(ids).catch(() => {});
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button type="button" className={className} aria-label="Notifications" title="Notifications">
          <Bell className="h-5 w-5" />
          {unread.length > 0 && (
            <span className="absolute -top-1.5 -right-1.5 flex h-5 min-w-[20px] items-center justify-center rounded-full border-2 border-background bg-destructive px-1 text-[11px] font-bold text-white">
              {unread.length > 99 ? '99+' : unread.length}
            </span>
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-96 p-0">
        <div className="flex items-center justify-between border-b px-4 py-3">
          <div>
            <p className="text-sm font-semibold">Notifications</p>
            <p className="text-xs text-muted-foreground">{unread.length ? `${unread.length} unread` : 'You are all caught up'}</p>
          </div>
          {unread.length > 0 && (
            <button type="button" onClick={markAll} className="flex items-center gap-1 text-xs font-medium text-primary hover:underline">
              <CheckCheck className="h-3.5 w-3.5" /> Mark all read
            </button>
          )}
        </div>
        <div className="max-h-[380px] overflow-y-auto">
          {items.length === 0 ? (
            <div className="px-4 py-10 text-center text-sm text-muted-foreground">
              <Bell className="mx-auto mb-2 h-8 w-8 opacity-40" />
              No notifications yet
            </div>
          ) : (
            items.slice(0, 12).map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => openItem(item)}
                className={`flex w-full gap-3 border-b px-4 py-3 text-left hover:bg-muted/50 ${item.is_read ? '' : 'bg-primary/5'}`}
              >
                <span className="mt-0.5"><TypeIcon type={item.type} /></span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-2">
                    <span className={`truncate text-sm ${item.is_read ? '' : 'font-semibold'}`}>{item.title}</span>
                    {!item.is_read && <span className="h-2 w-2 flex-none rounded-full bg-primary" />}
                  </span>
                  <span className="mt-0.5 line-clamp-2 block text-xs text-muted-foreground">{item.message}</span>
                  <span className="mt-1 block text-[11px] text-muted-foreground">{ago(item.created_at)}</span>
                </span>
              </button>
            ))
          )}
        </div>
        <button
          type="button"
          onClick={() => {
            setOpen(false);
            navigate('/student/notifications');
          }}
          className="w-full px-4 py-2.5 text-center text-sm font-medium text-primary hover:bg-muted/50"
        >
          See all notifications
        </button>
      </PopoverContent>
    </Popover>
  );
}
