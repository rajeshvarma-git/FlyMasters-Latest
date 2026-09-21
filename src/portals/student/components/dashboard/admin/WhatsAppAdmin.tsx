import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@student/components/ui/card';
import { Button } from '@student/components/ui/button';
import { Input } from '@student/components/ui/input';
import { Textarea } from '@student/components/ui/textarea';
import { Switch } from '@student/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@student/components/ui/select';
import { Save } from 'lucide-react';
import { supabase } from '@student/integrations/supabase/client';
import { useToast } from '@student/hooks/use-toast';

export const WhatsAppAdmin = () => {
  const [config, setConfig] = useState({ phone_number: '', message: '', show_in_header: true, show_sticky: true, sticky_position: 'bottom-right' });
  const { toast } = useToast();

  useEffect(() => {
    fetchConfig();
  }, []);

  const fetchConfig = async () => {
    const { data } = await supabase.from('website_content').select('metadata').eq('section_key', 'whatsapp_config').single();
    if (data?.metadata) setConfig(data.metadata as any);
  };

  const saveConfig = async () => {
    const { error } = await supabase.from('website_content').update({ metadata: config }).eq('section_key', 'whatsapp_config');
    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Success", description: "WhatsApp configuration updated" });
    }
  };

  return (
    <Card>
      <CardHeader><CardTitle>WhatsApp Configuration</CardTitle></CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-muted-foreground">
          This number powers marketing <span className="font-medium">wa.me</span> buttons. The support inbox uses Meta Cloud API env vars
          (<code>WHATSAPP_API_KEY</code>, <code>WHATSAPP_PHONE_NUMBER_ID</code>) and lives at Admin → WhatsApp.
        </p>
        <Input value={config.phone_number} onChange={(e) => setConfig({...config, phone_number: e.target.value})} placeholder="Phone Number (e.g., +919502127788)" />
        <Textarea value={config.message} onChange={(e) => setConfig({...config, message: e.target.value})} placeholder="Default message" rows={3} />
        <div className="flex items-center gap-2">
          <Switch checked={config.show_in_header} onCheckedChange={(checked) => setConfig({...config, show_in_header: checked})} />
          <span>Show in Header</span>
        </div>
        <div className="flex items-center gap-2">
          <Switch checked={config.show_sticky} onCheckedChange={(checked) => setConfig({...config, show_sticky: checked})} />
          <span>Show Sticky Button</span>
        </div>
        <Select value={config.sticky_position} onValueChange={(value) => setConfig({...config, sticky_position: value})}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="bottom-right">Bottom Right</SelectItem>
            <SelectItem value="bottom-left">Bottom Left</SelectItem>
            <SelectItem value="top-right">Top Right</SelectItem>
            <SelectItem value="top-left">Top Left</SelectItem>
          </SelectContent>
        </Select>
        <Button onClick={saveConfig}><Save className="w-4 h-4 mr-2" />Save Configuration</Button>
      </CardContent>
    </Card>
  );
};
