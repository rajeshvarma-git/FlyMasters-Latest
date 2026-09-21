import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@student/components/ui/card';
import { Switch } from '@student/components/ui/switch';
import { Button } from '@student/components/ui/button';
import { Badge } from '@student/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@student/components/ui/select';
import { Settings, Save, RefreshCw } from 'lucide-react';
import { useToast } from '@student/components/ui/use-toast';
import { supabase } from '@student/integrations/supabase/client';

interface AnalyticsConfig {
  enableRealtime: boolean;
  defaultDateRange: string;
  visibleMetrics: {
    overview: string[];
    students: string[];
    documents: string[];
    marketing: string[];
    operations: string[];
  };
  refreshInterval: number;
  exportFormats: string[];
  alertThresholds: {
    lowConversion: number;
    highProcessingTime: number;
    pendingDocuments: number;
  };
}

const defaultConfig: AnalyticsConfig = {
  enableRealtime: true,
  defaultDateRange: '30days',
  visibleMetrics: {
    overview: ['leads', 'documents', 'conversion', 'processing_time'],
    students: ['active', 'new_today', 'registered', 'countries', 'sources'],
    documents: ['pending', 'approved', 'rejected', 'timeline'],
    marketing: ['campaigns', 'roi', 'acquisition_cost'],
    operations: ['system_usage', 'counselor_performance', 'efficiency']
  },
  refreshInterval: 300000, // 5 minutes
  exportFormats: ['csv', 'pdf', 'excel'],
  alertThresholds: {
    lowConversion: 10,
    highProcessingTime: 5,
    pendingDocuments: 50
  }
};

