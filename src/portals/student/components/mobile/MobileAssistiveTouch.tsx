import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '@student/hooks/useAuth';
import {
  Bell,
  Smartphone,
  SlidersHorizontal,
  Mic,
  Home,
  MessageCircle,
  FileText,
  GraduationCap,
  Plane,
  LogIn,
  Users,
  Phone,
  BookOpen,
  type LucideIcon,
} from 'lucide-react';
import { cn } from '@student/lib/utils';
import { CHAT_PATH, getAuthRedirectPath } from '@student/lib/auth-utils';

type MenuSlot = 'top' | 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right' | 'bottom';

interface ShortcutItem {
  id: string;
  label: string;
  icon: LucideIcon;
  path: string;
  slot: MenuSlot;
  isHome?: boolean;
}

const SLOT_CLASS: Record<MenuSlot, string> = {
  top: 'top-3 left-1/2 -translate-x-1/2',
  'top-left': 'top-14 left-5',
  'top-right': 'top-14 right-5',
  'bottom-left': 'bottom-14 left-5',
  'bottom-right': 'bottom-14 right-5',
  bottom: 'bottom-3 left-1/2 -translate-x-1/2',
};

function useAssistiveShortcuts(): ShortcutItem[] {
  const { user, userRole } = useAuth();
  const { pathname } = useLocation();

  return useMemo(() => {
    if (pathname.startsWith('/counselor')) {
      return [
        { id: 'notifications', label: 'Notifications', icon: Bell, path: '/counselor/notifications', slot: 'top' },
        { id: 'leads', label: 'My Leads', icon: Phone, path: '/counselor/leads', slot: 'top-left' },
        { id: 'students', label: 'Students', icon: Users, path: '/counselor/students', slot: 'top-right' },
        { id: 'chat', label: 'Student Chat', icon: MessageCircle, path: '/counselor/chat', slot: 'bottom-left' },
        { id: 'documents', label: 'Documents', icon: SlidersHorizontal, path: '/counselor/documents', slot: 'bottom-right' },
        { id: 'home', label: 'Home', icon: Home, path: '/counselor', slot: 'bottom', isHome: true },
      ];
    }

    if (pathname.startsWith('/student') || (pathname.startsWith('/dashboard') && !pathname.includes('/admin'))) {
      return [
        { id: 'notifications', label: 'Notifications', icon: Bell, path: '/student/notifications', slot: 'top' },
        { id: 'universities', label: 'Universities', icon: BookOpen, path: '/student/universities', slot: 'top-left' },
        { id: 'profile', label: 'Profile', icon: Smartphone, path: '/student/profile', slot: 'top-right' },
        { id: 'chat', label: 'Counselor Chat', icon: MessageCircle, path: '/student/chat', slot: 'bottom-left' },
        { id: 'documents', label: 'Documents', icon: SlidersHorizontal, path: '/student/documents', slot: 'bottom-right' },
        { id: 'home', label: 'Home', icon: Home, path: '/student', slot: 'bottom', isHome: true },
      ];
    }

    const portalPath =
      userRole === 'counselor'
        ? '/counselor'
        : userRole === 'admin' || userRole === 'super_admin'
          ? '/dashboard/admin'
          : user
            ? '/student'
            : '/auth';

    return [
      { id: 'chat', label: 'AI Chat', icon: MessageCircle, path: CHAT_PATH, slot: 'top' },
      { id: 'universities', label: 'Universities', icon: GraduationCap, path: '/universities', slot: 'top-left' },
      { id: 'travel', label: 'Travel', icon: Plane, path: '/travel', slot: 'top-right' },
      {
        id: 'portal',
        label: user ? 'My Portal' : 'Sign In',
        icon: user ? Smartphone : LogIn,
        path: portalPath,
        slot: 'bottom-left',
      },
      { id: 'documents', label: 'Documents', icon: FileText, path: user ? '/student/documents' : '/auth', slot: 'bottom-right' },
      { id: 'home', label: 'Home', icon: Home, path: '/', slot: 'bottom', isHome: true },
    ];
  }, [pathname, user, userRole]);
}

