// // // import { useEffect, useMemo, useState } from "react";
// // // import { AlarmClock, RefreshCw } from "lucide-react";
// // // import { api } from "@admin/lib/api";
// // // import { refreshStore, useAdminStore } from "@admin/lib/store";
// // // import { displayName, initials, isConvertedStudent } from "@admin/lib/utils";
// // // import { Badge } from "@admin/components/ui/Badge";
// // // import { Button } from "@admin/components/ui/Button";
// // // import { Card } from "@admin/components/ui/Card";
// // // import { Select } from "@admin/components/ui/Field";
// // // import type { Lead } from "@admin/lib/types";

// // // interface AlertStatus {
// // //   enabled: boolean;
// // //   intervalHours: number;
// // //   repeatHours: number;
// // //   lastRunAt: string | null;
// // //   nextRunAt: string | null;
// // //   lastError: string | null;
// // //   unassignedCount: number;
// // //   notifiedCount: number;
// // // }

// // // const ESCALATE_HOURS = 24;

// // // function hoursSince(value?: string | null) {
// // //   if (!value) return null;
// // //   const ms = Date.now() - new Date(value).getTime();
// // //   if (Number.isNaN(ms) || ms < 0) return 0;
// // //   return ms / 3600000;
// // // }

// // // function ageLabel(hours: number | null) {
// // //   if (hours === null) return "Unknown";
// // //   if (hours < 1) return `${Math.round(hours * 60)}m`;
// // //   if (hours < 24) return `${hours.toFixed(1)}h`;
// // //   return `${Math.floor(hours / 24)}d ${Math.round(hours % 24)}h`;
// // // }

// // // function countdown(target: string | null) {
// // //   if (!target) return "—";
// // //   const ms = new Date(target).getTime() - Date.now();
// // //   if (Number.isNaN(ms)) return "—";
// // //   if (ms <= 0) return "Due now";
// // //   const mins = Math.floor(ms / 60000);
// // //   return mins < 60 ? `${mins}m` : `${Math.floor(mins / 60)}h ${mins % 60}m`;
// // // }

// // // function clockTime(value: string | null) {
// // //   if (!value) return "Not run yet";
// // //   return new Date(value).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
// // // }

// // // export default function LeadAlerts() {
// // //   const store = useAdminStore();
// // //   const [status, setStatus] = useState<AlertStatus | null>(null);
// // //   const [telecallerId, setTelecallerId] = useState("");
// // //   const [busy, setBusy] = useState(false);
// // //   const [error, setError] = useState("");
// // //   const [, forceTick] = useState(0);

// // //   const loadStatus = async () => {
// // //     try {
// // //       setStatus(await api<AlertStatus>("/system/alerts"));
// // //     } catch (err) {
// // //       setError(err instanceof Error ? err.message : "Could not read the alert watcher.");
// // //     }
// // //   };

// // //   useEffect(() => {
// // //     void loadStatus();
// // //     // Keep the countdown honest without hammering the API.
// // //     const tick = window.setInterval(() => forceTick((n) => n + 1), 30000);
// // //     const poll = window.setInterval(() => void loadStatus(), 60000);
// // //     return () => {
// // //       window.clearInterval(tick);
// // //       window.clearInterval(poll);
// // //     };
// // //   }, []);

// // //   const waiting = useMemo(
// // //     () =>
// // //       store.leads
// // //         .filter((lead) => !isConvertedStudent(lead) && !lead.assigned_telecaller_id)
// // //         .sort((a, b) => String(a.created_at || "").localeCompare(String(b.created_at || ""))),
// // //     [store.leads],
// // //   );

// // //   const escalated = waiting.filter((lead) => (hoursSince(lead.created_at) ?? 0) >= ESCALATE_HOURS);
// // //   const alertFeed = store.notifications
// // //     .filter((row) => (row.title || "").toLowerCase().includes("telecaller"))
// // //     .sort((a, b) => String(b.created_at || "").localeCompare(String(a.created_at || "")))
// // //     .slice(0, 25);

// // //   const runNow = async () => {
// // //     setBusy(true);
// // //     setError("");
// // //     try {
// // //       setStatus(await api<AlertStatus>("/system/alerts/run", { method: "POST" }));
// // //       await refreshStore();
// // //     } catch (err) {
// // //       setError(err instanceof Error ? err.message : "Could not run the check.");
// // //     } finally {
// // //       setBusy(false);
// // //     }
// // //   };

// // //   const assign = async (lead: Lead) => {
// // //     if (!telecallerId) return;
// // //     setBusy(true);
// // //     setError("");
// // //     try {
// // //       await api(`/leads/${lead.id}`, { method: "PATCH", body: { assigned_telecaller_id: telecallerId } });
// // //       await refreshStore();
// // //       await loadStatus();
// // //     } catch (err) {
// // //       setError(err instanceof Error ? err.message : "Could not assign the telecaller.");
// // //     } finally {
// // //       setBusy(false);
// // //     }
// // //   };

// // //   const interval = status?.intervalHours ?? 2;

// // //   return (
// // //     <div>
// // //       <div className="mb-5 flex items-center gap-3">
// // //         <AlarmClock className="h-6 w-6 text-sky-500" />
// // //         <div>
// // //           <h1 className="text-2xl font-bold">Lead alerts</h1>
// // //           <p className="text-slate-600">
// // //             Every {interval} hours the server checks for signups with no telecaller and notifies the admins.
// // //           </p>
// // //         </div>
// // //       </div>

// // //       <Card className="border-navy-900 bg-navy-950 p-5 text-white">
// // //         <div className="flex flex-wrap items-center justify-between gap-5">
// // //           <div>
// // //             <p className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-wider text-slate-400">
// // //               <span
// // //                 className={`h-2 w-2 rounded-full ${status?.enabled ? "animate-pulse bg-emerald-500" : "bg-rose-500"}`}
// // //               />
// // //               Watcher
// // //             </p>
// // //             <p className="mt-1 text-xl font-bold">{status?.enabled ? "Running" : "Disabled"}</p>
// // //           </div>
// // //           <div>
// // //             <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Last check</p>
// // //             <p className="mt-1 text-xl font-bold tabular-nums">{clockTime(status?.lastRunAt ?? null)}</p>
// // //           </div>
// // //           <div>
// // //             <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Next check in</p>
// // //             <p className="mt-1 text-xl font-bold tabular-nums">{countdown(status?.nextRunAt ?? null)}</p>
// // //           </div>
// // //           <div>
// // //             <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Reported last run</p>
// // //             <p className="mt-1 text-xl font-bold tabular-nums">{status?.notifiedCount ?? 0}</p>
// // //           </div>
// // //           <Button variant="secondary" size="sm" disabled={busy} onClick={() => void runNow()}>
// // //             <RefreshCw className="h-4 w-4" /> Run check now
// // //           </Button>
// // //         </div>
// // //       </Card>

