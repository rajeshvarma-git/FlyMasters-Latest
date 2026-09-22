import { NavLink, Outlet } from "react-router-dom";
import {
  Bell,
  BellRing,
  Building2,
  FileText,
  Flag,
  Eye,
  History,
  ListChecks,
  MessageSquareText,
  ScrollText,
  Workflow,
  Handshake,
  Receipt,
  ClipboardList,
  GraduationCap,
  AlarmClock,
  HelpCircle,
  LayoutDashboard,
  LogOut,
  Menu,
  Plane,
  Phone,
  PhoneCall,
  Shield,
  Users,
  Wallet,
  X,
} from "lucide-react";
import { useEffect, useState } from "react";
import { api } from "@admin/lib/api";
import { useAuth } from "@admin/context/AuthContext";
import { displayName, initials, isConvertedStudent, openLeadNeedsOwner } from "@admin/lib/utils";
import { Button } from "@admin/components/ui/Button";
import { useAdminStore } from "@admin/lib/store";
import NotificationBell from "@admin/components/NotificationBell";
import AlertCenter from "@shared/components/AlertCenter";

/**
 * Menu visibility by role.
 *
 * Branch heads get the operational screens for their own branches (the data
 * itself is scoped server-side, this only hides what is irrelevant).
 * Accountants get HR and finance only — the CRM document limits them to
 * payroll, commissions, invoices and payouts.
 */
const ALL = ["admin", "super_admin", "branch_head", "accountant"];
const OPERATIONS = ["admin", "super_admin", "branch_head"];
const ADMIN_ONLY = ["admin", "super_admin"];

const groups = [
  {
    title: "Overview",
    roles: OPERATIONS,
    items: [
      { to: "/", label: "Dashboard", icon: LayoutDashboard, end: true },
      { to: "/alerts", label: "Lead Alerts", icon: AlarmClock, end: false },
    ],
  },
  {
    title: "CRM",
    roles: OPERATIONS,
    items: [
      { to: "/leads", label: "Leads", icon: PhoneCall, end: false },
      { to: "/telecallers", label: "Telecallers", icon: Phone, end: false },
      { to: "/students", label: "Students", icon: GraduationCap, end: false },
      { to: "/counselors", label: "Counselors", icon: Shield, end: false },
    ],
  },
  {
    title: "People",
    roles: OPERATIONS,
    items: [
      { to: "/users", label: "Users", icon: Users, end: false },
      { to: "/branches", label: "Branches", icon: Building2, end: false, roles: ADMIN_ONLY },
      { to: "/partners", label: "Agents & Freelancers", icon: Handshake, end: false, roles: OPERATIONS },
    ],
  },
  {
    title: "Finance & HR",
    roles: ALL,
    items: [
      { to: "/finance", label: "Commissions", icon: Receipt, end: false },
      { to: "/hr", label: "HR & Payroll", icon: Wallet, end: false },
    ],
  },
  {
    // CRM 2.6 — what the Super Admin configures once and every branch then uses.
    title: "Catalog & setup",
    roles: OPERATIONS,
    items: [
      { to: "/universities", label: "Universities", icon: Plane, end: false },
      { to: "/documents-master", label: "Document master", icon: FileText, end: false, roles: ADMIN_ONLY },
      { to: "/checklist-builder", label: "Country checklists", icon: ClipboardList, end: false, roles: ADMIN_ONLY },
      { to: "/statuses", label: "Status words", icon: ListChecks, end: false, roles: ADMIN_ONLY },
      { to: "/checklists", label: "Document lists (legacy)", icon: ClipboardList, end: false, roles: ADMIN_ONLY },
    ],
  },
  {
    // CRM 2.7 — everything that leaves the platform as a message.
    title: "Communication",
    roles: OPERATIONS,
    items: [
      { to: "/templates", label: "Message templates", icon: MessageSquareText, end: false, roles: ADMIN_ONLY },
      { to: "/automation", label: "Automation", icon: Workflow, end: false, roles: ADMIN_ONLY },
      { to: "/comms-log", label: "Delivery log", icon: ScrollText, end: false },
      { to: "/supervision", label: "Chat supervision", icon: Eye, end: false, roles: ADMIN_ONLY },
      { to: "/escalations", label: "Reported chats", icon: Flag, end: false, roles: ADMIN_ONLY },
    ],
  },
  {
    title: "System",
    roles: OPERATIONS,
    items: [
      { to: "/notifications", label: "Notifications", icon: Bell, end: false },
      { to: "/alert-settings", label: "Alerts", icon: BellRing, end: false },
      { to: "/change-history", label: "Change history", icon: History, end: false, developerOnly: true },
      { to: "/help", label: "Help", icon: HelpCircle, end: false },
    ],
  },
];

