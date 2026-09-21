import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@student/integrations/supabase/client';
import { Card } from '@student/components/ui/card';
import { Button } from '@student/components/ui/button';
import { Input } from '@student/components/ui/input';
import { Label } from '@student/components/ui/label';
import { Textarea } from '@student/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@student/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@student/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@student/components/ui/table';
import { Badge } from '@student/components/ui/badge';
import { toast } from 'sonner';
import { Phone, Mail, User, Calendar, Target, Plus, Edit, Eye, MessageCircle } from 'lucide-react';
import { format } from 'date-fns';

export default function TravelLeadsAdmin() {
  const queryClient = useQueryClient();
  const [selectedLead, setSelectedLead] = useState<any>(null);
  const [showLeadDialog, setShowLeadDialog] = useState(false);
  const [filterStatus, setFilterStatus] = useState('all');

  const { data: leads, isLoading } = useQuery({
    queryKey: ['travel-leads', filterStatus],
    queryFn: async () => {
      let query = supabase
        .from('travel_leads')
        .select('*')
        .order('created_at', { ascending: false });

      if (filterStatus !== 'all') {
        query = query.eq('lead_status', filterStatus);
      }

      const { data, error } = await query;
      if (error) throw error;

      // Fetch assigned user names separately
      const leadsWithUsers = await Promise.all(
        data.map(async (lead) => {
          if (lead.assigned_to) {
            const { data: profile } = await supabase
              .from('profiles')
              .select('first_name, last_name')
              .eq('user_id', lead.assigned_to)
              .single();
            return { ...lead, assigned_user: profile };
          }
          return lead;
        })
      );

      return leadsWithUsers;
    },
  });

  const { data: counselors } = useQuery({
    queryKey: ['counselors-list'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('counselors')
        .select('id, user_id, profiles(first_name, last_name)')
        .eq('is_active', true);
      if (error) throw error;
      return data;
    },
  });

  const updateLead = useMutation({
    mutationFn: async ({ id, updates }: { id: string; updates: any }) => {
      const { error } = await supabase
        .from('travel_leads')
        .update(updates)
        .eq('id', id);
      if (error) throw error;

      // Log activity
      await supabase.from('travel_lead_activities').insert({
        lead_id: id,
        activity_type: 'status_change',
        activity_description: `Lead status updated to ${updates.lead_status || 'updated'}`,
        performed_by: (await supabase.auth.getUser()).data.user?.id,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['travel-leads'] });
      toast.success('Lead updated successfully');
      setShowLeadDialog(false);
    },
    onError: () => {
      toast.error('Failed to update lead');
    },
  });

  const getStatusColor = (status: string) => {
    const colors: Record<string, string> = {
      new: 'bg-blue-500',
      contacted: 'bg-yellow-500',
      qualified: 'bg-purple-500',
      proposal_sent: 'bg-indigo-500',
      negotiating: 'bg-orange-500',
      won: 'bg-green-500',
      lost: 'bg-red-500',
    };
    return colors[status] || 'bg-gray-500';
  };

  const getScoreColor = (score: number) => {
    if (score >= 70) return 'text-green-600';
    if (score >= 40) return 'text-yellow-600';
    return 'text-red-600';
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-3xl font-bold">Travel Leads Management</h2>
          <p className="text-muted-foreground">Track and manage your travel inquiries and leads</p>
        </div>
        <Button onClick={() => { setSelectedLead(null); setShowLeadDialog(true); }}>
          <Plus className="w-4 h-4 mr-2" />
          Add Lead
        </Button>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
        {['new', 'contacted', 'qualified', 'proposal_sent', 'won'].map((status) => {
          const count = leads?.filter(l => l.lead_status === status).length || 0;
          return (
            <Card key={status} className="p-4 cursor-pointer hover:shadow-lg transition-shadow" onClick={() => setFilterStatus(status)}>
              <div className="space-y-1">
                <p className="text-sm text-muted-foreground capitalize">{status.replace('_', ' ')}</p>
                <h3 className="text-2xl font-bold">{count}</h3>
              </div>
            </Card>
          );
        })}
      </div>

      {/* Filters */}
      <Card className="p-4">
        <div className="flex gap-4">
          <Select value={filterStatus} onValueChange={setFilterStatus}>
            <SelectTrigger className="w-48">
              <SelectValue placeholder="Filter by status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Leads</SelectItem>
              <SelectItem value="new">New</SelectItem>
              <SelectItem value="contacted">Contacted</SelectItem>
              <SelectItem value="qualified">Qualified</SelectItem>
              <SelectItem value="proposal_sent">Proposal Sent</SelectItem>
              <SelectItem value="negotiating">Negotiating</SelectItem>
              <SelectItem value="won">Won</SelectItem>
              <SelectItem value="lost">Lost</SelectItem>
            </SelectContent>
          </Select>
          {filterStatus !== 'all' && (
            <Button variant="outline" onClick={() => setFilterStatus('all')}>Clear Filter</Button>
          )}
        </div>
      </Card>

      {/* Leads Table */}
      <Card>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Lead Score</TableHead>
              <TableHead>Name</TableHead>
              <TableHead>Contact</TableHead>
              <TableHead>Destination</TableHead>
              <TableHead>Budget</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Assigned To</TableHead>
              <TableHead>Next Follow-up</TableHead>
              <TableHead>Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={9} className="text-center">Loading...</TableCell>
              </TableRow>
            ) : leads?.length === 0 ? (
              <TableRow>
                <TableCell colSpan={9} className="text-center">No leads found</TableCell>
              </TableRow>
            ) : (
              leads?.map((lead) => (
                <TableRow key={lead.id}>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <Target className={`w-4 h-4 ${getScoreColor(lead.lead_score)}`} />
                      <span className={`font-semibold ${getScoreColor(lead.lead_score)}`}>
                        {lead.lead_score}
                      </span>
                    </div>
                  </TableCell>
                  <TableCell className="font-medium">{lead.full_name}</TableCell>
                  <TableCell>
                    <div className="space-y-1 text-sm">
                      <div className="flex items-center gap-1">
                        <Mail className="w-3 h-3" />
                        {lead.email}
                      </div>
                      <div className="flex items-center gap-1">
                        <Phone className="w-3 h-3" />
                        {lead.phone}
                      </div>
                    </div>
                  </TableCell>
                  <TableCell>{lead.interested_destination || 'Not specified'}</TableCell>
                  <TableCell className="capitalize">{lead.budget_range || 'Not specified'}</TableCell>
                  <TableCell>
                    <Badge className={getStatusColor(lead.lead_status)}>
                      {lead.lead_status.replace('_', ' ')}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    {(lead as any).assigned_user ? `${(lead as any).assigned_user.first_name} ${(lead as any).assigned_user.last_name}` : 'Unassigned'}
                  </TableCell>
                  <TableCell>
                    {lead.next_follow_up_date ? (
                      <span className="flex items-center gap-1 text-sm">
                        <Calendar className="w-3 h-3" />
                        {format(new Date(lead.next_follow_up_date), 'MMM dd, yyyy')}
                      </span>
                    ) : (
                      'Not set'
                    )}
                  </TableCell>
                  <TableCell>
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => {
                          setSelectedLead(lead);
                          setShowLeadDialog(true);
                        }}
                      >
                        <Edit className="w-4 h-4" />
                      </Button>
                      <Button size="sm" variant="ghost">
                        <MessageCircle className="w-4 h-4" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </Card>

      {/* Lead Dialog */}
      <Dialog open={showLeadDialog} onOpenChange={setShowLeadDialog}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{selectedLead ? 'Edit Lead' : 'Add New Lead'}</DialogTitle>
          </DialogHeader>
          <LeadForm
            lead={selectedLead}
            counselors={counselors || []}
            onSubmit={(data) => {
              if (selectedLead) {
                updateLead.mutate({ id: selectedLead.id, updates: data });
              }
            }}
            onCancel={() => setShowLeadDialog(false)}
          />
        </DialogContent>
      </Dialog>
    </div>
  );
}

function LeadForm({ lead, counselors, onSubmit, onCancel }: any) {
  const [formData, setFormData] = useState(lead || {
    full_name: '',
    email: '',
    phone: '',
    country: '',
    interested_destination: '',
    budget_range: '',
    travel_date_preference: '',
    lead_status: 'new',
    assigned_to: '',
    next_follow_up_date: '',
    notes: '',
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit(formData);
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <div>
          <Label>Full Name *</Label>
          <Input
            value={formData.full_name}
            onChange={(e) => setFormData({ ...formData, full_name: e.target.value })}
            required
          />
        </div>
        <div>
          <Label>Email *</Label>
          <Input
            type="email"
            value={formData.email}
            onChange={(e) => setFormData({ ...formData, email: e.target.value })}
            required
          />
        </div>
        <div>
          <Label>Phone *</Label>
          <Input
            value={formData.phone}
            onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
            required
          />
        </div>
        <div>
          <Label>Country</Label>
          <Input
            value={formData.country}
            onChange={(e) => setFormData({ ...formData, country: e.target.value })}
          />
        </div>
        <div>
          <Label>Interested Destination</Label>
          <Input
            value={formData.interested_destination}
            onChange={(e) => setFormData({ ...formData, interested_destination: e.target.value })}
          />
        </div>
        <div>
          <Label>Budget Range</Label>
          <Select
            value={formData.budget_range}
            onValueChange={(value) => setFormData({ ...formData, budget_range: value })}
          >
            <SelectTrigger>
              <SelectValue placeholder="Select budget" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="low">Low (&lt;$2000)</SelectItem>
              <SelectItem value="medium">Medium ($2000-$5000)</SelectItem>
              <SelectItem value="high">High (&gt;$5000)</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label>Lead Status</Label>
          <Select
            value={formData.lead_status}
            onValueChange={(value) => setFormData({ ...formData, lead_status: value })}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="new">New</SelectItem>
              <SelectItem value="contacted">Contacted</SelectItem>
              <SelectItem value="qualified">Qualified</SelectItem>
              <SelectItem value="proposal_sent">Proposal Sent</SelectItem>
              <SelectItem value="negotiating">Negotiating</SelectItem>
              <SelectItem value="won">Won</SelectItem>
              <SelectItem value="lost">Lost</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label>Assign To</Label>
          <Select
            value={formData.assigned_to}
            onValueChange={(value) => setFormData({ ...formData, assigned_to: value })}
          >
            <SelectTrigger>
              <SelectValue placeholder="Select counselor" />
            </SelectTrigger>
            <SelectContent>
              {counselors.map((counselor: any) => (
                <SelectItem key={counselor.user_id} value={counselor.user_id}>
                  {counselor.profiles?.first_name} {counselor.profiles?.last_name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label>Next Follow-up Date</Label>
          <Input
            type="date"
            value={formData.next_follow_up_date}
            onChange={(e) => setFormData({ ...formData, next_follow_up_date: e.target.value })}
          />
        </div>
      </div>

      <div>
        <Label>Notes</Label>
        <Textarea
          value={formData.notes}
          onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
          rows={3}
        />
      </div>

      <div className="flex gap-2">
        <Button type="submit" className="flex-1">
          {lead ? 'Update Lead' : 'Create Lead'}
        </Button>
        <Button type="button" variant="outline" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