// // //       {status && !status.enabled && (
// // //         <Card className="mt-4 border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
// // //           The watcher is switched off. Set <code>UNASSIGNED_ALERT_HOURS</code> to a positive number and restart the
// // //           API to turn it back on.
// // //         </Card>
// // //       )}
// // //       {status?.lastError && (
// // //         <Card className="mt-4 border-rose-200 bg-rose-50 p-4 text-sm text-rose-800">
// // //           Last check failed: {status.lastError}
// // //         </Card>
// // //       )}
// // //       {error && <Card className="mt-4 border-rose-200 bg-rose-50 p-4 text-sm text-rose-800">{error}</Card>}
// // //       {escalated.length > 0 && (
// // //         <Card className="mt-4 border-rose-200 bg-rose-50 p-4 text-sm text-rose-800">
// // //           <strong>
// // //             {escalated.length} lead{escalated.length === 1 ? " has" : "s have"} been waiting over {ESCALATE_HOURS} hours.
// // //           </strong>{" "}
// // //           Assign a telecaller now.
// // //         </Card>
// // //       )}

// // //       <div className="mt-4 grid gap-3 sm:grid-cols-3">
// // //         {[
// // //           { label: "Waiting for a telecaller", value: waiting.length, alert: waiting.length > 0 },
// // //           { label: `Escalated past ${ESCALATE_HOURS}h`, value: escalated.length, alert: escalated.length > 0 },
// // //           { label: "Alerts in the log", value: alertFeed.length },
// // //         ].map((stat) => (
// // //           <Card key={stat.label} className="p-4">
// // //             <div className={`h-4 w-4 rounded-md ${stat.alert ? "bg-rose-100" : "bg-sky-100"}`} />
// // //             <p className={`mt-2 text-2xl font-bold ${stat.alert ? "text-rose-600" : ""}`}>{stat.value}</p>
// // //             <p className="text-sm text-slate-500">{stat.label}</p>
// // //           </Card>
// // //         ))}
// // //       </div>

// // //       <div className="mt-4 grid gap-4 xl:grid-cols-[1.4fr_1fr]">
// // //         <div>
// // //           <Card className="p-4">
// // //             <p className="mb-1.5 text-sm font-medium text-slate-700">Assign to</p>
// // //             <Select value={telecallerId} onChange={(e) => setTelecallerId(e.target.value)}>
// // //               <option value="">Choose telecaller</option>
// // //               {store.telecallers.map((row) => {
// // //                 const load = store.leads.filter(
// // //                   (lead) => !isConvertedStudent(lead) && lead.assigned_telecaller_id === row.id,
// // //                 ).length;
// // //                 return (
// // //                   <option key={row.id} value={row.id}>
// // //                     {displayName(row.first_name, row.last_name, row.email)} · {load} open
// // //                   </option>
// // //                 );
// // //               })}
// // //             </Select>
// // //           </Card>

// // //           <Card className="mt-3 overflow-hidden">
// // //             <p className="border-b border-slate-200 px-4 py-3 font-bold">Waiting for a telecaller</p>
// // //             {waiting.map((lead) => {
// // //               const hours = hoursSince(lead.created_at);
// // //               const late = (hours ?? 0) >= ESCALATE_HOURS;
// // //               const alerted = (hours ?? 0) >= interval;
// // //               return (
// // //                 <div
// // //                   key={lead.id}
// // //                   className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-4 py-3 last:border-b-0"
// // //                 >
// // //                   <div className="flex min-w-0 items-center gap-3">
// // //                     <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-navy-900 text-xs font-bold text-white">
// // //                       {initials(lead.first_name, lead.last_name, lead.email)}
// // //                     </span>
// // //                     <div className="min-w-0">
// // //                       <p className="font-semibold">
// // //                         {displayName(lead.first_name, lead.last_name, lead.email)}
// // //                       </p>
// // //                       <p className="text-xs text-slate-500">
// // //                         {(lead.preferred_countries || []).join(", ") || "No country"} · source{" "}
// // //                         {(lead.lead_source || "manual").replace(/_/g, " ")}
// // //                       </p>
// // //                       <p className={`mt-0.5 text-xs ${late ? "font-semibold text-rose-600" : "text-slate-400"}`}>
// // //                         Signed up {ageLabel(hours)} ago{alerted ? " · admins alerted" : " · within grace period"}
// // //                       </p>
// // //                     </div>
// // //                   </div>
// // //                   <div className="flex flex-wrap items-center gap-2">
// // //                     <Badge value={lead.lead_status || "warm"} />
// // //                     {late && <Badge value="rejected" className="normal-case">Escalated</Badge>}
// // //                     <Button size="sm" disabled={busy || !telecallerId} onClick={() => void assign(lead)}>
// // //                       Assign
// // //                     </Button>
// // //                   </div>
// // //                 </div>
// // //               );
// // //             })}
// // //             {waiting.length === 0 && (
// // //               <p className="p-8 text-center text-sm text-slate-500">
// // //                 Every open lead has a telecaller. Nothing to alert.
// // //               </p>
// // //             )}
// // //           </Card>

// // //           <Card className="mt-3 p-5">
// // //             <p className="font-bold">How the check works</p>
// // //             <p className="mt-1 text-sm text-slate-500">
// // //               The point is not the timer, it is not spamming. Admins stop reading an alert that repeats.
// // //             </p>
// // //             <div className="mt-3 space-y-3 text-sm">
// // //               {[
// // //                 ["bg-slate-300", "Grace period", "A brand new signup is left alone for a few minutes before anything is sent."],
// // //                 ["bg-amber-400", `First alert after ${interval}h`, "One digest to every admin naming who is waiting and for how long — not one message per lead."],
// // //                 ["bg-rose-500", `Repeat at most every ${status?.repeatHours ?? 24}h`, "The same lead is never reported twice inside that window, however many checks run."],
// // //                 ["bg-emerald-500", "Assigned — alerts stop", "The lead's alert record is deleted, so it will alert again from scratch if it is ever dropped."],
// // //               ].map(([dot, title, body]) => (
// // //                 <div key={title} className="flex gap-3 border-t border-slate-100 pt-3 first:border-t-0 first:pt-0">
// // //                   <span className={`mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full ${dot}`} />
// // //                   <div>
// // //                     <p className="font-semibold">{title}</p>
// // //                     <p className="text-slate-500">{body}</p>
// // //                   </div>
// // //                 </div>
// // //               ))}
// // //             </div>
// // //           </Card>
// // //         </div>

