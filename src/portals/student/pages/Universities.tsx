import React, { useState, useEffect } from 'react';
import { Search, Filter, MapPin, DollarSign, Clock, Award, GraduationCap, ArrowRight, Users, BookOpen, Globe, TrendingUp } from 'lucide-react';
import { Button } from '@student/components/ui/button';
import { Input } from '@student/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@student/components/ui/select';
import { Card, CardContent, CardHeader, CardTitle } from '@student/components/ui/card';
import { Badge } from '@student/components/ui/badge';
import { supabase } from '@student/integrations/supabase/client';
import { toast } from 'sonner';
import ChatButton from '@student/components/ChatButton';

interface University {
  id: string;
  name: string;
  country: string;
  city: string;
  state_province: string;
  description: string;
  ranking: number;
  is_tie_up: boolean;
  university_type: string;
  website_url: string;
}

interface Course {
  id: string;
  name: string;
  degree_type: string;
  field_of_study: string;
  duration_months: number;
  tuition_fee_usd: number;
  ielts_requirement: number;
  toefl_requirement: number;
  gre_requirement: boolean;
  scholarship_available: boolean;
  visa_sponsorship: boolean;
  requirements: string;
}

interface UniversityWithCourses extends University {
  courses: Course[];
}

const Universities: React.FC = () => {
  const [universities, setUniversities] = useState<UniversityWithCourses[]>([]);
  const [filteredUniversities, setFilteredUniversities] = useState<UniversityWithCourses[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCountry, setSelectedCountry] = useState<string>('all');
  const [selectedDegree, setSelectedDegree] = useState<string>('all');
  const [selectedField, setSelectedField] = useState<string>('all');
  const [maxBudget, setMaxBudget] = useState<string>('');

  // Get unique values for filters
  const countries = [...new Set(universities.map(uni => uni.country))];
  const degreeTypes = [...new Set(universities.flatMap(uni => uni.courses.map(course => course.degree_type)))];
  const fieldOfStudy = [...new Set(universities.flatMap(uni => uni.courses.map(course => course.field_of_study)))];

  useEffect(() => {
    fetchUniversities();
  }, []);

  useEffect(() => {
    applyFilters();
  }, [universities, searchTerm, selectedCountry, selectedDegree, selectedField, maxBudget]);

  const fetchUniversities = async () => {
    try {
      setLoading(true);
      
      // Fetch universities with their courses
      const { data: universitiesData, error: uniError } = await supabase
        .from('universities')
        .select('*')
        .eq('is_active', true)
        .order('ranking', { ascending: true });

      if (uniError) throw uniError;

      const { data: coursesData, error: coursesError } = await supabase
        .from('courses')
        .select('*')
        .eq('is_active', true);

      if (coursesError) throw coursesError;

      // Combine universities with their courses
      const universitiesWithCourses = universitiesData.map(uni => ({
        ...uni,
        courses: coursesData.filter(course => course.university_id === uni.id)
      }));

      setUniversities(universitiesWithCourses);
    } catch (error) {
      console.error('Error fetching universities:', error);
      toast.error('Failed to load universities');
    } finally {
      setLoading(false);
    }
  };

  const applyFilters = () => {
    let filtered = universities;

    // Search filter
    if (searchTerm) {
      filtered = filtered.filter(uni => 
        uni.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        uni.city.toLowerCase().includes(searchTerm.toLowerCase()) ||
        uni.courses.some(course => 
          course.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
          course.field_of_study?.toLowerCase().includes(searchTerm.toLowerCase())
        )
      );
    }

    // Country filter
    if (selectedCountry !== 'all') {
      filtered = filtered.filter(uni => uni.country === selectedCountry);
    }

    // Degree filter
    if (selectedDegree !== 'all') {
      filtered = filtered.filter(uni => 
        uni.courses.some(course => course.degree_type === selectedDegree)
      );
    }

    // Field of study filter
    if (selectedField !== 'all') {
      filtered = filtered.filter(uni => 
        uni.courses.some(course => course.field_of_study === selectedField)
      );
    }

    // Budget filter
    if (maxBudget) {
      const budget = parseFloat(maxBudget);
      filtered = filtered.filter(uni =>
        uni.courses.some(course => course.tuition_fee_usd <= budget)
      );
    }

    setFilteredUniversities(filtered);
  };

  const resetFilters = () => {
    setSearchTerm('');
    setSelectedCountry('all');
    setSelectedDegree('all');
    setSelectedField('all');
    setMaxBudget('');
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-background via-background to-primary/5 py-8">
        <div className="container mx-auto px-4">
          <div className="text-center">Loading universities...</div>
        </div>
      </div>
    );
  }

  return (
    <>
      {/* SEO Head */}
      <title>Top Universities Worldwide - Study Abroad | Fly Masters</title>
      
      <div className="min-h-screen bg-gradient-to-br from-background via-background to-primary/5">
        {/* Hero Section */}
        <section className="relative py-20 overflow-hidden">
          <div className="absolute inset-0 bg-gradient-background -z-10" />
          
          <div className="container mx-auto px-6 text-center">
            <div className="max-w-4xl mx-auto">
              <div className="inline-flex items-center gap-2 bg-white/20 backdrop-blur-md rounded-full px-4 py-2 border border-white/30 mb-6">
                <Globe className="w-4 h-4 text-primary" />
                <span className="text-sm font-medium">500+ Partner Universities</span>
              </div>
              
              <h1 className="text-5xl lg:text-6xl font-bold leading-tight mb-6">
                Discover World's
                <span className="gradient-text block">Top Universities</span>
              </h1>
              
              <p className="text-xl text-muted-foreground leading-relaxed mb-8 max-w-3xl mx-auto">
                Explore prestigious universities across 25+ countries. From Ivy League to top European institutions, find your perfect academic home with our AI-powered matching system.
              </p>
              
              <div className="flex flex-col sm:flex-row gap-4 justify-center mb-12">
                <ChatButton />
                
                <Button variant="glass" size="xl" className="group">
                  Explore All Universities
                  <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
                </Button>
              </div>

              {/* Quick Stats */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
                <div className="text-center">
                  <div className="text-3xl font-bold gradient-text">500+</div>
                  <div className="text-sm text-muted-foreground">Partner Universities</div>
                </div>
                <div className="text-center">
                  <div className="text-3xl font-bold gradient-text">25+</div>
                  <div className="text-sm text-muted-foreground">Countries</div>
                </div>
                <div className="text-center">
                  <div className="text-3xl font-bold gradient-text">98%</div>
                  <div className="text-sm text-muted-foreground">Success Rate</div>
                </div>
                <div className="text-center">
                  <div className="text-3xl font-bold gradient-text">50K+</div>
                  <div className="text-sm text-muted-foreground">Students Placed</div>
                </div>
              </div>
            </div>
          </div>
        </section>

        <div className="container mx-auto px-4 pb-20">

        {/* Search and Filters */}
        <Card className="mb-8 bg-card/80 backdrop-blur-sm border-primary/20">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Filter className="w-5 h-5" />
              Search & Filter Universities
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Search Bar */}
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground w-4 h-4" />
              <Input
                placeholder="Search universities, cities, or programs..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10"
              />
            </div>

            {/* Filter Row */}
            <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
              <Select value={selectedCountry} onValueChange={setSelectedCountry}>
                <SelectTrigger>
                  <SelectValue placeholder="Country" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Countries</SelectItem>
                  {countries.map(country => (
                    <SelectItem key={country} value={country}>{country}</SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Select value={selectedDegree} onValueChange={setSelectedDegree}>
                <SelectTrigger>
                  <SelectValue placeholder="Degree Type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Degrees</SelectItem>
                  {degreeTypes.map(degree => (
                    <SelectItem key={degree} value={degree}>
                      {degree.charAt(0).toUpperCase() + degree.slice(1)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Select value={selectedField} onValueChange={setSelectedField}>
                <SelectTrigger>
                  <SelectValue placeholder="Field of Study" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Fields</SelectItem>
                  {fieldOfStudy.map(field => (
                    <SelectItem key={field} value={field}>{field}</SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Input
                type="number"
                placeholder="Max Budget (USD)"
                value={maxBudget}
                onChange={(e) => setMaxBudget(e.target.value)}
              />

              <Button variant="outline" onClick={resetFilters}>
                Reset Filters
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Results Count */}
        <div className="mb-6">
          <p className="text-muted-foreground">
            Showing {filteredUniversities.length} of {universities.length} universities
          </p>
        </div>

        {/* University Cards */}
        <div className="grid gap-6">
          {filteredUniversities.map(university => (
            <Card key={university.id} className="bg-card/80 backdrop-blur-sm border-primary/20 hover:border-primary/40 transition-all duration-300">
              <CardHeader>
                <div className="flex justify-between items-start">
                  <div>
                    <CardTitle className="text-xl mb-2 flex items-center gap-2">
                      {university.name}
                      {university.is_tie_up && (
                        <Badge variant="secondary" className="bg-primary/20 text-primary">
                          Partner University
                        </Badge>
                      )}
                    </CardTitle>
                    <div className="flex items-center gap-4 text-muted-foreground text-sm">
                      <div className="flex items-center gap-1">
                        <MapPin className="w-4 h-4" />
                        {university.city}, {university.country}
                      </div>
                      {university.ranking && (
                        <div className="flex items-center gap-1">
                          <Award className="w-4 h-4" />
                          Rank #{university.ranking}
                        </div>
                      )}
                      <Badge variant="outline">
                        {university.university_type}
                      </Badge>
                    </div>
                  </div>
                </div>
                <p className="text-muted-foreground">{university.description}</p>
              </CardHeader>
              
              <CardContent>
                <div className="space-y-4">
                  <h4 className="font-semibold flex items-center gap-2">
                    <GraduationCap className="w-4 h-4" />
                    Available Programs ({university.courses.length})
                  </h4>
                  
                  <div className="grid gap-3">
                    {university.courses.slice(0, 3).map(course => (
                      <div key={course.id} className="border rounded-lg p-4 bg-background/50">
                        <div className="flex justify-between items-start mb-2">
                          <h5 className="font-medium">{course.name}</h5>
                          <Badge variant="outline">
                            {course.degree_type}
                          </Badge>
                        </div>
                        
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm text-muted-foreground">
                          <div className="flex items-center gap-1">
                            <DollarSign className="w-4 h-4" />
                            ${course.tuition_fee_usd?.toLocaleString()}/year
                          </div>
                          <div className="flex items-center gap-1">
                            <Clock className="w-4 h-4" />
                            {course.duration_months} months
                          </div>
                          <div className="flex items-center gap-1">
                            IELTS: {course.ielts_requirement}
                          </div>
                        </div>
                        
                        <div className="mt-2 flex gap-2">
                          {course.scholarship_available && (
                            <Badge variant="secondary" className="text-xs">Scholarship Available</Badge>
                          )}
                          {course.gre_requirement && (
                            <Badge variant="outline" className="text-xs">GRE Required</Badge>
                          )}
                          {course.visa_sponsorship && (
                            <Badge variant="outline" className="text-xs">Visa Sponsorship</Badge>
                          )}
                        </div>
                      </div>
                    ))}
                    
                    {university.courses.length > 3 && (
                      <Button variant="outline" size="sm" className="group">
                        View {university.courses.length - 3} More Programs
                        <ArrowRight className="w-4 h-4 ml-2 group-hover:translate-x-1 transition-transform" />
                      </Button>
                    )}
                  </div>
                </div>
                
                {/* University Actions */}
                <div className="mt-6 pt-4 border-t border-border/50">
                  <div className="flex gap-3">
                    <ChatButton />
                    <Button variant="outline" size="sm" className="flex-1">
                      Download Brochure
                    </Button>
                    <Button variant="outline" size="sm" className="flex-1">
                      Apply Now
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        {filteredUniversities.length === 0 && (
          <div className="text-center py-12">
            <p className="text-muted-foreground mb-4">No universities found matching your criteria.</p>
            <Button variant="outline" onClick={resetFilters}>
              Clear Filters
            </Button>
          </div>
        )}

        {/* Why Choose Our Universities Section */}
        <section className="mt-20">
          <div className="text-center mb-12">
            <h2 className="text-3xl font-bold mb-4">Why Choose Our Partner Universities?</h2>
            <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
              We've carefully selected top-tier institutions that offer the best opportunities for international students.
            </p>
          </div>
          
          <div className="grid md:grid-cols-3 gap-8 mb-12">
            <Card className="text-center bg-card/50 backdrop-blur-sm">
              <CardContent className="pt-8">
                <div className="w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center mx-auto mb-4">
                  <Award className="w-8 h-8 text-primary" />
                </div>
                <h3 className="text-xl font-semibold mb-2">Top Rankings</h3>
                <p className="text-muted-foreground">Universities ranked in top 200 globally with excellent academic reputation.</p>
              </CardContent>
            </Card>
            
            <Card className="text-center bg-card/50 backdrop-blur-sm">
              <CardContent className="pt-8">
                <div className="w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center mx-auto mb-4">
                  <Users className="w-8 h-8 text-primary" />
                </div>
                <h3 className="text-xl font-semibold mb-2">Student Support</h3>
                <p className="text-muted-foreground">Comprehensive support services for international students throughout their journey.</p>
              </CardContent>
            </Card>
            
            <Card className="text-center bg-card/50 backdrop-blur-sm">
              <CardContent className="pt-8">
                <div className="w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center mx-auto mb-4">
                  <TrendingUp className="w-8 h-8 text-primary" />
                </div>
                <h3 className="text-xl font-semibold mb-2">Career Outcomes</h3>
                <p className="text-muted-foreground">High employment rates and excellent career prospects for graduates.</p>
              </CardContent>
            </Card>
          </div>
        </section>

        {/* CTA Section */}
        <section className="mt-20 text-center">
          <Card className="bg-gradient-primary p-12">
            <div className="max-w-2xl mx-auto text-white">
              <h2 className="text-3xl font-bold mb-4">
                Ready to Find Your Perfect University?
              </h2>
              <p className="text-lg mb-8 opacity-90">
                Get personalized university recommendations based on your academic profile, budget, and career goals. Our AI will help you find the perfect match.
              </p>
              <div className="flex flex-col sm:flex-row gap-4 justify-center">
                <ChatButton />
                <Button variant="outline" size="lg" className="bg-white text-primary hover:bg-white/90">
                  📞 Call +91 9502127788
                </Button>
              </div>
            </div>
          </Card>
        </section>
        </div>
      </div>
    </>
  );
};

export default Universities;