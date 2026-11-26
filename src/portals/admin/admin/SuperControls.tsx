import { useCallback, useEffect, useState } from "react";
import { ShieldCheck, ScrollText, Undo2, AlertTriangle } from "lucide-react";
import { api } from "@admin/lib/api";
import { Card } from "@admin/components/ui/Card";

/**
 * The owner's control room: the few switches that protect the business, and a log of everything that happens.
 * Super Admin only (the server refuses everyone else).
 */

type Switch = { key: string; label: string; help: string; risky: string; value: boolean; isDefault: boolean; changedByName: string | null; changedAt: string | null };
type Readiness = { staffWithoutNumber: { id: string; name: string | null; email: string; role: string }[]; youHaveNumber: boolean };
type Item = {
  id: string; at: string; action: string; entity: string; entityId: string | null;
  actorName: string | null; actorEmail: string | null; actorRole: string | null; branch: string | null; ip: string | null;
  detail: Record<string, unknown>; canUndo: boolean; undone: boolean;
};

type Req = { id: string; kind: string; from_name: string; to_name: string; count: number; reason: string; requested_by_name: string | null; created_at: string; status: string };

const WORDS: Record<string, string> = {
  "auth.signin": "Signed in", "auth.signin_failed": "Failed sign-in", "auth.signin_blocked": "Sign-in refused", "auth.code_sent": "WhatsApp code sent", "auth.code_failed": "Wrong WhatsApp code",
  "switch.change": "Switch changed", "lead.transfer": "Lead moved to another owner", "staff.transfer_work": "Work transferred", "lead.telecaller": "Telecaller changed",
  "lead.branch": "Lead moved to a branch", undo: "Undone", "transfer.request": "Transfer requested by an Admin", "transfer.decision": "Transfer request decided",
};
const label = (action: string) => WORDS[action] || action.replace(/[._]/g, " ");
const when = (iso: string) => new Date(iso).toLocaleString("en-IN", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
const bad = (a: string) => a === "auth.signin_failed" || a === "auth.code_failed" || a === "auth.signin_blocked";

function summary(it: Item) {
  const d = it.detail || {};
  if (it.action === "switch.change") return `${d.label}: ${d.from ? "on" : "off"} → ${d.to ? "on" : "off"}`;
  if (it.action.startsWith("auth.")) return [d.email, d.reason, d.to, d.withCode ? "with WhatsApp code" : ""].filter(Boolean).join(" · ");
  if (d.reason) return String(d.reason);
  return Object.entries(d).filter(([, v]) => v !== null && typeof v !== "object").slice(0, 3).map(([k, v]) => `${k}: ${v}`).join(" · ");
}

export default function SuperControls() {
  const [tab, setTab] = useState<"switches" | "activity" | "approvals">(
    typeof window !== "undefined" && new URLSearchParams(window.location.search).get("tab") === "approvals" ? "approvals" : "switches",
  );
  const [requests, setRequests] = useState<Req[]>([]);
  const [switches, setSwitches] = useState<Switch[]>([]);
  const [ready, setReady] = useState<Readiness | null>(null);
  const [items, setItems] = useState<Item[]>([]);
  const [next, setNext] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [kind, setKind] = useState("");
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState("");

  const loadSwitches = useCallback(() => {
    api<{ switches: Switch[]; readiness: Readiness }>("/super/switches").then((d) => { setSwitches(d.switches); setReady(d.readiness); }).catch((e) => setMsg(e.message));
  }, []);
  const loadActivity = useCallback((more?: string | null) => {
    const p = new URLSearchParams();
    if (more) p.set("before", more);
    if (q.trim()) p.set("q", q.trim());
    if (kind) p.set("action", kind);
    api<{ items: Item[]; next: string | null }>(`/super/activity?${p}`).then((d) => { setItems((cur) => (more ? [...cur, ...d.items] : d.items)); setNext(d.next); }).catch((e) => setMsg(e.message));
  }, [q, kind]);

  const loadRequests = useCallback(() => {
    api<{ items: Req[] }>("/super/transfer-requests?status=pending").then((d) => setRequests(d.items)).catch((e) => setMsg(e.message));
  }, []);
  useEffect(loadSwitches, [loadSwitches]);
  useEffect(() => { loadRequests(); }, [loadRequests]);
  useEffect(() => { if (tab === "activity") loadActivity(); }, [tab, kind]); // eslint-disable-line react-hooks/exhaustive-deps

  async function flip(s: Switch) {
    const turningOn = !s.value;
    if (s.key === "login_code_staff" && turningOn && ready && ready.staffWithoutNumber.length) {
      const names = ready.staffWithoutNumber.slice(0, 8).map((x) => x.name || x.email).join(", ");
      if (!window.confirm(`${ready.staffWithoutNumber.length} staff have no WhatsApp number and will not be able to sign in: ${names}. Turn it on anyway?`)) return;
    } else if (!window.confirm(`${turningOn ? "Turn ON" : "Turn OFF"}: ${s.label}?\n\n${s.risky}`)) return;
    setBusy(s.key); setMsg("");
    try { await api(`/super/switches/${s.key}`, { method: "PUT", body: { value: turningOn } }); loadSwitches(); }
    catch (e: any) { setMsg(e.message || "Could not change it."); }
    finally { setBusy(""); }
  }

  async function decide(r: Req, accept: boolean) {
    const note = accept ? "" : window.prompt("Reason for declining (optional)") || "";
    if (accept && !window.confirm(`Approve: move ${r.count} ${r.kind === "counseling" ? "student(s)" : "lead(s)"} from ${r.from_name} to ${r.to_name}?`)) return;
    setBusy(r.id); setMsg("");
    try {
      const d = await api<{ moved: number }>(`/super/transfer-requests/${encodeURIComponent(r.id)}/decide`, { method: "POST", body: { accept, note } });
      setMsg(accept ? `Approved. ${d.moved} moved. You can undo it from the Activity log.` : "Declined. Nothing moved.");
      loadRequests();
    } catch (e: any) { setMsg(e.message || "Could not decide."); }
    finally { setBusy(""); }
  }

  async function undo(it: Item) {
    if (!window.confirm(`Undo: ${label(it.action)}?`)) return;
    setBusy(it.id); setMsg("");
    try { await api(`/super/activity/${it.id}/undo`, { method: "POST" }); loadActivity(); loadSwitches(); setMsg("Undone."); }
    catch (e: any) { setMsg(e.message || "Could not undo."); }
    finally { setBusy(""); }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-bold text-navy-900"><ShieldCheck className="h-6 w-6" /> Controls & activity</h1>
        <p className="mt-1 text-sm text-slate-500">Your switches for what protects the business, and a record of everything that happens. Only you see this.</p>
      </div>
      <div className="flex gap-2">
        {([["switches", "Switches", ShieldCheck], ["approvals", requests.length ? `Approvals (${requests.length})` : "Approvals", Undo2], ["activity", "Activity log", ScrollText]] as const).map(([k, t, Icon]) => (
          <button key={k} onClick={() => setTab(k)} className={`flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium ${tab === k ? "bg-navy-900 text-white" : "bg-white text-slate-600 border border-slate-200"}`}>
            <Icon className="h-4 w-4" /> {t}
          </button>
        ))}
      </div>
      {msg && <p role="status" className="rounded-lg bg-sky-50 px-3 py-2 text-sm text-sky-800">{msg}</p>}

      {tab === "switches" && (
        <div className="space-y-3">
          {switches.map((s) => (
            <Card key={s.key} className="p-5">
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <p className="font-semibold text-navy-900">{s.label}</p>
                  <p className="mt-1 text-sm text-slate-600">{s.help}</p>
                  <p className="mt-1 flex items-start gap-1 text-xs text-amber-700"><AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" /> {s.risky}</p>
                  <p className="mt-2 text-xs text-slate-400">{s.changedAt ? `Last changed by ${s.changedByName || "you"} on ${when(s.changedAt)}` : "Never changed (using the default)"}</p>
                  {s.key === "login_code_staff" && ready && (
                    <p className="mt-2 text-xs text-slate-500">
                      {ready.youHaveNumber ? "Your number is on file." : "Your own WhatsApp number is missing — add it before turning this on."}{" "}
                      {ready.staffWithoutNumber.length ? `${ready.staffWithoutNumber.length} staff have no number: ${ready.staffWithoutNumber.slice(0, 6).map((x) => x.name || x.email).join(", ")}${ready.staffWithoutNumber.length > 6 ? "…" : ""}` : "Every staff member has a number."}
                    </p>
                  )}
                </div>
                <button
                  role="switch" aria-checked={s.value} aria-label={s.label} disabled={busy === s.key} onClick={() => flip(s)}
                  className={`relative h-7 w-12 shrink-0 rounded-full transition ${s.value ? "bg-emerald-500" : "bg-slate-300"} disabled:opacity-50`}
                >
                  <span className={`absolute top-0.5 h-6 w-6 rounded-full bg-white shadow transition-all ${s.value ? "left-[22px]" : "left-0.5"}`} />
                </button>
              </div>
              <p className={`mt-3 text-sm font-medium ${s.value ? "text-emerald-700" : "text-slate-500"}`}>{s.value ? "ON" : "OFF"}</p>
            </Card>
          ))}
        </div>
      )}

      {tab === "approvals" && (
        <div className="space-y-3">
          {requests.length === 0 && <Card className="p-5 text-sm text-slate-500">Nothing is waiting for you.</Card>}
          {requests.map((r) => (
            <Card key={r.id} className="p-5">
              <p className="font-semibold text-navy-900">Move {r.count} {r.kind === "counseling" ? "student(s)" : "lead(s)"} from {r.from_name} to {r.to_name}</p>
              <p className="mt-1 text-sm text-slate-600">Reason: {r.reason}</p>
              <p className="mt-1 text-xs text-slate-400">Asked by {r.requested_by_name || "an Admin"} · {when(r.created_at)} · another branch</p>
              <div className="mt-3 flex gap-2">
                <button disabled={busy === r.id} onClick={() => decide(r, true)} className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50">Accept</button>
                <button disabled={busy === r.id} onClick={() => decide(r, false)} className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 disabled:opacity-50">Decline</button>
              </div>
            </Card>
          ))}
        </div>
      )}

      {tab === "activity" && (
        <div className="space-y-3">
          <div className="flex flex-wrap gap-2">
            <input value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => e.key === "Enter" && loadActivity()} placeholder="Search a name, email or action" className="min-w-[14rem] flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm" />
            <select value={kind} onChange={(e) => setKind(e.target.value)} className="rounded-lg border border-slate-300 px-3 py-2 text-sm">
              <option value="">Everything</option><option value="auth.">Sign-ins</option><option value="switch.">Switches</option><option value="lead.">Leads</option><option value="staff.">Transfers</option><option value="user.">Users</option><option value="undo">Undone</option>
            </select>
            <button onClick={() => loadActivity()} className="rounded-lg bg-navy-900 px-4 py-2 text-sm font-medium text-white">Search</button>
          </div>
          <Card className="divide-y divide-slate-100">
            {items.length === 0 && <p className="p-5 text-sm text-slate-500">Nothing here yet.</p>}
            {items.map((it) => (
              <div key={it.id} className="flex items-start justify-between gap-3 p-4">
                <div className="min-w-0">
                  <p className={`text-sm font-semibold ${bad(it.action) ? "text-red-700" : "text-navy-900"}`}>{label(it.action)}{it.undone ? " (undone)" : ""}</p>
                  <p className="text-sm text-slate-600">{summary(it)}</p>
                  <p className="mt-0.5 text-xs text-slate-400">
                    {when(it.at)} · {it.actorName || it.actorEmail || "unknown / not signed in"}{it.actorRole ? ` (${it.actorRole})` : ""}{it.branch ? ` · ${it.branch}` : ""}{it.ip ? ` · ${it.ip}` : ""}
                  </p>
                </div>
                {it.canUndo && (
                  <button onClick={() => undo(it)} disabled={busy === it.id} className="flex shrink-0 items-center gap-1 rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700 disabled:opacity-50">
                    <Undo2 className="h-3.5 w-3.5" /> Undo
                  </button>
                )}
              </div>
            ))}
          </Card>
          {next && <button onClick={() => loadActivity(next)} className="rounded-lg border border-slate-300 px-4 py-2 text-sm">Load older</button>}
        </div>
      )}
    </div>
  );
}