// // //         <Card className="overflow-hidden">
// // //           <p className="border-b border-slate-200 px-4 py-3 font-bold">Alerts sent to admins</p>
// // //           <div className="max-h-[70vh] overflow-y-auto">
// // //             {alertFeed.map((row) => (
// // //               <div key={row.id} className="border-b border-slate-100 px-4 py-3 last:border-b-0">
// // //                 <p className="text-sm font-semibold">{row.title}</p>
// // //                 <p className="mt-0.5 text-sm text-slate-600">{row.message}</p>
// // //                 {row.created_at && (
// // //                   <p className="mt-1 text-[11px] tabular-nums text-slate-400">
// // //                     {new Date(row.created_at).toLocaleString(undefined, {
// // //                       month: "short",
// // //                       day: "numeric",
// // //                       hour: "2-digit",
// // //                       minute: "2-digit",
// // //                     })}
// // //                   </p>
// // //                 )}
// // //               </div>
// // //             ))}
// // //             {alertFeed.length === 0 && (
// // //               <p className="p-8 text-center text-sm text-slate-500">
// // //                 No alerts sent yet. Press Run check now to test it.
// // //               </p>
// // //             )}
// // //           </div>
// // //         </Card>
// // //       </div>
// // //     </div>
// // //   );
// // // }

// // import { useEffect, useMemo, useState } from "react";
// // import { AlarmClock, RefreshCw } from "lucide-react";
// // import { api } from "@admin/lib/api";
// // import { refreshStore, useAdminStore } from "@admin/lib/store";
// // import { displayName, initials, isConvertedStudent } from "@admin/lib/utils";
// // import { Badge } from "@admin/components/ui/Badge";
// // import { Button } from "@admin/components/ui/Button";
// // import { Card } from "@admin/components/ui/Card";
// // import { Select } from "@admin/components/ui/Field";
// // import type { Lead } from "@admin/lib/types";

// // interface AlertStatus {
// //   enabled: boolean;
// //   intervalHours: number;
// //   repeatHours: number;
// //   lastRunAt: string | null;
// //   nextRunAt: string | null;
// //   lastError: string | null;
// //   unassignedCount: number;
// //   notifiedCount: number;
// // }

// // const ESCALATE_HOURS = 24;

// // function hoursSince(value?: string | null) {
// //   if (!value) return null;
// //   const ms = Date.now() - new Date(value).getTime();
// //   if (Number.isNaN(ms) || ms < 0) return 0;
// //   return ms / 3600000;
// // }

// // function ageLabel(hours: number | null) {
// //   if (hours === null) return "Unknown";
// //   if (hours < 1) return `${Math.round(hours * 60)}m`;
// //   if (hours < 24) return `${hours.toFixed(1)}h`;
// //   return `${Math.floor(hours / 24)}d ${Math.round(hours % 24)}h`;
// // }

// // function countdown(target: string | null) {
// //   if (!target) return "—";
// //   const ms = new Date(target).getTime() - Date.now();
// //   if (Number.isNaN(ms)) return "—";
// //   if (ms <= 0) return "Due now";
// //   const mins = Math.floor(ms / 60000);
// //   return mins < 60 ? `${mins}m` : `${Math.floor(mins / 60)}h ${mins % 60}m`;
// // }

// // function clockTime(value: string | null) {
// //   if (!value) return "Not run yet";
// //   return new Date(value).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
// // }

// // export default function LeadAlerts() {
// //   const store = useAdminStore();
// //   const [status, setStatus] = useState<AlertStatus | null>(null);
// //   const [telecallerId, setTelecallerId] = useState("");
// //   const [busy, setBusy] = useState(false);
// //   const [error, setError] = useState("");
// //   const [, forceTick] = useState(0);

// //   /**
// //    * "Request failed" is what the API client returns for a 404 with no body, which here
// //    * almost always means the running server predates the watcher endpoints. Say that
// //    * plainly instead of making someone guess.
// //    */
// //   const describe = (err: unknown) => {
// //     const raw = err instanceof Error ? err.message : "";
// //     if (!raw || raw === "Request failed") {
// //       return "The API did not recognise /api/system/alerts. The server running on port 8788 is older than this page — restart it, or update server/index.mjs.";
// //     }
// //     return raw;
// //   };

// //   const loadStatus = async () => {
// //     try {
// //       setStatus(await api<AlertStatus>("/system/alerts"));
// //       setError("");
// //     } catch (err) {
// //       setStatus(null);
// //       setError(describe(err));
// //     }
// //   };

// //   useEffect(() => {
// //     void loadStatus();
// //     // Keep the countdown honest without hammering the API.
// //     const tick = window.setInterval(() => forceTick((n) => n + 1), 30000);
// //     const poll = window.setInterval(() => void loadStatus(), 60000);
// //     return () => {
// //       window.clearInterval(tick);
// //       window.clearInterval(poll);
// //     };
// //   }, []);

// //   const waiting = useMemo(
// //     () =>
// //       store.leads
// //         .filter((lead) => !isConvertedStudent(lead) && !lead.assigned_telecaller_id)
// //         .sort((a, b) => String(a.created_at || "").localeCompare(String(b.created_at || ""))),
// //     [store.leads],
// //   );

// //   const escalated = waiting.filter((lead) => (hoursSince(lead.created_at) ?? 0) >= ESCALATE_HOURS);
// //   const alertFeed = store.notifications
// //     .filter((row) => (row.title || "").toLowerCase().includes("telecaller"))
// //     .sort((a, b) => String(b.created_at || "").localeCompare(String(a.created_at || "")))
// //     .slice(0, 25);

// //   const runNow = async () => {
// //     setBusy(true);
// //     setError("");
// //     try {
// //       setStatus(await api<AlertStatus>("/system/alerts/run", { method: "POST" }));
// //       await refreshStore();
// //     } catch (err) {
// //       setError(describe(err));
// //     } finally {
// //       setBusy(false);
// //     }
// //   };

// //   const assign = async (lead: Lead) => {
// //     if (!telecallerId) return;
// //     setBusy(true);
// //     setError("");
// //     try {
// //       await api(`/leads/${lead.id}`, { method: "PATCH", body: { assigned_telecaller_id: telecallerId } });
// //       await refreshStore();
// //       await loadStatus();
// //     } catch (err) {
// //       setError(err instanceof Error ? err.message : "Could not assign the telecaller.");
// //     } finally {
// //       setBusy(false);
// //     }
// //   };

// //   const interval = status?.intervalHours ?? 2;

// //   return (
// //     <div>
// //       <div className="mb-5 flex items-center gap-3">
// //         <AlarmClock className="h-6 w-6 text-sky-500" />
// //         <div>
// //           <h1 className="text-2xl font-bold">Lead alerts</h1>
// //           <p className="text-slate-600">
// //             Every {interval} hours the server checks for signups with no telecaller and notifies the admins.
// //           </p>
// //         </div>
// //       </div>