export function AnalyticsSettings() {
  const { toast } = useToast();
  const [config, setConfig] = useState<AnalyticsConfig>(defaultConfig);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    loadConfig();
  }, []);

  const loadConfig = async () => {
    try {
      // Load from database
      const { data, error } = await supabase
        .from('system_settings')
        .select('value')
        .eq('key', 'analytics_config')
        .single();

      if (error) {
        if (error.code === 'PGRST116') {
          // No config exists yet, use defaults
          console.log('No analytics config found, using defaults');
        } else {
          throw error;
        }
      } else if (data && data.value) {
        setConfig(data.value as unknown as AnalyticsConfig);
      }
    } catch (error) {
      console.error('Error loading config:', error);
      toast({
        title: "Error",
        description: "Failed to load settings. Using defaults.",
        variant: "destructive",
      });
    }
  };

  const saveConfig = async () => {
    setLoading(true);
    try {
      const { data: userData } = await supabase.auth.getUser();
      
      // Save to database using upsert
      const { error } = await supabase
        .from('system_settings')
        .upsert([{
          key: 'analytics_config',
          value: JSON.parse(JSON.stringify(config)),
          updated_by: userData.user?.id,
          updated_at: new Date().toISOString(),
        }], {
          onConflict: 'key'
        });

      if (error) throw error;
      
      toast({
        title: "Settings saved",
        description: "Analytics configuration has been updated in the database.",
      });
    } catch (error) {
      console.error('Error saving config:', error);
      toast({
        title: "Error",
        description: "Failed to save settings to database.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const resetToDefaults = () => {
    setConfig(defaultConfig);
    toast({
      title: "Settings reset",
      description: "Analytics configuration has been reset to defaults.",
    });
  };

  const toggleMetric = (section: keyof AnalyticsConfig['visibleMetrics'], metric: string) => {
    setConfig(prev => ({
      ...prev,
      visibleMetrics: {
        ...prev.visibleMetrics,
        [section]: prev.visibleMetrics[section].includes(metric)
          ? prev.visibleMetrics[section].filter(m => m !== metric)
          : [...prev.visibleMetrics[section], metric]
      }
    }));
  };

  const MetricToggleSection = ({ 
    title, 
    section, 
    availableMetrics 
  }: { 
    title: string; 
    section: keyof AnalyticsConfig['visibleMetrics']; 
    availableMetrics: { key: string; label: string }[] 
  }) => (
    <Card className="glass-card">
      <CardHeader>
        <CardTitle className="text-lg">{title}</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid gap-3">
          {availableMetrics.map(metric => (
            <div key={metric.key} className="flex items-center justify-between">
              <span className="text-sm font-medium">{metric.label}</span>
              <Switch
                checked={config.visibleMetrics[section].includes(metric.key)}
                onCheckedChange={() => toggleMetric(section, metric.key)}
              />
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">Analytics Settings</h2>
          <p className="text-muted-foreground">Configure your analytics dashboard preferences</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={resetToDefaults}>
            <RefreshCw className="w-4 h-4 mr-2" />
            Reset Defaults
          </Button>
          <Button onClick={saveConfig} disabled={loading}>
            <Save className="w-4 h-4 mr-2" />
            {loading ? 'Saving...' : 'Save Settings'}
          </Button>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* General Settings */}
        <Card className="glass-card">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Settings className="w-5 h-5" />
              General Settings
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="flex items-center justify-between">
              <div>
                <span className="font-medium">Real-time Updates</span>
                <p className="text-sm text-muted-foreground">Enable automatic data refresh</p>
              </div>
              <Switch
                checked={config.enableRealtime}
                onCheckedChange={(checked) => setConfig(prev => ({ ...prev, enableRealtime: checked }))}
              />
            </div>

            <div className="space-y-2">
              <label className="font-medium">Default Date Range</label>
              <Select 
                value={config.defaultDateRange} 
                onValueChange={(value) => setConfig(prev => ({ ...prev, defaultDateRange: value }))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="7days">Last 7 days</SelectItem>
                  <SelectItem value="30days">Last 30 days</SelectItem>
                  <SelectItem value="90days">Last 90 days</SelectItem>
                  <SelectItem value="6months">Last 6 months</SelectItem>
                  <SelectItem value="1year">Last year</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <label className="font-medium">Refresh Interval (minutes)</label>
              <Select 
                value={String(config.refreshInterval / 60000)} 
                onValueChange={(value) => setConfig(prev => ({ ...prev, refreshInterval: Number(value) * 60000 }))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="1">1 minute</SelectItem>
                  <SelectItem value="5">5 minutes</SelectItem>
                  <SelectItem value="15">15 minutes</SelectItem>
                  <SelectItem value="30">30 minutes</SelectItem>
                  <SelectItem value="60">1 hour</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>

        {/* Alert Thresholds */}
        <Card className="glass-card">
          <CardHeader>
            <CardTitle>Alert Thresholds</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <label className="font-medium">Low Conversion Rate (%)</label>
              <input
                type="number"
                className="mt-1 block w-full px-3 py-2 border border-input rounded-md"
                value={config.alertThresholds.lowConversion}
                onChange={(e) => setConfig(prev => ({
                  ...prev,
                  alertThresholds: {
                    ...prev.alertThresholds,
                    lowConversion: Number(e.target.value)
                  }
                }))}
              />
            </div>

            <div>
              <label className="font-medium">High Processing Time (days)</label>
              <input
                type="number"
                className="mt-1 block w-full px-3 py-2 border border-input rounded-md"
                value={config.alertThresholds.highProcessingTime}
                onChange={(e) => setConfig(prev => ({
                  ...prev,
                  alertThresholds: {
                    ...prev.alertThresholds,
                    highProcessingTime: Number(e.target.value)
                  }
                }))}
              />
            </div>

            <div>
              <label className="font-medium">Pending Documents Alert</label>
              <input
                type="number"
                className="mt-1 block w-full px-3 py-2 border border-input rounded-md"
                value={config.alertThresholds.pendingDocuments}
                onChange={(e) => setConfig(prev => ({
                  ...prev,
                  alertThresholds: {
                    ...prev.alertThresholds,
                    pendingDocuments: Number(e.target.value)
                  }
                }))}
              />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Visible Metrics Configuration */}
      <div className="space-y-4">
        <h3 className="text-lg font-semibold">Visible Metrics Configuration</h3>
        <p className="text-sm text-muted-foreground">
          Choose which metrics to display in each section of the analytics dashboard
        </p>

        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          <MetricToggleSection
            title="Overview Metrics"
            section="overview"
            availableMetrics={[
              { key: 'leads', label: 'Total Leads' },
              { key: 'documents', label: 'Documents Processed' },
              { key: 'conversion', label: 'Conversion Rate' },
              { key: 'processing_time', label: 'Avg Processing Time' }
            ]}
          />

          <MetricToggleSection
            title="Student Metrics"
            section="students"
            availableMetrics={[
              { key: 'active', label: 'Active Students' },
              { key: 'new_today', label: 'New Today' },
              { key: 'registered', label: 'Total Registered' },
              { key: 'countries', label: 'Top Countries' },
              { key: 'sources', label: 'Lead Sources' }
            ]}
          />

          <MetricToggleSection
            title="Document Metrics"
            section="documents"
            availableMetrics={[
              { key: 'pending', label: 'Pending Review' },
              { key: 'approved', label: 'Approved' },
              { key: 'rejected', label: 'Rejected' },
              { key: 'timeline', label: 'Processing Timeline' }
            ]}
          />
        </div>
      </div>

      {/* Export Settings */}
      <Card className="glass-card">
        <CardHeader>
          <CardTitle>Export Settings</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            <label className="font-medium">Available Export Formats</label>
            <div className="flex gap-2 flex-wrap">
              {['csv', 'pdf', 'excel', 'json'].map(format => (
                <Badge
                  key={format}
                  variant={config.exportFormats.includes(format) ? "default" : "outline"}
                  className="cursor-pointer"
                  onClick={() => setConfig(prev => ({
                    ...prev,
                    exportFormats: prev.exportFormats.includes(format)
                      ? prev.exportFormats.filter(f => f !== format)
                      : [...prev.exportFormats, format]
                  }))}
                >
                  {format.toUpperCase()}
                </Badge>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}