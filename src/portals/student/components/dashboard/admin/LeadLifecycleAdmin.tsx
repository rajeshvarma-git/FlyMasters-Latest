import { useState, useEffect } from 'react';
import { supabase } from '@student/integrations/supabase/client';
import { useToast } from '@student/components/ui/use-toast';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@student/components/ui/card';
import { Badge } from '@student/components/ui/badge';
import { Button } from '@student/components/ui/button';
import { Input } from '@student/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@student/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@student/components/ui/dialog';
import { Textarea } from '@student/components/ui/textarea';
import { Progress } from '@student/components/ui/progress';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@student/components/ui/tabs';
import { 
  Users, 
  Search, 
  Filter, 
  UserPlus, 
  Calendar,
  MessageSquare,
  TrendingUp,
  TrendingDown,
  Clock,
  CheckCircle,
  AlertCircle,
  Phone,
  Mail,
  MapPin,
  GraduationCap,
  Globe
} from 'lucide-react';
import { format } from 'date-fns';
import { BulkLeadUpload } from './BulkLeadUpload';
import { LeadForms } from './LeadForms';
import { AssignmentManagement } from './AssignmentManagement';

interface Lead {
  id: string;
  first_name: string;
  last_name: string;
  email: string;
  phone: string;
  lead_stage: string;
  priority_level: string;
  assigned_counselor_id: string;
  next_follow_up_date: string;
  last_activity_at: string;
  created_at: string;
  preferred_countries: string[];
  field_of_interest: string;
  academic_score: string;
  lead_source: string;
  notes: string;
  profiles?: { first_name: string; last_name: string; } | null;
}

interface LeadNote {
  id: string;
  note: string;
  note_type: string;
  is_important: boolean;
  created_at: string;
  created_by: string;
  profiles?: { first_name: string; last_name: string; };
}

interface Counselor {
  id: string;
  profiles?: { first_name: string; last_name: string; } | null;
}

const stageConfig = {
  hot: { color: 'bg-red-500', label: 'Hot', icon: TrendingUp },
  warm: { color: 'bg-orange-500', label: 'Warm', icon: Clock },
  cold: { color: 'bg-blue-500', label: 'Cold', icon: TrendingDown },
  converted: { color: 'bg-green-500', label: 'Student', icon: CheckCircle }
};

const priorityConfig = {
  high: { color: 'destructive', label: 'High Priority' },
  medium: { color: 'secondary', label: 'Medium Priority' },
  low: { color: 'outline', label: 'Low Priority' }
};

