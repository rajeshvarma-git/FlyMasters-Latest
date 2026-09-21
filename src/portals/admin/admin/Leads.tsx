// // import { FormEvent, useMemo, useState } from "react";
// // import { format } from "date-fns";
// // import { Flame, Mail, Phone, PhoneCall, UserCheck } from "lucide-react";
// // import { api } from "@admin/lib/api";
// // import { refreshStore, useAdminStore } from "@admin/lib/store";
// // import { displayName, telecallerLabel } from "@admin/lib/utils";
// // import { Badge } from "@admin/components/ui/Badge";
// // import { Button } from "@admin/components/ui/Button";
// // import { Card } from "@admin/components/ui/Card";
// // import { Input, Label, Select, Textarea } from "@admin/components/ui/Field";

// // const STATUSES = ["cold", "warm", "hot"];

// // export default function Leads() {
// //   const store = useAdminStore();
// //   const [query, setQuery] = useState("");
// //   const [status, setStatus] = useState("all");
// //   const [selectedId, setSelectedId] = useState<string | null>(null);
// //   const [busy, setBusy] = useState(false);

// //   const leads = useMemo(() => {
// //     const q = query.trim().toLowerCase();
// //     return store.leads
// //       .filter((lead) => lead.entity_type !== "student" && lead.lead_status !== "converted")
// //       .filter((lead) => status === "all" || lead.lead_status === status)
// //       .filter((lead) =>
// //         `${lead.first_name} ${lead.last_name} ${lead.email} ${lead.phone} ${lead.field_of_interest}`.toLowerCase().includes(q),
// //       );
// //   }, [store.leads, query, status]);

// //   const selected = store.leads.find((lead) => lead.id === selectedId) || null;

// //   const onAdd = async (e: FormEvent<HTMLFormElement>) => {
// //     e.preventDefault();
// //     const data = new FormData(e.currentTarget);
// //     setBusy(true);
// //     try {
// //       await api("/leads", {
// //         method: "POST",
// //         body: {
// //           firstName: String(data.get("firstName")),
// //           lastName: String(data.get("lastName")),
// //           email: String(data.get("email")),
// //           phone: String(data.get("phone") || ""),
// //           field: String(data.get("field") || ""),
// //           score: String(data.get("score") || ""),
// //           countries: String(data.get("countries") || ""),
// //           telecallerId: String(data.get("telecallerId") || "") || null,
// //         },
// //       });
// //       e.currentTarget.reset();
// //       await refreshStore();
// //     } finally {
// //       setBusy(false);
// //     }
// //   };

// //   const save = async () => {
// //     if (!selected) return;
// //     const form = document.getElementById("lead-edit") as HTMLFormElement | null;
// //     if (!form) return;
// //     const data = new FormData(form);
// //     const notes = String(data.get("notes") || "");
// //     setBusy(true);
// //     try {
// //       await api(`/leads/${selected.id}`, {
// //         method: "PATCH",
// //         body: {
// //           lead_status: String(data.get("status")),
// //           lead_stage: String(data.get("status")),
// //           assigned_telecaller_id: String(data.get("telecallerId") || "") || null,
// //           next_follow_up_date: String(data.get("follow") || "") || null,
// //           last_contact_date: new Date().toISOString(),
// //           field_of_interest: String(data.get("field") || ""),
// //           academic_score: String(data.get("score") || ""),
// //           preferred_countries: String(data.get("countries") || "")
// //             .split(",")
// //             .map((item) => item.trim())
// //             .filter(Boolean),
// //           notes: notes ? `${selected.notes || ""}\n[${format(new Date(), "PPP")}] ${notes}`.trim() : selected.notes,
// //         },
// //       });
// //       setSelectedId(null);
// //       await refreshStore();
// //     } finally {
// //       setBusy(false);
// //     }
// //   };

// //   const convert = async (id: string) => {
// //     setBusy(true);
// //     try {
// //       await api(`/leads/${id}/convert`, { method: "POST" });
// //       setSelectedId(null);
// //       await refreshStore();
// //     } finally {
// //       setBusy(false);
// //     }
// //   };

