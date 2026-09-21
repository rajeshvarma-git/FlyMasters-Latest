import { useState, useEffect } from 'react';
import { useAuth } from '@student/hooks/useAuth';
import { Card, CardContent, CardHeader, CardTitle } from '@student/components/ui/card';
import { Button } from '@student/components/ui/button';
import { Input } from '@student/components/ui/input';
import { Badge } from '@student/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@student/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@student/components/ui/dialog';
import { 
  DollarSign, 
  Calendar, 
  GraduationCap, 
  MapPin, 
  Filter,
  Search,
  ExternalLink,
  BookmarkPlus,
  Award,
  Users,
  Target,
  TrendingUp,
  Clock,
  CheckCircle
} from 'lucide-react';
import { format } from 'date-fns';

const Scholarships = () => {
  const { user } = useAuth();
  const [selectedScholarship, setSelectedScholarship] = useState<any>(null);
  const [showDetails, setShowDetails] = useState(false);

  // Mock data - replace with actual Supabase queries
  const [scholarships] = useState([
    {
      id: '1',
      name: 'Fulbright Foreign Student Program',
      provider: 'US Government',
      amount: 50000,
      currency: 'USD',
      deadline: new Date('2024-10-15'),
      description: 'Provides funding for graduate students, young professionals and artists from abroad to study and conduct research in the United States.',
      countries: ['USA'],
      fieldsOfStudy: ['All Fields'],
      degreeLevels: ['Masters', 'PhD'],
      isNeedBased: false,
      isMeritBased: true,
      eligibilityScore: 85,
      requirements: [
        "Bachelor's degree or equivalent",
        'English proficiency (TOEFL/IELTS)',
        'Strong academic record',
        'Leadership experience'
      ],
      website: 'https://foreign.fulbrightonline.org'
    },
    {
      id: '2',
      name: 'DAAD Scholarships',
      provider: 'German Academic Exchange Service',
      amount: 25000,
      currency: 'EUR',
      deadline: new Date('2024-11-30'),
      description: 'Comprehensive scholarship program for international students to study in Germany.',
      countries: ['Germany'],
      fieldsOfStudy: ['Engineering', 'Computer Science', 'Natural Sciences'],
      degreeLevels: ['Masters', 'PhD'],
      isNeedBased: false,
      isMeritBased: true,
      eligibilityScore: 78,
      requirements: [
        "Bachelor's degree with good grades",
        'German or English proficiency',
        'Research proposal (for PhD)',
        'Motivation letter'
      ],
      website: 'https://www.daad.de'
    },
    {
      id: '3',
      name: 'Australia Awards Scholarships',
      provider: 'Australian Government',
      amount: 40000,
      currency: 'AUD',
      deadline: new Date('2024-09-30'),
      description: 'Long-term awards that provide opportunities for people from developing countries to undertake full-time undergraduate or postgraduate study.',
      countries: ['Australia'],
      fieldsOfStudy: ['All Fields'],
      degreeLevels: ['Bachelors', 'Masters'],
      isNeedBased: true,
      isMeritBased: true,
      eligibilityScore: 72,
      requirements: [
        'From eligible developing country',
        'Meet English language requirements',
        'Health and character requirements',
        'Return to home country after studies'
      ],
      website: 'https://www.australiaawards.gov.au'
    },
    {
      id: '4',
      name: 'Chevening Scholarships',
      provider: 'UK Government',
      amount: 35000,
      currency: 'GBP',
      deadline: new Date('2024-11-07'),
      description: "UK government's global scholarship programme, funded by the Foreign, Commonwealth & Development Office.",
      countries: ['UK'],
      fieldsOfStudy: ['All Fields'],
      degreeLevels: ['Masters'],
      isNeedBased: false,
      isMeritBased: true,
      eligibilityScore: 90,
      requirements: [
        "Bachelor's degree",
        'At least 2 years work experience',
        'English language requirement',
        'Leadership potential'
      ],
      website: 'https://www.chevening.org'
    },
    {
      id: '5',
      name: 'Vanier Canada Graduate Scholarships',
      provider: 'Government of Canada',
      amount: 50000,
      currency: 'CAD',
      deadline: new Date('2024-11-01'),
      description: 'Prestigious scholarship for doctoral students demonstrating leadership skills and a high standard of scholarly achievement.',
      countries: ['Canada'],
      fieldsOfStudy: ['Health Research', 'Natural Sciences', 'Social Sciences', 'Engineering'],
      degreeLevels: ['PhD'],
      isNeedBased: false,
      isMeritBased: true,
      eligibilityScore: 95,
      requirements: [
        'Nominated by Canadian institution',
        'Demonstrated leadership',
        'High standard of scholarly achievement',
        'Research potential'
      ],
      website: 'https://vanier.gc.ca'
    }
  ]);  // Close useState function

  const [filters, setFilters] = useState({
    country: 'all',
    degreeLevel: 'all',
    field: 'all',
    amount: 'all'
  });

  const countries = ['All Countries', 'USA', 'UK', 'Canada', 'Germany', 'Australia', 'Netherlands'];
  const degreeLevels = ['All Levels', 'Bachelors', 'Masters', 'PhD'];
  const fields = ['All Fields', 'Engineering', 'Computer Science', 'Business', 'Medicine', 'Natural Sciences'];

  const getDaysUntilDeadline = (deadline: Date) => {
    const today = new Date();
    const diffTime = deadline.getTime() - today.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    return diffDays;
  };

  const getDeadlineStatus = (deadline: Date) => {
    const days = getDaysUntilDeadline(deadline);
    if (days < 0) return { color: 'text-red-500', text: 'Expired' };
    if (days <= 7) return { color: 'text-red-500', text: `${days} days left` };
    if (days <= 30) return { color: 'text-yellow-600', text: `${days} days left` };
    return { color: 'text-green-600', text: `${days} days left` };
  };

  const ScholarshipCard = ({ scholarship }: { scholarship: any }) => {
    const deadlineStatus = getDeadlineStatus(scholarship.deadline);

    return (
      <Card className="hover:shadow-lg transition-all duration-300">
        <CardContent className="p-6">
          <div className="space-y-4">
            {/* Header */}
            <div className="flex items-start justify-between">
              <div className="flex-1">
                <h3 className="font-semibold text-lg mb-1">{scholarship.name}</h3>
                <p className="text-primary font-medium">{scholarship.provider}</p>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {/* Handle bookmark */}}
              >
                <BookmarkPlus className="w-4 h-4" />
              </Button>
            </div>

            {/* Amount and Eligibility */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <DollarSign className="w-5 h-5 text-green-600" />
                <span className="font-bold text-lg">
                  {scholarship.currency} {scholarship.amount.toLocaleString()}
                </span>
              </div>
              <div className="text-right">
                <p className="text-sm text-muted-foreground">Eligibility Match</p>
                <div className="flex items-center gap-2">
                  <div className="w-16 bg-muted rounded-full h-2">
                    <div 
                      className="bg-gradient-primary h-2 rounded-full transition-all"
                      style={{ width: `${scholarship.eligibilityScore}%` }}
                    />
                  </div>
                  <span className="text-sm font-semibold">{scholarship.eligibilityScore}%</span>
                </div>
              </div>
            </div>

            {/* Description */}
            <p className="text-muted-foreground text-sm">{scholarship.description}</p>

            {/* Tags */}
            <div className="flex flex-wrap gap-2">
              {scholarship.countries.map((country: string) => (
                <Badge key={country} variant="outline" className="text-xs">
                  <MapPin className="w-3 h-3 mr-1" />
                  {country}
                </Badge>
              ))}
              {scholarship.degreeLevels.map((level: string) => (
                <Badge key={level} variant="outline" className="text-xs">
                  <GraduationCap className="w-3 h-3 mr-1" />
                  {level}
                </Badge>
              ))}
            </div>

            {/* Deadline and Type */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4 text-sm">
                <div className="flex items-center gap-1">
                  <Calendar className="w-4 h-4 text-muted-foreground" />
                  <span>Deadline: {format(scholarship.deadline, 'MMM dd, yyyy')}</span>
                </div>
                <div className={`flex items-center gap-1 ${deadlineStatus.color}`}>
                  <Clock className="w-4 h-4" />
                  <span className="font-medium">{deadlineStatus.text}</span>
                </div>
              </div>
              <div className="flex gap-1">
                {scholarship.isMeritBased && (
                  <Badge variant="secondary" className="text-xs">Merit-based</Badge>
                )}
                {scholarship.isNeedBased && (
                  <Badge variant="secondary" className="text-xs">Need-based</Badge>
                )}
              </div>
            </div>

            {/* Actions */}
            <div className="flex gap-2">
              <Button 
                className="flex-1"
                onClick={() => {
                  setSelectedScholarship(scholarship);
                  setShowDetails(true);
                }}
              >
                View Details
              </Button>
              <Button variant="outline" size="sm" asChild>
                <a href={scholarship.website} target="_blank" rel="noopener noreferrer">
                  <ExternalLink className="w-4 h-4" />
                </a>
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  };

  const ScholarshipDetailsDialog = () => (
    <Dialog open={showDetails} onOpenChange={setShowDetails}>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{selectedScholarship?.name}</DialogTitle>
        </DialogHeader>
        
        {selectedScholarship && (
          <div className="space-y-6">
            {/* Quick Info */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="text-center p-3 bg-primary/5 rounded-lg">
                <DollarSign className="w-6 h-6 text-primary mx-auto mb-1" />
                <p className="font-bold">{selectedScholarship.currency} {selectedScholarship.amount.toLocaleString()}</p>
                <p className="text-xs text-muted-foreground">Award Amount</p>
              </div>
              <div className="text-center p-3 bg-primary/5 rounded-lg">
                <Calendar className="w-6 h-6 text-primary mx-auto mb-1" />
                <p className="font-bold">{format(selectedScholarship.deadline, 'MMM dd')}</p>
                <p className="text-xs text-muted-foreground">Deadline</p>
              </div>
              <div className="text-center p-3 bg-primary/5 rounded-lg">
                <Target className="w-6 h-6 text-primary mx-auto mb-1" />
                <p className="font-bold">{selectedScholarship.eligibilityScore}%</p>
                <p className="text-xs text-muted-foreground">Match</p>
              </div>
              <div className="text-center p-3 bg-primary/5 rounded-lg">
                <Award className="w-6 h-6 text-primary mx-auto mb-1" />
                <p className="font-bold">{selectedScholarship.provider}</p>
                <p className="text-xs text-muted-foreground">Provider</p>
              </div>
            </div>

            {/* Description */}
            <div>
              <h4 className="font-semibold mb-2">About This Scholarship</h4>
              <p className="text-muted-foreground">{selectedScholarship.description}</p>
            </div>

            {/* Eligibility */}
            <div>
              <h4 className="font-semibold mb-3">Eligibility Requirements</h4>
              <div className="space-y-2">
                {selectedScholarship.requirements.map((req: string, idx: number) => (
                  <div key={idx} className="flex items-start gap-2">
                    <CheckCircle className="w-4 h-4 text-green-500 mt-0.5 flex-shrink-0" />
                    <span className="text-sm">{req}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Coverage */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <h5 className="font-medium mb-2">Countries</h5>
                <div className="space-y-1">
                  {selectedScholarship.countries.map((country: string) => (
                    <Badge key={country} variant="outline" className="mr-1">
                      {country}
                    </Badge>
                  ))}
                </div>
              </div>
              <div>
                <h5 className="font-medium mb-2">Degree Levels</h5>
                <div className="space-y-1">
                  {selectedScholarship.degreeLevels.map((level: string) => (
                    <Badge key={level} variant="outline" className="mr-1">
                      {level}
                    </Badge>
                  ))}
                </div>
              </div>
              <div>
                <h5 className="font-medium mb-2">Fields of Study</h5>
                <div className="space-y-1">
                  {selectedScholarship.fieldsOfStudy.map((field: string) => (
                    <Badge key={field} variant="outline" className="mr-1">
                      {field}
                    </Badge>
                  ))}
                </div>
              </div>
            </div>

            {/* Actions */}
            <div className="flex gap-3">
              <Button className="flex-1 bg-gradient-primary">
                Apply Now
              </Button>
              <Button variant="outline" asChild>
                <a href={selectedScholarship.website} target="_blank" rel="noopener noreferrer">
                  <ExternalLink className="w-4 h-4 mr-2" />
                  Official Website
                </a>
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
          <h1 className="text-3xl font-bold mb-2">Scholarship Finder</h1>
          <p className="text-muted-foreground text-lg">
            Discover funding opportunities for your study abroad dreams
          </p>
        </div>

        {/* Quick Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
          <Card>
            <CardContent className="p-4 text-center">
              <Award className="w-8 h-8 text-primary mx-auto mb-2" />
              <p className="text-2xl font-bold">500+</p>
              <p className="text-sm text-muted-foreground">Available Scholarships</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 text-center">
              <DollarSign className="w-8 h-8 text-primary mx-auto mb-2" />
              <p className="text-2xl font-bold">$2.5M+</p>
              <p className="text-sm text-muted-foreground">Total Funding</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 text-center">
              <Users className="w-8 h-8 text-primary mx-auto mb-2" />
              <p className="text-2xl font-bold">1,200+</p>
              <p className="text-sm text-muted-foreground">Students Funded</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 text-center">
              <TrendingUp className="w-8 h-8 text-primary mx-auto mb-2" />
              <p className="text-2xl font-bold">85%</p>
              <p className="text-sm text-muted-foreground">Success Rate</p>
            </CardContent>
          </Card>
        </div>

        {/* Search and Filters */}
        <Card className="mb-6">
          <CardContent className="p-6">
            <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground w-4 h-4" />
                <Input 
                  placeholder="Search scholarships..." 
                  className="pl-10"
                />
              </div>
              <Select value={filters.country} onValueChange={(value) => setFilters({...filters, country: value})}>
                <SelectTrigger>
                  <SelectValue placeholder="Country" />
                </SelectTrigger>
                <SelectContent>
                  {countries.map(country => (
                    <SelectItem key={country} value={country.toLowerCase().replace(/\s+/g, '_')}>
                      {country}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={filters.degreeLevel} onValueChange={(value) => setFilters({...filters, degreeLevel: value})}>
                <SelectTrigger>
                  <SelectValue placeholder="Degree Level" />
                </SelectTrigger>
                <SelectContent>
                  {degreeLevels.map(level => (
                    <SelectItem key={level} value={level.toLowerCase().replace(/\s+/g, '_')}>
                      {level}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={filters.field} onValueChange={(value) => setFilters({...filters, field: value})}>
                <SelectTrigger>
                  <SelectValue placeholder="Field of Study" />
                </SelectTrigger>
                <SelectContent>
                  {fields.map(field => (
                    <SelectItem key={field} value={field.toLowerCase().replace(/\s+/g, '_')}>
                      {field}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button variant="outline" className="gap-2">
                <Filter className="w-4 h-4" />
                More Filters
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Scholarships Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {scholarships.map(scholarship => (
            <ScholarshipCard key={scholarship.id} scholarship={scholarship} />
          ))}
        </div>

        {/* Load More */}
        <div className="text-center mt-8">
          <Button variant="outline">Load More Scholarships</Button>
        </div>

        <ScholarshipDetailsDialog />
      </div>
    </div>
  );
};

export default Scholarships;