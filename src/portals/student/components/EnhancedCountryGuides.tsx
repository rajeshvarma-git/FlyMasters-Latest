import React, { useEffect, useState, lazy, Suspense } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Card, CardContent, CardHeader, CardTitle } from '@student/components/ui/card';
import { Button } from '@student/components/ui/button';
import { Badge } from '@student/components/ui/badge';
import { Skeleton } from '@student/components/ui/skeleton';
import { MapPin, DollarSign, GraduationCap, Clock, Users, ArrowRight, Globe2 } from 'lucide-react';
import { supabase } from '@student/integrations/supabase/client';
import { cn } from '@student/lib/utils';

const EnhancedCountryGuides = () => {
  const [countries, setCountries] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchCountries();
  }, []);

  const fetchCountries = async () => {
    try {
      const { data: countriesData, error } = await supabase
        .from('countries')
        .select(`
          *,
          country_content (*),
          country_highlights (highlight_text, icon_name),
          country_courses (course_name, is_popular)
        `)
        .eq('is_active', true)
        .order('display_order');

      if (error) throw error;
      setCountries(countriesData || []);
    } catch (error) {
      console.error('Error fetching countries:', error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <section className="py-20 bg-gradient-to-br from-background via-background to-primary/5">
        <div className="container mx-auto px-6">
          <div className="text-center mb-12">
            <Skeleton className="h-12 w-96 mx-auto mb-4" />
            <Skeleton className="h-6 w-[600px] mx-auto" />
          </div>
          <div className="grid lg:grid-cols-2 xl:grid-cols-3 gap-8">
            {[1, 2, 3, 4, 5, 6].map((i) => (
              <Skeleton key={i} className="h-[600px] rounded-xl" />
            ))}
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="py-20 bg-gradient-to-br from-background via-background to-primary/5 relative overflow-hidden">
      {/* Animated background elements */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <motion.div
          className="absolute top-20 left-10 w-72 h-72 bg-primary/5 rounded-full blur-3xl"
          animate={{
            x: [0, 100, 0],
            y: [0, 50, 0],
            scale: [1, 1.2, 1],
          }}
          transition={{
            duration: 20,
            repeat: Infinity,
            ease: "easeInOut"
          }}
        />
        <motion.div
          className="absolute bottom-20 right-10 w-96 h-96 bg-accent/5 rounded-full blur-3xl"
          animate={{
            x: [0, -100, 0],
            y: [0, -50, 0],
            scale: [1, 1.1, 1],
          }}
          transition={{
            duration: 25,
            repeat: Infinity,
            ease: "easeInOut"
          }}
        />
      </div>

      <div className="container mx-auto px-6 relative z-10">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
          className="text-center mb-12"
        >
          <h2 className="text-4xl md:text-5xl font-bold mb-4">
            Study Destination <span className="gradient-text">Guides</span>
          </h2>
          <p className="text-xl text-muted-foreground max-w-3xl mx-auto">
            Explore popular study destinations and find the perfect country that matches your academic goals, budget, and career aspirations.
          </p>
        </motion.div>

        <div className="grid lg:grid-cols-2 xl:grid-cols-3 gap-8">
          {countries.map((country, index) => {
            const content = country.country_content?.[0];
            const highlights = country.country_highlights?.slice(0, 4) || [];
            const popularCourses = country.country_courses?.filter((c: any) => c.is_popular)?.slice(0, 4) || [];

            return (
              <motion.div
                key={country.id}
                initial={{ opacity: 0, y: 50 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: "-100px" }}
                transition={{ duration: 0.5, delay: index * 0.1 }}
              >
                <motion.div
                  whileHover={{ y: -10, scale: 1.02 }}
                  transition={{ type: "spring", stiffness: 300, damping: 20 }}
                >
                  <Card className="h-full bg-card/80 backdrop-blur-sm border-primary/20 hover:border-primary/40 transition-all duration-300 group relative overflow-hidden">
                    {/* Hover gradient effect */}
                    <div className="absolute inset-0 bg-gradient-to-br from-primary/10 via-transparent to-accent/10 opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
                    
                    <CardHeader className="relative z-10">
                      <motion.div
                        whileHover={{ rotate: [0, -10, 10, -10, 0] }}
                        transition={{ duration: 0.5 }}
                        className="flex items-center gap-3 mb-2"
                      >
                        <span className="text-4xl">{country.flag_emoji}</span>
                        <CardTitle className="text-xl group-hover:text-primary transition-colors">
                          {country.name}
                        </CardTitle>
                      </motion.div>
                      <p className="text-sm text-muted-foreground leading-relaxed">
                        {content?.description || 'Discover amazing opportunities in this destination.'}
                      </p>
                    </CardHeader>
                    
                    <CardContent className="space-y-6 relative z-10">
                      {/* Quick Stats with 3D effect */}
                      <div className="grid grid-cols-2 gap-4">
                        {[
                          { icon: GraduationCap, label: 'Universities', value: content?.total_universities },
                          { icon: DollarSign, label: 'Annual Fees', value: content?.average_fees },
                          { icon: Clock, label: 'Duration', value: content?.study_duration },
                          { icon: Users, label: 'Work Permit', value: content?.work_permit_duration }
                        ].map((stat, idx) => (
                          <motion.div
                            key={idx}
                            whileHover={{ scale: 1.05, rotateY: 5 }}
                            className="text-center p-3 bg-primary/5 rounded-lg"
                          >
                            <stat.icon className="w-5 h-5 text-primary mx-auto mb-1" />
                            <div className="text-sm font-medium">{stat.value || 'N/A'}</div>
                            <div className="text-xs text-muted-foreground">{stat.label}</div>
                          </motion.div>
                        ))}
                      </div>

                      {/* Popular Courses */}
                      {popularCourses.length > 0 && (
                        <div>
                          <h4 className="font-semibold mb-3">Popular Courses</h4>
                          <div className="flex flex-wrap gap-2">
                            {popularCourses.map((course: any, idx: number) => (
                              <motion.div
                                key={idx}
                                whileHover={{ scale: 1.1, y: -2 }}
                                transition={{ type: "spring", stiffness: 400 }}
                              >
                                <Badge variant="outline" className="text-xs">
                                  {course.course_name}
                                </Badge>
                              </motion.div>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Highlights */}
                      {highlights.length > 0 && (
                        <div>
                          <h4 className="font-semibold mb-3">Key Highlights</h4>
                          <div className="grid grid-cols-2 gap-2">
                            {highlights.map((highlight: any, idx: number) => (
                              <motion.div
                                key={idx}
                                initial={{ opacity: 0, x: -10 }}
                                whileInView={{ opacity: 1, x: 0 }}
                                transition={{ delay: idx * 0.1 }}
                                className="flex items-center gap-2 text-sm"
                              >
                                <div className="w-1.5 h-1.5 bg-primary rounded-full"></div>
                                <span className="text-muted-foreground">{highlight.highlight_text}</span>
                              </motion.div>
                            ))}
                          </div>
                        </div>
                      )}

                      <Link to={`/destinations/${country.slug}`}>
                        <Button variant="outline" className="w-full group-hover:bg-primary group-hover:text-primary-foreground transition-colors">
                          Explore {country.name}
                          <motion.div
                            whileHover={{ x: 5 }}
                            transition={{ type: "spring", stiffness: 400 }}
                          >
                            <ArrowRight className="w-4 h-4 ml-2" />
                          </motion.div>
                        </Button>
                      </Link>
                    </CardContent>
                  </Card>
                </motion.div>
              </motion.div>
            );
          })}
        </div>

        {/* CTA Section with 3D effect */}
        <motion.div
          initial={{ opacity: 0, y: 50 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6, delay: 0.3 }}
          className="mt-16 text-center"
        >
          <motion.div
            whileHover={{ scale: 1.02, rotateX: 2 }}
            transition={{ type: "spring", stiffness: 300 }}
          >
            <Card className="bg-gradient-primary p-8 relative overflow-hidden">
              <motion.div
                className="absolute inset-0 bg-gradient-to-r from-transparent via-white/10 to-transparent"
                animate={{
                  x: ['-100%', '100%'],
                }}
                transition={{
                  duration: 3,
                  repeat: Infinity,
                  ease: "linear"
                }}
              />
              <div className="max-w-2xl mx-auto text-white relative z-10">
                <Globe2 className="w-16 h-16 mx-auto mb-4 opacity-90" />
                <h3 className="text-2xl font-bold mb-4">
                  Need Help Choosing the Right Country?
                </h3>
                <p className="text-lg mb-6 opacity-90">
                  Our AI-powered matching system considers your academic background, budget, career goals, and preferences to recommend the perfect study destination.
                </p>
                <Link to="/chat">
                  <Button variant="secondary" size="lg" className="bg-white text-primary hover:bg-white/90">
                    Get Personalized Recommendations
                    <ArrowRight className="w-5 h-5 ml-2" />
                  </Button>
                </Link>
              </div>
            </Card>
          </motion.div>
        </motion.div>
      </div>
    </section>
  );
};

export default EnhancedCountryGuides;