// //   return (
// //     <div>
// //       <div className="mb-6 flex items-center gap-3">
// //         <PhoneCall className="h-6 w-6 text-sky-500" />
// //         <div>
// //           <h1 className="text-2xl font-bold">Leads</h1>
// //           <p className="text-slate-600">
// //             {leads.length} open leads — telecallers capture details, qualify, then convert to students.
// //           </p>
// //         </div>
// //       </div>

// //       <Card className="mb-4 border-sky-100 bg-sky-50/50 p-4 text-sm text-slate-700">
// //         <strong>Workflow:</strong> New user → assign telecaller → capture preferences → qualify (hot/cold) → convert to student → admin auto-assigns country counselor.
// //       </Card>

// //       <Card className="mb-4 p-5">
// //         <p className="font-semibold">Add a lead</p>
// //         <form className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3" onSubmit={(e) => void onAdd(e)}>
// //           <div><Label>First name</Label><Input name="firstName" required /></div>
// //           <div><Label>Last name</Label><Input name="lastName" required /></div>
// //           <div><Label>Email</Label><Input name="email" type="email" required /></div>
// //           <div><Label>Phone</Label><Input name="phone" /></div>
// //           <div><Label>Field of interest</Label><Input name="field" /></div>
// //           <div><Label>Academic score</Label><Input name="score" placeholder="85%, 7.5 IELTS" /></div>
// //           <div><Label>Preferred countries</Label><Input name="countries" placeholder="UK, Canada" required /></div>
// //           <div>
// //             <Label>Assign telecaller</Label>
// //             <Select name="telecallerId" defaultValue="">
// //               <option value="">Unassigned</option>
// //               {store.telecallers.map((item) => (
// //                 <option key={item.id} value={item.id}>{displayName(item.first_name, item.last_name, item.email)}</option>
// //               ))}
// //             </Select>
// //           </div>
// //           <div className="flex items-end"><Button type="submit" disabled={busy}>Add lead</Button></div>
// //         </form>
// //       </Card>

// //       <div className="mb-4 flex flex-wrap gap-3">
// //         <Input className="max-w-sm" placeholder="Search name, email, phone..." value={query} onChange={(e) => setQuery(e.target.value)} />
// //         <Select className="w-40" value={status} onChange={(e) => setStatus(e.target.value)}>
// //           <option value="all">All statuses</option>
// //           {STATUSES.map((item) => <option key={item} value={item}>{item}</option>)}
// //         </Select>
// //       </div>

