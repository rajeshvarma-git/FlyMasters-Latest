import { useState } from 'react';
import { Badge } from '@student/components/ui/badge';
import { Button } from '@student/components/ui/button';
import { Card, CardContent } from '@student/components/ui/card';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@student/components/ui/collapsible';
import { 
  Phone, 
  Mail, 
  Calendar,
  ChevronDown,
  ChevronUp,
  MessageSquare,
  TrendingUp,
  Clock,
  User
} from 'lucide-react';
import { format, isToday, isTomorrow, isYesterday } from 'date-fns';

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

interface Props {
  lead: Lead;
  onStageUpdate: (stage: string) => void;
  onContact: (type: 'call' | 'email' | 'whatsapp') => void;
  onAddNote: () => void;
  onScheduleFollowUp: () => void;
  onViewTimeline: () => void;
}

export function MobileLeadCard({ 
  lead, 
  onStageUpdate, 
  onContact, 
  onAddNote, 
  onScheduleFollowUp,
  onViewTimeline 
}: Props) {
  const [isExpanded, setIsExpanded] = useState(false);

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

  const getFollowUpLabel = (date: string) => {
    if (!date) return 'Not scheduled';
    const followUpDate = new Date(date);
    if (isToday(followUpDate)) return 'Today';
    if (isTomorrow(followUpDate)) return 'Tomorrow';
    if (isYesterday(followUpDate)) return 'Yesterday';
    return format(followUpDate, 'MMM dd');
  };

  const getFollowUpUrgency = (date: string) => {
    if (!date) return 'normal';
    const followUpDate = new Date(date);
    const now = new Date();
    
    if (followUpDate < now) return 'overdue';
    if (isToday(followUpDate)) return 'today';
    if (isTomorrow(followUpDate)) return 'tomorrow';
    return 'normal';
  };

  const followUpUrgency = getFollowUpUrgency(lead.next_follow_up_date);
  const isUrgent = followUpUrgency === 'overdue' || followUpUrgency === 'today' || lead.lead_stage === 'hot';

  return (
    <Card className={`mb-4 ${isUrgent ? 'border-red-200 bg-red-50/50 dark:bg-red-900/10' : ''}`}>
      <Collapsible open={isExpanded} onOpenChange={setIsExpanded}>
        <CollapsibleTrigger asChild>
          <CardContent className="p-4 cursor-pointer">
            <div className="flex items-start justify-between">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-2">
                  <h3 className="font-semibold text-base truncate">
                    {lead.first_name} {lead.last_name}
                  </h3>
                  {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                </div>
                
                <div className="flex flex-wrap gap-2 mb-2">
                  <Badge className={`${getStageColor(lead.lead_stage)} text-white text-xs`}>
                    {lead.lead_stage.toUpperCase()}
                  </Badge>
                  <Badge variant={getPriorityColor(lead.priority_level) as any} className="text-xs">
                    {lead.priority_level}
                  </Badge>
                  {isUrgent && (
                    <Badge variant="destructive" className="text-xs animate-pulse">
                      URGENT
                    </Badge>
                  )}
                </div>

                <div className="text-sm text-muted-foreground">
                  <div className="flex items-center gap-1 mb-1">
                    <Calendar className="h-3 w-3" />
                    Follow-up: {getFollowUpLabel(lead.next_follow_up_date)}
                  </div>
                  <div className="flex items-center gap-1">
                    <Clock className="h-3 w-3" />
                    Last activity: {format(new Date(lead.last_activity_at), 'MMM dd')}
                  </div>
                </div>
              </div>
            </div>
          </CardContent>
        </CollapsibleTrigger>

        <CollapsibleContent>
          <div className="px-4 pb-4 space-y-4">
            {/* Contact Information */}
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-sm">
                <Mail className="h-4 w-4 text-muted-foreground" />
                <span className="truncate">{lead.email}</span>
              </div>
              <div className="flex items-center gap-2 text-sm">
                <Phone className="h-4 w-4 text-muted-foreground" />
                <span>{lead.phone}</span>
              </div>
              {lead.field_of_interest && (
                <div className="flex items-center gap-2 text-sm">
                  <User className="h-4 w-4 text-muted-foreground" />
                  <span className="truncate">{lead.field_of_interest}</span>
                </div>
              )}
            </div>

            {/* Quick Contact Actions */}
            <div className="grid grid-cols-3 gap-2">
              <Button 
                size="sm" 
                variant="outline"
                onClick={(e) => {
                  e.stopPropagation();
                  onContact('call');
                }}
                className="h-12 flex flex-col gap-1"
              >
                <Phone className="h-4 w-4" />
                <span className="text-xs">Call</span>
              </Button>
              
              <Button 
                size="sm" 
                variant="outline"
                onClick={(e) => {
                  e.stopPropagation();
                  onContact('email');
                }}
                className="h-12 flex flex-col gap-1"
              >
                <Mail className="h-4 w-4" />
                <span className="text-xs">Email</span>
              </Button>
              
              <Button 
                size="sm" 
                variant="outline"
                onClick={(e) => {
                  e.stopPropagation();
                  onContact('whatsapp');
                }}
                className="h-12 flex flex-col gap-1"
              >
                <MessageSquare className="h-4 w-4" />
                <span className="text-xs">WhatsApp</span>
              </Button>
            </div>

            {/* Stage Actions */}
            <div className="grid grid-cols-2 gap-2">
              <Button
                size="sm"
                onClick={(e) => {
                  e.stopPropagation();
                  const nextStage = lead.lead_stage === 'hot' ? 'warm' : 
                                  lead.lead_stage === 'warm' ? 'converted' : 
                                  lead.lead_stage === 'cold' ? 'warm' : 'hot';
                  onStageUpdate(nextStage);
                }}
                className="h-10"
              >
                <TrendingUp className="h-4 w-4 mr-1" />
                {lead.lead_stage === 'hot' ? 'Mark Warm' :
                 lead.lead_stage === 'warm' ? 'Convert' :
                 lead.lead_stage === 'cold' ? 'Reactivate' : 'Update'}
              </Button>
              
              <Button
                size="sm"
                variant="outline"
                onClick={(e) => {
                  e.stopPropagation();
                  onAddNote();
                }}
                className="h-10"
              >
                <MessageSquare className="h-4 w-4 mr-1" />
                Add Note
              </Button>
            </div>

            {/* More Actions */}
            <div className="grid grid-cols-2 gap-2">
              <Button
                size="sm"
                variant="outline"
                onClick={(e) => {
                  e.stopPropagation();
                  onScheduleFollowUp();
                }}
              >
                <Calendar className="h-4 w-4 mr-1" />
                Schedule
              </Button>
              
              <Button
                size="sm"
                variant="outline"
                onClick={(e) => {
                  e.stopPropagation();
                  onViewTimeline();
                }}
              >
                <Clock className="h-4 w-4 mr-1" />
                Timeline
              </Button>
            </div>

            {/* Additional Info */}
            {(lead.preferred_countries?.length > 0 || lead.academic_score) && (
              <div className="pt-2 border-t text-xs text-muted-foreground space-y-1">
                {lead.preferred_countries?.length > 0 && (
                  <div>Countries: {lead.preferred_countries.join(', ')}</div>
                )}
                {lead.academic_score && (
                  <div>Score: {lead.academic_score}</div>
                )}
              </div>
            )}
          </div>
        </CollapsibleContent>
      </Collapsible>
    </Card>
  );
}