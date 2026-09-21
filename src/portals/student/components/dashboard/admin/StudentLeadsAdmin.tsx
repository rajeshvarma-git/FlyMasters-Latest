import { useState, useEffect } from 'react';
import { supabase } from '@student/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@student/components/ui/card';
import { Button } from '@student/components/ui/button';
import { Input } from '@student/components/ui/input';
import { Badge } from '@student/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@student/components/ui/select';
import { useToast } from '@student/components/ui/use-toast';
import { Users, Search, Filter, Phone, Mail, Calendar, DollarSign } from 'lucide-react';
import { Tables } from '@student/integrations/supabase/types';

type StudentLead = Tables<'student_leads'>;

export function StudentLeadsAdmin() {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [leads, setLeads] = useState<StudentLead[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');

  useEffect(() => {
    fetchLeads();
  }, []);

  const fetchLeads = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('student_leads')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      setLeads(data || []);
    } catch (error: any) {
      console.error('Error fetching leads:', error);
      toast({
        title: "Error",
        description: "Failed to load student leads.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const updateLeadStatus = async (leadId: string, status: string) => {
    try {
      const { error } = await supabase
        .from('student_leads')
        .update({ status })
        .eq('id', leadId);

      if (error) throw error;

      setLeads(prev => prev.map(lead => 
        lead.id === leadId ? { ...lead, status } : lead
      ));

      toast({
        title: "Status updated",
        description: "Lead status has been updated successfully.",
      });
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    }
  };

  const filteredLeads = leads.filter(lead => {
    const matchesSearch = searchQuery === '' || 
      lead.first_name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      lead.last_name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      lead.email?.toLowerCase().includes(searchQuery.toLowerCase());
    
    const matchesStatus = statusFilter === 'all' || lead.status === statusFilter;
    
    return matchesSearch && matchesStatus;
  });

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'new':
        return <Badge className="bg-blue-100 text-blue-800">New</Badge>;
      case 'contacted':
        return <Badge className="bg-yellow-100 text-yellow-800">Contacted</Badge>;
      case 'qualified':
        return <Badge className="bg-green-100 text-green-800">Qualified</Badge>;
      case 'converted':
        return <Badge className="bg-purple-100 text-purple-800">Converted</Badge>;
      case 'closed':
        return <Badge className="bg-gray-100 text-gray-800">Closed</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <h2 className="text-2xl font-bold">Student Leads</h2>
          <div className="flex gap-2">
            <div className="w-64 h-10 bg-muted/20 rounded animate-pulse"></div>
            <div className="w-32 h-10 bg-muted/20 rounded animate-pulse"></div>
          </div>
        </div>
        
        <div className="grid gap-4">
          {[...Array(5)].map((_, i) => (
            <Card key={i} className="glass-card animate-pulse">
              <CardContent className="p-6">
                <div className="h-6 bg-muted/20 rounded w-1/3 mb-2"></div>
                <div className="h-4 bg-muted/20 rounded w-1/2 mb-4"></div>
                <div className="flex gap-2">
                  <div className="h-6 bg-muted/20 rounded w-20"></div>
                  <div className="h-6 bg-muted/20 rounded w-20"></div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold">Student Leads</h2>
        <div className="flex gap-2">
          <div className="relative">
            <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search leads..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10 w-64"
            />
          </div>
          
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-32">
              <Filter className="h-4 w-4 mr-2" />
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Status</SelectItem>
              <SelectItem value="new">New</SelectItem>
              <SelectItem value="contacted">Contacted</SelectItem>
              <SelectItem value="qualified">Qualified</SelectItem>
              <SelectItem value="converted">Converted</SelectItem>
              <SelectItem value="closed">Closed</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="grid gap-4">
        {filteredLeads.length === 0 ? (
          <Card className="glass-card">
            <CardContent className="p-12 text-center">
              <Users className="w-16 h-16 text-muted-foreground mx-auto mb-4" />
              <h3 className="text-xl font-semibold mb-2">No Leads Found</h3>
              <p className="text-muted-foreground">
                {searchQuery || statusFilter !== 'all' 
                  ? 'No leads match your current filters.'
                  : 'No student leads have been created yet.'
                }
              </p>
            </CardContent>
          </Card>
        ) : (
          filteredLeads.map((lead) => (
            <Card key={lead.id} className="glass-card">
              <CardHeader>
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <CardTitle className="text-lg">
                      {lead.first_name} {lead.last_name}
                    </CardTitle>
                    <CardDescription className="flex items-center gap-4 mt-1">
                      <span className="flex items-center gap-1">
                        <Mail className="w-4 h-4" />
                        {lead.email}
                      </span>
                      {lead.phone && (
                        <span className="flex items-center gap-1">
                          <Phone className="w-4 h-4" />
                          {lead.phone}
                        </span>
                      )}
                    </CardDescription>
                  </div>

                  <div className="flex items-center gap-2">
                    {getStatusBadge(lead.status)}
                    <Select 
                      value={lead.status} 
                      onValueChange={(value) => updateLeadStatus(lead.id, value)}
                    >
                      <SelectTrigger className="w-32">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="new">New</SelectItem>
                        <SelectItem value="contacted">Contacted</SelectItem>
                        <SelectItem value="qualified">Qualified</SelectItem>
                        <SelectItem value="converted">Converted</SelectItem>
                        <SelectItem value="closed">Closed</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </CardHeader>

              <CardContent>
                <div className="grid gap-4 md:grid-cols-2">
                  <div>
                    <h4 className="font-medium mb-2">Study Preferences</h4>
                    <div className="space-y-1 text-sm">
                      {lead.preferred_countries && (
                        <div>
                          <span className="text-muted-foreground">Countries:</span>{' '}
                          {Array.isArray(lead.preferred_countries) 
                            ? lead.preferred_countries.join(', ')
                            : lead.preferred_countries
                          }
                        </div>
                      )}
                      {lead.field_of_interest && (
                        <div>
                          <span className="text-muted-foreground">Field:</span> {lead.field_of_interest}
                        </div>
                      )}
                      {lead.qualification_level && (
                        <div>
                          <span className="text-muted-foreground">Level:</span> {lead.qualification_level}
                        </div>
                      )}
                      {lead.current_qualification && (
                        <div>
                          <span className="text-muted-foreground">Current:</span> {lead.current_qualification}
                        </div>
                      )}
                    </div>
                  </div>

                  <div>
                    <h4 className="font-medium mb-2">Additional Info</h4>
                    <div className="space-y-1 text-sm">
                      {(lead.budget_min_usd || lead.budget_max_usd) && (
                        <div className="flex items-center gap-1">
                          <DollarSign className="w-4 h-4 text-muted-foreground" />
                          <span>
                            ${lead.budget_min_usd?.toLocaleString() || '0'} - 
                            ${lead.budget_max_usd?.toLocaleString() || '0'}
                          </span>
                        </div>
                      )}
                      {lead.academic_score && (
                        <div>
                          <span className="text-muted-foreground">Score:</span> {lead.academic_score}
                        </div>
                      )}
                      <div className="flex items-center gap-1 text-muted-foreground">
                        <Calendar className="w-4 h-4" />
                        <span>Created {new Date(lead.created_at).toLocaleDateString()}</span>
                      </div>
                    </div>
                  </div>
                </div>

                {lead.notes && (
                  <div className="mt-4 p-3 bg-muted/50 rounded-lg">
                    <h5 className="font-medium text-sm mb-1">Notes</h5>
                    <p className="text-sm text-muted-foreground">{lead.notes}</p>
                  </div>
                )}
              </CardContent>
            </Card>
          ))
        )}
      </div>
    </div>
  );
}