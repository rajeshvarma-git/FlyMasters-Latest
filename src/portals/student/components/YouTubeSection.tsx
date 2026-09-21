import React, { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@student/components/ui/card';
import { Button } from '@student/components/ui/button';
import { Badge } from '@student/components/ui/badge';
import { Play, Youtube, ExternalLink } from 'lucide-react';
import { supabase } from '@student/integrations/supabase/client';
import {
  Carousel,
  CarouselContent,
  CarouselItem,
  CarouselNext,
  CarouselPrevious,
} from "@student/components/ui/carousel";

interface YouTubeVideo {
  id: string;
  video_id: string;
  title: string;
  description: string | null;
  thumbnail_url: string | null;
  video_url: string;
  video_type: string;
  is_featured: boolean;
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

const YouTubeSection = () => {
  const [videos, setVideos] = useState<YouTubeVideo[]>([]);
  const [content, setContent] = useState<WebsiteContent | null>(null);

  useEffect(() => {
    fetchVideos();
    fetchContent();
  }, []);

  const fetchVideos = async () => {
    const { data } = await supabase
      .from('youtube_videos')
      .select('*')
      .eq('is_active', true)
      .order('display_order')
      .limit(6);
    
    if (data) setVideos(data);
  };

  const fetchContent = async () => {
    const { data } = await supabase
      .from('website_content')
      .select('*')
      .eq('section_key', 'youtube_section')
      .single();
    
    if (data) setContent(data);
  };

  const getYouTubeThumbnail = (videoId: string) => {
    return `https://img.youtube.com/vi/${videoId}/maxresdefault.jpg`;
  };

  const openVideo = (videoUrl: string) => {
    window.open(videoUrl, '_blank', 'noopener,noreferrer');
  };

  if (!content || videos.length === 0) return null;

  return (
    <section className="py-20 relative bg-gradient-to-br from-background to-muted/20">
      <div className="container mx-auto px-6">
        {/* Section Header */}
        <div className="text-center mb-16">
          <div className="flex items-center justify-center gap-2 mb-4">
            <Youtube className="w-8 h-8 text-red-600" />
            <Badge variant="outline" className="text-red-600 border-red-600">
              YouTube Channel
            </Badge>
          </div>
          <h2 className="text-4xl font-bold mb-4">
            {content.title || 'Success Stories on YouTube'}
          </h2>
          <p className="text-xl text-muted-foreground max-w-3xl mx-auto mb-2">
            {content.subtitle || 'Watch real student experiences and testimonials'}
          </p>
          <p className="text-lg text-muted-foreground max-w-4xl mx-auto">
            {content.content || 'Discover inspiring stories from students who achieved their study abroad dreams.'}
          </p>
        </div>

        {/* Video Carousel */}
        <div className="mb-12">
          <Carousel
            opts={{
              align: "start",
              loop: true,
            }}
            className="w-full"
          >
            <CarouselContent className="-ml-2 md:-ml-4">
              {videos.map((video, index) => (
                <CarouselItem key={video.id} className="pl-2 md:pl-4 md:basis-1/2 lg:basis-1/3">
                  <Card 
                    className="glass-card group hover-scale cursor-pointer animate-fade-in" 
                    style={{animationDelay: `${index * 0.1}s`}}
                    onClick={() => openVideo(video.video_url)}
                  >
                    <CardHeader className="p-0">
                      <div className="relative aspect-video overflow-hidden rounded-t-lg">
                        <img
                          src={video.thumbnail_url || getYouTubeThumbnail(video.video_id)}
                          alt={video.title}
                          className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
                        />
                        <div className="absolute inset-0 bg-black/20 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-300">
                          <div className="bg-red-600 rounded-full p-4 shadow-lg transform scale-90 group-hover:scale-100 transition-transform duration-300">
                            <Play className="w-8 h-8 text-white fill-white" />
                          </div>
                        </div>
                        {video.is_featured && (
                          <Badge className="absolute top-3 left-3 bg-red-600 hover:bg-red-700">
                            Featured
                          </Badge>
                        )}
                        <Badge 
                          variant="secondary" 
                          className="absolute top-3 right-3 bg-black/50 text-white border-0"
                        >
                          {video.video_type}
                        </Badge>
                      </div>
                    </CardHeader>
                    <CardContent className="p-4">
                      <CardTitle className="text-lg mb-2 line-clamp-2 group-hover:text-primary transition-colors">
                        {video.title}
                      </CardTitle>
                      {video.description && (
                        <p className="text-sm text-muted-foreground line-clamp-3">
                          {video.description}
                        </p>
                      )}
                    </CardContent>
                  </Card>
                </CarouselItem>
              ))}
            </CarouselContent>
            <CarouselPrevious className="-left-12 bg-background/80 border-border hover:bg-background" />
            <CarouselNext className="-right-12 bg-background/80 border-border hover:bg-background" />
          </Carousel>
        </div>

        {/* CTA Section */}
        <div className="text-center">
          <Card className="bg-gradient-to-br from-red-50 to-red-100 dark:from-red-950/20 dark:to-red-900/20 border-red-200 dark:border-red-800 max-w-3xl mx-auto">
            <CardContent className="p-8">
              <div className="flex items-center justify-center gap-2 mb-4">
                <Youtube className="w-8 h-8 text-red-600" />
                <h3 className="text-2xl font-bold">Subscribe for More Success Stories</h3>
              </div>
              <p className="text-lg text-muted-foreground mb-6">
                Join thousands of subscribers and get the latest study abroad tips, success stories, and expert guidance directly from our counselors.
              </p>
              <div className="flex flex-col sm:flex-row gap-4 justify-center">
                <Button 
                  size="lg" 
                  className="bg-red-600 hover:bg-red-700 text-white"
                  onClick={() => window.open(content.cta_link || 'https://youtube.com/@flymasters', '_blank')}
                >
                  <Youtube className="w-5 h-5 mr-2" />
                  {content.cta_text || 'Subscribe to Our Channel'}
                </Button>
                <Button 
                  variant="outline" 
                  size="lg" 
                  className="group border-red-200 hover:border-red-300"
                  onClick={() => window.open(content.cta_link || 'https://youtube.com/@flymasters', '_blank')}
                >
                  Visit Channel
                  <ExternalLink className="w-4 h-4 ml-2 group-hover:translate-x-1 transition-transform" />
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </section>
  );
};

export default YouTubeSection;