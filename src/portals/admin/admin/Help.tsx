import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  BookOpen,
  ChevronDown,
  HelpCircle,
  Mail,
  PhoneCall,
  Search,
  Shield,
  Users,
} from "lucide-react";
import { Card } from "@admin/components/ui/Card";
import { Input } from "@admin/components/ui/Field";

const guides = [
  {
    title: "Getting started",
    description: "Learn the admin portal layout, roles, and daily workflow.",
    icon: BookOpen,
    to: "/",
  },
  {
    title: "Leads & CRM",
    description: "Manage leads, telecallers, students, and counselor assignment.",
    icon: PhoneCall,
    to: "/leads",
  },
  {
    title: "Users & HR",
    description: "Add users, manage counselors, and review leave requests.",
    icon: Users,
    to: "/users",
  },
  {
    title: "Catalog & docs",
    description: "Maintain universities, document lists, and notifications.",
    icon: Shield,
    to: "/universities",
  },
];

const faqs = [
  {
    q: "How do I convert a lead to a student?",
    a: "Open the lead from Leads, review the captured details, then use the convert action. After conversion, assign a country counselor from the Counselors page.",
  },
  {
    q: "How do I assign a telecaller to a lead?",
    a: "Go to Leads or Lead Alerts, open the lead, and pick a telecaller from the assignment field. Unassigned leads also appear on the Lead Alerts page.",
  },
  {
    q: "Where do I review uploaded documents?",
    a: "Student documents are managed through the student and counselor websites. Use the Students page to open a profile and track progress.",
  },
  {
    q: "How do I send a notification to all students?",
    a: "Open Notifications under System, choose the audience (students, counselors, everyone, or one person), write the message, and send.",
  },
  {
    q: "Who can access the admin portal?",
    a: "Only users with the admin role can sign in. Manage accounts from Users under People.",
  },
  {
    q: "What should I do if a page fails to load?",
    a: "Reload the page first. If the issue continues, sign out and sign back in. For persistent errors, contact your system administrator.",
  },
];

export default function Help() {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState<string | null>(faqs[0]?.q ?? null);

  const filtered = useMemo(() => {
    const term = query.trim().toLowerCase();
    if (!term) return faqs;
    return faqs.filter(
      (item) => item.q.toLowerCase().includes(term) || item.a.toLowerCase().includes(term),
    );
  }, [query]);

  return (
    <div>
      <div className="mb-6 flex items-center gap-3">
        <HelpCircle className="h-6 w-6 text-sky-500" />
        <div>
          <h1 className="text-2xl font-bold">Help & Support</h1>
          <p className="text-slate-600">Guides, answers, and contact options for the Fly Masters admin portal.</p>
        </div>
      </div>

      <Card className="mb-6 p-4">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <Input
            className="pl-9"
            placeholder="Search help topics..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
      </Card>

      <div className="mb-6 grid gap-4 sm:grid-cols-2">
        {guides.map((item) => (
          <Link key={item.title} to={item.to}>
            <Card className="h-full p-5 transition hover:-translate-y-0.5 hover:border-sky-100">
              <item.icon className="h-5 w-5 text-sky-500" />
              <p className="mt-3 font-semibold">{item.title}</p>
              <p className="mt-1 text-sm text-slate-600">{item.description}</p>
            </Card>
          </Link>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="p-5 lg:col-span-2">
          <p className="font-semibold">Frequently asked questions</p>
          <div className="mt-4 space-y-2">
            {filtered.length === 0 && (
              <p className="text-sm text-slate-500">No matching questions. Try a different search term.</p>
            )}
            {filtered.map((item) => {
              const expanded = open === item.q;
              return (
                <div key={item.q} className="rounded-xl border border-slate-100">
                  <button
                    type="button"
                    className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left text-sm font-medium"
                    onClick={() => setOpen(expanded ? null : item.q)}
                  >
                    {item.q}
                    <ChevronDown className={`h-4 w-4 shrink-0 text-slate-400 transition ${expanded ? "rotate-180" : ""}`} />
                  </button>
                  {expanded && <p className="border-t border-slate-100 px-4 py-3 text-sm text-slate-600">{item.a}</p>}
                </div>
              );
            })}
          </div>
        </Card>

        <Card className="p-5">
          <p className="font-semibold">Need more help?</p>
          <p className="mt-2 text-sm text-slate-600">
            Contact the Fly Masters support team if you cannot find what you need here.
          </p>
          <div className="mt-4 space-y-3 text-sm">
            <div className="flex items-start gap-3">
              <Mail className="mt-0.5 h-4 w-4 text-sky-500" />
              <div>
                <p className="font-medium">Email</p>
                <a href="mailto:support@flymasters.com" className="text-sky-600 hover:underline">
                  support@flymasters.com
                </a>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <PhoneCall className="mt-0.5 h-4 w-4 text-sky-500" />
              <div>
                <p className="font-medium">Support hours</p>
                <p className="text-slate-600">Mon–Sat, 9:00 AM – 6:00 PM IST</p>
              </div>
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
}
