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
import { decideShortlist, shortlistMyPick } from '@student/lib/shortlistDecisions';

/**
 * My Shortlists — one list of every university on the table for this student:
 * the ones their counsellor recommends, the ones they picked themselves, and
 * the ones they saved with the heart. Each gets a green tick (go ahead) or a
 * red cross (not interested). A tick hands it to the counsellor, who starts
 * and runs the application; the student follows its progress here. There is
 * no student application form any more.
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
  shortlisted_at: string | null;
  created_at: string | null;
  course_link?: string | null;
};

type SavedUniversity = { id: string; name: string; country: string; city: string | null; website_url: string | null };

type ApplicationRow = { id: string; shortlist_id?: string | null; university_id?: string | null; university_name?: string | null; status: string; counselor_comments?: string | null; updated_at?: string | null; created_at?: string | null };

type Item =
  | { kind: 'shortlist'; key: string; row: ShortlistRow }
  | { kind: 'saved'; key: string; uni: SavedUniversity };

const APPLICATION_LABELS: Record<string, string> = {
  in_progress: 'Application in progress',
  submitted_to_university: 'Submitted to the university',
  offer_received: 'Offer received 🎉',
  offer_accepted: 'Offer accepted',
  enrolled: 'Enrolled',
  rejected: 'Not successful this time',
  withdrawn: 'Withdrawn',
  counselor_approved: 'Approved',
  returned: 'Returned by your counsellor',
  pending_counselor: 'With your counsellor',
  submitted: 'With your counsellor',
  draft: 'Draft',
};

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

  const groups = useMemo(() => {
    const pending: Item[] = [];
    const going: Item[] = [];
    const declined: Item[] = [];
    for (const item of items) {
      if (item.kind === 'saved') { pending.push(item); continue; }
      const state = decisionOf(item.row);
      if (state === 'declined') declined.push(item);
      else if (state === 'pending') pending.push(item);
      else going.push(item);
    }
    return { pending, going, declined };
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
      }), 'Sent to your counsellor — they will start the application')
    : run(item.key, () => decideShortlist(item.row.id, 'accept'), 'Accepted — your counsellor will start the application');

  const decline = (item: Item) => item.kind === 'saved'
    ? run(item.key, async () => {
        const { error } = await supabase.from('user_favorites').delete().eq('user_id', user!.id).eq('university_id', item.uni.id);
        if (error) throw error;
      }, 'Removed from your list')
    : run(item.key, () => decideShortlist(item.row.id, 'decline'), 'Marked as not interested');

  const undo = (item: Item) => item.kind === 'shortlist'
    ? run(item.key, () => decideShortlist(item.row.id, 'undo'), 'Moved back to your decisions')
    : Promise.resolve();

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
              {state === 'accepted' ? <Badge className="bg-emerald-600 text-white">Accepted — your counsellor will start it</Badge> : null}
              {state === 'applied' ? (
                <Badge className="bg-purple-600 text-white">{APPLICATION_LABELS[applicationStatus || 'in_progress'] || 'Application in progress'}</Badge>
              ) : null}
              {state === 'declined' ? <Badge variant="secondary">Not interested</Badge> : null}
            </div>
            {state === 'applied' && app?.counselor_comments ? (
              <p className="mt-2 text-sm text-muted-foreground">Counsellor: {app.counselor_comments}</p>
            ) : null}
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => setDetails(item)}>
              <Info className="mr-1 h-4 w-4" /> View information
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
            Tick <span className="font-medium text-emerald-700">✓</span> the universities you want to go ahead with, or
            cross <span className="font-medium text-rose-700">✗</span> the ones you don&apos;t. Your counsellor starts the application for every tick.
          </p>
        </div>
      </div>

      {items.length === 0 ? (
        <Card className="glass-card">
          <CardContent className="py-12 text-center">
            <GraduationCap className="mx-auto mb-4 h-16 w-16 text-muted-foreground opacity-50" />
            <h3 className="mb-2 text-lg font-semibold">Nothing here yet</h3>
            <p className="mb-4 text-muted-foreground">
              Shortlist universities on the Universities page, or wait for your counsellor&apos;s recommendations.
            </p>
            <div className="flex flex-wrap justify-center gap-2">
              <Button asChild><Link to="/student/universities">Browse universities</Link></Button>
              <Button asChild variant="outline"><Link to="/student/messages">Message your advisor</Link></Button>
            </div>
          </CardContent>
        </Card>
      ) : null}

      {groups.pending.length > 0 ? (
        <section className="space-y-3">
          <h2 className="text-lg font-semibold">Waiting for your decision ({groups.pending.length})</h2>
          {groups.pending.map(renderCard)}
        </section>
      ) : null}

      {groups.going.length > 0 ? (
        <section className="space-y-3">
          <h2 className="text-lg font-semibold">Going ahead ({groups.going.length})</h2>
          {groups.going.map(renderCard)}
        </section>
      ) : null}

      {groups.declined.length > 0 ? (
        <section className="space-y-3">
          <h2 className="text-lg font-semibold text-muted-foreground">Not interested ({groups.declined.length})</h2>
          {groups.declined.map(renderCard)}
        </section>
      ) : null}

      <Dialog open={Boolean(details)} onOpenChange={(open) => { if (!open) setDetails(null); }}>
        <DialogContent>
          {details ? (
            <>
              <DialogHeader>
                <DialogTitle>{title(details)}</DialogTitle>
                <DialogDescription>{sourceLabel(details)}</DialogDescription>
              </DialogHeader>
              <div className="space-y-3 text-sm">
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
                    <p className="font-medium">{APPLICATION_LABELS[detailApp.status] || detailApp.status}</p>
                    {detailApp.counselor_comments ? <p className="mt-1 text-muted-foreground">{detailApp.counselor_comments}</p> : null}
                    {safeDate(detailApp.updated_at) ? <p className="mt-1 text-xs text-muted-foreground">Updated {safeDate(detailApp.updated_at)}</p> : null}
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
