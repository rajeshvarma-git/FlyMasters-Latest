// import { useMemo, useState } from "react";
// import { Link } from "react-router-dom";
// import { ChevronRight, PhoneCall } from "lucide-react";
// import { useStore } from "@telecaller/lib/store";
// import { daysSince, displayName, initials, isConvertedStudent, today } from "@telecaller/lib/utils";
// import { Badge } from "@telecaller/components/ui/Badge";
// import { Card } from "@telecaller/components/ui/Card";
// import { Input, Select } from "@telecaller/components/ui/Field";
// import type { Lead } from "@telecaller/lib/types";

// const STALE_DAYS = 2;

// /** Overdue follow-ups first, then never-called, then longest since contact. */
// function urgency(lead: Lead) {
//   if (lead.next_follow_up_date && lead.next_follow_up_date.slice(0, 10) <= today()) return 3000;
//   if (!lead.last_contact_date) return 2000 + (daysSince(lead.created_at) ?? 0);
//   return daysSince(lead.last_contact_date) ?? 0;
// }

// function waitLabel(lead: Lead): { text: string; late: boolean } {
//   if (lead.next_follow_up_date) {
//     const due = lead.next_follow_up_date.slice(0, 10);
//     if (due < today()) return { text: `Follow-up overdue since ${due}`, late: true };
//     if (due === today()) return { text: "Follow-up due today", late: true };
//     return { text: `Follow-up ${due}`, late: false };
//   }
//   if (!lead.last_contact_date) {
//     const d = daysSince(lead.created_at);
//     return { text: d === null ? "Never called" : `Never called · ${d}d old`, late: (d ?? 0) >= STALE_DAYS };
//   }
//   const d = daysSince(lead.last_contact_date) ?? 0;
//   return { text: d === 0 ? "Called today" : `Last called ${d}d ago`, late: d >= STALE_DAYS };
// }

// export default function Queue() {
//   const store = useStore();
//   const [query, setQuery] = useState("");
//   const [status, setStatus] = useState("all");

//   const open = useMemo(() => store.leads.filter((lead) => !isConvertedStudent(lead)), [store.leads]);

//   const leads = useMemo(() => {
//     const q = query.trim().toLowerCase();
//     return open
//       .filter((lead) => status === "all" || lead.lead_status === status)
//       .filter((lead) => `${lead.first_name} ${lead.last_name} ${lead.email} ${lead.phone}`.toLowerCase().includes(q))
//       .sort((a, b) => urgency(b) - urgency(a));
//   }, [open, query, status]);

//   const dueNow = open.filter((lead) => waitLabel(lead).late).length;

//   return (
//     <div>
//       <div className="mb-5 flex items-center gap-3">
//         <PhoneCall className="h-6 w-6 shrink-0 text-sky-500" />
//         <div>
//           <h1 className="text-xl font-bold sm:text-2xl">My queue</h1>
//           <p className="text-sm text-slate-600">Most urgent first. Call, log the outcome, then qualify.</p>
//         </div>
//       </div>

//       {dueNow > 0 && (
//         <Card className="mb-4 border-rose-200 bg-rose-50 p-4 text-sm text-rose-800">
//           {dueNow} lead{dueNow === 1 ? "" : "s"} need{dueNow === 1 ? "s" : ""} a call today.
//         </Card>
//       )}

//       <div className="mb-4 flex flex-wrap gap-3">
//         <Input
//           className="max-w-sm"
//           placeholder="Search name, email, phone..."
//           value={query}
//           onChange={(e) => setQuery(e.target.value)}
//         />
//         <Select className="w-36" value={status} onChange={(e) => setStatus(e.target.value)}>
//           <option value="all">All statuses</option>
//           <option value="hot">Hot</option>
//           <option value="warm">Warm</option>
//           <option value="cold">Cold</option>
//         </Select>
//       </div>

//       <Card className="overflow-hidden">
//         {leads.map((lead) => {
//           const wait = waitLabel(lead);
//           return (
//             <Link
//               key={lead.id}
//               to={`/leads/${lead.id}`}
//               className="flex items-center gap-3 border-b border-slate-100 px-4 py-3.5 transition last:border-b-0 hover:bg-slate-50"
//             >
//               <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-navy-900 text-sm font-bold text-white">
//                 {initials(lead.first_name, lead.last_name, lead.email)}
//               </span>
//               <span className="min-w-0 flex-1">
//                 <span className="block truncate font-semibold">
//                   {displayName(lead.first_name, lead.last_name, lead.email)}
//                 </span>
//                 <span className="block truncate text-sm text-slate-500">{lead.phone || "No phone"}</span>
//                 <span className={`mt-0.5 block truncate text-xs ${wait.late ? "font-semibold text-rose-600" : "text-slate-400"}`}>
//                   {wait.text}
//                 </span>
//               </span>
//               <span className="flex shrink-0 items-center gap-2">
//                 <Badge value={lead.lead_status || "warm"} />
//                 <ChevronRight className="h-5 w-5 text-slate-300" />
//               </span>
//             </Link>
//           );
//         })}
//         {leads.length === 0 && (
//           <p className="p-8 text-center text-sm text-slate-500">
//             {query || status !== "all"
//               ? "No leads match this filter."
//               : "Nothing in your queue. Leads appear here when an admin assigns them to you."}
//           </p>
//         )}
//       </Card>
//     </div>
//   );
// }

