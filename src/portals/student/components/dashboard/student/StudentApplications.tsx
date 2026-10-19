import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useAuth } from '@student/hooks/useAuth';
import { supabase } from '@student/integrations/supabase/client';
import { Card, CardContent } from '@student/components/ui/card';
import { Button } from '@student/components/ui/button';
import { Badge } from '@student/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@student/components/ui/dialog';
import { useToast } from '@student/hooks/use-toast';
import { apiUrl } from '@student/lib/apiBase';
import { BookOpen, Calendar, CheckCircle2, Circle, GraduationCap, MapPin } from 'lucide-react';
import { format } from 'date-fns';
import {
  JOURNEY_STEPS,
  STUDENT_WITHDRAWABLE,
  buildTimeline,
  journeyStepIndex,
  nextAction,
  statusInfo,
  universitySubmitted,
  type JourneyEvent,
} from '@shared/applicationJourney';

/**
 * My Applications - the student's read-only view of applications their
 * counselor has started. A saved or recommended university never shows up
 * here until the counselor starts it. Every stage and timeline entry comes
 * from the stored application and its stored events (the same records the
 * counselor and admin see), so a refresh shows exactly the same thing.
 */

type Application = {
  id: string;
  status: string;
  priority_level?: string | null;
  application_deadline?: string | null;
  intake_term?: string | null;
  notes?: string | null;
  counselor_comments?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
  university_id?: string | null;
  university_name?: string | null;
  course_name?: string | null;
  country?: string | null;
  city?: string | null;
  shortlist_id?: string | null;
  started_by?: string | null;
  submitted_at?: string | null;
  status_changed_at?: string | null;
};

function safeDate(value: string | null | undefined, pattern = 'MMM d, yyyy') {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : format(date, pattern);
}

const OWNER_LABEL: Record<string, string> = {
  counselor: 'Your counselor',
  student: 'You',
  university: 'The university',
  none: '',
};

function JourneyBar({ status }: { status: string }) {
  const index = journeyStepIndex(status);
  if (index < 0) {
    return <p className="rounded-md bg-muted/60 px-3 py-2 text-sm text-muted-foreground">This application was withdrawn.</p>;
  }
  const rejected = status === 'rejected';
  return (
    <ol className="grid grid-cols-5 gap-1" aria-label="Application progress">
      {JOURNEY_STEPS.map((step, i) => {
        const done = i < index || (i === index && status === 'enrolled');
        const current = i === index && !done;
        const label = i === 3 && rejected ? 'Not successful' : step.label;
        return (
          <li key={step.id} className="flex flex-col items-center text-center" aria-current={current ? 'step' : undefined}>
            <span className={`flex h-6 w-6 items-center justify-center rounded-full ${done ? 'text-emerald-600' : current ? (rejected ? 'text-rose-600' : 'text-primary') : 'text-muted-foreground/50'}`}>
              {done ? <CheckCircle2 className="h-5 w-5" /> : <Circle className={`h-5 w-5 ${current ? 'fill-current' : ''}`} />}
            </span>
            <span className={`mt-1 text-[11px] leading-tight ${current ? 'font-semibold text-foreground' : 'text-muted-foreground'}`}>{label}</span>
          </li>
        );
      })}
    </ol>
  );
}

