import { Link } from 'react-router-dom';
import { Card, CardContent } from '@student/components/ui/card';
import { Button } from '@student/components/ui/button';
import { Badge } from '@student/components/ui/badge';
import { Calendar, CheckCircle2, ClipboardCheck, Eye, GraduationCap, MapPin, PlayCircle, RotateCcw, ShieldCheck, User } from 'lucide-react';
import { format } from 'date-fns';
import { statusInfo } from '@shared/applicationJourney';
import type { ShortlistDetails } from '@student/lib/shortlistDecisions';
import { fieldOfStudy, keyFacts, locationLine, overview, programTitle } from '@student/lib/universityInfo';

export type RecommendationRow = {
  id: string;
  university_id: string | null;
  university_name: string | null;
  course_name: string | null;
  location: string | null;
  status: string | null;
  student_consent: boolean;
  student_consent_date?: string | null;
  student_decision?: string | null;
  priority_level: string | null;
  estimated_fees: number | null;
  application_deadline: string | null;
  application_id?: string | null;
  application_status?: string | null;
  application_start_requested_at?: string | null;
  counselor_notes: string | null;
  shortlisted_at: string | null;
  created_at: string | null;
};

type Props = {
  row: RecommendationRow;
  details?: ShortlistDetails | null;
  /** The real application, when the counselor has started one. */
  application?: { id: string; status: string } | null;
  busy?: boolean;
  /** Shown under the consent panel when "Start Application" is pressed too early or fails. */
  notice?: string;
  onGiveConsent: () => void;
  onWithdrawConsent: () => void;
  onNotInterested: () => void;
  onStartApplication: () => void;
  onView: () => void;
};

const PRIORITY_STYLE: Record<string, string> = {
  high: 'bg-rose-100 text-rose-800 border-rose-200',
  medium: 'bg-amber-100 text-amber-800 border-amber-200',
  low: 'bg-slate-100 text-slate-700 border-slate-200',
};

function dateText(value?: string | null) {
  if (!value) return '';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '' : format(date, 'MMM dd, yyyy');
}

/**
 * One counselor recommendation on My Shortlists. Reading order, top to bottom:
 * university, programme and field, location, badges, who recommended it, the
 * date, the university information, the Application Consent panel, and the
 * three actions. A recommendation is an interest, never an application.
 */
