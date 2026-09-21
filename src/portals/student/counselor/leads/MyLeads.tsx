import { useState, useEffect } from 'react';
import { supabase } from '@student/integrations/supabase/client';
import { useAuth } from '@student/hooks/useAuth';
import { useToast } from '@student/hooks/use-toast';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@student/components/ui/card';
import { Button } from '@student/components/ui/button';
import { Badge } from '@student/components/ui/badge';
import { Input } from '@student/components/ui/input';
import { Textarea } from '@student/components/ui/textarea';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@student/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@student/components/ui/select';
import { Phone, Mail, Calendar, Flame, CloudDrizzle, Snowflake, CheckCircle, PhoneCall } from 'lucide-react';
import { format } from 'date-fns';

interface Lead {
  id: string;
  user_id: string;
  first_name: string;
  last_name: string;
  email: string;
  phone: string;
  lead_status: string;
  priority: string;
  preferred_countries: string[];
  field_of_interest: string;
  created_at: string;
  last_contact_date: string;
  next_follow_up_date: string;
  notes: string;
}

export function MyLeads() {
  const { user } = useAuth();
  const [leads, setLeads] = useState<Lead[]>([]);
  const [selectedLead, setSelectedLead] = useState<Lead | null>(null);
  const [loading, setLoading] = useState(true);
  const [callNotes, setCallNotes] = useState('');
  const [newStatus, setNewStatus] = useState('');
  const [dialogOpen, setDialogOpen] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    fetchMyLeads();
  }, [user?.id]);

  const fetchMyLeads = async () => {
    if (!user?.id) return;

    try {
      const { data, error } = await supabase
        .from('student_leads')
        .select('*')
        .eq('assigned_counselor_id', user.id)
        .eq('entity_type', 'lead')
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
    } finally {
      setLoading(false);
    }
  };

  const updateLeadStatus = async () => {
    if (!selectedLead || !newStatus) return;

    try {
      const updateData: any = {
        lead_status: newStatus,
        last_contact_date: new Date().toISOString(),
        notes: callNotes ? `${selectedLead.notes || ''}\n\n[${format(new Date(), 'PPP')}] ${callNotes}` : selectedLead.notes
      };

      // If converting to student, the trigger will handle entity_type change
      const { error } = await supabase
        .from('student_leads')
        .update(updateData)
        .eq('id', selectedLead.id);

      if (error) throw error;

      toast({
        title: "Success",
        description: newStatus === 'converted' 
          ? "Lead converted to student and moved to My Students" 
          : "Lead status updated successfully"
      });

      setDialogOpen(false);
      setCallNotes('');
      setNewStatus('');
      setSelectedLead(null);
      fetchMyLeads();
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive"
      });
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'hot': return <Flame className="w-4 h-4 text-red-500" />;
      case 'warm': return <CloudDrizzle className="w-4 h-4 text-yellow-500" />;
      case 'cold': return <Snowflake className="w-4 h-4 text-blue-500" />;
      case 'converted': return <CheckCircle className="w-4 h-4 text-green-500" />;
      default: return null;
    }
  };

  const getStatusBadge = (status: string) => {
    const variants: Record<string, any> = {
      hot: 'destructive',
      warm: 'default',
      cold: 'secondary',
      converted: 'outline'
    };
    return variants[status] || 'outline';
  };

  const getPriorityBadge = (priority: string) => {
    const colors: Record<string, string> = {
      high: 'bg-red-100 text-red-800',
      medium: 'bg-yellow-100 text-yellow-800',
      low: 'bg-green-100 text-green-800'
    };
    return colors[priority] || 'bg-gray-100 text-gray-800';
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
            <PhoneCall className="w-5 h-5" />
            My Leads
          </CardTitle>
          <CardDescription>
            {leads.length} active leads requiring follow-up and nurturing
          </CardDescription>
        </CardHeader>
      </Card>

      <div className="grid gap-4">
        {leads.length === 0 ? (
          <Card className="glass-card">
            <CardContent className="p-12 text-center">
              <PhoneCall className="w-16 h-16 text-muted-foreground mx-auto mb-4 opacity-50" />
              <h3 className="text-xl font-semibold mb-2">No Active Leads</h3>
              <p className="text-muted-foreground">
                You don't have any leads assigned at the moment.
              </p>
            </CardContent>
          </Card>
        ) : (
          leads.map((lead) => (
            <Card key={lead.id} className="glass-card hover:shadow-lg transition-shadow">
              <CardContent className="pt-6">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 space-y-3">
                    <div className="flex items-start gap-3">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-2">
                          <h3 className="font-semibold text-lg">
                            {lead.first_name} {lead.last_name}
                          </h3>
                          {lead.lead_status && (
                            <Badge variant={getStatusBadge(lead.lead_status)} className="flex items-center gap-1">
                              {getStatusIcon(lead.lead_status)}
                              {lead.lead_status.toUpperCase()}
                            </Badge>
                          )}
                          <Badge className={getPriorityBadge(lead.priority)}>
                            {lead.priority} Priority
                          </Badge>
                        </div>
                        
                        <div className="flex flex-wrap items-center gap-4 text-sm text-muted-foreground">
                          <span className="flex items-center gap-1">
                            <Mail className="w-3 h-3" />
                            {lead.email}
                          </span>
                          <span className="flex items-center gap-1">
                            <Phone className="w-3 h-3" />
                            {lead.phone}
                          </span>
                          <span className="flex items-center gap-1">
                            <Calendar className="w-3 h-3" />
                            Added {format(new Date(lead.created_at), 'MMM dd, yyyy')}
                          </span>
                        </div>

                        {lead.preferred_countries && lead.preferred_countries.length > 0 && (
                          <div className="flex items-center gap-2 mt-2">
                            <span className="text-sm text-muted-foreground">Interested in:</span>
                            <div className="flex gap-1">
                              {lead.preferred_countries.map((country, idx) => (
                                <Badge key={idx} variant="outline">{country}</Badge>
                              ))}
                            </div>
                          </div>
                        )}

                        {lead.field_of_interest && (
                          <div className="text-sm">
                            <span className="text-muted-foreground">Field:</span> {lead.field_of_interest}
                          </div>
                        )}

                        {lead.last_contact_date && (
                          <div className="text-sm text-muted-foreground">
                            Last contacted: {format(new Date(lead.last_contact_date), 'PPP')}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>

                  <Dialog open={dialogOpen && selectedLead?.id === lead.id} onOpenChange={(open) => {
                    setDialogOpen(open);
                    if (!open) {
                      setSelectedLead(null);
                      setCallNotes('');
                      setNewStatus('');
                    }
                  }}>
                    <DialogTrigger asChild>
                      <Button 
                        onClick={() => {
                          setSelectedLead(lead);
                          setNewStatus(lead.lead_status || '');
                          setDialogOpen(true);
                        }}
                        size="sm"
                      >
                        <PhoneCall className="w-4 h-4 mr-2" />
                        Update Status
                      </Button>
                    </DialogTrigger>
                    <DialogContent>
                      <DialogHeader>
                        <DialogTitle>Update Lead Status</DialogTitle>
                        <DialogDescription>
                          Record your call and update the lead status
                        </DialogDescription>
                      </DialogHeader>
                      
                      <div className="space-y-4">
                        <div>
                          <label className="text-sm font-medium mb-2 block">Lead Status</label>
                          <Select value={newStatus} onValueChange={setNewStatus}>
                            <SelectTrigger>
                              <SelectValue placeholder="Select status" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="hot">
                                <div className="flex items-center gap-2">
                                  <Flame className="w-4 h-4 text-red-500" />
                                  Hot - Ready to Convert
                                </div>
                              </SelectItem>
                              <SelectItem value="warm">
                                <div className="flex items-center gap-2">
                                  <CloudDrizzle className="w-4 h-4 text-yellow-500" />
                                  Warm - Interested
                                </div>
                              </SelectItem>
                              <SelectItem value="cold">
                                <div className="flex items-center gap-2">
                                  <Snowflake className="w-4 h-4 text-blue-500" />
                                  Cold - Needs Follow-up
                                </div>
                              </SelectItem>
                              <SelectItem value="converted">
                                <div className="flex items-center gap-2">
                                  <CheckCircle className="w-4 h-4 text-green-500" />
                                  Converted to Student
                                </div>
                              </SelectItem>
                            </SelectContent>
                          </Select>
                        </div>

                        <div>
                          <label className="text-sm font-medium mb-2 block">Call Notes</label>
                          <Textarea
                            value={callNotes}
                            onChange={(e) => setCallNotes(e.target.value)}
                            placeholder="Add notes about your conversation..."
                            rows={4}
                          />
                        </div>

                        <div className="flex justify-end gap-2">
                          <Button variant="outline" onClick={() => setDialogOpen(false)}>
                            Cancel
                          </Button>
                          <Button onClick={updateLeadStatus}>
                            Save Update
                          </Button>
                        </div>
                      </div>
                    </DialogContent>
                  </Dialog>
                </div>

                {lead.notes && (
                  <div className="mt-4 p-3 bg-muted/50 rounded-lg">
                    <h5 className="font-medium text-sm mb-1">Previous Notes</h5>
                    <p className="text-sm text-muted-foreground whitespace-pre-wrap">{lead.notes}</p>
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
