import { useState } from 'react';
import { Button } from '@student/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@student/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@student/components/ui/select';
import { Textarea } from '@student/components/ui/textarea';
import { Input } from '@student/components/ui/input';
import { Badge } from '@student/components/ui/badge';
import { 
  TrendingUp, 
  MessageSquare, 
  Calendar,
  Phone,
  Mail,
  CheckCircle,
  Clock,
  Send
} from 'lucide-react';

interface Lead {
  id: string;
  first_name: string;
  last_name: string;
  email: string;
  phone: string;
  lead_stage: string;
  priority_level: string;
  next_follow_up_date: string;
}

interface Props {
  lead: Lead;
  onStageUpdate: (stage: string) => void;
  onAddNote: (note: string) => void;
  onScheduleFollowUp: (date: string) => void;
  compact?: boolean;
}

export function QuickActions({ 
  lead, 
  onStageUpdate, 
  onAddNote, 
  onScheduleFollowUp,
  compact = false 
}: Props) {
  const [showNoteDialog, setShowNoteDialog] = useState(false);
  const [showFollowUpDialog, setShowFollowUpDialog] = useState(false);
  const [showContactDialog, setShowContactDialog] = useState(false);
  const [note, setNote] = useState('');
  const [followUpDate, setFollowUpDate] = useState('');
  const [selectedAction, setSelectedAction] = useState('');

  const handleStageChange = (newStage: string) => {
    onStageUpdate(newStage);
  };

  const handleAddNote = () => {
    if (note.trim()) {
      onAddNote(note);
      setNote('');
      setShowNoteDialog(false);
    }
  };

  const handleScheduleFollowUp = () => {
    if (followUpDate) {
      onScheduleFollowUp(followUpDate);
      setFollowUpDate('');
      setShowFollowUpDialog(false);
    }
  };

  const getNextStage = (currentStage: string) => {
    switch (currentStage) {
      case 'hot':
        return 'warm';
      case 'warm':
        return 'converted';
      case 'cold':
        return 'warm';
      default:
        return 'hot';
    }
  };

  const getStageActionLabel = (currentStage: string) => {
    switch (currentStage) {
      case 'hot':
        return 'Mark as Warm';
      case 'warm':
        return 'Convert to Student';
      case 'cold':
        return 'Reactivate';
      default:
        return 'Update Stage';
    }
  };

  if (compact) {
    return (
      <div className="flex gap-1">
        <Select value={lead.lead_stage} onValueChange={handleStageChange}>
          <SelectTrigger className="w-24 h-8">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="hot">Hot</SelectItem>
            <SelectItem value="warm">Warm</SelectItem>
            <SelectItem value="cold">Cold</SelectItem>
            <SelectItem value="converted">Student</SelectItem>
          </SelectContent>
        </Select>

        <Dialog open={showNoteDialog} onOpenChange={setShowNoteDialog}>
          <DialogTrigger asChild>
            <Button size="sm" variant="outline">
              <MessageSquare className="h-3 w-3" />
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Add Note</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <Textarea
                placeholder="Add a note about this lead..."
                value={note}
                onChange={(e) => setNote(e.target.value)}
              />
              <div className="flex gap-2">
                <Button onClick={handleAddNote} disabled={!note.trim()}>
                  Add Note
                </Button>
                <Button variant="outline" onClick={() => setShowNoteDialog(false)}>
                  Cancel
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>

        <Dialog open={showFollowUpDialog} onOpenChange={setShowFollowUpDialog}>
          <DialogTrigger asChild>
            <Button size="sm" variant="outline">
              <Calendar className="h-3 w-3" />
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Schedule Follow-up</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <Input
                type="datetime-local"
                value={followUpDate}
                onChange={(e) => setFollowUpDate(e.target.value)}
              />
              <div className="flex gap-2">
                <Button onClick={handleScheduleFollowUp} disabled={!followUpDate}>
                  Schedule
                </Button>
                <Button variant="outline" onClick={() => setShowFollowUpDialog(false)}>
                  Cancel
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    );
  }

  return (
    <div className="flex flex-wrap gap-2">
      {/* Quick Stage Update */}
      <Button
        size="sm"
        onClick={() => handleStageChange(getNextStage(lead.lead_stage))}
        className="animate-pulse"
      >
        <TrendingUp className="h-4 w-4 mr-1" />
        {getStageActionLabel(lead.lead_stage)}
      </Button>

      {/* Add Note */}
      <Dialog open={showNoteDialog} onOpenChange={setShowNoteDialog}>
        <DialogTrigger asChild>
          <Button size="sm" variant="outline">
            <MessageSquare className="h-4 w-4 mr-1" />
            Add Note
          </Button>
        </DialogTrigger>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Note for {lead.first_name} {lead.last_name}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <Textarea
              placeholder="What happened in your conversation? Any important details to remember?"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={4}
            />
            <div className="flex gap-2">
              <Button onClick={handleAddNote} disabled={!note.trim()}>
                <Send className="h-4 w-4 mr-1" />
                Add Note
              </Button>
              <Button variant="outline" onClick={() => setShowNoteDialog(false)}>
                Cancel
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Schedule Follow-up */}
      <Dialog open={showFollowUpDialog} onOpenChange={setShowFollowUpDialog}>
        <DialogTrigger asChild>
          <Button size="sm" variant="outline">
            <Calendar className="h-4 w-4 mr-1" />
            Schedule
          </Button>
        </DialogTrigger>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Schedule Follow-up with {lead.first_name}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium mb-2 block">Follow-up Date & Time</label>
              <Input
                type="datetime-local"
                value={followUpDate}
                onChange={(e) => setFollowUpDate(e.target.value)}
              />
            </div>
            <div className="flex gap-2">
              <Button onClick={handleScheduleFollowUp} disabled={!followUpDate}>
                <Calendar className="h-4 w-4 mr-1" />
                Schedule Follow-up
              </Button>
              <Button variant="outline" onClick={() => setShowFollowUpDialog(false)}>
                Cancel
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Contact Options */}
      <Dialog open={showContactDialog} onOpenChange={setShowContactDialog}>
        <DialogTrigger asChild>
          <Button size="sm" variant="outline">
            <Phone className="h-4 w-4 mr-1" />
            Contact
          </Button>
        </DialogTrigger>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Contact {lead.first_name} {lead.last_name}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-1 gap-3">
              <Button 
                className="justify-start h-auto p-4"
                onClick={() => window.open(`tel:${lead.phone}`)}
              >
                <Phone className="h-5 w-5 mr-3" />
                <div className="text-left">
                  <div className="font-medium">Call Now</div>
                  <div className="text-sm opacity-90">{lead.phone}</div>
                </div>
              </Button>

              <Button 
                variant="outline" 
                className="justify-start h-auto p-4"
                onClick={() => window.open(`mailto:${lead.email}`)}
              >
                <Mail className="h-5 w-5 mr-3" />
                <div className="text-left">
                  <div className="font-medium">Send Email</div>
                  <div className="text-sm opacity-70">{lead.email}</div>
                </div>
              </Button>

              <Button 
                variant="outline" 
                className="justify-start h-auto p-4"
                onClick={() => window.open(`https://wa.me/${lead.phone.replace(/[^0-9]/g, '')}`)}
              >
                <Send className="h-5 w-5 mr-3" />
                <div className="text-left">
                  <div className="font-medium">WhatsApp</div>
                  <div className="text-sm opacity-70">Send message</div>
                </div>
              </Button>
            </div>
            
            <Button 
              variant="outline" 
              onClick={() => setShowContactDialog(false)}
              className="w-full"
            >
              Close
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}