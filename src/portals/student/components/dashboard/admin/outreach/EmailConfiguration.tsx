import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@student/components/ui/card';
import { Button } from '@student/components/ui/button';
import { Input } from '@student/components/ui/input';
import { Label } from '@student/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@student/components/ui/select';
import { Badge } from '@student/components/ui/badge';
import { Switch } from '@student/components/ui/switch';
import { useToast } from '@student/components/ui/use-toast';
import { supabase } from '@student/integrations/supabase/client';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@student/components/ui/dialog';
import { Settings, Plus, Mail, Shield, AlertTriangle, CheckCircle, Trash2 } from 'lucide-react';

interface EmailServiceConfig {
  id: string;
  service_type: string;
  config_name: string;
  email_address: string;
  is_active: boolean;
  daily_send_limit: number;
  current_daily_sent: number;
  bounce_rate: number;
  spam_complaints: number;
  is_verified: boolean;
  created_at: string;
}

export function EmailConfiguration() {
  const { toast } = useToast();
  const [configs, setConfigs] = useState<EmailServiceConfig[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [editingConfig, setEditingConfig] = useState<EmailServiceConfig | null>(null);

  // Form state
  const [configForm, setConfigForm] = useState({
    service_type: 'gmail',
    config_name: '',
    email_address: '',
    daily_send_limit: 100,
    smtp_settings: {}
  });

  useEffect(() => {
    fetchConfigs();
  }, []);

  const fetchConfigs = async () => {
    try {
      const { data, error } = await supabase
        .from('email_service_config')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      setConfigs(data || []);
    } catch (error) {
      console.error('Error fetching email configs:', error);
      toast({
        title: 'Error',
        description: 'Failed to fetch email configurations',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const handleSaveConfig = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      if (editingConfig) {
        const { error } = await supabase
          .from('email_service_config')
          .update(configForm)
          .eq('id', editingConfig.id);
        if (error) throw error;
      } else {
        const { data: userData } = await supabase.auth.getUser();
        const { error } = await supabase
          .from('email_service_config')
          .insert([{ ...configForm, created_by: userData.user?.id || '' }]);
        if (error) throw error;
      }

      toast({
        title: 'Success',
        description: `Email configuration ${editingConfig ? 'updated' : 'created'} successfully`,
      });

      setShowCreateDialog(false);
      setEditingConfig(null);
      resetForm();
      fetchConfigs();
    } catch (error) {
      console.error('Error saving config:', error);
      toast({
        title: 'Error',
        description: 'Failed to save email configuration',
        variant: 'destructive',
      });
    }
  };

  const resetForm = () => {
    setConfigForm({
      service_type: 'gmail',
      config_name: '',
      email_address: '',
      daily_send_limit: 100,
      smtp_settings: {}
    });
  };

  const handleEdit = (config: EmailServiceConfig) => {
    setEditingConfig(config);
    setConfigForm({
      service_type: config.service_type,
      config_name: config.config_name,
      email_address: config.email_address,
      daily_send_limit: config.daily_send_limit,
      smtp_settings: {}
    });
    setShowCreateDialog(true);
  };

  const toggleConfigStatus = async (id: string, currentStatus: boolean) => {
    try {
      // If activating this config, deactivate others first
      if (!currentStatus) {
        await supabase
          .from('email_service_config')
          .update({ is_active: false })
          .neq('id', id);
      }

      const { error } = await supabase
        .from('email_service_config')
        .update({ is_active: !currentStatus })
        .eq('id', id);

      if (error) throw error;

      toast({
        title: 'Success',
        description: `Email configuration ${!currentStatus ? 'activated' : 'deactivated'}`,
      });
      fetchConfigs();
    } catch (error) {
      console.error('Error updating config status:', error);
      toast({
        title: 'Error',
        description: 'Failed to update configuration status',
        variant: 'destructive',
      });
    }
  };

  const deleteConfig = async (id: string) => {
    if (!confirm('Are you sure you want to delete this email configuration?')) return;

    try {
      const { error } = await supabase
        .from('email_service_config')
        .delete()
        .eq('id', id);

      if (error) throw error;

      toast({
        title: 'Success',
        description: 'Email configuration deleted successfully',
      });
      fetchConfigs();
    } catch (error) {
      console.error('Error deleting config:', error);
      toast({
        title: 'Error',
        description: 'Failed to delete email configuration',
        variant: 'destructive',
      });
    }
  };

  const connectOAuth = async (configId: string, serviceType: string) => {
    toast({
      title: 'OAuth Integration',
      description: 'OAuth integration feature is coming soon!',
    });
    // TODO: Implement OAuth flow
  };

  const getServiceIcon = (serviceType: string) => {
    switch (serviceType) {
      case 'gmail':
        return '📧';
      case 'outlook':
        return '📮';
      case 'smtp':
        return '⚙️';
      default:
        return '📬';
    }
  };

  const getStatusBadge = (config: EmailServiceConfig) => {
    if (!config.is_verified) {
      return <Badge variant="destructive">Not Verified</Badge>;
    }
    if (!config.is_active) {
      return <Badge variant="secondary">Inactive</Badge>;
    }
    if (config.bounce_rate > 5) {
      return <Badge variant="destructive">High Bounce Rate</Badge>;
    }
    return <Badge variant="default">Active</Badge>;
  };

  if (loading) {
    return <div className="p-6">Loading email configurations...</div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">Email Configuration</h2>
          <p className="text-muted-foreground">Manage email service connections and settings</p>
        </div>
        <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
          <DialogTrigger asChild>
            <Button onClick={() => { resetForm(); setEditingConfig(null); }}>
              <Plus className="w-4 h-4 mr-2" />
              Add Email Service
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>{editingConfig ? 'Edit' : 'Add'} Email Service</DialogTitle>
              <DialogDescription>
                Configure an email service for sending outreach emails
              </DialogDescription>
            </DialogHeader>
            <form onSubmit={handleSaveConfig} className="space-y-4">
              <div>
                <Label htmlFor="service_type">Service Type</Label>
                <Select value={configForm.service_type} onValueChange={(value) => setConfigForm({...configForm, service_type: value})}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="gmail">Gmail</SelectItem>
                    <SelectItem value="outlook">Outlook</SelectItem>
                    <SelectItem value="smtp">Custom SMTP</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label htmlFor="config_name">Configuration Name</Label>
                <Input
                  id="config_name"
                  value={configForm.config_name}
                  onChange={(e) => setConfigForm({...configForm, config_name: e.target.value})}
                  placeholder="e.g., Main Gmail Account"
                  required
                />
              </div>

              <div>
                <Label htmlFor="email_address">Email Address</Label>
                <Input
                  id="email_address"
                  type="email"
                  value={configForm.email_address}
                  onChange={(e) => setConfigForm({...configForm, email_address: e.target.value})}
                  placeholder="outreach@company.com"
                  required
                />
              </div>

              <div>
                <Label htmlFor="daily_limit">Daily Send Limit</Label>
                <Input
                  id="daily_limit"
                  type="number"
                  value={configForm.daily_send_limit}
                  onChange={(e) => setConfigForm({...configForm, daily_send_limit: parseInt(e.target.value)})}
                  min={1}
                  max={500}
                  required
                />
                <p className="text-xs text-muted-foreground mt-1">
                  Recommended: 100 emails per day to avoid spam filters
                </p>
              </div>

              <div className="flex gap-2">
                <Button type="submit">{editingConfig ? 'Update' : 'Add'} Configuration</Button>
                <Button type="button" variant="outline" onClick={() => setShowCreateDialog(false)}>
                  Cancel
                </Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {/* Security Warning */}
      <Card className="glass-card border-yellow-200 bg-yellow-50/50 dark:border-yellow-800 dark:bg-yellow-950/20">
        <CardContent className="p-4">
          <div className="flex items-start gap-3">
            <Shield className="w-5 h-5 text-yellow-600 mt-0.5" />
            <div>
              <h3 className="font-medium text-yellow-800 dark:text-yellow-200">Security Notice</h3>
              <p className="text-sm text-yellow-700 dark:text-yellow-300 mt-1">
                Email credentials are encrypted and stored securely. OAuth integration is recommended for enhanced security.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Email Configurations */}
      <div className="grid gap-4">
        {configs.map((config) => (
          <Card key={config.id} className="glass-card">
            <CardContent className="p-6">
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <div className="flex items-center gap-3 mb-3">
                    <span className="text-2xl">{getServiceIcon(config.service_type)}</span>
                    <div>
                      <h3 className="text-lg font-semibold">{config.config_name}</h3>
                      <p className="text-sm text-muted-foreground">{config.email_address}</p>
                    </div>
                    {getStatusBadge(config)}
                  </div>

                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm mb-4">
                    <div>
                      <p className="text-muted-foreground">Daily Limit</p>
                      <p className="font-medium">{config.current_daily_sent} / {config.daily_send_limit}</p>
                    </div>
                    <div>
                      <p className="text-muted-foreground">Bounce Rate</p>
                      <p className="font-medium">{config.bounce_rate}%</p>
                    </div>
                    <div>
                      <p className="text-muted-foreground">Spam Complaints</p>
                      <p className="font-medium">{config.spam_complaints}</p>
                    </div>
                    <div>
                      <p className="text-muted-foreground">Service Type</p>
                      <p className="font-medium capitalize">{config.service_type}</p>
                    </div>
                  </div>

                  {/* Health Indicators */}
                  <div className="flex flex-wrap gap-2">
                    {config.bounce_rate > 5 && (
                      <Badge variant="destructive" className="text-xs">
                        <AlertTriangle className="w-3 h-3 mr-1" />
                        High Bounce Rate
                      </Badge>
                    )}
                    {config.spam_complaints > 0 && (
                      <Badge variant="destructive" className="text-xs">
                        <AlertTriangle className="w-3 h-3 mr-1" />
                        Spam Complaints
                      </Badge>
                    )}
                    {config.current_daily_sent >= config.daily_send_limit * 0.9 && (
                      <Badge variant="outline" className="text-xs text-yellow-600">
                        <AlertTriangle className="w-3 h-3 mr-1" />
                        Near Daily Limit
                      </Badge>
                    )}
                    {config.is_verified && config.bounce_rate <= 2 && (
                      <Badge variant="outline" className="text-xs text-green-600">
                        <CheckCircle className="w-3 h-3 mr-1" />
                        Healthy
                      </Badge>
                    )}
                  </div>
                </div>

                <div className="flex flex-col gap-2 ml-4">
                  <div className="flex items-center gap-2">
                    <Switch
                      checked={config.is_active}
                      onCheckedChange={() => toggleConfigStatus(config.id, config.is_active)}
                      disabled={!config.is_verified}
                    />
                    <span className="text-sm text-muted-foreground">Active</span>
                  </div>
                  
                  {!config.is_verified && config.service_type !== 'smtp' && (
                    <Button 
                      variant="outline" 
                      size="sm"
                      onClick={() => connectOAuth(config.id, config.service_type)}
                    >
                      <Shield className="w-4 h-4 mr-1" />
                      Connect OAuth
                    </Button>
                  )}
                  
                  <Button variant="outline" size="sm" onClick={() => handleEdit(config)}>
                    Edit
                  </Button>
                  
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => deleteConfig(config.id)}
                    className="text-destructive hover:text-destructive"
                  >
                    <Trash2 className="w-4 h-4 mr-1" />
                    Delete
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {configs.length === 0 && (
        <Card className="glass-card">
          <CardContent className="p-12 text-center">
            <Mail className="w-16 h-16 text-muted-foreground mx-auto mb-4" />
            <h3 className="text-xl font-semibold mb-2">No Email Services Configured</h3>
            <p className="text-muted-foreground mb-4">
              Add an email service to start sending outreach emails to universities.
            </p>
            <Button onClick={() => setShowCreateDialog(true)}>
              <Plus className="w-4 h-4 mr-2" />
              Add First Email Service
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Configuration Tips */}
      <Card className="glass-card">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Settings className="w-5 h-5" />
            Configuration Tips
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3 text-sm">
            <div className="flex items-start gap-2">
              <CheckCircle className="w-4 h-4 text-green-500 mt-0.5" />
              <p>Use dedicated email addresses for outreach to protect your main business email reputation.</p>
            </div>
            <div className="flex items-start gap-2">
              <CheckCircle className="w-4 h-4 text-green-500 mt-0.5" />
              <p>Keep daily send limits conservative (50-100 emails) to avoid being flagged as spam.</p>
            </div>
            <div className="flex items-start gap-2">
              <CheckCircle className="w-4 h-4 text-green-500 mt-0.5" />
              <p>Monitor bounce rates and pause campaigns if they exceed 5% to maintain deliverability.</p>
            </div>
            <div className="flex items-start gap-2">
              <CheckCircle className="w-4 h-4 text-green-500 mt-0.5" />
              <p>Set up SPF, DKIM, and DMARC records for your domain to improve email deliverability.</p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}