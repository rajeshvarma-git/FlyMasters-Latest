import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowRightLeft, CheckCircle2 } from "lucide-react";
import { api } from "@admin/lib/api";
import { refreshStore } from "@admin/lib/store";
import { Card } from "@admin/components/ui/Card";
import { Button } from "@admin/components/ui/Button";
import { Label, Select, Textarea } from "@admin/components/ui/Field";

/**
 * Transfer work between colleagues in ONE branch (CRM brief 2.4.1 and 3.2).
 *
 * Pick a branch, the employee whose work is moving, which work (leads they are calling, or students
 * they counsel), the records, the colleague who takes them, and why. The server enforces the same
 * rules again: same branch only, active receiver, right role, reason kept on every record's history.
 */

type Kind = "telecalling" | "counseling";
interface BranchRow { id: string; name: string; code?: string; is_active?: boolean }
interface Person { id: string; name: string; role: "telecaller" | "counselor"; isActive: boolean; telecalling: number; counseling: number }
interface Item { id: string; name: string; status: string; branchId: string | null; stage: string }
interface Receiver { id: string; name: string; role: "telecaller" | "counselor"; load: number; branchIds: string[] }
interface Result { moved: number; skipped: { id: string; reason: string; label: string }[] }

const roleLabel = (p: Person) => (p.role === "counselor" ? "Counselor" : "Telecaller");

/** The work type to show for this person: the only kind they have, if just one is non-empty. */
function pickKind(p: Person | undefined, current: Kind): Kind {
  if (!p) return current;
  const kinds: Kind[] = p.role === "counselor" ? ["telecalling", "counseling"] : ["telecalling"];
  const nonEmpty = kinds.filter((k) => (k === "counseling" ? p.counseling : p.telecalling) > 0);
  if (nonEmpty.length === 1) return nonEmpty[0];
  return kinds.includes(current) ? current : "telecalling";
}