export default function AdminLayout() {
  const { user, signOut } = useAuth();
  const [open, setOpen] = useState(false);
  // The configuration history is the developer's, not the whole office's.
  // The server decides; this only hides the menu entry so nobody meets a 403.
  const [isDeveloper, setIsDeveloper] = useState(false);
  useEffect(() => {
    void api<{ developer: boolean }>("/me/capabilities")
      .then((data) => setIsDeveloper(Boolean(data.developer)))
      .catch(() => setIsDeveloper(false));
  }, []);
  const store = useAdminStore();
  const pendingDocs = store.documents.filter((item) => item.status === "uploaded" || item.status === "pending").length;
  const pendingLeave = store.leave.filter((item) => item.status === "pending").length;
  const unassigned = store.leads.filter((item) => isConvertedStudent(item) && !item.assigned_counselor_id).length;
  const noTelecaller = store.leads.filter((item) => openLeadNeedsOwner(item)).length;

  const Nav = () => (
    <>
      <div className="flex items-center gap-3 border-b border-white/10 p-4">
        <div className="flex h-9 w-9 items-center justify-center rounded-full bg-sky-500 text-white">
          <Shield className="h-5 w-5" />
        </div>
        <div>
          <p className="text-sm font-semibold text-white">Admin Portal</p>
          <p className="text-xs text-slate-400">Fly Masters</p>
        </div>
      </div>
      <nav className="flex-1 overflow-y-auto py-4">
        {groups
          .filter((group) => !group.roles || group.roles.includes(String(user?.role)))
          .map((group) => ({
            ...group,
            items: group.items.filter(
              (item: any) =>
                (!item.roles || item.roles.includes(String(user?.role))) &&
                (!item.developerOnly || isDeveloper),
            ),
          }))
          .filter((group) => group.items.length > 0)
          .map((group) => (
          <div key={group.title} className="mb-3">
            <p className="px-4 pb-2 text-[11px] font-semibold uppercase tracking-wider text-slate-400">{group.title}</p>
            {group.items.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.end}
                onClick={() => setOpen(false)}
                className={({ isActive }) =>
                  `mx-2 mb-1 flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm ${
                    isActive ? "bg-white/10 text-white" : "text-slate-300 hover:bg-white/5"
                  }`
                }
              >
                <item.icon className="h-4 w-4" />
                {item.label}
                {item.label === "Documents" && pendingDocs > 0 && (
                  <span className="ml-auto rounded-full bg-sky-500 px-1.5 text-[10px] font-bold text-white">{pendingDocs}</span>
                )}
                {item.label === "Counselors" && unassigned > 0 && (
                  <span className="ml-auto rounded-full bg-gold-500 px-1.5 text-[10px] font-bold text-navy-950">{unassigned}</span>
                )}
                {item.label === "Lead Alerts" && noTelecaller > 0 && (
                  <span className="ml-auto rounded-full bg-rose-500 px-1.5 text-[10px] font-bold text-white">{noTelecaller}</span>
                )}
                {item.label === "HR" && pendingLeave > 0 && (
                  <span className="ml-auto rounded-full bg-gold-500 px-1.5 text-[10px] font-bold text-navy-950">{pendingLeave}</span>
                )}
              </NavLink>
            ))}
          </div>
        ))}
      </nav>
      <div className="border-t border-white/10 p-4">
        <div className="mb-3 flex items-center gap-3">
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-sky-500/20 text-xs font-bold text-sky-300">
            {initials(user?.firstName, user?.lastName, user?.email)}
          </div>
          <div className="min-w-0">
            <p className="truncate text-sm font-medium text-white">{displayName(user?.firstName, user?.lastName)}</p>
            <p className="text-xs capitalize text-slate-400">{user?.role?.replace("_", " ")}</p>
          </div>
        </div>
        <Button
          variant="ghost"
          size="sm"
          className="w-full justify-start text-slate-300 hover:bg-white/10"
          onClick={() => {
            void signOut();
          }}
        >
          <LogOut className="h-4 w-4" /> Sign out
        </Button>
      </div>
    </>
  );

  return (
    <div className="flex min-h-screen bg-slate-50">
      <Button variant="ghost" size="sm" className="fixed left-3 top-3 z-50 md:hidden" onClick={() => setOpen(!open)}>
        {open ? <X /> : <Menu />}
      </Button>
      <aside className="hidden w-64 flex-col bg-navy-950 md:flex">
        <Nav />
      </aside>
      {open && (
        <>
          <div className="fixed inset-0 z-40 bg-black/50 md:hidden" onClick={() => setOpen(false)} />
          <aside className="fixed left-0 top-0 z-50 flex h-full w-64 flex-col bg-navy-950 md:hidden">
            <Nav />
          </aside>
        </>
      )}
      <main className="flex-1 overflow-y-auto">
        <div className="sticky top-0 z-30 flex items-center justify-end border-b border-slate-200 bg-slate-50 px-4 py-2 md:px-8">
          <NotificationBell />
            <AlertCenter fetchJson={api} />
        </div>
        <div className="p-4 pt-14 md:p-8 md:pt-8">
        {store.error && (
          <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
            {store.error}
          </div>
        )}
        <Outlet />
        </div>
      </main>
    </div>
  );
}
