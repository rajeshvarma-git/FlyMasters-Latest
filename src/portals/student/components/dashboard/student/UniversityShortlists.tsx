import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '@student/hooks/useAuth';
import { supabase } from '@student/integrations/supabase/client';
import { Card, CardContent } from '@student/components/ui/card';
import { Button } from '@student/components/ui/button';
import { Badge } from '@student/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@student/components/ui/dialog';
import { useToast } from '@student/hooks/use-toast';
import { Calendar, Check, DollarSign, GraduationCap, Info, MapPin, RotateCcw, User, X } from 'lucide-react';
import { format } from 'date-fns';
import { collectStudentShortlistKeys, shortlistBelongsToStudent } from '@student/lib/studentShortlists';
import { decideShortlist, fetchShortlistDetails, requestApplicationStart, shortlistMyPick, type ShortlistDetails } from '@student/lib/shortlistDecisions';
import { RecommendedUniversityCard } from './RecommendedUniversityCard';
import { UniversityDetailsDialog } from './UniversityDetailsDialog';
import { UniversityInfoView } from './UniversityInfoView';
import { statusInfo } from '@shared/applicationJourney';

/**
 * My Shortlists - exactly two lists of universities that are only *interests*:
 *   A. Saved by you / your interests - hearted or picked by the student.
 *   B. Recommended by your counselor.
 * Neither is an application. A tick tells the counselor you want to go ahead;
 * only the counselor can start an application, and once they do the entry
 * shows the application's real stage and links to My Applications.
 */

type ShortlistRow = {
  id: string;
  university_id: string | null;
  university_name: string | null;
  course_name: string | null;
  location: string | null;
  status: string | null;
  source?: string | null;
  student_consent: boolean;
  student_decision?: string | null;
  student_decision_at?: string | null;
  counselor_id: string | null;
  source_counselor_id?: string | null;
  counselor_notes: string | null;
  priority_level: string | null;
  estimated_fees: number | null;
  application_deadline: string | null;
  application_id?: string | null;
  application_status?: string | null;
  application_start_requested_at?: string | null;
  student_consent_date?: string | null;
  shortlisted_at: string | null;
  created_at: string | null;
  course_link?: string | null;
};

type SavedUniversity = { id: string; name: string; country: string; city: string | null; website_url: string | null };

type ApplicationRow = { id: string; shortlist_id?: string | null; university_id?: string | null; university_name?: string | null; status: string; counselor_comments?: string | null; updated_at?: string | null; created_at?: string | null };

type Item =
  | { kind: 'shortlist'; key: string; row: ShortlistRow }
  | { kind: 'saved'; key: string; uni: SavedUniversity };

function decisionOf(row: ShortlistRow): 'applied' | 'accepted' | 'declined' | 'pending' {
  const status = String(row.status || '').toLowerCase();
  if (status === 'applied' || row.application_id) return 'applied';
  if (status === 'declined' || row.student_decision === 'declined') return 'declined';
  if (row.student_consent || status === 'consented') return 'accepted';
  return 'pending';
}

function safeDate(value: string | null | undefined, pattern = 'MMM dd, yyyy') {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : format(date, pattern);
}

