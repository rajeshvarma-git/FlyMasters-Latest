import React, { useState, useEffect } from 'react';
import { supabase } from '@student/integrations/supabase/client';
import { Card, CardContent } from '@student/components/ui/card';
import { Badge } from '@student/components/ui/badge';
import { Award, Globe, Linkedin, Briefcase } from 'lucide-react';

interface Founder {
  id: string;
  name: string;
  title: string;
  bio: string;
  image_url: string | null;
  experience_years: number;
  countries_worked: string[];
  specializations: string[];
  linkedin_url: string | null;
  display_order: number;
}

const FoundersSection = () => {
  const [founders, setFounders] = useState<Founder[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchFounders();
  }, []);

  const fetchFounders = async () => {
    try {
      const { data, error } = await supabase
        .from('founders')
        .select('*')
        .eq('is_active', true)
        .order('display_order');

      if (error) throw error;
      setFounders(data || []);
    } catch (error) {
      console.error('Error fetching founders:', error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <section className="py-20 px-4">
        <div className="container mx-auto text-center">
          <div className="animate-pulse">Loading...</div>
        </div>
      </section>
    );
  }

  if (founders.length === 0) return null;

  return (
    <section className="py-20 px-4 relative overflow-hidden">
      {/* Background */}
      <div className="absolute inset-0 bg-gradient-to-b from-background via-primary/5 to-background" />
      
      <div className="container mx-auto relative z-10 max-w-6xl">
        <div className="text-center mb-16">
          <div className="inline-flex items-center gap-2 px-6 py-3 rounded-full bg-primary/10 mb-6">
            <Award className="w-5 h-5 text-primary" />
            <span className="text-sm font-semibold text-primary">Meet Our Leaders</span>
          </div>
          <h2 className="text-4xl md:text-5xl font-bold mb-4">
            The <span className="gradient-text">Founders</span>
          </h2>
          <p className="text-muted-foreground text-lg max-w-2xl mx-auto">
            Experienced professionals who studied and worked abroad, now helping you achieve the same
          </p>
        </div>

        <div className="grid md:grid-cols-2 gap-8 lg:gap-12">
          {founders.map((founder, index) => (
            <Card 
              key={founder.id} 
              className="glass-card overflow-hidden animate-fade-in hover:shadow-2xl transition-all duration-300"
              style={{ animationDelay: `${index * 0.2}s` }}
            >
              <CardContent className="p-0">
                <div className="flex flex-col">
                  {/* Image Section */}
                  <div className="relative h-80 overflow-hidden">
                    <img
                      src={founder.image_url || '/placeholder.svg'}
                      alt={founder.name}
                      className="w-full h-full object-cover"
                      onError={(e) => {
                        e.currentTarget.src = '/placeholder.svg';
                      }}
                    />
                    {/* Gradient overlay */}
                    <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent" />
                    
                    {/* Name overlay */}
                    <div className="absolute bottom-0 left-0 right-0 p-6 text-white">
                      <h3 className="text-2xl font-bold mb-1">{founder.name}</h3>
                      <p className="text-white/90 text-sm font-medium">{founder.title}</p>
                    </div>
                  </div>

                  {/* Content Section */}
                  <div className="p-6 space-y-4">
                    {/* Experience Badge */}
                    <div className="flex items-center gap-2">
                      <Briefcase className="w-5 h-5 text-primary" />
                      <span className="text-sm font-semibold">
                        {founder.experience_years}+ Years of Experience
                      </span>
                    </div>

                    {/* Bio */}
                    <p className="text-muted-foreground leading-relaxed">
                      {founder.bio}
                    </p>

                    {/* Countries Worked */}
                    {founder.countries_worked && founder.countries_worked.length > 0 && (
                      <div>
                        <div className="flex items-center gap-2 mb-2">
                          <Globe className="w-4 h-4 text-primary" />
                          <span className="text-sm font-medium">Countries Worked</span>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          {founder.countries_worked.map((country, idx) => (
                            <Badge key={idx} variant="secondary">
                              {country}
                            </Badge>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Specializations */}
                    {founder.specializations && founder.specializations.length > 0 && (
                      <div>
                        <div className="flex items-center gap-2 mb-2">
                          <Award className="w-4 h-4 text-primary" />
                          <span className="text-sm font-medium">Specializations</span>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          {founder.specializations.map((spec, idx) => (
                            <Badge key={idx} variant="outline" className="border-primary/50">
                              {spec}
                            </Badge>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* LinkedIn */}
                    {founder.linkedin_url && (
                      <a
                        href={founder.linkedin_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-2 text-primary hover:text-primary-dark transition-colors group"
                      >
                        <Linkedin className="w-5 h-5 group-hover:scale-110 transition-transform" />
                        <span className="text-sm font-medium">Connect on LinkedIn</span>
                      </a>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Bottom CTA */}
        <div className="text-center mt-16">
          <p className="text-muted-foreground mb-6">
            Get personalized guidance from experts who've been where you want to go
          </p>
          <a href="/chat" className="inline-block">
            <button className="btn-primary">
              Talk to Our Experts
            </button>
          </a>
        </div>
      </div>
    </section>
  );
};

export default FoundersSection;