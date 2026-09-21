import { useState, useEffect } from 'react';
import { supabase } from '@student/integrations/supabase/client';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@student/components/ui/dialog';
import { Badge } from '@student/components/ui/badge';
import { Button } from '@student/components/ui/button';
import { Textarea } from '@student/components/ui/textarea';
import { Input } from '@student/components/ui/input';
import { 
  Clock, 
  MessageSquare, 
  Phone, 
  Mail, 
  Calendar,
  User,
  TrendingUp,
  CheckCircle,
  AlertCircle,
  Plus
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
  next_follow_up_date: string;
  last_activity_at: string;
  created_at: string;
  preferred_countries: string[];
  field_of_interest: string;
  academic_score: string;
  notes: string;
}

interface TimelineEvent {
  id: string;
  type: 'note' | 'stage_change' | 'assignment' | 'follow_up' | 'call' | 'email';
  title: string;
  description: string;
  timestamp: string;
  user_name?: string;
  icon: any;
  color: string;
}

interface LeadNote {
  id: string;
  note: string;
  note_type: string;
  is_important: boolean;
  created_at: string;
  created_by: string;
}

interface Props {
  lead: Lead;
  onClose: () => void;
}

export function LeadTimeline({ lead, onClose }: Props) {
  const [timeline, setTimeline] = useState<TimelineEvent[]>([]);
  const [notes, setNotes] = useState<LeadNote[]>([]);
  const [loading, setLoading] = useState(true);
  const [newNote, setNewNote] = useState('');
  const [newFollowUpDate, setNewFollowUpDate] = useState('');

  const fetchTimelineData = async () => {
    try {
      // Fetch lead notes
      const { data: notesData, error: notesError } = await supabase
        .from('lead_notes')
        .select('*')
        .eq('lead_id', lead.id)
        .order('created_at', { ascending: false });

      if (notesError) throw notesError;
      setNotes(notesData || []);

      // Fetch activity logs
      const { data: logsData, error: logsError } = await supabase
        .from('lead_activity_logs')
        .select('*')
        .eq('lead_id', lead.id)
        .order('created_at', { ascending: false });

      if (logsError) throw logsError;

      // Create timeline events from different sources
      const timelineEvents: TimelineEvent[] = [];

      // Add lead creation event
      timelineEvents.push({
        id: `created-${lead.id}`,
        type: 'assignment',
        title: 'Lead Created',
        description: `New lead entered the system`,
        timestamp: lead.created_at,
        icon: User,
        color: 'bg-blue-500'
      });

      // Add notes as timeline events
      notesData?.forEach(note => {
        timelineEvents.push({
          id: note.id,
          type: 'note',
          title: note.is_important ? 'Important Note' : 'Note Added',
          description: note.note,
          timestamp: note.created_at,
          icon: MessageSquare,
          color: note.is_important ? 'bg-red-500' : 'bg-gray-500'
        });
      });

      // Add activity logs as timeline events
      logsData?.forEach(log => {
        let icon = Clock;
        let color = 'bg-gray-500';
        
        switch (log.activity_type) {
          case 'status_change':
            icon = TrendingUp;
            color = 'bg-orange-500';
            break;
          case 'assignment_change':
            icon = User;
            color = 'bg-blue-500';
            break;
          case 'follow_up':
            icon = Calendar;
            color = 'bg-green-500';
            break;
        }

        timelineEvents.push({
          id: log.id,
          type: 'note',
          title: log.activity_type.replace('_', ' ').toUpperCase(),
          description: log.description,
          timestamp: log.created_at,
          icon,
          color
        });
      });

      // Sort timeline by timestamp (newest first)
      timelineEvents.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
      setTimeline(timelineEvents);

    } catch (error: any) {
      console.error('Error fetching timeline data:', error);
    } finally {
      setLoading(false);
    }
  };

  const addNote = async () => {
    if (!newNote.trim()) return;

    try {
      const { error } = await supabase
        .from('lead_notes')
        .insert({
          lead_id: lead.id,
          note: newNote,
          note_type: 'general',
          is_important: false,
          created_by: (await supabase.auth.getUser()).data.user?.id
        });

      if (error) throw error;
      
      setNewNote('');
      await fetchTimelineData();
    } catch (error: any) {
      console.error('Error adding note:', error);
    }
  };

  const scheduleFollowUp = async () => {
    if (!newFollowUpDate) return;

    try {
      const { error } = await supabase
        .from('student_leads')
        .update({ 
          next_follow_up_date: newFollowUpDate,
          last_activity_at: new Date().toISOString()
        })
        .eq('id', lead.id);

      if (error) throw error;
      
      setNewFollowUpDate('');
      await fetchTimelineData();
    } catch (error: any) {
      console.error('Error scheduling follow-up:', error);
    }
  };

  useEffect(() => {
    fetchTimelineData();
  }, [lead.id]);

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

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-3">
            <div>
              {lead.first_name} {lead.last_name} - Timeline
            </div>
            <div className="flex gap-2">
              <Badge className={`${getStageColor(lead.lead_stage)} text-white`}>
                {lead.lead_stage.toUpperCase()}
              </Badge>
              <Badge variant={getPriorityColor(lead.priority_level) as any}>
                {lead.priority_level} priority
              </Badge>
            </div>
          </DialogTitle>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Lead Details */}
            <div className="lg:col-span-1 space-y-4">
              <div className="p-4 bg-muted/50 rounded-lg">
                <h3 className="font-semibold mb-3">Contact Information</h3>
                <div className="space-y-2 text-sm">
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
                    Next follow-up: {lead.next_follow_up_date 
                      ? format(new Date(lead.next_follow_up_date), 'MMM dd, yyyy')
                      : 'Not scheduled'
                    }
                  </div>
                </div>
              </div>

              <div className="p-4 bg-muted/50 rounded-lg">
                <h3 className="font-semibold mb-3">Academic Details</h3>
                <div className="space-y-2 text-sm">
                  <div>Field: {lead.field_of_interest || 'Not specified'}</div>
                  <div>Score: {lead.academic_score || 'Not provided'}</div>
                  <div>Countries: {lead.preferred_countries?.join(', ') || 'Not specified'}</div>
                </div>
              </div>

              {/* Quick Actions */}
              <div className="space-y-3">
                <div>
                  <label className="text-sm font-medium mb-2 block">Add Note</label>
                  <Textarea
                    placeholder="Add a note about this lead..."
                    value={newNote}
                    onChange={(e) => setNewNote(e.target.value)}
                    className="mb-2"
                  />
                  <Button size="sm" onClick={addNote} disabled={!newNote.trim()}>
                    <Plus className="h-4 w-4 mr-1" />
                    Add Note
                  </Button>
                </div>

                <div>
                  <label className="text-sm font-medium mb-2 block">Schedule Follow-up</label>
                  <Input
                    type="datetime-local"
                    value={newFollowUpDate}
                    onChange={(e) => setNewFollowUpDate(e.target.value)}
                    className="mb-2"
                  />
                  <Button size="sm" onClick={scheduleFollowUp} disabled={!newFollowUpDate}>
                    <Calendar className="h-4 w-4 mr-1" />
                    Schedule
                  </Button>
                </div>
              </div>
            </div>

            {/* Timeline */}
            <div className="lg:col-span-2">
              <h3 className="font-semibold mb-4">Activity Timeline</h3>
              
              {loading ? (
                <div className="flex items-center justify-center p-8">
                  <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary"></div>
                </div>
              ) : (
                <div className="space-y-4">
                  {timeline.map((event, index) => {
                    const Icon = event.icon;
                    const isLast = index === timeline.length - 1;
                    
                    return (
                      <div key={event.id} className="flex gap-4 relative">
                        {/* Timeline connector */}
                        {!isLast && (
                          <div className="absolute left-4 top-8 bottom-0 w-px bg-border"></div>
                        )}
                        
                        {/* Event icon */}
                        <div className={`flex-shrink-0 w-8 h-8 rounded-full ${event.color} flex items-center justify-center z-10`}>
                          <Icon className="w-4 h-4 text-white" />
                        </div>
                        
                        {/* Event content */}
                        <div className="flex-1 pb-4">
                          <div className="flex items-center justify-between mb-1">
                            <h4 className="font-medium">{event.title}</h4>
                            <span className="text-xs text-muted-foreground">
                              {format(new Date(event.timestamp), 'MMM dd, yyyy HH:mm')}
                            </span>
                          </div>
                          <p className="text-sm text-muted-foreground">
                            {event.description}
                          </p>
                          {event.user_name && (
                            <p className="text-xs text-muted-foreground mt-1">
                              by {event.user_name}
                            </p>
                          )}
                        </div>
                      </div>
                    );
                  })}
                  
                  {timeline.length === 0 && (
                    <div className="text-center py-8 text-muted-foreground">
                      <Clock className="h-12 w-12 mx-auto mb-4 opacity-50" />
                      <p>No timeline events yet.</p>
                      <p className="text-sm">Activity will appear here as you interact with this lead.</p>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}