export default function TransferWork() {
  const [branches, setBranches] = useState<BranchRow[]>([]);
  const [branchId, setBranchId] = useState("");
  const [people, setPeople] = useState<Person[]>([]);
  const [fromId, setFromId] = useState("");
  const [kind, setKind] = useState<Kind>("telecalling");
  const [items, setItems] = useState<Item[]>([]);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [toId, setToId] = useState("");
  const [receivers, setReceivers] = useState<Receiver[]>([]);
  const [allowCross, setAllowCross] = useState(false);
  const [reason, setReason] = useState("");
  const [reviewing, setReviewing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<Result | null>(null);

  useEffect(() => {
    api<{ branches: BranchRow[] }>("/branches")
      .then((data) => {
        const list = (data.branches || []).filter((b) => b.is_active !== false);
        setBranches(list);
        if (list.length === 1) setBranchId(list[0].id);
      })
      .catch((err) => setError(err instanceof Error ? err.message : "Could not load branches."));
  }, []);

  const loadPeople = (id: string) =>
    api<{ people: Person[] }>(`/transfer-work/people?branchId=${encodeURIComponent(id)}`)
      .then((data) => setPeople(data.people))
      .catch((err) => setError(err instanceof Error ? err.message : "Could not load this branch's staff."));

  useEffect(() => {
    setPeople([]); setFromId(""); setToId(""); setItems([]); setResult(null); setError("");
    if (branchId) void loadPeople(branchId);
  }, [branchId]);

  const from = people.find((p) => p.id === fromId) || null;

  // Picking an employee sets the work type in the same update, so their list loads once, straight away.
  const chooseFrom = (id: string) => {
    setFromId(id);
    setKind((current) => pickKind(people.find((p) => p.id === id), current));
  };

  // Only the newest request may fill the list: an older, slower answer for another employee is dropped.
  const itemsRequest = useRef(0);
  const loadItems = (id: string, k: Kind) => {
    const request = ++itemsRequest.current;
    return Promise.all([
      api<{ items: Item[]; allowCrossBranch?: boolean }>(`/transfer-work/${encodeURIComponent(id)}/items?kind=${k}`),
      api<{ receivers: Receiver[] }>(`/transfer-work/${encodeURIComponent(id)}/receivers?kind=${k}`),
    ])
      .then(([data, rec]) => {
        if (request !== itemsRequest.current) return;
        const cross = Boolean(data.allowCrossBranch);
        setAllowCross(cross);
        setItems(data.items);
        setReceivers(rec.receivers);
        // The owner (Super Admin) moves everything; branch Admins start with their branch's records.
        setPicked(new Set(data.items.filter((i) => cross || i.branchId === branchId).map((i) => i.id)));
      })
      .catch((err) => {
        if (request === itemsRequest.current) setError(err instanceof Error ? err.message : "Could not load this person's work.");
      });
  };

  useEffect(() => {
    setItems([]); setReceivers([]); setPicked(new Set()); setToId(""); setReviewing(false); setResult(null);
    if (fromId) void loadItems(fromId, kind);
  }, [fromId, kind]);

  // Receivers come from the server: active colleagues in the same branch, or, for the Super Admin, anyone.
  const branchLabel = (ids: string[]) => ids.map((id) => branches.find((b) => b.id === id)?.name).filter(Boolean).join(", ");
  const to = receivers.find((p) => p.id === toId) || null;

  const toggle = (id: string) =>
    setPicked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  const allPicked = items.length > 0 && items.every((i) => picked.has(i.id));
  const word = kind === "counseling" ? "student" : "lead";
  const canReview = Boolean(from && to && picked.size > 0 && reason.trim());

  const submit = async () => {
    if (!from || !to) return;
    setBusy(true); setError("");
    try {
      const res = await api<Result>(`/transfer-work/${encodeURIComponent(from.id)}`, {
        method: "POST",
        body: { toUserId: to.id, kind, leadIds: [...picked], reason: reason.trim() },
      });
      // Reload the shared data BEFORE saying it worked: every page (Leads, Students, Dashboard) reads it,
      // so by the time "Moved" shows, none of them can still show the old owner.
      await refreshStore();
      const names = new Map(items.map((i) => [i.id, i.name]));
      setResult({ ...res, skipped: res.skipped.map((s) => ({ ...s, id: names.get(s.id) || s.id })) });
      setReviewing(false);
      setReason("");
      await Promise.all([loadPeople(branchId), loadItems(from.id, kind)]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not transfer this work.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mx-auto max-w-5xl space-y-5">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-bold text-navy-900">
          <ArrowRightLeft className="h-6 w-6" /> Transfer work
        </h1>
        <p className="mt-1 max-w-2xl text-sm text-slate-600">
          Move a telecaller's leads or a counselor's students to a colleague in the same branch, for example
          when someone leaves, goes on long leave or has too much work. Their notes, chats and history go with
          each record, and the reason is kept on file.
        </p>
      </div>

      {error && <p role="alert" className="rounded-xl bg-rose-50 px-4 py-3 text-sm font-medium text-rose-700">{error}</p>}
      {result && (
        <div role="status" className="rounded-xl bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
          <p className="flex items-center gap-2 font-semibold">
            <CheckCircle2 className="h-4 w-4" /> Moved {result.moved} {word}{result.moved === 1 ? "" : "s"}.
          </p>
          {result.skipped.length > 0 && (
            <ul className="mt-2 list-disc pl-5 text-emerald-900">
              {result.skipped.map((s) => <li key={s.id}>{s.id}: {s.label}</li>)}
            </ul>
          )}
        </div>
      )}

      <Card className="grid gap-4 p-5 md:grid-cols-2">
        <div className="space-y-1.5">
          <Label>Branch</Label>
          <Select id="tw-branch" value={branchId} onChange={(e) => setBranchId(e.target.value)}>
            <option value="">Choose a branch</option>
            {branches.map((b) => <option key={b.id} value={b.id}>{b.name}{b.code ? ` (${b.code})` : ""}</option>)}
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label>Whose work is moving</Label>
          <Select id="tw-from" value={fromId} disabled={!branchId} onChange={(e) => chooseFrom(e.target.value)}>
            <option value="">{branchId ? "Choose an employee" : "Choose a branch first"}</option>
            {people.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name} · {roleLabel(p)}{p.isActive ? "" : " · access suspended"} · {p.telecalling} leads
                {p.role === "counselor" ? `, ${p.counseling} students` : ""}
              </option>
            ))}
          </Select>
        </div>
        {from && (
          <div className="space-y-1.5 md:col-span-2">
            <Label>Which work</Label>
            <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Which work">
              <button
                type="button" role="radio" aria-checked={kind === "telecalling"}
                onClick={() => setKind("telecalling")}
                className={`rounded-xl border px-4 py-2 text-sm font-medium ${kind === "telecalling" ? "border-navy-900 bg-navy-900 text-white" : "border-slate-200 bg-white"}`}
              >
                Leads they are calling ({from.telecalling})
              </button>
              {from.role === "counselor" && (
                <button
                  type="button" role="radio" aria-checked={kind === "counseling"}
                  onClick={() => setKind("counseling")}
                  className={`rounded-xl border px-4 py-2 text-sm font-medium ${kind === "counseling" ? "border-navy-900 bg-navy-900 text-white" : "border-slate-200 bg-white"}`}
                >
                  Students they counsel ({from.counseling})
                </button>
              )}
            </div>
          </div>
        )}
      </Card>

      {from && (
        <Card className="p-0">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 px-5 py-3">
            <p className="text-sm font-semibold text-navy-900">
              {items.length} {word}{items.length === 1 ? "" : "s"} · {picked.size} selected
            </p>
            {items.length > 0 && (
              <Button variant="ghost" size="sm" onClick={() => setPicked(allPicked ? new Set() : new Set(items.map((i) => i.id)))}>
                {allPicked ? "Clear selection" : "Select all"}
              </Button>
            )}
          </div>
          {items.length === 0 ? (
            <p className="px-5 py-6 text-sm text-slate-500">Nothing to move: {from.name} has no {word}s of this kind.</p>
          ) : (
            <ul className="max-h-80 divide-y divide-slate-100 overflow-y-auto">
              {items.map((i) => (
                <li key={i.id}>
                  <label className="flex cursor-pointer items-center gap-3 px-5 py-2.5 text-sm hover:bg-slate-50">
                    <input type="checkbox" checked={picked.has(i.id)} onChange={() => toggle(i.id)} className="h-4 w-4" />
                    <span className="min-w-0 flex-1 truncate font-medium text-navy-900">{i.name}</span>
                    {i.status && <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-600">{i.status}</span>}
                    {i.branchId !== branchId && (
                      <span className={`rounded-full px-2 py-0.5 text-xs ${allowCross ? "bg-sky-100 text-sky-800" : "bg-amber-100 text-amber-800"}`}>
                        {allowCross
                          ? (i.branchId ? "Other branch, moves with the work" : "No branch, takes the new owner's branch")
                          : (i.branchId ? "Other branch, will be skipped" : "No branch, will be skipped")}
                      </span>
                    )}
                  </label>
                </li>
              ))}
            </ul>
          )}
        </Card>
      )}

      {from && items.length > 0 && (
        <Card className="grid gap-4 p-5 md:grid-cols-2">
          <div className="space-y-1.5">
            <Label>Move to</Label>
            <Select id="tw-to" value={toId} onChange={(e) => { setToId(e.target.value); setReviewing(false); }}>
              <option value="">{allowCross ? "Choose anyone, in any branch" : "Choose a colleague in this branch"}</option>
              {receivers.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} · {p.role === "counselor" ? "Counselor" : "Telecaller"}{allowCross && branchLabel(p.branchIds) ? ` · ${branchLabel(p.branchIds)}` : ""} · {p.load} {word}s now
                </option>
              ))}
            </Select>
            {receivers.length === 0 && (
              <p className="text-xs text-slate-500">
                No active {kind === "counseling" ? "counselor" : "telecaller or counselor"} in this branch can take this work.
              </p>
            )}
          </div>
          <div className="space-y-1.5">
            <Label>Reason</Label>
            <Textarea id="tw-reason" rows={3} maxLength={500} value={reason} placeholder="For example: resigned on 25 Nov, or long leave" onChange={(e) => { setReason(e.target.value); setReviewing(false); }} />
          </div>
          <div className="flex flex-wrap items-center gap-3 md:col-span-2">
            {!reviewing ? (
              <Button disabled={!canReview || busy} onClick={() => setReviewing(true)}>Review transfer</Button>
            ) : (
              <div role="group" aria-label="Confirm transfer" className="flex flex-wrap items-center gap-3 rounded-xl bg-slate-50 px-4 py-3">
                <span className="text-sm text-navy-900">
                  Move <b>{picked.size} {word}{picked.size === 1 ? "" : "s"}</b> from <b>{from.name}</b> to <b>{to?.name}</b>?
                </span>
                <Button disabled={busy} onClick={() => void submit()}>{busy ? "Moving…" : "Yes, transfer"}</Button>
                <Button variant="secondary" disabled={busy} onClick={() => setReviewing(false)}>Cancel</Button>
              </div>
            )}
          </div>
        </Card>
      )}
    </div>
  );
}
