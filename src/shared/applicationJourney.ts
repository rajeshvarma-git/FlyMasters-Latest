/**
 * One description of an application's journey, shared by the server (which
 * records events and enforces the rules) and every portal (which shows them).
 * It only names the statuses the platform already stores; it adds no new ones.
 *
 * Three things a student must be able to tell apart:
 *   - the counselor preparing the file          (in_progress, returned)
 *   - the counselor approving it internally     (counselor_approved) - NOT sent
 *   - the university actually receiving it      (submitted_to_university)
 * and then the university's own answer (offer / waitlist / rejection).
 */

export type JourneyPhase = 'preparation' | 'internal' | 'university' | 'decision' | 'closed';
export type JourneyActorRole = 'student' | 'counselor' | 'admin' | 'system';

export type StatusInfo = {
  label: string;
  phase: JourneyPhase;
  /** Short sentence for the student. */
  summary: string;
  /** Who has the ball right now. */
  owner: 'counselor' | 'student' | 'university' | 'none';
  /** What happens next, from this status alone. */
  next: string;
};

export const STATUS_INFO: Record<string, StatusInfo> = {
  draft: { label: 'Not started', phase: 'preparation', owner: 'counselor', summary: 'Your counselor has not started this application yet.', next: 'Your counselor will start preparing it.' },
  in_progress: { label: 'Counselor preparing', phase: 'preparation', owner: 'counselor', summary: 'Your counselor is preparing the application. Nothing has been sent to the university.', next: 'Your counselor collects what is needed and prepares the file. You will be told if anything is missing.' },
  returned: { label: 'Changes or documents needed', phase: 'preparation', owner: 'student', summary: 'Your counselor needs something more before this can move on. See their note.', next: 'Send your counselor what they asked for, then they will carry on.' },
  pending_counselor: { label: 'With your counselor', phase: 'internal', owner: 'counselor', summary: 'Waiting for your counselor to review it. Nothing has been sent to the university.', next: 'Your counselor reviews it and either approves it or asks for changes.' },
  submitted: { label: 'With your counselor', phase: 'internal', owner: 'counselor', summary: 'Waiting for your counselor to review it. Nothing has been sent to the university.', next: 'Your counselor reviews it and either approves it or asks for changes.' },
  counselor_approved: { label: 'Approved by counselor', phase: 'internal', owner: 'counselor', summary: 'Approved internally and ready to send. It has not been submitted to the university yet.', next: 'Your counselor submits it to the university and records the date here.' },
  submitted_to_university: { label: 'Submitted to university', phase: 'university', owner: 'university', summary: 'The application has been submitted. The university is reviewing it.', next: 'Wait for the university\'s decision. Your counselor will update this page when it arrives.' },
  waitlisted: { label: 'Waitlisted', phase: 'decision', owner: 'university', summary: 'The university has put the application on its waitlist.', next: 'Wait for the university to move you off the waitlist. Your counselor will update this page.' },
  offer_received: { label: 'Offer received', phase: 'decision', owner: 'student', summary: 'The university has made an offer. Talk it through with your counselor.', next: 'Review the offer with your counselor and tell them your decision.' },
  offer_accepted: { label: 'Offer accepted', phase: 'decision', owner: 'counselor', summary: 'The offer has been accepted. Your counselor will guide the next steps.', next: 'Your counselor will guide you through the remaining enrolment steps.' },
  enrolled: { label: 'Enrolled', phase: 'closed', owner: 'none', summary: 'You are enrolled.', next: '' },
  rejected: { label: 'Not successful', phase: 'closed', owner: 'none', summary: 'The university did not offer a place this time.', next: '' },
  withdrawn: { label: 'Withdrawn', phase: 'closed', owner: 'none', summary: 'This application was withdrawn.', next: '' },
};

/** Statuses that only exist because the university has received the application. */
export const POST_SUBMISSION_STATUSES = new Set([
  'submitted_to_university', 'waitlisted', 'offer_received', 'offer_accepted', 'enrolled', 'rejected',
]);

/** A university has answered (so a submission must already have happened). */
export const DECISION_STATUSES = new Set(['waitlisted', 'offer_received', 'offer_accepted', 'enrolled', 'rejected']);

export const CLOSED_STATUSES = new Set(['enrolled', 'rejected', 'withdrawn']);

/** Statuses a student may still withdraw from: nothing has gone to the university. */
export const STUDENT_WITHDRAWABLE = new Set(['draft', 'in_progress', 'pending_counselor', 'returned']);

export function statusInfo(status: string | null | undefined): StatusInfo {
  const key = String(status || 'draft');
  return STATUS_INFO[key] || { label: key.replace(/_/g, ' '), phase: 'preparation', owner: 'counselor', summary: '', next: '' };
}

type AppLike = { status?: string | null; submitted_at?: string | null };

/** True only when the platform recorded an actual submission to the university. */
export function universitySubmitted(app: AppLike): boolean {
  return Boolean(app.submitted_at) || POST_SUBMISSION_STATUSES.has(String(app.status || ''));
}

/** The five visible steps of the progress bar. */
export const JOURNEY_STEPS = [
  { id: 'preparing', label: 'Counselor preparing' },
  { id: 'approved', label: 'Approved by counselor' },
  { id: 'submitted', label: 'Submitted to university' },
  { id: 'decision', label: 'University decision' },
  { id: 'enrolled', label: 'Enrolled' },
] as const;

