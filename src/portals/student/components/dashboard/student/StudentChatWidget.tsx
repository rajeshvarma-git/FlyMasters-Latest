import { useCallback, useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { GripHorizontal, Maximize2, MessageCircle, X, Bot, Headphones, GraduationCap } from 'lucide-react';
import ErrorBoundary from '@student/components/ErrorBoundary';
import type { CaseOwner } from '@student/lib/caseChatApi';
import { StudentCaseChat } from './StudentCaseChat';

/**
 * Floating chat button (bottom-right by default) that opens the student's
 * one conversation as a panel over any page. The button — and the panel's
 * top bar — can be dragged anywhere on screen; the spot is remembered in
 * this browser. Hidden on the Messages page (the full chat is already
 * open there) and on phones, which have their own bottom nav.
 */

const BUTTON = 60;
const MARGIN = 12;
const PANEL_W = 400;
const STORAGE_KEY = 'fm.student.chatWidget.pos.v1';

type Pos = { right: number; bottom: number };

function readPos(): Pos {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const p = JSON.parse(raw);
      if (typeof p.right === 'number' && typeof p.bottom === 'number') return p;
    }
  } catch {
    /* storage blocked — use the default spot */
  }
  return { right: 28, bottom: 28 };
}

function clampPos(p: Pos): Pos {
  const maxRight = Math.max(MARGIN, window.innerWidth - BUTTON - MARGIN);
  const maxBottom = Math.max(MARGIN, window.innerHeight - BUTTON - MARGIN);
  return {
    right: Math.min(Math.max(p.right, MARGIN), maxRight),
    bottom: Math.min(Math.max(p.bottom, MARGIN), maxBottom),
  };
}

function ownerLine(owner: CaseOwner | null) {
  if (!owner || owner.role === 'ai') return 'AI Advisor is helping you';
  return `${owner.name} (${owner.role === 'telecaller' ? 'Telecaller' : 'Counselor'}) is helping you`;
}