// //       <div className="rounded-2xl bg-navy-950 p-5 text-white shadow-card">
// //         <div className="flex flex-wrap items-center justify-between gap-5">
// //           <div>
// //             <p className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-wider text-slate-400">
// //               <span
// //                 className={`h-2 w-2 rounded-full ${
// //                   !status ? "bg-slate-500" : status.enabled ? "animate-pulse bg-emerald-500" : "bg-rose-500"
// //                 }`}
// //               />
// //               Watcher
// //             </p>
// //             <p className="mt-1 text-xl font-bold">
// //               {!status ? "Unknown" : status.enabled ? "Running" : "Disabled"}
// //             </p>
// //           </div>
// //           <div>
// //             <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Last check</p>
// //             <p className="mt-1 text-xl font-bold tabular-nums">
// //               {status ? clockTime(status.lastRunAt) : "—"}
// //             </p>
// //           </div>
// //           <div>
// //             <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Next check in</p>
// //             <p className="mt-1 text-xl font-bold tabular-nums">
// //               {status ? countdown(status.nextRunAt) : "—"}
// //             </p>
// //           </div>
// //           <div>
// //             <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Reported last run</p>
// //             <p className="mt-1 text-xl font-bold tabular-nums">{status ? status.notifiedCount : "—"}</p>
// //           </div>
// //           <Button variant="secondary" size="sm" disabled={busy} onClick={() => void runNow()}>
// //             <RefreshCw className={`h-4 w-4 ${busy ? "animate-spin" : ""}`} /> Run check now
// //           </Button>
// //         </div>
// //       </div>

// //       {status && !status.enabled && (
// //         <Card className="mt-4 border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
// //           The watcher is switched off. Set <code>UNASSIGNED_ALERT_HOURS</code> to a positive number and restart the
// //           API to turn it back on.
// //         </Card>
// //       )}
// //       {status?.lastError && (
// //         <Card className="mt-4 border-rose-200 bg-rose-50 p-4 text-sm text-rose-800">
// //           Last check failed: {status.lastError}
// //         </Card>
// //       )}
// //       {error && <Card className="mt-4 border-rose-200 bg-rose-50 p-4 text-sm text-rose-800">{error}</Card>}
// //       {escalated.length > 0 && (
// //         <Card className="mt-4 border-rose-200 bg-rose-50 p-4 text-sm text-rose-800">
// //           <strong>
// //             {escalated.length} lead{escalated.length === 1 ? " has" : "s have"} been waiting over {ESCALATE_HOURS} hours.
// //           </strong>{" "}
// //           Assign a telecaller now.
// //         </Card>
// //       )}

// //       <div className="mt-4 grid gap-3 sm:grid-cols-3">
// //         {[
// //           { label: "Waiting for a telecaller", value: waiting.length, alert: waiting.length > 0 },
// //           { label: `Escalated past ${ESCALATE_HOURS}h`, value: escalated.length, alert: escalated.length > 0 },
// //           { label: "Alerts in the log", value: alertFeed.length },
// //         ].map((stat) => (
// //           <Card key={stat.label} className="p-4">
// //             <div className={`h-4 w-4 rounded-md ${stat.alert ? "bg-rose-100" : "bg-sky-100"}`} />
// //             <p className={`mt-2 text-2xl font-bold ${stat.alert ? "text-rose-600" : ""}`}>{stat.value}</p>
// //             <p className="text-sm text-slate-500">{stat.label}</p>
// //           </Card>
// //         ))}
// //       </div>

// //       <div className="mt-4 grid gap-4 xl:grid-cols-[1.4fr_1fr]">
// //         <div>
// //           <Card className="p-4">
// //             <p className="mb-1.5 text-sm font-medium text-slate-700">Assign to</p>
// //             <Select value={telecallerId} onChange={(e) => setTelecallerId(e.target.value)}>
// //               <option value="">Choose telecaller</option>
// //               {store.telecallers.map((row) => {
// //                 const load = store.leads.filter(
// //                   (lead) => !isConvertedStudent(lead) && lead.assigned_telecaller_id === row.id,
// //                 ).length;
// //                 return (
// //                   <option key={row.id} value={row.id}>
// //                     {displayName(row.first_name, row.last_name, row.email)} · {load} open
// //                   </option>
// //                 );
// //               })}
// //             </Select>
// //           </Card>

// //           <Card className="mt-3 overflow-hidden">
// //             <p className="border-b border-slate-200 px-4 py-3 font-bold">Waiting for a telecaller</p>
// //             {waiting.map((lead) => {
// //               const hours = hoursSince(lead.created_at);
// //               const late = (hours ?? 0) >= ESCALATE_HOURS;
// //               const alerted = (hours ?? 0) >= interval;
// //               return (
// //                 <div
// //                   key={lead.id}
// //                   className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-4 py-3 last:border-b-0"
// //                 >
// //                   <div className="flex min-w-0 items-center gap-3">
// //                     <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-navy-900 text-xs font-bold text-white">
// //                       {initials(lead.first_name, lead.last_name, lead.email)}
// //                     </span>
// //                     <div className="min-w-0">
// //                       <p className="font-semibold">
// //                         {displayName(lead.first_name, lead.last_name, lead.email)}
// //                       </p>
// //                       <p className="text-xs text-slate-500">
// //                         {(lead.preferred_countries || []).join(", ") || "No country"} · source{" "}
// //                         {(lead.lead_source || "manual").replace(/_/g, " ")}
// //                       </p>
// //                       <p className={`mt-0.5 text-xs ${late ? "font-semibold text-rose-600" : "text-slate-400"}`}>
// //                         Signed up {ageLabel(hours)} ago{alerted ? " · admins alerted" : " · within grace period"}
// //                       </p>
// //                     </div>
// //                   </div>
// //                   <div className="flex flex-wrap items-center gap-2">
// //                     <Badge value={lead.lead_status || "warm"} />
// //                     {late && <Badge value="rejected" className="normal-case">Escalated</Badge>}
// //                     <Button size="sm" disabled={busy || !telecallerId} onClick={() => void assign(lead)}>
// //                       Assign
// //                     </Button>
// //                   </div>
// //                 </div>
// //               );
// //             })}
// //             {waiting.length === 0 && (
// //               <p className="p-8 text-center text-sm text-slate-500">
// //                 Every open lead has a telecaller. Nothing to alert.
// //               </p>
// //             )}
// //           </Card>

// //           <Card className="mt-3 p-5">
// //             <p className="font-bold">How the check works</p>
// //             <p className="mt-1 text-sm text-slate-500">
// //               The point is not the timer, it is not spamming. Admins stop reading an alert that repeats.
// //             </p>
// //             <div className="mt-3 space-y-3 text-sm">
// //               {[
// //                 ["bg-slate-300", "Grace period", "A brand new signup is left alone for a few minutes before anything is sent."],
// //                 ["bg-amber-400", `First alert after ${interval}h`, "One digest to every admin naming who is waiting and for how long — not one message per lead."],
// //                 ["bg-rose-500", `Repeat at most every ${status?.repeatHours ?? 24}h`, "The same lead is never reported twice inside that window, however many checks run."],
// //                 ["bg-emerald-500", "Assigned — alerts stop", "The lead's alert record is deleted, so it will alert again from scratch if it is ever dropped."],
// //               ].map(([dot, title, body]) => (
// //                 <div key={title} className="flex gap-3 border-t border-slate-100 pt-3 first:border-t-0 first:pt-0">
// //                   <span className={`mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full ${dot}`} />
// //                   <div>
// //                     <p className="font-semibold">{title}</p>
// //                     <p className="text-slate-500">{body}</p>
// //                   </div>
// //                 </div>
// //               ))}
// //             </div>
// //           </Card>
// //         </div>