import { FormEvent, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ChevronRight, PhoneCall, Plus, X } from "lucide-react";
import { api } from "@telecaller/lib/api";
import { refreshStore, useStore } from "@telecaller/lib/store";
import { daysSince, displayName, formatIndianDate, initials, isConvertedStudent, isWhatsAppLead, today } from "@telecaller/lib/utils";
import { Badge } from "@telecaller/components/ui/Badge";
import { Button } from "@telecaller/components/ui/Button";
import { Card } from "@telecaller/components/ui/Card";
import { Input, Label, Select } from "@telecaller/components/ui/Field";
import type { Lead } from "@telecaller/lib/types";

const STALE_DAYS = 2;

/** Overdue follow-ups first, then never-called, then longest since contact. */
function urgency(lead: Lead) {
  if (lead.next_follow_up_date && lead.next_follow_up_date.slice(0, 10) <= today()) return 3000;
  if (!lead.last_contact_date) return 2000 + (daysSince(lead.created_at) ?? 0);
  return daysSince(lead.last_contact_date) ?? 0;
}

function waitLabel(lead: Lead): { text: string; late: boolean } {
  if (lead.next_follow_up_date) {
    const due = lead.next_follow_up_date.slice(0, 10);
    const dueLabel = formatIndianDate(due);
    if (due < today()) return { text: `Follow-up overdue since ${dueLabel}`, late: true };
    if (due === today()) return { text: "Follow-up due today", late: true };
    return { text: `Follow-up ${dueLabel}`, late: false };
  }
  if (!lead.last_contact_date) {
    const d = daysSince(lead.created_at);
    return { text: d === null ? "Never called" : `Never called · ${d}d old`, late: (d ?? 0) >= STALE_DAYS };
  }
  const d = daysSince(lead.last_contact_date) ?? 0;
  return { text: d === 0 ? "Called today" : `Last called ${d}d ago`, late: d >= STALE_DAYS };
}

