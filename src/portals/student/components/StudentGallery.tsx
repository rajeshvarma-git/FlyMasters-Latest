import React, { useState, useEffect } from 'react';
import { supabase } from '@student/integrations/supabase/client';
import { Card } from '@student/components/ui/card';
import { Badge } from '@student/components/ui/badge';
import { Award, MapPin, Calendar } from 'lucide-react';

interface GalleryImage {
  id: string;
  student_name: string;
  image_url: string;
  visa_type: string | null;
  country: string | null;
  year: number | null;
  description: string | null;
  display_order: number;
}

const StudentGallery = () => {
  const [images, setImages] = useState<GalleryImage[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchGalleryImages();
  }, []);

  const fetchGalleryImages = async () => {
    try {
      const { data, error } = await supabase
        .from('student_gallery')
        .select('*')
        .eq('is_active', true)
        .order('display_order');

      if (error) throw error;
      setImages(data || []);
    } catch (error) {
      console.error('Error fetching gallery images:', error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <section className="py-20 px-4 bg-muted/30">
        <div className="container mx-auto text-center">
          <div className="animate-pulse">Loading gallery...</div>
        </div>
      </section>
    );
  }

  if (images.length === 0) return null;

  return (
    <section className="py-20 px-4 bg-muted/30 relative overflow-hidden">
      {/* Background decoration */}
      <div className="absolute inset-0 opacity-30">
        <div className="absolute top-20 left-10 w-72 h-72 bg-primary/20 rounded-full blur-3xl" />
        <div className="absolute bottom-20 right-10 w-96 h-96 bg-accent-cyan/20 rounded-full blur-3xl" />
      </div>

      <div className="container mx-auto relative z-10">
        <div className="text-center mb-16">
          <div className="inline-flex items-center gap-2 px-6 py-3 rounded-full bg-success/10 mb-6">
            <Award className="w-5 h-5 text-success" />
            <span className="text-sm font-semibold text-success">Success Stories</span>
          </div>
          <h2 className="text-4xl md:text-5xl font-bold mb-4">
            Our <span className="gradient-text">Students' Success</span>
          </h2>
          <p className="text-muted-foreground text-lg max-w-2xl mx-auto">
            Celebrating our students who achieved their dreams of studying abroad
          </p>
        </div>

        {/* Vertical Gallery Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6 max-w-7xl mx-auto">
          {images.map((image, index) => (
            <Card 
              key={image.id} 
              className="glass-card overflow-hidden group cursor-pointer animate-fade-in"
              style={{ animationDelay: `${index * 0.1}s` }}
            >
              <div className="relative aspect-[3/4] overflow-hidden">
                <img
                  src={image.image_url}
                  alt={`${image.student_name} - ${image.country}`}
                  className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110"
                  onError={(e) => {
                    e.currentTarget.src = '/placeholder.svg';
                  }}
                />
                
                {/* Overlay gradient */}
                <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/40 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
                
                {/* Info overlay */}
                <div className="absolute bottom-0 left-0 right-0 p-4 translate-y-full group-hover:translate-y-0 transition-transform duration-300">
                  <h3 className="text-white font-bold text-lg mb-2">{image.student_name}</h3>
                  
                  {image.description && (
                    <p className="text-white/90 text-sm mb-3 line-clamp-2">
                      {image.description}
                    </p>
                  )}
                  
                  <div className="flex flex-wrap gap-2">
                    {image.country && (
                      <Badge variant="secondary" className="bg-white/20 text-white border-white/30">
                        <MapPin className="w-3 h-3 mr-1" />
                        {image.country}
                      </Badge>
                    )}
                    {image.visa_type && (
                      <Badge variant="secondary" className="bg-white/20 text-white border-white/30">
                        <Award className="w-3 h-3 mr-1" />
                        {image.visa_type}
                      </Badge>
                    )}
                    {image.year && (
                      <Badge variant="secondary" className="bg-white/20 text-white border-white/30">
                        <Calendar className="w-3 h-3 mr-1" />
                        {image.year}
                      </Badge>
                    )}
                  </div>
                </div>

                {/* Quick info on card */}
                <div className="absolute top-4 left-4 right-4">
                  <div className="bg-white/95 backdrop-blur-sm rounded-lg p-3 shadow-lg">
                    <div className="font-semibold text-sm text-foreground mb-1">
                      {image.student_name}
                    </div>
                    {image.country && (
                      <div className="flex items-center gap-1 text-xs text-muted-foreground">
                        <MapPin className="w-3 h-3" />
                        {image.country}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </Card>
          ))}
        </div>

        {/* CTA */}
        <div className="text-center mt-16">
          <p className="text-lg text-muted-foreground mb-6">
            Ready to join our success stories?
          </p>
          <a href="/chat" className="inline-block">
            <button className="btn-primary">
              Start Your Journey Today
            </button>
          </a>
        </div>
      </div>
    </section>
  );
};

export default StudentGallery;