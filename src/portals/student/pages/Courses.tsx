import React, { useState, useEffect } from 'react';
import { Search, Filter, MapPin, DollarSign, Clock, Award, GraduationCap, BookOpen, Globe, Users, CheckCircle, Star, ArrowRight } from 'lucide-react';
import { Button } from '@student/components/ui/button';
import { Input } from '@student/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@student/components/ui/select';
import { Card, CardContent, CardHeader, CardTitle } from '@student/components/ui/card';
import { Badge } from '@student/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@student/components/ui/dialog';
import { supabase } from '@student/integrations/supabase/client';
import { toast } from 'sonner';
import ChatButton from '@student/components/ChatButton';

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
  university_id: string;
  university?: {
    id: string;
    name: string;
    country: string;
    city: string;
    ranking: number;
    university_type: string;
  };
}

const Courses: React.FC = () => {
  const [courses, setCourses] = useState<Course[]>([]);
  const [filteredCourses, setFilteredCourses] = useState<Course[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCountry, setSelectedCountry] = useState<string>('all');
  const [selectedDegree, setSelectedDegree] = useState<string>('all');
  const [selectedField, setSelectedField] = useState<string>('all');
  const [maxBudget, setMaxBudget] = useState<string>('');
  const [selectedCourse, setSelectedCourse] = useState<Course | null>(null);

  // Get unique values for filters
  const countries = [...new Set(courses.map(course => course.university?.country).filter(Boolean))];
  const degreeTypes = [...new Set(courses.map(course => course.degree_type))];
  const fieldOfStudy = [...new Set(courses.map(course => course.field_of_study))];

  useEffect(() => {
    fetchCourses();
  }, []);

  useEffect(() => {
    applyFilters();
  }, [courses, searchTerm, selectedCountry, selectedDegree, selectedField, maxBudget]);

  const fetchCourses = async () => {
    try {
      setLoading(true);
      
      const { data: coursesData, error: coursesError } = await supabase
        .from('courses')
        .select(`
          *,
          university:universities (
            id,
            name,
            country,
            city,
            ranking,
            university_type
          )
        `)
        .eq('is_active', true);

      if (coursesError) throw coursesError;

      setCourses(coursesData || []);
    } catch (error) {
      console.error('Error fetching courses:', error);
      toast.error('Failed to load courses');
    } finally {
      setLoading(false);
    }
  };

  const applyFilters = () => {
    let filtered = courses;

    if (searchTerm) {
      filtered = filtered.filter(course => 
        course.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        course.field_of_study?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        course.university?.name.toLowerCase().includes(searchTerm.toLowerCase())
      );
    }

    if (selectedCountry !== 'all') {
      filtered = filtered.filter(course => course.university?.country === selectedCountry);
    }

    if (selectedDegree !== 'all') {
      filtered = filtered.filter(course => course.degree_type === selectedDegree);
    }

    if (selectedField !== 'all') {
      filtered = filtered.filter(course => course.field_of_study === selectedField);
    }

    if (maxBudget) {
      const budget = parseFloat(maxBudget);
      filtered = filtered.filter(course => course.tuition_fee_usd <= budget);
    }

    setFilteredCourses(filtered);
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
          <div className="text-center">Loading courses...</div>
        </div>
      </div>
    );
  }

  return (
    <>
      {/* SEO Head */}
      <title>Study Abroad Courses - Find Your Perfect Program | Fly Masters</title>
      
      <div className="min-h-screen bg-gradient-to-br from-background via-background to-primary/5">
        {/* Hero Section */}
        <section className="relative py-20 overflow-hidden">
          <div className="absolute inset-0 bg-gradient-background -z-10" />
          
          <div className="container mx-auto px-6 text-center">
            <div className="max-w-4xl mx-auto">
              <div className="inline-flex items-center gap-2 bg-white/20 backdrop-blur-md rounded-full px-4 py-2 border border-white/30 mb-6">
                <BookOpen className="w-4 h-4 text-primary" />
                <span className="text-sm font-medium">500+ Programs Available</span>
              </div>
              
              <h1 className="text-5xl lg:text-6xl font-bold leading-tight mb-6">
                Find Your Perfect
                <span className="gradient-text block">Study Program</span>
              </h1>
              
              <p className="text-xl text-muted-foreground leading-relaxed mb-8 max-w-3xl mx-auto">
                Explore thousands of courses from top universities worldwide. From computer science to business, engineering to arts - find the program that matches your career goals and budget.
              </p>
              
              <div className="flex flex-col sm:flex-row gap-4 justify-center mb-12">
                <ChatButton />
                
                <Button variant="glass" size="xl" className="group">
                  Browse All Programs
                  <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
                </Button>
              </div>

              {/* Quick Stats */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
                <div className="text-center">
                  <div className="text-3xl font-bold gradient-text">{courses.length}+</div>
                  <div className="text-sm text-muted-foreground">Available Courses</div>
                </div>
                <div className="text-center">
                  <div className="text-3xl font-bold gradient-text">{countries.length}+</div>
                  <div className="text-sm text-muted-foreground">Countries</div>
                </div>
                <div className="text-center">
                  <div className="text-3xl font-bold gradient-text">95%</div>
                  <div className="text-sm text-muted-foreground">Acceptance Rate</div>
                </div>
                <div className="text-center">
                  <div className="text-3xl font-bold gradient-text">$2.5M+</div>
                  <div className="text-sm text-muted-foreground">Scholarships Available</div>
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
                Search & Filter Courses
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground w-4 h-4" />
                <Input
                  placeholder="Search courses, universities, or fields..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10"
                />
              </div>

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
              Showing {filteredCourses.length} of {courses.length} courses
            </p>
          </div>

          {/* Course Cards */}
          <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-6">
            {filteredCourses.map(course => (
              <Card key={course.id} className="bg-card/80 backdrop-blur-sm border-primary/20 hover:border-primary/40 transition-all duration-300 group">
                <CardHeader>
                  <div className="flex justify-between items-start">
                    <Badge variant="outline" className="mb-2">
                      {course.degree_type}
                    </Badge>
                    {course.scholarship_available && (
                      <Badge variant="secondary" className="bg-primary/20 text-primary">
                        Scholarship Available
                      </Badge>
                    )}
                  </div>
                  
                  <CardTitle className="text-lg group-hover:text-primary transition-colors">
                    {course.name}
                  </CardTitle>
                  
                  <div className="space-y-2 text-sm text-muted-foreground">
                    <div className="flex items-center gap-1">
                      <GraduationCap className="w-4 h-4" />
                      {course.university?.name}
                    </div>
                    <div className="flex items-center gap-1">
                      <MapPin className="w-4 h-4" />
                      {course.university?.city}, {course.university?.country}
                    </div>
                    {course.university?.ranking && (
                      <div className="flex items-center gap-1">
                        <Star className="w-4 h-4" />
                        World Rank #{course.university.ranking}
                      </div>
                    )}
                  </div>
                </CardHeader>
                
                <CardContent>
                  <div className="space-y-4">
                    <div className="grid grid-cols-2 gap-4 text-sm">
                      <div className="flex items-center gap-1">
                        <DollarSign className="w-4 h-4 text-primary" />
                        <span className="font-medium">${course.tuition_fee_usd?.toLocaleString()}/year</span>
                      </div>
                      <div className="flex items-center gap-1">
                        <Clock className="w-4 h-4 text-primary" />
                        <span>{Math.floor(course.duration_months / 12)} years</span>
                      </div>
                    </div>
                    
                    <div className="flex flex-wrap gap-2">
                      <Badge variant="outline" className="text-xs">
                        IELTS: {course.ielts_requirement}
                      </Badge>
                      {course.gre_requirement && (
                        <Badge variant="outline" className="text-xs">GRE Required</Badge>
                      )}
                      {course.visa_sponsorship && (
                        <Badge variant="secondary" className="text-xs">Visa Support</Badge>
                      )}
                    </div>
                    
                    <Dialog>
                      <DialogTrigger asChild>
                        <Button 
                          variant="outline" 
                          className="w-full group-hover:bg-primary group-hover:text-primary-foreground transition-colors"
                          onClick={() => setSelectedCourse(course)}
                        >
                          View Details
                          <ArrowRight className="w-4 h-4 ml-2" />
                        </Button>
                      </DialogTrigger>
                      <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
                        <DialogHeader>
                          <DialogTitle className="text-2xl">{course.name}</DialogTitle>
                        </DialogHeader>
                        
                        {selectedCourse && (
                          <div className="space-y-6">
                            {/* University Info */}
                            <div className="bg-primary/5 rounded-lg p-4">
                              <h3 className="font-semibold mb-2 flex items-center gap-2">
                                <GraduationCap className="w-5 h-5" />
                                {selectedCourse.university?.name}
                              </h3>
                              <div className="grid grid-cols-2 gap-4 text-sm text-muted-foreground">
                                <div>📍 {selectedCourse.university?.city}, {selectedCourse.university?.country}</div>
                                {selectedCourse.university?.ranking && (
                                  <div>🏆 World Rank #{selectedCourse.university.ranking}</div>
                                )}
                              </div>
                            </div>

                            {/* Course Details */}
                            <div className="grid grid-cols-2 gap-6">
                              <div>
                                <h4 className="font-semibold mb-2">Program Details</h4>
                                <div className="space-y-2 text-sm">
                                  <div>Degree: {selectedCourse.degree_type}</div>
                                  <div>Field: {selectedCourse.field_of_study}</div>
                                  <div>Duration: {Math.floor(selectedCourse.duration_months / 12)} years</div>
                                  <div>Tuition: ${selectedCourse.tuition_fee_usd?.toLocaleString()}/year</div>
                                </div>
                              </div>
                              
                              <div>
                                <h4 className="font-semibold mb-2">Requirements</h4>
                                <div className="space-y-2 text-sm">
                                  <div>IELTS: {selectedCourse.ielts_requirement}</div>
                                  <div>TOEFL: {selectedCourse.toefl_requirement}</div>
                                  <div>GRE: {selectedCourse.gre_requirement ? 'Required' : 'Not Required'}</div>
                                </div>
                              </div>
                            </div>

                            {/* Benefits */}
                            <div>
                              <h4 className="font-semibold mb-2">Additional Benefits</h4>
                              <div className="grid grid-cols-2 gap-2">
                                {selectedCourse.scholarship_available && (
                                  <div className="flex items-center gap-2 text-sm">
                                    <CheckCircle className="w-4 h-4 text-green-500" />
                                    Scholarship Available
                                  </div>
                                )}
                                {selectedCourse.visa_sponsorship && (
                                  <div className="flex items-center gap-2 text-sm">
                                    <CheckCircle className="w-4 h-4 text-green-500" />
                                    Visa Sponsorship
                                  </div>
                                )}
                              </div>
                            </div>

                            {/* CTA Buttons */}
                            <div className="flex gap-4">
                              <ChatButton />
                              <Button variant="outline" className="flex-1">
                                Download Brochure
                              </Button>
                            </div>
                          </div>
                        )}
                      </DialogContent>
                    </Dialog>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>

          {filteredCourses.length === 0 && (
            <div className="text-center py-12">
              <p className="text-muted-foreground mb-4">No courses found matching your criteria.</p>
              <Button variant="outline" onClick={resetFilters}>
                Clear Filters
              </Button>
            </div>
          )}

          {/* CTA Section */}
          <section className="mt-20 text-center">
            <Card className="bg-gradient-primary p-12">
              <div className="max-w-2xl mx-auto text-white">
                <h2 className="text-3xl font-bold mb-4">
                  Ready to Start Your Journey?
                </h2>
                <p className="text-lg mb-8 opacity-90">
                  Get personalized course recommendations based on your profile and career goals. Our AI will help you find the perfect match.
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

export default Courses;