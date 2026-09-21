import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@student/components/ui/card';
import { Button } from '@student/components/ui/button';
import { Input } from '@student/components/ui/input';
import { Label } from '@student/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@student/components/ui/select';
import { Switch } from '@student/components/ui/switch';
import { Badge } from '@student/components/ui/badge';
import { Separator } from '@student/components/ui/separator';
import { Plus, Workflow, Clock, MessageSquare, User, Settings, Play, Pause, Edit, Trash2 } from 'lucide-react';
import { supabase } from '@student/integrations/supabase/client';
import { toast } from 'sonner';

export function ReengagementFlows() {
  const [flows, setFlows] = useState([]);
  const [isCreating, setIsCreating] = useState(false);
  const [formData, setFormData] = useState({
    trigger_condition: 'no_response_x_days',
    trigger_value: 3,
    action_type: 'send_message',
    action_config: {},
    is_active: true
  });

  const triggerConditions = [
    { 
      value: 'no_response_x_days', 
      label: 'No Response After X Days',
      description: 'Trigger when lead hasn\'t responded within specified days',
      hasValue: true,
      valueLabel: 'Days'
    },
    { 
      value: 'not_seen', 
      label: 'Message Not Seen',
      description: 'Trigger when message is delivered but not seen after 24 hours',
      hasValue: false
    },
    { 
      value: 'seen_not_clicked', 
      label: 'Seen But Not Clicked',
      description: 'Trigger when message is seen but link not clicked after 12 hours',
      hasValue: false
    },
    { 
      value: 'clicked_no_response', 
      label: 'Clicked But No Response',
      description: 'Trigger when link is clicked but no response after 6 hours',
      hasValue: false
    }
  ];

  const actionTypes = [
    {
      value: 'send_message',
      label: 'Send Follow-up Message',
      description: 'Send another message using a template',
      icon: MessageSquare
    },
    {
      value: 'assign_counselor',
      label: 'Assign to Counselor',
      description: 'Route lead to human counselor for personal follow-up',
      icon: User
    },
    {
      value: 'change_status',
      label: 'Change Lead Status',
      description: 'Update lead status in CRM',
      icon: Settings
    }
  ];

  const mockFlows = [
    {
      id: '1',
      campaign: 'Scholarship Reminder Q1',
      trigger_condition: 'no_response_x_days',
      trigger_value: 3,
      action_type: 'send_message',
      action_config: { template_id: 'follow-up-1', channel: 'whatsapp' },
      is_active: true,
      created_at: '2024-01-15',
      triggered_count: 45,
      success_count: 12
    },
    {
      id: '2',
      campaign: 'Application Deadline Alert',
      trigger_condition: 'seen_not_clicked',
      trigger_value: null,
      action_type: 'assign_counselor',
      action_config: { counselor_priority: 'high' },
      is_active: true,
      created_at: '2024-01-12',
      triggered_count: 23,
      success_count: 18
    },
    {
      id: '3',
      campaign: 'Welcome Series - New Leads',
      trigger_condition: 'not_seen',
      trigger_value: null,
      action_type: 'send_message',
      action_config: { template_id: 'welcome-sms', channel: 'sms' },
      is_active: false,
      created_at: '2024-01-10',
      triggered_count: 67,
      success_count: 34
    }
  ];

  const handleSaveFlow = async () => {
    try {
      const { data: userData } = await supabase.auth.getUser();
      if (!userData.user) {
        toast.error('Please log in to create flows');
        return;
      }

      const { data, error } = await supabase
        .from('reengagement_flows')
        .insert([{
          ...formData,
          campaign_id: 'demo-campaign-id', // You'll need to select actual campaign
          created_by: userData.user.id
        }])
        .select()
        .single();

      if (error) throw error;

      toast.success('Re-engagement flow created successfully!');
      setIsCreating(false);
      setFormData({
        trigger_condition: 'no_response_x_days',
        trigger_value: 3,
        action_type: 'send_message',
        action_config: {},
        is_active: true
      });
      
      // Refresh flows
      // fetchFlows();
    } catch (error) {
      console.error('Error creating flow:', error);
      toast.error('Failed to create flow');
    }
  };

  const getTriggerLabel = (condition, value) => {
    const trigger = triggerConditions.find(t => t.value === condition);
    if (!trigger) return condition;
    
    return trigger.hasValue && value ? `${trigger.label} (${value} days)` : trigger.label;
  };

  const getActionLabel = (actionType) => {
    const action = actionTypes.find(a => a.value === actionType);
    return action ? action.label : actionType;
  };

  const getActionIcon = (actionType) => {
    const action = actionTypes.find(a => a.value === actionType);
    return action ? action.icon : Settings;
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">Re-engagement Flows</h2>
          <p className="text-muted-foreground">Automate follow-ups for inactive leads</p>
        </div>
        <Button onClick={() => setIsCreating(true)} className="flex items-center gap-2">
          <Plus className="w-4 h-4" />
          New Flow
        </Button>
      </div>

      {/* Flow Statistics */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card className="glass-card">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Active Flows</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-primary">
              {mockFlows.filter(f => f.is_active).length}
            </div>
          </CardContent>
        </Card>
        
        <Card className="glass-card">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Total Triggers</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-primary">
              {mockFlows.reduce((sum, f) => sum + f.triggered_count, 0)}
            </div>
          </CardContent>
        </Card>
        
        <Card className="glass-card">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Success Rate</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-primary">
              {((mockFlows.reduce((sum, f) => sum + f.success_count, 0) / 
                 mockFlows.reduce((sum, f) => sum + f.triggered_count, 0)) * 100).toFixed(1)}%
            </div>
          </CardContent>
        </Card>
        
        <Card className="glass-card">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Conversions</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-primary">
              {mockFlows.reduce((sum, f) => sum + f.success_count, 0)}
            </div>
          </CardContent>
        </Card>
      </div>

      {isCreating && (
        <Card className="glass-card">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Workflow className="w-5 h-5" />
              Create Re-engagement Flow
            </CardTitle>
            <CardDescription>Set up automated follow-up triggers and actions</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Trigger Configuration */}
            <div className="space-y-4">
              <div>
                <Label className="text-base font-medium">Trigger Condition</Label>
                <p className="text-sm text-muted-foreground">When should this flow be activated?</p>
              </div>
              
              <div className="space-y-4">
                {triggerConditions.map(trigger => (
                  <Card 
                    key={trigger.value}
                    className={`cursor-pointer transition-all ${
                      formData.trigger_condition === trigger.value
                        ? 'ring-2 ring-primary bg-primary/5'
                        : 'hover:shadow-md'
                    }`}
                    onClick={() => setFormData(prev => ({ 
                      ...prev, 
                      trigger_condition: trigger.value,
                      trigger_value: trigger.hasValue ? 3 : null
                    }))}
                  >
                    <CardContent className="p-4">
                      <div className="flex items-center justify-between">
                        <div>
                          <h4 className="font-medium">{trigger.label}</h4>
                          <p className="text-sm text-muted-foreground">{trigger.description}</p>
                        </div>
                        <div className="flex items-center gap-3">
                          {trigger.hasValue && formData.trigger_condition === trigger.value && (
                            <div className="flex items-center gap-2">
                              <Input
                                type="number"
                                placeholder="Days"
                                value={formData.trigger_value || ''}
                                onChange={(e) => setFormData(prev => ({ 
                                  ...prev, 
                                  trigger_value: parseInt(e.target.value) || null 
                                }))}
                                className="w-20"
                                min="1"
                                max="30"
                                onClick={(e) => e.stopPropagation()}
                              />
                              <span className="text-sm text-muted-foreground">days</span>
                            </div>
                          )}
                          <div className={`w-4 h-4 rounded-full border-2 ${
                            formData.trigger_condition === trigger.value
                              ? 'border-primary bg-primary'
                              : 'border-muted-foreground'
                          }`} />
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>

            <Separator />

            {/* Action Configuration */}
            <div className="space-y-4">
              <div>
                <Label className="text-base font-medium">Action to Take</Label>
                <p className="text-sm text-muted-foreground">What should happen when the trigger condition is met?</p>
              </div>
              
              <div className="space-y-4">
                {actionTypes.map(action => {
                  const Icon = action.icon;
                  return (
                    <Card 
                      key={action.value}
                      className={`cursor-pointer transition-all ${
                        formData.action_type === action.value
                          ? 'ring-2 ring-primary bg-primary/5'
                          : 'hover:shadow-md'
                      }`}
                      onClick={() => setFormData(prev => ({ ...prev, action_type: action.value }))}
                    >
                      <CardContent className="p-4">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-3">
                            <Icon className="w-5 h-5 text-primary" />
                            <div>
                              <h4 className="font-medium">{action.label}</h4>
                              <p className="text-sm text-muted-foreground">{action.description}</p>
                            </div>
                          </div>
                          <div className={`w-4 h-4 rounded-full border-2 ${
                            formData.action_type === action.value
                              ? 'border-primary bg-primary'
                              : 'border-muted-foreground'
                          }`} />
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            </div>

            {/* Additional Configuration */}
            {formData.action_type === 'send_message' && (
              <div className="space-y-4">
                <Separator />
                <div>
                  <Label className="text-base font-medium">Message Configuration</Label>
                  <p className="text-sm text-muted-foreground">Configure the follow-up message details</p>
                </div>
                
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label>Message Template</Label>
                    <Select>
                      <SelectTrigger>
                        <SelectValue placeholder="Select template" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="follow-up-1">Follow-up Template 1</SelectItem>
                        <SelectItem value="urgent-reminder">Urgent Reminder</SelectItem>
                        <SelectItem value="last-chance">Last Chance Offer</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  
                  <div className="space-y-2">
                    <Label>Fallback Channel</Label>
                    <Select>
                      <SelectTrigger>
                        <SelectValue placeholder="Select channel" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="sms">SMS</SelectItem>
                        <SelectItem value="email">Email</SelectItem>
                        <SelectItem value="whatsapp">WhatsApp</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </div>
            )}

            <Separator />

            {/* Flow Settings */}
            <div className="space-y-4">
              <div>
                <Label className="text-base font-medium">Flow Settings</Label>
              </div>
              
              <div className="flex items-center justify-between">
                <div>
                  <Label htmlFor="active-flow">Activate Flow</Label>
                  <p className="text-sm text-muted-foreground">Enable this flow to start processing triggers</p>
                </div>
                <Switch
                  id="active-flow"
                  checked={formData.is_active}
                  onCheckedChange={(checked) => setFormData(prev => ({ ...prev, is_active: checked }))}
                />
              </div>
            </div>

            {/* Action Buttons */}
            <div className="flex items-center gap-3 pt-4">
              <Button onClick={handleSaveFlow}>
                Create Flow
              </Button>
              <Button variant="outline" onClick={() => setIsCreating(false)}>
                Cancel
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Existing Flows */}
      <div className="space-y-4">
        {mockFlows.length === 0 ? (
          <Card className="glass-card">
            <CardContent className="text-center py-8">
              <Workflow className="w-12 h-12 mx-auto mb-4 opacity-50 text-muted-foreground" />
              <p className="text-muted-foreground">No re-engagement flows created yet. Create your first flow to automate follow-ups.</p>
            </CardContent>
          </Card>
        ) : (
          mockFlows.map(flow => {
            const ActionIcon = getActionIcon(flow.action_type);
            const successRate = flow.triggered_count > 0 ? (flow.success_count / flow.triggered_count * 100).toFixed(1) : 0;
            
            return (
              <Card key={flow.id} className="glass-card">
                <CardContent className="p-6">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-4">
                      <div className={`w-12 h-12 rounded-full flex items-center justify-center ${
                        flow.is_active ? 'bg-green-100 text-green-600' : 'bg-gray-100 text-gray-400'
                      }`}>
                        <ActionIcon className="w-6 h-6" />
                      </div>
                      
                      <div>
                        <div className="flex items-center gap-3 mb-1">
                          <h3 className="font-semibold">{flow.campaign}</h3>
                          <Badge variant={flow.is_active ? 'default' : 'secondary'}>
                            {flow.is_active ? 'Active' : 'Inactive'}
                          </Badge>
                        </div>
                        <div className="text-sm text-muted-foreground">
                          <span className="font-medium">Trigger:</span> {getTriggerLabel(flow.trigger_condition, flow.trigger_value)}
                        </div>
                        <div className="text-sm text-muted-foreground">
                          <span className="font-medium">Action:</span> {getActionLabel(flow.action_type)}
                        </div>
                      </div>
                    </div>
                    
                    <div className="text-right">
                      <div className="flex items-center gap-6 mb-2">
                        <div className="text-center">
                          <div className="text-lg font-bold text-primary">{flow.triggered_count}</div>
                          <div className="text-xs text-muted-foreground">Triggered</div>
                        </div>
                        <div className="text-center">
                          <div className="text-lg font-bold text-green-600">{flow.success_count}</div>
                          <div className="text-xs text-muted-foreground">Successful</div>
                        </div>
                        <div className="text-center">
                          <div className="text-lg font-bold text-blue-600">{successRate}%</div>
                          <div className="text-xs text-muted-foreground">Success Rate</div>
                        </div>
                      </div>
                      
                      <div className="flex items-center gap-2">
                        <Button size="sm" variant="outline">
                          {flow.is_active ? (
                            <>
                              <Pause className="w-3 h-3 mr-1" />
                              Pause
                            </>
                          ) : (
                            <>
                              <Play className="w-3 h-3 mr-1" />
                              Activate
                            </>
                          )}
                        </Button>
                        <Button size="sm" variant="outline">
                          <Edit className="w-3 h-3 mr-1" />
                          Edit
                        </Button>
                        <Button size="sm" variant="outline">
                          <Trash2 className="w-3 h-3" />
                        </Button>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })
        )}
      </div>
    </div>
  );
}