// //       <div className="grid gap-4">
// //         {leads.map((lead) => (
// //           <Card key={lead.id} className="p-5">
// //             <div className="flex flex-wrap items-start justify-between gap-3">
// //               <div>
// //                 <p className="flex items-center gap-2 text-lg font-semibold">
// //                   {lead.lead_status === "hot" && <Flame className="h-4 w-4 text-orange-500" />}
// //                   {displayName(lead.first_name, lead.last_name, lead.email)}
// //                 </p>
// //                 <div className="mt-1 flex flex-wrap gap-3 text-sm text-slate-500">
// //                   <span className="flex items-center gap-1"><Mail className="h-3 w-3" />{lead.email}</span>
// //                   {lead.phone && <span className="flex items-center gap-1"><Phone className="h-3 w-3" />{lead.phone}</span>}
// //                 </div>
// //                 <p className="mt-2 text-sm">
// //                   {(lead.preferred_countries || []).join(", ") || "No country"} · {lead.field_of_interest || "No field"} · {lead.academic_score || "No score"}
// //                 </p>
// //                 <p className="mt-1 text-xs text-slate-500">
// //                   Telecaller: {telecallerLabel(store.telecallers, lead.assigned_telecaller_id)} · source {lead.lead_source.replace(/_/g, " ")}
// //                 </p>
// //               </div>
// //               <div className="flex items-center gap-2">
// //                 <Badge value={lead.lead_status || "warm"} />
// //                 <Button size="sm" variant="secondary" onClick={() => setSelectedId(lead.id)}>Manage</Button>
// //                 <Button size="sm" disabled={busy} onClick={() => void convert(lead.id)}>
// //                   <UserCheck className="h-3.5 w-3.5" /> Convert
// //                 </Button>
// //               </div>
// //             </div>
// //             {selectedId === lead.id && selected && (
// //               <form id="lead-edit" className="mt-4 grid gap-3 border-t pt-4 sm:grid-cols-2" onSubmit={(e) => { e.preventDefault(); void save(); }}>
// //                 <div>
// //                   <Label>Status</Label>
// //                   <Select name="status" defaultValue={selected.lead_status || "warm"}>
// //                     {STATUSES.map((item) => <option key={item} value={item}>{item}</option>)}
// //                   </Select>
// //                 </div>
// //                 <div>
// //                   <Label>Telecaller</Label>
// //                   <Select name="telecallerId" defaultValue={selected.assigned_telecaller_id || ""}>
// //                     <option value="">Unassigned</option>
// //                     {store.telecallers.map((item) => (
// //                       <option key={item.id} value={item.id}>{displayName(item.first_name, item.last_name, item.email)}</option>
// //                     ))}
// //                   </Select>
// //                 </div>
// //                 <div><Label>Field</Label><Input name="field" defaultValue={selected.field_of_interest || ""} /></div>
// //                 <div><Label>Score</Label><Input name="score" defaultValue={selected.academic_score || ""} /></div>
// //                 <div className="sm:col-span-2">
// //                   <Label>Preferred countries</Label>
// //                   <Input name="countries" defaultValue={(selected.preferred_countries || []).join(", ")} />
// //                 </div>
// //                 <div>
// //                   <Label>Next follow-up</Label>
// //                   <Input name="follow" type="date" defaultValue={selected.next_follow_up_date?.slice(0, 10) || ""} />
// //                 </div>
// //                 <div className="sm:col-span-2">
// //                   <Label>Call notes</Label>
// //                   <Textarea name="notes" placeholder="Telecaller notes from the call..." />
// //                 </div>
// //                 {selected.notes && <p className="sm:col-span-2 whitespace-pre-wrap text-xs text-slate-500">{selected.notes}</p>}
// //                 <div className="flex flex-wrap gap-2">
// //                   <Button type="submit" disabled={busy}>Save</Button>
// //                   <Button type="button" disabled={busy} onClick={() => void convert(selected.id)}>
// //                     <UserCheck className="h-3.5 w-3.5" /> Convert to student
// //                   </Button>
// //                   <Button type="button" variant="ghost" onClick={() => setSelectedId(null)}>Cancel</Button>
// //                 </div>
// //               </form>
// //             )}
// //           </Card>
// //         ))}
// //         {leads.length === 0 && <Card className="p-8 text-center text-sm text-slate-500">No open leads match this filter.</Card>}
// //       </div>
// //     </div>
// //   );
// // }

// import { FormEvent, useMemo, useState } from "react";
// import { format } from "date-fns";
// import { Flame, Mail, Phone, PhoneCall, UserCheck } from "lucide-react";
// import { api } from "@admin/lib/api";
// import { refreshStore, useAdminStore } from "@admin/lib/store";
// import { displayName, telecallerLabel } from "@admin/lib/utils";
// import { Badge } from "@admin/components/ui/Badge";
// import { Button } from "@admin/components/ui/Button";
// import { Card } from "@admin/components/ui/Card";
// import { Input, Label, Select, Textarea } from "@admin/components/ui/Field";

// const STATUSES = ["cold", "warm", "hot"];

// export default function Leads() {
//   const store = useAdminStore();
//   const [query, setQuery] = useState("");
//   const [status, setStatus] = useState("all");
//   const [selectedId, setSelectedId] = useState<string | null>(null);
//   const [busy, setBusy] = useState(false);