export function LeadLifecycleAdmin() {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [counselors, setCounselors] = useState<Counselor[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [stageFilter, setStageFilter] = useState<string>('all');
  const [priorityFilter, setPriorityFilter] = useState<string>('all');
  const [selectedLead, setSelectedLead] = useState<Lead | null>(null);
  const [leadNotes, setLeadNotes] = useState<LeadNote[]>([]);
  const [newNote, setNewNote] = useState('');
  const [noteType, setNoteType] = useState('general');
  const [isImportant, setIsImportant] = useState(false);
  const { toast } = useToast();

  const fetchLeads = async () => {
    try {
      const { data, error } = await supabase
        .from('student_leads')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      setLeads(data || []);
    } catch (error: any) {
      console.error('Error fetching leads:', error);
      toast({
        title: 'Error fetching leads',
        description: error.message || 'Failed to load leads',
        variant: 'destructive',
      });
    }
  };

  const fetchCounselors = async () => {
    try {
      // Fetch counselors using a simpler approach
      const { data: roleData, error: roleError } = await supabase
        .from('user_roles')
        .select('user_id')
        .eq('role', 'counselor');

      if (roleError) throw roleError;

      if (!roleData || roleData.length === 0) {
        setCounselors([]);
        return;
      }

      const counselorIds = roleData.map(r => r.user_id);

      const { data: profileData, error: profileError } = await supabase
        .from('profiles')
        .select('user_id, first_name, last_name')
        .in('user_id', counselorIds);

      if (profileError) throw profileError;
      
      const counselorData = profileData?.map(item => ({
        id: item.user_id,
        profiles: { first_name: item.first_name, last_name: item.last_name }
      })) || [];
      
      setCounselors(counselorData);
    } catch (error: any) {
      console.error('Error fetching counselors:', error);
      toast({
        title: 'Error fetching counselors',
        description: error.message || 'Failed to load counselors',
        variant: 'destructive',
      });
    }
  };

  const fetchLeadNotes = async (leadId: string) => {
    try {
      const { data, error } = await supabase
        .from('lead_notes')
        .select('*')
        .eq('lead_id', leadId)
        .order('created_at', { ascending: false });

      if (error) throw error;
      setLeadNotes(data || []);
    } catch (error: any) {
      console.error('Error fetching lead notes:', error);
      toast({
        title: 'Error fetching notes',
        description: error.message || 'Failed to load notes',
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
      toast({
        title: 'Success',
        description: `Lead stage updated to ${stageConfig[newStage as keyof typeof stageConfig].label}`,
      });
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message,
        variant: 'destructive',
      });
    }
  };

  const assignCounselor = async (leadId: string, counselorId: string) => {
    try {
      const { error } = await supabase
        .from('student_leads')
        .update({ 
          assigned_counselor_id: counselorId,
          last_activity_at: new Date().toISOString()
        })
        .eq('id', leadId);

      if (error) throw error;

      await fetchLeads();
      toast({
        title: 'Success',
        description: 'Counselor assigned successfully',
      });
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message,
        variant: 'destructive',
      });
    }
  };

  const addNote = async () => {
    if (!selectedLead || !newNote.trim()) return;

    try {
      const { error } = await supabase
        .from('lead_notes')
        .insert({
          lead_id: selectedLead.id,
          note: newNote,
          note_type: noteType,
          is_important: isImportant,
          created_by: (await supabase.auth.getUser()).data.user?.id
        });

      if (error) throw error;

      setNewNote('');
      setNoteType('general');
      setIsImportant(false);
      await fetchLeadNotes(selectedLead.id);
      
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

  useEffect(() => {
    const initializeData = async () => {
      setLoading(true);
      try {
        await Promise.all([
          fetchLeads(),
          fetchCounselors()
        ]);
      } catch (error) {
        console.error('Error initializing lead lifecycle data:', error);
      } finally {
        setLoading(false);
      }
    };

    initializeData();
  }, []);

  const filteredLeads = leads.filter(lead => {
    const matchesSearch = !searchQuery || 
      `${lead.first_name} ${lead.last_name} ${lead.email}`.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesStage = stageFilter === 'all' || lead.lead_stage === stageFilter;
    const matchesPriority = priorityFilter === 'all' || lead.priority_level === priorityFilter;
    
    return matchesSearch && matchesStage && matchesPriority;
  });

  const stageStats = leads.reduce((acc, lead) => {
    acc[lead.lead_stage] = (acc[lead.lead_stage] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-center p-8">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
          <span className="ml-2">Loading Lead Lifecycle Management...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Lead Lifecycle Management</h1>
          <p className="text-muted-foreground">Comprehensive lead management from Hot → Warm → Cold → Student</p>
        </div>
        <div className="text-sm text-muted-foreground">
          {leads.length} leads • {counselors.length} counselors
        </div>
      </div>

      {/* Stats Overview */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        {Object.entries(stageConfig).map(([stage, config]) => {
          const Icon = config.icon;
          const count = stageStats[stage] || 0;
          return (
            <Card key={stage}>
              <CardContent className="p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-muted-foreground">{config.label}</p>
                    <p className="text-2xl font-bold">{count}</p>
                  </div>
                  <div className={`p-3 rounded-full ${config.color} text-white`}>
                    <Icon className="h-4 w-4" />
                  </div>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Main Content Tabs */}
      <Tabs defaultValue="overview" className="space-y-6">
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="overview">Lead Overview</TabsTrigger>
          <TabsTrigger value="add-lead">Add New Lead</TabsTrigger>
          <TabsTrigger value="bulk-upload">Bulk Upload</TabsTrigger>
          <TabsTrigger value="assignments">Assignments</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Users className="h-5 w-5" />
                Lead Management
              </CardTitle>
              <CardDescription>
                Manage your leads through their lifecycle: Hot → Warm → Cold → Student
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex gap-4 mb-6">
                <div className="flex-1">
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground h-4 w-4" />
                    <Input
                      placeholder="Search leads by name or email..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="pl-10"
                    />
                  </div>
                </div>
                <Select value={stageFilter} onValueChange={setStageFilter}>
                  <SelectTrigger className="w-40">
                    <SelectValue placeholder="Stage" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Stages</SelectItem>
                    <SelectItem value="hot">Hot</SelectItem>
                    <SelectItem value="warm">Warm</SelectItem>
                    <SelectItem value="cold">Cold</SelectItem>
                    <SelectItem value="converted">Converted</SelectItem>
                  </SelectContent>
                </Select>
                <Select value={priorityFilter} onValueChange={setPriorityFilter}>
                  <SelectTrigger className="w-40">
                    <SelectValue placeholder="Priority" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Priorities</SelectItem>
                    <SelectItem value="high">High</SelectItem>
                    <SelectItem value="medium">Medium</SelectItem>
                    <SelectItem value="low">Low</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Leads Grid */}
              <div className="grid gap-4">
                {filteredLeads.map((lead) => {
                  const stageInfo = stageConfig[lead.lead_stage];
                  const priorityInfo = priorityConfig[lead.priority_level];
                  const counselor = counselors.find(c => c.id === lead.assigned_counselor_id);
                  
                  return (
                    <Card key={lead.id} className="hover:shadow-md transition-shadow">
                      <CardContent className="p-6">
                        <div className="flex items-start justify-between">
                          <div className="flex-1">
                            <div className="flex items-center gap-3 mb-3">
                              <h3 className="font-semibold text-lg">
                                {lead.first_name} {lead.last_name}
                              </h3>
                              <Badge className={`${stageInfo.color} text-white`}>
                                {stageInfo.label}
                              </Badge>
                              <Badge variant={priorityInfo.color as any}>
                                {priorityInfo.label}
                              </Badge>
                            </div>
                            
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
                              <div className="flex items-center gap-2">
                                <Mail className="h-4 w-4 text-muted-foreground" />
                                {lead.email}
                              </div>
                              <div className="flex items-center gap-2">
                                <Phone className="h-4 w-4 text-muted-foreground" />
                                {lead.phone}
                              </div>
                              <div className="flex items-center gap-2">
                                <GraduationCap className="h-4 w-4 text-muted-foreground" />
                                {lead.field_of_interest || 'Not specified'}
                              </div>
                            </div>

                            <div className="flex items-center gap-4 mt-3 text-sm text-muted-foreground">
                              <span>Created: {format(new Date(lead.created_at), 'MMM dd, yyyy')}</span>
                              <span>Last Activity: {format(new Date(lead.last_activity_at), 'MMM dd, yyyy')}</span>
                              {counselor && (
                                <span>Counselor: {counselor.profiles?.first_name} {counselor.profiles?.last_name}</span>
                              )}
                            </div>
                          </div>

                          <div className="flex gap-2">
                            {/* Stage Update */}
                            <Select
                              value={lead.lead_stage}
                              onValueChange={(value) => updateLeadStage(lead.id, value)}
                            >
                              <SelectTrigger className="w-32">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="hot">Hot</SelectItem>
                                <SelectItem value="warm">Warm</SelectItem>
                                <SelectItem value="cold">Cold</SelectItem>
                                <SelectItem value="converted">Student</SelectItem>
                              </SelectContent>
                            </Select>

                            {/* Counselor Assignment */}
                            <Select
                              value={lead.assigned_counselor_id || 'unassigned'}
                              onValueChange={(value) => value !== 'unassigned' && assignCounselor(lead.id, value)}
                            >
                              <SelectTrigger className="w-40">
                                <SelectValue placeholder="Assign Counselor" />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="unassigned">Unassigned</SelectItem>
                                {counselors.map((counselor) => (
                                  <SelectItem key={counselor.id} value={counselor.id}>
                                    {counselor.profiles?.first_name} {counselor.profiles?.last_name}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>

                            {/* Lead Details Dialog */}
                            <Dialog onOpenChange={(open) => {
                              if (open && lead.id !== selectedLead?.id) {
                                setSelectedLead(lead);
                                fetchLeadNotes(lead.id);
                              }
                            }}>
                              <DialogTrigger asChild>
                                <Button variant="outline" size="sm">
                                  View Details
                                </Button>
                              </DialogTrigger>
                              <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
                                <DialogHeader>
                                  <DialogTitle>
                                    {lead.first_name} {lead.last_name} - Lead Details
                                  </DialogTitle>
                                </DialogHeader>

                                <div className="space-y-6">
                                  {/* Lead Info */}
                                  <div className="grid grid-cols-2 gap-4">
                                    <div>
                                      <h4 className="font-medium mb-2">Contact Information</h4>
                                      <div className="space-y-2 text-sm">
                                        <div className="flex items-center gap-2">
                                          <Mail className="h-4 w-4" />
                                          {lead.email}
                                        </div>
                                        <div className="flex items-center gap-2">
                                          <Phone className="h-4 w-4" />
                                          {lead.phone}
                                        </div>
                                      </div>
                                    </div>
                                    <div>
                                      <h4 className="font-medium mb-2">Academic Details</h4>
                                      <div className="space-y-2 text-sm">
                                        <div>Field: {lead.field_of_interest || 'Not specified'}</div>
                                        <div>Score: {lead.academic_score || 'Not provided'}</div>
                                        <div>Countries: {lead.preferred_countries?.join(', ') || 'Not specified'}</div>
                                      </div>
                                    </div>
                                  </div>

                                  {/* Notes Section */}
                                  <div>
                                    <h4 className="font-medium mb-4">Lead Notes</h4>
                                    
                                    {/* Add Note */}
                                    <div className="space-y-4 p-4 border rounded-lg bg-muted/50">
                                      <div className="flex gap-4">
                                        <Select value={noteType} onValueChange={setNoteType}>
                                          <SelectTrigger className="w-32">
                                            <SelectValue />
                                          </SelectTrigger>
                                          <SelectContent>
                                            <SelectItem value="general">General</SelectItem>
                                            <SelectItem value="call">Call</SelectItem>
                                            <SelectItem value="email">Email</SelectItem>
                                            <SelectItem value="meeting">Meeting</SelectItem>
                                          </SelectContent>
                                        </Select>
                                        <label className="flex items-center gap-2">
                                          <input
                                            type="checkbox"
                                            checked={isImportant}
                                            onChange={(e) => setIsImportant(e.target.checked)}
                                          />
                                          Important
                                        </label>
                                      </div>
                                      <Textarea
                                        placeholder="Add a note..."
                                        value={newNote}
                                        onChange={(e) => setNewNote(e.target.value)}
                                      />
                                      <Button onClick={addNote} size="sm">
                                        Add Note
                                      </Button>
                                    </div>

                                    {/* Notes List */}
                                    <div className="space-y-3 mt-4">
                                      {leadNotes.map((note) => (
                                        <div key={note.id} className="p-3 border rounded-lg">
                                          <div className="flex items-start justify-between">
                                            <div className="flex-1">
                                              <div className="flex items-center gap-2 mb-2">
                                                <Badge variant={note.is_important ? 'destructive' : 'secondary'}>
                                                  {note.note_type}
                                                </Badge>
                                                {note.is_important && (
                                                  <AlertCircle className="h-4 w-4 text-destructive" />
                                                )}
                                              </div>
                                              <p className="text-sm">{note.note}</p>
                                            </div>
                                            <div className="text-xs text-muted-foreground">
                                              {format(new Date(note.created_at), 'MMM dd, HH:mm')}
                                            </div>
                                          </div>
                                        </div>
                                      ))}
                                    </div>
                                  </div>
                                </div>
                              </DialogContent>
                            </Dialog>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>

              {filteredLeads.length === 0 && (
                <div className="text-center py-12">
                  <Users className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                  <h3 className="text-lg font-medium mb-2">No leads found</h3>
                  <p className="text-muted-foreground">
                    {searchQuery || stageFilter !== 'all' || priorityFilter !== 'all'
                      ? 'Try adjusting your filters'
                      : 'Leads will appear here as they register'}
                  </p>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="add-lead">
          <LeadForms />
        </TabsContent>

        <TabsContent value="bulk-upload">
          <BulkLeadUpload />
        </TabsContent>

        <TabsContent value="assignments">
          <AssignmentManagement />
        </TabsContent>
      </Tabs>
    </div>
  );
}