import { useCallback, useEffect, useState } from "react";
import { ClipboardCheck, Plus, Info } from "lucide-react";
import StatusBar, { StatusChip, type Progress } from "@shared/components/StatusBar";

/**
 * CRM 2.6.2 — the counsellor's side of the checklist.
 *
 * Activating a checklist pins the student to whichever version is live at that
 * moment. Updating an item can only use the Super Admin's status words, and
 * the next-step note travels with the status so the student is told what to do
 * rather than just what happened.
 *
 * A document already accepted on another country's checklist shows as "already
 * available" rather than asking for a second upload — the duplicate handling
 * the document asks for, made visible so the counsellor understands why an
 * item is ticked without anything having been uploaded here.
 */

type Item = {
  id: string;
  document_master_id: string;
  requirement: string;
  status_code: string;
  next_step_note: string;
  rejection_reason: string;
  satisfied_by_item_id: string | null;
  name: string;
  code: string;
  description: string;
  max_size_mb: string | number;
  accepted_formats: string[];
};

type List = {
  id: string;
  country: string;
  family_id: string;
  name: string;
  version: number;
  template_status: string;
  progress: number;
  items: Item[];
};

type Status = { code: string; label: string; color: string; kind: string };
type Family = { family_id: string; name: string; country: string; status: string; version: number };
type Reason = { id: string; kind: string; code: string; label: string; body: string };

