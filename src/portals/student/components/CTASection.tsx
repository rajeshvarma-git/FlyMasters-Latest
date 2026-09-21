import React, { useEffect, useState } from 'react';
import { Card, CardContent } from '@student/components/ui/card';
import { Button } from '@student/components/ui/button';
import { ArrowRight, Sparkles, MessageCircle, Phone } from 'lucide-react';
import { supabase } from '@student/integrations/supabase/client';
import { Link } from 'react-router-dom';
import ChatButton from '@student/components/ChatButton';

interface WebsiteContent {
  section_key: string;
  title: string | null;
  subtitle: string | null;
  content: string | null;
  cta_text: string | null;
  cta_link: string | null;
}

interface CTASectionProps {
  sectionKey: string;
  className?: string;
  variant?: 'primary' | 'secondary' | 'gradient';
}

const CTASection: React.FC<CTASectionProps> = ({ 
  sectionKey, 
  className = "", 
  variant = 'primary' 
}) => {
  const [content, setContent] = useState<WebsiteContent | null>(null);

  useEffect(() => {
    fetchContent();
  }, [sectionKey]);

  const fetchContent = async () => {
    const { data } = await supabase
      .from('website_content')
      .select('*')
      .eq('section_key', sectionKey)
      .single();
    
    if (data) setContent(data);
  };

  if (!content) return null;

  const getVariantClasses = () => {
    switch (variant) {
      case 'gradient':
        return 'bg-gradient-to-r from-primary via-primary-glow to-accent-cyan text-white';
      case 'secondary':
        return 'bg-gradient-to-br from-background to-primary/10 border-primary/20';
      default:
        return 'bg-gradient-primary/10 border-primary/20';
    }
  };

  const getButtonVariant = () => {
    return variant === 'gradient' ? 'secondary' : 'default';
  };

  return (
    <section className={`py-16 ${className}`}>
      <div className="container mx-auto px-6">
        <Card className={`${getVariantClasses()} max-w-4xl mx-auto`}>
          <CardContent className="p-12 text-center">
            {/* Floating elements for gradient variant */}
            {variant === 'gradient' && (
              <>
                <div className="absolute top-4 left-8 w-16 h-16 rounded-full bg-white/10 float-animation" />
                <div className="absolute bottom-6 right-12 w-12 h-12 rounded-full bg-white/20 float-animation" style={{animationDelay: '2s'}} />
                <Sparkles className="absolute top-8 right-16 w-6 h-6 text-white/30 float-animation" style={{animationDelay: '1s'}} />
              </>
            )}
            
            <div className="relative z-10">
              <h2 className="text-4xl font-bold mb-4">
                {content.title}
              </h2>
              
              {content.subtitle && (
                <h3 className="text-2xl font-semibold mb-6 text-primary">
                  {content.subtitle}
                </h3>
              )}
              
              {content.content && (
                <p className={`text-xl leading-relaxed mb-8 max-w-3xl mx-auto ${
                  variant === 'gradient' ? 'text-white/90' : 'text-muted-foreground'
                }`}>
                  {content.content}
                </p>
              )}

              <div className="flex flex-col sm:flex-row gap-6 justify-center items-center">
                {/* Primary CTA */}
                {content.cta_text && content.cta_link && (
                  <>
                    {content.cta_link === '/chat' ? (
                      <ChatButton />
                    ) : (
                      <Button 
                        size="xl" 
                        variant={getButtonVariant()}
                        className="group shadow-lg hover:shadow-xl transition-all duration-300"
                        asChild
                      >
                        <Link to={content.cta_link} className="flex items-center gap-2">
                          {content.cta_text}
                          <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
                        </Link>
                      </Button>
                    )}
                  </>
                )}

                {/* Secondary CTAs */}
                <div className="flex gap-4">
                  <Button 
                    variant={variant === 'gradient' ? 'outline' : 'outline'} 
                    size="lg"
                    className={`group ${variant === 'gradient' ? 'border-white/30 text-white hover:bg-white/20' : ''}`}
                    asChild
                  >
                    <a href="tel:+919502127788" className="flex items-center gap-2">
                      <Phone className="w-4 h-4" />
                      Call Now
                    </a>
                  </Button>
                  
                  <Button 
                    variant={variant === 'gradient' ? 'outline' : 'outline'} 
                    size="lg"
                    className={`group ${variant === 'gradient' ? 'border-white/30 text-white hover:bg-white/20' : ''}`}
                    asChild
                  >
                    <a 
                      href="https://wa.me/919502127788?text=Hi, I'm interested in studying abroad. Can you help me?" 
                      target="_blank" 
                      rel="noopener noreferrer"
                      className="flex items-center gap-2"
                    >
                      <MessageCircle className="w-4 h-4" />
                      WhatsApp
                    </a>
                  </Button>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </section>
  );
};

export default CTASection;