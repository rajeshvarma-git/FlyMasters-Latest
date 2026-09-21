import { useState, useEffect } from 'react';
import { useAuth } from '@student/hooks/useAuth';
import { Card, CardContent, CardHeader, CardTitle } from '@student/components/ui/card';
import { Button } from '@student/components/ui/button';
import { Input } from '@student/components/ui/input';
import { Badge } from '@student/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@student/components/ui/avatar';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@student/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@student/components/ui/select';
import { Calendar } from '@student/components/ui/calendar';
import { 
  Star, 
  Clock, 
  Users, 
  MapPin, 
  Languages, 
  Award, 
  Calendar as CalendarIcon,
  Filter,
  Search,
  Video,
  MessageSquare,
  CheckCircle,
  Globe
} from 'lucide-react';
import { format } from 'date-fns';

const Experts = () => {
  const { user } = useAuth();
  const [selectedDate, setSelectedDate] = useState<Date>();
  const [selectedExpert, setSelectedExpert] = useState<any>(null);
  const [showBookingDialog, setShowBookingDialog] = useState(false);

  // Mock data - replace with actual Supabase queries
  const [counselors, setCounselors] = useState([
    {
      id: '1',
      name: 'Dr. Kamalakannan S',
      title: 'Lead Counsellor',
      specializations: ['USA', 'Canada', 'Computer Science', 'Engineering'],
      experience: 8,
      education: 'PhD in Education, Stanford University',
      rating: 4.9,
      reviewsCount: 156,
      studentsHelped: 450,
      successRate: 94,
      languages: ['English', 'Tamil', 'Hindi'],
      timezone: 'IST (GMT+5:30)',
      hourlyRate: 50,
      isVerified: true,
      isPremium: true,
      bio: 'Specialized in STEM admissions to top US universities. Helped 450+ students secure admissions to Ivy League and top-tier institutions.',
      achievements: [
        '94% admission success rate',
        '50+ Ivy League admits',
        'Featured in Education Today magazine'
      ],
      availableSlots: ['10:00 AM', '2:00 PM', '4:00 PM', '6:00 PM'],
      nextAvailable: 'Tomorrow'
    },
    {
      id: '2',
      name: 'Jemini Ganatra',
      title: 'Lead Counsellor',
      specializations: ['UK', 'Australia', 'Business', 'MBA'],
      experience: 6,
      education: 'MBA from London Business School',
      rating: 4.8,
      reviewsCount: 89,
      studentsHelped: 280,
      successRate: 91,
      languages: ['English', 'Gujarati', 'Hindi'],
      timezone: 'GMT',
      hourlyRate: 45,
      isVerified: true,
      isPremium: true,
      bio: 'Expert in UK and Australian university admissions with focus on business programs and MBA applications.',
      achievements: [
        '91% admission success rate',
        'Oxford & Cambridge expert',
        'Top MBA consultant 2023'
      ],
      availableSlots: ['9:00 AM', '1:00 PM', '3:00 PM', '5:00 PM'],
      nextAvailable: 'Today'
    },
    {
      id: '3',
      name: 'Preethi Sharma',
      title: 'Senior Counsellor',
      specializations: ['Germany', 'Netherlands', 'Engineering', 'Research'],
      experience: 5,
      education: 'MS in Engineering, TU Munich',
      rating: 4.7,
      reviewsCount: 67,
      studentsHelped: 220,
      successRate: 89,
      languages: ['English', 'German', 'Telugu'],
      timezone: 'CET (GMT+1)',
      hourlyRate: 40,
      isVerified: true,
      isPremium: false,
      bio: 'European education specialist with deep knowledge of German and Dutch university systems.',
      achievements: [
        '89% admission success rate',
        'European education expert',
        'Research program specialist'
      ],
      availableSlots: ['11:00 AM', '3:00 PM', '7:00 PM'],
      nextAvailable: 'In 2 days'
    }
  ]);  // Close useState function

  const specializations = [
    'All Specializations',
    'USA',
    'Canada', 
    'UK',
    'Australia',
    'Germany',
    'Netherlands',
    'Computer Science',
    'Engineering', 
    'Business',
    'MBA'
  ];

  const timeSlots = [
    '9:00 AM', '10:00 AM', '11:00 AM', '12:00 PM',
    '1:00 PM', '2:00 PM', '3:00 PM', '4:00 PM',
    '5:00 PM', '6:00 PM', '7:00 PM', '8:00 PM'
  ];

  const ExpertCard = ({ expert }: { expert: any }) => (
    <Card className="hover:shadow-lg transition-all duration-300">
      <CardContent className="p-6">
        <div className="flex items-start gap-4">
          <div className="relative">
            <Avatar className="w-16 h-16">
              <AvatarImage src="" />
              <AvatarFallback className="bg-primary/10 text-primary text-lg">
                {expert.name.split(' ').map((n: string) => n[0]).join('')}
              </AvatarFallback>
            </Avatar>
            {expert.isVerified && (
              <CheckCircle className="absolute -top-1 -right-1 w-5 h-5 text-green-500 bg-white rounded-full" />
            )}
          </div>

          <div className="flex-1 space-y-3">
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-semibold text-lg">{expert.name}</h3>
                {expert.isPremium && (
                  <Badge className="bg-gradient-primary">Premium</Badge>
                )}
              </div>
              <p className="text-primary font-medium">{expert.title}</p>
              <p className="text-sm text-muted-foreground">{expert.education}</p>
            </div>

            <div className="flex items-center gap-4 text-sm">
              <div className="flex items-center gap-1">
                <Star className="w-4 h-4 fill-yellow-400 text-yellow-400" />
                <span className="font-semibold">{expert.rating}</span>
                <span className="text-muted-foreground">({expert.reviewsCount})</span>
              </div>
              <div className="flex items-center gap-1">
                <Users className="w-4 h-4 text-muted-foreground" />
                <span>{expert.studentsHelped}+ students</span>
              </div>
              <div className="flex items-center gap-1">
                <Award className="w-4 h-4 text-muted-foreground" />
                <span>{expert.successRate}% success</span>
              </div>
            </div>

            <div className="space-y-2">
              <p className="text-sm">{expert.bio}</p>
              
              <div className="flex flex-wrap gap-1">
                {expert.specializations.map((spec: string) => (
                  <Badge key={spec} variant="outline" className="text-xs">
                    {spec}
                  </Badge>
                ))}
              </div>

              <div className="flex items-center gap-4 text-xs text-muted-foreground">
                <div className="flex items-center gap-1">
                  <Clock className="w-3 h-3" />
                  <span>{expert.experience}+ years exp.</span>
                </div>
                <div className="flex items-center gap-1">
                  <Languages className="w-3 h-3" />
                  <span>{expert.languages.join(', ')}</span>
                </div>
                <div className="flex items-center gap-1">
                  <Globe className="w-3 h-3" />
                  <span>{expert.timezone}</span>
                </div>
              </div>
            </div>

            <div className="flex items-center justify-between pt-2">
              <div>
                <p className="text-lg font-semibold">${expert.hourlyRate}/hour</p>
                <p className="text-xs text-green-600">Next available: {expert.nextAvailable}</p>
              </div>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-2"
                >
                  <MessageSquare className="w-4 h-4" />
                  Message
                </Button>
                <Button
                  size="sm"
                  className="bg-gradient-primary gap-2"
                  onClick={() => {
                    setSelectedExpert(expert);
                    setShowBookingDialog(true);
                  }}
                >
                  <CalendarIcon className="w-4 h-4" />
                  Book Session
                </Button>
              </div>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );

  const BookingDialog = () => (
    <Dialog open={showBookingDialog} onOpenChange={setShowBookingDialog}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Book 1-1 Expert Session</DialogTitle>
        </DialogHeader>
        
        {selectedExpert && (
          <div className="space-y-6">
            {/* Expert Info */}
            <Card className="bg-gradient-primary/10">
              <CardContent className="p-4">
                <div className="flex items-center gap-3">
                  <Avatar className="w-12 h-12">
                    <AvatarFallback className="bg-primary/20 text-primary">
                      {selectedExpert.name.split(' ').map((n: string) => n[0]).join('')}
                    </AvatarFallback>
                  </Avatar>
                  <div>
                    <h4 className="font-semibold">{selectedExpert.name}</h4>
                    <p className="text-sm text-muted-foreground">{selectedExpert.title}</p>
                    <div className="flex items-center gap-2 text-sm">
                      <Star className="w-4 h-4 fill-yellow-400 text-yellow-400" />
                      <span>{selectedExpert.rating} • {selectedExpert.reviewsCount} reviews</span>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Session Benefits */}
            <Card>
              <CardContent className="p-4">
                <h4 className="font-semibold mb-3">What you'll get in this session:</h4>
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <CheckCircle className="w-4 h-4 text-green-500" />
                    <span className="text-sm">Direction on country, intake, deadlines, tests...</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <CheckCircle className="w-4 h-4 text-green-500" />
                    <span className="text-sm">Overview of the process & eligibility criteria</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <CheckCircle className="w-4 h-4 text-green-500" />
                    <span className="text-sm">Personalized university shortlist</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <CheckCircle className="w-4 h-4 text-green-500" />
                    <span className="text-sm">Application strategy & timeline</span>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Date Selection */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium mb-2">Select Date</label>
                <Calendar
                  mode="single"
                  selected={selectedDate}
                  onSelect={setSelectedDate}
                  disabled={(date) => date < new Date()}
                  className="rounded-md border"
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium mb-2">Select Time</label>
                <div className="grid grid-cols-2 gap-2">
                  {selectedExpert.availableSlots.map((slot: string) => (
                    <Button
                      key={slot}
                      variant="outline"
                      size="sm"
                      className="justify-center"
                    >
                      {slot}
                    </Button>
                  ))}
                </div>
              </div>
            </div>

            {/* Session Type */}
            <div>
              <label className="block text-sm font-medium mb-2">Session Type</label>
              <Select defaultValue="consultation">
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="consultation">Initial Consultation (60 min)</SelectItem>
                  <SelectItem value="follow_up">Follow-up Session (30 min)</SelectItem>
                  <SelectItem value="emergency">Emergency Consultation (30 min)</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Pricing */}
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-semibold">Session Cost</p>
                    <p className="text-sm text-muted-foreground">60 minutes • 1-on-1 consultation</p>
                  </div>
                  <div className="text-right">
                    <p className="text-2xl font-bold">${selectedExpert.hourlyRate}</p>
                    <p className="text-sm text-green-600">Free for first consultation</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <div className="flex justify-between items-center">
              <div className="text-sm text-muted-foreground">
                <p>Guided <span className="font-semibold text-primary">90k+</span> Students</p>
                <p>Average Rating <span className="font-semibold text-primary">4.9/5</span></p>
              </div>
              
              <Button className="bg-gradient-primary px-8">
                Finish Booking
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );

  return (
    <div className="min-h-screen bg-gradient-background">
      <div className="container mx-auto px-4 py-6 max-w-7xl">
        {/* Header */}
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold mb-2">Expert Counselors</h1>
          <p className="text-muted-foreground text-lg">
            We have a team of <span className="font-semibold text-primary">60+</span> experienced counselors ready to help you!
          </p>
        </div>

        {/* Search and Filters */}
        <div className="flex flex-col md:flex-row gap-4 mb-6">
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground w-4 h-4" />
            <Input 
              placeholder="Search counselors by name, specialization, or country..." 
              className="pl-10"
            />
          </div>
          <Select>
            <SelectTrigger className="w-full md:w-64">
              <SelectValue placeholder="Specialization" />
            </SelectTrigger>
            <SelectContent>
              {specializations.map(spec => (
                <SelectItem key={spec} value={spec.toLowerCase().replace(/\s+/g, '_')}>
                  {spec}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button variant="outline" className="gap-2">
            <Filter className="w-4 h-4" />
            More Filters
          </Button>
        </div>

        {/* Quick Stats */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
          <Card>
            <CardContent className="p-4 text-center">
              <Users className="w-8 h-8 text-primary mx-auto mb-2" />
              <p className="text-2xl font-bold">60+</p>
              <p className="text-sm text-muted-foreground">Expert Counselors</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 text-center">
              <Award className="w-8 h-8 text-primary mx-auto mb-2" />
              <p className="text-2xl font-bold">92%</p>
              <p className="text-sm text-muted-foreground">Success Rate</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 text-center">
              <Globe className="w-8 h-8 text-primary mx-auto mb-2" />
              <p className="text-2xl font-bold">25+</p>
              <p className="text-sm text-muted-foreground">Countries Covered</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 text-center">
              <CheckCircle className="w-8 h-8 text-primary mx-auto mb-2" />
              <p className="text-2xl font-bold">90k+</p>
              <p className="text-sm text-muted-foreground">Students Guided</p>
            </CardContent>
          </Card>
        </div>

        {/* Counselors Grid */}
        <div className="space-y-4">
          {counselors.map(expert => (
            <ExpertCard key={expert.id} expert={expert} />
          ))}
        </div>

        {/* Load More */}
        <div className="text-center mt-8">
          <Button variant="outline">View More Counselors</Button>
        </div>

        <BookingDialog />
      </div>
    </div>
  );
};

export default Experts;