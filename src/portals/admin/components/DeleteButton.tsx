import { useState } from "react";
import { Trash2 } from "lucide-react";
import { api } from "@admin/lib/api";
import { refreshStore } from "@admin/lib/store";
import { useAuth } from "@admin/context/AuthContext";
import { Button } from "@admin/components/ui/Button";
import { Input, Label } from "@admin/components/ui/Field";

export type DeleteKind = "lead" | "student" | "staff" | "partner";

/** Mirrors the server: Super Admin only (a Super Admin account itself is never deletable). */
export function canDelete(role: string | undefined, kind: DeleteKind, targetRole?: string) {
  if (role === "super_admin") return kind !== "staff" || targetRole !== "super_admin";
  return false;
}

/**
 * Permanently deletes a lead, student, employee or partner. Super Admin only. Renders nothing otherwise (the server enforces it too). The person must type DELETE, and the
 * server refuses to orphan commissions, owned leads or referral history, so a refusal is shown as is.
 */
export default function DeleteButton({
  kind,
  id,
  name,
  onDeleted,
  size = "sm",
  targetRole,
}: {
  targetRole?: string;
  kind: DeleteKind;
  id: string;
  name: string;
  onDeleted?: () => void;
  size?: "sm" | "md";
}) {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState("");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  if (!canDelete(user?.role, kind, targetRole)) return null;

  const close = () => { setOpen(false); setTyped(""); setReason(""); setError(""); };

  const run = async () => {
    setBusy(true); setError("");
    try {
      await api(`/admin/delete/${kind}/${encodeURIComponent(id)}`, { method: "POST", body: { confirm: "DELETE", reason } });
      await refreshStore().catch(() => {});
      close();
      onDeleted?.();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not delete.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <Button size={size} variant="danger" onClick={() => setOpen(true)} title="Super Admin only">
        <Trash2 className="h-4 w-4" /> Delete
      </Button>
      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" role="dialog" aria-modal="true">
          <div className="w-full max-w-md rounded-2xl bg-white p-5 shadow-xl">
            <h2 className="text-lg font-bold text-rose-700">Delete {name}?</h2>
            <p className="mt-2 text-sm text-slate-600">
              This permanently removes their records and cannot be undone from the app. A copy of what was removed is
              kept in the audit log. It will be refused if it would leave a commission, an assigned lead or referral
              history without an owner.
            </p>
            <div className="mt-3 space-y-3">
              <div>
                <Label>Reason (optional)</Label>
                <Input value={reason} onChange={(e) => setReason(e.target.value)} maxLength={300} />
              </div>
              <div>
                <Label>Type DELETE to confirm</Label>
                <Input value={typed} onChange={(e) => setTyped(e.target.value)} autoComplete="off" />
              </div>
              {error && <p className="text-sm text-rose-600">{error}</p>}
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <Button variant="secondary" onClick={close} disabled={busy}>Cancel</Button>
              <Button variant="danger" onClick={() => void run()} disabled={busy || typed !== "DELETE"}>
                {busy ? "Deleting…" : "Delete permanently"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