function ShortcutButton({
  item,
  onSelect,
}: {
  item: ShortcutItem;
  onSelect: (path: string) => void;
}) {
  const Icon = item.icon;

  return (
    <button
      type="button"
      onClick={() => onSelect(item.path)}
      className={cn('assistive-shortcut absolute flex flex-col items-center gap-1.5 w-[72px] active:opacity-70 transition-opacity', SLOT_CLASS[item.slot])}
    >
      {item.isHome ? (
        <span className="assistive-home-ring flex items-center justify-center w-[52px] h-[52px] rounded-full border-[3px] border-white/90 bg-transparent">
          <span className="w-[42px] h-[42px] rounded-full border-2 border-white/70" />
        </span>
      ) : item.id === 'chat' && item.label === 'AI Chat' ? (
        <span className="flex items-center justify-center w-11 h-11 rounded-full bg-white">
          <Icon className="w-5 h-5 text-neutral-700" strokeWidth={2} />
        </span>
      ) : (
        <Icon className="w-9 h-9 text-white" strokeWidth={1.5} />
      )}
      <span className="text-[11px] text-white text-center leading-tight font-normal max-w-[80px]">
        {item.label}
      </span>
    </button>
  );
}

export function MobileAssistiveTouch() {
  const [open, setOpen] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [fabPos, setFabPos] = useState({ x: 16, y: 24 });
  const dragRef = useRef<{ startX: number; startY: number; origX: number; origY: number } | null>(null);
  const { user } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const shortcuts = useAssistiveShortcuts();

  useEffect(() => {
    setOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  const handleSelect = useCallback(
    (path: string) => {
      setOpen(false);
      if (path === CHAT_PATH && !user) {
        navigate(getAuthRedirectPath(CHAT_PATH), {
          state: { from: { pathname: CHAT_PATH } },
        });
        return;
      }
      navigate(path);
    },
    [navigate, user]
  );

  const onFabPointerDown = (e: React.PointerEvent) => {
    dragRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      origX: fabPos.x,
      origY: fabPos.y,
    };
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  };

  const onFabPointerMove = (e: React.PointerEvent) => {
    if (!dragRef.current) return;
    const dx = dragRef.current.startX - e.clientX;
    const dy = dragRef.current.startY - e.clientY;
    if (Math.abs(dx) > 6 || Math.abs(dy) > 6) setDragging(true);
    if (!dragging && Math.abs(dx) <= 6 && Math.abs(dy) <= 6) return;

    const maxX = Math.min(window.innerWidth - 64, Math.max(8, dragRef.current.origX + dx));
    const maxY = Math.min(window.innerHeight - 64, Math.max(80, dragRef.current.origY + dy));
    setFabPos({ x: maxX, y: maxY });
  };

  const onFabPointerUp = (e: React.PointerEvent) => {
    if (!dragging) setOpen((v) => !v);
    setDragging(false);
    dragRef.current = null;
    (e.target as HTMLElement).releasePointerCapture(e.pointerId);
  };

  if (location.pathname === '/auth') return null;

  return (
    <div className="md:hidden">
      {open && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 backdrop-blur-[2px] animate-in fade-in duration-200"
          onClick={() => setOpen(false)}
        >
          <div
            className="assistive-menu-panel relative w-[280px] h-[280px] rounded-[28px] bg-neutral-700/95 backdrop-blur-xl shadow-2xl animate-in zoom-in-95 duration-200"
            onClick={(e) => e.stopPropagation()}
            role="menu"
            aria-label="Quick shortcuts"
          >
            {shortcuts.map((item) => (
              <ShortcutButton key={item.id} item={item} onSelect={handleSelect} />
            ))}
          </div>
        </div>
      )}

      <button
        type="button"
        aria-label={open ? 'Close shortcuts' : 'Open shortcuts'}
        className={cn(
          'assistive-fab fixed z-[101] w-[58px] h-[58px] rounded-full',
          'bg-white/90 backdrop-blur-md border border-black/10 shadow-lg',
          'flex items-center justify-center touch-none select-none',
          'active:scale-95 transition-transform',
          open && 'ring-2 ring-primary/40'
        )}
        style={{ right: fabPos.x, bottom: fabPos.y }}
        onPointerDown={onFabPointerDown}
        onPointerMove={onFabPointerMove}
        onPointerUp={onFabPointerUp}
        onPointerCancel={onFabPointerUp}
      >
        <span className="assistive-fab-inner w-[46px] h-[46px] rounded-full border-[2.5px] border-neutral-400/80 flex items-center justify-center bg-neutral-100/80">
          <span className="w-[34px] h-[34px] rounded-full border border-neutral-400/60" />
        </span>
      </button>
    </div>
  );
}