// //         <Card className="overflow-hidden">
// //           <p className="border-b border-slate-200 px-4 py-3 font-bold">Alerts sent to admins</p>
// //           <div className="max-h-[70vh] overflow-y-auto">
// //             {alertFeed.map((row) => (
// //               <div key={row.id} className="border-b border-slate-100 px-4 py-3 last:border-b-0">
// //                 <p className="text-sm font-semibold">{row.title}</p>
// //                 <p className="mt-0.5 text-sm text-slate-600">{row.message}</p>
// //                 {row.created_at && (
// //                   <p className="mt-1 text-[11px] tabular-nums text-slate-400">
// //                     {new Date(row.created_at).toLocaleString(undefined, {
// //                       month: "short",
// //                       day: "numeric",
// //                       hour: "2-digit",
// //                       minute: "2-digit",
// //                     })}
// //                   </p>
// //                 )}
// //               </div>
// //             ))}
// //             {alertFeed.length === 0 && (
// //               <p className="p-8 text-center text-sm text-slate-500">
// //                 No alerts sent yet. Press Run check now to test it.
// //               </p>
// //             )}
// //           </div>
// //         </Card>
// //       </div>
// //     </div>
// //   );
// // }

// import { useEffect, useMemo, useState } from "react";
// import { AlarmClock, RefreshCw } from "lucide-react";
// import { api } from "@admin/lib/api";
// import { refreshStore, useAdminStore } from "@admin/lib/store";
// import { displayName, initials, isConvertedStudent } from "@admin/lib/utils";
// import { Badge } from "@admin/components/ui/Badge";
// import { Button } from "@admin/components/ui/Button";
// import { Card } from "@admin/components/ui/Card";
// import { Select } from "@admin/components/ui/Field";
// import type { Lead } from "@admin/lib/types";

// interface AlertStatus {
//   enabled: boolean;
//   intervalHours: number;
//   repeatHours: number;
//   lastRunAt: string | null;
//   nextRunAt: string | null;
//   lastError: string | null;
//   unassignedCount: number;
//   notifiedCount: number;
//   coldAfterDays: number;
//   cooledCount: number;
// }

// const ESCALATE_HOURS = 24;

// function hoursSince(value?: string | null) {
//   if (!value) return null;
//   const ms = Date.now() - new Date(value).getTime();
//   if (Number.isNaN(ms) || ms < 0) return 0;
//   return ms / 3600000;
// }

// function ageLabel(hours: number | null) {
//   if (hours === null) return "Unknown";
//   if (hours < 1) return `${Math.round(hours * 60)}m`;
//   if (hours < 24) return `${hours.toFixed(1)}h`;
//   return `${Math.floor(hours / 24)}d ${Math.round(hours % 24)}h`;
// }

// function countdown(target: string | null) {
//   if (!target) return "—";
//   const ms = new Date(target).getTime() - Date.now();
//   if (Number.isNaN(ms)) return "—";
//   if (ms <= 0) return "Due now";
//   const mins = Math.floor(ms / 60000);
//   return mins < 60 ? `${mins}m` : `${Math.floor(mins / 60)}h ${mins % 60}m`;
// }

// function clockTime(value: string | null) {
//   if (!value) return "Not run yet";
//   return new Date(value).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
// }

// export default function LeadAlerts() {
//   const store = useAdminStore();
//   const [status, setStatus] = useState<AlertStatus | null>(null);
//   const [telecallerId, setTelecallerId] = useState("");
//   const [busy, setBusy] = useState(false);
//   const [error, setError] = useState("");
//   const [, forceTick] = useState(0);

//   /**
//    * "Request failed" is what the API client returns for a 404 with no body, which here
//    * almost always means the running server predates the watcher endpoints. Say that
//    * plainly instead of making someone guess.
//    */
//   const describe = (err: unknown) => {
//     const raw = err instanceof Error ? err.message : "";
//     if (!raw || raw === "Request failed") {
//       return "The API did not recognise /api/system/alerts. The server running on port 8788 is older than this page — restart it, or update server/index.mjs.";
//     }
//     return raw;
//   };

//   const loadStatus = async () => {
//     try {
//       setStatus(await api<AlertStatus>("/system/alerts"));
//       setError("");
//     } catch (err) {
//       setStatus(null);
//       setError(describe(err));
//     }
//   };

//   useEffect(() => {
//     void loadStatus();
//     // Keep the countdown honest without hammering the API.
//     const tick = window.setInterval(() => forceTick((n) => n + 1), 30000);
//     const poll = window.setInterval(() => void loadStatus(), 60000);
//     return () => {
//       window.clearInterval(tick);
//       window.clearInterval(poll);
//     };
//   }, []);

//   const waiting = useMemo(
//     () =>
//       store.leads
//         .filter((lead) => !isConvertedStudent(lead) && !lead.assigned_telecaller_id)
//         .sort((a, b) => String(a.created_at || "").localeCompare(String(b.created_at || ""))),
//     [store.leads],
//   );

//   const escalated = waiting.filter((lead) => (hoursSince(lead.created_at) ?? 0) >= ESCALATE_HOURS);
//   const alertFeed = store.notifications
//     .filter((row) => (row.title || "").toLowerCase().includes("telecaller"))
//     .sort((a, b) => String(b.created_at || "").localeCompare(String(a.created_at || "")))
//     .slice(0, 25);

//   const runNow = async () => {
//     setBusy(true);
//     setError("");
//     try {
//       setStatus(await api<AlertStatus>("/system/alerts/run", { method: "POST" }));
//       await refreshStore();
//     } catch (err) {
//       setError(describe(err));
//     } finally {
//       setBusy(false);
//     }
//   };

//   const assign = async (lead: Lead) => {
//     if (!telecallerId) return;
//     setBusy(true);
//     setError("");
//     try {
//       await api(`/leads/${lead.id}`, { method: "PATCH", body: { assigned_telecaller_id: telecallerId } });
//       await refreshStore();
//       await loadStatus();
//     } catch (err) {
//       setError(err instanceof Error ? err.message : "Could not assign the telecaller.");
//     } finally {
//       setBusy(false);
//     }
//   };

//   const interval = status?.intervalHours ?? 2;