export function RecommendedUniversityCard({
  row, details, application, busy, notice, onGiveConsent, onWithdrawConsent, onNotInterested, onStartApplication, onView,
}: Props) {
  const status = String(row.status || '').toLowerCase();
  const applied = Boolean(application) || status === 'applied' || Boolean(row.application_id);
  const declined = !applied && (status === 'declined' || row.student_decision === 'declined');
  const consented = !applied && !declined && (row.student_consent || status === 'consented');
  const requested = consented && Boolean(row.application_start_requested_at);
  const applicationStatus = application?.status || row.application_status || 'in_progress';

  const name = details?.university?.name || row.university_name || 'University';
  const program = programTitle(row, details);
  const field = fieldOfStudy(details);
  const where = locationLine(row, details);
  const priority = String(row.priority_level || '').toLowerCase();
  const about = overview(details);
  const facts = keyFacts(row, details);
  const shortlistedOn = dateText(row.shortlisted_at || row.created_at);

  return (
    <Card className="glass-card overflow-hidden" data-testid="recommended-card" data-shortlist-id={row.id}>
      <CardContent className="space-y-4 p-4 sm:p-5">
        <div className="flex items-start gap-3">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-primary/10">
            <GraduationCap className="h-5 w-5 text-primary" />
          </div>
          <div className="min-w-0 flex-1 space-y-1">
            <h3 className="text-lg font-semibold leading-snug break-words" data-testid="card-university">{name}</h3>
            {program ? (
              <p className="text-sm font-medium break-words" data-testid="card-program">
                {program}{field ? <span className="font-normal text-muted-foreground"> · {field}</span> : null}
              </p>
            ) : null}
            {where ? (
              <p className="flex items-center gap-1 text-sm text-muted-foreground" data-testid="card-location">
                <MapPin className="h-3.5 w-3.5 shrink-0" /> {where}
              </p>
            ) : null}
            <div className="flex flex-wrap items-center gap-2 pt-1" data-testid="card-badges">
              {status && !applied ? (
                <Badge variant="outline" className="capitalize">{consented ? 'Consent given' : declined ? 'Not interested' : 'Recommended'}</Badge>
              ) : null}
              {applied ? <Badge className="bg-purple-600 text-white">{statusInfo(applicationStatus).label}</Badge> : null}
              {priority ? (
                <Badge variant="outline" className={PRIORITY_STYLE[priority] || ''}>
                  <span className="capitalize">{priority}</span>&nbsp;priority
                </Badge>
              ) : null}
            </div>
          </div>
        </div>

        <div className="space-y-1 text-sm text-muted-foreground">
          <p className="flex items-center gap-2" data-testid="card-recommended-by"><User className="h-4 w-4 shrink-0" /> Recommended by: <span className="font-medium text-foreground">Your Counselor</span></p>
          {shortlistedOn ? (
            <p className="flex items-center gap-2" data-testid="card-date"><Calendar className="h-4 w-4 shrink-0" /> Shortlisted on {shortlistedOn}</p>
          ) : null}
        </div>

        {/* University information — directly below the shortlist date. */}
        <section className="space-y-3 rounded-lg bg-muted/40 p-3 sm:p-4" data-testid="card-university-info" aria-label="University information">
          <h4 className="text-sm font-semibold">University information</h4>
          {about ? <p className="line-clamp-4 whitespace-pre-line text-sm text-muted-foreground">{about}</p> : null}
          {facts.length ? (
            <dl className="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
              {facts.slice(0, 6).map((fact) => (
                <div key={fact.label} className="min-w-0">
                  <dt className="text-xs uppercase tracking-wide text-muted-foreground">{fact.label}</dt>
                  <dd className="line-clamp-3 break-words">{fact.value}</dd>
                </div>
              ))}
            </dl>
          ) : null}
          {!about && !facts.length ? (
            <p className="text-sm text-muted-foreground">No further details have been added for this university yet. Use View University to see everything we have.</p>
          ) : null}
          {row.counselor_notes ? (
            <p className="text-sm"><span className="font-medium">Your counselor says: </span><span className="text-muted-foreground">{row.counselor_notes}</span></p>
          ) : null}
        </section>

        {/* Application Consent */}
        <section className="rounded-lg border p-3 sm:p-4" data-testid="consent-panel" aria-label="Application consent">
          <div className="flex items-start gap-2">
            <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
            <div className="min-w-0 space-y-1 text-sm">
              <h4 className="font-semibold">Application Consent</h4>
              <p className="text-muted-foreground">
                Giving consent means you permit your counselor to go ahead with your application to this university. Nothing is sent to the
                university when you consent — your counselor prepares the application first, and you can follow it under My Applications.
              </p>
              <p data-testid="consent-status" className={consented || applied ? 'font-medium text-emerald-700' : declined ? 'font-medium text-slate-600' : 'font-medium text-amber-700'}>
                {applied
                  ? `Consent recorded${dateText(row.student_consent_date) ? ` on ${dateText(row.student_consent_date)}` : ''} · application started by your counselor`
                  : consented
                    ? `Consent given${dateText(row.student_consent_date) ? ` on ${dateText(row.student_consent_date)}` : ''}`
                    : declined
                      ? 'You marked this university as not interested'
                      : 'Consent not given yet'}
              </p>
              {consented && !applied ? (
                <button type="button" className="text-xs text-muted-foreground underline" disabled={busy} onClick={onWithdrawConsent}>Withdraw my consent</button>
              ) : null}
              {!consented && !applied && !declined ? (
                <button type="button" className="text-xs text-muted-foreground underline" disabled={busy} onClick={onNotInterested}>Not interested in this university</button>
              ) : null}
            </div>
          </div>
        </section>

        {applied ? (
          <div className="rounded-lg bg-purple-50 p-3 text-sm" data-testid="application-state">
            <p className="font-medium text-purple-900">{statusInfo(applicationStatus).label}</p>
            <p className="text-purple-900/80">{statusInfo(applicationStatus).summary}</p>
            <Link className="mt-1 inline-block font-medium text-primary underline" to={`/student/applications${application ? `#${encodeURIComponent(application.id)}` : ''}`} data-testid="go-to-applications">
              View in My Applications
            </Link>
          </div>
        ) : null}

        {/* The three actions */}
        <div className="flex flex-wrap gap-2" data-testid="card-actions">
          {!applied ? (
            <Button
              size="sm"
              variant="outline"
              data-testid="start-application"
              aria-disabled={!consented || requested || busy}
              disabled={busy || requested}
              className={!consented ? 'opacity-70' : ''}
              onClick={onStartApplication}
              title={consented ? 'Ask your counselor to start this application' : 'Give your consent first'}
            >
              {requested ? <CheckCircle2 className="mr-1.5 h-4 w-4" /> : <PlayCircle className="mr-1.5 h-4 w-4" />}
              {requested ? 'Request sent' : 'Start Application'}
            </Button>
          ) : null}
          {!applied ? (
            consented ? (
              <Button size="sm" variant="secondary" disabled data-testid="give-consent" className="text-emerald-700">
                <ClipboardCheck className="mr-1.5 h-4 w-4" /> Consent given
              </Button>
            ) : declined ? (
              <Button size="sm" variant="secondary" disabled={busy} data-testid="give-consent" onClick={onWithdrawConsent}>
                <RotateCcw className="mr-1.5 h-4 w-4" /> Change my mind
              </Button>
            ) : (
              <Button size="sm" disabled={busy} data-testid="give-consent" onClick={onGiveConsent} className="bg-emerald-600 text-white hover:bg-emerald-700">
                <ClipboardCheck className="mr-1.5 h-4 w-4" /> Give Consent
              </Button>
            )
          ) : null}
          <Button size="sm" variant="outline" data-testid="view-university" onClick={onView}>
            <Eye className="mr-1.5 h-4 w-4" /> View University
          </Button>
        </div>
        {!applied && !consented && !declined ? (
          <p className="text-xs text-muted-foreground" data-testid="start-hint">
            Your counselor starts the application. Give your consent first so they can go ahead.
          </p>
        ) : null}
        {requested ? (
          <p className="text-xs text-muted-foreground" data-testid="start-hint">
            Your counselor has been asked to start this application. It will appear under My Applications when they do.
          </p>
        ) : null}
        {notice ? <p className="text-sm text-amber-700" role="status" data-testid="card-notice">{notice}</p> : null}
      </CardContent>
    </Card>
  );
}
