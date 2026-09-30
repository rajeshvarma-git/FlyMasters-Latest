import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  ArrowRight,
  Clock,
  ExternalLink,
  FileText,
  GraduationCap,
  Heart,
  List,
  MapPin,
  Pencil,
  Plane,
  Sparkles,
} from 'lucide-react';
import { useAuth } from '@student/hooks/useAuth';
import { supabase } from '@student/integrations/supabase/client';
import { useToast } from '@student/hooks/use-toast';
import { getMyRecommendations, type MyRecommendations, type RecommendedUniversity } from '@student/lib/caseChatApi';
import { studentDisplayName } from './studentIdentity';

/**
 * Student home, kept deliberately simple:
 *   1. who they are and what they're aiming for (from their profile),
 *   2. ONE next step,
 *   3. the universities the AI advisor matched for them — the same list the
 *      chat shows (GET /api/case/me/recommendations), with Save,
 *   4. three counters: saved, documents, applications.
 */

type Counts = { profileMissing: string[]; saved: number; documents: number; applications: number };

const PROFILE_FIELDS: [string, string][] = [
  ['first_name', 'first name'],
  ['last_name', 'last name'],
  ['phone', 'phone number'],
  ['date_of_birth', 'date of birth'],
  ['passport_number', 'passport number'],
];

function greeting() {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  return 'Good evening';
}

type Step = { title: string; detail: string; action: string; to: string };

function nextStep(rec: MyRecommendations | null, counts: Counts | null): Step | null {
  if (!rec || !counts) return null;
  if (rec.missing.length) {
    return {
      title: 'Finish your chat with the AI advisor',
      detail: `It still needs your ${rec.missing.join(', ')} to match universities for you.`,
      action: 'Open chat',
      to: '/student/messages',
    };
  }
  if (counts.profileMissing.length) {
    return {
      title: 'Complete your profile',
      detail: `Add your ${counts.profileMissing.slice(0, 2).join(' and ')} so your counselor can start your applications.`,
      action: 'Edit profile',
      to: '/student/profile',
    };
  }
  if (counts.documents === 0) {
    return {
      title: 'Upload your documents',
      detail: 'Passport, mark sheets and test scores — your counselor needs them to apply.',
      action: 'Upload',
      to: '/student/documents',
    };
  }
  if (counts.applications === 0) {
    return {
      title: 'Talk to your advisor about applying',
      detail: 'Save the universities you like below, then ask your advisor to start the applications.',
      action: 'Message advisor',
      to: '/student/messages',
    };
  }
  return {
    title: 'Track your applications',
    detail: 'See where each application stands and what is still needed.',
    action: 'View applications',
    to: '/student/applications',
  };
}

function UniversityCard({ uni, onToggle }: { uni: RecommendedUniversity; onToggle: () => void }) {
  return (
    <div className="flex flex-col rounded-xl border border-border/60 bg-card p-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-semibold leading-snug">{uni.name}</p>
          <p className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground">
            <MapPin className="h-3 w-3 shrink-0" /> {uni.location}
          </p>
        </div>
        <button
          type="button"
          onClick={onToggle}
          aria-label={uni.saved ? `Remove ${uni.name} from saved` : `Save ${uni.name}`}
          className={`inline-flex shrink-0 items-center gap-1 rounded-lg border px-2.5 py-1.5 text-xs font-semibold ${
            uni.saved ? 'border-rose-200 bg-rose-50 text-rose-600' : 'border-border hover:bg-muted'
          }`}
        >
          <Heart className={`h-3.5 w-3.5 ${uni.saved ? 'fill-rose-500 text-rose-500' : ''}`} />
          {uni.saved ? 'Saved' : 'Save'}
        </button>
      </div>
      <div className="mt-3 space-y-1.5 text-xs text-muted-foreground">
        <p className="flex items-center gap-1.5">
          <GraduationCap className="h-3.5 w-3.5 shrink-0 text-primary" />
          <span className="text-foreground">{uni.programs[0]}</span> · {uni.duration}
        </p>
        <p className="flex items-center gap-1.5">
          <Plane className="h-3.5 w-3.5 shrink-0 text-primary" /> {uni.postStudyVisa}
        </p>
        <p className="flex items-center gap-1.5">
          <Clock className="h-3.5 w-3.5 shrink-0 text-primary" /> {uni.deadline} · {uni.languageReq}
        </p>
      </div>
      <div className="mt-auto flex items-center justify-between pt-3 text-xs">
        <span className="rounded-full bg-muted px-2 py-0.5 text-muted-foreground">{uni.ranking}</span>
        {uni.website && (
          <a href={uni.website} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 font-medium text-primary hover:underline">
            Website <ExternalLink className="h-3 w-3" />
          </a>
        )}
      </div>
    </div>
  );
}

