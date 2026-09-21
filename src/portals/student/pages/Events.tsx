import { useState, useEffect } from 'react';
import { useAuth } from '@student/hooks/useAuth';
import { Card, CardContent, CardHeader, CardTitle } from '@student/components/ui/card';
import { Button } from '@student/components/ui/button';
import { Input } from '@student/components/ui/input';
import { Badge } from '@student/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@student/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@student/components/ui/tabs';
import { 
  Calendar, 
  Clock, 
  Users, 
  MapPin, 
  Video,
  Filter,
  Search,
  ExternalLink,
  UserPlus,
  Award,
  BookOpen,
  Briefcase,
  Globe,
  Play,
  CheckCircle
} from 'lucide-react';
import { format } from 'date-fns';

const Events = () => {
  const { user } = useAuth();
  const [selectedEvent, setSelectedEvent] = useState<any>(null);
  const [showDetails, setShowDetails] = useState(false);
  const [activeTab, setActiveTab] = useState('upcoming');

  // Mock data - replace with actual Supabase queries
  const [events] = useState([
    {
      id: '1',
      title: 'Study in Germany: Complete Guide',
      description: 'Comprehensive session on studying in Germany, visa process, and top universities. Learn about admission requirements, cost of living, and career opportunities.',
      eventType: 'webinar',
      hostName: 'Dr. Sarah Johnson',
      hostOrganization: 'Fly AI Pathfinder',
      scheduledAt: new Date('2024-09-07T14:00:00Z'),
      durationMinutes: 90,
      maxAttendees: 500,
      currentAttendees: 324,
      isRegistered: false,
      isFree: true,
      status: 'upcoming',
      topicsCovered: ['Visa Process', 'Top Universities', 'Cost of Living', 'Scholarships'],
      targetAudience: ['UG', 'PG'],
      meetingLink: 'https://zoom.us/j/123456789',
      agenda: [
        { time: '14:00', topic: 'Welcome & Introduction' },
        { time: '14:15', topic: 'German Education System Overview' },
        { time: '14:45', topic: 'Top Universities & Programs' },
        { time: '15:15', topic: 'Visa Process & Requirements' },
        { time: '15:45', topic: 'Q&A Session' }
      ],
      hostBio: 'Dr. Sarah Johnson is an education consultant with 10+ years of experience helping students navigate German universities.',
      recordingAvailable: false
    },
    {
      id: '2',
      title: 'IELTS Preparation Workshop',
      description: 'Interactive workshop to improve your IELTS score with expert tips and practice sessions.',
      eventType: 'workshop',
      hostName: 'James Wilson',
      hostOrganization: 'Test Prep Experts',
      scheduledAt: new Date('2024-09-05T10:00:00Z'),
      durationMinutes: 120,
      maxAttendees: 100,
      currentAttendees: 78,
      isRegistered: true,
      isFree: true,
      status: 'upcoming',
      topicsCovered: ['Speaking Skills', 'Writing Techniques', 'Reading Strategies'],
      targetAudience: ['All Levels'],
      meetingLink: 'https://zoom.us/j/987654321',
      agenda: [
        { time: '10:00', topic: 'IELTS Overview' },
        { time: '10:30', topic: 'Speaking Section Tips' },
        { time: '11:15', topic: 'Writing Task Strategies' },
        { time: '11:45', topic: 'Practice Session' }
      ],
      hostBio: 'James Wilson is a certified IELTS trainer with 8 years of experience.',
      recordingAvailable: true
    },
    {
      id: '3',
      title: 'University Fair: Top US Universities',
      description: 'Meet representatives from leading US universities and learn about admission opportunities.',
      eventType: 'fair',
      hostName: 'Multiple Representatives',
      hostOrganization: 'US Education Council',
      scheduledAt: new Date('2024-09-14T09:00:00Z'),
      durationMinutes: 180,
      maxAttendees: 1000,
      currentAttendees: 567,
      isRegistered: false,
      isFree: true,
      status: 'upcoming',
      topicsCovered: ['Admissions', 'Scholarships', 'Campus Life'],
      targetAudience: ['UG', 'PG', 'PhD'],
      meetingLink: 'https://platform.universityfair.com',
      agenda: [
        { time: '09:00', topic: 'Opening Ceremony' },
        { time: '09:30', topic: 'University Presentations' },
        { time: '11:00', topic: 'One-on-One Sessions' },
        { time: '12:00', topic: 'Closing & Networking' }
      ],
      hostBio: 'Representatives from 25+ top US universities will be present.',
      recordingAvailable: false
    },
    {
      id: '4',
      title: 'MBA Admission Masterclass',
      description: 'Learn the secrets to successful MBA applications from admission experts.',
      eventType: 'webinar',
      hostName: 'Prof. Michael Chen',
      hostOrganization: 'Business School Experts',
      scheduledAt: new Date('2024-08-25T15:00:00Z'),
      durationMinutes: 75,
      maxAttendees: 200,
      currentAttendees: 200,
      isRegistered: true,
      isFree: false,
      registrationFee: 25,
      status: 'completed',
      topicsCovered: ['Application Strategy', 'Essays', 'Interviews'],
      targetAudience: ['MBA Aspirants'],
      recordingAvailable: true,
      recordingUrl: 'https://recording.example.com/mba-masterclass'
    }
  ]);

  const eventTypes = [
    { id: 'all', name: 'All Events', icon: Globe },
    { id: 'webinar', name: 'Webinars', icon: Video },
    { id: 'workshop', name: 'Workshops', icon: BookOpen },
    { id: 'fair', name: 'University Fairs', icon: Users },
    { id: 'info_session', name: 'Info Sessions', icon: Briefcase }
  ];

  const getEventStatusColor = (status: string) => {
    switch (status) {
      case 'upcoming': return 'bg-blue-100 text-blue-800';
      case 'live': return 'bg-green-100 text-green-800';
      case 'completed': return 'bg-gray-100 text-gray-800';
      case 'cancelled': return 'bg-red-100 text-red-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  const getEventTypeIcon = (type: string) => {
    switch (type) {
      case 'webinar': return Video;
      case 'workshop': return BookOpen;
      case 'fair': return Users;
      case 'info_session': return Briefcase;
      default: return Globe;
    }
  };

  const EventCard = ({ event }: { event: any }) => {
    const EventIcon = getEventTypeIcon(event.eventType);
    const isUpcoming = event.status === 'upcoming';
    const isPast = event.status === 'completed';

    return (
      <Card className="hover:shadow-lg transition-all duration-300">
        <CardContent className="p-6">
          <div className="space-y-4">
            {/* Header */}
            <div className="flex items-start justify-between">
              <div className="flex items-start gap-3 flex-1">
                <EventIcon className="w-6 h-6 text-primary mt-1" />
                <div className="flex-1">
                  <h3 className="font-semibold text-lg mb-1">{event.title}</h3>
                  <p className="text-primary font-medium text-sm">{event.hostName}</p>
                  <p className="text-muted-foreground text-xs">{event.hostOrganization}</p>
                </div>
              </div>
              <div className="flex flex-col items-end gap-2">
                <Badge className={getEventStatusColor(event.status)}>
                  {event.status}
                </Badge>
                {event.isFree ? (
                  <Badge variant="outline" className="text-green-600">Free</Badge>
                ) : (
                  <Badge variant="outline">${event.registrationFee}</Badge>
                )}
              </div>
            </div>

            {/* Description */}
            <p className="text-muted-foreground text-sm">{event.description}</p>

            {/* Event Details */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
              <div className="flex items-center gap-2">
                <Calendar className="w-4 h-4 text-muted-foreground" />
                <span>{format(event.scheduledAt, 'MMM dd, yyyy')}</span>
              </div>
              <div className="flex items-center gap-2">
                <Clock className="w-4 h-4 text-muted-foreground" />
                <span>{format(event.scheduledAt, 'hh:mm a')} • {event.durationMinutes}min</span>
              </div>
              <div className="flex items-center gap-2">
                <Users className="w-4 h-4 text-muted-foreground" />
                <span>{event.currentAttendees}/{event.maxAttendees} attendees</span>
              </div>
              <div className="flex items-center gap-2">
                <MapPin className="w-4 h-4 text-muted-foreground" />
                <span>Online Event</span>
              </div>
            </div>

            {/* Topics */}
            <div className="flex flex-wrap gap-2">
              {event.topicsCovered.slice(0, 3).map((topic: string) => (
                <Badge key={topic} variant="outline" className="text-xs">
                  {topic}
                </Badge>
              ))}
              {event.topicsCovered.length > 3 && (
                <Badge variant="outline" className="text-xs">
                  +{event.topicsCovered.length - 3} more
                </Badge>
              )}
            </div>

            {/* Actions */}
            <div className="flex gap-2">
              <Button 
                className="flex-1"
                onClick={() => {
                  setSelectedEvent(event);
                  setShowDetails(true);
                }}
              >
                View Details
              </Button>
              
              {isUpcoming && !event.isRegistered && (
                <Button variant="outline" className="gap-2">
                  <UserPlus className="w-4 h-4" />
                  Register
                </Button>
              )}
              
              {isUpcoming && event.isRegistered && (
                <Button variant="outline" className="gap-2 text-green-600" disabled>
                  <CheckCircle className="w-4 h-4" />
                  Registered
                </Button>
              )}
              
              {isPast && event.recordingAvailable && (
                <Button variant="outline" className="gap-2">
                  <Play className="w-4 h-4" />
                  Watch Recording
                </Button>
              )}
            </div>
          </div>
        </CardContent>
      </Card>
    );
  };

  const EventDetailsDialog = () => (
    <Dialog open={showDetails} onOpenChange={setShowDetails}>
      <DialogContent className="max-w-3xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-xl">{selectedEvent?.title}</DialogTitle>
        </DialogHeader>
        
        {selectedEvent && (
          <div className="space-y-6">
            {/* Event Info */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <Card>
                <CardContent className="p-4 text-center">
                  <Calendar className="w-6 h-6 text-primary mx-auto mb-2" />
                  <p className="font-semibold">{format(selectedEvent.scheduledAt, 'MMM dd, yyyy')}</p>
                  <p className="text-xs text-muted-foreground">Event Date</p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-4 text-center">
                  <Clock className="w-6 h-6 text-primary mx-auto mb-2" />
                  <p className="font-semibold">{format(selectedEvent.scheduledAt, 'hh:mm a')}</p>
                  <p className="text-xs text-muted-foreground">{selectedEvent.durationMinutes} minutes</p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-4 text-center">
                  <Users className="w-6 h-6 text-primary mx-auto mb-2" />
                  <p className="font-semibold">{selectedEvent.currentAttendees}</p>
                  <p className="text-xs text-muted-foreground">Registered</p>
                </CardContent>
              </Card>
            </div>

            {/* Description */}
            <div>
              <h4 className="font-semibold mb-2">About This Event</h4>
              <p className="text-muted-foreground">{selectedEvent.description}</p>
            </div>

            {/* Host Info */}
            <div>
              <h4 className="font-semibold mb-2">Host Information</h4>
              <div className="flex items-start gap-3">
                <div className="w-12 h-12 bg-primary/10 rounded-full flex items-center justify-center">
                  <Users className="w-6 h-6 text-primary" />
                </div>
                <div>
                  <p className="font-medium">{selectedEvent.hostName}</p>
                  <p className="text-sm text-primary">{selectedEvent.hostOrganization}</p>
                  <p className="text-sm text-muted-foreground mt-1">{selectedEvent.hostBio}</p>
                </div>
              </div>
            </div>

            {/* Agenda */}
            <div>
              <h4 className="font-semibold mb-3">Event Agenda</h4>
              <div className="space-y-3">
                {selectedEvent.agenda?.map((item: any, idx: number) => (
                  <div key={idx} className="flex gap-3 p-3 bg-muted/20 rounded-lg">
                    <Badge variant="outline" className="shrink-0">
                      {item.time}
                    </Badge>
                    <span className="text-sm">{item.topic}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Topics Covered */}
            <div>
              <h4 className="font-semibold mb-2">Topics Covered</h4>
              <div className="flex flex-wrap gap-2">
                {selectedEvent.topicsCovered.map((topic: string) => (
                  <Badge key={topic} variant="outline">
                    {topic}
                  </Badge>
                ))}
              </div>
            </div>

            {/* Target Audience */}
            <div>
              <h4 className="font-semibold mb-2">Target Audience</h4>
              <div className="flex flex-wrap gap-2">
                {selectedEvent.targetAudience.map((audience: string) => (
                  <Badge key={audience} variant="secondary">
                    {audience}
                  </Badge>
                ))}
              </div>
            </div>

            {/* Actions */}
            <div className="flex gap-3">
              {selectedEvent.status === 'upcoming' && !selectedEvent.isRegistered && (
                <Button className="flex-1 bg-gradient-primary">
                  Register for Event
                </Button>
              )}
              
              {selectedEvent.status === 'upcoming' && selectedEvent.isRegistered && (
                <Button className="flex-1" disabled>
                  <CheckCircle className="w-4 h-4 mr-2" />
                  Already Registered
                </Button>
              )}
              
              {selectedEvent.status === 'completed' && selectedEvent.recordingAvailable && (
                <Button className="flex-1 bg-gradient-primary">
                  <Play className="w-4 h-4 mr-2" />
                  Watch Recording
                </Button>
              )}
              
              <Button variant="outline" asChild>
                <a href={selectedEvent.meetingLink} target="_blank" rel="noopener noreferrer">
                  <ExternalLink className="w-4 h-4 mr-2" />
                  Event Link
                </a>
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );

  const upcomingEvents = events.filter(e => e.status === 'upcoming');
  const pastEvents = events.filter(e => e.status === 'completed');

  return (
    <div className="min-h-screen bg-gradient-background">
      <div className="container mx-auto px-4 py-6 max-w-7xl">
        {/* Header */}
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold mb-2">Events & Webinars</h1>
          <p className="text-muted-foreground text-lg">
            Join expert-led sessions, workshops, and university fairs
          </p>
        </div>

        {/* Quick Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
          <Card>
            <CardContent className="p-4 text-center">
              <Calendar className="w-8 h-8 text-primary mx-auto mb-2" />
              <p className="text-2xl font-bold">{upcomingEvents.length}</p>
              <p className="text-sm text-muted-foreground">Upcoming Events</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 text-center">
              <Users className="w-8 h-8 text-primary mx-auto mb-2" />
              <p className="text-2xl font-bold">2,450+</p>
              <p className="text-sm text-muted-foreground">Total Registrations</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 text-center">
              <Award className="w-8 h-8 text-primary mx-auto mb-2" />
              <p className="text-2xl font-bold">50+</p>
              <p className="text-sm text-muted-foreground">Expert Speakers</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 text-center">
              <Play className="w-8 h-8 text-primary mx-auto mb-2" />
              <p className="text-2xl font-bold">25</p>
              <p className="text-sm text-muted-foreground">Recorded Sessions</p>
            </CardContent>
          </Card>
        </div>

        {/* Search and Filters */}
        <Card className="mb-6">
          <CardContent className="p-6">
            <div className="flex flex-col md:flex-row gap-4">
              <div className="flex-1 relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground w-4 h-4" />
                <Input 
                  placeholder="Search events by title, host, or topic..." 
                  className="pl-10"
                />
              </div>
              <Button variant="outline" className="gap-2">
                <Filter className="w-4 h-4" />
                Filter Events
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Event Types Filter */}
        <div className="flex flex-wrap gap-2 mb-6">
          {eventTypes.map(type => {
            const Icon = type.icon;
            return (
              <Button
                key={type.id}
                variant="outline"
                size="sm"
                className="gap-2"
              >
                <Icon className="w-4 h-4" />
                {type.name}
              </Button>
            );
          })}
        </div>

        {/* Events Tabs */}
        <Tabs defaultValue="upcoming" value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="grid w-full grid-cols-3 mb-6">
            <TabsTrigger value="upcoming">Upcoming Events</TabsTrigger>
            <TabsTrigger value="past">Past Events</TabsTrigger>
            <TabsTrigger value="registered">My Events</TabsTrigger>
          </TabsList>

          <TabsContent value="upcoming">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {upcomingEvents.map(event => (
                <EventCard key={event.id} event={event} />
              ))}
            </div>
          </TabsContent>

          <TabsContent value="past">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {pastEvents.map(event => (
                <EventCard key={event.id} event={event} />
              ))}
            </div>
          </TabsContent>

          <TabsContent value="registered">
            <div className="text-center py-12">
              <Users className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
              <h3 className="text-xl font-semibold mb-2">My Registered Events</h3>
              <p className="text-muted-foreground">Your registered events will appear here</p>
            </div>
          </TabsContent>
        </Tabs>

        {/* Load More */}
        <div className="text-center mt-8">
          <Button variant="outline">Load More Events</Button>
        </div>

        <EventDetailsDialog />
      </div>
    </div>
  );
};

export default Events;