export default function StudentChecklistPanel({
  studentId,
  fetchJson,
  readOnly = false,
}: {
  studentId: string;
  fetchJson: <T>(path: string, options?: { method?: string; body?: unknown }) => Promise<T>;
  readOnly?: boolean;
}) {
  const [lists, setLists] = useState<List[]>([]);
  const [families, setFamilies] = useState<Family[]>([]);
  const [statuses, setStatuses] = useState<Status[]>([]);
  const [nextSteps, setNextSteps] = useState<Status[]>([]);
  const [reasons, setReasons] = useState<Reason[]>([]);
  const [progress, setProgress] = useState<Progress | null>(null);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [chosen, setChosen] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const load = useCallback(async () => {
    try {
      const [listData, progressData] = await Promise.all([
        fetchJson<{ checklists: List[] }>(`/students/${studentId}/checklists`),
        fetchJson<Progress>(`/students/${studentId}/progress`),
      ]);
      setLists(listData.checklists);
      setProgress(progressData);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load the checklists");
    }
  }, [fetchJson, studentId]);

  useEffect(() => {
    void load();
    void fetchJson<{ checklists: Family[] }>("/config/checklists")
      .then((data) => setFamilies(data.checklists.filter((row) => row.status === "active")))
      .catch(() => undefined);
    void fetchJson<{ statuses: Status[] }>("/config/statuses?kind=document")
      .then((data) => setStatuses(data.statuses)).catch(() => undefined);
    void fetchJson<{ statuses: Status[] }>("/config/statuses?kind=next_step")
      .then((data) => setNextSteps(data.statuses)).catch(() => undefined);
    void fetchJson<{ reasons: Reason[] }>("/config/reasons?kind=rejection")
      .then((data) => setReasons(data.reasons)).catch(() => undefined);
  }, [load, fetchJson]);

  const activate = async () => {
    if (!chosen) return;
    setError(""); setNotice("");
    try {
      const result = await fetchJson<{ version: number; items_created: number; documents_already_available: number }>(
        `/students/${studentId}/checklists`, { method: "POST", body: { family_id: chosen } });
      setChosen("");
      setNotice(
        `Activated version ${result.version} — ${result.items_created} document${result.items_created === 1 ? "" : "s"}` +
        (result.documents_already_available
          ? `, ${result.documents_already_available} already available from another country.`
          : "."),
      );
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not activate that checklist");
    }
  };

  const update = async (item: Item, patch: Record<string, unknown>) => {
    setError(""); setNotice("");
    try {
      const result = await fetchJson<{ released_on_other_checklists: number }>(
        `/student-checklist-items/${item.id}`, { method: "PATCH", body: patch });
      if (result.released_on_other_checklists > 0) {
        setNotice(`Accepted. This also covered ${result.released_on_other_checklists} matching item on the student's other checklists.`);
      }
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not update that item");
    }
  };

  return (
    <div className="space-y-5">
      {progress && <StatusBar progress={progress} />}

      {!readOnly && (
        <div className="flex flex-wrap items-end gap-3 rounded-2xl border border-slate-100 bg-white p-4 shadow-card">
          <div className="flex-1">
            <label className="mb-1.5 block text-sm font-medium text-slate-700">Activate a country checklist</label>
            <select
              value={chosen}
              onChange={(e) => setChosen(e.target.value)}
              className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-sky-500"
            >
              <option value="">Choose…</option>
              {families
                .filter((family) => !lists.some((list) => list.family_id === family.family_id))
                .map((family) => (
                  <option key={family.family_id} value={family.family_id}>
                    {family.name} (v{family.version})
                  </option>
                ))}
            </select>
          </div>
          <button
            onClick={activate}
            disabled={!chosen}
            className="inline-flex items-center gap-2 rounded-xl bg-navy-900 px-4 py-2.5 text-sm font-medium text-white disabled:opacity-40"
          >
            <Plus className="h-4 w-4" /> Activate
          </button>
        </div>
      )}

      {error && <p className="text-sm text-rose-600">{error}</p>}
      {notice && <p className="text-sm text-emerald-700">{notice}</p>}

      {lists.map((list) => (
        <div key={list.id} className="rounded-2xl border border-slate-100 bg-white p-5 shadow-card">
          <div className="mb-4 flex flex-wrap items-center gap-3">
            <ClipboardCheck className="h-4 w-4 text-sky-600" />
            <h3 className="text-sm font-semibold text-navy-900">{list.name}</h3>
            <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-600">
              version {list.version}
              {list.template_status === "inactive" ? " · a newer version exists" : ""}
            </span>
            <span className="flex-1" />
            <span className="text-xs text-slate-500">{list.progress}% complete</span>
          </div>

          {list.template_status === "inactive" && (
            <p className="mb-4 flex items-start gap-2 rounded-xl bg-amber-50 p-3 text-xs text-amber-900">
              <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              This student is on version {list.version}, which is what was live when their checklist was
              activated. A newer version has been published since — they are deliberately not moved onto it
              mid-application.
            </p>
          )}

          <div className="space-y-2">
            {list.items.map((item) => (
              <div key={item.id} className="rounded-xl border border-slate-100 p-3">
                <div className="flex flex-wrap items-center gap-3">
                  <div className="min-w-[200px] flex-1">
                    <p className="text-sm font-medium text-navy-900">
                      {item.name}
                      {item.requirement !== "mandatory" && (
                        <span className="ml-2 text-xs font-normal text-slate-400">{item.requirement.replace("_", " ")}</span>
                      )}
                    </p>
                    <p className="text-xs text-slate-500">
                      {item.description || `${(item.accepted_formats || []).join(", ")} · up to ${Number(item.max_size_mb)} MB`}
                    </p>
                  </div>

                  {item.satisfied_by_item_id ? (
                    <StatusChip label="Already available" color="violet" />
                  ) : readOnly ? (
                    <StatusChip
                      label={statuses.find((s) => s.code === item.status_code)?.label || item.status_code}
                      color={statuses.find((s) => s.code === item.status_code)?.color}
                    />
                  ) : (
                    <select
                      value={item.status_code}
                      onChange={(e) => update(item, { status_code: e.target.value })}
                      className="w-48 rounded-xl border border-slate-200 px-3 py-2 text-sm"
                    >
                      {statuses.map((status) => (
                        <option key={status.code} value={status.code}>{status.label}</option>
                      ))}
                    </select>
                  )}
                </div>

                {!readOnly && !item.satisfied_by_item_id && (
                  <div className="mt-2 flex flex-wrap gap-2">
                    <input
                      value={notes[item.id] ?? item.next_step_note}
                      onChange={(e) => setNotes({ ...notes, [item.id]: e.target.value })}
                      onBlur={() => {
                        const value = notes[item.id];
                        if (value !== undefined && value !== item.next_step_note) {
                          void update(item, { next_step_note: value });
                        }
                      }}
                      placeholder="Next step for the student — e.g. re-upload both pages by Friday"
                      className="min-w-[240px] flex-1 rounded-xl border border-slate-200 px-3 py-2 text-sm"
                    />
                    {["resubmit", "rejected"].includes(item.status_code) && (
                      <select
                        value=""
                        onChange={(e) => {
                          const reason = reasons.find((row) => row.code === e.target.value);
                          if (reason) void update(item, { rejection_reason: reason.body });
                        }}
                        className="w-56 rounded-xl border border-slate-200 px-3 py-2 text-sm"
                      >
                        <option value="">Why was it sent back?…</option>
                        {reasons.map((reason) => (
                          <option key={reason.id} value={reason.code}>{reason.label}</option>
                        ))}
                      </select>
                    )}
                  </div>
                )}

                {item.rejection_reason && (
                  <p className="mt-2 rounded-lg bg-rose-50 p-2 text-xs text-rose-700">{item.rejection_reason}</p>
                )}
                {item.next_step_note && readOnly && (
                  <p className="mt-2 text-xs text-slate-600">Next: {item.next_step_note}</p>
                )}
              </div>
            ))}
          </div>
        </div>
      ))}

      {!lists.length && (
        <p className="text-sm text-slate-500">
          No checklist activated yet. Choose the country this student is applying to and activate it.
        </p>
      )}

      {nextSteps.length === 0 && (
        <p className="text-xs text-slate-400">No next-step statuses defined yet — a Super Admin can add them under Status words.</p>
      )}
    </div>
  );
}
