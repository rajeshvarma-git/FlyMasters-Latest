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
import { Checkbox } from '@student/components/ui/checkbox';
import { 
  Users, 
  Search, 
  Filter, 
  UserPlus, 
  Calendar,
  TrendingUp,
  BarChart3,
  RefreshCw,
  CheckCircle,
  AlertCircle,
  Phone,
  Mail,
  Award,
  Target,
  Clock,
  ArrowRight,
  User,
  Settings
} from 'lucide-react';
import { format } from 'date-fns';

interface Lead {
  id: string;
  first_name: string;
  last_name: string;
  email: string;
  phone: string;
  lead_stage: string;
  priority_level: string;
  assigned_counselor_id: string | null;
  created_at: string;
  last_activity_at: string;
  field_of_interest: string;
  preferred_countries: string[];
  academic_score: string;
}

interface Counselor {
  id: string;
  profiles: { first_name: string; last_name: string; } | null;
  specializations: string[];
  experience_years: number;
  rating: number;
  is_active: boolean;
  leadCount?: number;
  recentAssignments?: number;
  successRate?: number;
  capacity?: number;
}

interface Assignment {
  id: string;
  lead_id: string;
  counselor_id: string;
  assigned_at: string;
  assigned_by: string;
  is_active: boolean;
  reassignment_reason?: string;
  lead?: Lead;
  counselor?: Counselor;
}

