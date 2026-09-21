import { useState, useEffect } from 'react';
import { supabase } from '@student/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@student/components/ui/card';
import { Button } from '@student/components/ui/button';
import { Switch } from '@student/components/ui/switch';
import { Label } from '@student/components/ui/label';
import { Textarea } from '@student/components/ui/textarea';
import { Input } from '@student/components/ui/input';
import { useToast } from '@student/hooks/use-toast';
import { Settings, Save } from 'lucide-react';

export function SystemSettingsAdmin() {
  const [settings, setSettings] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();

  useEffect(() => {
    fetchSettings();
  }, []);

  const fetchSettings = async () => {
    const { data } = await supabase
      .from('system_settings')
      .select('*')
      .eq('key', 'registration_enabled')
      .maybeSingle();

    if (data) {
      const settingData: any = data;
      setSettings(settingData.value || { enabled: true });
    }
    setLoading(false);
  };

  const handleSave = async () => {
    try {
      const { error } = await supabase
        .from('system_settings')
        .upsert({
          key: 'registration_enabled',
          value: settings
        } as any);

      if (error) throw error;

      toast({
        title: "Success",
        description: "Settings updated successfully",
      });
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    }
  };

  if (loading) return <div>Loading...</div>;

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Settings className="w-5 h-5" />
            Registration Settings
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <Label>Enable New User Registration</Label>
            <Switch
              checked={settings?.enabled !== false}
              onCheckedChange={(checked) => 
                setSettings({ ...settings, enabled: checked })
              }
            />
          </div>

          <div className="space-y-2">
            <Label>Message (shown when registration is disabled)</Label>
            <Textarea
              value={settings?.message || ''}
              onChange={(e) => 
                setSettings({ ...settings, message: e.target.value })
              }
              rows={3}
            />
          </div>

          <div className="space-y-4">
            <Label>Admin Contact Information</Label>
            <div className="grid grid-cols-3 gap-4">
              <div>
                <Label className="text-xs">Phone</Label>
                <Input
                  value={settings?.admin_contact?.phone || ''}
                  onChange={(e) => 
                    setSettings({ 
                      ...settings, 
                      admin_contact: { ...settings?.admin_contact, phone: e.target.value }
                    })
                  }
                />
              </div>
              <div>
                <Label className="text-xs">WhatsApp</Label>
                <Input
                  value={settings?.admin_contact?.whatsapp || ''}
                  onChange={(e) => 
                    setSettings({ 
                      ...settings, 
                      admin_contact: { ...settings?.admin_contact, whatsapp: e.target.value }
                    })
                  }
                />
              </div>
              <div>
                <Label className="text-xs">Email</Label>
                <Input
                  value={settings?.admin_contact?.email || ''}
                  onChange={(e) => 
                    setSettings({ 
                      ...settings, 
                      admin_contact: { ...settings?.admin_contact, email: e.target.value }
                    })
                  }
                />
              </div>
            </div>
          </div>

          <Button onClick={handleSave} className="w-full">
            <Save className="w-4 h-4 mr-2" />
            Save Settings
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