export default function Queue() {
  const navigate = useNavigate();
  const store = useStore();
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("all");
  const [showAddLead, setShowAddLead] = useState(false);
  const [addBusy, setAddBusy] = useState(false);
  const [addError, setAddError] = useState("");

  const open = useMemo(() => store.leads.filter((lead) => !isConvertedStudent(lead)), [store.leads]);

  const leads = useMemo(() => {
    const q = query.trim().toLowerCase();
    return open
      .filter((lead) => status === "all" || lead.lead_status === status)
      .filter((lead) =>
        `${lead.first_name} ${lead.last_name} ${lead.email} ${lead.phone} ${lead.whatsapp_number || ""}`
          .toLowerCase()
          .includes(q),
      )
      .sort((a, b) => urgency(b) - urgency(a));
  }, [open, query, status]);

  const dueNow = open.filter((lead) => waitLabel(lead).late).length;

  const addLead = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const data = new FormData(e.currentTarget);
    setAddBusy(true);
    setAddError("");
    try {
      const created = await api<Lead>("/telecaller/leads", {
        method: "POST",
        body: {
          first_name: String(data.get("first_name") || ""),
          last_name: String(data.get("last_name") || ""),
          email: String(data.get("email") || ""),
          phone: String(data.get("phone") || ""),
          field_of_interest: String(data.get("field_of_interest") || ""),
          academic_score: String(data.get("academic_score") || ""),
          preferred_countries: String(data.get("preferred_countries") || "")
            .split(",")
            .map((item) => item.trim())
            .filter(Boolean),
        },
      });
      await refreshStore();
      setShowAddLead(false);
      e.currentTarget.reset();
      navigate(`/leads/${created.id}`);
    } catch (err) {
      setAddError(err instanceof Error ? err.message : "Could not add the lead.");
    } finally {
      setAddBusy(false);
    }
  };

  return (
    <div>
      <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <PhoneCall className="h-6 w-6 shrink-0 text-sky-500" />
          <div>
            <h1 className="text-xl font-bold sm:text-2xl">My queue</h1>
            <p className="text-sm text-slate-600">Most urgent first. Call, log the outcome, then qualify.</p>
          </div>
        </div>
        <Button
          type="button"
          variant={showAddLead ? "secondary" : "primary"}
          onClick={() => {
            setShowAddLead((open) => !open);
            setAddError("");
          }}
        >
          {showAddLead ? (
            <>
              <X className="h-4 w-4" /> Cancel
            </>
          ) : (
            <>
              <Plus className="h-4 w-4" /> Add lead
            </>
          )}
        </Button>
      </div>

      {showAddLead && (
        <Card className="mb-4 p-5">
          <p className="font-semibold">Add a new lead</p>
          <p className="mb-4 mt-1 text-sm text-slate-500">
            The lead is assigned to you immediately. Capture what you know now — you can fill in the rest after the first call.
          </p>
          {addError && (
            <p className="mb-3 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800">{addError}</p>
          )}
          <form onSubmit={(e) => void addLead(e)} className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label>First name</Label>
              <Input name="first_name" placeholder="Priya" />
            </div>
            <div>
              <Label>Last name</Label>
              <Input name="last_name" placeholder="Sharma" />
            </div>
            <div>
              <Label>Email</Label>
              <Input name="email" type="email" required placeholder="priya@example.com" />
            </div>
            <div>
              <Label>Phone</Label>
              <Input name="phone" type="tel" placeholder="+91 98765 43210" />
            </div>
            <div>
              <Label>Academic score</Label>
              <Input name="academic_score" placeholder="85%, 7.5 IELTS" />
            </div>
            <div>
              <Label>Field of interest</Label>
              <Input name="field_of_interest" placeholder="Data Science, Nursing..." />
            </div>
            <div className="sm:col-span-2">
              <Label>Preferred countries</Label>
              <Input name="preferred_countries" placeholder="UK, Canada" />
            </div>
            <div className="sm:col-span-2">
              <Button type="submit" disabled={addBusy}>
                {addBusy ? "Adding…" : "Add to my queue"}
              </Button>
            </div>
          </form>
        </Card>
      )}

      {dueNow > 0 && (
        <Card className="mb-4 border-rose-200 bg-rose-50 p-4 text-sm text-rose-800">
          {dueNow} lead{dueNow === 1 ? "" : "s"} need{dueNow === 1 ? "s" : ""} a call today.
        </Card>
      )}

      <div className="mb-4 flex flex-wrap gap-3">
        <Input
          className="max-w-sm"
          placeholder="Search name, email, phone..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <Select className="w-36" value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="all">All statuses</option>
          <option value="hot">Hot</option>
          <option value="warm">Warm</option>
          <option value="cold">Cold</option>
        </Select>
      </div>

      <Card className="overflow-hidden">
        {leads.map((lead) => {
          const wait = waitLabel(lead);
          return (
            <Link
              key={lead.id}
              to={`/leads/${lead.id}`}
              className="flex items-center gap-3 border-b border-slate-100 px-4 py-3.5 transition last:border-b-0 hover:bg-slate-50"
            >
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-navy-900 text-sm font-bold text-white">
                {initials(lead.first_name, lead.last_name, lead.email)}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate font-semibold">
                  {displayName(lead.first_name, lead.last_name, lead.email)}
                </span>
                <span className="block truncate text-sm text-slate-500">
                  {lead.phone || lead.whatsapp_number || "No phone"}
                </span>
                <span className={`mt-0.5 block truncate text-xs ${wait.late ? "font-semibold text-rose-600" : "text-slate-400"}`}>
                  {wait.text}
                </span>
              </span>
              <span className="flex shrink-0 items-center gap-2">
                {isWhatsAppLead(lead) && <Badge value="whatsapp" className="normal-case">WhatsApp</Badge>}
                <Badge value={lead.lead_status || "warm"} />
                <ChevronRight className="h-5 w-5 text-slate-300" />
              </span>
            </Link>
          );
        })}
        {leads.length === 0 && (
          <div className="p-8 text-center text-sm text-slate-500">
            {open.length === 0 ? (
              <>
                <p className="font-semibold text-navy-900">Nothing in your queue yet.</p>
                <p className="mt-1">
                  Add a lead with the button above, or wait for an admin to assign one to you.
                </p>
              </>
            ) : (
              <>
                <p className="font-semibold text-navy-900">No leads match this filter.</p>
                <p className="mt-1">
                  You have {open.length} lead{open.length === 1 ? "" : "s"} in total.{" "}
                  <button
                    type="button"
                    className="font-semibold text-sky-700 underline"
                    onClick={() => {
                      setQuery("");
                      setStatus("all");
                    }}
                  >
                    Clear the filter
                  </button>{" "}
                  to see {open.length === 1 ? "it" : "them"}.
                </p>
              </>
            )}
          </div>
        )}
      </Card>
    </div>
  );
}