import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@student/integrations/supabase/client';
import { Card } from '@student/components/ui/card';
import { Button } from '@student/components/ui/button';
import { Input } from '@student/components/ui/input';
import { Label } from '@student/components/ui/label';
import { Textarea } from '@student/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@student/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@student/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@student/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@student/components/ui/tabs';
import { Badge } from '@student/components/ui/badge';
import { Switch } from '@student/components/ui/switch';
import { toast } from 'sonner';
import { Mail, Plus, Edit, Trash2, Play, Pause, Eye, TrendingUp } from 'lucide-react';

export default function TravelEmailCampaignsAdmin() {
  const queryClient = useQueryClient();
  const [selectedTab, setSelectedTab] = useState('campaigns');
  const [showTemplateDialog, setShowTemplateDialog] = useState(false);
  const [showCampaignDialog, setShowCampaignDialog] = useState(false);
  const [selectedTemplate, setSelectedTemplate] = useState<any>(null);
  const [selectedCampaign, setSelectedCampaign] = useState<any>(null);

  const { data: templates, isLoading: templatesLoading } = useQuery({
    queryKey: ['travel-email-templates'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('travel_email_templates')
        .select('*')
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const { data: campaigns, isLoading: campaignsLoading } = useQuery({
    queryKey: ['travel-email-campaigns'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('travel_email_campaigns')
        .select('*, travel_email_templates(template_name)')
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const { data: emailLogs } = useQuery({
    queryKey: ['travel-email-logs'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('travel_email_logs')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(100);
      if (error) throw error;
      return data;
    },
  });

  const createTemplate = useMutation({
    mutationFn: async (template: any) => {
      const { data: user } = await supabase.auth.getUser();
      const { error } = await supabase.from('travel_email_templates').insert({
        ...template,
        created_by: user.user?.id,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['travel-email-templates'] });
      toast.success('Template created successfully');
      setShowTemplateDialog(false);
    },
    onError: () => toast.error('Failed to create template'),
  });

  const updateTemplate = useMutation({
    mutationFn: async ({ id, updates }: { id: string; updates: any }) => {
      const { error } = await supabase
        .from('travel_email_templates')
        .update(updates)
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['travel-email-templates'] });
      toast.success('Template updated successfully');
      setShowTemplateDialog(false);
    },
    onError: () => toast.error('Failed to update template'),
  });

  const deleteTemplate = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('travel_email_templates').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['travel-email-templates'] });
      toast.success('Template deleted');
    },
    onError: () => toast.error('Failed to delete template'),
  });

  const createCampaign = useMutation({
    mutationFn: async (campaign: any) => {
      const { data: user } = await supabase.auth.getUser();
      const { error } = await supabase.from('travel_email_campaigns').insert({
        ...campaign,
        created_by: user.user?.id,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['travel-email-campaigns'] });
      toast.success('Campaign created successfully');
      setShowCampaignDialog(false);
    },
    onError: () => toast.error('Failed to create campaign'),
  });

  const toggleCampaign = useMutation({
    mutationFn: async ({ id, is_active }: { id: string; is_active: boolean }) => {
      const { error } = await supabase
        .from('travel_email_campaigns')
        .update({ is_active })
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['travel-email-campaigns'] });
      toast.success('Campaign updated');
    },
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-3xl font-bold">Email Campaign Management</h2>
          <p className="text-muted-foreground">Automate your travel marketing communications</p>
        </div>
      </div>

      <Tabs value={selectedTab} onValueChange={setSelectedTab}>
        <TabsList>
          <TabsTrigger value="campaigns">Campaigns</TabsTrigger>
          <TabsTrigger value="templates">Templates</TabsTrigger>
          <TabsTrigger value="logs">Email Logs</TabsTrigger>
          <TabsTrigger value="analytics">Analytics</TabsTrigger>
        </TabsList>

        <TabsContent value="campaigns" className="space-y-4">
          <div className="flex justify-end">
            <Button onClick={() => { setSelectedCampaign(null); setShowCampaignDialog(true); }}>
              <Plus className="w-4 h-4 mr-2" />
              Create Campaign
            </Button>
          </div>

          <Card>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Campaign Name</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Template</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Stats</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {campaignsLoading ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center">Loading...</TableCell>
                  </TableRow>
                ) : campaigns?.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center">No campaigns yet</TableCell>
                  </TableRow>
                ) : (
                  campaigns?.map((campaign: any) => (
                    <TableRow key={campaign.id}>
                      <TableCell className="font-medium">{campaign.campaign_name}</TableCell>
                      <TableCell className="capitalize">{campaign.campaign_type.replace('_', ' ')}</TableCell>
                      <TableCell>{campaign.travel_email_templates?.template_name || 'N/A'}</TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <Switch
                            checked={campaign.is_active}
                            onCheckedChange={(checked) => toggleCampaign.mutate({ id: campaign.id, is_active: checked })}
                          />
                          <Badge variant={campaign.is_active ? 'default' : 'secondary'}>
                            {campaign.is_active ? 'Active' : 'Paused'}
                          </Badge>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="text-sm space-y-1">
                          <div>Sent: {campaign.send_count}</div>
                          <div>Opened: {campaign.open_count}</div>
                          <div>Clicked: {campaign.click_count}</div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex gap-2">
                          <Button size="sm" variant="ghost">
                            <Edit className="w-4 h-4" />
                          </Button>
                          <Button size="sm" variant="ghost">
                            <Eye className="w-4 h-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </Card>
        </TabsContent>

        <TabsContent value="templates" className="space-y-4">
          <div className="flex justify-end">
            <Button onClick={() => { setSelectedTemplate(null); setShowTemplateDialog(true); }}>
              <Plus className="w-4 h-4 mr-2" />
              Create Template
            </Button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {templatesLoading ? (
              <Card className="p-6"><p className="text-center">Loading...</p></Card>
            ) : templates?.length === 0 ? (
              <Card className="p-6"><p className="text-center">No templates yet</p></Card>
            ) : (
              templates?.map((template) => (
                <Card key={template.id} className="p-6 space-y-4">
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <h3 className="font-semibold">{template.template_name}</h3>
                      <Badge variant="outline" className="mt-2">
                        {template.template_type}
                      </Badge>
                    </div>
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => {
                          setSelectedTemplate(template);
                          setShowTemplateDialog(true);
                        }}
                      >
                        <Edit className="w-4 h-4" />
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => {
                          if (confirm('Delete this template?')) {
                            deleteTemplate.mutate(template.id);
                          }
                        }}
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Subject:</p>
                    <p className="font-medium">{template.subject_line}</p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Preview:</p>
                    <p className="text-sm line-clamp-3">{template.email_body.substring(0, 150)}...</p>
                  </div>
                  <Badge variant={template.is_active ? 'default' : 'secondary'}>
                    {template.is_active ? 'Active' : 'Inactive'}
                  </Badge>
                </Card>
              ))
            )}
          </div>
        </TabsContent>

        <TabsContent value="logs" className="space-y-4">
          <Card>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Recipient</TableHead>
                  <TableHead>Subject</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {emailLogs?.map((log) => (
                  <TableRow key={log.id}>
                    <TableCell>{new Date(log.created_at).toLocaleString()}</TableCell>
                    <TableCell>{log.recipient_email}</TableCell>
                    <TableCell className="max-w-md truncate">{log.subject}</TableCell>
                    <TableCell>
                      <Badge variant={
                        log.status === 'sent' ? 'default' :
                        log.status === 'opened' ? 'default' :
                        log.status === 'clicked' ? 'default' :
                        log.status === 'failed' ? 'destructive' : 'secondary'
                      }>
                        {log.status}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {log.opened_at && <span className="text-xs">Opened: {new Date(log.opened_at).toLocaleString()}</span>}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Card>
        </TabsContent>

        <TabsContent value="analytics" className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <Card className="p-6">
              <div className="flex items-center gap-3">
                <Mail className="w-8 h-8 text-blue-600" />
                <div>
                  <p className="text-sm text-muted-foreground">Emails Sent</p>
                  <h3 className="text-2xl font-bold">{emailLogs?.length || 0}</h3>
                </div>
              </div>
            </Card>
            <Card className="p-6">
              <div className="flex items-center gap-3">
                <TrendingUp className="w-8 h-8 text-green-600" />
                <div>
                  <p className="text-sm text-muted-foreground">Open Rate</p>
                  <h3 className="text-2xl font-bold">
                    {emailLogs && emailLogs.length > 0
                      ? ((emailLogs.filter(l => l.opened_at).length / emailLogs.length) * 100).toFixed(1)
                      : 0}%
                  </h3>
                </div>
              </div>
            </Card>
            <Card className="p-6">
              <div className="flex items-center gap-3">
                <TrendingUp className="w-8 h-8 text-purple-600" />
                <div>
                  <p className="text-sm text-muted-foreground">Click Rate</p>
                  <h3 className="text-2xl font-bold">
                    {emailLogs && emailLogs.length > 0
                      ? ((emailLogs.filter(l => l.clicked_at).length / emailLogs.length) * 100).toFixed(1)
                      : 0}%
                  </h3>
                </div>
              </div>
            </Card>
            <Card className="p-6">
              <div className="flex items-center gap-3">
                <Play className="w-8 h-8 text-orange-600" />
                <div>
                  <p className="text-sm text-muted-foreground">Active Campaigns</p>
                  <h3 className="text-2xl font-bold">
                    {campaigns?.filter(c => c.is_active).length || 0}
                  </h3>
                </div>
              </div>
            </Card>
          </div>
        </TabsContent>
      </Tabs>

      {/* Template Dialog */}
      <Dialog open={showTemplateDialog} onOpenChange={setShowTemplateDialog}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>{selectedTemplate ? 'Edit Template' : 'Create Template'}</DialogTitle>
          </DialogHeader>
          <TemplateForm
            template={selectedTemplate}
            onSubmit={(data) => {
              if (selectedTemplate) {
                updateTemplate.mutate({ id: selectedTemplate.id, updates: data });
              } else {
                createTemplate.mutate(data);
              }
            }}
            onCancel={() => setShowTemplateDialog(false)}
          />
        </DialogContent>
      </Dialog>

      {/* Campaign Dialog */}
      <Dialog open={showCampaignDialog} onOpenChange={setShowCampaignDialog}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Create Email Campaign</DialogTitle>
          </DialogHeader>
          <CampaignForm
            templates={templates || []}
            onSubmit={(data) => createCampaign.mutate(data)}
            onCancel={() => setShowCampaignDialog(false)}
          />
        </DialogContent>
      </Dialog>
    </div>
  );
}

function TemplateForm({ template, onSubmit, onCancel }: any) {
  const [formData, setFormData] = useState(template || {
    template_name: '',
    template_type: 'welcome',
    subject_line: '',
    email_body: '',
    is_active: true,
  });

  return (
    <form onSubmit={(e) => { e.preventDefault(); onSubmit(formData); }} className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <div>
          <Label>Template Name *</Label>
          <Input
            value={formData.template_name}
            onChange={(e) => setFormData({ ...formData, template_name: e.target.value })}
            required
          />
        </div>
        <div>
          <Label>Template Type *</Label>
          <Select
            value={formData.template_type}
            onValueChange={(value) => setFormData({ ...formData, template_type: value })}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="welcome">Welcome</SelectItem>
              <SelectItem value="follow_up">Follow Up</SelectItem>
              <SelectItem value="abandoned_booking">Abandoned Booking</SelectItem>
              <SelectItem value="post_trip">Post Trip</SelectItem>
              <SelectItem value="custom">Custom</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <div>
        <Label>Subject Line *</Label>
        <Input
          value={formData.subject_line}
          onChange={(e) => setFormData({ ...formData, subject_line: e.target.value })}
          required
        />
      </div>

      <div>
        <Label>Email Body *</Label>
        <Textarea
          value={formData.email_body}
          onChange={(e) => setFormData({ ...formData, email_body: e.target.value })}
          rows={10}
          placeholder="Use variables like {{customer_name}}, {{package_name}}, {{destination}}"
          required
        />
      </div>

      <div className="flex items-center gap-2">
        <Switch
          checked={formData.is_active}
          onCheckedChange={(checked) => setFormData({ ...formData, is_active: checked })}
        />
        <Label>Active</Label>
      </div>

      <div className="flex gap-2">
        <Button type="submit" className="flex-1">Save Template</Button>
        <Button type="button" variant="outline" onClick={onCancel}>Cancel</Button>
      </div>
    </form>
  );
}

function CampaignForm({ templates, onSubmit, onCancel }: any) {
  const [formData, setFormData] = useState({
    campaign_name: '',
    campaign_type: 'follow_up',
    trigger_event: 'inquiry_received',
    delay_hours: 0,
    template_id: '',
    is_active: true,
  });

  return (
    <form onSubmit={(e) => { e.preventDefault(); onSubmit(formData); }} className="space-y-4">
      <div>
        <Label>Campaign Name *</Label>
        <Input
          value={formData.campaign_name}
          onChange={(e) => setFormData({ ...formData, campaign_name: e.target.value })}
          required
        />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <Label>Campaign Type *</Label>
          <Select
            value={formData.campaign_type}
            onValueChange={(value) => setFormData({ ...formData, campaign_type: value })}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="welcome">Welcome Series</SelectItem>
              <SelectItem value="follow_up">Follow Up</SelectItem>
              <SelectItem value="abandoned">Abandoned Booking</SelectItem>
              <SelectItem value="post_trip">Post Trip</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label>Trigger Event *</Label>
          <Select
            value={formData.trigger_event}
            onValueChange={(value) => setFormData({ ...formData, trigger_event: value })}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="inquiry_received">Inquiry Received</SelectItem>
              <SelectItem value="booking_created">Booking Created</SelectItem>
              <SelectItem value="booking_abandoned">Booking Abandoned</SelectItem>
              <SelectItem value="trip_completed">Trip Completed</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <div>
        <Label>Email Template *</Label>
        <Select
          value={formData.template_id}
          onValueChange={(value) => setFormData({ ...formData, template_id: value })}
        >
          <SelectTrigger>
            <SelectValue placeholder="Select template" />
          </SelectTrigger>
          <SelectContent>
            {templates.map((template: any) => (
              <SelectItem key={template.id} value={template.id}>
                {template.template_name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div>
        <Label>Delay (hours)</Label>
        <Input
          type="number"
          min="0"
          value={formData.delay_hours}
          onChange={(e) => setFormData({ ...formData, delay_hours: parseInt(e.target.value) })}
        />
        <p className="text-xs text-muted-foreground mt-1">How long after the trigger should the email be sent?</p>
      </div>

      <div className="flex items-center gap-2">
        <Switch
          checked={formData.is_active}
          onCheckedChange={(checked) => setFormData({ ...formData, is_active: checked })}
        />
        <Label>Active</Label>
      </div>

      <div className="flex gap-2">
        <Button type="submit" className="flex-1">Create Campaign</Button>
        <Button type="button" variant="outline" onClick={onCancel}>Cancel</Button>
      </div>
    </form>
  );
}
