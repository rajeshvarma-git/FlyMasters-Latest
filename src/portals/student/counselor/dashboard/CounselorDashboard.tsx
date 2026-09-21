import { useState, useEffect } from 'react';
import { supabase } from '@student/integrations/supabase/client';
import { useAuth } from '@student/hooks/useAuth';
import { useToast } from '@student/hooks/use-toast';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@student/components/ui/card';
import { Badge } from '@student/components/ui/badge';
import { Button } from '@student/components/ui/button';
import { Input } from '@student/components/ui/input';
import { Textarea } from '@student/components/ui/textarea';
import { Progress } from '@student/components/ui/progress';
import { Link } from 'react-router-dom';
import { 
  Users,
  Clock,
  TrendingUp,
  CheckCircle,
  Phone,
  Mail,
  Calendar,
  MessageSquare,
  Target,
  Award,
  AlertCircle,
          FileText
} from 'lucide-react';
import { format, isToday, isTomorrow, isYesterday } from 'date-fns';
import { LeadTimeline } from './LeadTimeline';
import { QuickActions } from './QuickActions';
import { ShiftTimer } from './ShiftTimer';
import { GlobalSearch } from '@student/components/GlobalSearch';

interface Lead {
  id: string;
  first_name: string;
  last_name: string;
  email: string;
  phone: string;
  lead_stage: string;
  priority_level: string;
  next_follow_up_date: string;
  last_activity_at: string;
  created_at: string;
  preferred_countries: string[];
  field_of_interest: string;
  academic_score: string;
  notes: string;
}

interface CounselorStats {
  totalAssignedLeads: number;
  hotLeads: number;
  conversionsThisMonth: number;
  followUpsToday: number;
  averageResponseTime: number;
  conversionRate: number;
}

