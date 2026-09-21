import React, { useEffect, useState } from 'react';
import { Card, CardContent } from '@student/components/ui/card';
import { Avatar, AvatarFallback, AvatarImage } from '@student/components/ui/avatar';
import { Badge } from '@student/components/ui/badge';
import { Star, Play } from 'lucide-react';
import { supabase } from '@student/integrations/supabase/client';

interface VideoTestimonial {
  id: string;
  student_name: string;
  university: string;
  country: string;
  course: string | null;
  video_url: string;
  thumbnail_url: string | null;
  rating: number;
  is_featured: boolean;
}

interface WebsiteContent {
  section_key: string;
  title: string | null;
  subtitle: string | null;
  content: string | null;
}

const VideoTestimonialsSection = () => {
  const [testimonials, setTestimonials] = useState<VideoTestimonial[]>([]);
  const [content, setContent] = useState<WebsiteContent | null>(null);
  const [selectedVideo, setSelectedVideo] = useState<VideoTestimonial | null>(null);

  useEffect(() => {
    fetchTestimonials();
    fetchContent();
  }, []);

  const fetchTestimonials = async () => {
    const { data } = await supabase
      .from('video_testimonials')
      .select('*')
      .eq('is_active', true)
      .eq('is_featured', true)
      .order('display_order')
      .limit(6);
    
    if (data) setTestimonials(data);
  };

  const fetchContent = async () => {
    const { data } = await supabase
      .from('website_content')
      .select('*')
      .eq('section_key', 'video_testimonials_title')
      .single();
    
    if (data) setContent(data);
  };

  const renderStars = (rating: number) => {
    return Array.from({ length: 5 }, (_, i) => (
      <Star
        key={i}
        className={`w-3 h-3 ${
          i < rating ? 'text-yellow-400 fill-yellow-400' : 'text-muted-foreground'
        }`}
      />
    ));
  };

  const getInitials = (name: string) => {
    return name.split(' ').map(n => n[0]).join('').toUpperCase();
  };

  const getVideoId = (url: string) => {
    const match = url.match(/(?:youtube\.com\/(?:shorts\/|watch\?v=)|youtu\.be\/)([^&\?\/]+)/);
    return match ? match[1] : null;
  };

  return (
    <section className="py-20 relative bg-gradient-to-br from-background via-primary/5 to-background">
      <div className="container mx-auto px-6">
        {/* Section Header */}
        <div className="text-center mb-16">
          <h2 className="text-4xl font-bold mb-4">
            {content?.title || 'Student Success Stories'}
          </h2>
          <p className="text-xl text-muted-foreground max-w-3xl mx-auto mb-2">
            {content?.subtitle || 'Watch real students share their journey'}
          </p>
          <p className="text-lg text-muted-foreground max-w-4xl mx-auto">
            {content?.content || 'Hear from students who successfully got admitted to their dream universities'}
          </p>
        </div>

        {/* Vertical Video Grid */}
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4 mb-8">
          {testimonials.map((testimonial, index) => {
            const videoId = getVideoId(testimonial.video_url);
            const thumbnailUrl = testimonial.thumbnail_url || (videoId ? `https://img.youtube.com/vi/${videoId}/maxresdefault.jpg` : '');

            return (
              <Card 
                key={testimonial.id} 
                className="glass-card group hover-scale cursor-pointer overflow-hidden animate-fade-in"
                style={{animationDelay: `${index * 0.1}s`}}
                onClick={() => setSelectedVideo(testimonial)}
              >
                <CardContent className="p-0">
                  {/* Vertical Video Thumbnail (9:16 aspect ratio) */}
                  <div className="relative aspect-[9/16] overflow-hidden">
                    <img 
                      src={thumbnailUrl} 
                      alt={testimonial.student_name}
                      className="w-full h-full object-cover"
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent" />
                    
                    {/* Play Button Overlay */}
                    <div className="absolute inset-0 flex items-center justify-center">
                      <div className="w-12 h-12 bg-white/90 rounded-full flex items-center justify-center group-hover:scale-110 transition-transform">
                        <Play className="w-6 h-6 text-primary fill-primary ml-1" />
                      </div>
                    </div>

                    {/* Student Info at Bottom */}
                    <div className="absolute bottom-0 left-0 right-0 p-3 text-white">
                      <div className="flex items-center gap-2 mb-1">
                        <Avatar className="w-8 h-8 border-2 border-white">
                          <AvatarImage src={testimonial.thumbnail_url || undefined} />
                          <AvatarFallback className="bg-primary text-white text-xs">
                            {getInitials(testimonial.student_name)}
                          </AvatarFallback>
                        </Avatar>
                        <div className="flex-1 min-w-0">
                          <h4 className="font-semibold text-sm truncate">{testimonial.student_name}</h4>
                          <div className="flex items-center gap-1">
                            {renderStars(testimonial.rating)}
                          </div>
                        </div>
                      </div>
                      <Badge variant="secondary" className="text-xs">
                        {testimonial.country}
                      </Badge>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>

        {/* Video Modal/Player */}
        {selectedVideo && (
          <div 
            className="fixed inset-0 bg-black/90 z-50 flex items-center justify-center p-4"
            onClick={() => setSelectedVideo(null)}
          >
            <div className="max-w-md w-full" onClick={(e) => e.stopPropagation()}>
              <div className="aspect-[9/16] bg-black rounded-lg overflow-hidden">
                <iframe
                  src={`${selectedVideo.video_url}${selectedVideo.video_url.includes('?') ? '&' : '?'}autoplay=1`}
                  className="w-full h-full"
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                  allowFullScreen
                />
              </div>
              <div className="mt-4 text-white text-center">
                <h3 className="text-xl font-bold">{selectedVideo.student_name}</h3>
                <p className="text-sm text-white/80">
                  {selectedVideo.course && `${selectedVideo.course} at `}
                  {selectedVideo.university}
                </p>
                <Badge variant="secondary" className="mt-2">
                  {selectedVideo.country}
                </Badge>
              </div>
            </div>
          </div>
        )}
      </div>
    </section>
  );
};

export default VideoTestimonialsSection;