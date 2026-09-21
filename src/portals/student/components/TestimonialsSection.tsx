import React, { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader } from '@student/components/ui/card';
import { Avatar, AvatarFallback, AvatarImage } from '@student/components/ui/avatar';
import { Badge } from '@student/components/ui/badge';
import { Button } from '@student/components/ui/button';
import { Star, Quote, ArrowRight } from 'lucide-react';
import { supabase } from '@student/integrations/supabase/client';
import ChatButton from '@student/components/ChatButton';

interface Testimonial {
  id: string;
  student_name: string;
  university: string;
  country: string;
  course: string | null;
  rating: number;
  testimonial: string;
  image_url: string | null;
  is_featured: boolean;
}

interface WebsiteContent {
  section_key: string;
  title: string | null;
  subtitle: string | null;
  content: string | null;
}

const TestimonialsSection = () => {
  const [testimonials, setTestimonials] = useState<Testimonial[]>([]);
  const [content, setContent] = useState<WebsiteContent | null>(null);

  useEffect(() => {
    fetchTestimonials();
    fetchContent();
  }, []);

  const fetchTestimonials = async () => {
    const { data } = await supabase
      .from('testimonials')
      .select('*')
      .eq('is_active', true)
      .eq('is_featured', true)
      .order('display_order')
      .limit(4);
    
    if (data) setTestimonials(data);
  };

  const fetchContent = async () => {
    const { data } = await supabase
      .from('website_content')
      .select('*')
      .eq('section_key', 'testimonials_title')
      .single();
    
    if (data) setContent(data);
  };

  const renderStars = (rating: number) => {
    return Array.from({ length: 5 }, (_, i) => (
      <Star
        key={i}
        className={`w-4 h-4 ${
          i < rating ? 'text-yellow-400 fill-yellow-400' : 'text-muted-foreground'
        }`}
      />
    ));
  };

  const getInitials = (name: string) => {
    return name.split(' ').map(n => n[0]).join('').toUpperCase();
  };

  return (
    <section className="py-20 relative">
      <div className="container mx-auto px-6">
        {/* Section Header */}
        <div className="text-center mb-16">
          <h2 className="text-4xl font-bold mb-4">
            {content?.title || 'Success Stories'}
          </h2>
          <p className="text-xl text-muted-foreground max-w-3xl mx-auto mb-2">
            {content?.subtitle || 'What our students say about their journey with Fly Masters'}
          </p>
          <p className="text-lg text-muted-foreground max-w-4xl mx-auto">
            {content?.content || 'Hear from students who successfully got admitted to their dream universities with our guidance and support.'}
          </p>
        </div>

        {/* Testimonials Grid */}
        <div className="grid md:grid-cols-2 gap-8 mb-16">
          {testimonials.map((testimonial, index) => (
            <Card key={testimonial.id} className="glass-card group hover-scale animate-fade-in" style={{animationDelay: `${index * 0.1}s`}}>
              <CardHeader>
                <div className="flex items-start gap-4">
                  <Avatar className="w-16 h-16">
                    <AvatarImage src={testimonial.image_url || undefined} />
                    <AvatarFallback className="bg-gradient-primary text-white">
                      {getInitials(testimonial.student_name)}
                    </AvatarFallback>
                  </Avatar>
                  
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-2">
                      <h4 className="font-semibold text-lg">{testimonial.student_name}</h4>
                      <Badge variant="outline">{testimonial.country}</Badge>
                    </div>
                    <p className="text-sm text-muted-foreground mb-2">
                      {testimonial.course && `${testimonial.course} at `}
                      {testimonial.university}
                    </p>
                    <div className="flex items-center gap-1">
                      {renderStars(testimonial.rating)}
                    </div>
                  </div>
                </div>
              </CardHeader>
              
              <CardContent>
                <div className="relative">
                  <Quote className="w-8 h-8 text-primary/20 absolute -top-2 -left-2" />
                  <blockquote className="text-muted-foreground italic leading-relaxed pl-6">
                    "{testimonial.testimonial}"
                  </blockquote>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* CTA Section */}
        <div className="text-center">
          <Card className="bg-gradient-to-br from-primary/5 to-accent-cyan/5 border-primary/20 max-w-3xl mx-auto">
            <CardContent className="p-8">
              <h3 className="text-3xl font-bold mb-4">Ready to Write Your Success Story?</h3>
              <p className="text-xl text-muted-foreground mb-6">
                Join thousands of students who achieved their study abroad dreams with our expert guidance.
              </p>
              <div className="flex flex-col sm:flex-row gap-4 justify-center">
                <ChatButton />
                <Button variant="outline" size="lg" className="group">
                  View All Success Stories
                  <ArrowRight className="w-4 h-4 ml-2 group-hover:translate-x-1 transition-transform" />
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </section>
  );
};

export default TestimonialsSection;