export function UniversityShortlists() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [shortlists, setShortlists] = useState<ShortlistRow[]>([]);
  const [saved, setSaved] = useState<SavedUniversity[]>([]);
  const [applications, setApplications] = useState<ApplicationRow[]>([]);
  const [counselorNames, setCounselorNames] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [busyKey, setBusyKey] = useState('');
  const [details, setDetails] = useState<Item | null>(null);
  const [catalog, setCatalog] = useState<Record<string, ShortlistDetails>>({});
  const [viewing, setViewing] = useState<ShortlistRow | null>(null);
  const [notices, setNotices] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    if (!user) return;
    try {
      const [{ data: rows, error }, { data: leads }, { data: favs }, { data: unis }, { data: apps }] = await Promise.all([
        supabase.from('university_shortlists').select('*').order('created_at', { ascending: false }),
        supabase.from('student_leads').select('id, user_id, email'),
        supabase.from('user_favorites').select('university_id').eq('user_id', user.id),
        supabase.from('universities').select('id, name, country, city, website_url'),
        supabase.from('applications').select('*').eq('user_id', user.id),
      ]);
      const keys = collectStudentShortlistKeys(user, leads || []);
      const mine = ((error ? [] : rows || []) as ShortlistRow[]).filter((row) => shortlistBelongsToStudent(row, user, keys));
      setShortlists(mine);

      const favIds = new Set((favs || []).map((f: any) => String(f.university_id)));
      setSaved(((unis || []) as any[]).filter((u) => favIds.has(String(u.id))).map((u) => ({
        id: String(u.id),
        name: u.name,
        country: u.country || '',
        city: u.city || null,
        website_url: u.website_url || null,
      })));
      setApplications((apps || []) as ApplicationRow[]);
      // The real university and programme behind each recommendation (catalogue records, not copies).
      fetchShortlistDetails().then(setCatalog).catch((error) => console.error('Could not load university details:', error));

      const ids = [...new Set(mine.map((row) => row.source_counselor_id || row.counselor_id).filter(Boolean))] as string[];
      if (ids.length) {
        const { data: people } = await supabase.from('profiles').select('user_id, first_name, last_name').in('user_id', ids);
        const names: Record<string, string> = {};
        (people || []).forEach((p: any) => {
          const name = [p.first_name, p.last_name].filter(Boolean).join(' ');
          if (name) names[String(p.user_id)] = name;
        });
        setCounselorNames(names);
      }
    } catch (error) {
      console.error('Error loading shortlists:', error);
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    if (!user) return;
    void load();
    // Your counsellor may start or move an application while you are here.
    const poll = window.setInterval(() => void load(), 20000);
    return () => window.clearInterval(poll);
  }, [user, load]);

  const items = useMemo<Item[]>(() => {
    const list: Item[] = shortlists.map((row) => ({ kind: 'shortlist', key: `s-${row.id}`, row }));
    // A saved university already on the shortlist is shown once, as the shortlist entry.
    const onList = new Set(shortlists.map((row) => String(row.university_id || '')));
    const onListNames = new Set(shortlists.map((row) => String(row.university_name || '').trim().toLowerCase()));
    saved
      .filter((uni) => !onList.has(uni.id) && !onListNames.has(uni.name.trim().toLowerCase()))
      .forEach((uni) => list.push({ kind: 'saved', key: `f-${uni.id}`, uni }));
    return list;
  }, [shortlists, saved]);

  // A: the student's own interest (heart or own pick). B: the counselor's recommendations.
  const groups = useMemo(() => {
    const mine: Item[] = [];
    const recommended: Item[] = [];
    for (const item of items) {
      if (item.kind === 'saved' || item.row.source === 'student') mine.push(item);
      else recommended.push(item);
    }
    return { mine, recommended };
  }, [items]);

  const applicationFor = (row: ShortlistRow) => {
    const linked = applications.find((app) =>
      (row.application_id && app.id === row.application_id)
      || String(app.shortlist_id || '') === row.id,
    );
    if (linked) return linked;
    // Legacy rows may predate application_id. Recover only when the stable
    // university id identifies exactly one of this student's applications.
    if (!row.university_id) return null;
    const matches = applications.filter((app) => String(app.university_id || '') === String(row.university_id));
    return matches.length === 1 ? matches[0] : null;
  };

  const run = async (key: string, action: () => Promise<unknown>, done: string) => {
    setBusyKey(key);
    try {
      await action();
      toast({ title: done });
      await load();
    } catch (error: any) {
      toast({ title: 'Could not save that', description: error?.message || 'Please try again.', variant: 'destructive' });
    } finally {
      setBusyKey('');
    }
  };

  const accept = (item: Item) => item.kind === 'saved'
    ? run(item.key, () => shortlistMyPick({
        university_id: item.uni.id,
        university_name: item.uni.name,
        location: [item.uni.city, item.uni.country].filter(Boolean).join(', '),
      }), 'Sent to your counsellor - they will decide whether to start an application')
    : run(item.key, () => decideShortlist(item.row.id, 'accept'), 'Accepted - your counsellor will decide whether to start an application');

  const decline = (item: Item) => item.kind === 'saved'
    ? run(item.key, async () => {
        const { error } = await supabase.from('user_favorites').delete().eq('user_id', user!.id).eq('university_id', item.uni.id);
        if (error) throw error;
      }, 'Removed from your list')
    : run(item.key, () => decideShortlist(item.row.id, 'decline'), 'Marked as not interested');

  const undo = (item: Item) => item.kind === 'shortlist'
    ? run(item.key, () => decideShortlist(item.row.id, 'undo'), 'Moved back to your decisions')
    : Promise.resolve();

  // Start Application never creates an application. Before consent it explains why; after consent it asks the counselor.
  const startApplication = async (row: ShortlistRow) => {
    const setNotice = (message: string) => setNotices((current) => ({ ...current, [row.id]: message }));
    const consented = row.student_consent || String(row.status || '').toLowerCase() === 'consented';
    if (!consented) {
      setNotice('Please give your consent for this university first. Your counselor can start the application once you have.');
      return;
    }
    setNotice('');
    setBusyKey(`s-${row.id}`);
    try {
      await requestApplicationStart(row.id);
      toast({ title: 'Request sent', description: 'Your counselor has been asked to start this application.' });
      await load();
    } catch (error: any) {
      setNotice(error?.message || 'Could not send your request. Please try again.');
    } finally {
      setBusyKey('');
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-[400px] items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-b-2 border-primary" />
      </div>
    );
  }

  const title = (item: Item) => item.kind === 'saved' ? item.uni.name : (item.row.university_name || 'University');
  const subtitle = (item: Item) => item.kind === 'saved'
    ? [item.uni.city, item.uni.country].filter(Boolean).join(', ')
    : [item.row.course_name, item.row.location].filter(Boolean).join(' • ');
  const sourceLabel = (item: Item) => {
    if (item.kind === 'saved') return 'Saved by you';
    if (item.row.source === 'student') return 'Your pick';
    const name = counselorNames[String(item.row.source_counselor_id || item.row.counselor_id || '')];
    return name ? `Recommended by ${name}` : 'Recommended by your counsellor';
  };

  const renderRecommended = (item: Item) => {
    if (item.kind !== 'shortlist') return null;
    const row = item.row;
    const app = applicationFor(row);
    return (
      <RecommendedUniversityCard
        key={item.key}
        row={row}
        details={catalog[row.id]}
        application={app ? { id: app.id, status: app.status } : null}
        busy={busyKey === item.key}
        notice={notices[row.id]}
        onGiveConsent={() => { setNotices((c) => ({ ...c, [row.id]: '' })); void accept(item); }}
        onWithdrawConsent={() => { setNotices((c) => ({ ...c, [row.id]: '' })); void undo(item); }}
        onNotInterested={() => void decline(item)}
        onStartApplication={() => void startApplication(row)}
        onView={() => setViewing(row)}
      />
    );
  };

  const renderCard = (item: Item) => {
    const busy = busyKey === item.key;
    const state = item.kind === 'saved' ? 'pending' : decisionOf(item.row);
    const app = item.kind === 'shortlist' ? applicationFor(item.row) : null;
    const applicationStatus = app?.status || (item.kind === 'shortlist' ? item.row.application_status || null : null);
    return (
      <Card key={item.key} className="glass-card">
        <CardContent className="flex flex-wrap items-center gap-4 p-4">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-primary/10">
            <GraduationCap className="h-5 w-5 text-primary" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="font-semibold leading-snug">{title(item)}</p>
            {subtitle(item) ? <p className="text-sm text-muted-foreground">{subtitle(item)}</p> : null}
            <div className="mt-1 flex flex-wrap gap-2">
              <Badge variant="outline">{sourceLabel(item)}</Badge>
              {item.kind === 'saved' ? <Badge variant="secondary">Saved - not an application</Badge> : null}
              {item.kind === 'shortlist' && state === 'pending' ? <Badge variant="secondary">Waiting for your decision</Badge> : null}
              {state === 'accepted' ? <Badge className="bg-emerald-600 text-white">Interested - waiting for your counselor</Badge> : null}
              {state === 'applied' ? (
                <Badge className="bg-purple-600 text-white">{statusInfo(applicationStatus || 'in_progress').label}</Badge>
              ) : null}
              {state === 'declined' ? <Badge variant="secondary">Not interested</Badge> : null}
            </div>
            {state === 'applied' ? (
              <p className="mt-2 text-sm text-muted-foreground">
                {statusInfo(applicationStatus || 'in_progress').summary}{' '}
                <Link className="font-medium text-primary underline" to={`/student/applications${app ? `#${encodeURIComponent(app.id)}` : ''}`}>View application</Link>
              </p>
            ) : null}
            {item.kind === 'shortlist' && state !== 'applied' && item.row.counselor_notes && item.row.source !== 'student' ? (
              <p className="mt-2 line-clamp-2 text-sm text-muted-foreground">Counselor: {item.row.counselor_notes}</p>
            ) : null}
            {item.kind === 'shortlist' && safeDate(item.row.application_deadline) && state !== 'applied' ? (
              <p className="mt-1 text-xs text-muted-foreground">Deadline: {safeDate(item.row.application_deadline)}</p>
            ) : null}
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" data-testid="view-university" onClick={() => setDetails(item)}>
              <Info className="mr-1 h-4 w-4" /> View University
            </Button>
            {state === 'pending' ? (
              <>
                <Button
                  size="icon"
                  aria-label="Go ahead with this university"
                  title="Go ahead — my counsellor can start the application"
                  disabled={busy}
                  className="h-9 w-9 rounded-full bg-emerald-600 text-white hover:bg-emerald-700"
                  onClick={() => void accept(item)}
                >
                  <Check className="h-5 w-5" />
                </Button>
                <Button
                  size="icon"
                  aria-label="Not interested"
                  title="Not interested"
                  disabled={busy}
                  className="h-9 w-9 rounded-full bg-rose-600 text-white hover:bg-rose-700"
                  onClick={() => void decline(item)}
                >
                  <X className="h-5 w-5" />
                </Button>
              </>
            ) : null}
            {state === 'accepted' || state === 'declined' ? (
              <Button variant="ghost" size="sm" disabled={busy} onClick={() => void undo(item)} title="Change my mind">
                <RotateCcw className="mr-1 h-4 w-4" /> Change
              </Button>
            ) : null}
          </div>
        </CardContent>
      </Card>
    );
  };

  const detailRow = details?.kind === 'shortlist' ? details.row : null;
  const detailApp = detailRow ? applicationFor(detailRow) : null;

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-gradient-primary">
          <GraduationCap className="h-6 w-6 text-white" />
        </div>
        <div>
          <h1 className="text-3xl font-bold">My Shortlists</h1>
          <p className="text-muted-foreground">
            Universities you are interested in. These are not applications. For your counselor's recommendations, give your consent when you want them to go ahead. For your own picks, tick <span className="font-medium text-emerald-700">&#10003;</span> the ones you want to
            go ahead with, or cross <span className="font-medium text-rose-700">&#10007;</span> the ones you don&apos;t. Only your counselor can start an application, and
            it then appears under <Link to="/student/applications" className="font-medium text-primary underline">My Applications</Link>.
          </p>
        </div>
      </div>

      <section className="space-y-3" aria-labelledby="shortlist-mine">
        <h2 id="shortlist-mine" className="text-lg font-semibold">Saved by you / your interests ({groups.mine.length})</h2>
        {groups.mine.length === 0 ? (
          <Card className="glass-card">
            <CardContent className="flex flex-wrap items-center justify-between gap-3 py-6">
              <p className="text-sm text-muted-foreground">Universities you save with the heart, or pick yourself, appear here.</p>
              <Button asChild variant="outline" size="sm"><Link to="/student/universities">Browse universities</Link></Button>
            </CardContent>
          </Card>
        ) : groups.mine.map(renderCard)}
      </section>

      <section className="space-y-3" aria-labelledby="shortlist-recommended">
        <h2 id="shortlist-recommended" className="text-lg font-semibold">Recommended by your counselor ({groups.recommended.length})</h2>
        {groups.recommended.length === 0 ? (
          <Card className="glass-card">
            <CardContent className="flex flex-wrap items-center justify-between gap-3 py-6">
              <p className="text-sm text-muted-foreground">Your counselor&apos;s recommendations will appear here.</p>
              <Button asChild variant="outline" size="sm"><Link to="/student/messages">Message your advisor</Link></Button>
            </CardContent>
          </Card>
        ) : groups.recommended.map(renderRecommended)}
      </section>

      <UniversityDetailsDialog
        open={Boolean(viewing)}
        onOpenChange={(open) => { if (!open) setViewing(null); }}
        row={viewing}
        details={viewing ? catalog[viewing.id] : null}
      />

      <Dialog open={Boolean(details)} onOpenChange={(open) => { if (!open) setDetails(null); }}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl" data-testid="university-panel">
          {details ? (
            <>
              <DialogHeader>
                <DialogTitle>{title(details)}</DialogTitle>
                <DialogDescription>{sourceLabel(details)}</DialogDescription>
              </DialogHeader>
              <div className="space-y-3 text-sm">
                <section data-testid="published-university-info">
                  <UniversityInfoView universityId={details.kind === 'saved' ? details.uni.id : (details.row.university_id || catalog[details.row.id]?.university_id || null)} />
                </section>
                {details.kind === 'shortlist' && details.row.course_name ? (
                  <p className="flex items-start gap-2"><GraduationCap className="mt-0.5 h-4 w-4 shrink-0" /> {details.row.course_name}</p>
                ) : null}
                {subtitle(details) && details.kind === 'saved' ? (
                  <p className="flex items-start gap-2"><MapPin className="mt-0.5 h-4 w-4 shrink-0" /> {subtitle(details)}</p>
                ) : null}
                {detailRow?.location ? (
                  <p className="flex items-start gap-2"><MapPin className="mt-0.5 h-4 w-4 shrink-0" /> {detailRow.location}</p>
                ) : null}
                {detailRow?.estimated_fees ? (
                  <p className="flex items-start gap-2"><DollarSign className="mt-0.5 h-4 w-4 shrink-0" /> Estimated fees: {Number(detailRow.estimated_fees).toLocaleString()}</p>
                ) : null}
                {safeDate(detailRow?.application_deadline) ? (
                  <p className="flex items-start gap-2"><Calendar className="mt-0.5 h-4 w-4 shrink-0" /> Application deadline: {safeDate(detailRow?.application_deadline)}</p>
                ) : null}
                {safeDate(detailRow?.shortlisted_at || detailRow?.created_at) ? (
                  <p className="flex items-start gap-2"><User className="mt-0.5 h-4 w-4 shrink-0" /> Added on {safeDate(detailRow?.shortlisted_at || detailRow?.created_at)}</p>
                ) : null}
                {detailRow?.counselor_notes ? (
                  <div className="rounded-md bg-muted/50 p-3">
                    <p className="mb-1 font-medium">Why your counsellor suggests it</p>
                    <p>{detailRow.counselor_notes}</p>
                  </div>
                ) : null}
                {detailApp ? (
                  <div className="rounded-md border p-3">
                    <p className="font-medium">{statusInfo(detailApp.status).label}</p>
                    {detailApp.counselor_comments ? <p className="mt-1 text-muted-foreground">{detailApp.counselor_comments}</p> : null}
                    {safeDate(detailApp.updated_at) ? <p className="mt-1 text-xs text-muted-foreground">Updated {safeDate(detailApp.updated_at)}</p> : null}
                    <Link className="mt-2 inline-block text-primary underline" to={`/student/applications#${encodeURIComponent(detailApp.id)}`}>View application</Link>
                  </div>
                ) : null}
                {details.kind === 'saved' && details.uni.website_url ? (
                  <a href={details.uni.website_url} target="_blank" rel="noopener noreferrer" className="text-primary underline">
                    University website
                  </a>
                ) : null}
                {detailRow?.course_link ? (
                  <a href={detailRow.course_link} target="_blank" rel="noopener noreferrer" className="text-primary underline">
                    Course page
                  </a>
                ) : null}
              </div>
            </>
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}