//   return (
//     <div>
//       <div className="mb-5 flex items-center gap-3">
//         <AlarmClock className="h-6 w-6 text-sky-500" />
//         <div>
//           <h1 className="text-2xl font-bold">Lead alerts</h1>
//           <p className="text-slate-600">
//             Every {interval} hours the server checks for signups with no telecaller and notifies the admins.
//           </p>
//         </div>
//       </div>

//       <div className="rounded-2xl bg-navy-950 p-5 text-white shadow-card">
//         <div className="flex flex-wrap items-center justify-between gap-5">
//           <div>
//             <p className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-wider text-slate-400">
//               <span
//                 className={`h-2 w-2 rounded-full ${
//                   !status ? "bg-slate-500" : status.enabled ? "animate-pulse bg-emerald-500" : "bg-rose-500"
//                 }`}
//               />
//               Watcher
//             </p>
//             <p className="mt-1 text-xl font-bold">
//               {!status ? "Unknown" : status.enabled ? "Running" : "Disabled"}
//             </p>
//           </div>
//           <div>
//             <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Last check</p>
//             <p className="mt-1 text-xl font-bold tabular-nums">
//               {status ? clockTime(status.lastRunAt) : "—"}
//             </p>
//           </div>
//           <div>
//             <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Next check in</p>
//             <p className="mt-1 text-xl font-bold tabular-nums">
//               {status ? countdown(status.nextRunAt) : "—"}
//             </p>
//           </div>
//           <div>
//             <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Reported last run</p>
//             <p className="mt-1 text-xl font-bold tabular-nums">{status ? status.notifiedCount : "—"}</p>
//           </div>
//           <div>
//             <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Cooled last run</p>
//             <p className="mt-1 text-xl font-bold tabular-nums">{status ? status.cooledCount : "—"}</p>
//           </div>
//           <Button variant="secondary" size="sm" disabled={busy} onClick={() => void runNow()}>
//             <RefreshCw className={`h-4 w-4 ${busy ? "animate-spin" : ""}`} /> Run check now
//           </Button>
//         </div>
//       </div>

//       {status && !status.enabled && (
//         <Card className="mt-4 border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
//           The watcher is switched off. Set <code>UNASSIGNED_ALERT_HOURS</code> to a positive number and restart the
//           API to turn it back on.
//         </Card>
//       )}
//       {status?.lastError && (
//         <Card className="mt-4 border-rose-200 bg-rose-50 p-4 text-sm text-rose-800">
//           Last check failed: {status.lastError}
//         </Card>
//       )}
//       {error && <Card className="mt-4 border-rose-200 bg-rose-50 p-4 text-sm text-rose-800">{error}</Card>}
//       {escalated.length > 0 && (
//         <Card className="mt-4 border-rose-200 bg-rose-50 p-4 text-sm text-rose-800">
//           <strong>
//             {escalated.length} lead{escalated.length === 1 ? " has" : "s have"} been waiting over {ESCALATE_HOURS} hours.
//           </strong>{" "}
//           Assign a telecaller now.
//         </Card>
//       )}

//       <div className="mt-4 grid gap-3 sm:grid-cols-3">
//         {[
//           { label: "Waiting for a telecaller", value: waiting.length, alert: waiting.length > 0 },
//           { label: `Escalated past ${ESCALATE_HOURS}h`, value: escalated.length, alert: escalated.length > 0 },
//           { label: "Alerts in the log", value: alertFeed.length },
//         ].map((stat) => (
//           <Card key={stat.label} className="p-4">
//             <div className={`h-4 w-4 rounded-md ${stat.alert ? "bg-rose-100" : "bg-sky-100"}`} />
//             <p className={`mt-2 text-2xl font-bold ${stat.alert ? "text-rose-600" : ""}`}>{stat.value}</p>
//             <p className="text-sm text-slate-500">{stat.label}</p>
//           </Card>
//         ))}
//       </div>

//       <div className="mt-4 grid gap-4 xl:grid-cols-[1.4fr_1fr]">
//         <div>
//           <Card className="p-4">
//             <p className="mb-1.5 text-sm font-medium text-slate-700">Assign to</p>
//             <Select value={telecallerId} onChange={(e) => setTelecallerId(e.target.value)}>
//               <option value="">Choose telecaller</option>
//               {store.telecallers.map((row) => {
//                 const load = store.leads.filter(
//                   (lead) => !isConvertedStudent(lead) && lead.assigned_telecaller_id === row.id,
//                 ).length;
//                 return (
//                   <option key={row.id} value={row.id}>
//                     {displayName(row.first_name, row.last_name, row.email)} · {load} open
//                   </option>
//                 );
//               })}
//             </Select>
//           </Card>

//           <Card className="mt-3 overflow-hidden">
//             <p className="border-b border-slate-200 px-4 py-3 font-bold">Waiting for a telecaller</p>
//             {waiting.map((lead) => {
//               const hours = hoursSince(lead.created_at);
//               const late = (hours ?? 0) >= ESCALATE_HOURS;
//               const alerted = (hours ?? 0) >= interval;
//               return (
//                 <div
//                   key={lead.id}
//                   className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-4 py-3 last:border-b-0"
//                 >
//                   <div className="flex min-w-0 items-center gap-3">
//                     <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-navy-900 text-xs font-bold text-white">
//                       {initials(lead.first_name, lead.last_name, lead.email)}
//                     </span>
//                     <div className="min-w-0">
//                       <p className="font-semibold">
//                         {displayName(lead.first_name, lead.last_name, lead.email)}
//                       </p>
//                       <p className="text-xs text-slate-500">
//                         {(lead.preferred_countries || []).join(", ") || "No country"} · source{" "}
//                         {(lead.lead_source || "manual").replace(/_/g, " ")}
//                       </p>
//                       <p className={`mt-0.5 text-xs ${late ? "font-semibold text-rose-600" : "text-slate-400"}`}>
//                         Signed up {ageLabel(hours)} ago{alerted ? " · admins alerted" : " · within grace period"}
//                       </p>
//                     </div>
//                   </div>
//                   <div className="flex flex-wrap items-center gap-2">
//                     <Badge value={lead.lead_status || "warm"} />
//                     {late && <Badge value="rejected" className="normal-case">Escalated</Badge>}
//                     <Button size="sm" disabled={busy || !telecallerId} onClick={() => void assign(lead)}>
//                       Assign
//                     </Button>
//                   </div>
//                 </div>
//               );
//             })}
//             {waiting.length === 0 && (
//               <p className="p-8 text-center text-sm text-slate-500">
//                 Every open lead has a telecaller. Nothing to alert.
//               </p>
//             )}
//           </Card>

