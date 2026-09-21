import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@student/components/ui/card';
import { Button } from '@student/components/ui/button';
import { Input } from '@student/components/ui/input';
import { Label } from '@student/components/ui/label';
import { Textarea } from '@student/components/ui/textarea';
import { Switch } from '@student/components/ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@student/components/ui/tabs';
import { Badge } from '@student/components/ui/badge';
import { Separator } from '@student/components/ui/separator';
import { supabase } from '@student/integrations/supabase/client';
import { toast } from 'sonner';
import { Globe, Plus, Save, Trash2, Eye, EyeOff, Upload, Video, Users, Award } from 'lucide-react';
import { MediaUploader } from './MediaUploader';

export function CountriesAdmin() {
  const [countries, setCountries] = useState<any[]>([]);
  const [selectedCountry, setSelectedCountry] = useState<any>(null);
  const [content, setContent] = useState<any>({});
  const [highlights, setHighlights] = useState<any[]>([]);
  const [courses, setCourses] = useState<any[]>([]);
  const [industries, setIndustries] = useState<any[]>([]);
  const [testimonials, setTestimonials] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    fetchCountries();
  }, []);

  useEffect(() => {
    if (selectedCountry) {
      fetchCountryData();
    }
  }, [selectedCountry]);

  const fetchCountries = async () => {
    try {
      const { data, error } = await supabase
        .from('countries')
        .select('*')
        .order('display_order');
      
      if (error) throw error;
      setCountries(data || []);
      if (data && data.length > 0 && !selectedCountry) {
        setSelectedCountry(data[0]);
      }
    } catch (error: any) {
      toast.error('Failed to fetch countries');
      console.error(error);
    }
  };

  const fetchCountryData = async () => {
    if (!selectedCountry?.id) return;

    try {
      setLoading(true);

      // Fetch content
      const { data: contentData } = await supabase
        .from('country_content')
        .select('*')
        .eq('country_id', selectedCountry.id)
        .single();
      setContent(contentData || {});

      // Fetch highlights
      const { data: highlightsData } = await supabase
        .from('country_highlights')
        .select('*')
        .eq('country_id', selectedCountry.id)
        .order('display_order');
      setHighlights(highlightsData || []);

      // Fetch courses
      const { data: coursesData } = await supabase
        .from('country_courses')
        .select('*')
        .eq('country_id', selectedCountry.id)
        .order('display_order');
      setCourses(coursesData || []);

      // Fetch industries
      const { data: industriesData } = await supabase
        .from('country_industries')
        .select('*')
        .eq('country_id', selectedCountry.id)
        .order('display_order');
      setIndustries(industriesData || []);

      // Fetch testimonials
      const { data: testimonialsData } = await supabase
        .from('country_testimonials')
        .select('*')
        .eq('country_id', selectedCountry.id)
        .order('display_order');
      setTestimonials(testimonialsData || []);

    } catch (error: any) {
      console.error('Error fetching country data:', error);
    } finally {
      setLoading(false);
    }
  };

  const saveCountry = async () => {
    if (!selectedCountry?.id) return;

    try {
      setLoading(true);

      const { error } = await supabase
        .from('countries')
        .update({
          name: selectedCountry.name,
          slug: selectedCountry.slug,
          flag_emoji: selectedCountry.flag_emoji,
          is_active: selectedCountry.is_active,
          display_order: selectedCountry.display_order
        })
        .eq('id', selectedCountry.id);

      if (error) throw error;
      toast.success('Country updated successfully');
      fetchCountries();
    } catch (error: any) {
      toast.error('Failed to update country');
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  const saveContent = async () => {
    if (!selectedCountry?.id) return;

    try {
      setLoading(true);

      const { error } = await supabase
        .from('country_content')
        .upsert({
          country_id: selectedCountry.id,
          ...content
        });

      if (error) throw error;
      toast.success('Content saved successfully');
    } catch (error: any) {
      toast.error('Failed to save content');
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  const addHighlight = async () => {
    if (!selectedCountry?.id) return;

    try {
      const { error } = await supabase
        .from('country_highlights')
        .insert({
          country_id: selectedCountry.id,
          highlight_text: 'New Highlight',
          display_order: highlights.length
        });

      if (error) throw error;
      toast.success('Highlight added');
      fetchCountryData();
    } catch (error: any) {
      toast.error('Failed to add highlight');
      console.error(error);
    }
  };

  const updateHighlight = async (id: string, text: string) => {
    try {
      const { error } = await supabase
        .from('country_highlights')
        .update({ highlight_text: text })
        .eq('id', id);

      if (error) throw error;
    } catch (error: any) {
      toast.error('Failed to update highlight');
      console.error(error);
    }
  };

  const deleteHighlight = async (id: string) => {
    try {
      const { error } = await supabase
        .from('country_highlights')
        .delete()
        .eq('id', id);

      if (error) throw error;
      toast.success('Highlight deleted');
      fetchCountryData();
    } catch (error: any) {
      toast.error('Failed to delete highlight');
      console.error(error);
    }
  };

  const addCourse = async () => {
    if (!selectedCountry?.id) return;

    try {
      const { error } = await supabase
        .from('country_courses')
        .insert({
          country_id: selectedCountry.id,
          course_name: 'New Course',
          is_popular: false,
          display_order: courses.length
        });

      if (error) throw error;
      toast.success('Course added');
      fetchCountryData();
    } catch (error: any) {
      toast.error('Failed to add course');
      console.error(error);
    }
  };

  const addTestimonial = async () => {
    if (!selectedCountry?.id) return;

    try {
      const { error } = await supabase
        .from('country_testimonials')
        .insert({
          country_id: selectedCountry.id,
          student_name: 'Student Name',
          testimonial_text: 'Testimonial text here...',
          display_order: testimonials.length
        });

      if (error) throw error;
      toast.success('Testimonial added');
      fetchCountryData();
    } catch (error: any) {
      toast.error('Failed to add testimonial');
      console.error(error);
    }
  };

  const addNewCountry = async () => {
    try {
      const { error } = await supabase
        .from('countries')
        .insert({
          name: 'New Country',
          slug: 'new-country',
          flag_emoji: '🌍',
          is_active: false,
          display_order: countries.length
        });

      if (error) throw error;
      toast.success('Country added successfully');
      fetchCountries();
    } catch (error: any) {
      toast.error('Failed to add country');
      console.error(error);
    }
  };

  const deleteCourse = async (id: string) => {
    try {
      const { error } = await supabase
        .from('country_courses')
        .delete()
        .eq('id', id);

      if (error) throw error;
      toast.success('Course deleted');
      fetchCountryData();
    } catch (error: any) {
      toast.error('Failed to delete course');
      console.error(error);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-3xl font-bold flex items-center gap-2">
            <Globe className="w-8 h-8" />
            Study Destinations Management
          </h2>
          <p className="text-muted-foreground">Manage country pages, content, and testimonials</p>
        </div>
        <Button onClick={addNewCountry} size="lg">
          <Plus className="w-4 h-4 mr-2" />
          Add New Country
        </Button>
      </div>

      {/* Country Selection */}
      <Card>
        <CardHeader>
          <CardTitle>Select Country</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-2">
            {countries.map((country) => (
              <Button
                key={country.id}
                variant={selectedCountry?.id === country.id ? "default" : "outline"}
                onClick={() => setSelectedCountry(country)}
                className="gap-2"
              >
                <span className="text-lg">{country.flag_emoji}</span>
                {country.name}
                {!country.is_active && <EyeOff className="w-4 h-4" />}
              </Button>
            ))}
          </div>
        </CardContent>
      </Card>

      {selectedCountry && (
        <Tabs defaultValue="basic" className="space-y-4">
          <TabsList className="grid w-full grid-cols-6">
            <TabsTrigger value="basic">Basic Info</TabsTrigger>
            <TabsTrigger value="content">Content</TabsTrigger>
            <TabsTrigger value="highlights">Highlights</TabsTrigger>
            <TabsTrigger value="courses">Courses</TabsTrigger>
            <TabsTrigger value="industries">Industries</TabsTrigger>
            <TabsTrigger value="testimonials">Testimonials</TabsTrigger>
          </TabsList>

          {/* Basic Info Tab */}
          <TabsContent value="basic">
            <Card>
              <CardHeader>
                <CardTitle>Basic Information</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <Label>Country Name</Label>
                  <Input
                    value={selectedCountry.name}
                    onChange={(e) => setSelectedCountry({...selectedCountry, name: e.target.value})}
                  />
                </div>
                <div>
                  <Label>URL Slug</Label>
                  <Input
                    value={selectedCountry.slug}
                    onChange={(e) => setSelectedCountry({...selectedCountry, slug: e.target.value})}
                  />
                </div>
                <div>
                  <Label>Flag Emoji</Label>
                  <Input
                    value={selectedCountry.flag_emoji}
                    onChange={(e) => setSelectedCountry({...selectedCountry, flag_emoji: e.target.value})}
                  />
                </div>
                <div>
                  <Label>Display Order</Label>
                  <Input
                    type="number"
                    value={selectedCountry.display_order}
                    onChange={(e) => setSelectedCountry({...selectedCountry, display_order: parseInt(e.target.value)})}
                  />
                </div>
                <div className="flex items-center gap-2">
                  <Switch
                    checked={selectedCountry.is_active}
                    onCheckedChange={(checked) => setSelectedCountry({...selectedCountry, is_active: checked})}
                  />
                  <Label>Active (Visible on website)</Label>
                </div>
                <Button onClick={saveCountry} disabled={loading}>
                  <Save className="w-4 h-4 mr-2" />
                  Save Basic Info
                </Button>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Content Tab */}
          <TabsContent value="content">
            <Card>
              <CardHeader>
                <CardTitle>Page Content</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <Label>Description</Label>
                  <Textarea
                    value={content.description || ''}
                    onChange={(e) => setContent({...content, description: e.target.value})}
                    rows={3}
                  />
                </div>
                <div>
                  <Label>Why Study Here</Label>
                  <Textarea
                    value={content.why_study_here || ''}
                    onChange={(e) => setContent({...content, why_study_here: e.target.value})}
                    rows={4}
                  />
                </div>
                
                <Separator />
                
                <div className="grid md:grid-cols-2 gap-4">
                  <div>
                    <Label>Total Universities</Label>
                    <Input
                      value={content.total_universities || ''}
                      onChange={(e) => setContent({...content, total_universities: e.target.value})}
                      placeholder="e.g., 4,000+"
                    />
                  </div>
                  <div>
                    <Label>Average Fees</Label>
                    <Input
                      value={content.average_fees || ''}
                      onChange={(e) => setContent({...content, average_fees: e.target.value})}
                      placeholder="e.g., $25,000-$55,000"
                    />
                  </div>
                  <div>
                    <Label>Study Duration</Label>
                    <Input
                      value={content.study_duration || ''}
                      onChange={(e) => setContent({...content, study_duration: e.target.value})}
                      placeholder="e.g., 1-2 years"
                    />
                  </div>
                  <div>
                    <Label>Work Permit Duration</Label>
                    <Input
                      value={content.work_permit_duration || ''}
                      onChange={(e) => setContent({...content, work_permit_duration: e.target.value})}
                      placeholder="e.g., 3 years STEM OPT"
                    />
                  </div>
                  <div>
                    <Label>PSW Period</Label>
                    <Input
                      value={content.psw_period || ''}
                      onChange={(e) => setContent({...content, psw_period: e.target.value})}
                    />
                  </div>
                  <div>
                    <Label>Part-time Work Hours</Label>
                    <Input
                      value={content.part_time_work_hours || ''}
                      onChange={(e) => setContent({...content, part_time_work_hours: e.target.value})}
                      placeholder="e.g., 20 hours/week"
                    />
                  </div>
                </div>

                <Separator />

                <div className="grid md:grid-cols-2 gap-4">
                  <div>
                    <Label>Capital</Label>
                    <Input
                      value={content.capital || ''}
                      onChange={(e) => setContent({...content, capital: e.target.value})}
                    />
                  </div>
                  <div>
                    <Label>Area</Label>
                    <Input
                      value={content.area || ''}
                      onChange={(e) => setContent({...content, area: e.target.value})}
                      placeholder="e.g., 9.8 million km²"
                    />
                  </div>
                  <div>
                    <Label>English Speaking %</Label>
                    <Input
                      value={content.english_speaking_percentage || ''}
                      onChange={(e) => setContent({...content, english_speaking_percentage: e.target.value})}
                      placeholder="e.g., 95%"
                    />
                  </div>
                  <div>
                    <Label>Indian Student Population</Label>
                    <Input
                      value={content.indian_student_population || ''}
                      onChange={(e) => setContent({...content, indian_student_population: e.target.value})}
                      placeholder="e.g., 200,000+"
                    />
                  </div>
                </div>

                <Separator />

                <Separator />

                <div>
                  <Label className="mb-2 block">Hero Image</Label>
                  <MediaUploader
                    onUploadComplete={(url) => setContent({...content, hero_image_url: url})}
                    acceptedFileTypes="image/*"
                    maxSizeMB={5}
                  />
                  {content.hero_image_url && (
                    <div className="mt-2">
                      <img 
                        src={content.hero_image_url} 
                        alt="Hero" 
                        className="max-h-40 rounded-lg object-cover"
                      />
                      <p className="text-xs text-muted-foreground mt-1">Current hero image</p>
                    </div>
                  )}
                </div>

                <div>
                  <Label>Video URL (YouTube embed)</Label>
                  <Input
                    value={content.video_url || ''}
                    onChange={(e) => setContent({...content, video_url: e.target.value})}
                    placeholder="https://www.youtube.com/embed/..."
                  />
                  <p className="text-xs text-muted-foreground mt-1">
                    Paste YouTube embed URL (not watch URL)
                  </p>
                </div>

                <Button onClick={saveContent} disabled={loading}>
                  <Save className="w-4 h-4 mr-2" />
                  Save Content
                </Button>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Highlights Tab */}
          <TabsContent value="highlights">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center justify-between">
                  <span>Key Highlights</span>
                  <Button onClick={addHighlight} size="sm">
                    <Plus className="w-4 h-4 mr-2" />
                    Add Highlight
                  </Button>
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {highlights.map((highlight) => (
                  <div key={highlight.id} className="flex items-center gap-2">
                    <Input
                      value={highlight.highlight_text}
                      onChange={(e) => updateHighlight(highlight.id, e.target.value)}
                      onBlur={() => toast.success('Highlight updated')}
                    />
                    <Button
                      variant="destructive"
                      size="icon"
                      onClick={() => deleteHighlight(highlight.id)}
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                ))}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Courses Tab */}
          <TabsContent value="courses">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center justify-between">
                  <span>Popular Courses</span>
                  <Button onClick={addCourse} size="sm">
                    <Plus className="w-4 h-4 mr-2" />
                    Add Course
                  </Button>
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {courses.map((course) => (
                  <Card key={course.id}>
                    <CardContent className="p-4">
                      <div className="flex items-center gap-2">
                        <Input
                          value={course.course_name}
                          onChange={async (e) => {
                            const { error } = await supabase
                              .from('country_courses')
                              .update({ course_name: e.target.value })
                              .eq('id', course.id);
                            if (!error) fetchCountryData();
                          }}
                        />
                        <Button
                          variant="destructive"
                          size="icon"
                          onClick={() => deleteCourse(course.id)}
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                      <div className="flex items-center gap-2 mt-2">
                        <Switch
                          checked={course.is_popular}
                          onCheckedChange={async (checked) => {
                            const { error } = await supabase
                              .from('country_courses')
                              .update({ is_popular: checked })
                              .eq('id', course.id);
                            if (!error) fetchCountryData();
                          }}
                        />
                        <Label>Popular</Label>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Industries Tab */}
          <TabsContent value="industries">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center justify-between">
                  <span>Popular Industries</span>
                  <Button onClick={async () => {
                    const { error } = await supabase
                      .from('country_industries')
                      .insert({
                        country_id: selectedCountry.id,
                        industry_name: 'New Industry',
                        display_order: industries.length
                      });
                    if (!error) {
                      toast.success('Industry added');
                      fetchCountryData();
                    }
                  }} size="sm">
                    <Plus className="w-4 h-4 mr-2" />
                    Add Industry
                  </Button>
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {industries.map((industry) => (
                  <div key={industry.id} className="flex items-center gap-2">
                    <Input
                      value={industry.industry_name}
                      onChange={async (e) => {
                        const { error } = await supabase
                          .from('country_industries')
                          .update({ industry_name: e.target.value })
                          .eq('id', industry.id);
                        if (!error) fetchCountryData();
                      }}
                    />
                    <Button
                      variant="destructive"
                      size="icon"
                      onClick={async () => {
                        const { error } = await supabase
                          .from('country_industries')
                          .delete()
                          .eq('id', industry.id);
                        if (!error) {
                          toast.success('Industry deleted');
                          fetchCountryData();
                        }
                      }}
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                ))}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Testimonials Tab */}
          <TabsContent value="testimonials">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center justify-between">
                  <span>Student Testimonials</span>
                  <Button onClick={addTestimonial} size="sm">
                    <Plus className="w-4 h-4 mr-2" />
                    Add Testimonial
                  </Button>
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {testimonials.map((testimonial) => (
                  <Card key={testimonial.id}>
                    <CardContent className="p-4 space-y-3">
                      <Input
                        placeholder="Student Name"
                        value={testimonial.student_name}
                        onChange={async (e) => {
                          const { error } = await supabase
                            .from('country_testimonials')
                            .update({ student_name: e.target.value })
                            .eq('id', testimonial.id);
                          if (!error) fetchCountryData();
                        }}
                      />
                      <Input
                        placeholder="University"
                        value={testimonial.university || ''}
                        onChange={async (e) => {
                          const { error } = await supabase
                            .from('country_testimonials')
                            .update({ university: e.target.value })
                            .eq('id', testimonial.id);
                          if (!error) fetchCountryData();
                        }}
                      />
                      <Input
                        placeholder="Course"
                        value={testimonial.course || ''}
                        onChange={async (e) => {
                          const { error } = await supabase
                            .from('country_testimonials')
                            .update({ course: e.target.value })
                            .eq('id', testimonial.id);
                          if (!error) fetchCountryData();
                        }}
                      />
                      <Textarea
                        placeholder="Testimonial text"
                        value={testimonial.testimonial_text}
                        onChange={async (e) => {
                          const { error } = await supabase
                            .from('country_testimonials')
                            .update({ testimonial_text: e.target.value })
                            .eq('id', testimonial.id);
                          if (!error) fetchCountryData();
                        }}
                      />
                      
                      <div>
                        <Label className="mb-2 block">Student Image</Label>
                        <MediaUploader
                          onUploadComplete={async (url) => {
                            const { error } = await supabase
                              .from('country_testimonials')
                              .update({ student_image_url: url })
                              .eq('id', testimonial.id);
                            if (!error) fetchCountryData();
                          }}
                          acceptedFileTypes="image/*"
                          maxSizeMB={2}
                        />
                        {testimonial.student_image_url && (
                          <img 
                            src={testimonial.student_image_url} 
                            alt="Student" 
                            className="mt-2 w-20 h-20 rounded-full object-cover"
                          />
                        )}
                      </div>

                      <Input
                        placeholder="Video URL (YouTube embed)"
                        value={testimonial.video_url || ''}
                        onChange={async (e) => {
                          const { error } = await supabase
                            .from('country_testimonials')
                            .update({ video_url: e.target.value })
                            .eq('id', testimonial.id);
                          if (!error) fetchCountryData();
                        }}
                      />
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <Switch
                            checked={testimonial.is_featured}
                            onCheckedChange={async (checked) => {
                              const { error } = await supabase
                                .from('country_testimonials')
                                .update({ is_featured: checked })
                                .eq('id', testimonial.id);
                              if (!error) fetchCountryData();
                            }}
                          />
                          <Label>Featured</Label>
                        </div>
                        <Button
                          variant="destructive"
                          size="sm"
                          onClick={async () => {
                            const { error } = await supabase
                              .from('country_testimonials')
                              .delete()
                              .eq('id', testimonial.id);
                            if (!error) {
                              toast.success('Testimonial deleted');
                              fetchCountryData();
                            }
                          }}
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      )}
    </div>
  );
}