//   const leads = useMemo(() => {
//     const q = query.trim().toLowerCase();
//     return store.leads
//       .filter((lead) => lead.entity_type !== "student" && lead.lead_status !== "converted")
//       .filter((lead) => status === "all" || lead.lead_status === status)
//       .filter((lead) =>
//         `${lead.first_name} ${lead.last_name} ${lead.email} ${lead.phone} ${lead.field_of_interest}`.toLowerCase().includes(q),
//       );
//   }, [store.leads, query, status]);

//   const selected = store.leads.find((lead) => lead.id === selectedId) || null;

//   const onAdd = async (e: FormEvent<HTMLFormElement>) => {
//     e.preventDefault();
//     const data = new FormData(e.currentTarget);
//     setBusy(true);
//     try {
//       await api("/leads", {
//         method: "POST",
//         body: {
//           firstName: String(data.get("firstName")),
//           lastName: String(data.get("lastName")),
//           email: String(data.get("email")),
//           phone: String(data.get("phone") || ""),
//           field: String(data.get("field") || ""),
//           score: String(data.get("score") || ""),
//           countries: String(data.get("countries") || ""),
//           telecallerId: String(data.get("telecallerId") || "") || null,
//         },
//       });
//       e.currentTarget.reset();
//       await refreshStore();
//     } finally {
//       setBusy(false);
//     }
//   };

//   const save = async () => {
//     if (!selected) return;
//     const form = document.getElementById("lead-edit") as HTMLFormElement | null;
//     if (!form) return;
//     const data = new FormData(form);
//     const notes = String(data.get("notes") || "");
//     setBusy(true);
//     try {
//       await api(`/leads/${selected.id}`, {
//         method: "PATCH",
//         body: {
//           lead_status: String(data.get("status")),
//           lead_stage: String(data.get("status")),
//           assigned_telecaller_id: String(data.get("telecallerId") || "") || null,
//           next_follow_up_date: String(data.get("follow") || "") || null,
//           last_contact_date: new Date().toISOString(),
//           field_of_interest: String(data.get("field") || ""),
//           academic_score: String(data.get("score") || ""),
//           preferred_countries: String(data.get("countries") || "")
//             .split(",")
//             .map((item) => item.trim())
//             .filter(Boolean),
//           notes: notes ? `${selected.notes || ""}\n[${format(new Date(), "PPP")}] ${notes}`.trim() : selected.notes,
//         },
//       });
//       setSelectedId(null);
//       await refreshStore();
//     } finally {
//       setBusy(false);
//     }
//   };

//   const convert = async (id: string) => {
//     setBusy(true);
//     try {
//       await api(`/leads/${id}/convert`, { method: "POST" });
//       setSelectedId(null);
//       await refreshStore();
//     } finally {
//       setBusy(false);
//     }
//   };

//   return (
//     <div>
//       <div className="mb-6 flex items-center gap-3">
//         <PhoneCall className="h-6 w-6 text-sky-500" />
//         <div>
//           <h1 className="text-2xl font-bold">Leads</h1>
//           <p className="text-slate-600">
//             {leads.length} open leads — telecallers capture details, qualify, then convert to students.
//           </p>
//         </div>
//       </div>

//       <Card className="mb-4 border-sky-100 bg-sky-50/50 p-4 text-sm text-slate-700">
//         <strong>Workflow:</strong> New user → assign telecaller → capture preferences → qualify (hot/cold) → convert to student → admin assigns a country counselor.
//       </Card>