//           <Card className="mt-3 p-5">
//             <p className="font-bold">How the check works</p>
//             <p className="mt-1 text-sm text-slate-500">
//               The point is not the timer, it is not spamming. Admins stop reading an alert that repeats.
//             </p>
//             <div className="mt-3 space-y-3 text-sm">
//               {[
//                 ["bg-slate-300", "Grace period", "A brand new signup is left alone for a few minutes before anything is sent."],
//                 ["bg-amber-400", `First alert after ${interval}h`, "One digest to every admin naming who is waiting and for how long — not one message per lead."],
//                 ["bg-rose-500", `Repeat at most every ${status?.repeatHours ?? 24}h`, "The same lead is never reported twice inside that window, however many checks run."],
//                 ["bg-emerald-500", "Assigned — alerts stop", "The lead's alert record is deleted, so it will alert again from scratch if it is ever dropped."],
//                 ["bg-slate-400", `Goes cold after ${status?.coldAfterDays ?? 2} days`, "Separately, any lead whose telecaller has logged no call in that time is set to cold and the telecaller is told."],
//               ].map(([dot, title, body]) => (
//                 <div key={title} className="flex gap-3 border-t border-slate-100 pt-3 first:border-t-0 first:pt-0">
//                   <span className={`mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full ${dot}`} />
//                   <div>
//                     <p className="font-semibold">{title}</p>
//                     <p className="text-slate-500">{body}</p>
//                   </div>
//                 </div>
//               ))}
//             </div>
//           </Card>
//         </div>

//         <Card className="overflow-hidden">
//           <p className="border-b border-slate-200 px-4 py-3 font-bold">Alerts sent to admins</p>
//           <div className="max-h-[70vh] overflow-y-auto">
//             {alertFeed.map((row) => (
//               <div key={row.id} className="border-b border-slate-100 px-4 py-3 last:border-b-0">
//                 <p className="text-sm font-semibold">{row.title}</p>
//                 <p className="mt-0.5 text-sm text-slate-600">{row.message}</p>
//                 {row.created_at && (
//                   <p className="mt-1 text-[11px] tabular-nums text-slate-400">
//                     {new Date(row.created_at).toLocaleString(undefined, {
//                       month: "short",
//                       day: "numeric",
//                       hour: "2-digit",
//                       minute: "2-digit",
//                     })}
//                   </p>
//                 )}
//               </div>
//             ))}
//             {alertFeed.length === 0 && (
//               <p className="p-8 text-center text-sm text-slate-500">
//                 No alerts sent yet. Press Run check now to test it.
//               </p>
//             )}
//           </div>
//         </Card>
//       </div>
//     </div>
//   );
// }

import { useEffect, useMemo, useState } from "react";
import { AlarmClock, RefreshCw } from "lucide-react";
import { api } from "@admin/lib/api";
import { refreshStore, useAdminStore } from "@admin/lib/store";
import {
  displayName,
  initials,
  isConvertedStudent,
  isWhatsAppLead,
  leadNeedsAssignment,
  leadSourceLabel,
} from "@admin/lib/utils";
import { Badge } from "@admin/components/ui/Badge";
import { Button } from "@admin/components/ui/Button";
import { Card } from "@admin/components/ui/Card";
import { Select } from "@admin/components/ui/Field";
import type { Lead } from "@admin/lib/types";

interface AlertStatus {
  enabled: boolean;
  intervalHours: number;
  repeatHours: number;
  lastRunAt: string | null;
  nextRunAt: string | null;
  lastError: string | null;
  unassignedCount: number;
  notifiedCount: number;
  coldAfterDays: number;
  cooledCount: number;
  autoAssign: boolean;
  assignedCount: number;
}

const ESCALATE_HOURS = 24;

function hoursSince(value?: string | null) {
  if (!value) return null;
  const ms = Date.now() - new Date(value).getTime();
  if (Number.isNaN(ms) || ms < 0) return 0;
  return ms / 3600000;
}

function ageLabel(hours: number | null) {
  if (hours === null) return "Unknown";
  if (hours < 1) return `${Math.round(hours * 60)}m`;
  if (hours < 24) return `${hours.toFixed(1)}h`;
  return `${Math.floor(hours / 24)}d ${Math.round(hours % 24)}h`;
}

function countdown(target: string | null) {
  if (!target) return "—";
  const ms = new Date(target).getTime() - Date.now();
  if (Number.isNaN(ms)) return "—";
  if (ms <= 0) return "Due now";
  const mins = Math.floor(ms / 60000);
  return mins < 60 ? `${mins}m` : `${Math.floor(mins / 60)}h ${mins % 60}m`;
}

function clockTime(value: string | null) {
  if (!value) return "Not run yet";
  return new Date(value).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
}

