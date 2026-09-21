import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@student/components/ui/card';
import { Button } from '@student/components/ui/button';
import { Input } from '@student/components/ui/input';
import { Textarea } from '@student/components/ui/textarea';
import { Badge } from '@student/components/ui/badge';
import { Switch } from '@student/components/ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@student/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@student/components/ui/select';
import { 
  Edit3, 
  Save, 
  Plus, 
  Trash2, 
  Globe, 
  MessageSquare,
  Users,
  Star,
  Settings,
  Youtube,
  ExternalLink,
  Image,
  UserCircle,
  Share2,
  Video
} from 'lucide-react';
import { supabase } from '@student/integrations/supabase/client';
import { useToast } from '@student/hooks/use-toast';
import { VideoTestimonialsAdmin } from './VideoTestimonialsAdmin';
import { SocialMediaAdmin } from './SocialMediaAdmin';
import { WhatsAppAdmin } from './WhatsAppAdmin';
import { GalleryAdmin } from './GalleryAdmin';
import { FoundersAdmin } from './FoundersAdmin';

interface WebsiteContent {
  id: string;
  section_key: string;
  title: string | null;
  subtitle: string | null;
  content: string | null;
  image_url: string | null;
  cta_text: string | null;
  cta_link: string | null;
  metadata: any;
  is_active: boolean;
  display_order: number;
}

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
  is_active: boolean;
  display_order: number;
}

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

interface VideoTestimonial {
  id: string;
  student_name: string;
  university: string;
  country: string;
  course: string | null;
  video_url: string;
  thumbnail_url: string | null;
  duration_seconds: number | null;
  rating: number;
  is_featured: boolean;
  is_active: boolean;
  display_order: number;
}

