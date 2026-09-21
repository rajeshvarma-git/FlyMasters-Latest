import { useState, useEffect } from 'react';
import { supabase } from '@student/integrations/supabase/client';
import { useToast } from '@student/hooks/use-toast';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@student/components/ui/card';
import { Button } from '@student/components/ui/button';
import { Badge } from '@student/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@student/components/ui/select';
import { Checkbox } from '@student/components/ui/checkbox';
import { Users, UserPlus, Loader2 } from 'lucide-react';

interface Lead {
  id: string;
  first_name: string;
  last_name: string;
  email: string;
  phone: string;
  lead_status: string;
  priority: string;
  created_at: string;
}

interface Counselor {
  user_id: string;
  first_name: string;
  last_name: string;
  email: string;
  current_leads: number;
}

export function BulkLeadAssignment() {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [counselors, setCounselors] = useState<Counselor[]>([]);
  const [selectedLeads, setSelectedLeads] = useState<Set<string>>(new Set());
  const [selectedCounselor, setSelectedCounselor] = useState('');
  const [loading, setLoading] = useState(true);
  const [assigning, setAssigning] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    setLoading(true);
    try {
      await Promise.all([fetchUnassignedLeads(), fetchCounselors()]);
    } catch (error) {
      console.error('Error fetching data:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchUnassignedLeads = async () => {
    try {
      const { data, error } = await supabase
        .from('student_leads')
        .select('*')
        .eq('entity_type', 'lead')
        .is('assigned_counselor_id', null)
        .order('priority', { ascending: false })
        .order('created_at', { ascending: false });

      if (error) throw error;
      setLeads(data || []);
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive"
      });
    }
  };

  const fetchCounselors = async () => {
    try {
      // Get counselors with role
      const { data: counselorRoles, error: rolesError } = await supabase
        .from('user_roles')
        .select('user_id')
        .eq('role', 'counselor');

      if (rolesError) throw rolesError;
      
      const counselorUserIds = counselorRoles?.map(r => r.user_id) || [];
      
      if (counselorUserIds.length === 0) {
        setCounselors([]);
        return;
      }

      // Get counselor profiles and details
      const { data: counselorDetails, error: detailsError } = await supabase
        .from('counselors')
        .select('user_id, id')
        .in('user_id', counselorUserIds)
        .eq('is_active', true);

      if (detailsError) throw detailsError;

      const { data: profiles, error: profilesError } = await supabase
        .from('profiles')
        .select('user_id, first_name, last_name')
        .in('user_id', counselorUserIds);

      if (profilesError) throw profilesError;

      // Get lead counts for each counselor
      const { data: leadCounts, error: countError } = await supabase
        .from('student_leads')
        .select('assigned_counselor_id')
        .eq('entity_type', 'lead')
        .in('assigned_counselor_id', counselorUserIds);

      if (countError) throw countError;

      const countsMap = (leadCounts || []).reduce((acc: Record<string, number>, lead) => {
        acc[lead.assigned_counselor_id] = (acc[lead.assigned_counselor_id] || 0) + 1;
        return acc;
      }, {});

      const counselorsData = (profiles || []).map(profile => {
        const details = (counselorDetails || []).find(d => d.user_id === profile.user_id);
        return {
          user_id: profile.user_id,
          first_name: profile.first_name || '',
          last_name: profile.last_name || '',
          email: `${profile.first_name?.toLowerCase() || ''}@flymasters.com`,
          current_leads: countsMap[profile.user_id] || 0
        };
      });

      setCounselors(counselorsData);
    } catch (error: any) {
      toast({
        title: "Error",
        description: "Failed to fetch counselors",
        variant: "destructive"
      });
    }
  };

  const toggleLeadSelection = (leadId: string) => {
    const newSelection = new Set(selectedLeads);
    if (newSelection.has(leadId)) {
      newSelection.delete(leadId);
    } else {
      newSelection.add(leadId);
    }
    setSelectedLeads(newSelection);
  };

  const selectAll = () => {
    if (selectedLeads.size === leads.length) {
      setSelectedLeads(new Set());
    } else {
      setSelectedLeads(new Set(leads.map(l => l.id)));
    }
  };

  const handleBulkAssignment = async () => {
    if (selectedLeads.size === 0 || !selectedCounselor) {
      toast({
        title: "Error",
        description: "Please select leads and a counselor",
        variant: "destructive"
      });
      return;
    }

    setAssigning(true);
    try {
      const { error } = await supabase
        .from('student_leads')
        .update({ 
          assigned_counselor_id: selectedCounselor,
          status: 'assigned'
        })
        .in('id', Array.from(selectedLeads));

      if (error) throw error;

      toast({
        title: "Success",
        description: `${selectedLeads.size} lead(s) assigned successfully`
      });

      setSelectedLeads(new Set());
      setSelectedCounselor('');
      fetchData();
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive"
      });
    } finally {
      setAssigning(false);
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
    <div className="space-y-6">
      <Card className="glass-card">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Users className="w-5 h-5" />
            Bulk Lead Assignment
          </CardTitle>
          <CardDescription>
            Assign multiple leads to counselors at once
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {/* Counselor Selection */}
            <div className="flex items-end gap-4">
              <div className="flex-1">
                <label className="text-sm font-medium mb-2 block">Select Counselor</label>
                <Select value={selectedCounselor} onValueChange={setSelectedCounselor}>
                  <SelectTrigger>
                    <SelectValue placeholder="Choose a counselor" />
                  </SelectTrigger>
                  <SelectContent>
                    {counselors.map((counselor) => (
                      <SelectItem key={counselor.user_id} value={counselor.user_id}>
                        {counselor.first_name} {counselor.last_name} - {counselor.email}
                        <Badge variant="secondary" className="ml-2">
                          {counselor.current_leads} leads
                        </Badge>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              
              <Button 
                onClick={handleBulkAssignment} 
                disabled={selectedLeads.size === 0 || !selectedCounselor || assigning}
              >
                {assigning ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Assigning...
                  </>
                ) : (
                  <>
                    <UserPlus className="w-4 h-4 mr-2" />
                    Assign {selectedLeads.size} Lead(s)
                  </>
                )}
              </Button>
            </div>

            {/* Leads List */}
            <div className="border rounded-lg">
              <div className="p-4 border-b bg-muted/50 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Checkbox
                    checked={selectedLeads.size === leads.length && leads.length > 0}
                    onCheckedChange={selectAll}
                  />
                  <span className="text-sm font-medium">
                    Select All ({selectedLeads.size} of {leads.length} selected)
                  </span>
                </div>
              </div>

              <div className="divide-y max-h-[500px] overflow-y-auto">
                {leads.length === 0 ? (
                  <div className="p-8 text-center text-muted-foreground">
                    No unassigned leads available
                  </div>
                ) : (
                  leads.map((lead) => (
                    <div key={lead.id} className="p-4 hover:bg-muted/50 transition-colors">
                      <div className="flex items-center gap-4">
                        <Checkbox
                          checked={selectedLeads.has(lead.id)}
                          onCheckedChange={() => toggleLeadSelection(lead.id)}
                        />
                        
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-1">
                            <span className="font-medium">
                              {lead.first_name} {lead.last_name}
                            </span>
                            {lead.lead_status && (
                              <Badge variant="outline">{lead.lead_status}</Badge>
                            )}
                            <Badge 
                              className={
                                lead.priority === 'high' ? 'bg-red-100 text-red-800' :
                                lead.priority === 'medium' ? 'bg-yellow-100 text-yellow-800' :
                                'bg-green-100 text-green-800'
                              }
                            >
                              {lead.priority}
                            </Badge>
                          </div>
                          <div className="text-sm text-muted-foreground">
                            {lead.email} • {lead.phone}
                          </div>
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
