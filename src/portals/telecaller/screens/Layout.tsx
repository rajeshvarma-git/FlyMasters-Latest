import { NavLink, Outlet } from "react-router-dom";
import { CheckCircle2, LogOut, MessageCircle, PhoneCall, Smartphone } from "lucide-react";
import { useAuth } from "@telecaller/context/AuthContext";
import { displayName, initials, isConvertedStudent, isSystemWhatsAppMessage } from "@telecaller/lib/utils";
import { useStore } from "@telecaller/lib/store";
import NotificationBell from "@telecaller/components/NotificationBell";
import AlertCenter from "@shared/components/AlertCenter";
import { api } from "@telecaller/lib/api";

const items = [
  { to: "/queue", label: "My queue", icon: PhoneCall },
  { to: "/whatsapp", label: "WhatsApp", icon: Smartphone },
  { to: "/chat", label: "Chat", icon: MessageCircle },
  { to: "/converted", label: "Converted", icon: CheckCircle2 },
];

export default function Layout() {
  const { user, signOut } = useAuth();
  const store = useStore();
  const open = store.leads.filter((lead) => !isConvertedStudent(lead)).length;
  const unreadChats = store.messages.filter(
    (m) => String(m.receiver_id) === String(user?.id) && !m.is_read,
  ).length;
  const unreadWhatsApp = store.whatsappMessages.filter(
    (m) => m.direction === "inbound" && !m.is_read && !isSystemWhatsAppMessage(m),
  ).length;

  return (
    <div className="min-h-screen bg-slate-50 pb-16 md:pb-0">
      <header className="sticky top-0 z-30 border-b border-white/10 bg-navy-950">
        <div className="mx-auto flex max-w-5xl items-center gap-3 px-4 py-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-sky-500 text-white">
            <PhoneCall className="h-5 w-5" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-white">Telecaller</p>
            <p className="truncate text-xs text-slate-400">
              {displayName(user?.firstName, user?.lastName, user?.email)}
            </p>
          </div>

          <nav className="hidden gap-1 md:flex">
            {items.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                className={({ isActive }) =>
                  `flex items-center gap-2 rounded-lg px-3 py-2 text-sm ${
                    isActive ? "bg-white/10 text-white" : "text-slate-300 hover:bg-white/5"
                  }`
                }
              >
                <item.icon className="h-4 w-4" />
                {item.label}
                {item.label === "My queue" && open > 0 && (
                  <span className="rounded-full bg-sky-500 px-1.5 text-[10px] font-bold text-white">{open}</span>
                )}
                {item.label === "WhatsApp" && unreadWhatsApp > 0 && (
                  <span className="rounded-full bg-emerald-500 px-1.5 text-[10px] font-bold text-white">{unreadWhatsApp}</span>
                )}
                {item.label === "Chat" && unreadChats > 0 && (
                  <span className="rounded-full bg-sky-500 px-1.5 text-[10px] font-bold text-white">{unreadChats}</span>
                )}
              </NavLink>
            ))}
          </nav>

          <NotificationBell />
          <AlertCenter fetchJson={api} />
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-sky-500/20 text-xs font-bold text-sky-300">
            {initials(user?.firstName, user?.lastName, user?.email)}
          </div>
          <button
            onClick={signOut}
            className="rounded-lg p-2 text-slate-300 transition hover:bg-white/10"
            aria-label="Sign out"
          >
            <LogOut className="h-4 w-4" />
          </button>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-4 py-5">
        {store.error && (
          <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
            {store.error}
          </div>
        )}
        <Outlet />
      </main>

      {/* Telecallers work on phones, so navigation sits under the thumb. */}
      <nav className="fixed bottom-0 left-0 right-0 z-30 grid grid-cols-4 border-t border-slate-200 bg-white md:hidden">
        {items.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            className={({ isActive }) =>
              `flex flex-col items-center gap-1 py-2.5 text-[11px] font-semibold ${
                isActive ? "text-sky-600" : "text-slate-500"
              }`
            }
          >
            <item.icon className="h-5 w-5" />
            {item.label}
            {item.label === "WhatsApp" && unreadWhatsApp > 0 && (
              <span className="rounded-full bg-emerald-500 px-1 text-[9px] font-bold text-white">{unreadWhatsApp}</span>
            )}
          </NavLink>
        ))}
      </nav>
    </div>
  );
}