export default function LeadAlerts() {
  const store = useAdminStore();
  const [status, setStatus] = useState<AlertStatus | null>(null);
  const [assignMode, setAssignMode] = useState<"telecaller" | "counselor">("telecaller");
  const [telecallerId, setTelecallerId] = useState("");
  const [counselorId, setCounselorId] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [, forceTick] = useState(0);

  const describe = (err: unknown) => {
    const raw = err instanceof Error ? err.message : "";
    if (!raw || raw === "Request failed") {
      return "The API did not recognise /api/system/alerts. Restart the server on port 8788 and try again.";
    }
    return raw;
  };

  const loadStatus = async () => {
    try {
      setStatus(await api<AlertStatus>("/system/alerts"));
      setError("");
    } catch (err) {
      setStatus(null);
      setError(describe(err));
    }
  };

  useEffect(() => {
    void loadStatus();
    const tick = window.setInterval(() => forceTick((n) => n + 1), 30000);
    const poll = window.setInterval(() => void loadStatus(), 60000);
    return () => {
      window.clearInterval(tick);
      window.clearInterval(poll);
    };
  }, []);

  const waiting = useMemo(
    () =>
      store.leads
        .filter((lead) => leadNeedsAssignment(lead))
        .sort((a, b) => String(a.created_at || "").localeCompare(String(b.created_at || ""))),
    [store.leads],
  );

  const whatsappWaiting = useMemo(
    () => waiting.filter((lead) => isWhatsAppLead(lead) && !isConvertedStudent(lead)),
    [waiting],
  );

  const otherWaiting = useMemo(
    () => waiting.filter((lead) => !whatsappWaiting.some((row) => row.id === lead.id)),
    [waiting, whatsappWaiting],
  );

  const oldestHours = waiting.length
    ? Math.max(...waiting.map((lead) => hoursSince(lead.created_at) ?? 0))
    : 0;

  const selectedAssignee = assignMode === "telecaller" ? telecallerId : counselorId;

  const runNow = async () => {
    setBusy(true);
    setError("");
    try {
      setStatus(await api<AlertStatus>("/system/alerts/run", { method: "POST" }));
      await refreshStore();
    } catch (err) {
      setError(describe(err));
    } finally {
      setBusy(false);
    }
  };

  const assignLead = async (lead: Lead) => {
    if (assignMode === "telecaller") {
      if (!telecallerId) return;
      setBusy(true);
      setError("");
      try {
        await api(`/leads/${lead.id}`, {
          method: "PATCH",
          body: { assigned_telecaller_id: telecallerId, status: "assigned" },
        });
        await refreshStore();
        await loadStatus();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Could not assign the telecaller.");
      } finally {
        setBusy(false);
      }
      return;
    }
    if (!counselorId) return;
    setBusy(true);
    setError("");
    try {
      await api(`/leads/${lead.id}`, {
        method: "PATCH",
        body: { assigned_counselor_id: counselorId, status: "assigned" },
      });
      await refreshStore();
      await loadStatus();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not assign the counselor.");
    } finally {
      setBusy(false);
    }
  };

  const interval = status?.intervalHours ?? 2;
  const repeatHours = status?.repeatHours ?? 24;

  return (
    <div>
      <div className="mb-5 flex items-center gap-3">
        <AlarmClock className="h-6 w-6 text-sky-500" />
        <div>
          <h1 className="text-2xl font-bold">Lead alerts</h1>
        </div>
      </div>

      <Card className="mb-4 flex flex-wrap items-center justify-between gap-4 p-4">
        <div>
          <p className="text-2xl font-bold text-slate-900">{waiting.length}</p>
          <p className="text-sm text-slate-500">
            {waiting.length === 1 ? "lead waiting" : "leads waiting"}
            {waiting.length > 0 && oldestHours >= 1 && (
              <> · oldest {ageLabel(oldestHours)}</>
            )}
          </p>
        </div>
        <div className="text-right text-sm text-slate-500">
          <p>Auto-reminder every {interval}h · repeats at most every {repeatHours}h</p>
          <p>Last check: {status ? clockTime(status.lastRunAt) : "—"} · Next: {status ? countdown(status.nextRunAt) : "—"}</p>
        </div>
        <Button variant="secondary" size="sm" disabled={busy} onClick={() => void runNow()}>
          <RefreshCw className={`h-4 w-4 ${busy ? "animate-spin" : ""}`} /> Run check now
        </Button>
      </Card>

      {error && <Card className="mb-4 border-rose-200 bg-rose-50 p-4 text-sm text-rose-800">{error}</Card>}
      {status?.lastError && (
        <Card className="mb-4 border-rose-200 bg-rose-50 p-4 text-sm text-rose-800">
          Last check failed: {status.lastError}
        </Card>
      )}
      {waiting.length > 0 && oldestHours >= ESCALATE_HOURS && (
        <Card className="mb-4 border-rose-200 bg-rose-50 p-4 text-sm text-rose-800">
          <strong>{waiting.length} lead{waiting.length === 1 ? "" : "s"} waiting over {ESCALATE_HOURS} hours.</strong>{" "}
          Assign someone below.
        </Card>
      )}

      <Card className="mb-4 p-4">
        <p className="mb-3 text-sm font-medium text-slate-700">Step 1 — choose who to assign</p>
        <div className="flex flex-wrap gap-2">
          {(["telecaller", "counselor"] as const).map((mode) => (
            <button
              key={mode}
              type="button"
              onClick={() => setAssignMode(mode)}
              className={`rounded-lg px-4 py-2 text-sm font-medium capitalize ${
                assignMode === mode ? "bg-navy-900 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"
              }`}
            >
              {mode}
            </button>
          ))}
        </div>
        <div className="mt-3">
          {assignMode === "telecaller" ? (
            <Select value={telecallerId} onChange={(e) => setTelecallerId(e.target.value)}>
              <option value="">Choose telecaller</option>
              {store.telecallers.map((row) => (
                <option key={row.id} value={row.id}>
                  {displayName(row.first_name, row.last_name, row.email)}
                </option>
              ))}
            </Select>
          ) : (
            <Select value={counselorId} onChange={(e) => setCounselorId(e.target.value)}>
              <option value="">Choose counselor</option>
              {store.counselors.map((row) => (
                <option key={row.id} value={row.id}>
                  {displayName(row.first_name, row.last_name, row.email)}
                  {row.specializations?.length ? ` · ${row.specializations.join(", ")}` : ""}
                </option>
              ))}
            </Select>
          )}
        </div>
      </Card>

      {whatsappWaiting.length > 0 && (
        <Card className="mb-4 overflow-hidden border-emerald-200">
          <p className="border-b border-emerald-100 bg-emerald-50 px-4 py-3 text-sm font-bold text-emerald-900">
            WhatsApp leads — assign a telecaller first ({whatsappWaiting.length})
          </p>
          {whatsappWaiting.map((lead) => {
            const hours = hoursSince(lead.created_at);
            return (
              <div
                key={lead.id}
                className="flex flex-wrap items-center justify-between gap-3 border-b border-emerald-50 px-4 py-3 last:border-b-0"
              >
                <div className="flex min-w-0 items-center gap-3">
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-600 text-xs font-bold text-white">
                    {initials(lead.first_name, lead.last_name, lead.email)}
                  </span>
                  <div className="min-w-0">
                    <p className="font-semibold">{displayName(lead.first_name, lead.last_name, lead.email)}</p>
                    <p className="text-xs text-slate-500">
                      +{lead.whatsapp_number?.slice(-10) || lead.phone || "—"} · WhatsApp · waiting {ageLabel(hours)}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Badge value="whatsapp" className="normal-case" />
                  <Button
                    size="sm"
                    disabled={busy || assignMode !== "telecaller" || !telecallerId}
                    onClick={() => void assignLead(lead)}
                  >
                    Assign telecaller
                  </Button>
                </div>
              </div>
            );
          })}
        </Card>
      )}

      <Card className="overflow-hidden">
        <p className="border-b border-slate-200 px-4 py-3 font-bold">Step 2 — assign waiting leads</p>
        {(whatsappWaiting.length ? otherWaiting : waiting).map((lead) => {
          const hours = hoursSince(lead.created_at);
          const sourceLabel = leadSourceLabel(lead);
          return (
            <div
              key={lead.id}
              className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-4 py-3 last:border-b-0"
            >
              <div className="flex min-w-0 items-center gap-3">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-navy-900 text-xs font-bold text-white">
                  {initials(lead.first_name, lead.last_name, lead.email)}
                </span>
                <div className="min-w-0">
                  <p className="font-semibold">{displayName(lead.first_name, lead.last_name, lead.email)}</p>
                  <p className="text-xs text-slate-500">
                    {(lead.preferred_countries || []).join(", ") || "No country"} · {sourceLabel} · waiting {ageLabel(hours)}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Badge value={isConvertedStudent(lead) ? "converted" : lead.lead_status || "hot"} />
                {isWhatsAppLead(lead) && <Badge value="whatsapp" className="normal-case" />}
                <Button size="sm" disabled={busy || !selectedAssignee} onClick={() => void assignLead(lead)}>
                  Assign {assignMode}
                </Button>
              </div>
            </div>
          );
        })}
        {waiting.length === 0 && (
          <p className="p-8 text-center text-sm text-slate-500">All caught up — every lead has a telecaller or counselor.</p>
        )}
      </Card>
    </div>
  );
}