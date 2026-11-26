import { useEffect, useMemo, useState } from "react";
import { ArrowRightLeft, CheckCircle2 } from "lucide-react";
import { api } from "@admin/lib/api";
import { refreshStore } from "@admin/lib/store";
import { Button } from "@admin/components/ui/Button";
import { Select } from "@admin/components/ui/Field";

/**
 * The "Transfer data" box on a Counselor's or Telecaller's own page.
 *
 * Moves this person's students or leads to a colleague in the SAME branch, using the same server rules
 * as the Transfer work screen (server/lib/workTransfer.mjs): only same-branch, active colleagues are
 * offered; all records or a chosen few; a reason is required and kept on each record's history;
 * confirmation happens on the page.
 */

type Kind = "telecalling" | "counseling";
interface Item { id: string; name: string; status: string; branchId: string | null }
interface Receiver { id: string; counselorRowId: string | null; name: string; role: "telecaller" | "counselor"; load: number; branchIds?: string[]; needsApproval?: boolean }
interface Result { moved: number; skipped: { id: string; reason: string; label: string }[] }

export function TransferWorkPanel({
  personId,
  personName,
  isCounselor,
  onReceiverChange,
}: {
  /** The person's login id. */
  personId: string;
  personName: string;
  isCounselor: boolean;
  /** Tells the page who is chosen, so Remove can hand the rest of the work to the same person. */
  onReceiverChange?: (receiver: Receiver | null) => void;
}) {
  const [kind, setKind] = useState<Kind>(isCounselor ? "counseling" : "telecalling");
  const [counts, setCounts] = useState<{ telecalling: number; counseling: number }>({ telecalling: 0, counseling: 0 });
  const [items, setItems] = useState<Item[]>([]);
  const [branchIds, setBranchIds] = useState<string[]>([]);
  const [allowCross, setAllowCross] = useState(false);
  const [receivers, setReceivers] = useState<Receiver[]>([]);
  const [approvalReceivers, setApprovalReceivers] = useState<Receiver[]>([]);
  const [asked, setAsked] = useState<string | null>(null);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [choosing, setChoosing] = useState(false);
  const [toId, setToId] = useState("");
  const [reason, setReason] = useState("");
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<Result | null>(null);

  const load = async (k: Kind) => {
    setError("");
    try {
      const [own, other, rec] = await Promise.all([
        api<{ items: Item[]; person: { branchIds: string[] }; allowCrossBranch?: boolean }>(`/transfer-work/${encodeURIComponent(personId)}/items?kind=${k}`),
        isCounselor
          ? api<{ items: Item[] }>(`/transfer-work/${encodeURIComponent(personId)}/items?kind=${k === "counseling" ? "telecalling" : "counseling"}`)
          : Promise.resolve({ items: [] as Item[] }),
        api<{ receivers: Receiver[]; approvalReceivers?: Receiver[] }>(`/transfer-work/${encodeURIComponent(personId)}/receivers?kind=${k}`),
      ]);
      setItems(own.items);
      setBranchIds(own.person.branchIds || []);
      setReceivers(rec.receivers);
      setApprovalReceivers(rec.approvalReceivers || []);
      const cross = Boolean(own.allowCrossBranch);
      setAllowCross(cross);
      // The owner (Super Admin) can move everything; branch Admins start with their branch's records.
      setPicked(new Set(own.items.filter((i) => cross || (i.branchId && (own.person.branchIds || []).includes(i.branchId))).map((i) => i.id)));
      setCounts(k === "counseling"
        ? { counseling: own.items.length, telecalling: other.items.length }
        : { telecalling: own.items.length, counseling: other.items.length });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load this person's work.");
    }
  };

  useEffect(() => {
    setToId(""); setConfirming(false); setChoosing(false);
    void load(kind);
  }, [personId, kind]);

  const receiver = [...receivers, ...approvalReceivers].find((r) => r.id === toId) || null;
  useEffect(() => { onReceiverChange?.(receiver); }, [receiver?.id]);

  const word = kind === "counseling" ? "student" : "lead";
  const movable = useMemo(() => (allowCross ? items : items.filter((i) => i.branchId && branchIds.includes(i.branchId))), [items, branchIds, allowCross]);
  const outside = items.length - movable.length;
  const ready = Boolean(receiver && picked.size > 0 && reason.trim());

  const toggle = (id: string) =>
    setPicked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });

  const submit = async () => {
    if (!receiver) return;
    setBusy(true); setError("");
    try {
      if (receiver.needsApproval) {
        const sent = await api<{ count: number }>("/transfer-requests", {
          method: "POST",
          body: { fromId: personId, toUserId: receiver.id, kind, leadIds: [...picked], reason: reason.trim() },
        });
        setAsked(`Sent to the owner for approval: ${sent.count} ${word}${sent.count === 1 ? "" : "s"} to ${receiver.name}. Nothing moves until they accept.`);
        setConfirming(false); setReason(""); setToId("");
        return;
      }
      const res = await api<Result>(`/transfer-work/${encodeURIComponent(personId)}`, {
        method: "POST",
        body: { toUserId: receiver.id, kind, leadIds: [...picked], reason: reason.trim() },
      });
      const names = new Map(items.map((i) => [i.id, i.name]));
      setResult({ ...res, skipped: res.skipped.map((s) => ({ ...s, id: names.get(s.id) || s.id })) });
      setConfirming(false); setReason(""); setToId("");
      await Promise.all([refreshStore(), load(kind)]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not transfer this work.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mt-4 space-y-3">
      {isCounselor && (
        <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Which work to transfer">
          {(["counseling", "telecalling"] as Kind[]).map((k) => (
            <button
              key={k} type="button" role="radio" aria-checked={kind === k} onClick={() => setKind(k)}
              className={`rounded-lg border px-3 py-1.5 text-xs font-medium ${kind === k ? "border-navy-900 bg-navy-900 text-white" : "border-slate-200 bg-white text-slate-700"}`}
            >
              {k === "counseling" ? `Students they counsel (${counts.counseling})` : `Leads they are calling (${counts.telecalling})`}
            </button>
          ))}
        </div>
      )}

      <div className="flex flex-wrap items-end gap-2">
        <div className="min-w-[260px]">
          <p className="mb-1.5 text-sm font-medium text-slate-700">{allowCross ? `Transfer ${word}s to (any branch)` : `Transfer ${word}s to (same branch)`}</p>
          <Select value={toId} onChange={(e) => { setToId(e.target.value); setConfirming(false); }}>
            <option value="">{receivers.length ? "Choose a colleague" : (allowCross ? "No active colleague found" : "No active colleague in this branch")}</option>
            {receivers.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name} · {r.role === "counselor" ? "Counselor" : "Telecaller"}{allowCross && r.branchIds && !r.branchIds.some((b) => branchIds.includes(b)) ? " · other branch" : ""} · {r.load} {word}{r.load === 1 ? "" : "s"} now
              </option>
            ))}
            {approvalReceivers.length > 0 && (
              <optgroup label="Another branch — the owner must approve">
                {approvalReceivers.map((r) => (
                  <option key={r.id} value={r.id}>{r.name} · {r.role === "counselor" ? "Counselor" : "Telecaller"} · other branch · {r.load} {word}{r.load === 1 ? "" : "s"} now</option>
                ))}
              </optgroup>
            )}
          </Select>
        </div>
        <div className="min-w-[260px] flex-1">
          <p className="mb-1.5 text-sm font-medium text-slate-700">Reason</p>
          <input
            id={`tw-reason-${personId}`} maxLength={500} value={reason}
            onChange={(e) => { setReason(e.target.value); setConfirming(false); }}
            placeholder="For example: resigned on 25 Nov, or long leave"
            className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-sky-400"
          />
        </div>
        {!confirming ? (
          <Button size="sm" variant="secondary" disabled={busy || !ready} onClick={() => setConfirming(true)}>
            <ArrowRightLeft className="h-4 w-4" /> {receiver?.needsApproval ? "Ask the owner" : "Transfer data"}
          </Button>
        ) : (
          <div role="group" aria-label="Confirm transfer" className="flex flex-wrap items-center gap-2 rounded-xl bg-slate-50 px-3 py-2">
            <span className="text-sm text-navy-900">
              Move <b>{picked.size} {word}{picked.size === 1 ? "" : "s"}</b> from <b>{personName}</b> to <b>{receiver?.name}</b>?
            </span>
            <Button size="sm" disabled={busy} onClick={() => void submit()}>{busy ? "Sending…" : receiver?.needsApproval ? "Yes, ask the owner" : "Yes, transfer"}</Button>
            <Button size="sm" variant="secondary" disabled={busy} onClick={() => setConfirming(false)}>Cancel</Button>
          </div>
        )}
      </div>

      <p className="text-xs text-slate-500">
        {items.length === 0
          ? `No ${word}s to move.`
          : <>
              {picked.size} of {movable.length} {word}{movable.length === 1 ? "" : "s"} selected
              {outside > 0 && <> · {outside} in another branch or with no branch will stay</>}
              {" · "}
              <button type="button" className="font-medium text-sky-700 underline" onClick={() => setChoosing((v) => !v)}>
                {choosing ? "Hide list" : "Choose which"}
              </button>
            </>}
        {" "}Notes, chats and history move with each record.
      </p>

      {choosing && items.length > 0 && (
        <ul className="max-h-64 divide-y divide-slate-100 overflow-y-auto rounded-xl border border-slate-200">
          {items.map((i) => {
            const inBranch = allowCross || Boolean(i.branchId && branchIds.includes(i.branchId));
            return (
              <li key={i.id}>
                <label className={`flex items-center gap-3 px-3 py-2 text-sm ${inBranch ? "cursor-pointer hover:bg-slate-50" : "opacity-60"}`}>
                  <input type="checkbox" className="h-4 w-4" disabled={!inBranch} checked={picked.has(i.id)} onChange={() => toggle(i.id)} />
                  <span className="min-w-0 flex-1 truncate">{i.name}</span>
                  {i.status && <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-600">{i.status}</span>}
                  {!inBranch && <span className={`rounded-full px-2 py-0.5 text-xs ${allowCross ? "bg-sky-100 text-sky-800" : "bg-amber-100 text-amber-800"}`}>{i.branchId ? "Other branch" : "No branch"}</span>}
                </label>
              </li>
            );
          })}
        </ul>
      )}

      {asked && <p role="status" className="rounded-xl bg-sky-50 px-3 py-2 text-sm text-sky-800">{asked}</p>}
      {error && <p role="alert" className="text-sm font-medium text-rose-700">{error}</p>}
      {result && (
        <div role="status" className="rounded-xl bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
          <p className="flex items-center gap-2 font-semibold"><CheckCircle2 className="h-4 w-4" /> Moved {result.moved} {word}{result.moved === 1 ? "" : "s"}.</p>
          {result.skipped.length > 0 && (
            <ul className="mt-1 list-disc pl-5">{result.skipped.map((s) => <li key={s.id}>{s.id}: {s.label}</li>)}</ul>
          )}
        </div>
      )}
    </div>
  );
}