export function StudentApplications() {
  const { user } = useAuth();
  const { toast } = useToast();
  const location = useLocation();
  const [applications, setApplications] = useState<Application[]>([]);
  const [events, setEvents] = useState<JourneyEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [withdrawing, setWithdrawing] = useState<Application | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async (silent = false) => {
    if (!user) return;
    try {
      const [appsRes, eventsRes] = await Promise.all([
        supabase.from('applications').select('*').eq('user_id', user.id).order('created_at', { ascending: false }),
        supabase.from('application_status_updates').select('*').eq('student_id', user.id),
      ]);
      if (appsRes.error) throw appsRes.error;
      setApplications((appsRes.data || []) as Application[]);
      setEvents(((eventsRes.error ? [] : eventsRes.data) || []) as JourneyEvent[]);
      setLoadError('');
    } catch (error: any) {
      if (!silent) setLoadError(error?.message || 'Could not load your applications.');
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    if (!user) return;
    void load();
    // The counselor moves applications forward while you are here.
    const poll = window.setInterval(() => void load(true), 8000);
    return () => window.clearInterval(poll);
  }, [user, load]);

  const focusId = decodeURIComponent((location.hash || '').replace(/^#/, ''));
  useEffect(() => {
    if (!focusId || loading) return;
    document.getElementById(`application-${focusId}`)?.scrollIntoView({ block: 'start' });
  }, [focusId, loading, applications.length]);

  const timelines = useMemo(() => {
    const map = new Map<string, ReturnType<typeof buildTimeline>>();
    for (const app of applications) map.set(app.id, buildTimeline(app, events, { forStudent: true }).reverse());
    return map;
  }, [applications, events]);

  const withdraw = async () => {
    if (!withdrawing) return;
    setBusy(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const response = await fetch(apiUrl(`/api/case/me/applications/${encodeURIComponent(withdrawing.id)}`), {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token || ''}` },
        body: JSON.stringify({ status: 'withdrawn' }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || 'Could not withdraw the application.');
      toast({ title: 'Application withdrawn', description: withdrawing.university_name || undefined });
      setWithdrawing(null);
      await load(true);
    } catch (error: any) {
      toast({ title: 'Could not withdraw', description: error?.message || 'Please try again.', variant: 'destructive' });
    } finally {
      setBusy(false);
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-[400px] items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-b-2 border-primary" />
      </div>
    );
  }

  const open = applications.filter((app) => !['enrolled', 'rejected', 'withdrawn'].includes(app.status));
  const closed = applications.filter((app) => ['enrolled', 'rejected', 'withdrawn'].includes(app.status));

  const renderApplication = (app: Application) => {
    const info = statusInfo(app.status);
    const timeline = timelines.get(app.id) || [];
    const latest = events
      .filter((e) => String(e.application_id) === app.id && e.is_visible_to_student !== false)
      .sort((a, b) => String(b.updated_at || '').localeCompare(String(a.updated_at || '')))[0];
    const next = nextAction(app, latest);
    const submittedOn = safeDate(app.submitted_at);
    const place = [app.city, app.country].filter(Boolean).join(', ');
    const decided = ['waitlisted', 'offer_received', 'offer_accepted', 'enrolled', 'rejected'].includes(app.status);
    const highlighted = focusId === app.id;
    return (
      <Card key={app.id} id={`application-${app.id}`} className={`glass-card ${highlighted ? 'ring-2 ring-primary' : ''}`}>
        <CardContent className="space-y-4 p-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <h3 className="text-lg font-semibold leading-snug">{app.university_name || 'University'}</h3>
              <p className="flex items-center gap-1 text-sm text-muted-foreground"><GraduationCap className="h-4 w-4" /> {app.course_name || 'Program not set'}</p>
              {place ? <p className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground"><MapPin className="h-3 w-3" /> {place}</p> : null}
              <p className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground">
                <Calendar className="h-3 w-3" /> {app.intake_term || 'Intake not set'}
                {safeDate(app.application_deadline) ? ` · Deadline ${safeDate(app.application_deadline)}` : ''}
              </p>
            </div>
            <Badge className={app.status === 'rejected' ? 'bg-rose-600 text-white' : app.status === 'withdrawn' ? 'bg-slate-500 text-white' : 'bg-purple-600 text-white'}>{info.label}</Badge>
          </div>

          <JourneyBar status={app.status} />

          <div className="rounded-lg border bg-muted/30 p-3 text-sm">
            <p className="font-medium">{info.label}</p>
            <p className="text-muted-foreground">{info.summary}</p>
            {next ? (
              <p className="mt-2">
                <span className="font-medium">What&apos;s next{OWNER_LABEL[next.owner] ? ` - ${OWNER_LABEL[next.owner]}` : ''}: </span>
                <span className="text-muted-foreground">{next.text}</span>
              </p>
            ) : null}
            {latest?.documents_required?.length && latest.status === app.status ? (
              <p className="mt-1"><span className="font-medium">Still needed: </span><span className="text-muted-foreground">{latest.documents_required.join(', ')}</span></p>
            ) : null}
            {app.counselor_comments ? <p className="mt-2 text-muted-foreground">Counselor note: {app.counselor_comments}</p> : null}
          </div>

          <dl className="grid gap-x-6 gap-y-1 text-sm sm:grid-cols-2">
            <div className="flex justify-between gap-3"><dt className="text-muted-foreground">Sent to the university</dt><dd className="font-medium">{universitySubmitted(app) ? (submittedOn || 'Yes') : 'Not yet'}</dd></div>
            <div className="flex justify-between gap-3"><dt className="text-muted-foreground">University decision</dt><dd className="font-medium">{decided ? info.label : 'Not yet'}</dd></div>
          </dl>

          <div>
            <p className="mb-2 text-sm font-semibold">Timeline</p>
            {timeline.length === 0 ? (
              <p className="text-sm text-muted-foreground">No updates yet.</p>
            ) : (
              <ol className="relative ml-1.5 border-l border-border" data-testid="application-timeline">
                {timeline.map((item, i) => (
                  <li key={item.id} className="relative pb-4 pl-6 last:pb-0">
                    <span className={`absolute -left-[5px] top-1.5 h-2.5 w-2.5 rounded-full ring-2 ring-background ${i === 0 ? 'bg-primary' : 'bg-emerald-500'}`} />
                    <p className="text-sm font-semibold">{item.title}</p>
                    {item.detail ? <p className="text-sm text-muted-foreground">{item.detail}</p> : null}
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {safeDate(item.at, 'MMM d, yyyy · h:mm a') || 'Date not recorded'} · {item.actorName}
                    </p>
                  </li>
                ))}
              </ol>
            )}
          </div>

          {STUDENT_WITHDRAWABLE.has(app.status) ? (
            <div className="flex justify-end">
              <Button variant="outline" size="sm" onClick={() => setWithdrawing(app)}>Withdraw application</Button>
            </div>
          ) : null}
        </CardContent>
      </Card>
    );
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-gradient-primary">
          <BookOpen className="h-6 w-6 text-white" />
        </div>
        <div>
          <h1 className="text-3xl font-bold">My Applications</h1>
          <p className="text-muted-foreground">
            Applications your counselor has started for you. Saving or being recommended a university does not start one - tick it on{' '}
            <Link to="/student/shortlists" className="font-medium text-primary underline">My Shortlists</Link> and your counselor takes it from there.
          </p>
        </div>
      </div>

      {loadError ? <Card className="border-destructive/40"><CardContent className="p-4 text-sm text-destructive">{loadError}</CardContent></Card> : null}

      {applications.length === 0 && !loadError ? (
        <Card className="glass-card">
          <CardContent className="py-12 text-center">
            <BookOpen className="mx-auto mb-4 h-16 w-16 text-muted-foreground opacity-50" />
            <h3 className="mb-2 text-lg font-semibold">No applications yet</h3>
            <p className="mb-4 text-muted-foreground">When your counselor starts an application for you it appears here, with every step.</p>
            <div className="flex flex-wrap justify-center gap-2">
              <Button asChild><Link to="/student/shortlists">Go to My Shortlists</Link></Button>
              <Button asChild variant="outline"><Link to="/student/messages">Message your advisor</Link></Button>
            </div>
          </CardContent>
        </Card>
      ) : null}

      {open.length > 0 ? (
        <section className="space-y-4">
          <h2 className="text-lg font-semibold">In progress ({open.length})</h2>
          {open.map(renderApplication)}
        </section>
      ) : null}
      {closed.length > 0 ? (
        <section className="space-y-4">
          <h2 className="text-lg font-semibold text-muted-foreground">Finished ({closed.length})</h2>
          {closed.map(renderApplication)}
        </section>
      ) : null}

      <Dialog open={Boolean(withdrawing)} onOpenChange={(openState) => { if (!openState) setWithdrawing(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Withdraw this application?</DialogTitle>
            <DialogDescription>
              {withdrawing?.university_name || 'This application'} has not been sent to the university. Your counselor will be told you withdrew it.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setWithdrawing(null)}>Keep it</Button>
            <Button variant="destructive" disabled={busy} onClick={() => void withdraw()}>Withdraw</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
