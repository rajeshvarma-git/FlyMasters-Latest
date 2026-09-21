import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@student/components/ui/card';
import { Button } from '@student/components/ui/button';
import { Input } from '@student/components/ui/input';
import { Label } from '@student/components/ui/label';
import { Textarea } from '@student/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@student/components/ui/select';
import { Checkbox } from '@student/components/ui/checkbox';
import { Badge } from '@student/components/ui/badge';
import { Separator } from '@student/components/ui/separator';
import { Plus, Settings, MessageSquare, Phone, Mail, Bot, Calendar, Target } from 'lucide-react';
import { supabase } from '@student/integrations/supabase/client';
import { toast } from 'sonner';

export function CampaignCreator() {
  const [campaigns, setCampaigns] = useState([]);
  const [isCreating, setIsCreating] = useState(false);
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    campaign_type: 'general',
    channels: [],
    target_audience: {},
    campaign_settings: {
      schedule_type: 'immediate',
      fallback_enabled: true,
      auto_reengagement: true
    },
    utm_parameters: {}
  });

  const campaignTypes = [
    { value: 'general', label: 'General Outreach' },
    { value: 'scholarship', label: 'Scholarship Reminder' },
    { value: 'deadline', label: 'Application Deadline' },
    { value: 'offer', label: 'Special Offers' },
    { value: 'welcome', label: 'Welcome Series' },
    { value: 'follow_up', label: 'Follow-up Campaign' }
  ];

  const channels = [
    { id: 'whatsapp', label: 'WhatsApp', icon: MessageSquare, description: 'Via Interakt API' },
    { id: 'sms', label: 'SMS', icon: Phone, description: 'Via Twilio' },
    { id: 'email', label: 'Email', icon: Mail, description: 'Follow-up channel' },
    { id: 'call', label: 'Call Script', icon: Phone, description: 'For counselor calls' }
  ];

  const handleChannelToggle = (channelId: string) => {
    setFormData(prev => ({
      ...prev,
      channels: prev.channels.includes(channelId)
        ? prev.channels.filter(c => c !== channelId)
        : [...prev.channels, channelId]
    }));
  };

  const handleCreateCampaign = async () => {
    if (!formData.name || formData.channels.length === 0) {
      toast.error('Please provide campaign name and select at least one channel');
      return;
    }

    try {
      const { data: userData } = await supabase.auth.getUser();
      if (!userData.user) {
        toast.error('Please log in to create campaigns');
        return;
      }

      const { data, error } = await supabase
        .from('marketing_campaigns')
        .insert([{
          ...formData,
          created_by: userData.user.id
        }])
        .select()
        .single();

      if (error) throw error;

      toast.success('Campaign created successfully!');
      setIsCreating(false);
      setFormData({
        name: '',
        description: '',
        campaign_type: 'general',
        channels: [],
        target_audience: {},
        campaign_settings: {
          schedule_type: 'immediate',
          fallback_enabled: true,
          auto_reengagement: true
        },
        utm_parameters: {}
      });
      
      // Refresh campaigns list
      fetchCampaigns();
    } catch (error) {
      console.error('Error creating campaign:', error);
      toast.error('Failed to create campaign');
    }
  };

  const fetchCampaigns = async () => {
    try {
      const { data, error } = await supabase
        .from('marketing_campaigns')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      setCampaigns(data || []);
    } catch (error) {
      console.error('Error fetching campaigns:', error);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">Campaign Management</h2>
          <p className="text-muted-foreground">Create and manage marketing campaigns</p>
        </div>
        <Button onClick={() => setIsCreating(true)} className="flex items-center gap-2">
          <Plus className="w-4 h-4" />
          New Campaign
        </Button>
      </div>

      {isCreating && (
        <Card className="glass-card">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Target className="w-5 h-5" />
              Create New Campaign
            </CardTitle>
            <CardDescription>Set up your marketing campaign with AI-powered messaging</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Basic Information */}
            <div className="space-y-4">
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="campaign-name">Campaign Name</Label>
                  <Input
                    id="campaign-name"
                    placeholder="Enter campaign name"
                    value={formData.name}
                    onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="campaign-type">Campaign Type</Label>
                  <Select value={formData.campaign_type} onValueChange={(value) => setFormData(prev => ({ ...prev, campaign_type: value }))}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {campaignTypes.map(type => (
                        <SelectItem key={type.value} value={type.value}>
                          {type.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="campaign-description">Description</Label>
                <Textarea
                  id="campaign-description"
                  placeholder="Describe your campaign objectives"
                  value={formData.description}
                  onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
                />
              </div>
            </div>

            <Separator />

            {/* Channel Selection */}
            <div className="space-y-4">
              <div>
                <Label className="text-base font-medium">Select Channels</Label>
                <p className="text-sm text-muted-foreground">Choose the communication channels for this campaign</p>
              </div>
              
              <div className="grid gap-4 md:grid-cols-2">
                {channels.map(channel => (
                  <Card 
                    key={channel.id} 
                    className={`cursor-pointer transition-all ${
                      formData.channels.includes(channel.id) 
                        ? 'ring-2 ring-primary bg-primary/5' 
                        : 'hover:shadow-md'
                    }`}
                    onClick={() => handleChannelToggle(channel.id)}
                  >
                    <CardContent className="p-4">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <channel.icon className="w-5 h-5 text-primary" />
                          <div>
                            <p className="font-medium">{channel.label}</p>
                            <p className="text-xs text-muted-foreground">{channel.description}</p>
                          </div>
                        </div>
                        <Checkbox 
                          checked={formData.channels.includes(channel.id)}
                          onChange={() => {}} 
                        />
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>

            <Separator />

            {/* Campaign Settings */}
            <div className="space-y-4">
              <div>
                <Label className="text-base font-medium">Campaign Settings</Label>
                <p className="text-sm text-muted-foreground">Configure automation and scheduling options</p>
              </div>
              
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label>Schedule Type</Label>
                  <Select 
                    value={formData.campaign_settings.schedule_type} 
                    onValueChange={(value) => setFormData(prev => ({
                      ...prev,
                      campaign_settings: { ...prev.campaign_settings, schedule_type: value }
                    }))}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="immediate">Send Immediately</SelectItem>
                      <SelectItem value="scheduled">Schedule for Later</SelectItem>
                      <SelectItem value="drip">Drip Campaign</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                
                <div className="space-y-3">
                  <Label>Automation Options</Label>
                  <div className="space-y-3">
                    <div className="flex items-center space-x-2">
                      <Checkbox 
                        id="fallback"
                        checked={formData.campaign_settings.fallback_enabled}
                        onCheckedChange={(checked) => setFormData(prev => ({
                          ...prev,
                          campaign_settings: { ...prev.campaign_settings, fallback_enabled: !!checked }
                        }))}
                      />
                      <Label htmlFor="fallback" className="text-sm">Enable channel fallback</Label>
                    </div>
                    <div className="flex items-center space-x-2">
                      <Checkbox 
                        id="reengagement"
                        checked={formData.campaign_settings.auto_reengagement}
                        onCheckedChange={(checked) => setFormData(prev => ({
                          ...prev,
                          campaign_settings: { ...prev.campaign_settings, auto_reengagement: !!checked }
                        }))}
                      />
                      <Label htmlFor="reengagement" className="text-sm">Auto re-engagement</Label>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Action Buttons */}
            <div className="flex items-center gap-3 pt-4">
              <Button onClick={handleCreateCampaign} className="flex items-center gap-2">
                <Bot className="w-4 h-4" />
                Create Campaign
              </Button>
              <Button variant="outline" onClick={() => setIsCreating(false)}>
                Cancel
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Existing Campaigns */}
      <Card className="glass-card">
        <CardHeader>
          <CardTitle>Active Campaigns</CardTitle>
          <CardDescription>Manage your marketing campaigns</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="text-center py-8 text-muted-foreground">
            <MessageSquare className="w-12 h-12 mx-auto mb-4 opacity-50" />
            <p>No campaigns created yet. Create your first campaign to get started.</p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
