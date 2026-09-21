import React, { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Helmet } from 'react-helmet-async';
import { Card, CardContent, CardHeader, CardTitle } from '@student/components/ui/card';
import { Button } from '@student/components/ui/button';
import { Badge } from '@student/components/ui/badge';
import { Skeleton } from '@student/components/ui/skeleton';
import { Separator } from '@student/components/ui/separator';
import {
  MapPin, DollarSign, GraduationCap, Clock, Users, ArrowRight,
  Globe, Phone, Mail, Building, Briefcase, Star, Video,
  CheckCircle, TrendingUp, Award, Home
} from 'lucide-react';
import { supabase } from '@student/integrations/supabase/client';
import Header from '@student/components/Header';
import ContactSection from '@student/components/ContactSection';

export default function CountryDetail() {
  const { slug } = useParams();
  const [country, setCountry] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (slug) {
      fetchCountryDetail();
    }
  }, [slug]);

  const fetchCountryDetail = async () => {
    try {
      const { data, error } = await supabase
        .from('countries')
        .select(`
          *,
          country_content (*),
          country_highlights (*),
          country_courses (*),
          country_industries (*),
          country_testimonials (*)
        `)
        .eq('slug', slug)
        .eq('is_active', true)
        .single();

      if (error) throw error;
      setCountry(data);
    } catch (error) {
      console.error('Error fetching country:', error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <>
        <Header />
        <div className="min-h-screen pt-20 pb-12">
          <div className="container mx-auto px-6">
            <Skeleton className="h-96 w-full rounded-xl mb-8" />
            <div className="grid md:grid-cols-2 gap-8">
              {[1, 2, 3, 4].map((i) => (
                <Skeleton key={i} className="h-64 rounded-xl" />
              ))}
            </div>
          </div>
        </div>
      </>
    );
  }

  if (!country) {
    return (
      <>
        <Header />
        <div className="min-h-screen pt-20 pb-12 flex items-center justify-center">
          <Card className="max-w-md">
            <CardContent className="p-8 text-center">
              <MapPin className="w-16 h-16 text-muted-foreground mx-auto mb-4" />
              <h2 className="text-2xl font-bold mb-2">Country Not Found</h2>
              <p className="text-muted-foreground mb-4">
                The country you're looking for doesn't exist.
              </p>
              <Link to="/">
                <Button>
                  <Home className="w-4 h-4 mr-2" />
                  Back to Home
                </Button>
              </Link>
            </CardContent>
          </Card>
        </div>
      </>
    );
  }

  const content = country.country_content?.[0];
  const highlights = country.country_highlights || [];
  const courses = country.country_courses || [];
  const industries = country.country_industries || [];
  const testimonials = country.country_testimonials || [];

  return (
    <>
      <Helmet>
        <title>{country.name} - Study Abroad Guide | Fly Masters</title>
        <meta name="description" content={content?.description || `Complete guide to studying in ${country.name}`} />
      </Helmet>

      <Header />

      <div className="min-h-screen pt-20 pb-12 bg-gradient-to-br from-background via-background to-primary/5">
        {/* Hero Section */}
        <motion.section
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="relative py-20 overflow-hidden"
        >
          <div className="absolute inset-0 bg-gradient-to-br from-primary/20 via-accent/10 to-transparent" />
          {content?.hero_image_url && (
            <img
              src={content.hero_image_url}
              alt={country.name}
              className="absolute inset-0 w-full h-full object-cover opacity-10"
              loading="lazy"
            />
          )}
          
          <div className="container mx-auto px-6 relative z-10">
            <motion.div
              initial={{ y: 50, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ duration: 0.6 }}
              className="text-center"
            >
              <motion.div
                whileHover={{ scale: 1.1, rotate: [0, -5, 5, 0] }}
                className="inline-block mb-6"
              >
                <span className="text-8xl">{country.flag_emoji}</span>
              </motion.div>
              <h1 className="text-5xl md:text-6xl font-bold mb-6">
                Study in <span className="gradient-text">{country.name}</span>
              </h1>
              <p className="text-xl text-muted-foreground max-w-3xl mx-auto mb-8">
                {content?.description}
              </p>
              <div className="flex flex-wrap gap-4 justify-center">
                <Link to="/chat">
                  <Button size="lg" className="gap-2">
                    <Star className="w-5 h-5" />
                    Get Personalized Guidance
                  </Button>
                </Link>
                <a href="tel:9259597979">
                  <Button size="lg" variant="outline" className="gap-2">
                    <Phone className="w-5 h-5" />
                    Call: 9259597979
                  </Button>
                </a>
              </div>
            </motion.div>
          </div>
        </motion.section>

        <div className="container mx-auto px-6">
          {/* Quick Stats Grid */}
          <motion.section
            initial={{ y: 50, opacity: 0 }}
            whileInView={{ y: 0, opacity: 1 }}
            viewport={{ once: true }}
            className="mb-16 -mt-12 relative z-20"
          >
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {[
                { icon: GraduationCap, label: 'Universities', value: content?.total_universities, color: 'text-blue-500' },
                { icon: DollarSign, label: 'Annual Fees', value: content?.average_fees, color: 'text-green-500' },
                { icon: Clock, label: 'Study Duration', value: content?.study_duration, color: 'text-purple-500' },
                { icon: Users, label: 'Work Permit', value: content?.work_permit_duration, color: 'text-orange-500' }
              ].map((stat, idx) => (
                <motion.div
                  key={idx}
                  whileHover={{ y: -10, scale: 1.05 }}
                  transition={{ type: "spring", stiffness: 300 }}
                >
                  <Card className="glass-card text-center">
                    <CardContent className="p-6">
                      <stat.icon className={`w-8 h-8 mx-auto mb-3 ${stat.color}`} />
                      <div className="text-2xl font-bold mb-1">{stat.value || 'N/A'}</div>
                      <div className="text-sm text-muted-foreground">{stat.label}</div>
                    </CardContent>
                  </Card>
                </motion.div>
              ))}
            </div>
          </motion.section>

          {/* Main Video */}
          {content?.video_url && (
            <motion.section
              initial={{ opacity: 0, y: 30 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              className="mb-16"
            >
              <Card className="overflow-hidden">
                <CardContent className="p-0">
                  <div className="relative aspect-video">
                    <iframe
                      src={content.video_url}
                      className="w-full h-full"
                      allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                      allowFullScreen
                      loading="lazy"
                    />
                  </div>
                </CardContent>
              </Card>
            </motion.section>
          )}

          {/* Why Study Here */}
          {content?.why_study_here && (
            <motion.section
              initial={{ opacity: 0, y: 30 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              className="mb-16"
            >
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-2xl">
                    <Star className="w-6 h-6 text-primary" />
                    Why Study in {country.name}?
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-lg leading-relaxed">{content.why_study_here}</p>
                </CardContent>
              </Card>
            </motion.section>
          )}

          {/* Key Highlights */}
          {highlights.length > 0 && (
            <motion.section
              initial={{ opacity: 0, y: 30 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              className="mb-16"
            >
              <h2 className="text-3xl font-bold mb-6">Key Highlights</h2>
              <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
                {highlights.map((highlight: any, idx: number) => (
                  <motion.div
                    key={highlight.id}
                    initial={{ opacity: 0, x: -20 }}
                    whileInView={{ opacity: 1, x: 0 }}
                    transition={{ delay: idx * 0.1 }}
                    whileHover={{ scale: 1.05, x: 10 }}
                  >
                    <Card className="h-full">
                      <CardContent className="p-4 flex items-center gap-3">
                        <CheckCircle className="w-5 h-5 text-primary flex-shrink-0" />
                        <span>{highlight.highlight_text}</span>
                      </CardContent>
                    </Card>
                  </motion.div>
                ))}
              </div>
            </motion.section>
          )}

          {/* Demographics & Facts */}
          <motion.section
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="mb-16"
          >
            <div className="grid md:grid-cols-2 gap-8">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Globe className="w-5 h-5 text-primary" />
                    Country Information
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  {content?.capital && (
                    <div>
                      <div className="font-semibold text-sm text-muted-foreground mb-1">Capital</div>
                      <div className="text-lg">{content.capital}</div>
                    </div>
                  )}
                  {content?.area && (
                    <div>
                      <div className="font-semibold text-sm text-muted-foreground mb-1">Area</div>
                      <div className="text-lg">{content.area}</div>
                    </div>
                  )}
                  {content?.languages && (
                    <div>
                      <div className="font-semibold text-sm text-muted-foreground mb-1">Languages</div>
                      <div className="flex flex-wrap gap-2">
                        {content.languages.map((lang: string, idx: number) => (
                          <Badge key={idx} variant="secondary">{lang}</Badge>
                        ))}
                      </div>
                    </div>
                  )}
                  {content?.english_speaking_percentage && (
                    <div>
                      <div className="font-semibold text-sm text-muted-foreground mb-1">English Speaking</div>
                      <div className="text-lg">{content.english_speaking_percentage}</div>
                    </div>
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <TrendingUp className="w-5 h-5 text-primary" />
                    Study Information
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  {content?.psw_period && (
                    <div>
                      <div className="font-semibold text-sm text-muted-foreground mb-1">Post-Study Work Period</div>
                      <div className="text-lg">{content.psw_period}</div>
                    </div>
                  )}
                  {content?.part_time_work_hours && (
                    <div>
                      <div className="font-semibold text-sm text-muted-foreground mb-1">Part-Time Work</div>
                      <div className="text-lg">{content.part_time_work_hours}</div>
                    </div>
                  )}
                  {content?.indian_student_population && (
                    <div>
                      <div className="font-semibold text-sm text-muted-foreground mb-1">Indian Students</div>
                      <div className="text-lg">{content.indian_student_population}</div>
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          </motion.section>

          {/* Popular Courses & Industries */}
          <motion.section
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="mb-16"
          >
            <div className="grid md:grid-cols-2 gap-8">
              {courses.length > 0 && (
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <GraduationCap className="w-5 h-5 text-primary" />
                      Popular Courses
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="flex flex-wrap gap-2">
                      {courses.map((course: any) => (
                        <Badge key={course.id} variant={course.is_popular ? "default" : "outline"}>
                          {course.course_name}
                        </Badge>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              )}

              {industries.length > 0 && (
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Briefcase className="w-5 h-5 text-primary" />
                      Popular Industries
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="flex flex-wrap gap-2">
                      {industries.map((industry: any) => (
                        <Badge key={industry.id} variant="secondary">
                          {industry.industry_name}
                        </Badge>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              )}
            </div>
          </motion.section>

          {/* Testimonials */}
          {testimonials.length > 0 && (
            <motion.section
              initial={{ opacity: 0, y: 30 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              className="mb-16"
            >
              <h2 className="text-3xl font-bold mb-6">Success Stories</h2>
              <div className="grid md:grid-cols-2 gap-6">
                {testimonials.map((testimonial: any, idx: number) => (
                  <motion.div
                    key={testimonial.id}
                    initial={{ opacity: 0, scale: 0.9 }}
                    whileInView={{ opacity: 1, scale: 1 }}
                    transition={{ delay: idx * 0.1 }}
                    whileHover={{ y: -5 }}
                  >
                    <Card className="h-full">
                      <CardContent className="p-6">
                        {testimonial.video_url ? (
                          <div className="mb-4 relative aspect-video rounded-lg overflow-hidden">
                            <iframe
                              src={testimonial.video_url}
                              className="w-full h-full"
                              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                              allowFullScreen
                              loading="lazy"
                            />
                          </div>
                        ) : testimonial.student_image_url && (
                          <img
                            src={testimonial.student_image_url}
                            alt={testimonial.student_name}
                            className="w-20 h-20 rounded-full mb-4 object-cover"
                            loading="lazy"
                          />
                        )}
                        <p className="italic mb-4">"{testimonial.testimonial_text}"</p>
                        <div>
                          <div className="font-semibold">{testimonial.student_name}</div>
                          {testimonial.course && (
                            <div className="text-sm text-muted-foreground">{testimonial.course}</div>
                          )}
                          {testimonial.university && (
                            <div className="text-sm text-muted-foreground">{testimonial.university}</div>
                          )}
                        </div>
                      </CardContent>
                    </Card>
                  </motion.div>
                ))}
              </div>
            </motion.section>
          )}

          {/* Fly Masters Processing Highlights */}
          {content?.processing_highlights && content.processing_highlights.length > 0 && (
            <motion.section
              initial={{ opacity: 0, y: 30 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              className="mb-16"
            >
              <Card className="bg-gradient-primary text-white">
                <CardHeader>
                  <CardTitle className="text-2xl flex items-center gap-2">
                    <Award className="w-6 h-6" />
                    How Fly Masters Helps You
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <ul className="space-y-3">
                    {content.processing_highlights.map((highlight: string, idx: number) => (
                      <motion.li
                        key={idx}
                        initial={{ opacity: 0, x: -20 }}
                        whileInView={{ opacity: 1, x: 0 }}
                        transition={{ delay: idx * 0.1 }}
                        className="flex items-start gap-3"
                      >
                        <CheckCircle className="w-5 h-5 flex-shrink-0 mt-0.5" />
                        <span>{highlight}</span>
                      </motion.li>
                    ))}
                  </ul>
                </CardContent>
              </Card>
            </motion.section>
          )}

          {/* Interesting Facts */}
          {content?.interesting_facts && content.interesting_facts.length > 0 && (
            <motion.section
              initial={{ opacity: 0, y: 30 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              className="mb-16"
            >
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Star className="w-5 h-5 text-primary" />
                    Interesting Facts
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <ul className="space-y-2">
                    {content.interesting_facts.map((fact: string, idx: number) => (
                      <li key={idx} className="flex items-start gap-2">
                        <span className="text-primary mt-1">•</span>
                        <span>{fact}</span>
                      </li>
                    ))}
                  </ul>
                </CardContent>
              </Card>
            </motion.section>
          )}

          {/* CTA Section */}
          <motion.section
            initial={{ opacity: 0, scale: 0.95 }}
            whileInView={{ opacity: 1, scale: 1 }}
            viewport={{ once: true }}
            className="mb-16"
          >
            <Card className="bg-gradient-primary text-white text-center p-8">
              <h3 className="text-3xl font-bold mb-4">
                Ready to Start Your Journey to {country.name}?
              </h3>
              <p className="text-lg mb-6 opacity-90 max-w-2xl mx-auto">
                Let Fly Masters guide you through every step of your study abroad journey. From university selection to visa processing, we're here to help!
              </p>
              <div className="flex flex-wrap gap-4 justify-center">
                <Link to="/chat">
                  <Button size="lg" variant="secondary" className="bg-white text-primary hover:bg-white/90">
                    Start AI Chat
                    <ArrowRight className="w-5 h-5 ml-2" />
                  </Button>
                </Link>
                <a href="tel:9259597979">
                  <Button size="lg" variant="outline" className="border-white text-white hover:bg-white/10">
                    <Phone className="w-5 h-5 mr-2" />
                    Call Now
                  </Button>
                </a>
                <a href="https://wa.me/919502127788" target="_blank" rel="noopener noreferrer">
                  <Button size="lg" variant="outline" className="border-white text-white hover:bg-white/10">
                    <Mail className="w-5 h-5 mr-2" />
                    WhatsApp Us
                  </Button>
                </a>
              </div>
            </Card>
          </motion.section>
        </div>

        <ContactSection />
      </div>
    </>
  );
}
