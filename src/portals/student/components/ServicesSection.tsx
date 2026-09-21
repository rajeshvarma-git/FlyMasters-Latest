import React, { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@student/components/ui/card';
import { Button } from '@student/components/ui/button';
import { Badge } from '@student/components/ui/badge';
import { 
  GraduationCap, 
  FileText, 
  Award, 
  BookOpen, 
  Users, 
  Send,
  Check,
  ArrowRight 
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { supabase } from '@student/integrations/supabase/client';
import ChatButton from '@student/components/ChatButton';
import { slugifyService } from '@student/lib/serviceDetails';
import { buttonVariants } from '@student/components/ui/button';
import { cn } from '@student/lib/utils';

interface ServiceOffering {
  id: string;
  service_name: string;
  description: string;
  icon_name: string;
  features: string[];
  is_popular: boolean;
  is_active: boolean;
  display_order: number;
}

interface WebsiteContent {
  section_key: string;
  title: string | null;
  subtitle: string | null;
  content: string | null;
  cta_text: string | null;
  cta_link: string | null;
}

const iconMap = {
  GraduationCap,
  FileText,
  Award,
  BookOpen,
  Users,
  Send
};

const ServicesSection = () => {
  const [services, setServices] = useState<ServiceOffering[]>([]);
  const [content, setContent] = useState<WebsiteContent | null>(null);

  useEffect(() => {
    fetchServices();
    fetchContent();
  }, []);

  const fetchServices = async () => {
    const { data } = await supabase
      .from('service_offerings')
      .select('*')
      .eq('is_active', true)
      .order('display_order');
    
    if (data) setServices(data);
  };

  const fetchContent = async () => {
    const { data } = await supabase
      .from('website_content')
      .select('*')
      .eq('section_key', 'services_title')
      .single();
    
    if (data) setContent(data);
  };

  return (
    <section className="py-20 bg-gradient-to-br from-background to-primary/5">
      <div className="container mx-auto px-6">
        {/* Section Header */}
        <div className="text-center mb-16">
          <h2 className="text-4xl font-bold mb-4">
            {content?.title || 'Complete Study Abroad Solutions'}
          </h2>
          <p className="text-xl text-muted-foreground max-w-3xl mx-auto mb-2">
            {content?.subtitle || 'Everything you need for your international education journey'}
          </p>
          <p className="text-lg text-muted-foreground max-w-4xl mx-auto">
            {content?.content || 'From university selection to visa guidance, we provide comprehensive support at every step of your study abroad journey.'}
          </p>
        </div>

        {/* Services Grid */}
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8 mb-16">
          {services.map((service) => {
            const IconComponent = iconMap[service.icon_name as keyof typeof iconMap] || GraduationCap;
            const href = `/services/${slugifyService(service.service_name)}`;
            
            return (
              <a
                key={service.id}
                href={href}
                className="block h-full text-inherit no-underline"
              >
              <Card 
                className={cn(
                  'glass-card group cursor-pointer hover-scale relative overflow-hidden h-full',
                  service.is_popular && 'ring-2 ring-primary/50 shadow-glow'
                )}
              >
                {service.is_popular && (
                  <Badge className="absolute top-4 right-4 bg-gradient-primary text-white z-10">
                    Popular
                  </Badge>
                )}
                
                <CardHeader>
                  <div className="w-16 h-16 rounded-full bg-gradient-primary/10 flex items-center justify-center mb-4 group-hover:scale-110 transition-transform duration-300">
                    <IconComponent className="w-8 h-8 text-primary" />
                  </div>
                  <CardTitle className="text-xl">{service.service_name}</CardTitle>
                </CardHeader>
                
                <CardContent className="space-y-4">
                  <p className="text-muted-foreground">{service.description}</p>
                  
                  <div className="space-y-2">
                    {(service.features || []).map((feature, idx) => (
                      <div key={idx} className="flex items-center gap-2">
                        <Check className="w-4 h-4 text-primary flex-shrink-0" />
                        <span className="text-sm">{feature}</span>
                      </div>
                    ))}
                  </div>
                  
                  <span className={cn(buttonVariants({ variant: 'outline' }), 'w-full relative z-10')}>
                    View details
                    <ArrowRight className="w-4 h-4 ml-2" />
                  </span>
                </CardContent>
              </Card>
              </a>
            );
          })}
        </div>

        {/* CTA Section */}
        <div className="text-center">
          <Card className="bg-gradient-primary/10 border-primary/20 max-w-2xl mx-auto">
            <CardContent className="p-8">
              <h3 className="text-2xl font-bold mb-4">Need Personalized Guidance?</h3>
              <p className="text-muted-foreground mb-6">
                Talk to our expert counselors and get customized recommendations for your study abroad journey.
              </p>
              <div className="flex flex-col sm:flex-row gap-4 justify-center">
                <ChatButton />
                <Button variant="outline" size="lg" asChild>
                  <Link to="/chat">Book Free Consultation</Link>
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </section>
  );
};

export default ServicesSection;