export function CounselorDashboard() {
  const { user, userProfile } = useAuth();
  const [searchOpen, setSearchOpen] = useState(false);
  const [leads, setLeads] = useState<Lead[]>([]);
  const [stats, setStats] = useState<CounselorStats>({
    totalAssignedLeads: 0,
    hotLeads: 0,
    conversionsThisMonth: 0,
    followUpsToday: 0,
    averageResponseTime: 0,
    conversionRate: 0
  });
  const [loading, setLoading] = useState(true);
  const [selectedLead, setSelectedLead] = useState<Lead | null>(null);
  const [newNote, setNewNote] = useState('');
  const [followUpDate, setFollowUpDate] = useState('');
  const { toast } = useToast();

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.key === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setSearchOpen(true);
      }
    };
    document.addEventListener("keydown", down);
    return () => document.removeEventListener("keydown", down);
  }, []);

  const fetchLeads = async () => {
    if (!user?.id) return;

    try {
      const { data, error } = await supabase
        .from('student_leads')
        .select('*')
        .eq('assigned_counselor_id', user.id)
        .order('priority_level', { ascending: false })
        .order('next_follow_up_date', { ascending: true });

      if (error) throw error;
      setLeads(data || []);
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message,
        variant: 'destructive',
      });
    }
  };

  const fetchStats = async () => {
    if (!user?.id) return;

    try {
      const { data: leads, error } = await supabase
        .from('student_leads')
        .select('*')
        .eq('assigned_counselor_id', user.id);

      if (error) throw error;

      const now = new Date();
      const thisMonth = new Date(now.getFullYear(), now.getMonth(), 1);
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      const totalAssignedLeads = leads?.length || 0;
      const hotLeads = leads?.filter(lead => lead.lead_stage === 'hot').length || 0;
      const conversionsThisMonth = leads?.filter(lead => 
        lead.lead_stage === 'converted' && 
        lead.conversion_date && 
        new Date(lead.conversion_date) >= thisMonth
      ).length || 0;
      
      const followUpsToday = leads?.filter(lead => {
        if (!lead.next_follow_up_date) return false;
        const followUpDate = new Date(lead.next_follow_up_date);
        followUpDate.setHours(0, 0, 0, 0);
        return followUpDate.getTime() === today.getTime();
      }).length || 0;

      const conversionRate = totalAssignedLeads > 0 
        ? ((leads?.filter(lead => lead.lead_stage === 'converted').length || 0) / totalAssignedLeads) * 100 
        : 0;

      setStats({
        totalAssignedLeads,
        hotLeads,
        conversionsThisMonth,
        followUpsToday,
        averageResponseTime: 2.5, // This would be calculated from actual response times
        conversionRate
      });
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message,
        variant: 'destructive',
      });
    }
  };

  const updateLeadStage = async (leadId: string, newStage: string) => {
    try {
      const updateData: any = { 
        lead_stage: newStage,
        last_activity_at: new Date().toISOString()
      };
      
      if (newStage === 'converted') {
        updateData.conversion_date = new Date().toISOString();
      }

      const { error } = await supabase
        .from('student_leads')
        .update(updateData)
        .eq('id', leadId);

      if (error) throw error;

      await fetchLeads();
      await fetchStats();
      
      toast({
        title: 'Success',
        description: `Lead stage updated to ${newStage}`,
      });
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message,
        variant: 'destructive',
      });
    }
  };

  const addNote = async (leadId: string) => {
    if (!newNote.trim()) return;

    try {
      const { error } = await supabase
        .from('lead_notes')
        .insert({
          lead_id: leadId,
          note: newNote,
          note_type: 'follow_up',
          is_important: false,
          created_by: user?.id
        });

      if (error) throw error;

      setNewNote('');
      toast({
        title: 'Success',
        description: 'Note added successfully',
      });
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message,
        variant: 'destructive',
      });
    }
  };

  const scheduleFollowUp = async (leadId: string) => {
    if (!followUpDate) return;

    try {
      const { error } = await supabase
        .from('student_leads')
        .update({ 
          next_follow_up_date: followUpDate,
          last_activity_at: new Date().toISOString()
        })
        .eq('id', leadId);

      if (error) throw error;

      setFollowUpDate('');
      await fetchLeads();
      
      toast({
        title: 'Success',
        description: 'Follow-up scheduled successfully',
      });
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message,
        variant: 'destructive',
      });
    }
  };

  useEffect(() => {
    if (user?.id) {
      Promise.all([fetchLeads(), fetchStats()]).finally(() => setLoading(false));
    }
  }, [user?.id]);

  const getFollowUpLabel = (date: string) => {
    const followUpDate = new Date(date);
    if (isToday(followUpDate)) return 'Today';
    if (isTomorrow(followUpDate)) return 'Tomorrow';
    if (isYesterday(followUpDate)) return 'Yesterday';
    return format(followUpDate, 'MMM dd');
  };

  const getStageColor = (stage: string) => {
    switch (stage) {
      case 'hot': return 'bg-red-500';
      case 'warm': return 'bg-orange-500';
      case 'cold': return 'bg-blue-500';
      case 'converted': return 'bg-green-500';
      default: return 'bg-gray-500';
    }
  };

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case 'high': return 'destructive';
      case 'medium': return 'secondary';
      case 'low': return 'outline';
      default: return 'outline';
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  const urgentLeads = leads.filter(lead => {
    if (lead.lead_stage === 'hot') return true;
    if (lead.next_follow_up_date) {
      const followUpDate = new Date(lead.next_follow_up_date);
      return isToday(followUpDate) || followUpDate < new Date();
    }
    return false;
  });

  return (
    <>
      <GlobalSearch 
        open={searchOpen} 
        onOpenChange={setSearchOpen}
        userRole="counselor"
        userId={user?.id}
      />
      
      <div className="space-y-6">
          {/* Welcome Section */}
          <div className="bg-gradient-to-r from-primary/10 to-primary/5 rounded-lg p-6">
            <h1 className="text-2xl font-bold">
              Welcome back{userProfile?.first_name ? `, ${userProfile.first_name}` : ''}! 👋
            </h1>
            <p className="text-muted-foreground mt-1">
              You have {urgentLeads.length} lead{urgentLeads.length === 1 ? '' : 's'} that need immediate attention today.
            </p>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
            {[
              { title: 'My Leads', href: '/counselor/leads', icon: Phone },
              { title: 'My Students', href: '/counselor/students', icon: Users },
              { title: 'Shortlists', href: '/counselor/shortlists', icon: Target },
              { title: 'Student Chat', href: '/counselor/chat', icon: MessageSquare },
              { title: 'WhatsApp', href: '/counselor/whatsapp', icon: MessageSquare },
              { title: 'Documents', href: '/counselor/documents', icon: FileText },
            ].map((item) => (
              <Link key={item.href} to={item.href}>
                <Card className="hover:border-primary/40 transition-colors h-full">
                  <CardContent className="p-4 flex items-center gap-3">
                    <item.icon className="h-4 w-4 text-primary" />
                    <span className="text-sm font-medium">{item.title}</span>
                  </CardContent>
                </Card>
              </Link>
            ))}
          </div>

          {/* Quick Stats */}
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
            <Card>
              <CardContent className="p-4 text-center">
                <div className="text-2xl font-bold">{stats.totalAssignedLeads}</div>
                <div className="text-sm text-muted-foreground flex items-center justify-center gap-1">
                  <Users className="h-3 w-3" />
                  Total Leads
                </div>
              </CardContent>
            </Card>
            
            <Card>
              <CardContent className="p-4 text-center">
                <div className="text-2xl font-bold text-red-600">{stats.hotLeads}</div>
                <div className="text-sm text-muted-foreground flex items-center justify-center gap-1">
                  <TrendingUp className="h-3 w-3" />
                  Hot Leads
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-4 text-center">
                <div className="text-2xl font-bold text-green-600">{stats.conversionsThisMonth}</div>
                <div className="text-sm text-muted-foreground flex items-center justify-center gap-1">
                  <CheckCircle className="h-3 w-3" />
                  Conversions
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-4 text-center">
                <div className="text-2xl font-bold text-orange-600">{stats.followUpsToday}</div>
                <div className="text-sm text-muted-foreground flex items-center justify-center gap-1">
                  <Clock className="h-3 w-3" />
                  Due Today
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-4 text-center">
                <div className="text-2xl font-bold">{stats.conversionRate.toFixed(1)}%</div>
                <div className="text-sm text-muted-foreground flex items-center justify-center gap-1">
                  <Target className="h-3 w-3" />
                  Conv. Rate
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-4 text-center">
                <div className="text-2xl font-bold">{stats.averageResponseTime}h</div>
                <div className="text-sm text-muted-foreground flex items-center justify-center gap-1">
                  <Clock className="h-3 w-3" />
                  Avg. Response
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Shift Timer and Quick Actions */}
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            <ShiftTimer />
          </div>

          <div className="grid lg:grid-cols-3 gap-6">
            {/* Urgent Actions */}
            <div className="lg:col-span-2 space-y-6">
              {/* Priority Leads */}
              {urgentLeads.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-red-600">
                  <AlertCircle className="h-5 w-5" />
                  Urgent Actions Required
                </CardTitle>
                <CardDescription>
                  These leads need immediate attention
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {urgentLeads.slice(0, 3).map(lead => (
                    <div key={lead.id} className="p-4 border border-red-200 rounded-lg bg-red-50 dark:bg-red-900/10">
                      <div className="flex items-center justify-between mb-2">
                        <h4 className="font-semibold">{lead.first_name} {lead.last_name}</h4>
                        <div className="flex gap-2">
                          <Badge className={`${getStageColor(lead.lead_stage)} text-white`}>
                            {lead.lead_stage.toUpperCase()}
                          </Badge>
                          <Badge variant={getPriorityColor(lead.priority_level) as any}>
                            {lead.priority_level} priority
                          </Badge>
                        </div>
                      </div>
                      <div className="text-sm text-muted-foreground mb-3">
                        <div className="flex items-center gap-4">
                          <span className="flex items-center gap-1">
                            <Mail className="h-3 w-3" />
                            {lead.email}
                          </span>
                          <span className="flex items-center gap-1">
                            <Phone className="h-3 w-3" />
                            {lead.phone}
                          </span>
                        </div>
                      </div>
                      <QuickActions 
                        lead={lead} 
                        onStageUpdate={(stage) => updateLeadStage(lead.id, stage)}
                        onAddNote={(note) => addNote(lead.id)}
                        onScheduleFollowUp={(date) => scheduleFollowUp(lead.id)}
                      />
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* All Leads */}
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle>My Leads</CardTitle>
                <CardDescription>All leads assigned to you</CardDescription>
              </div>
              <Button variant="outline" size="sm" asChild>
                <Link to="/counselor/leads">View all</Link>
              </Button>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {leads.map(lead => (
                  <div key={lead.id} className="p-4 border rounded-lg hover:shadow-md transition-shadow">
                    <div className="flex items-center justify-between mb-2">
                      <h4 className="font-semibold">{lead.first_name} {lead.last_name}</h4>
                      <div className="flex gap-2">
                        <Badge className={`${getStageColor(lead.lead_stage)} text-white`}>
                          {lead.lead_stage}
                        </Badge>
                        <Badge variant={getPriorityColor(lead.priority_level) as any}>
                          {lead.priority_level}
                        </Badge>
                      </div>
                    </div>
                    
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm text-muted-foreground mb-3">
                      <div className="flex items-center gap-2">
                        <Mail className="h-4 w-4" />
                        {lead.email}
                      </div>
                      <div className="flex items-center gap-2">
                        <Phone className="h-4 w-4" />
                        {lead.phone}
                      </div>
                      <div className="flex items-center gap-2">
                        <Calendar className="h-4 w-4" />
                        {lead.next_follow_up_date 
                          ? `Follow up: ${getFollowUpLabel(lead.next_follow_up_date)}`
                          : 'No follow-up scheduled'
                        }
                      </div>
                      <div className="flex items-center gap-2">
                        <Clock className="h-4 w-4" />
                        Last activity: {format(new Date(lead.last_activity_at), 'MMM dd')}
                      </div>
                    </div>

                    <div className="flex gap-2">
                      <Button 
                        size="sm" 
                        variant="outline"
                        onClick={() => setSelectedLead(lead)}
                      >
                        View Timeline
                      </Button>
                      <QuickActions 
                        lead={lead} 
                        onStageUpdate={(stage) => updateLeadStage(lead.id, stage)}
                        onAddNote={(note) => addNote(lead.id)}
                        onScheduleFollowUp={(date) => scheduleFollowUp(lead.id)}
                        compact
                      />
                    </div>
                  </div>
                ))}
                
                {leads.length === 0 && (
                  <div className="text-center py-8 text-muted-foreground">
                    <Users className="h-12 w-12 mx-auto mb-4 opacity-50" />
                    <p>No leads assigned to you yet.</p>
                    <p className="text-sm">Check back later or contact your admin.</p>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
            </div>

            {/* Sidebar */}
            <div className="space-y-6">
              {/* Performance */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Award className="h-5 w-5" />
                    Your Performance
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div>
                    <div className="flex justify-between text-sm mb-1">
                      <span>Conversion Rate</span>
                      <span>{stats.conversionRate.toFixed(1)}%</span>
                    </div>
                    <Progress value={stats.conversionRate} className="h-2" />
                  </div>
                  
                  <div>
                    <div className="flex justify-between text-sm mb-1">
                      <span>Follow-up Compliance</span>
                      <span>85%</span>
                    </div>
                    <Progress value={85} className="h-2" />
                  </div>
                  
                  <div>
                    <div className="flex justify-between text-sm mb-1">
                      <span>Response Time</span>
                      <span>Great</span>
                    </div>
                    <Progress value={75} className="h-2" />
                  </div>
                </CardContent>
              </Card>

              {/* Quick Notes */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <MessageSquare className="h-5 w-5" />
                    Quick Note
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <Textarea
                    placeholder="Add a quick note or reminder..."
                    value={newNote}
                    onChange={(e) => setNewNote(e.target.value)}
                    className="mb-3"
                  />
                  <Button size="sm" className="w-full" disabled={!newNote.trim()}>
                    Save Note
                  </Button>
                </CardContent>
              </Card>
            </div>
          </div>

          {/* Lead Timeline Modal */}
          {selectedLead && (
            <LeadTimeline 
              lead={selectedLead} 
              onClose={() => setSelectedLead(null)}
            />
          )}
      </div>
    </>
  );
}