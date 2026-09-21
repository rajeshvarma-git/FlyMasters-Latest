import { useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '@student/hooks/useAuth';
import { supabase } from '@student/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@student/components/ui/card';
import { Button } from '@student/components/ui/button';
import { Badge } from '@student/components/ui/badge';
import { Input } from '@student/components/ui/input';
import { Label } from '@student/components/ui/label';
import { Textarea } from '@student/components/ui/textarea';
import { Progress } from '@student/components/ui/progress';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@student/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@student/components/ui/dialog';
import { useToast } from '@student/hooks/use-toast';
import { notifyAssignedCounselors } from '@student/lib/notifyCounselorsOfStudentDocument';
import { collectStudentShortlistKeys, emailsMatch, shortlistBelongsToStudent } from '@student/lib/studentShortlists';
import { matchesAnyCountry, normalizeCountry } from '@student/lib/universityRecommendations';
import {
  BookOpen,
  Calendar,
  GraduationCap,
  MapPin,
  FileText,
  CheckCircle,
  Clock,
  AlertTriangle,
  Plus,
  Send,
  Ban,
} from 'lucide-react';
import { format } from 'date-fns';

const INTAKE_OPTIONS = ['Fall 2026', 'Spring 2027', 'Fall 2027', 'Winter 2027', 'Rolling'];
const PRIORITY_OPTIONS = ['high', 'medium', 'low'];
const OPEN_STATUSES = new Set(['draft', 'in_progress', 'pending_counselor', 'counselor_approved', 'returned', 'submitted', 'waitlisted']);

type UniversityOption = {
  id: string;
  name: string;
  country: string;
  city: string | null;
  isFallback?: boolean;
};

type Application = {
  id: string;
  status: string;
  priority_level: string;
  application_deadline: string | null;
  intake_term: string;
  notes: string | null;
  counselor_comments?: string | null;
  created_at: string;
  university_id: string;
  university_name?: string | null;
  course_name?: string | null;
  country?: string | null;
  city?: string | null;
  shortlist_id?: string | null;
};

type ShortlistRow = {
  id: string;
  university_id: string | null;
  university_name: string | null;
  course_name: string | null;
  location: string | null;
  application_deadline: string | null;
  priority_level: string | null;
  counselor_notes: string | null;
};

function progressFor(status: string) {
  switch (status.toLowerCase()) {
    case 'draft':
      return 20;
    case 'in_progress':
    case 'returned':
      return 45;
    case 'pending_counselor':
      return 55;
    case 'counselor_approved':
    case 'submitted':
      return 80;
    case 'waitlisted':
      return 85;
    case 'accepted':
      return 100;
    case 'rejected':
    case 'withdrawn':
      return 100;
    default:
      return 15;
  }
}

function applicationLabel(app: Application, universities: UniversityOption[]) {
  const match = universities.find((uni) => uni.id === app.university_id);
  return app.university_name || match?.name || 'University';
}

function applicationPlace(app: Application, universities: UniversityOption[]) {
  const match = universities.find((uni) => uni.id === app.university_id);
  const city = app.city || match?.city;
  const country = app.country || match?.country;
  return [city, country].filter(Boolean).join(', ');
}

export function StudentApplications() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const { toast } = useToast();

  const [applications, setApplications] = useState<Application[]>([]);
  const [universities, setUniversities] = useState<UniversityOption[]>([]);
  const [shortlists, setShortlists] = useState<ShortlistRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);

  const [universityId, setUniversityId] = useState('');
  const [courseName, setCourseName] = useState('');
  const [intakeTerm, setIntakeTerm] = useState('Fall 2026');
  const [priorityLevel, setPriorityLevel] = useState('medium');
  const [deadline, setDeadline] = useState('');
  const [notes, setNotes] = useState('');
  const [shortlistId, setShortlistId] = useState<string | null>(null);

  useEffect(() => {
    if (user) {
      fetchPageData();
      const poll = window.setInterval(() => {
        void fetchPageData(true);
      }, 4000);
      return () => window.clearInterval(poll);
    }
  }, [user]);

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const requested = params.get('university') || params.get('shortlist');
    if (!requested || loading) return;
    const shortlistMatch = shortlists.find(
      (row) => row.id === requested || row.university_id === requested
    );
    const universityMatch = universities.find((uni) => uni.id === requested);
    if (!shortlistMatch && !universityMatch) return;
    openStartDialog(universityMatch, shortlistMatch);
    navigate('/student/applications', { replace: true });
  }, [location.search, universities, shortlists, loading]);

  const fetchPageData = async (silent = false) => {
    if (!user) return;

    try {
      if (!silent) setLoading(true);

      const [appsRes, unisRes, shortlistsRes, leadsRes, favoritesRes, profileRes] = await Promise.all([
        supabase
          .from('applications')
          .select('*')
          .eq('user_id', user.id)
          .order('created_at', { ascending: false }),
        supabase.from('universities').select('id, name, country, city, is_active').eq('is_active', true),
        supabase
          .from('university_shortlists')
          .select('id, student_id, student_email, email, university_id, university_name, course_name, location, application_deadline, priority_level, counselor_notes, status'),
        supabase.from('student_leads').select('id, user_id, email, preferred_countries'),
        supabase.from('user_favorites').select('university_id').eq('user_id', user.id),
        supabase.from('profiles').select('interested_countries').eq('user_id', user.id).maybeSingle(),
      ]);

      if (appsRes.error) throw appsRes.error;

      const keys = collectStudentShortlistKeys(user, leadsRes.data || []);
      const mine = (shortlistsRes.data || []).filter((row: any) => shortlistBelongsToStudent(row, user, keys));
      const myLead = (leadsRes.data || []).find((lead: any) => String(lead.user_id) === String(user.id))
        || (leadsRes.data || []).find((lead: any) => emailsMatch(lead.email, user.email));
      const preferredCountries = Array.isArray(myLead?.preferred_countries)
        ? myLead.preferred_countries.map((item) => normalizeCountry(item)).filter(Boolean)
        : (profileRes.data?.interested_countries || []).map((item: string) => normalizeCountry(item)).filter(Boolean);

      const catalog = ((unisRes.data || []) as UniversityOption[]).filter((uni) =>
        preferredCountries.length === 0 || matchesAnyCountry(uni.country, preferredCountries)
      );
      const favoriteIds = new Set((favoritesRes.data || []).map((row: any) => row.university_id));
      const combined = [...catalog].sort((a, b) => {
        const aFav = favoriteIds.has(a.id) ? 0 : 1;
        const bFav = favoriteIds.has(b.id) ? 0 : 1;
        if (aFav !== bFav) return aFav - bFav;
        return a.name.localeCompare(b.name);
      });

      setApplications((appsRes.data || []) as Application[]);
      setUniversities(combined);
      setShortlists(mine as ShortlistRow[]);
    } catch (error: any) {
      if (!silent) {
        toast({
          title: 'Could not load applications',
          description: error.message || 'Please try again.',
          variant: 'destructive',
        });
        setApplications([]);
      }
    } finally {
      if (!silent) setLoading(false);
    }
  };

  const openStartDialog = (uni?: UniversityOption, shortlist?: ShortlistRow) => {
    const locationParts = (shortlist?.location || '').split(',').map((part) => part.trim()).filter(Boolean);
    const fromShortlist: UniversityOption | undefined = shortlist
      ? {
          id: shortlist.university_id || `shortlist-${shortlist.id}`,
          name: shortlist.university_name || 'University',
          country: locationParts[locationParts.length - 1] || '',
          city: locationParts.length > 1 ? locationParts[0] : null,
        }
      : undefined;
    const selected = uni || fromShortlist;

    if (selected && !universities.some((item) => item.id === selected.id)) {
      setUniversities((prev) => [selected, ...prev]);
    }

    setUniversityId(selected?.id || '');
    setCourseName(shortlist?.course_name || '');
    setIntakeTerm('Fall 2026');
    setPriorityLevel(shortlist?.priority_level || 'medium');
    setDeadline(shortlist?.application_deadline ? shortlist.application_deadline.slice(0, 10) : '');
    setNotes(shortlist?.counselor_notes || '');
    setShortlistId(shortlist?.id || null);
    setDialogOpen(true);
  };

  const alreadyAppliedIds = useMemo(() => {
    const ids = new Set<string>();
    for (const app of applications) {
      if (!OPEN_STATUSES.has(app.status)) continue;
      if (app.university_id) ids.add(app.university_id);
      if (app.university_name) ids.add(app.university_name.toLowerCase());
      if (app.shortlist_id) ids.add(app.shortlist_id);
    }
    return ids;
  }, [applications]);

  const pendingShortlists = shortlists.filter((row) => {
    if (alreadyAppliedIds.has(row.id)) return false;
    if (row.university_id && alreadyAppliedIds.has(row.university_id)) return false;
    if (row.university_name && alreadyAppliedIds.has(row.university_name.toLowerCase())) return false;
    return true;
  });

  const startApplication = async () => {
    if (!user) return;
    const uni = universities.find((item) => item.id === universityId);
    const fromShortlist = shortlists.find((row) => row.id === shortlistId);
    const locationParts = (fromShortlist?.location || '').split(',').map((part) => part.trim()).filter(Boolean);
    const name = uni?.name || fromShortlist?.university_name;
    if (!universityId || !name) {
      toast({ title: 'Choose a university', variant: 'destructive' });
      return;
    }
    if (!courseName.trim()) {
      toast({ title: 'Enter a course or program', variant: 'destructive' });
      return;
    }

    const duplicate = applications.some(
      (app) =>
        OPEN_STATUSES.has(app.status) &&
        (app.university_id === universityId || app.university_name?.toLowerCase() === name.toLowerCase())
    );
    if (duplicate) {
      toast({
        title: 'Application already started',
        description: `You already have an open application for ${name}.`,
      });
      return;
    }

    setSaving(true);
    try {
      const now = new Date().toISOString();
      const row = {
        id: crypto.randomUUID(),
        user_id: user.id,
        university_id: universityId,
        university_name: name,
        country: uni?.country || locationParts[locationParts.length - 1] || null,
        city: uni?.city || (locationParts.length > 1 ? locationParts[0] : null),
        course_name: courseName.trim(),
        intake_term: intakeTerm,
        priority_level: priorityLevel,
        application_deadline: deadline || null,
        notes: notes.trim() || null,
        status: shortlistId ? 'in_progress' : 'draft',
        shortlist_id: shortlistId,
        created_at: now,
        updated_at: now,
      };

      const { error } = await supabase.from('applications').insert(row);
      if (error) throw error;

      setApplications((prev) => [row, ...prev]);
      setDialogOpen(false);

      await notifyAssignedCounselors(user, {
        type: 'info',
        title: 'Student started an application',
        message: `${user.email || 'A student'} started an application to ${name} (${courseName.trim()}, ${intakeTerm}).`,
        actionUrl: '/counselor/applications',
      });

      toast({
        title: 'Application started',
        description: `${name} is now on your applications list.`,
      });
    } catch (error: any) {
      toast({
        title: 'Could not start application',
        description: error.message || 'Please try again.',
        variant: 'destructive',
      });
    } finally {
      setSaving(false);
    }
  };

  const updateStatus = async (application: Application, status: string) => {
    if (!user) return;
    setSaving(true);
    try {
      const { error } = await supabase
        .from('applications')
        .update({ status, updated_at: new Date().toISOString() })
        .eq('id', application.id)
        .eq('user_id', user.id);
      if (error) throw error;

      setApplications((prev) =>
        prev.map((app) => (app.id === application.id ? { ...app, status } : app))
      );

      const uniName = applicationLabel(application, universities);
      if (status === 'pending_counselor') {
        await notifyAssignedCounselors(user, {
          type: 'info',
          title: 'Application sent for counselor review',
          message: `${user.email || 'A student'} sent ${uniName} (${application.course_name || 'course'}) to you. It has not been sent to the university.`,
          actionUrl: '/counselor/applications',
        });
      }

      toast({
        title: status === 'pending_counselor' ? 'Sent to your counselor' : 'Application withdrawn',
        description:
          status === 'pending_counselor'
            ? `${uniName} will be reviewed by your counselor. It is not sent to the university yet.`
            : uniName,
      });
    } catch (error: any) {
      toast({
        title: 'Could not update application',
        description: error.message || 'Please try again.',
        variant: 'destructive',
      });
    } finally {
      setSaving(false);
    }
  };

  const getStatusColor = (status: string) => {
    switch (status.toLowerCase()) {
      case 'pending_counselor':
        return 'bg-amber-500';
      case 'counselor_approved':
        return 'bg-emerald-600';
      case 'returned':
        return 'bg-orange-500';
      case 'submitted':
        return 'bg-blue-500';
      case 'accepted':
        return 'bg-green-500';
      case 'rejected':
        return 'bg-red-500';
      case 'waitlisted':
        return 'bg-yellow-500';
      case 'in_progress':
        return 'bg-purple-500';
      case 'withdrawn':
        return 'bg-gray-400';
      default:
        return 'bg-gray-500';
    }
  };

  const getPriorityColor = (priority: string) => {
    switch ((priority || '').toLowerCase()) {
      case 'high':
        return 'destructive' as const;
      case 'medium':
        return 'default' as const;
      case 'low':
        return 'secondary' as const;
      default:
        return 'outline' as const;
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status.toLowerCase()) {
      case 'accepted':
      case 'counselor_approved':
        return <CheckCircle className="w-4 h-4" />;
      case 'rejected':
      case 'withdrawn':
      case 'returned':
        return <AlertTriangle className="w-4 h-4" />;
      case 'waitlisted':
      case 'in_progress':
      case 'pending_counselor':
        return <Clock className="w-4 h-4" />;
      default:
        return <FileText className="w-4 h-4" />;
    }
  };

  const statusLabel = (status: string) => {
    switch (status) {
      case 'pending_counselor':
        return 'with counselor';
      case 'counselor_approved':
        return 'counselor approved';
      case 'returned':
        return 'returned by counselor';
      default:
        return status.replace('_', ' ');
    }
  };

  const withCounselorCount = applications.filter((app) => app.status === 'pending_counselor').length;
  const approvedCount = applications.filter((app) => app.status === 'counselor_approved' || app.status === 'submitted').length;
  const rejectedCount = applications.filter((app) => app.status === 'rejected' || app.status === 'returned').length;

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-gradient-primary flex items-center justify-center">
            <BookOpen className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-bold">My Applications</h1>
            <p className="text-muted-foreground">Start an application, then send it to your counselor. It is not sent to the university until they approve it.</p>
          </div>
        </div>
        <Button onClick={() => openStartDialog()}>
          <Plus className="w-4 h-4 mr-2" />
          Start application
        </Button>
      </div>

      <div className="grid gap-4 md:grid-cols-4">
        <Card className="glass-card">
          <CardContent className="p-4">
            <div className="flex items-center gap-2">
              <FileText className="w-4 h-4 text-muted-foreground" />
              <div>
                <div className="text-2xl font-bold">{applications.length}</div>
                <div className="text-xs text-muted-foreground">Total Applications</div>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="glass-card">
          <CardContent className="p-4">
            <div className="flex items-center gap-2">
              <Clock className="w-4 h-4 text-blue-500" />
              <div>
                <div className="text-2xl font-bold text-blue-600">{withCounselorCount}</div>
                <div className="text-xs text-muted-foreground">With counselor</div>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="glass-card">
          <CardContent className="p-4">
            <div className="flex items-center gap-2">
              <CheckCircle className="w-4 h-4 text-green-500" />
              <div>
                <div className="text-2xl font-bold text-green-600">{approvedCount}</div>
                <div className="text-xs text-muted-foreground">Counselor approved</div>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="glass-card">
          <CardContent className="p-4">
            <div className="flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-red-500" />
              <div>
                <div className="text-2xl font-bold text-red-600">{rejectedCount}</div>
                <div className="text-xs text-muted-foreground">Rejected</div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {pendingShortlists.length > 0 && (
        <Card className="glass-card">
          <CardHeader>
            <CardTitle>Counselor shortlists ready to apply</CardTitle>
            <CardDescription>Your counselor recommended these universities. Start an application when you are ready.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {pendingShortlists.map((row) => (
              <div key={row.id} className="flex flex-col gap-3 rounded-lg border p-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <div className="font-medium">{row.university_name || 'University'}</div>
                  <div className="text-sm text-muted-foreground">
                    {[row.course_name, row.location].filter(Boolean).join(' · ') || 'Course details from your counselor'}
                  </div>
                </div>
                <Button size="sm" onClick={() => openStartDialog(undefined, row)}>
                  Start application
                </Button>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      <Card className="glass-card">
        <CardHeader>
          <CardTitle>Application Status</CardTitle>
          <CardDescription>Applications go to your counselor first. They are not sent directly to universities.</CardDescription>
        </CardHeader>
        <CardContent>
          {applications.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <BookOpen className="w-12 h-12 mx-auto mb-4 opacity-50" />
              <h3 className="text-lg font-semibold text-foreground mb-2">No applications yet</h3>
              <p className="text-sm mb-4">
                Start an application from this page, or browse universities and save a shortlist with your counselor.
              </p>
              <div className="flex justify-center gap-2">
                <Button onClick={() => openStartDialog()}>Start application</Button>
                <Button variant="outline" onClick={() => navigate('/student/universities')}>
                  Browse Universities
                </Button>
              </div>
            </div>
          ) : (
            <div className="space-y-6">
              {applications.map((application) => {
                const name = applicationLabel(application, universities);
                const place = applicationPlace(application, universities);
                const canSubmit = application.status === 'draft' || application.status === 'in_progress' || application.status === 'returned';
                const canWithdraw = OPEN_STATUSES.has(application.status);

                return (
                  <div key={application.id} className="border rounded-lg p-6 space-y-4">
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1">
                        <h3 className="font-semibold text-lg">{name}</h3>
                        {place ? (
                          <p className="text-muted-foreground flex items-center gap-1">
                            <MapPin className="w-4 h-4" />
                            {place}
                          </p>
                        ) : null}
                        <p className="text-sm text-muted-foreground flex items-center gap-1 mt-1">
                          <GraduationCap className="w-4 h-4" />
                          {application.course_name || 'Course to be confirmed'}
                        </p>
                      </div>
                      <div className="flex flex-col items-end gap-2">
                        <Badge className={`${getStatusColor(application.status)} text-white`}>
                          {getStatusIcon(application.status)}
                          <span className="ml-1">{statusLabel(application.status)}</span>
                        </Badge>
                        <Badge variant={getPriorityColor(application.priority_level)}>
                          {application.priority_level || 'medium'} priority
                        </Badge>
                      </div>
                    </div>

                    <div>
                      <div className="mb-1 flex justify-between text-xs text-muted-foreground">
                        <span>Progress</span>
                        <span>{progressFor(application.status)}%</span>
                      </div>
                      <Progress value={progressFor(application.status)} />
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
                      <div className="flex items-center gap-2">
                        <Calendar className="w-4 h-4 text-muted-foreground" />
                        <div>
                          <div className="font-medium">Intake</div>
                          <div className="text-muted-foreground">{application.intake_term || 'Not set'}</div>
                        </div>
                      </div>
                      {application.application_deadline ? (
                        <div className="flex items-center gap-2">
                          <Clock className="w-4 h-4 text-muted-foreground" />
                          <div>
                            <div className="font-medium">Deadline</div>
                            <div className="text-muted-foreground">
                              {format(new Date(application.application_deadline), 'MMM dd, yyyy')}
                            </div>
                          </div>
                        </div>
                      ) : null}
                      <div className="flex items-center gap-2">
                        <FileText className="w-4 h-4 text-muted-foreground" />
                        <div>
                          <div className="font-medium">Started</div>
                          <div className="text-muted-foreground">
                            {application.created_at
                              ? format(new Date(application.created_at), 'MMM dd, yyyy')
                              : '—'}
                          </div>
                        </div>
                      </div>
                    </div>

                    {application.notes ? (
                      <div className="p-3 bg-muted/50 rounded-lg">
                        <div className="font-medium text-sm mb-1">Notes</div>
                        <p className="text-sm text-muted-foreground">{application.notes}</p>
                      </div>
                    ) : null}

                    {application.counselor_comments ? (
                      <div className="p-3 bg-muted/50 rounded-lg">
                        <div className="font-medium text-sm mb-1">Counselor note</div>
                        <p className="text-sm text-muted-foreground">{application.counselor_comments}</p>
                      </div>
                    ) : null}

                    <div className="flex flex-wrap gap-2 pt-2">
                      {canSubmit ? (
                        <Button size="sm" disabled={saving} onClick={() => updateStatus(application, 'pending_counselor')}>
                          <Send className="w-4 h-4 mr-1" />
                          Send to counselor
                        </Button>
                      ) : null}
                      {canWithdraw ? (
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={saving}
                          onClick={() => updateStatus(application, 'withdrawn')}
                        >
                          <Ban className="w-4 h-4 mr-1" />
                          Withdraw
                        </Button>
                      ) : null}
                      <Button variant="ghost" size="sm" onClick={() => navigate('/student/documents')}>
                        Documents
                      </Button>
                      <Button variant="ghost" size="sm" onClick={() => navigate('/student/chat')}>
                        Ask counselor
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Start an application</DialogTitle>
            <DialogDescription>
              Choose a university and course. When you are ready, send the application to your counselor — not to the university.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-2">
              <Label>University</Label>
              <Select value={universityId} onValueChange={setUniversityId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select a university" />
                </SelectTrigger>
                <SelectContent>
                  {universities.map((uni) => (
                    <SelectItem key={uni.id} value={uni.id}>
                      {uni.name}
                      {uni.country ? ` · ${uni.country}` : ''}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Course / program</Label>
              <Input
                value={courseName}
                onChange={(event) => setCourseName(event.target.value)}
                placeholder="e.g. MSc Computer Science"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Intake</Label>
                <Select value={intakeTerm} onValueChange={setIntakeTerm}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {INTAKE_OPTIONS.map((intake) => (
                      <SelectItem key={intake} value={intake}>
                        {intake}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Priority</Label>
                <Select value={priorityLevel} onValueChange={setPriorityLevel}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {PRIORITY_OPTIONS.map((priority) => (
                      <SelectItem key={priority} value={priority}>
                        {priority}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-2">
              <Label>Application deadline (optional)</Label>
              <Input type="date" value={deadline} onChange={(event) => setDeadline(event.target.value)} />
            </div>

            <div className="space-y-2">
              <Label>Notes (optional)</Label>
              <Textarea
                value={notes}
                onChange={(event) => setNotes(event.target.value)}
                placeholder="Anything your counselor should know"
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={startApplication} disabled={saving}>
              {saving ? 'Saving...' : 'Start application'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
