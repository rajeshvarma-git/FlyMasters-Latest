import { NavLink, Outlet } from "react-router-dom";
import { useEffect, useState } from "react";
import {
  Bell, CalendarDays, CheckCircle2, Clock, IndianRupee, LogOut, MessageCircle, PhoneCall, User,
} from "lucide-react";
import { useAuth } from "@telecaller/context/AuthContext";
import { displayName, initials, isConvertedStudent } from "@telecaller/lib/utils";
import { useStore } from "@telecaller/lib/store";
import AlertCenter from "@shared/components/AlertCenter";
import { useCaseUnread } from "@shared/lib/useCaseUnread";
import { api } from "@telecaller/lib/api";

const work = [
  { to: "/queue", label: "My queue", icon: PhoneCall },
  { to: "/chat", label: "Student Chat", icon: MessageCircle },
  { to: "/converted", label: "Converted", icon: CheckCircle2 },
  { to: "/notifications", label: "Notifications", icon: Bell },
];
const profileItem = { to: "/profile", label: "My Profile", icon: User };
// Shown only when the server says telecaller HR is switched on.
const hrItems = [
  { to: "/attendance", label: "Attendance", icon: Clock },
  { to: "/leave", label: "Leave", icon: CalendarDays },
  { to: "/salary", label: "Salary", icon: IndianRupee },
];

export default function Layout() {
  const { user, signOut } = useAuth();
  const store = useStore();
  const [hrOn, setHrOn] = useState(false);
  useEffect(() => {
    api<{ hr: boolean }>("/telecaller/me/features").then((d) => setHrOn(Boolean(d.hr))).catch(() => setHrOn(false));
  }, []);
  const me = hrOn ? [profileItem, ...hrItems] : [profileItem];
  const all = [...work, ...me];
  const open = store.leads.filter((lead) => !isConvertedStudent(lead)).length;
  // Same count as the per-student badges in Student Chat.
  const unreadChats = useCaseUnread();
  const [alertCount, setAlertCount] = useState(0);
  const unreadNotices = store.notifications.filter((n) => !n.is_read).length + alertCount;

  const badge = (label: string) => {
    if (label === "My queue" && open > 0) return { n: open, tone: "bg-sky-500" };
    if (label === "Student Chat" && unreadChats > 0) return { n: unreadChats, tone: "bg-sky-500" };
    if (label === "Notifications" && unreadNotices > 0) return { n: unreadNotices, tone: "bg-rose-500" };
    return null;
  };

  const link = (item: (typeof all)[number]) => {
    const b = badge(item.label);
    return (
      <NavLink
        key={item.to}
        to={item.to}
        className={({ isActive }) =>
          `flex items-center gap-3 rounded-lg px-3 py-2 text-sm ${
            isActive ? "bg-white/10 text-white" : "text-slate-300 hover:bg-white/5"
          }`
        }
      >
        <item.icon className="h-4 w-4" />
        <span className="flex-1">{item.label}</span>
        {b && <span className={`rounded-full ${b.tone} px-1.5 text-[10px] font-bold text-white`}>{b.n}</span>}
      </NavLink>
    );
  };

  return (
    <div className="min-h-screen bg-slate-50 md:flex">
      {/* Left sidebar replaces the old top header; same pattern as the counselor portal. */}
      <aside className="hidden w-60 shrink-0 flex-col bg-navy-950 md:sticky md:top-0 md:flex md:h-screen">
        <div className="flex items-center gap-3 px-4 py-4">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-sky-500 text-white">
            <PhoneCall className="h-5 w-5" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-white">Telecaller</p>
            <p className="truncate text-xs text-slate-400">{displayName(user?.firstName, user?.lastName, user?.email)}</p>
          </div>
        </div>
        <nav className="flex-1 space-y-1 overflow-y-auto px-3 pb-3">
          <p className="px-3 pb-1 pt-2 text-[10px] font-semibold uppercase tracking-wide text-slate-500">Work</p>
          {work.map(link)}
          <p className="px-3 pb-1 pt-4 text-[10px] font-semibold uppercase tracking-wide text-slate-500">Me</p>
          {me.map(link)}
        </nav>
        <div className="flex items-center gap-2 border-t border-white/10 px-3 py-3">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-sky-500/20 text-xs font-bold text-sky-300">
            {initials(user?.firstName, user?.lastName, user?.email)}
          </div>
          <div className="flex-1"><AlertCenter fetchJson={api} hideBadge onUnread={setAlertCount} /></div>
          <button onClick={signOut} className="rounded-lg p-2 text-slate-300 transition hover:bg-white/10" aria-label="Sign out">
            <LogOut className="h-4 w-4" />
          </button>
        </div>
      </aside>

      <main className="min-w-0 flex-1 px-4 py-5 pb-20 md:pb-5">
        <div className="mx-auto max-w-5xl">
          {store.error && (
            <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
              {store.error}
            </div>
          )}
          <Outlet />
        </div>
      </main>

      {/* Phones: one scrollable bar under the thumb, plus sign out. */}
      <nav className="fixed bottom-0 left-0 right-0 z-30 flex overflow-x-auto border-t border-slate-200 bg-white md:hidden">
        {all.map((item) => {
          const b = badge(item.label);
          return (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) =>
                `relative flex min-w-[76px] flex-1 flex-col items-center gap-1 py-2.5 text-[11px] font-semibold ${
                  isActive ? "text-sky-600" : "text-slate-500"
                }`
              }
            >
              <item.icon className="h-5 w-5" />
              {item.label}
              {b && <span className={`absolute right-3 top-1 rounded-full ${b.tone} px-1 text-[9px] font-bold text-white`}>{b.n}</span>}
            </NavLink>
          );
        })}
        <button onClick={signOut} className="flex min-w-[76px] flex-1 flex-col items-center gap-1 py-2.5 text-[11px] font-semibold text-slate-500">
          <LogOut className="h-5 w-5" />
          Sign out
        </button>
      </nav>
    </div>
  );
}