const WebsiteContentAdmin = () => {
  const [activeTab, setActiveTab] = useState('branding');
  const [websiteContent, setWebsiteContent] = useState<WebsiteContent[]>([]);
  const [testimonials, setTestimonials] = useState<Testimonial[]>([]);
  const [services, setServices] = useState<ServiceOffering[]>([]);
  const [youtubeVideos, setYoutubeVideos] = useState<YouTubeVideo[]>([]);
  const [videoTestimonials, setVideoTestimonials] = useState<VideoTestimonial[]>([]);
  const [editingContent, setEditingContent] = useState<WebsiteContent | null>(null);
  const [editingTestimonial, setEditingTestimonial] = useState<Testimonial | null>(null);
  const [editingService, setEditingService] = useState<ServiceOffering | null>(null);
  const [editingVideo, setEditingVideo] = useState<YouTubeVideo | null>(null);
  const [editingVideoTestimonial, setEditingVideoTestimonial] = useState<VideoTestimonial | null>(null);
  const { toast } = useToast();

  const navigationItems = [
    { value: 'branding', label: 'Site Branding', icon: Settings },
    { value: 'content', label: 'Website Content', icon: Globe },
    { value: 'testimonials', label: 'Testimonials', icon: MessageSquare },
    { value: 'services', label: 'Services', icon: Star },
    { value: 'youtube', label: 'YouTube Videos', icon: Youtube },
    { value: 'video-testimonials', label: 'Video Testimonials', icon: Video },
    { value: 'gallery', label: 'Student Gallery', icon: Image },
    { value: 'founders', label: 'Founders', icon: UserCircle },
    { value: 'social-media', label: 'Social Media', icon: Share2 },
    { value: 'whatsapp', label: 'WhatsApp', icon: MessageSquare },
  ];

  useEffect(() => {
    fetchWebsiteContent();
    fetchTestimonials();
    fetchServices();
    fetchYouTubeVideos();
    fetchVideoTestimonials();
  }, []);

  const fetchVideoTestimonials = async () => {
    const { data, error } = await supabase
      .from('video_testimonials')
      .select('*')
      .order('display_order');
    
    if (error) {
      toast({
        title: "Error",
        description: "Failed to fetch video testimonials", 
        variant: "destructive"
      });
    } else if (data) {
      setVideoTestimonials(data);
    }
  };

  const fetchWebsiteContent = async () => {
    const { data, error } = await supabase
      .from('website_content')
      .select('*')
      .order('section_key');
    
    if (error) {
      toast({
        title: "Error",
        description: "Failed to fetch website content",
        variant: "destructive"
      });
    } else if (data) {
      setWebsiteContent(data);
    }
  };

  const fetchTestimonials = async () => {
    const { data, error } = await supabase
      .from('testimonials')
      .select('*')
      .order('display_order');
    
    if (error) {
      toast({
        title: "Error", 
        description: "Failed to fetch testimonials",
        variant: "destructive"
      });
    } else if (data) {
      setTestimonials(data);
    }
  };

  const fetchServices = async () => {
    const { data, error } = await supabase
      .from('service_offerings')
      .select('*')
      .order('display_order');
    
    if (error) {
      toast({
        title: "Error",
        description: "Failed to fetch services", 
        variant: "destructive"
      });
    } else if (data) {
      setServices(data);
    }
  };

  const fetchYouTubeVideos = async () => {
    const { data, error } = await supabase
      .from('youtube_videos')
      .select('*')
      .order('display_order');
    
    if (error) {
      toast({
        title: "Error",
        description: "Failed to fetch YouTube videos", 
        variant: "destructive"
      });
    } else if (data) {
      setYoutubeVideos(data);
    }
  };

  const saveWebsiteContent = async (content: WebsiteContent) => {
    const { error } = await supabase
      .from('website_content')
      .update({
        title: content.title,
        subtitle: content.subtitle,
        content: content.content,
        image_url: content.image_url,
        cta_text: content.cta_text,
        cta_link: content.cta_link,
        is_active: content.is_active,
        display_order: content.display_order
      })
      .eq('id', content.id);
    
    if (error) {
      toast({
        title: "Error",
        description: "Failed to save content",
        variant: "destructive"
      });
    } else {
      toast({
        title: "Success",
        description: "Content saved successfully"
      });
      fetchWebsiteContent();
      setEditingContent(null);
    }
  };

  const saveTestimonial = async (testimonial: Testimonial) => {
    const { error } = await supabase
      .from('testimonials')
      .update({
        student_name: testimonial.student_name,
        university: testimonial.university,
        country: testimonial.country,
        course: testimonial.course,
        rating: testimonial.rating,
        testimonial: testimonial.testimonial,
        image_url: testimonial.image_url,
        is_featured: testimonial.is_featured,
        is_active: testimonial.is_active,
        display_order: testimonial.display_order
      })
      .eq('id', testimonial.id);
    
    if (error) {
      toast({
        title: "Error",
        description: "Failed to save testimonial",
        variant: "destructive"
      });
    } else {
      toast({
        title: "Success", 
        description: "Testimonial saved successfully"
      });
      fetchTestimonials();
      setEditingTestimonial(null);
    }
  };

  const saveService = async (service: ServiceOffering) => {
    const { error } = await supabase
      .from('service_offerings')
      .update({
        service_name: service.service_name,
        description: service.description,
        icon_name: service.icon_name,
        features: service.features,
        is_popular: service.is_popular,
        is_active: service.is_active,
        display_order: service.display_order
      })
      .eq('id', service.id);
    
    if (error) {
      toast({
        title: "Error",
        description: "Failed to save service",
        variant: "destructive"
      });
    } else {
      toast({
        title: "Success",
        description: "Service saved successfully"
      });
      fetchServices();
      setEditingService(null);
    }
  };

  const saveYouTubeVideo = async (video: YouTubeVideo) => {
    const { error } = await supabase
      .from('youtube_videos')
      .update({
        video_id: video.video_id,
        title: video.title,
        description: video.description,
        thumbnail_url: video.thumbnail_url,
        video_url: video.video_url,
        video_type: video.video_type,
        is_featured: video.is_featured,
        is_active: video.is_active,
        display_order: video.display_order
      })
      .eq('id', video.id);
    
    if (error) {
      toast({
        title: "Error",
        description: "Failed to save video",
        variant: "destructive"
      });
    } else {
      toast({
        title: "Success",
        description: "Video saved successfully"
      });
      fetchYouTubeVideos();
      setEditingVideo(null);
    }
  };

  const extractVideoId = (url: string): string => {
    const match = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([^&\n?#]+)/);
    return match ? match[1] : '';
  };

  return (
    <div className="space-y-6">
      <h2 className="text-3xl font-bold">Website Content Management</h2>
      
      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        {/* Hide default TabsList */}
        <TabsList className="sr-only">
          {navigationItems.map((item) => (
            <TabsTrigger key={item.value} value={item.value}>
              {item.label}
            </TabsTrigger>
          ))}
        </TabsList>

        <div className="space-y-6">
          {/* Mobile: Dropdown Navigation */}
          <div className="lg:hidden">
            <Select value={activeTab} onValueChange={setActiveTab}>
              <SelectTrigger className="w-full">
                <SelectValue>
                  {navigationItems.find(item => item.value === activeTab)?.label}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                {navigationItems.map((item) => (
                  <SelectItem key={item.value} value={item.value}>
                    <div className="flex items-center gap-2">
                      <item.icon className="w-4 h-4" />
                      {item.label}
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Desktop: Sidebar Navigation + Content */}
          <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
            {/* Desktop Sidebar */}
            <div className="hidden lg:block">
              <Card className="glass-card">
                <CardContent className="p-4">
                  <nav className="space-y-1">
                    {navigationItems.map((item) => (
                      <button
                        key={item.value}
                        onClick={() => setActiveTab(item.value)}
                        className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all ${
                          activeTab === item.value
                            ? 'bg-primary text-primary-foreground shadow-sm'
                            : 'hover:bg-muted/50 text-foreground'
                        }`}
                      >
                        <item.icon className="w-4 h-4 flex-shrink-0" />
                        <span className="truncate text-left">{item.label}</span>
                      </button>
                    ))}
                  </nav>
                </CardContent>
              </Card>
            </div>

            {/* Content Area (shared by both mobile and desktop) */}
            <div className="lg:col-span-3">

        {/* Site Branding Tab */}
        <TabsContent value="branding">
          <Card className="glass-card">
            <CardHeader>
              <CardTitle>Site Branding Configuration</CardTitle>
              <CardDescription>
                Customize your website logo, name, and tagline that appears in the header
              </CardDescription>
            </CardHeader>
            <CardContent>
              {websiteContent.filter(c => c.section_key === 'site_branding').map((content) => (
                <div key={content.id} className="space-y-6">
                  <div className="space-y-4">
                    <div>
                      <label className="text-sm font-medium">Website Name</label>
                      <Input
                        value={editingContent?.id === content.id ? editingContent.title || '' : content.title || ''}
                        onChange={(e) => setEditingContent({
                          ...content,
                          title: e.target.value
                        })}
                        placeholder="e.g., Fly Masters"
                        className="mt-1.5"
                      />
                      <p className="text-xs text-muted-foreground mt-1">This appears as the main site name in the header</p>
                    </div>

                    <div>
                      <label className="text-sm font-medium">Tagline/Description</label>
                      <Input
                        value={editingContent?.id === content.id ? editingContent.subtitle || '' : content.subtitle || ''}
                        onChange={(e) => setEditingContent({
                          ...content,
                          subtitle: e.target.value
                        })}
                        placeholder="e.g., AI based University & Course selection platform"
                        className="mt-1.5"
                      />
                      <p className="text-xs text-muted-foreground mt-1">This appears below the site name</p>
                    </div>

                    <div>
                      <label className="text-sm font-medium">Logo URL</label>
                      <Input
                        value={editingContent?.id === content.id ? editingContent.image_url || '' : content.image_url || ''}
                        onChange={(e) => setEditingContent({
                          ...content,
                          image_url: e.target.value
                        })}
                        placeholder="e.g., /icon-192.png or https://..."
                        className="mt-1.5"
                      />
                      <p className="text-xs text-muted-foreground mt-1">Provide a URL to your logo image (recommended size: 40x40px)</p>
                    </div>

                    {(editingContent?.id === content.id && editingContent.image_url) && (
                      <div className="flex items-center gap-3 p-4 border rounded-lg bg-muted/50">
                        <span className="text-sm font-medium">Preview:</span>
                        <img 
                          src={editingContent.image_url} 
                          alt="Logo preview"
                          className="w-10 h-10 rounded-full object-cover"
                          onError={(e) => {
                            e.currentTarget.src = '/icon-192.png';
                          }}
                        />
                        <div>
                          <p className="font-bold">{editingContent.title}</p>
                          <p className="text-xs text-muted-foreground">{editingContent.subtitle}</p>
                        </div>
                      </div>
                    )}
                  </div>

                  <div className="flex justify-end gap-2 pt-4 border-t">
                    {editingContent?.id === content.id ? (
                      <>
                        <Button
                          variant="outline"
                          onClick={() => setEditingContent(null)}
                        >
                          Cancel
                        </Button>
                        <Button
                          onClick={() => saveWebsiteContent(editingContent)}
                        >
                          <Save className="w-4 h-4 mr-2" />
                          Save Changes
                        </Button>
                      </>
                    ) : (
                      <Button
                        onClick={() => setEditingContent(content)}
                      >
                        <Edit3 className="w-4 h-4 mr-2" />
                        Edit Branding
                      </Button>
                    )}
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Website Content Tab */}
        <TabsContent value="content">
          <div className="grid gap-6">
            {websiteContent.map((content) => (
              <Card key={content.id} className="glass-card">
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <div>
                      <CardTitle className="flex items-center gap-2">
                        {content.section_key}
                        {!content.is_active && <Badge variant="secondary">Inactive</Badge>}
                      </CardTitle>
                      <CardDescription>{content.title}</CardDescription>
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setEditingContent(content)}
                    >
                      <Edit3 className="w-4 h-4" />
                    </Button>
                  </div>
                </CardHeader>
                {editingContent?.id === content.id && (
                  <CardContent className="space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="text-sm font-medium">Title</label>
                        <Input
                          value={editingContent.title || ''}
                          onChange={(e) => setEditingContent({
                            ...editingContent,
                            title: e.target.value
                          })}
                        />
                      </div>
                      <div>
                        <label className="text-sm font-medium">Subtitle</label>
                        <Input
                          value={editingContent.subtitle || ''}
                          onChange={(e) => setEditingContent({
                            ...editingContent,
                            subtitle: e.target.value
                          })}
                        />
                      </div>
                    </div>
                    
                    <div>
                      <label className="text-sm font-medium">Content</label>
                      <Textarea
                        value={editingContent.content || ''}
                        onChange={(e) => setEditingContent({
                          ...editingContent,
                          content: e.target.value
                        })}
                        rows={4}
                      />
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="text-sm font-medium">CTA Text</label>
                        <Input
                          value={editingContent.cta_text || ''}
                          onChange={(e) => setEditingContent({
                            ...editingContent,
                            cta_text: e.target.value
                          })}
                        />
                      </div>
                      <div>
                        <label className="text-sm font-medium">CTA Link</label>
                        <Input
                          value={editingContent.cta_link || ''}
                          onChange={(e) => setEditingContent({
                            ...editingContent,
                            cta_link: e.target.value
                          })}
                        />
                      </div>
                    </div>

                    <div className="flex items-center justify-between">
                      <div className="flex items-center space-x-2">
                        <Switch
                          checked={editingContent.is_active}
                          onCheckedChange={(checked) => setEditingContent({
                            ...editingContent,
                            is_active: checked
                          })}
                        />
                        <label className="text-sm font-medium">Active</label>
                      </div>
                      
                      <div className="flex gap-2">
                        <Button
                          variant="outline"
                          onClick={() => setEditingContent(null)}
                        >
                          Cancel
                        </Button>
                        <Button
                          onClick={() => saveWebsiteContent(editingContent)}
                        >
                          <Save className="w-4 h-4 mr-2" />
                          Save
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                )}
              </Card>
            ))}
          </div>
        </TabsContent>

        {/* Testimonials Tab */}
        <TabsContent value="testimonials">
          <div className="grid gap-6">
            {testimonials.map((testimonial) => (
              <Card key={testimonial.id} className="glass-card">
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <div>
                      <CardTitle className="flex items-center gap-2">
                        {testimonial.student_name}
                        {testimonial.is_featured && <Badge>Featured</Badge>}
                        {!testimonial.is_active && <Badge variant="secondary">Inactive</Badge>}
                      </CardTitle>
                      <CardDescription>
                        {testimonial.university}, {testimonial.country}
                      </CardDescription>
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setEditingTestimonial(testimonial)}
                    >
                      <Edit3 className="w-4 h-4" />
                    </Button>
                  </div>
                </CardHeader>
                {editingTestimonial?.id === testimonial.id && (
                  <CardContent className="space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="text-sm font-medium">Student Name</label>
                        <Input
                          value={editingTestimonial.student_name}
                          onChange={(e) => setEditingTestimonial({
                            ...editingTestimonial,
                            student_name: e.target.value
                          })}
                        />
                      </div>
                      <div>
                        <label className="text-sm font-medium">University</label>
                        <Input
                          value={editingTestimonial.university}
                          onChange={(e) => setEditingTestimonial({
                            ...editingTestimonial,
                            university: e.target.value
                          })}
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-3 gap-4">
                      <div>
                        <label className="text-sm font-medium">Country</label>
                        <Input
                          value={editingTestimonial.country}
                          onChange={(e) => setEditingTestimonial({
                            ...editingTestimonial,
                            country: e.target.value
                          })}
                        />
                      </div>
                      <div>
                        <label className="text-sm font-medium">Course</label>
                        <Input
                          value={editingTestimonial.course || ''}
                          onChange={(e) => setEditingTestimonial({
                            ...editingTestimonial,
                            course: e.target.value
                          })}
                        />
                      </div>
                      <div>
                        <label className="text-sm font-medium">Rating</label>
                        <Input
                          type="number"
                          min="1"
                          max="5"
                          value={editingTestimonial.rating}
                          onChange={(e) => setEditingTestimonial({
                            ...editingTestimonial,
                            rating: parseInt(e.target.value)
                          })}
                        />
                      </div>
                    </div>

                    <div>
                      <label className="text-sm font-medium">Testimonial</label>
                      <Textarea
                        value={editingTestimonial.testimonial}
                        onChange={(e) => setEditingTestimonial({
                          ...editingTestimonial,
                          testimonial: e.target.value
                        })}
                        rows={4}
                      />
                    </div>

                    <div className="flex items-center justify-between">
                      <div className="flex items-center space-x-4">
                        <div className="flex items-center space-x-2">
                          <Switch
                            checked={editingTestimonial.is_featured}
                            onCheckedChange={(checked) => setEditingTestimonial({
                              ...editingTestimonial,
                              is_featured: checked
                            })}
                          />
                          <label className="text-sm font-medium">Featured</label>
                        </div>
                        <div className="flex items-center space-x-2">
                          <Switch
                            checked={editingTestimonial.is_active}
                            onCheckedChange={(checked) => setEditingTestimonial({
                              ...editingTestimonial,
                              is_active: checked
                            })}
                          />
                          <label className="text-sm font-medium">Active</label>
                        </div>
                      </div>
                      
                      <div className="flex gap-2">
                        <Button
                          variant="outline"
                          onClick={() => setEditingTestimonial(null)}
                        >
                          Cancel
                        </Button>
                        <Button
                          onClick={() => saveTestimonial(editingTestimonial)}
                        >
                          <Save className="w-4 h-4 mr-2" />
                          Save
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                )}
              </Card>
            ))}
          </div>
        </TabsContent>

        {/* Services Tab */}
        <TabsContent value="services">
          <div className="grid gap-6">
            {services.map((service) => (
              <Card key={service.id} className="glass-card">
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <div>
                      <CardTitle className="flex items-center gap-2">
                        {service.service_name}
                        {service.is_popular && <Badge>Popular</Badge>}
                        {!service.is_active && <Badge variant="secondary">Inactive</Badge>}
                      </CardTitle>
                      <CardDescription>{service.description}</CardDescription>
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setEditingService(service)}
                    >
                      <Edit3 className="w-4 h-4" />
                    </Button>
                  </div>
                </CardHeader>
                {editingService?.id === service.id && (
                  <CardContent className="space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="text-sm font-medium">Service Name</label>
                        <Input
                          value={editingService.service_name}
                          onChange={(e) => setEditingService({
                            ...editingService,
                            service_name: e.target.value
                          })}
                        />
                      </div>
                      <div>
                        <label className="text-sm font-medium">Icon Name</label>
                        <Input
                          value={editingService.icon_name}
                          onChange={(e) => setEditingService({
                            ...editingService,
                            icon_name: e.target.value
                          })}
                        />
                      </div>
                    </div>

                    <div>
                      <label className="text-sm font-medium">Description</label>
                      <Textarea
                        value={editingService.description}
                        onChange={(e) => setEditingService({
                          ...editingService,
                          description: e.target.value
                        })}
                        rows={3}
                      />
                    </div>

                    <div>
                      <label className="text-sm font-medium">Features (comma-separated)</label>
                      <Textarea
                        value={editingService.features.join(', ')}
                        onChange={(e) => setEditingService({
                          ...editingService,
                          features: e.target.value.split(',').map(f => f.trim())
                        })}
                        rows={3}
                      />
                    </div>

                    <div className="flex items-center justify-between">
                      <div className="flex items-center space-x-4">
                        <div className="flex items-center space-x-2">
                          <Switch
                            checked={editingService.is_popular}
                            onCheckedChange={(checked) => setEditingService({
                              ...editingService,
                              is_popular: checked
                            })}
                          />
                          <label className="text-sm font-medium">Popular</label>
                        </div>
                        <div className="flex items-center space-x-2">
                          <Switch
                            checked={editingService.is_active}
                            onCheckedChange={(checked) => setEditingService({
                              ...editingService,
                              is_active: checked
                            })}
                          />
                          <label className="text-sm font-medium">Active</label>
                        </div>
                      </div>
                      
                      <div className="flex gap-2">
                        <Button
                          variant="outline"
                          onClick={() => setEditingService(null)}
                        >
                          Cancel
                        </Button>
                        <Button
                          onClick={() => saveService(editingService)}
                        >
                          <Save className="w-4 h-4 mr-2" />
                          Save
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                )}
              </Card>
            ))}
          </div>
        </TabsContent>

        {/* YouTube Videos Tab */}
        <TabsContent value="youtube">
          <div className="space-y-4 mb-6">
            <Button
              onClick={() => {
                const newVideo: YouTubeVideo = {
                  id: '',
                  video_id: '',
                  title: '',
                  description: '',
                  thumbnail_url: '',
                  video_url: '',
                  video_type: 'testimonial',
                  is_featured: false,
                  is_active: true,
                  display_order: youtubeVideos.length
                };
                setEditingVideo(newVideo);
              }}
              className="flex items-center gap-2"
            >
              <Plus className="w-4 h-4" />
              Add New Video
            </Button>
          </div>

          <div className="grid gap-6">
            {youtubeVideos.map((video) => (
              <Card key={video.id} className="glass-card">
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-4">
                      {video.thumbnail_url && (
                        <img 
                          src={video.thumbnail_url} 
                          alt={video.title}
                          className="w-24 h-16 object-cover rounded"
                        />
                      )}
                      <div>
                        <CardTitle className="flex items-center gap-2">
                          {video.title}
                          {video.is_featured && <Badge>Featured</Badge>}
                          {!video.is_active && <Badge variant="secondary">Inactive</Badge>}
                        </CardTitle>
                        <CardDescription>
                          {video.video_type} • {video.video_id}
                        </CardDescription>
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => window.open(video.video_url, '_blank')}
                      >
                        <ExternalLink className="w-4 h-4" />
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setEditingVideo(video)}
                      >
                        <Edit3 className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                </CardHeader>
                {editingVideo?.id === video.id && (
                  <CardContent className="space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="text-sm font-medium">Title</label>
                        <Input
                          value={editingVideo.title}
                          onChange={(e) => setEditingVideo({
                            ...editingVideo,
                            title: e.target.value
                          })}
                        />
                      </div>
                      <div>
                        <label className="text-sm font-medium">Video URL</label>
                        <Input
                          value={editingVideo.video_url}
                          onChange={(e) => {
                            const url = e.target.value;
                            const videoId = extractVideoId(url);
                            setEditingVideo({
                              ...editingVideo,
                              video_url: url,
                              video_id: videoId,
                              thumbnail_url: videoId ? `https://img.youtube.com/vi/${videoId}/maxresdefault.jpg` : ''
                            });
                          }}
                          placeholder="https://youtube.com/watch?v=..."
                        />
                      </div>
                    </div>

                    <div>
                      <label className="text-sm font-medium">Description</label>
                      <Textarea
                        value={editingVideo.description || ''}
                        onChange={(e) => setEditingVideo({
                          ...editingVideo,
                          description: e.target.value
                        })}
                        rows={3}
                      />
                    </div>

                    <div className="grid grid-cols-3 gap-4">
                      <div>
                        <label className="text-sm font-medium">Video Type</label>
                        <select
                          className="w-full h-10 px-3 py-2 text-sm bg-background border border-input rounded-md"
                          value={editingVideo.video_type}
                          onChange={(e) => setEditingVideo({
                            ...editingVideo,
                            video_type: e.target.value
                          })}
                        >
                          <option value="testimonial">Testimonial</option>
                          <option value="promotional">Promotional</option>
                          <option value="educational">Educational</option>
                        </select>
                      </div>
                      <div>
                        <label className="text-sm font-medium">Display Order</label>
                        <Input
                          type="number"
                          min="0"
                          value={editingVideo.display_order}
                          onChange={(e) => setEditingVideo({
                            ...editingVideo,
                            display_order: parseInt(e.target.value) || 0
                          })}
                        />
                      </div>
                      <div>
                        <label className="text-sm font-medium">Thumbnail URL (Auto)</label>
                        <Input
                          value={editingVideo.thumbnail_url || ''}
                          onChange={(e) => setEditingVideo({
                            ...editingVideo,
                            thumbnail_url: e.target.value
                          })}
                          placeholder="Auto-generated from video ID"
                        />
                      </div>
                    </div>

                    <div className="flex items-center justify-between">
                      <div className="flex items-center space-x-4">
                        <div className="flex items-center space-x-2">
                          <Switch
                            checked={editingVideo.is_featured}
                            onCheckedChange={(checked) => setEditingVideo({
                              ...editingVideo,
                              is_featured: checked
                            })}
                          />
                          <label className="text-sm font-medium">Featured</label>
                        </div>
                        <div className="flex items-center space-x-2">
                          <Switch
                            checked={editingVideo.is_active}
                            onCheckedChange={(checked) => setEditingVideo({
                              ...editingVideo,
                              is_active: checked
                            })}
                          />
                          <label className="text-sm font-medium">Active</label>
                        </div>
                      </div>
                      
                      <div className="flex gap-2">
                        <Button
                          variant="outline"
                          onClick={() => setEditingVideo(null)}
                        >
                          Cancel
                        </Button>
                        <Button
                          onClick={() => {
                            if (editingVideo.id) {
                              saveYouTubeVideo(editingVideo);
                            } else {
                              // Create new video
                              supabase
                                .from('youtube_videos')
                                .insert([{
                                  video_id: editingVideo.video_id,
                                  title: editingVideo.title,
                                  description: editingVideo.description,
                                  thumbnail_url: editingVideo.thumbnail_url,
                                  video_url: editingVideo.video_url,
                                  video_type: editingVideo.video_type,
                                  is_featured: editingVideo.is_featured,
                                  is_active: editingVideo.is_active,
                                  display_order: editingVideo.display_order
                                }])
                                .then(({ error }) => {
                                  if (error) {
                                    toast({
                                      title: "Error",
                                      description: "Failed to create video",
                                      variant: "destructive"
                                    });
                                  } else {
                                    toast({
                                      title: "Success",
                                      description: "Video created successfully"
                                    });
                                    fetchYouTubeVideos();
                                    setEditingVideo(null);
                                  }
                                });
                            }
                          }}
                        >
                          <Save className="w-4 h-4 mr-2" />
                          Save
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                )}
              </Card>
            ))}
          </div>
        </TabsContent>

        {/* Video Testimonials Tab */}
        <TabsContent value="video-testimonials">
          <VideoTestimonialsAdmin />
        </TabsContent>

        {/* Student Gallery Tab */}
        <TabsContent value="gallery">
          <GalleryAdmin />
        </TabsContent>

        {/* Founders Tab */}
        <TabsContent value="founders">
          <FoundersAdmin />
        </TabsContent>

        {/* Social Media Tab */}
        <TabsContent value="social-media">
          <SocialMediaAdmin />
        </TabsContent>

        {/* WhatsApp Tab */}
        <TabsContent value="whatsapp">
          <WhatsAppAdmin />
        </TabsContent>
            </div>
          </div>
        </div>
      </Tabs>
    </div>
  );
};

export default WebsiteContentAdmin;