import React, { useEffect, useState } from 'react';
import { Card, CardContent } from '@student/components/ui/card';
import { 
  GraduationCap, 
  Globe, 
  Users, 
  Award,
  BookOpen,
  TrendingUp
} from 'lucide-react';
import { supabase } from '@student/integrations/supabase/client';

interface WebsiteContent {
  section_key: string;
  title: string | null;
  subtitle: string | null;
  content: string | null;
}

const StatsSection = () => {
  const [stats, setStats] = useState<WebsiteContent[]>([]);

  useEffect(() => {
    fetchStats();
  }, []);

  const fetchStats = async () => {
    const { data } = await supabase
      .from('website_content')
      .select('*')
      .in('section_key', ['hero_stats_1', 'hero_stats_2', 'hero_stats_3'])
      .order('display_order');
    
    if (data) setStats(data);
  };

  const getIcon = (index: number) => {
    const icons = [GraduationCap, Globe, Users, Award, BookOpen, TrendingUp];
    const IconComponent = icons[index % icons.length];
    return IconComponent;
  };

  const additionalStats = [
    { title: '98%', subtitle: 'Success Rate', content: 'Students successfully placed in their preferred universities' },
    { title: '24/7', subtitle: 'Support', content: 'Round-the-clock assistance for all your queries' },
    { title: '15+', subtitle: 'Years Experience', content: 'Helping students achieve their international education dreams' }
  ];

  const allStats = [...stats, ...additionalStats.map((stat, index) => ({
    section_key: `additional_${index}`,
    title: stat.title,
    subtitle: stat.subtitle,
    content: stat.content
  }))];

  return (
    <section className="py-20 bg-gradient-to-br from-primary/5 via-background to-accent-cyan/5">
      <div className="container mx-auto px-6">
        <div className="text-center mb-16">
          <h2 className="text-4xl font-bold mb-4">
            Our <span className="gradient-text">Impact</span> & <span className="gradient-text">Achievements</span>
          </h2>
          <p className="text-xl text-muted-foreground max-w-3xl mx-auto">
            Numbers that speak for themselves - see how we've been making study abroad dreams come true
          </p>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-6">
          {allStats.map((stat, index) => {
            const IconComponent = getIcon(index);
            
            return (
              <Card 
                key={stat.section_key} 
                className="glass-card group cursor-pointer hover-scale text-center"
              >
                <CardContent className="p-6">
                  <div className="w-12 h-12 rounded-full bg-gradient-primary/10 flex items-center justify-center mx-auto mb-4 group-hover:scale-110 transition-transform duration-300">
                    <IconComponent className="w-6 h-6 text-primary" />
                  </div>
                  
                  <div className="text-2xl font-bold gradient-text mb-2">
                    {stat.title}
                  </div>
                  
                  <div className="text-sm font-semibold text-foreground mb-2">
                    {stat.subtitle}
                  </div>
                  
                  {stat.content && (
                    <div className="text-xs text-muted-foreground leading-tight">
                      {stat.content}
                    </div>
                  )}
                  
                  <div className="h-1 w-0 bg-gradient-primary mt-4 group-hover:w-full transition-all duration-500" />
                </CardContent>
              </Card>
            );
          })}
        </div>

        {/* Additional Achievement Cards */}
        <div className="grid md:grid-cols-3 gap-8 mt-16">
          <Card className="glass-card">
            <CardContent className="p-8 text-center">
              <Award className="w-16 h-16 text-primary mx-auto mb-4" />
              <h3 className="text-xl font-semibold mb-2">Industry Recognition</h3>
              <p className="text-muted-foreground">
                Awarded "Best Study Abroad Consultancy" by Education Excellence Awards 2023
              </p>
            </CardContent>
          </Card>

          <Card className="glass-card">
            <CardContent className="p-8 text-center">
              <BookOpen className="w-16 h-16 text-primary mx-auto mb-4" />
              <h3 className="text-xl font-semibold mb-2">Expert Team</h3>
              <p className="text-muted-foreground">
                50+ certified counselors with international education expertise
              </p>
            </CardContent>
          </Card>

          <Card className="glass-card">
            <CardContent className="p-8 text-center">
              <TrendingUp className="w-16 h-16 text-primary mx-auto mb-4" />
              <h3 className="text-xl font-semibold mb-2">Growing Network</h3>
              <p className="text-muted-foreground">
                Expanding partnerships with top universities worldwide every month
              </p>
            </CardContent>
          </Card>
        </div>
      </div>
    </section>
  );
};

export default StatsSection;