export function StudentDashboard() {
  const { user, userProfile } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [rec, setRec] = useState<MyRecommendations | null>(null);
  const [recError, setRecError] = useState('');
  const [counts, setCounts] = useState<Counts | null>(null);
  const name = studentDisplayName(user, userProfile).split(/\s+/)[0];

  const loadCounts = useCallback(async () => {
    if (!user) return;
    const [profileRes, favRes, docRes, appRes] = await Promise.all([
      supabase.from('profiles').select('*').eq('user_id', user.id).maybeSingle(),
      supabase.from('user_favorites').select('id', { count: 'exact' }).eq('user_id', user.id),
      supabase.from('documents').select('id', { count: 'exact' }).eq('user_id', user.id),
      supabase.from('applications').select('id', { count: 'exact' }).eq('user_id', user.id),
    ]);
    const p = (profileRes.data || {}) as Record<string, unknown>;
    setCounts({
      profileMissing: PROFILE_FIELDS.filter(([k]) => !String(p[k] || '').trim()).map(([, label]) => label),
      saved: favRes.count || 0,
      documents: docRes.count || 0,
      applications: appRes.count || 0,
    });
  }, [user]);

  useEffect(() => {
    if (!user) return;
    getMyRecommendations()
      .then(setRec)
      .catch((e) => setRecError(e instanceof Error ? e.message : 'Could not load your recommendations'));
    loadCounts().catch(() => {});
  }, [user, loadCounts]);

  const toggleSave = async (uni: RecommendedUniversity) => {
    if (!user) return;
    const next = !uni.saved;
    const flip = (value: boolean) =>
      setRec((r) => r && { ...r, universities: r.universities.map((u) => (u.id === uni.id ? { ...u, saved: value } : u)) });
    flip(next);
    try {
      const { error } = next
        ? await supabase.from('user_favorites').insert({ user_id: user.id, university_id: uni.id })
        : await supabase.from('user_favorites').delete().eq('user_id', user.id).eq('university_id', uni.id);
      if (error) throw error;
      setCounts((c) => c && { ...c, saved: Math.max(0, c.saved + (next ? 1 : -1)) });
      toast({ title: next ? `Saved ${uni.name}` : `Removed ${uni.name}` });
    } catch {
      flip(!next);
      toast({ title: 'Could not update your saved universities', variant: 'destructive' });
    }
  };

  const step = nextStep(rec, counts);
  const known = rec?.known;
  const plan = known
    ? [
        known.country && { label: 'Destination', value: known.country },
        known.qualification && { label: 'Level', value: known.qualification },
        known.field && { label: 'Field', value: known.field },
        known.budget && { label: 'Budget', value: known.budget },
      ].filter(Boolean) as { label: string; value: string }[]
    : [];
  const unis = rec?.universities || [];

  return (
    <div className="mx-auto max-w-5xl space-y-6 min-w-0">
      {/* 1. Greeting + plan */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-2xl md:text-3xl font-bold">
            {greeting()}, {name} 👋
          </h1>
          {plan.length > 0 ? (
            <div className="mt-2 flex flex-wrap items-center gap-1.5">
              {plan.map((p) => (
                <span key={p.label} className="rounded-full bg-muted px-2.5 py-1 text-xs">
                  <span className="text-muted-foreground">{p.label}:</span> <span className="font-medium">{p.value}</span>
                </span>
              ))}
              <Link to="/student/profile" className="inline-flex items-center gap-1 px-1.5 text-xs font-medium text-primary hover:underline">
                <Pencil className="h-3 w-3" /> Edit
              </Link>
            </div>
          ) : (
            <p className="mt-1 text-sm text-muted-foreground">Tell us where you want to study and we'll match universities for you.</p>
          )}
        </div>
        <button
          type="button"
          onClick={() => navigate('/student/messages')}
          className="inline-flex items-center gap-2 rounded-xl bg-gradient-primary px-4 py-2 text-sm font-semibold text-white shadow-sm hover:opacity-95"
        >
          <Sparkles className="h-4 w-4" /> Ask your AI advisor
        </button>
      </div>

      {/* 2. One next step */}
      {step ? (
        <Link
          to={step.to}
          className="flex items-center justify-between gap-4 rounded-2xl bg-gradient-to-r from-sky-600 to-indigo-600 p-5 text-white shadow-sm hover:opacity-95"
        >
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-wide text-white/75">Your next step</p>
            <p className="mt-1 text-lg font-semibold">{step.title}</p>
            <p className="mt-0.5 text-sm text-white/85">{step.detail}</p>
          </div>
          <span className="inline-flex shrink-0 items-center gap-1.5 rounded-xl bg-white px-4 py-2 text-sm font-semibold text-indigo-700">
            {step.action} <ArrowRight className="h-4 w-4" />
          </span>
        </Link>
      ) : (
        <div className="h-[104px] animate-pulse rounded-2xl bg-muted" />
      )}

      {/* 3. Recommended universities (same as the chat) */}
      <section>
        <div className="mb-3 flex items-end justify-between gap-2">
          <div>
            <h2 className="text-lg font-semibold">Recommended for you</h2>
            <p className="text-xs text-muted-foreground">Matched by your AI advisor from your profile — save the ones you like.</p>
          </div>
          <Link to="/student/universities" className="shrink-0 text-sm font-medium text-primary hover:underline">
            All universities →
          </Link>
        </div>
        {!rec && !recError && (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {[0, 1, 2].map((i) => <div key={i} className="h-44 animate-pulse rounded-xl bg-muted" />)}
          </div>
        )}
        {recError && <p className="rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground">{recError}</p>}
        {rec && unis.length === 0 && (
          <div className="rounded-xl border border-dashed p-6 text-center">
            <GraduationCap className="mx-auto h-8 w-8 text-muted-foreground" />
            <p className="mt-2 text-sm font-medium">
              {rec.missing.length
                ? 'Your matches will appear here once the AI advisor knows a little more about you.'
                : `We don't have universities in ${known?.country || 'your destination'} listed yet.`}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              {rec.missing.length ? 'It only takes a minute in the chat.' : 'Your counselor will build a shortlist for you.'}
            </p>
            <button
              type="button"
              onClick={() => navigate('/student/messages')}
              className="mt-3 rounded-lg border px-3 py-1.5 text-sm font-medium hover:bg-muted"
            >
              {rec.missing.length ? 'Open the chat' : 'Message your advisor'}
            </button>
          </div>
        )}
        {unis.length > 0 && (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {unis.map((u) => (
              <UniversityCard key={u.id} uni={u} onToggle={() => toggleSave(u)} />
            ))}
          </div>
        )}
      </section>

      {/* 4. Counters */}
      <div className="grid grid-cols-3 gap-3">
        {[
          { icon: Heart, label: 'Saved universities', value: counts?.saved, to: '/student/universities' },
          { icon: FileText, label: 'Documents', value: counts?.documents, to: '/student/documents' },
          { icon: List, label: 'Applications', value: counts?.applications, to: '/student/applications' },
        ].map((s) => (
          <Link key={s.label} to={s.to} className="rounded-xl border border-border/60 bg-card p-4 shadow-sm hover:bg-muted/40">
            <s.icon className="h-4 w-4 text-primary" />
            <p className="mt-2 text-2xl font-bold leading-none">{s.value ?? '—'}</p>
            <p className="mt-1 text-xs text-muted-foreground">{s.label}</p>
          </Link>
        ))}
      </div>
    </div>
  );
}