/** Index into JOURNEY_STEPS of the step the application is on, or -1 when withdrawn. */
export function journeyStepIndex(status: string | null | undefined): number {
  switch (String(status || 'draft')) {
    case 'withdrawn': return -1;
    case 'counselor_approved': return 1;
    case 'submitted_to_university': return 2;
    case 'waitlisted':
    case 'offer_received':
    case 'offer_accepted':
    case 'rejected': return 3;
    case 'enrolled': return 4;
    default: return 0;
  }
}

export type TransitionCheck = { ok: true } | { ok: false; error: string };

/**
 * Whether a counselor/admin may record `to`. The one rule we add: the
 * university cannot have answered an application that was never recorded as
 * submitted. Everything else stays as the platform already allowed it.
 */
export function checkTransition(app: AppLike, to: string): TransitionCheck {
  if (!STATUS_INFO[to]) return { ok: false, error: 'Choose a valid application status.' };
  if (DECISION_STATUSES.has(to) && !universitySubmitted(app) && to !== String(app.status || '')) {
    return { ok: false, error: 'Record the submission to the university first - a university decision can only follow it.' };
  }
  return { ok: true };
}

export type JourneyEvent = {
  id: string;
  application_id?: string | null;
  status?: string | null;
  from_status?: string | null;
  event_type?: string | null;
  notes?: string | null;
  next_action_required?: string | null;
  documents_required?: string[] | null;
  deadline_date?: string | null;
  is_visible_to_student?: boolean | null;
  updated_by?: string | null;
  updated_by_role?: string | null;
  updated_by_name?: string | null;
  updated_at?: string | null;
  created_at?: string | null;
};

export type TimelineItem = {
  id: string;
  at: string | null;
  title: string;
  detail: string;
  phase: JourneyPhase;
  actorRole: JourneyActorRole;
  actorName: string;
  /** Rebuilt from the application row because no event was stored (older records). */
  derived: boolean;
};

const ACTOR_LABEL: Record<JourneyActorRole, string> = {
  student: 'You',
  counselor: 'Your counselor',
  admin: 'Fly Masters admin',
  system: 'Fly Masters',
};

export function actorLabel(role: string | null | undefined, name?: string | null, viewer: 'student' | 'staff' = 'student'): string {
  const key = (['student', 'counselor', 'admin', 'system'].includes(String(role)) ? role : 'system') as JourneyActorRole;
  if (name) return viewer === 'student' && key === 'student' ? 'You' : name;
  if (viewer === 'staff') return key === 'student' ? 'Student' : key === 'counselor' ? 'Counselor' : ACTOR_LABEL[key];
  return ACTOR_LABEL[key];
}

export function eventTitle(event: JourneyEvent): string {
  if (event.event_type === 'started') return 'Application started by your counselor';
  if (event.event_type === 'note' || event.status === event.from_status) return 'Note from your counselor';
  return statusInfo(event.status).label;
}

/** Oldest first. Events a student must not see are dropped when `forStudent`. */
export function buildTimeline(
  app: { id: string; created_at?: string | null; started_by?: string | null; counselor_id?: string | null; submitted_at?: string | null; submitted_by?: string | null; status?: string | null },
  events: JourneyEvent[],
  opts: { forStudent?: boolean } = {},
): TimelineItem[] {
  const viewer = opts.forStudent ? 'student' : 'staff';
  const mine = (events || [])
    .filter((e) => String(e.application_id || '') === String(app.id))
    .filter((e) => !opts.forStudent || e.is_visible_to_student !== false);
  const items: TimelineItem[] = mine.map((e) => ({
    id: e.id,
    at: e.updated_at || e.created_at || null,
    title: viewer === 'staff' && e.event_type === 'started' ? 'Application started' : eventTitle(e),
    detail: [e.notes, e.next_action_required ? `Next: ${e.next_action_required}` : '', e.documents_required?.length ? `Needed: ${e.documents_required.join(', ')}` : '']
      .filter(Boolean).join(' - '),
    phase: statusInfo(e.status).phase,
    actorRole: (['student', 'counselor', 'admin', 'system'].includes(String(e.updated_by_role)) ? e.updated_by_role : 'system') as JourneyActorRole,
    actorName: actorLabel(e.updated_by_role, e.updated_by_name, viewer),
    derived: false,
  }));
  // Applications created before events were stored: rebuild the two moments we do know.
  if (!mine.some((e) => e.event_type === 'started') && app.created_at) {
    const byStudent = app.started_by === 'student';
    items.push({
      id: `${app.id}:started`, at: app.created_at, title: 'Application started', detail: '', phase: 'preparation',
      actorRole: byStudent ? 'student' : 'counselor', actorName: actorLabel(byStudent ? 'student' : 'counselor', null, viewer), derived: true,
    });
  }
  if (app.submitted_at && !mine.some((e) => e.status === 'submitted_to_university')) {
    items.push({
      id: `${app.id}:submitted`, at: app.submitted_at, title: statusInfo('submitted_to_university').label, detail: '', phase: 'university',
      actorRole: 'counselor', actorName: actorLabel('counselor', null, viewer), derived: true,
    });
  }
  return items.sort((a, b) => String(a.at || '').localeCompare(String(b.at || '')));
}

/** The one sentence about what happens next, and who does it. */
export function nextAction(
  app: { status?: string | null },
  latest?: JourneyEvent | null,
): { text: string; owner: StatusInfo['owner'] } | null {
  const info = statusInfo(app.status);
  if (CLOSED_STATUSES.has(String(app.status))) return null;
  const stated = latest && latest.status === app.status ? latest.next_action_required : '';
  const text = stated || info.next;
  return text ? { text, owner: info.owner } : null;
}
