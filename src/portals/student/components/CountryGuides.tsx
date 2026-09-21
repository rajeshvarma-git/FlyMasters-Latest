import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@student/components/ui/card';
import { Button } from '@student/components/ui/button';
import { Badge } from '@student/components/ui/badge';
import { MapPin, DollarSign, GraduationCap, Clock, Users, ArrowRight } from 'lucide-react';

const CountryGuides = () => {
  const countries = [
    {
      name: 'United States',
      flag: '🇺🇸',
      description: 'Home to world\'s top universities like MIT, Harvard, and Stanford. Excellent research opportunities and post-study work options.',
      universities: '4,000+',
      averageFees: '$25,000-$55,000',
      studyDuration: '1-2 years',
      workPermit: '3 years STEM OPT',
      popularCourses: ['Computer Science', 'Business Administration', 'Engineering', 'Data Science'],
      highlights: ['Top global rankings', 'Research opportunities', 'Diverse culture', 'Innovation hub']
    },
    {
      name: 'Canada',
      flag: '🇨🇦',
      description: 'Affordable education with excellent quality. Pathway to permanent residency and welcoming immigration policies.',
      universities: '100+',
      averageFees: '$15,000-$35,000',
      studyDuration: '1-2 years',
      workPermit: '3 years PGWP',
      popularCourses: ['Engineering', 'Healthcare', 'Business', 'Information Technology'],
      highlights: ['Affordable fees', 'PR pathway', 'Safe environment', 'Multicultural society']
    },
    {
      name: 'United Kingdom',
      flag: '🇬🇧',
      description: 'Historic universities with global recognition. Shorter course duration and rich academic heritage.',
      universities: '130+',
      averageFees: '£15,000-£40,000',
      studyDuration: '1 year',
      workPermit: '2 years PSW',
      popularCourses: ['Finance', 'Law', 'Medicine', 'Engineering'],
      highlights: ['Shorter duration', 'Historic universities', 'Global recognition', 'Research excellence']
    },
    {
      name: 'Australia',
      flag: '🇦🇺',
      description: 'High quality education with beautiful landscapes. Strong focus on practical learning and research.',
      universities: '40+',
      averageFees: 'AU$20,000-$45,000',
      studyDuration: '1.5-2 years',
      workPermit: '2-4 years',
      popularCourses: ['Mining Engineering', 'Business', 'Healthcare', 'Environmental Science'],
      highlights: ['Quality education', 'Beautiful lifestyle', 'Research focus', 'Work opportunities']
    },
    {
      name: 'Germany',
      flag: '🇩🇪',
      description: 'Tuition-free or low-cost education at world-class universities. Strong engineering and technology programs.',
      universities: '400+',
      averageFees: '€0-€3,000',
      studyDuration: '2 years',
      workPermit: '18 months',
      popularCourses: ['Engineering', 'Automotive', 'Technology', 'Business'],
      highlights: ['Low/No tuition', 'Industry connections', 'Technology hub', 'Strong economy']
    },
    {
      name: 'Netherlands',
      flag: '🇳🇱',
      description: 'English-taught programs with innovative teaching methods. Gateway to Europe with excellent job prospects.',
      universities: '14+',
      averageFees: '€8,000-€20,000',
      studyDuration: '1-2 years',
      workPermit: '1 year',
      popularCourses: ['Business', 'Technology', 'Agriculture', 'Design'],
      highlights: ['English taught', 'Innovation focus', 'European gateway', 'High living standards']
    }
  ];

  return (
    <section className="py-20 bg-gradient-to-br from-background via-background to-primary/5">
      <div className="container mx-auto px-6">
        <div className="text-center mb-12">
          <h2 className="text-4xl font-bold mb-4">
            Study Destination <span className="gradient-text">Guides</span>
          </h2>
          <p className="text-xl text-muted-foreground max-w-3xl mx-auto">
            Explore popular study destinations and find the perfect country that matches your academic goals, budget, and career aspirations.
          </p>
        </div>

        <div className="grid lg:grid-cols-2 xl:grid-cols-3 gap-8">
          {countries.map((country, index) => (
            <Card key={index} className="bg-card/80 backdrop-blur-sm border-primary/20 hover:border-primary/40 transition-all duration-300 group">
              <CardHeader>
                <div className="flex items-center gap-3 mb-2">
                  <span className="text-3xl">{country.flag}</span>
                  <CardTitle className="text-xl group-hover:text-primary transition-colors">
                    {country.name}
                  </CardTitle>
                </div>
                <p className="text-sm text-muted-foreground leading-relaxed">
                  {country.description}
                </p>
              </CardHeader>
              
              <CardContent className="space-y-6">
                {/* Quick Stats */}
                <div className="grid grid-cols-2 gap-4">
                  <div className="text-center p-3 bg-primary/5 rounded-lg">
                    <GraduationCap className="w-5 h-5 text-primary mx-auto mb-1" />
                    <div className="text-sm font-medium">{country.universities}</div>
                    <div className="text-xs text-muted-foreground">Universities</div>
                  </div>
                  <div className="text-center p-3 bg-primary/5 rounded-lg">
                    <DollarSign className="w-5 h-5 text-primary mx-auto mb-1" />
                    <div className="text-sm font-medium">{country.averageFees}</div>
                    <div className="text-xs text-muted-foreground">Annual Fees</div>
                  </div>
                  <div className="text-center p-3 bg-primary/5 rounded-lg">
                    <Clock className="w-5 h-5 text-primary mx-auto mb-1" />
                    <div className="text-sm font-medium">{country.studyDuration}</div>
                    <div className="text-xs text-muted-foreground">Duration</div>
                  </div>
                  <div className="text-center p-3 bg-primary/5 rounded-lg">
                    <Users className="w-5 h-5 text-primary mx-auto mb-1" />
                    <div className="text-sm font-medium">{country.workPermit}</div>
                    <div className="text-xs text-muted-foreground">Work Permit</div>
                  </div>
                </div>

                {/* Popular Courses */}
                <div>
                  <h4 className="font-semibold mb-3">Popular Courses</h4>
                  <div className="flex flex-wrap gap-2">
                    {country.popularCourses.map((course, idx) => (
                      <Badge key={idx} variant="outline" className="text-xs">
                        {course}
                      </Badge>
                    ))}
                  </div>
                </div>

                {/* Highlights */}
                <div>
                  <h4 className="font-semibold mb-3">Key Highlights</h4>
                  <div className="grid grid-cols-2 gap-2">
                    {country.highlights.map((highlight, idx) => (
                      <div key={idx} className="flex items-center gap-2 text-sm">
                        <div className="w-1.5 h-1.5 bg-primary rounded-full"></div>
                        <span className="text-muted-foreground">{highlight}</span>
                      </div>
                    ))}
                  </div>
                </div>

                <Button variant="outline" className="w-full group-hover:bg-primary group-hover:text-primary-foreground transition-colors">
                  Explore {country.name}
                  <ArrowRight className="w-4 h-4 ml-2 group-hover:translate-x-1 transition-transform" />
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* CTA Section */}
        <div className="mt-16 text-center">
          <Card className="bg-gradient-primary p-8">
            <div className="max-w-2xl mx-auto text-white">
              <h3 className="text-2xl font-bold mb-4">
                Need Help Choosing the Right Country?
              </h3>
              <p className="text-lg mb-6 opacity-90">
                Our AI-powered matching system considers your academic background, budget, career goals, and preferences to recommend the perfect study destination.
              </p>
              <Button variant="secondary" size="lg" className="bg-white text-primary hover:bg-white/90">
                Get Personalized Recommendations
                <ArrowRight className="w-5 h-5 ml-2" />
              </Button>
            </div>
          </Card>
        </div>
      </div>
    </section>
  );
};

export default CountryGuides;