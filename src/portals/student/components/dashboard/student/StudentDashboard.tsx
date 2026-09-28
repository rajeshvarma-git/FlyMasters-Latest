import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { formatDistanceToNow } from 'date-fns';
import {
  ArrowRight,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  FileText,
  GraduationCap,
  Heart,
  List,
  MapPin,
  MessageCircle,
  Newspaper,
  Sparkles,
  User,
} from 'lucide-react';
import { useAuth } from '@student/hooks/useAuth';
import { supabase } from '@student/integrations/supabase/client';
import { useToast } from '@student/hooks/use-toast';
import { getStudentFeed, type FeedNews, type FeedUniversity, type StudentFeed } from '@student/lib/caseChatApi';
import { studentDisplayName } from './studentIdentity';

/**
 * Student home, laid out like a news start page: a big photo carousel of the
 * student's recommended universities with each one's latest headline, a
 * "Top stories" column (university news + destination student-visa news),
 * a "Your journey" progress card, and photo cards for the rest. Photos and
 * news come from GET /api/student/feed (server/routes/studentFeed.mjs).
 */

type Journey = {
  profilePct: number;
  missing: string[];
  saved: number;
  documents: number;
  applications: number;
};

const PROFILE_FIELDS: [string, string][] = [
  ['first_name', 'first name'],
  ['last_name', 'last name'],
  ['phone', 'phone'],
  ['country', 'country'],
  ['date_of_birth', 'date of birth'],
  ['passport_number', 'passport number'],
];

function ago(value: string | null) {
  if (!value) return '';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  try {
    return formatDistanceToNow(d, { addSuffix: true });
  } catch {
    return '';
  }
}

function greeting() {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  return 'Good evening';
}

function initials(name: string) {
  return name
    .split(/\s+/)
    .filter((w) => /^[A-Z]/.test(w))
    .slice(0, 3)
    .map((w) => w[0])
    .join('');
}

const FALLBACK_BG = [
  'from-sky-600 to-indigo-700',
  'from-emerald-600 to-teal-700',
  'from-violet-600 to-fuchsia-700',
  'from-amber-500 to-orange-600',
  'from-rose-500 to-pink-600',
];

function Photo({ uni, index, className = '' }: { uni: FeedUniversity; index: number; className?: string }) {
  const [broken, setBroken] = useState(false);
  if (uni.image && !broken) {
    return (
      <img
        src={uni.image}
        alt={`${uni.name} campus`}
        loading="lazy"
        referrerPolicy="no-referrer"
        onError={() => setBroken(true)}
        className={`h-full w-full object-cover ${className}`}
      />
    );
  }
  return (
    <div className={`flex h-full w-full items-center justify-center bg-gradient-to-br ${FALLBACK_BG[index % FALLBACK_BG.length]} ${className}`}>
      <span className="text-4xl font-black tracking-tight text-white/80">{initials(uni.name) || 'U'}</span>
    </div>
  );
}

