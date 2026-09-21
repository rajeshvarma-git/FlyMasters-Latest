import { useState, useEffect } from 'react';
import { useAuth } from '@student/hooks/useAuth';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@student/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@student/components/ui/card';
import { Button } from '@student/components/ui/button';
import { Progress } from '@student/components/ui/progress';
import { Badge } from '@student/components/ui/badge';
import { 
  GraduationCap, 
  FileText, 
  Heart, 
  MessageCircle,
  TrendingUp,
  Calendar,
  CheckCircle,
  AlertCircle,
  Target,
  BookOpen,
  List,
  User,
  ArrowRight
} from 'lucide-react';
import { format } from 'date-fns';

interface Application {
  id: string;
  university_name?: string;
  course_name?: string;
  status: string;
  application_deadline: string;
  priority_level: string;
}

interface DocumentProgress {
  total_required_documents: number;
  uploaded_documents: number;
  approved_documents: number;
  completion_percentage: number;
}

interface StudentStats {
  totalApplications: number;
  documentsUploaded: number;
  favoritesCount: number;
  chatSessions: number;
}

export function StudentDashboard() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [applications, setApplications] = useState<Application[]>([]);
  const [documentProgress, setDocumentProgress] = useState<DocumentProgress | null>(null);
  const [profileComplete, setProfileComplete] = useState(false);
  const [stats, setStats] = useState<StudentStats>({
    totalApplications: 0,
    documentsUploaded: 0,
    favoritesCount: 0,
    chatSessions: 0
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (user) {
      fetchDashboardData();
    }
  }, [user]);

  const fetchDashboardData = async () => {
    if (!user) return;
    
    try {
      setLoading(true);
      await Promise.all([
        fetchApplications(),
        fetchDocumentProgress(),
        fetchStats(),
        checkProfileCompletion()
      ]);
    } catch (error) {
      console.error('Error fetching dashboard data:', error);
    } finally {
      setLoading(false);
    }
  };

  const checkProfileCompletion = async () => {
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('first_name, last_name, phone, country, date_of_birth, passport_number')
        .eq('user_id', user?.id)
        .maybeSingle();

      if (error) {
        console.error('Error fetching profile:', error);
        setProfileComplete(false);
        return;
      }

      if (!data) {
        setProfileComplete(false);
        return;
      }

      const isComplete = !!(
        data.first_name &&
        data.last_name &&
        data.phone &&
        data.country &&
        data.date_of_birth &&
        data.passport_number
      );
      setProfileComplete(isComplete);
    } catch (error) {
      console.error('Error checking profile completion:', error);
      setProfileComplete(false);
    }
  };

  const fetchApplications = async () => {
    try {
      const { data, error } = await supabase
        .from('applications')
        .select('id, status, application_deadline, priority_level, university_name, course_name')
        .eq('user_id', user?.id)
        .order('created_at', { ascending: false })
        .limit(5);

      if (error) {
        console.error('Error fetching applications:', error);
        return;
      }

      if (data) {
        setApplications(data);
      }
    } catch (error) {
      console.error('Unexpected error fetching applications:', error);
    }
  };

  const fetchDocumentProgress = async () => {
    try {
      const { data, error } = await supabase
        .from('student_document_progress')
        .select('*')
        .eq('user_id', user?.id)
        .maybeSingle();

      if (error) {
        console.error('Error fetching document progress:', error);
        return;
      }

      if (data) {
        setDocumentProgress(data);
      }
    } catch (error) {
      console.error('Unexpected error fetching document progress:', error);
    }
  };

  const fetchStats = async () => {
    try {
      const [applicationsRes, documentsRes, favoritesRes, chatRes] = await Promise.all([
        supabase.from('applications').select('id', { count: 'exact' }).eq('user_id', user?.id),
        supabase.from('documents').select('id', { count: 'exact' }).eq('user_id', user?.id),
        supabase.from('user_favorites').select('id', { count: 'exact' }).eq('user_id', user?.id),
        supabase.from('chat_sessions').select('id', { count: 'exact' }).eq('user_id', user?.id)
      ]);

      setStats({
        totalApplications: applicationsRes.count || 0,
        documentsUploaded: documentsRes.count || 0,
        favoritesCount: favoritesRes.count || 0,
        chatSessions: chatRes.count || 0
      });
    } catch (error) {
      console.error('Error fetching stats:', error);
      // Keep default stats on error
    }
  };

  const getStatusColor = (status: string) => {
    switch (status.toLowerCase()) {
      case 'submitted': return 'bg-blue-500';
      case 'accepted': return 'bg-green-500';
      case 'rejected': return 'bg-red-500';
      case 'waitlisted': return 'bg-yellow-500';
      default: return 'bg-gray-500';
    }
  };

  const getPriorityColor = (priority: string) => {
    switch (priority.toLowerCase()) {
      case 'high': return 'destructive';
      case 'medium': return 'default';
      case 'low': return 'secondary';
      default: return 'outline';
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  return (
    <div className="space-y-4 md:space-y-6 min-w-0 max-w-full">
      {/* Welcome — desktop only; mobile uses MobilePortalHeader */}
      <div className="hidden md:flex items-center gap-4">
        <div className="w-12 h-12 rounded-full bg-gradient-primary flex items-center justify-center shrink-0">
          <GraduationCap className="w-6 h-6 text-white" />
        </div>
        <div className="min-w-0">
          <h1 className="text-3xl font-bold">Student Dashboard</h1>
          <p className="text-muted-foreground">Track your study abroad journey</p>
        </div>
      </div>
      <p className="text-sm text-muted-foreground md:hidden">Track your study abroad journey</p>

      {/* Profile Completion Alert */}
      {!profileComplete && (
        <Card className="glass-card border-2 border-primary/50 bg-primary/5 shadow-lg overflow-hidden">
          <CardHeader className="p-4 md:p-6">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
              <div className="flex items-start gap-3 min-w-0 flex-1">
                <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                  <AlertCircle className="w-5 h-5 text-primary" />
                </div>
                <div className="min-w-0">
                  <CardTitle className="text-base md:text-xl text-primary">Complete Your Profile</CardTitle>
                  <CardDescription className="mt-1 text-xs md:text-sm">
                    Finish your profile to get personalized university recommendations and counselor support.
                  </CardDescription>
                </div>
              </div>
              <Button
                size="lg"
                onClick={() => navigate('/student/profile')}
                className="w-full sm:w-auto shrink-0 flex items-center justify-center gap-2 shadow-lg"
              >
                <User className="w-4 h-4 shrink-0" />
                <span>Complete Profile</span>
                <ArrowRight className="w-4 h-4 shrink-0" />
              </Button>
            </div>
          </CardHeader>
        </Card>
      )}

      {/* Stats Cards */}
      <div className="grid gap-3 grid-cols-2 md:grid-cols-2 lg:grid-cols-4">
        <Card className="glass-card">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 p-3 pb-2 md:p-6 md:pb-2">
            <CardTitle className="text-xs md:text-sm font-medium">Applications</CardTitle>
            <FileText className="h-4 w-4 text-muted-foreground shrink-0" />
          </CardHeader>
          <CardContent className="p-3 pt-0 md:p-6 md:pt-0">
            <div className="text-xl md:text-2xl font-bold">{stats.totalApplications}</div>
            <p className="text-xs text-muted-foreground">Total applications</p>
          </CardContent>
        </Card>

        <Card className="glass-card">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 p-3 pb-2 md:p-6 md:pb-2">
            <CardTitle className="text-xs md:text-sm font-medium">Documents</CardTitle>
            <CheckCircle className="h-4 w-4 text-muted-foreground shrink-0" />
          </CardHeader>
          <CardContent className="p-3 pt-0 md:p-6 md:pt-0">
            <div className="text-xl md:text-2xl font-bold">{stats.documentsUploaded}</div>
            <p className="text-xs text-muted-foreground">Documents uploaded</p>
          </CardContent>
        </Card>

        <Card className="glass-card">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 p-3 pb-2 md:p-6 md:pb-2">
            <CardTitle className="text-xs md:text-sm font-medium">Favorites</CardTitle>
            <Heart className="h-4 w-4 text-muted-foreground shrink-0" />
          </CardHeader>
          <CardContent className="p-3 pt-0 md:p-6 md:pt-0">
            <div className="text-xl md:text-2xl font-bold">{stats.favoritesCount}</div>
            <p className="text-xs text-muted-foreground">Saved universities</p>
          </CardContent>
        </Card>

        <Card className="glass-card">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 p-3 pb-2 md:p-6 md:pb-2">
            <CardTitle className="text-xs md:text-sm font-medium">Chat Sessions</CardTitle>
            <MessageCircle className="h-4 w-4 text-muted-foreground shrink-0" />
          </CardHeader>
          <CardContent className="p-3 pt-0 md:p-6 md:pt-0">
            <div className="text-xl md:text-2xl font-bold">{stats.chatSessions}</div>
            <p className="text-xs text-muted-foreground">AI consultations</p>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 md:gap-6 md:grid-cols-2">
        {/* Document Progress */}
        {documentProgress && (
          <Card className="glass-card overflow-hidden">
            <CardHeader className="p-4 md:p-6">
              <CardTitle className="flex items-center gap-2 text-base md:text-lg">
                <Target className="w-5 h-5 shrink-0" />
                Document Progress
              </CardTitle>
              <CardDescription className="text-xs md:text-sm">Track your document completion status</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4 p-4 pt-0 md:p-6 md:pt-0">
              <div className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span>Overall Progress</span>
                  <span>{Math.round(documentProgress.completion_percentage)}%</span>
                </div>
                <Progress value={documentProgress.completion_percentage} className="h-2" />
              </div>
              
              <div className="grid grid-cols-3 gap-2 sm:gap-4 text-center">
                <div>
                  <div className="text-2xl font-bold text-blue-600">{documentProgress.uploaded_documents}</div>
                  <div className="text-xs text-muted-foreground">Uploaded</div>
                </div>
                <div>
                  <div className="text-2xl font-bold text-green-600">{documentProgress.approved_documents}</div>
                  <div className="text-xs text-muted-foreground">Approved</div>
                </div>
                <div>
                  <div className="text-2xl font-bold text-gray-600">{documentProgress.total_required_documents}</div>
                  <div className="text-xs text-muted-foreground">Required</div>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Recent Applications */}
        <Card className="glass-card overflow-hidden">
          <CardHeader className="p-4 md:p-6">
            <CardTitle className="flex items-center gap-2 text-base md:text-lg">
              <BookOpen className="w-5 h-5 shrink-0" />
              Recent Applications
            </CardTitle>
            <CardDescription className="text-xs md:text-sm">Your latest application submissions</CardDescription>
          </CardHeader>
          <CardContent className="p-4 pt-0 md:p-6 md:pt-0">
            {applications.length > 0 ? (
              <div className="space-y-4">
                {applications.map((application) => (
                  <div key={application.id} className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between p-3 rounded-lg border">
                    <div className="flex-1 min-w-0">
                      <div className="font-medium">
                        {application.university_name || 'University'}
                      </div>
                      <div className="text-sm text-muted-foreground">
                        {application.course_name || 'Course'}
                      </div>
                      {application.application_deadline && (
                        <div className="text-xs text-muted-foreground flex items-center gap-1 mt-1">
                          <Calendar className="w-3 h-3" />
                          Deadline: {format(new Date(application.application_deadline), 'MMM dd, yyyy')}
                        </div>
                      )}
                    </div>
                    <div className="flex flex-wrap items-center gap-2 sm:flex-col sm:items-end">
                      <Badge 
                        className={`${getStatusColor(application.status)} text-white`}
                      >
                        {application.status}
                      </Badge>
                      <Badge variant={getPriorityColor(application.priority_level)}>
                        {application.priority_level} priority
                      </Badge>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-8 text-muted-foreground">
                <FileText className="w-12 h-12 mx-auto mb-4 opacity-50" />
                <p>No applications yet</p>
                <p className="text-sm mb-4">Start your study abroad journey!</p>
                <Button onClick={() => navigate('/student/applications')}>Start an application</Button>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Quick Actions */}
      <Card className="glass-card overflow-hidden">
        <CardHeader className="p-4 md:p-6">
          <CardTitle className="text-base md:text-lg">Quick Actions</CardTitle>
          <CardDescription className="text-xs md:text-sm">Get started with your application process</CardDescription>
        </CardHeader>
        <CardContent className="p-4 pt-0 md:p-6 md:pt-0">
          <div className="grid gap-2 grid-cols-2 md:grid-cols-3 lg:grid-cols-6">
            <Button 
              variant="outline" 
              className="h-auto py-3 px-2 flex-col gap-1.5 text-xs md:text-sm"
              onClick={() => navigate('/student/profile')}
            >
              <User className="w-5 h-5 md:w-6 md:h-6" />
              <span className="text-center leading-tight">My Profile</span>
            </Button>
            <Button 
              variant="outline" 
              className="h-auto py-3 px-2 flex-col gap-1.5 text-xs md:text-sm"
              onClick={() => navigate('/chat')}
            >
              <MessageCircle className="w-5 h-5 md:w-6 md:h-6" />
              <span className="text-center leading-tight">AI Chat</span>
            </Button>
            <Button 
              variant="outline" 
              className="h-auto py-3 px-2 flex-col gap-1.5 text-xs md:text-sm"
              onClick={() => navigate('/student/applications')}
            >
              <BookOpen className="w-5 h-5 md:w-6 md:h-6" />
              <span className="text-center leading-tight">Applications</span>
            </Button>
            <Button 
              variant="outline" 
              className="h-auto py-3 px-2 flex-col gap-1.5 text-xs md:text-sm"
              onClick={() => navigate('/student/universities')}
            >
              <GraduationCap className="w-5 h-5 md:w-6 md:h-6" />
              <span className="text-center leading-tight">Universities</span>
            </Button>
            <Button 
              variant="outline" 
              className="h-auto py-3 px-2 flex-col gap-1.5 text-xs md:text-sm"
              onClick={() => navigate('/student/documents')}
            >
              <FileText className="w-5 h-5 md:w-6 md:h-6" />
              <span className="text-center leading-tight">Documents</span>
            </Button>
            <Button 
              variant="outline" 
              className="h-auto py-3 px-2 flex-col gap-1.5 text-xs md:text-sm"
              onClick={() => navigate('/student/shortlists')}
            >
              <List className="w-5 h-5 md:w-6 md:h-6" />
              <span className="text-center leading-tight">Shortlists</span>
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}