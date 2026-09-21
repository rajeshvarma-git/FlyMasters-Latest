import React, { useEffect, useState } from 'react';
import { Button } from "@student/components/ui/button";
import { ArrowRight, Zap, Play } from "lucide-react";
import heroImage from "@student/assets/hero-image.jpg";
import ChatButton from "@student/components/ChatButton";
import { supabase } from '@student/integrations/supabase/client';

interface WebsiteContent {
  section_key: string;
  title: string | null;
  subtitle: string | null;
  content: string | null;
  cta_text: string | null;
  cta_link: string | null;
}

const Hero = () => {
  const [heroContent, setHeroContent] = useState<WebsiteContent | null>(null);
  const [stats, setStats] = useState<WebsiteContent[]>([]);

  useEffect(() => {
    fetchHeroContent();
    fetchStats();
  }, []);

  const fetchHeroContent = async () => {
    const { data } = await supabase
      .from('website_content')
      .select('*')
      .eq('section_key', 'hero_main')
      .single();
    
    if (data) setHeroContent(data);
  };

  const fetchStats = async () => {
    const { data } = await supabase
      .from('website_content')
      .select('*')
      .in('section_key', ['hero_stats_1', 'hero_stats_2', 'hero_stats_3'])
      .order('display_order');
    
    if (data) setStats(data);
  };

  return (
    <section className="relative min-h-screen flex items-center justify-center overflow-hidden">
      {/* Enhanced Background with gradient */}
      <div className="absolute inset-0 bg-gradient-background -z-10" />
      <div className="absolute inset-0 bg-gradient-to-br from-primary/5 via-transparent to-accent-cyan/5 -z-10" />
      
      {/* Enhanced Floating elements */}
      <div className="absolute top-20 left-10 w-20 h-20 rounded-full bg-gradient-primary opacity-20 float-animation" />
      <div className="absolute bottom-32 right-16 w-16 h-16 rounded-full bg-accent-cyan opacity-30 float-animation" style={{animationDelay: '2s'}} />
      <div className="absolute top-1/3 right-10 w-12 h-12 rounded-full bg-gradient-primary opacity-25 float-animation" style={{animationDelay: '4s'}} />
      <div className="absolute top-1/2 left-1/4 w-8 h-8 rounded-full bg-primary/20 float-animation" style={{animationDelay: '3s'}} />
      <div className="absolute bottom-20 left-20 w-14 h-14 rounded-full bg-accent-cyan/20 float-animation" style={{animationDelay: '1s'}} />

      <div className="container mx-auto px-6 grid lg:grid-cols-2 gap-12 items-center relative z-10">
        {/* Enhanced Content */}
        <div className="space-y-8">
          <div className="space-y-6">
            <div className="inline-flex items-center gap-2 bg-white/20 backdrop-blur-md rounded-full px-4 py-2 border border-white/30 shadow-lg">
              <Zap className="w-4 h-4 text-primary" />
              <span className="text-sm font-medium">
                {heroContent?.subtitle || 'AI-Powered University Matching'}
              </span>
            </div>
            
            <h1 className="text-5xl lg:text-7xl font-bold leading-tight animate-fade-in">
              {heroContent?.title ? (
                heroContent.title.split(' ').map((word, index) => 
                  word.toLowerCase().includes('match') || word.toLowerCase().includes('university') ? (
                    <span key={index} className="gradient-text block">{word} </span>
                  ) : (
                    <span key={index}>{word} </span>
                  )
                )
              ) : (
                <>
                  Find Your Perfect
                  <span className="gradient-text block">University Match</span>
                </>
              )}
            </h1>
            
            <p className="text-xl text-muted-foreground leading-relaxed max-w-2xl animate-fade-in" style={{animationDelay: '0.2s'}}>
              {heroContent?.content || 
                'Your gateway to global education. Let our AI-powered platform guide you through personalized university recommendations, visa assistance, and application support. Join 50,000+ students who achieved their study abroad dreams with Fly Masters.'}
            </p>
          </div>

          {/* Enhanced CTA Buttons */}
          <div className="flex flex-col sm:flex-row gap-4 animate-fade-in" style={{animationDelay: '0.4s'}}>
            <ChatButton />
            
            <Button variant="glass" size="xl" className="group shadow-lg hover:shadow-xl transition-all duration-300" asChild>
              <a href="https://www.youtube.com/watch?v=dQw4w9WgXcQ" target="_blank" rel="noopener noreferrer">
                <Play className="w-5 h-5 mr-2" />
                Watch Demo
                <ArrowRight className="w-5 h-5 ml-2 group-hover:translate-x-1 transition-transform" />
              </a>
            </Button>
          </div>

          {/* Enhanced Stats with admin-editable content */}
          <div className="grid grid-cols-3 gap-6 pt-8">
            {stats.map((stat, index) => (
              <div key={stat.section_key} className="text-center animate-fade-in" style={{animationDelay: `${0.6 + index * 0.1}s`}}>
                <div className="text-3xl lg:text-4xl font-bold gradient-text mb-1">{stat.title}</div>
                <div className="text-sm text-muted-foreground font-medium">{stat.subtitle}</div>
                {stat.content && (
                  <div className="text-xs text-muted-foreground mt-1 hidden lg:block">{stat.content}</div>
                )}
              </div>
            ))}
          </div>

          {/* Trust Indicators */}
          <div className="flex items-center gap-4 pt-4 animate-fade-in" style={{animationDelay: '0.8s'}}>
            <div className="flex items-center gap-2">
              <div className="flex -space-x-2">
                {[1, 2, 3, 4].map((i) => (
                  <div key={i} className="w-8 h-8 rounded-full bg-gradient-primary/20 border-2 border-background" />
                ))}
              </div>
              <span className="text-sm text-muted-foreground">Trusted by thousands</span>
            </div>
          </div>
        </div>

        {/* Enhanced Hero Image */}
        <div className="relative animate-fade-in" style={{animationDelay: '0.3s'}}>
          <div className="glass-card p-8 pulse-glow relative">
            {/* Additional glow effects */}
            <div className="absolute -inset-2 bg-gradient-primary/20 rounded-3xl blur-xl opacity-30" />
            <div className="relative">
              <img 
                src={heroImage} 
                alt="AI-powered university selection interface showing personalized recommendations"
                className="w-full h-auto rounded-xl shadow-card hover:scale-105 transition-transform duration-300"
              />
            </div>
          </div>
          
          {/* Floating badges */}
          <div className="absolute -top-4 -right-4 bg-white/20 backdrop-blur-md rounded-full px-4 py-2 border border-white/30 shadow-lg">
            <span className="text-sm font-semibold text-primary">AI Powered</span>
          </div>
          <div className="absolute -bottom-4 -left-4 bg-white/20 backdrop-blur-md rounded-full px-4 py-2 border border-white/30 shadow-lg">
            <span className="text-sm font-semibold text-accent-cyan">24/7 Support</span>
          </div>
        </div>
      </div>
    </section>
  );
};

export default Hero;