function StoryRow({ story }: { story: FeedNews }) {
  return (
    <a href={story.link} target="_blank" rel="noopener noreferrer" className="group block py-3">
      {story.topic && <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-primary">{story.topic}</p>}
      <p className="line-clamp-2 text-sm font-medium leading-snug group-hover:text-primary group-hover:underline">{story.title}</p>
      <p className="mt-1 text-xs text-muted-foreground">
        {story.source}
        {story.published_at ? ` · ${ago(story.published_at)}` : ''}
      </p>
    </a>
  );
}

export function StudentDashboard() {
  const { user, userProfile } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [feed, setFeed] = useState<StudentFeed | null>(null);
  const [feedError, setFeedError] = useState('');
  const [journey, setJourney] = useState<Journey | null>(null);
  const [slide, setSlide] = useState(0);
  const [paused, setPaused] = useState(false);
  const name = studentDisplayName(user, userProfile).split(/\s+/)[0];

  const loadJourney = useCallback(async () => {
    if (!user) return;
    const [profileRes, favRes, docRes, appRes] = await Promise.all([
      supabase.from('profiles').select('*').eq('user_id', user.id).maybeSingle(),
      supabase.from('user_favorites').select('id', { count: 'exact' }).eq('user_id', user.id),
      supabase.from('documents').select('id', { count: 'exact' }).eq('user_id', user.id),
      supabase.from('applications').select('id', { count: 'exact' }).eq('user_id', user.id),
    ]);
    const p = (profileRes.data || {}) as Record<string, unknown>;
    const missing = PROFILE_FIELDS.filter(([k]) => !String(p[k] || '').trim()).map(([, label]) => label);
    setJourney({
      profilePct: Math.round(((PROFILE_FIELDS.length - missing.length) / PROFILE_FIELDS.length) * 100),
      missing,
      saved: favRes.count || 0,
      documents: docRes.count || 0,
      applications: appRes.count || 0,
    });
  }, [user]);

  useEffect(() => {
    if (!user) return;
    getStudentFeed()
      .then(setFeed)
      .catch((e) => setFeedError(e instanceof Error ? e.message : 'Could not load your feed'));
    loadJourney().catch(() => {});
  }, [user, loadJourney]);

  const heroList = useMemo(() => (feed?.universities || []).slice(0, 5), [feed]);
  const cardList = useMemo(() => (feed?.universities || []).slice(0, 8), [feed]);

  useEffect(() => {
    if (paused || heroList.length < 2) return;
    const t = window.setInterval(() => setSlide((s) => (s + 1) % heroList.length), 7000);
    return () => window.clearInterval(t);
  }, [paused, heroList.length]);

  const toggleSave = async (uni: FeedUniversity) => {
    if (!user) return;
    const next = !uni.is_favorite;
    setFeed((f) => f && { ...f, universities: f.universities.map((u) => (u.id === uni.id ? { ...u, is_favorite: next } : u)) });
    try {
      if (next) {
        const { error } = await supabase.from('user_favorites').insert({ user_id: user.id, university_id: uni.id });
        if (error) throw error;
      } else {
        const { error } = await supabase.from('user_favorites').delete().eq('user_id', user.id).eq('university_id', uni.id);
        if (error) throw error;
      }
      setJourney((j) => j && { ...j, saved: Math.max(0, j.saved + (next ? 1 : -1)) });
      toast({ title: next ? `Saved ${uni.name}` : `Removed ${uni.name}` });
    } catch (error) {
      setFeed((f) => f && { ...f, universities: f.universities.map((u) => (u.id === uni.id ? { ...u, is_favorite: !next } : u)) });
      toast({ title: 'Could not update saved universities', variant: 'destructive' });
    }
  };

  const hero = heroList[slide % Math.max(heroList.length, 1)];
  const today = new Date().toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' });
  const loading = !feed && !feedError;

  return (
    <div className="mx-auto max-w-[1400px] space-y-5 min-w-0">
      {/* Greeting */}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{today}</p>
          <h1 className="text-2xl md:text-3xl font-bold">
            {greeting()}, {name} 👋
          </h1>
          <p className="text-sm text-muted-foreground">
            {feed?.countries?.length
              ? `Your picks for ${feed.countries.join(', ')}${feed.field ? ` · ${feed.field}` : ''}`
              : 'Tell us where you want to study to personalise this page'}
          </p>
        </div>
        <button
          type="button"
          onClick={() => navigate('/student/messages')}
          className="inline-flex items-center gap-2 rounded-xl bg-gradient-primary px-4 py-2 text-sm font-semibold text-white shadow-sm hover:opacity-95"
        >
          <Sparkles className="h-4 w-4" /> Ask your AI advisor
        </button>
      </div>

      {/* Hero + top stories */}
      <div className="grid gap-5 lg:grid-cols-3">
        <div
          className="relative h-64 overflow-hidden rounded-2xl bg-muted shadow-sm md:h-[380px] lg:col-span-2"
          onMouseEnter={() => setPaused(true)}
          onMouseLeave={() => setPaused(false)}
        >
          {loading && <div className="h-full w-full animate-pulse bg-muted" />}
          {!loading && !hero && (
            <div className="flex h-full flex-col items-center justify-center gap-3 bg-gradient-to-br from-sky-600 to-indigo-700 p-6 text-center text-white">
              <GraduationCap className="h-10 w-10" />
              <p className="text-xl font-semibold">Your university picks will appear here</p>
              <p className="max-w-md text-sm text-white/80">Tell our AI advisor your destination and course, and we'll show matching universities with their latest news.</p>
              <button type="button" onClick={() => navigate('/student/messages')} className="mt-1 rounded-lg bg-white px-4 py-2 text-sm font-semibold text-primary">
                Start with the AI advisor
              </button>
            </div>
          )}
          {hero && (
            <>
              <Photo uni={hero} index={slide} className="absolute inset-0 transition-transform duration-700" />
              <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/35 to-transparent" />
              <div className="absolute inset-x-0 bottom-0 p-5 md:p-7 text-white">
                <div className="mb-2 flex flex-wrap items-center gap-2 text-xs">
                  <span className="rounded-full bg-white/20 px-2.5 py-1 font-medium backdrop-blur-sm">
                    {hero.is_favorite ? 'Saved' : 'Recommended for you'}
                  </span>
                  {hero.ranking ? <span className="rounded-full bg-white/20 px-2.5 py-1 backdrop-blur-sm">Ranked #{hero.ranking}</span> : null}
                </div>
                <h2 className="text-2xl md:text-4xl font-bold leading-tight drop-shadow">{hero.name}</h2>
                <p className="mt-1 flex items-center gap-1 text-sm text-white/85">
                  <MapPin className="h-4 w-4" /> {[hero.city, hero.country].filter(Boolean).join(', ')}
                </p>
                {hero.news[0] ? (
                  <a href={hero.news[0].link} target="_blank" rel="noopener noreferrer" className="mt-3 block max-w-2xl hover:underline">
                    <span className="mr-2 rounded bg-primary px-1.5 py-0.5 text-[10px] font-bold uppercase">Latest</span>
                    <span className="text-sm md:text-base font-medium">{hero.news[0].title}</span>
                    <span className="ml-2 text-xs text-white/70">{hero.news[0].source} · {ago(hero.news[0].published_at)}</span>
                  </a>
                ) : hero.summary ? (
                  <p className="mt-3 line-clamp-2 max-w-2xl text-sm text-white/85">{hero.summary}</p>
                ) : null}
                <div className="mt-4 flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => toggleSave(hero)}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-white px-3 py-2 text-sm font-semibold text-slate-900 hover:bg-white/90"
                  >
                    <Heart className={`h-4 w-4 ${hero.is_favorite ? 'fill-rose-500 text-rose-500' : ''}`} />
                    {hero.is_favorite ? 'Saved' : 'Save'}
                  </button>
                  <button
                    type="button"
                    onClick={() => navigate('/student/messages')}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-white/40 px-3 py-2 text-sm font-semibold text-white hover:bg-white/10"
                  >
                    <MessageCircle className="h-4 w-4" /> Ask about it
                  </button>
                </div>
              </div>
              {hero.image_credit && hero.image && (
                <a href={hero.image_credit} target="_blank" rel="noopener noreferrer" className="absolute right-3 top-3 rounded bg-black/40 px-1.5 py-0.5 text-[10px] text-white/80 hover:text-white">
                  Photo: Wikipedia
                </a>
              )}
              {heroList.length > 1 && (
                <div className="absolute bottom-4 right-5 flex items-center gap-2">
                  <button
                    type="button"
                    aria-label="Previous"
                    onClick={() => setSlide((s) => (s - 1 + heroList.length) % heroList.length)}
                    className="rounded-full bg-black/35 p-1.5 text-white hover:bg-black/55"
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </button>
                  {heroList.map((u, i) => (
                    <button
                      key={u.id}
                      type="button"
                      aria-label={`Show ${u.name}`}
                      onClick={() => setSlide(i)}
                      className={`h-1.5 rounded-full transition-all ${i === slide % heroList.length ? 'w-6 bg-white' : 'w-1.5 bg-white/50'}`}
                    />
                  ))}
                  <button
                    type="button"
                    aria-label="Next"
                    onClick={() => setSlide((s) => (s + 1) % heroList.length)}
                    className="rounded-full bg-black/35 p-1.5 text-white hover:bg-black/55"
                  >
                    <ChevronRight className="h-4 w-4" />
                  </button>
                </div>
              )}
            </>
          )}
        </div>

        <div className="rounded-2xl border border-border/60 bg-card p-5 shadow-sm lg:h-[380px] lg:overflow-hidden flex flex-col">
          <div>
            <h3 className="flex items-center gap-2 font-semibold">
              <Newspaper className="h-4 w-4 text-primary" /> Top stories for you
            </h3>
            <p className="mt-0.5 text-[11px] text-muted-foreground">
              News about your universities and destination{feed?.generated_at ? ` · updated ${ago(feed.generated_at)}` : ''}
            </p>
          </div>
          <div className="mt-1 flex-1 divide-y overflow-y-auto pr-1">
            {loading && [0, 1, 2, 3].map((i) => <div key={i} className="my-3 h-12 animate-pulse rounded bg-muted" />)}
            {!loading && (feed?.stories || []).length === 0 && (
              <p className="py-6 text-sm text-muted-foreground">
                {feedError || 'News about your universities and destination will show here.'}
              </p>
            )}
            {(feed?.stories || []).slice(0, 6).map((s) => <StoryRow key={s.link} story={s} />)}
          </div>
        </div>
      </div>

      {/* Journey + university cards */}
      <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-2xl bg-gradient-to-br from-sky-600 to-indigo-700 p-5 text-white shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-wide text-white/80">Your journey</p>
          <div className="mt-3">
            <div className="flex items-end justify-between">
              <span className="text-sm">Profile</span>
              <span className="text-2xl font-bold">{journey ? `${journey.profilePct}%` : '—'}</span>
            </div>
            <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-white/25">
              <div className="h-full rounded-full bg-white" style={{ width: `${journey?.profilePct ?? 0}%` }} />
            </div>
          </div>
          <div className="mt-4 grid grid-cols-3 gap-2 text-center">
            {[
              { icon: Heart, label: 'Saved', value: journey?.saved, to: '/student/shortlists' },
              { icon: FileText, label: 'Documents', value: journey?.documents, to: '/student/documents' },
              { icon: List, label: 'Applications', value: journey?.applications, to: '/student/applications' },
            ].map((s) => (
              <Link key={s.label} to={s.to} className="rounded-xl bg-white/15 px-1 py-2 hover:bg-white/25">
                <s.icon className="mx-auto h-4 w-4" />
                <p className="mt-1 text-lg font-bold leading-none">{s.value ?? '—'}</p>
                <p className="mt-0.5 text-[10px] text-white/80">{s.label}</p>
              </Link>
            ))}
          </div>
          {journey && journey.missing.length > 0 ? (
            <Link to="/student/profile" className="mt-4 flex items-center justify-between rounded-xl bg-white px-3 py-2.5 text-sm font-semibold text-primary hover:bg-white/90">
              <span className="flex items-center gap-2"><User className="h-4 w-4" /> Add your {journey.missing[0]}</span>
              <ArrowRight className="h-4 w-4" />
            </Link>
          ) : (
            <Link to="/student/documents" className="mt-4 flex items-center justify-between rounded-xl bg-white px-3 py-2.5 text-sm font-semibold text-primary hover:bg-white/90">
              <span className="flex items-center gap-2"><FileText className="h-4 w-4" /> Upload your documents</span>
              <ArrowRight className="h-4 w-4" />
            </Link>
          )}
        </div>

        {loading &&
          [0, 1, 2].map((i) => <div key={i} className="h-[300px] animate-pulse rounded-2xl bg-muted" />)}

        {cardList.map((uni, i) => (
          <div key={uni.id} className="group flex flex-col overflow-hidden rounded-2xl border border-border/60 bg-card shadow-sm transition-shadow hover:shadow-md">
            <div className="relative h-40 overflow-hidden">
              <Photo uni={uni} index={i + 1} className="transition-transform duration-500 group-hover:scale-105" />
              <button
                type="button"
                onClick={() => toggleSave(uni)}
                aria-label={uni.is_favorite ? 'Remove from saved' : 'Save'}
                className="absolute right-2 top-2 rounded-full bg-white/90 p-2 shadow hover:bg-white"
              >
                <Heart className={`h-4 w-4 ${uni.is_favorite ? 'fill-rose-500 text-rose-500' : 'text-slate-700'}`} />
              </button>
              <span className="absolute bottom-2 left-2 rounded-full bg-black/50 px-2 py-0.5 text-[11px] text-white backdrop-blur-sm">
                {uni.country}
              </span>
            </div>
            <div className="flex flex-1 flex-col p-4">
              <p className="font-semibold leading-snug">{uni.name}</p>
              <p className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground">
                <MapPin className="h-3 w-3" /> {[uni.city, uni.country].filter(Boolean).join(', ')}
              </p>
              {uni.news[0] ? (
                <a href={uni.news[0].link} target="_blank" rel="noopener noreferrer" className="mt-3 block rounded-lg bg-muted/50 p-2.5 hover:bg-muted">
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-primary">Latest update</p>
                  <p className="mt-0.5 line-clamp-2 text-xs font-medium leading-snug">{uni.news[0].title}</p>
                  <p className="mt-1 text-[11px] text-muted-foreground">{uni.news[0].source} · {ago(uni.news[0].published_at)}</p>
                </a>
              ) : uni.summary ? (
                <p className="mt-3 line-clamp-3 text-xs text-muted-foreground">{uni.summary}</p>
              ) : null}
              <div className="mt-auto flex items-center justify-between pt-3">
                <Link to="/student/universities" className="text-xs font-semibold text-primary hover:underline">
                  View details
                </Link>
                {uni.website && (
                  <a href={uni.website} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
                    Website <ExternalLink className="h-3 w-3" />
                  </a>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
