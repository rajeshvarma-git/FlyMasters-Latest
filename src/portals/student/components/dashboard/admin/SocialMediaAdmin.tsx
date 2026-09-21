import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@student/components/ui/card';
import { Button } from '@student/components/ui/button';
import { Input } from '@student/components/ui/input';
import { Save } from 'lucide-react';
import { supabase } from '@student/integrations/supabase/client';
import { useToast } from '@student/hooks/use-toast';

export const SocialMediaAdmin = () => {
  const [config, setConfig] = useState({ youtube: '', instagram: '', facebook: '', linkedin: '', snapchat: '' });
  const { toast } = useToast();

  useEffect(() => {
    fetchConfig();
  }, []);

  const fetchConfig = async () => {
    const { data } = await supabase.from('website_content').select('metadata').eq('section_key', 'social_media_links').single();
    if (data?.metadata) setConfig(data.metadata as any);
  };

  const saveConfig = async () => {
    const { error } = await supabase.from('website_content').update({ metadata: config }).eq('section_key', 'social_media_links');
    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Success", description: "Social media links updated" });
    }
  };

  return (
    <Card>
      <CardHeader><CardTitle>Social Media Links</CardTitle></CardHeader>
      <CardContent className="space-y-4">
        <Input value={config.youtube} onChange={(e) => setConfig({...config, youtube: e.target.value})} placeholder="YouTube URL" />
        <Input value={config.instagram} onChange={(e) => setConfig({...config, instagram: e.target.value})} placeholder="Instagram URL" />
        <Input value={config.facebook} onChange={(e) => setConfig({...config, facebook: e.target.value})} placeholder="Facebook URL" />
        <Input value={config.linkedin} onChange={(e) => setConfig({...config, linkedin: e.target.value})} placeholder="LinkedIn URL" />
        <Input value={config.snapchat} onChange={(e) => setConfig({...config, snapchat: e.target.value})} placeholder="Snapchat URL" />
        <Button onClick={saveConfig}><Save className="w-4 h-4 mr-2" />Save Links</Button>
      </CardContent>
    </Card>
  );
};