export function StudentChatWidget({ unread }: { unread: number }) {
  const location = useLocation();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<Pos>(() => clampPos(readPos()));
  const [owner, setOwner] = useState<CaseOwner | null>(null);
  const drag = useRef<{ x: number; y: number; start: Pos; moved: boolean } | null>(null);
  const [, forceResize] = useState(0);

  useEffect(() => {
    const onResize = () => {
      setPos((p) => clampPos(p));
      forceResize((n) => n + 1);
    };
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  const savePos = (p: Pos) => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(p));
    } catch {
      /* ignore */
    }
  };

  const onPointerMove = useCallback((e: PointerEvent) => {
    const d = drag.current;
    if (!d) return;
    const dx = e.clientX - d.x;
    const dy = e.clientY - d.y;
    if (!d.moved && Math.abs(dx) + Math.abs(dy) < 5) return;
    d.moved = true;
    setPos(clampPos({ right: d.start.right - dx, bottom: d.start.bottom - dy }));
  }, []);

  const endDrag = useCallback(
    (toggleOnClick: boolean) => {
      const d = drag.current;
      drag.current = null;
      window.removeEventListener('pointermove', onPointerMove);
      if (!d) return;
      if (d.moved) {
        setPos((p) => {
          savePos(p);
          return p;
        });
      } else if (toggleOnClick) {
        setOpen((o) => !o);
      }
    },
    [onPointerMove],
  );

  const startDrag = (e: React.PointerEvent, toggleOnClick: boolean) => {
    if (e.button !== 0) return;
    drag.current = { x: e.clientX, y: e.clientY, start: pos, moved: false };
    window.addEventListener('pointermove', onPointerMove);
    const up = () => {
      window.removeEventListener('pointerup', up);
      endDrag(toggleOnClick);
    };
    window.addEventListener('pointerup', up);
  };

  const hidden = location.pathname.startsWith('/student/messages') || location.pathname.startsWith('/student/chat') || location.pathname.startsWith('/student/telecaller-chat');
  useEffect(() => {
    if (hidden) setOpen(false);
  }, [hidden]);
  if (hidden) return null;

  // Panel opens above/below the button when there's room, otherwise beside
  // it — never on top of it.
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const panelH = Math.min(600, vh - MARGIN * 2);
  const btnLeft = vw - pos.right - BUTTON;
  const btnTop = vh - pos.bottom - BUTTON;
  const onRight = btnLeft + BUTTON / 2 > vw / 2;
  const onBottom = btnTop + BUTTON / 2 > vh / 2;
  const clampX = (x: number) => Math.min(Math.max(MARGIN, x), vw - PANEL_W - MARGIN);
  const clampY = (y: number) => Math.min(Math.max(MARGIN, y), vh - panelH - MARGIN);
  const spaceAbove = btnTop - MARGIN - 12;
  const spaceBelow = vh - (btnTop + BUTTON) - MARGIN - 12;
  let panelLeft: number;
  let panelTop: number;
  if (onBottom && spaceAbove >= panelH) {
    panelLeft = clampX(onRight ? btnLeft + BUTTON - PANEL_W : btnLeft);
    panelTop = btnTop - 12 - panelH;
  } else if (!onBottom && spaceBelow >= panelH) {
    panelLeft = clampX(onRight ? btnLeft + BUTTON - PANEL_W : btnLeft);
    panelTop = btnTop + BUTTON + 12;
  } else {
    panelLeft = clampX(onRight ? btnLeft - 12 - PANEL_W : btnLeft + BUTTON + 12);
    panelTop = clampY(onBottom ? btnTop + BUTTON - panelH : btnTop);
  }
  const OwnerIcon = !owner || owner.role === 'ai' ? Bot : owner.role === 'telecaller' ? Headphones : GraduationCap;

  return (
    <div className="hidden md:block">
      {open && (
        <div
          className="fixed z-[60] flex flex-col overflow-hidden rounded-2xl border border-border/60 bg-background shadow-2xl animate-scale-in"
          style={{ left: panelLeft, top: panelTop, width: PANEL_W, height: panelH }}
          role="dialog"
          aria-label="Fly Masters chat"
        >
          <div
            className="flex flex-none cursor-move select-none items-center gap-3 bg-gradient-primary px-3 py-2.5 text-white"
            onPointerDown={(e) => startDrag(e, false)}
            title="Drag to move"
          >
            <GripHorizontal className="h-4 w-4 opacity-80" />
            <span className="flex h-8 w-8 items-center justify-center rounded-full bg-white/25">
              <OwnerIcon className="h-4 w-4" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold leading-tight">Fly Masters chat</p>
              <p className="truncate text-xs opacity-90">{ownerLine(owner)}</p>
            </div>
            <button
              type="button"
              onPointerDown={(e) => e.stopPropagation()}
              onClick={() => {
                setOpen(false);
                navigate('/student/messages');
              }}
              className="rounded-md p-1.5 hover:bg-white/20"
              title="Open full page"
              aria-label="Open full page"
            >
              <Maximize2 className="h-4 w-4" />
            </button>
            <button
              type="button"
              onPointerDown={(e) => e.stopPropagation()}
              onClick={() => setOpen(false)}
              className="rounded-md p-1.5 hover:bg-white/20"
              title="Close"
              aria-label="Close chat"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
          <div className="min-h-0 flex-1">
            <ErrorBoundary>
              <StudentCaseChat
                compact
                onOwnerChange={setOwner}
                onOpenFull={() => {
                  setOpen(false);
                  navigate('/student/messages');
                }}
              />
            </ErrorBoundary>
          </div>
        </div>
      )}

      <button
        type="button"
        onPointerDown={(e) => startDrag(e, true)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            setOpen((o) => !o);
          }
        }}
        className="fixed z-[61] flex touch-none select-none items-center justify-center rounded-full bg-gradient-primary text-white shadow-xl transition-transform hover:scale-105 cursor-grab active:cursor-grabbing"
        style={{ right: pos.right, bottom: pos.bottom, width: BUTTON, height: BUTTON }}
        aria-label={open ? 'Close chat' : 'Open chat'}
        title={open ? 'Close chat' : 'Chat with Fly Masters — drag to move'}
      >
        {open ? <X className="h-6 w-6" /> : <MessageCircle className="h-7 w-7" />}
        {!open && unread > 0 && (
          <span className="absolute -right-0.5 -top-0.5 flex h-5 min-w-[20px] items-center justify-center rounded-full border-2 border-background bg-destructive px-1 text-[11px] font-bold">
            {unread > 99 ? '99+' : unread}
          </span>
        )}
      </button>
    </div>
  );
}
