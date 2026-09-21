import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@student/components/ui/card';
import { Button } from '@student/components/ui/button';
import { Input } from '@student/components/ui/input';
import { Switch } from '@student/components/ui/switch';
import { Plus, Save, Trash2 } from 'lucide-react';
import { supabase } from '@student/integrations/supabase/client';
import { useToast } from '@student/hooks/use-toast';

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
  is_active: boolean;
  display_order: number;
}

export const VideoTestimonialsAdmin = () => {
  const [videos, setVideos] = useState<VideoTestimonial[]>([]);
  const [editing, setEditing] = useState<VideoTestimonial | null>(null);
  const { toast } = useToast();

  useEffect(() => {
    fetchVideos();
  }, []);

  const fetchVideos = async () => {
    const { data } = await supabase
      .from('video_testimonials')
      .select('*')
      .order('display_order');
    if (data) setVideos(data);
  };

  const saveVideo = async (video: VideoTestimonial) => {
    const { error } = video.id
      ? await supabase.from('video_testimonials').update(video).eq('id', video.id)
      : await supabase.from('video_testimonials').insert([video]);

    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Success", description: "Video testimonial saved" });
      fetchVideos();
      setEditing(null);
    }
  };

  return (
    <div className="space-y-4">
      <Button onClick={() => setEditing({ id: '', student_name: '', university: '', country: '', course: '', video_url: '', thumbnail_url: '', rating: 5, is_featured: false, is_active: true, display_order: videos.length })}>
        <Plus className="w-4 h-4 mr-2" /> Add Video Testimonial
      </Button>

      {videos.map((video) => (
        <Card key={video.id}>
          <CardHeader>
            <CardTitle>{video.student_name}</CardTitle>
          </CardHeader>
          {editing?.id === video.id ? (
            <CardContent className="space-y-4">
              <Input value={editing.student_name} onChange={(e) => setEditing({...editing, student_name: e.target.value})} placeholder="Student Name" />
              <Input value={editing.university} onChange={(e) => setEditing({...editing, university: e.target.value})} placeholder="University" />
              <Input value={editing.country} onChange={(e) => setEditing({...editing, country: e.target.value})} placeholder="Country" />
              <Input value={editing.video_url} onChange={(e) => setEditing({...editing, video_url: e.target.value})} placeholder="Video URL (YouTube/Shorts)" />
              <div className="flex gap-4">
                <Switch checked={editing.is_featured} onCheckedChange={(checked) => setEditing({...editing, is_featured: checked})} />
                <span>Featured</span>
              </div>
              <div className="flex gap-2">
                <Button onClick={() => saveVideo(editing)}><Save className="w-4 h-4 mr-2" />Save</Button>
                <Button variant="outline" onClick={() => setEditing(null)}>Cancel</Button>
              </div>
            </CardContent>
          ) : (
            <CardContent className="flex justify-between">
              <div>{video.university} - {video.country}</div>
              <Button onClick={() => setEditing(video)}>Edit</Button>
            </CardContent>
          )}
        </Card>
      ))}
    </div>
  );
};
