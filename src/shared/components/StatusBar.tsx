/**
 * The status bar from CRM 2.6.2.
 *
 * One component, five places: the admin lead view, the counsellor's student
 * screen, the student portal, the agent portal and the telecaller view. It is
 * shared rather than copied so the colours and the stage wording stay the same
 * everywhere — five separate implementations of the same bar is how a CRM ends
 * up looking like five different products.
 *
 * The stages are NOT hardcoded. They come from /api/students/:id/progress,
 * which reads them from the Super Admin's status vocabulary and filters them
 * by who is asking, so a student never sees an internal-only stage.
 */

export type Stage = {
  code: string;
  label: string;
  color: string;
  stage_index: number;
  is_terminal?: boolean;
};

export type Track = {
  stages: Stage[];
  current: { code: string; label: string; color: string; stage_index: number } | null;
  percent: number;
};

export type Progress = {
  student_id: string;
  name?: string;
  application?: Track;
  visa?: Track;
  next_step?: Track;
  next_step_note?: string;
  documents?: { country: string; family_id: string; required: number; done: number; percent: number }[];
};

/** Tailwind cannot build class names at runtime, so the palette is explicit. */
const TONE: Record<string, { dot: string; bar: string; chip: string }> = {
  slate: { dot: "bg-slate-400", bar: "bg-slate-400", chip: "bg-slate-100 text-slate-700" },
  sky: { dot: "bg-sky-500", bar: "bg-sky-500", chip: "bg-sky-100 text-sky-800" },
  indigo: { dot: "bg-indigo-500", bar: "bg-indigo-500", chip: "bg-indigo-100 text-indigo-800" },
  violet: { dot: "bg-violet-500", bar: "bg-violet-500", chip: "bg-violet-100 text-violet-800" },
  amber: { dot: "bg-amber-500", bar: "bg-amber-500", chip: "bg-amber-100 text-amber-900" },
  emerald: { dot: "bg-emerald-500", bar: "bg-emerald-500", chip: "bg-emerald-100 text-emerald-800" },
  rose: { dot: "bg-rose-500", bar: "bg-rose-500", chip: "bg-rose-100 text-rose-800" },
};

const tone = (color?: string) => TONE[color || "slate"] || TONE.slate;

export function StatusChip({ label, color }: { label: string; color?: string }) {
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ${tone(color).chip}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${tone(color).dot}`} />
      {label}
    </span>
  );
}

function TrackBar({ title, track }: { title: string; track: Track }) {
  if (!track?.stages?.length) return null;
  const currentIndex = track.current
    ? track.stages.findIndex((stage) => stage.code === track.current?.code)
    : -1;

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{title}</p>
        {track.current
          ? <StatusChip label={track.current.label} color={track.current.color} />
          : <span className="text-xs text-slate-400">Not started</span>}
      </div>

      {/* the bar itself: one segment per stage, filled up to the current one */}
      <div className="flex gap-1" role="progressbar" aria-valuenow={track.percent} aria-valuemin={0} aria-valuemax={100}>
        {track.stages.map((stage, index) => {
          const reached = currentIndex >= 0 && index <= currentIndex;
          return (
            <div
              key={stage.code}
              title={stage.label}
              className={`h-1.5 flex-1 rounded-full ${reached ? tone(track.current?.color).bar : "bg-slate-200"}`}
            />
          );
        })}
      </div>

      <div className="flex flex-wrap gap-x-3 gap-y-1">
        {track.stages.map((stage, index) => (
          <span
            key={stage.code}
            className={`text-[11px] ${
              index === currentIndex ? "font-semibold text-navy-900" : "text-slate-400"
            }`}
          >
            {stage.label}
          </span>
        ))}
      </div>
    </div>
  );
}

export default function StatusBar({ progress, compact = false }: { progress: Progress | null; compact?: boolean }) {
  if (!progress) return null;

  if (compact) {
    return (
      <div className="flex flex-wrap items-center gap-2">
        {progress.application?.current && <StatusChip label={progress.application.current.label} color={progress.application.current.color} />}
        {progress.visa?.current && <StatusChip label={progress.visa.current.label} color={progress.visa.current.color} />}
        {progress.next_step?.current && <StatusChip label={progress.next_step.current.label} color={progress.next_step.current.color} />}
      </div>
    );
  }

  return (
    <div className="space-y-5 rounded-2xl border border-slate-100 bg-white p-5 shadow-card">
      {progress.application && <TrackBar title="Application" track={progress.application} />}
      {progress.visa && <TrackBar title="Visa" track={progress.visa} />}

      {progress.documents?.length ? (
        <div className="space-y-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Documents</p>
          {progress.documents.map((row) => (
            <div key={row.family_id} className="flex items-center gap-3">
              <span className="w-24 shrink-0 truncate text-xs text-slate-600">{row.country}</span>
              <div className="h-1.5 flex-1 rounded-full bg-slate-200">
                <div
                  className={`h-1.5 rounded-full ${row.percent === 100 ? "bg-emerald-500" : "bg-sky-500"}`}
                  style={{ width: `${row.percent}%` }}
                />
              </div>
              <span className="w-16 shrink-0 text-right text-xs text-slate-500">{row.done}/{row.required}</span>
            </div>
          ))}
        </div>
      ) : null}

      {progress.next_step?.current || progress.next_step_note ? (
        <div className="rounded-xl bg-slate-50 p-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Next step</p>
          <div className="mt-1.5 flex flex-wrap items-center gap-2">
            {progress.next_step?.current && (
              <StatusChip label={progress.next_step.current.label} color={progress.next_step.current.color} />
            )}
            {progress.next_step_note && <span className="text-sm text-slate-700">{progress.next_step_note}</span>}
          </div>
        </div>
      ) : null}
    </div>
  );
}