//       <Card className="mb-4 p-5">
//         <p className="font-semibold">Add a lead</p>
//         <form className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3" onSubmit={(e) => void onAdd(e)}>
//           <div><Label>First name</Label><Input name="firstName" required /></div>
//           <div><Label>Last name</Label><Input name="lastName" required /></div>
//           <div><Label>Email</Label><Input name="email" type="email" required /></div>
//           <div><Label>Phone</Label><Input name="phone" /></div>
//           <div><Label>Field of interest</Label><Input name="field" /></div>
//           <div><Label>Academic score</Label><Input name="score" placeholder="85%, 7.5 IELTS" /></div>
//           <div><Label>Preferred countries</Label><Input name="countries" placeholder="UK, Canada" required /></div>
//           <div>
//             <Label>Assign telecaller</Label>
//             <Select name="telecallerId" defaultValue="">
//               <option value="">Unassigned</option>
//               {store.telecallers.map((item) => (
//                 <option key={item.id} value={item.id}>{displayName(item.first_name, item.last_name, item.email)}</option>
//               ))}
//             </Select>
//           </div>
//           <div className="flex items-end"><Button type="submit" disabled={busy}>Add lead</Button></div>
//         </form>
//       </Card>

//       <div className="mb-4 flex flex-wrap gap-3">
//         <Input className="max-w-sm" placeholder="Search name, email, phone..." value={query} onChange={(e) => setQuery(e.target.value)} />
//         <Select className="w-40" value={status} onChange={(e) => setStatus(e.target.value)}>
//           <option value="all">All statuses</option>
//           {STATUSES.map((item) => <option key={item} value={item}>{item}</option>)}
//         </Select>
//       </div>

//       <div className="grid gap-4">
//         {leads.map((lead) => (
//           <Card key={lead.id} className="p-5">
//             <div className="flex flex-wrap items-start justify-between gap-3">
//               <div>
//                 <p className="flex items-center gap-2 text-lg font-semibold">
//                   {lead.lead_status === "hot" && <Flame className="h-4 w-4 text-orange-500" />}
//                   {displayName(lead.first_name, lead.last_name, lead.email)}
//                 </p>
//                 <div className="mt-1 flex flex-wrap gap-3 text-sm text-slate-500">
//                   <span className="flex items-center gap-1"><Mail className="h-3 w-3" />{lead.email}</span>
//                   {lead.phone && <span className="flex items-center gap-1"><Phone className="h-3 w-3" />{lead.phone}</span>}
//                 </div>
//                 <p className="mt-2 text-sm">
//                   {(lead.preferred_countries || []).join(", ") || "No country"} · {lead.field_of_interest || "No field"} · {lead.academic_score || "No score"}
//                 </p>
//                 <p className="mt-1 text-xs text-slate-500">
//                   Telecaller: {telecallerLabel(store.telecallers, lead.assigned_telecaller_id)} · source {lead.lead_source.replace(/_/g, " ")}
//                 </p>
//               </div>
//               <div className="flex items-center gap-2">
//                 <Badge value={lead.lead_status || "warm"} />
//                 <Button size="sm" variant="secondary" onClick={() => setSelectedId(lead.id)}>Manage</Button>
//                 <Button size="sm" disabled={busy} onClick={() => void convert(lead.id)}>
//                   <UserCheck className="h-3.5 w-3.5" /> Convert
//                 </Button>
//               </div>
//             </div>
//             {selectedId === lead.id && selected && (
//               <form id="lead-edit" className="mt-4 grid gap-3 border-t pt-4 sm:grid-cols-2" onSubmit={(e) => { e.preventDefault(); void save(); }}>
//                 <div>
//                   <Label>Status</Label>
//                   <Select name="status" defaultValue={selected.lead_status || "warm"}>
//                     {STATUSES.map((item) => <option key={item} value={item}>{item}</option>)}
//                   </Select>
//                 </div>
//                 <div>
//                   <Label>Telecaller</Label>
//                   <Select name="telecallerId" defaultValue={selected.assigned_telecaller_id || ""}>
//                     <option value="">Unassigned</option>
//                     {store.telecallers.map((item) => (
//                       <option key={item.id} value={item.id}>{displayName(item.first_name, item.last_name, item.email)}</option>
//                     ))}
//                   </Select>
//                 </div>
//                 <div><Label>Field</Label><Input name="field" defaultValue={selected.field_of_interest || ""} /></div>
//                 <div><Label>Score</Label><Input name="score" defaultValue={selected.academic_score || ""} /></div>
//                 <div className="sm:col-span-2">
//                   <Label>Preferred countries</Label>
//                   <Input name="countries" defaultValue={(selected.preferred_countries || []).join(", ")} />
//                 </div>
//                 <div>
//                   <Label>Next follow-up</Label>
//                   <Input name="follow" type="date" defaultValue={selected.next_follow_up_date?.slice(0, 10) || ""} />
//                 </div>
//                 <div className="sm:col-span-2">
//                   <Label>Call notes</Label>
//                   <Textarea name="notes" placeholder="Telecaller notes from the call..." />
//                 </div>
//                 {selected.notes && <p className="sm:col-span-2 whitespace-pre-wrap text-xs text-slate-500">{selected.notes}</p>}
//                 <div className="flex flex-wrap gap-2">
//                   <Button type="submit" disabled={busy}>Save</Button>
//                   <Button type="button" disabled={busy} onClick={() => void convert(selected.id)}>
//                     <UserCheck className="h-3.5 w-3.5" /> Convert to student
//                   </Button>
//                   <Button type="button" variant="ghost" onClick={() => setSelectedId(null)}>Cancel</Button>
//                 </div>
//               </form>
//             )}
//           </Card>
//         ))}
//         {leads.length === 0 && <Card className="p-8 text-center text-sm text-slate-500">No open leads match this filter.</Card>}
//       </div>
//     </div>
//   );
// }