export function AssignmentManagement() {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [counselors, setCounselors] = useState<Counselor[]>([]);
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [selectedLeads, setSelectedLeads] = useState<string[]>([]);
  const [selectedCounselor, setSelectedCounselor] = useState<string>('');
  const [searchQuery, setSearchQuery] = useState('');
  const [filterStage, setFilterStage] = useState<string>('all');
  const [filterAssigned, setFilterAssigned] = useState<string>('all');
  const [loading, setLoading] = useState(true);
  const [reassignmentReason, setReassignmentReason] = useState('');
  const [showReassignDialog, setShowReassignDialog] = useState(false);
  const [reassignmentData, setReassignmentData] = useState<{leadId: string, newCounselorId: string} | null>(null);
  const { toast } = useToast();

  const fetchData = async () => {
    try {
      setLoading(true);
      await Promise.all([
        fetchLeads(),
        fetchCounselors(),
        fetchAssignments()
      ]);
    } catch (error) {
      console.error('Error fetching assignment data:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchLeads = async () => {
    const { data, error } = await supabase
      .from('student_leads')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) throw error;
    setLeads(data || []);
  };

  const fetchCounselors = async () => {
    try {
      // Get counselor role users
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

      // Get counselor profiles and data
      const { data: counselorData, error: counselorError } = await supabase
        .from('counselors')
        .select('*')
        .in('user_id', counselorIds);

      const { data: profileData, error: profileError } = await supabase
        .from('profiles')
        .select('user_id, first_name, last_name')
        .in('user_id', counselorIds);

      if (counselorError) throw counselorError;
      if (profileError) throw profileError;

      // Get lead counts for each counselor
      const { data: leadCounts } = await supabase
        .from('student_leads')
        .select('assigned_counselor_id')
        .not('assigned_counselor_id', 'is', null);

      const leadCountsMap = leadCounts?.reduce((acc, lead) => {
        acc[lead.assigned_counselor_id] = (acc[lead.assigned_counselor_id] || 0) + 1;
        return acc;
      }, {} as Record<string, number>) || {};

      // Combine counselor data
      const combinedCounselors = counselorData?.map(counselor => {
        const profile = profileData?.find(p => p.user_id === counselor.user_id);
        return {
          id: counselor.user_id,
          profiles: profile ? { first_name: profile.first_name, last_name: profile.last_name } : null,
          specializations: counselor.specializations || [],
          experience_years: counselor.experience_years || 0,
          rating: counselor.rating || 0,
          is_active: counselor.is_active !== false,
          leadCount: leadCountsMap[counselor.user_id] || 0,
          recentAssignments: 0, // TODO: Calculate from assignment history
          successRate: 85, // TODO: Calculate from actual data
          capacity: 20 // TODO: Make this configurable
        };
      }) || [];

      setCounselors(combinedCounselors);
    } catch (error: any) {
      console.error('Error fetching counselors:', error);
      toast({
        title: 'Error fetching counselors',
        description: error.message,
        variant: 'destructive',
      });
    }
  };

  const fetchAssignments = async () => {
    const { data, error } = await supabase
      .from('lead_assignments')
      .select('*')
      .eq('is_active', true)
      .order('assigned_at', { ascending: false });

    if (error) throw error;
    setAssignments(data || []);
  };

  const handleBulkAssignment = async () => {
    if (selectedLeads.length === 0 || !selectedCounselor) {
      toast({
        title: 'Selection Required',
        description: 'Please select leads and a counselor',
        variant: 'destructive',
      });
      return;
    }

    try {
      // Update leads
      const { error: updateError } = await supabase
        .from('student_leads')
        .update({ 
          assigned_counselor_id: selectedCounselor,
          last_activity_at: new Date().toISOString()
        })
        .in('id', selectedLeads);

      if (updateError) throw updateError;

      // Create assignment records
      const assignmentRecords = selectedLeads.map(leadId => ({
        lead_id: leadId,
        counselor_id: selectedCounselor,
        assigned_by: null, // Will be handled by RLS
        is_active: true
      }));

      const { error: assignmentError } = await supabase
        .from('lead_assignments')
        .insert(assignmentRecords);

      if (assignmentError) throw assignmentError;

      setSelectedLeads([]);
      setSelectedCounselor('');
      await fetchData();

      toast({
        title: 'Bulk Assignment Successful',
        description: `Assigned ${selectedLeads.length} leads to counselor`,
      });
    } catch (error: any) {
      toast({
        title: 'Assignment Failed',
        description: error.message,
        variant: 'destructive',
      });
    }
  };

  const handleReassignment = async () => {
    if (!reassignmentData || !reassignmentReason.trim()) {
      toast({
        title: 'Information Required',
        description: 'Please provide a reason for reassignment',
        variant: 'destructive',
      });
      return;
    }

    try {
      // End current assignment
      const { error: endError } = await supabase
        .from('lead_assignments')
        .update({ 
          is_active: false,
          ended_at: new Date().toISOString(),
          reassignment_reason: reassignmentReason
        })
        .eq('lead_id', reassignmentData.leadId)
        .eq('is_active', true);

      if (endError) throw endError;

      // Create new assignment
      const { error: newError } = await supabase
        .from('lead_assignments')
        .insert({
          lead_id: reassignmentData.leadId,
          counselor_id: reassignmentData.newCounselorId,
          assigned_by: null, // Will be handled by RLS
          is_active: true
        });

      if (newError) throw newError;

      // Update lead
      const { error: updateError } = await supabase
        .from('student_leads')
        .update({ 
          assigned_counselor_id: reassignmentData.newCounselorId,
          last_activity_at: new Date().toISOString()
        })
        .eq('id', reassignmentData.leadId);

      if (updateError) throw updateError;

      setShowReassignDialog(false);
      setReassignmentData(null);
      setReassignmentReason('');
      await fetchData();

      toast({
        title: 'Reassignment Successful',
        description: 'Lead has been reassigned successfully',
      });
    } catch (error: any) {
      toast({
        title: 'Reassignment Failed',
        description: error.message,
        variant: 'destructive',
      });
    }
  };

  const handleAutoAssignment = async () => {
    try {
      const unassignedLeads = leads.filter(lead => !lead.assigned_counselor_id);
      const activeCounselors = counselors.filter(c => c.is_active);

      if (unassignedLeads.length === 0) {
        toast({
          title: 'No Unassigned Leads',
          description: 'All leads are already assigned',
        });
        return;
      }

      if (activeCounselors.length === 0) {
        toast({
          title: 'No Active Counselors',
          description: 'No counselors available for assignment',
          variant: 'destructive',
        });
        return;
      }

      // Simple round-robin assignment based on current workload
      const sortedCounselors = [...activeCounselors].sort((a, b) => (a.leadCount || 0) - (b.leadCount || 0));
      
      const assignments = unassignedLeads.map((lead, index) => {
        const counselor = sortedCounselors[index % sortedCounselors.length];
        return {
          leadId: lead.id,
          counselorId: counselor.id
        };
      });

      // Execute assignments
      for (const assignment of assignments) {
        await supabase
          .from('student_leads')
          .update({ 
            assigned_counselor_id: assignment.counselorId,
            last_activity_at: new Date().toISOString()
          })
          .eq('id', assignment.leadId);

        await supabase
          .from('lead_assignments')
          .insert({
            lead_id: assignment.leadId,
            counselor_id: assignment.counselorId,
            assigned_by: null,
            is_active: true
          });
      }

      await fetchData();

      toast({
        title: 'Auto-Assignment Complete',
        description: `Assigned ${assignments.length} leads automatically`,
      });
    } catch (error: any) {
      toast({
        title: 'Auto-Assignment Failed',
        description: error.message,
        variant: 'destructive',
      });
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const filteredLeads = leads.filter(lead => {
    const matchesSearch = !searchQuery || 
      `${lead.first_name} ${lead.last_name} ${lead.email}`.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesStage = filterStage === 'all' || lead.lead_stage === filterStage;
    const matchesAssigned = filterAssigned === 'all' || 
      (filterAssigned === 'assigned' && lead.assigned_counselor_id) ||
      (filterAssigned === 'unassigned' && !lead.assigned_counselor_id);
    
    return matchesSearch && matchesStage && matchesAssigned;
  });

  const assignmentStats = {
    totalLeads: leads.length,
    assignedLeads: leads.filter(l => l.assigned_counselor_id).length,
    unassignedLeads: leads.filter(l => !l.assigned_counselor_id).length,
    activeCounselors: counselors.filter(c => c.is_active).length,
    totalAssignments: assignments.length
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
        <span className="ml-2">Loading Assignment Management...</span>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">Assignment Management</h2>
          <p className="text-muted-foreground">Manage lead assignments and counselor workloads</p>
        </div>
        <div className="flex gap-2">
          <Button onClick={handleAutoAssignment} variant="outline">
            <RefreshCw className="h-4 w-4 mr-2" />
            Auto-Assign
          </Button>
          <Button onClick={() => fetchData()} variant="outline">
            <RefreshCw className="h-4 w-4 mr-2" />
            Refresh
          </Button>
        </div>
      </div>

      {/* Stats Overview */}
      <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">Total Leads</p>
                <p className="text-2xl font-bold">{assignmentStats.totalLeads}</p>
              </div>
              <Users className="h-8 w-8 text-muted-foreground" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">Assigned</p>
                <p className="text-2xl font-bold text-green-600">{assignmentStats.assignedLeads}</p>
              </div>
              <CheckCircle className="h-8 w-8 text-green-600" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">Unassigned</p>
                <p className="text-2xl font-bold text-orange-600">{assignmentStats.unassignedLeads}</p>
              </div>
              <AlertCircle className="h-8 w-8 text-orange-600" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">Active Counselors</p>
                <p className="text-2xl font-bold">{assignmentStats.activeCounselors}</p>
              </div>
              <User className="h-8 w-8 text-muted-foreground" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">Assignment Rate</p>
                <p className="text-2xl font-bold">
                  {assignmentStats.totalLeads > 0 
                    ? Math.round((assignmentStats.assignedLeads / assignmentStats.totalLeads) * 100)
                    : 0}%
                </p>
              </div>
              <Target className="h-8 w-8 text-muted-foreground" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Main Content */}
      <Tabs defaultValue="assignments" className="space-y-6">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="assignments">Assignments</TabsTrigger>
          <TabsTrigger value="counselors">Counselor Workload</TabsTrigger>
          <TabsTrigger value="bulk">Bulk Actions</TabsTrigger>
        </TabsList>

        <TabsContent value="assignments" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Lead Assignments</CardTitle>
              <CardDescription>View and manage individual lead assignments</CardDescription>
            </CardHeader>
            <CardContent>
              {/* Filters */}
              <div className="flex gap-4 mb-6">
                <div className="flex-1">
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground h-4 w-4" />
                    <Input
                      placeholder="Search leads..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="pl-10"
                    />
                  </div>
                </div>
                <Select value={filterStage} onValueChange={setFilterStage}>
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
                <Select value={filterAssigned} onValueChange={setFilterAssigned}>
                  <SelectTrigger className="w-40">
                    <SelectValue placeholder="Assignment" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Leads</SelectItem>
                    <SelectItem value="assigned">Assigned</SelectItem>
                    <SelectItem value="unassigned">Unassigned</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Leads List */}
              <div className="space-y-3">
                {filteredLeads.map((lead) => {
                  const counselor = counselors.find(c => c.id === lead.assigned_counselor_id);
                  
                  return (
                    <Card key={lead.id}>
                      <CardContent className="p-4">
                        <div className="flex items-center justify-between">
                          <div className="flex-1">
                            <div className="flex items-center gap-3 mb-2">
                              <h4 className="font-medium">
                                {lead.first_name} {lead.last_name}
                              </h4>
                              <Badge variant={
                                lead.lead_stage === 'hot' ? 'destructive' :
                                lead.lead_stage === 'warm' ? 'secondary' :
                                lead.lead_stage === 'cold' ? 'outline' : 'default'
                              }>
                                {lead.lead_stage}
                              </Badge>
                              <Badge variant={
                                lead.priority_level === 'high' ? 'destructive' :
                                lead.priority_level === 'medium' ? 'secondary' : 'outline'
                              }>
                                {lead.priority_level} priority
                              </Badge>
                            </div>
                            
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm text-muted-foreground">
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
                                {format(new Date(lead.created_at), 'MMM dd, yyyy')}
                              </div>
                            </div>
                          </div>

                          <div className="flex items-center gap-3">
                            {counselor ? (
                              <div className="text-right">
                                <p className="font-medium text-sm">
                                  {counselor.profiles?.first_name} {counselor.profiles?.last_name}
                                </p>
                                <p className="text-xs text-muted-foreground">
                                  {counselor.leadCount} leads
                                </p>
                              </div>
                            ) : (
                              <Badge variant="outline">Unassigned</Badge>
                            )}

                            <Select
                              value={lead.assigned_counselor_id || 'unassigned'}
                              onValueChange={(value) => {
                                if (value === 'unassigned') return;
                                if (value !== lead.assigned_counselor_id) {
                                  setReassignmentData({
                                    leadId: lead.id,
                                    newCounselorId: value
                                  });
                                  setShowReassignDialog(true);
                                }
                              }}
                            >
                              <SelectTrigger className="w-48">
                                <SelectValue placeholder="Assign Counselor" />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="unassigned">Unassigned</SelectItem>
                                {counselors.filter(c => c.is_active).map((counselor) => (
                                  <SelectItem key={counselor.id} value={counselor.id}>
                                    {counselor.profiles?.first_name} {counselor.profiles?.last_name}
                                    ({counselor.leadCount || 0} leads)
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
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
                    Try adjusting your search filters
                  </p>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="counselors" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Counselor Workload</CardTitle>
              <CardDescription>Monitor counselor assignments and capacity</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {counselors.map((counselor) => {
                  const workloadPercentage = Math.min(((counselor.leadCount || 0) / (counselor.capacity || 20)) * 100, 100);
                  
                  return (
                    <Card key={counselor.id}>
                      <CardContent className="p-4">
                        <div className="flex items-center justify-between mb-3">
                          <div className="flex items-center gap-3">
                            <div>
                              <h4 className="font-medium">
                                {counselor.profiles?.first_name} {counselor.profiles?.last_name}
                              </h4>
                              <p className="text-sm text-muted-foreground">
                                {counselor.experience_years} years experience • Rating: {counselor.rating}/5
                              </p>
                            </div>
                            <Badge variant={counselor.is_active ? 'default' : 'secondary'}>
                              {counselor.is_active ? 'Active' : 'Inactive'}
                            </Badge>
                          </div>
                          
                          <div className="text-right">
                            <p className="font-medium">
                              {counselor.leadCount || 0} / {counselor.capacity || 20} leads
                            </p>
                            <p className="text-sm text-muted-foreground">
                              {workloadPercentage.toFixed(0)}% capacity
                            </p>
                          </div>
                        </div>
                        
                        <div className="space-y-2">
                          <div className="flex justify-between text-sm">
                            <span>Workload</span>
                            <span>{workloadPercentage.toFixed(0)}%</span>
                          </div>
                          <Progress 
                            value={workloadPercentage}
                            className={workloadPercentage > 90 ? 'text-red-600' : 
                                     workloadPercentage > 70 ? 'text-orange-600' : 'text-green-600'}
                          />
                        </div>
                        
                        {counselor.specializations.length > 0 && (
                          <div className="mt-3">
                            <p className="text-sm font-medium mb-1">Specializations:</p>
                            <div className="flex flex-wrap gap-1">
                              {counselor.specializations.map((spec, index) => (
                                <Badge key={index} variant="outline" className="text-xs">
                                  {spec}
                                </Badge>
                              ))}
                            </div>
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="bulk" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Bulk Assignment Actions</CardTitle>
              <CardDescription>Assign multiple leads to counselors at once</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-6">
                {/* Bulk Assignment */}
                <div className="space-y-4">
                  <h3 className="font-medium">Bulk Lead Assignment</h3>
                  
                  <div className="flex gap-4 items-end">
                    <div className="flex-1">
                      <label className="text-sm font-medium mb-2 block">Select Counselor</label>
                      <Select value={selectedCounselor} onValueChange={setSelectedCounselor}>
                        <SelectTrigger>
                          <SelectValue placeholder="Choose counselor..." />
                        </SelectTrigger>
                        <SelectContent>
                          {counselors.filter(c => c.is_active).map((counselor) => (
                            <SelectItem key={counselor.id} value={counselor.id}>
                              {counselor.profiles?.first_name} {counselor.profiles?.last_name}
                              ({counselor.leadCount || 0} current leads)
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    
                    <Button 
                      onClick={handleBulkAssignment}
                      disabled={selectedLeads.length === 0 || !selectedCounselor}
                    >
                      <UserPlus className="h-4 w-4 mr-2" />
                      Assign {selectedLeads.length} Leads
                    </Button>
                  </div>
                </div>

                {/* Lead Selection */}
                <div className="space-y-4">
                  <h3 className="font-medium">Select Unassigned Leads</h3>
                  
                  <div className="max-h-80 overflow-y-auto border rounded-lg">
                    <div className="space-y-2 p-4">
                      {leads.filter(lead => !lead.assigned_counselor_id).map((lead) => (
                        <div key={lead.id} className="flex items-center space-x-3 p-2 hover:bg-muted/50 rounded">
                          <Checkbox
                            checked={selectedLeads.includes(lead.id)}
                            onCheckedChange={(checked) => {
                              if (checked) {
                                setSelectedLeads([...selectedLeads, lead.id]);
                              } else {
                                setSelectedLeads(selectedLeads.filter(id => id !== lead.id));
                              }
                            }}
                          />
                          <div className="flex-1">
                            <p className="font-medium">
                              {lead.first_name} {lead.last_name}
                            </p>
                            <p className="text-sm text-muted-foreground">
                              {lead.email} • {lead.lead_stage} • Created {format(new Date(lead.created_at), 'MMM dd')}
                            </p>
                          </div>
                          <Badge variant={
                            lead.priority_level === 'high' ? 'destructive' :
                            lead.priority_level === 'medium' ? 'secondary' : 'outline'
                          }>
                            {lead.priority_level}
                          </Badge>
                        </div>
                      ))}
                    </div>
                  </div>
                  
                  <div className="flex justify-between text-sm text-muted-foreground">
                    <span>{selectedLeads.length} leads selected</span>
                    <div className="space-x-2">
                      <Button 
                        variant="outline" 
                        size="sm"
                        onClick={() => {
                          const unassignedIds = leads.filter(lead => !lead.assigned_counselor_id).map(lead => lead.id);
                          setSelectedLeads(unassignedIds);
                        }}
                      >
                        Select All
                      </Button>
                      <Button 
                        variant="outline" 
                        size="sm"
                        onClick={() => setSelectedLeads([])}
                      >
                        Clear
                      </Button>
                    </div>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Reassignment Dialog */}
      <Dialog open={showReassignDialog} onOpenChange={setShowReassignDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reassign Lead</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium mb-2 block">Reason for Reassignment</label>
              <Textarea
                placeholder="Please provide a reason for this reassignment..."
                value={reassignmentReason}
                onChange={(e) => setReassignmentReason(e.target.value)}
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setShowReassignDialog(false)}>
                Cancel
              </Button>
              <Button onClick={handleReassignment}>
                Confirm Reassignment
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}