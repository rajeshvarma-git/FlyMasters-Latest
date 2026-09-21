import React, { useEffect, useState } from 'react';
import { Youtube, Instagram, Facebook, Linkedin } from 'lucide-react';
import { supabase } from '@student/integrations/supabase/client';

interface SocialMediaConfig {
  youtube?: string;
  instagram?: string;
  facebook?: string;
  linkedin?: string;
  snapchat?: string;
}

interface WebsiteContent {
  title: string | null;
  subtitle: string | null;
  content: string | null;
  metadata: any;
}

const SocialMediaLinks = () => {
  const [content, setContent] = useState<WebsiteContent | null>(null);

  useEffect(() => {
    fetchContent();
  }, []);

  const fetchContent = async () => {
    const { data } = await supabase
      .from('website_content')
      .select('*')
      .eq('section_key', 'social_media_links')
      .single();
    
    if (data) setContent(data);
  };

  const links = (content?.metadata as SocialMediaConfig) || {};

  const socialLinks = [
    { 
      name: 'YouTube', 
      url: links.youtube, 
      icon: Youtube, 
      color: 'hover:text-red-500',
      bgColor: 'hover:bg-red-500/10'
    },
    { 
      name: 'Instagram', 
      url: links.instagram, 
      icon: Instagram, 
      color: 'hover:text-pink-500',
      bgColor: 'hover:bg-pink-500/10'
    },
    { 
      name: 'Facebook', 
      url: links.facebook, 
      icon: Facebook, 
      color: 'hover:text-blue-600',
      bgColor: 'hover:bg-blue-600/10'
    },
    { 
      name: 'LinkedIn', 
      url: links.linkedin, 
      icon: Linkedin, 
      color: 'hover:text-blue-700',
      bgColor: 'hover:bg-blue-700/10'
    },
    { 
      name: 'Snapchat', 
      url: links.snapchat, 
      icon: ({ className }: { className?: string }) => (
        <svg className={className} viewBox="0 0 24 24" fill="currentColor">
          <path d="M12.166 3c-2.4 0-4.35 1.95-4.35 4.35 0 .87.26 1.73.76 2.47.14.21.13.49-.03.69l-1.39 1.72c-.13.16-.13.38 0 .54l1.39 1.72c.16.2.17.48.03.69-.5.74-.76 1.6-.76 2.47 0 2.4 1.95 4.35 4.35 4.35s4.35-1.95 4.35-4.35c0-.87-.26-1.73-.76-2.47-.14-.21-.13-.49.03-.69l1.39-1.72c.13-.16.13-.38 0-.54l-1.39-1.72c-.16-.2-.17-.48-.03-.69.5-.74.76-1.6.76-2.47 0-2.4-1.95-4.35-4.35-4.35h-.004z"/>
        </svg>
      ), 
      color: 'hover:text-yellow-400',
      bgColor: 'hover:bg-yellow-400/10'
    },
  ].filter(link => link.url);

  if (socialLinks.length === 0) return null;

  return (
    <section className="py-12 bg-gradient-to-br from-muted/30 to-background">
      <div className="container mx-auto px-6">
        <div className="text-center mb-8">
          <h3 className="text-2xl font-bold mb-2">
            {content?.title || 'Connect With Us'}
          </h3>
          <p className="text-muted-foreground">
            {content?.subtitle || 'Follow us on social media'}
          </p>
        </div>

        <div className="flex justify-center gap-4 flex-wrap">
          {socialLinks.map(({ name, url, icon: Icon, color, bgColor }) => (
            <a
              key={name}
              href={url}
              target="_blank"
              rel="noopener noreferrer"
              className={`group flex items-center justify-center w-14 h-14 rounded-full bg-card border-2 border-border transition-all duration-300 ${color} ${bgColor} hover:scale-110 hover:border-current`}
              aria-label={name}
            >
              <Icon className="w-6 h-6 transition-transform group-hover:scale-110" />
            </a>
          ))}
        </div>
      </div>
    </section>
  );
};

export default SocialMediaLinks;