import { useEffect, useMemo, useState } from "react";
import { Flame, Mail, Phone, PhoneCall, Shield } from "lucide-react";
import { useSearchParams } from "react-router-dom";
import { useAdminStore } from "@admin/lib/store";
import { counselorLabel, displayName, formatWhen, isConvertedStudent, isWhatsAppLead, leadSourceLabel, telecallerLabel } from "@admin/lib/utils";
import { Badge } from "@admin/components/ui/Badge";
import { Card } from "@admin/components/ui/Card";
import { Input, Select } from "@admin/components/ui/Field";

const STATUSES = ["cold", "warm", "hot"];
type OwnerFilter = "telecaller" | "counselor";

function parseOwner(value: string | null): OwnerFilter {
  return value === "counselor" ? "counselor" : "telecaller";
}

function isOpenLead(lead: { entity_type?: string; lead_status?: string }) {
  return !isConvertedStudent(lead);
}

export default function Leads() {
  const store = useAdminStore();
  const [searchParams, setSearchParams] = useSearchParams();
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("all");
  const [owner, setOwner] = useState<OwnerFilter>(() => parseOwner(searchParams.get("owner")));

  useEffect(() => {
    setOwner(parseOwner(searchParams.get("owner")));
  }, [searchParams]);

  const openLeads = useMemo(
    () => store.leads.filter((lead) => isOpenLead(lead)),
    [store.leads],
  );

  const telecallerLeads = useMemo(
    () => openLeads.filter((lead) => !lead.assigned_counselor_id),
    [openLeads],
  );

  const counselorLeads = useMemo(
    () => openLeads.filter((lead) => Boolean(lead.assigned_counselor_id)),
    [openLeads],
  );

  const selectOwner = (next: OwnerFilter) => {
    setOwner(next);
    const params = new URLSearchParams(searchParams);
    if (next === "telecaller") params.delete("owner");
    else params.set("owner", next);
    setSearchParams(params, { replace: true });
  };

  const leads = useMemo(() => {
    const q = query.trim().toLowerCase();
    const pool = owner === "counselor" ? counselorLeads : telecallerLeads;
    return pool
      .filter((lead) => status === "all" || lead.lead_status === status)
      .filter((lead) =>
        `${lead.first_name} ${lead.last_name} ${lead.email} ${lead.phone} ${lead.field_of_interest}`.toLowerCase().includes(q),
      )
      .sort((a, b) => String(b.created_at || "").localeCompare(String(a.created_at || "")));
  }, [counselorLeads, owner, query, status, telecallerLeads]);

  return (
    <div>
      <div className="mb-6 flex items-center gap-3">
        <PhoneCall className="h-6 w-6 text-sky-500" />
        <div>
          <h1 className="text-2xl font-bold">Leads</h1>
        </div>
      </div>

      {store.error && (
        <Card className="mb-4 border-rose-200 bg-rose-50 p-4 text-sm text-rose-800">
          {store.error}
        </Card>
      )}

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div className="inline-flex rounded-xl border border-slate-200 bg-slate-100 p-1">
          <button
            type="button"
            onClick={() => selectOwner("telecaller")}
            className={`inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-semibold transition ${
              owner === "telecaller" ? "bg-white text-navy-900 shadow-sm" : "text-slate-600 hover:text-navy-900"
            }`}
          >
            <PhoneCall className="h-4 w-4" />
            Telecaller
            <span
              className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${
                owner === "telecaller" ? "bg-sky-100 text-sky-800" : "bg-slate-200 text-slate-600"
              }`}
            >
              {telecallerLeads.length}
            </span>
          </button>
          <button
            type="button"
            onClick={() => selectOwner("counselor")}
            className={`inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-semibold transition ${
              owner === "counselor" ? "bg-white text-navy-900 shadow-sm" : "text-slate-600 hover:text-navy-900"
            }`}
          >
            <Shield className="h-4 w-4" />
            Counselor
            <span
              className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${
                owner === "counselor" ? "bg-sky-100 text-sky-800" : "bg-slate-200 text-slate-600"
              }`}
            >
              {counselorLeads.length}
            </span>
          </button>
        </div>
        <Input className="max-w-sm" placeholder="Search name, email, phone..." value={query} onChange={(e) => setQuery(e.target.value)} />
        <Select className="w-40" value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="all">All statuses</option>
          {STATUSES.map((item) => <option key={item} value={item}>{item}</option>)}
        </Select>
      </div>

      <div className="grid gap-4">
        {leads.map((lead) => (
          <Card key={lead.id} className="p-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="flex items-center gap-2 text-lg font-semibold">
                  {lead.lead_status === "hot" && <Flame className="h-4 w-4 text-orange-500" />}
                  {displayName(lead.first_name, lead.last_name, lead.email)}
                </p>
                <div className="mt-1 flex flex-wrap gap-3 text-sm text-slate-500">
                  <span className="flex items-center gap-1"><Mail className="h-3 w-3" />{lead.email}</span>
                  {lead.phone && <span className="flex items-center gap-1"><Phone className="h-3 w-3" />{lead.phone}</span>}
                </div>
                <p className="mt-2 text-sm">
                  {(lead.preferred_countries || []).join(", ") || "No country"} · {lead.field_of_interest || "No field"} · {lead.academic_score || "No score"}
                </p>
                <p className="mt-1 text-xs text-slate-500">
                  {owner === "telecaller" ? (
                    <>
                      Telecaller: {telecallerLabel(store.telecallers, lead.assigned_telecaller_id)}
                      {lead.assigned_telecaller_id && lead.assigned_telecaller_at && (
                        <> · assigned {formatWhen(lead.assigned_telecaller_at)}</>
                      )}
                    </>
                  ) : (
                    <>
                      Counselor: {counselorLabel(store.counselors, lead.assigned_counselor_id)}
                      {lead.assigned_counselor_id && lead.assigned_counselor_at && (
                        <> · assigned {formatWhen(lead.assigned_counselor_at)}</>
                      )}
                    </>
                  )}
                  {" · "}
                  source {leadSourceLabel(lead)}
                </p>
              </div>
              <div className="flex items-center gap-2">
                {isWhatsAppLead(lead) && <Badge value="whatsapp" className="normal-case" />}
                <Badge value={lead.lead_status || "warm"} />
              </div>
            </div>
          </Card>
        ))}
        {leads.length === 0 && (
          <Card className="p-8 text-center text-sm text-slate-500">
            {owner === "counselor"
              ? "No counselor-assigned open leads match this filter."
              : "No telecaller open leads match this filter."}
          </Card>
        )}
      </div>
    </div>
  );
}