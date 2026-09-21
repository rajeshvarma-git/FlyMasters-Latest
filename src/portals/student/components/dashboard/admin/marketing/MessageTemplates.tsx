import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@student/components/ui/card';
import { Button } from '@student/components/ui/button';
import { Input } from '@student/components/ui/input';
import { Label } from '@student/components/ui/label';
import { Textarea } from '@student/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@student/components/ui/select';
import { Badge } from '@student/components/ui/badge';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@student/components/ui/dialog';
import { Plus, Bot, MessageSquare, Phone, Mail, Edit, Trash2, Copy, Wand2 } from 'lucide-react';
import { supabase } from '@student/integrations/supabase/client';
import { toast } from 'sonner';

export function MessageTemplates() {
  const [templates, setTemplates] = useState([]);
  const [isCreating, setIsCreating] = useState(false);
  const [isGeneratingAI, setIsGeneratingAI] = useState(false);
  const [formData, setFormData] = useState({
    name: '',
    template_type: 'whatsapp',
    category: 'general',
    subject: '',
    content: '',
    tone: 'professional',
    variables_used: []
  });

  const templateTypes = [
    { value: 'whatsapp', label: 'WhatsApp', icon: MessageSquare },
    { value: 'sms', label: 'SMS', icon: Phone },
    { value: 'email', label: 'Email', icon: Mail },
    { value: 'call_script', label: 'Call Script', icon: Phone }
  ];

  const categories = [
    { value: 'general', label: 'General Outreach' },
    { value: 'scholarship', label: 'Scholarship Reminder' },
    { value: 'deadline', label: 'Application Deadline' },
    { value: 'welcome', label: 'Welcome Message' },
    { value: 'follow_up', label: 'Follow-up' },
    { value: 'offer', label: 'Special Offers' }
  ];

  const tones = [
    { value: 'professional', label: 'Professional' },
    { value: 'casual', label: 'Casual & Friendly' },
    { value: 'urgent', label: 'Urgent' },
    { value: 'encouraging', label: 'Encouraging' }
  ];

  const availableVariables = [
    '{first_name}', '{last_name}', '{full_name}', '{phone}', '{email}',
    '{country}', '{destination_country}', '{field_of_interest}', '{qualification_level}',
    '{current_date}', '{deadline_date}', '{counselor_name}', '{company_name}'
  ];

  const generateAITemplate = async () => {
    if (!formData.category || !formData.template_type || !formData.tone) {
      toast.error('Please select category, type, and tone first');
      return;
    }

    setIsGeneratingAI(true);
    
    try {
      // Call your AI generation edge function here
      const { data, error } = await supabase.functions.invoke('generate-marketing-template', {
        body: {
          category: formData.category,
          template_type: formData.template_type,
          tone: formData.tone
        }
      });

      if (error) throw error;

      setFormData(prev => ({
        ...prev,
        content: data.content,
        subject: data.subject || prev.subject,
        variables_used: data.variables_used || []
      }));

      toast.success('AI template generated successfully!');
    } catch (error) {
      console.error('Error generating AI template:', error);
      toast.error('Failed to generate AI template');
    } finally {
      setIsGeneratingAI(false);
    }
  };

  const handleSaveTemplate = async () => {
    if (!formData.name || !formData.content) {
      toast.error('Please provide template name and content');
      return;
    }

    try {
      const { data: userData } = await supabase.auth.getUser();
      if (!userData.user) {
        toast.error('Please log in to save templates');
        return;
      }

      const { data, error } = await supabase
        .from('message_templates')
        .insert([{
          ...formData,
          created_by: userData.user.id,
          is_ai_generated: isGeneratingAI
        }])
        .select()
        .single();

      if (error) throw error;

      toast.success('Template saved successfully!');
      setIsCreating(false);
      setFormData({
        name: '',
        template_type: 'whatsapp',
        category: 'general',
        subject: '',
        content: '',
        tone: 'professional',
        variables_used: []
      });
      
      fetchTemplates();
    } catch (error) {
      console.error('Error saving template:', error);
      toast.error('Failed to save template');
    }
  };

  const fetchTemplates = async () => {
    try {
      const { data, error } = await supabase
        .from('message_templates')
        .select('*')
        .eq('is_active', true)
        .order('created_at', { ascending: false });

      if (error) throw error;
      setTemplates(data || []);
    } catch (error) {
      console.error('Error fetching templates:', error);
    }
  };

  const insertVariable = (variable: string) => {
    const textarea = document.getElementById('template-content') as HTMLTextAreaElement;
    if (textarea) {
      const start = textarea.selectionStart;
      const end = textarea.selectionEnd;
      const currentContent = formData.content;
      
      const newContent = currentContent.substring(0, start) + variable + currentContent.substring(end);
      setFormData(prev => ({
        ...prev,
        content: newContent,
        variables_used: [...new Set([...prev.variables_used, variable])]
      }));
      
      // Focus back on textarea
      setTimeout(() => {
        textarea.focus();
        textarea.setSelectionRange(start + variable.length, start + variable.length);
      }, 0);
    }
  };

  const getTypeIcon = (type) => {
    const typeObj = templateTypes.find(t => t.value === type);
    return typeObj ? typeObj.icon : MessageSquare;
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">Message Templates</h2>
          <p className="text-muted-foreground">Create and manage AI-powered message templates</p>
        </div>
        <Button onClick={() => setIsCreating(true)} className="flex items-center gap-2">
          <Plus className="w-4 h-4" />
          New Template
        </Button>
      </div>

      {isCreating && (
        <Card className="glass-card">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Bot className="w-5 h-5" />
              Create Message Template
            </CardTitle>
            <CardDescription>Create personalized templates with AI assistance</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Basic Information */}
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="template-name">Template Name</Label>
                <Input
                  id="template-name"
                  placeholder="Enter template name"
                  value={formData.name}
                  onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
                />
              </div>
              <div className="space-y-2">
                <Label>Template Type</Label>
                <Select value={formData.template_type} onValueChange={(value) => setFormData(prev => ({ ...prev, template_type: value }))}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {templateTypes.map(type => (
                      <SelectItem key={type.value} value={type.value}>
                        <div className="flex items-center gap-2">
                          <type.icon className="w-4 h-4" />
                          {type.label}
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label>Category</Label>
                <Select value={formData.category} onValueChange={(value) => setFormData(prev => ({ ...prev, category: value }))}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {categories.map(category => (
                      <SelectItem key={category.value} value={category.value}>
                        {category.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Tone</Label>
                <Select value={formData.tone} onValueChange={(value) => setFormData(prev => ({ ...prev, tone: value }))}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {tones.map(tone => (
                      <SelectItem key={tone.value} value={tone.value}>
                        {tone.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* AI Generation */}
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <Label className="text-base font-medium">Message Content</Label>
                <Button 
                  onClick={generateAITemplate} 
                  disabled={isGeneratingAI}
                  variant="outline" 
                  size="sm"
                  className="flex items-center gap-2"
                >
                  <Wand2 className="w-4 h-4" />
                  {isGeneratingAI ? 'Generating...' : 'Generate with AI'}
                </Button>
              </div>

              {(formData.template_type === 'email' || formData.template_type === 'whatsapp') && (
                <div className="space-y-2">
                  <Label htmlFor="template-subject">Subject Line</Label>
                  <Input
                    id="template-subject"
                    placeholder="Enter subject line"
                    value={formData.subject}
                    onChange={(e) => setFormData(prev => ({ ...prev, subject: e.target.value }))}
                  />
                </div>
              )}

              <div>
                <Textarea
                  id="template-content"
                  placeholder="Enter your message content..."
                  value={formData.content}
                  onChange={(e) => setFormData(prev => ({ ...prev, content: e.target.value }))}
                  rows={6}
                />
              </div>

              {/* Variable Insertion */}
              <div className="space-y-2">
                <Label className="text-sm font-medium">Insert Variables</Label>
                <div className="flex flex-wrap gap-2">
                  {availableVariables.map(variable => (
                    <Button
                      key={variable}
                      variant="outline"
                      size="sm"
                      onClick={() => insertVariable(variable)}
                      className="text-xs"
                    >
                      {variable}
                    </Button>
                  ))}
                </div>
              </div>

              {formData.variables_used.length > 0 && (
                <div className="space-y-2">
                  <Label className="text-sm font-medium">Variables Used</Label>
                  <div className="flex flex-wrap gap-2">
                    {formData.variables_used.map(variable => (
                      <Badge key={variable} variant="secondary">
                        {variable}
                      </Badge>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Preview */}
            {formData.content && (
              <div className="space-y-2">
                <Label className="text-sm font-medium">Preview</Label>
                <div className="p-4 bg-muted rounded-lg">
                  <div className="whitespace-pre-wrap text-sm">
                    {formData.subject && (
                      <div className="font-medium mb-2">Subject: {formData.subject}</div>
                    )}
                    {formData.content}
                  </div>
                </div>
              </div>
            )}

            {/* Action Buttons */}
            <div className="flex items-center gap-3 pt-4">
              <Button onClick={handleSaveTemplate}>
                Save Template
              </Button>
              <Button variant="outline" onClick={() => setIsCreating(false)}>
                Cancel
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Templates List */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {templates.length === 0 ? (
          <Card className="glass-card col-span-full">
            <CardContent className="text-center py-8">
              <Bot className="w-12 h-12 mx-auto mb-4 opacity-50 text-muted-foreground" />
              <p className="text-muted-foreground">No templates created yet. Create your first template to get started.</p>
            </CardContent>
          </Card>
        ) : (
          templates.map(template => {
            const TypeIcon = getTypeIcon(template.template_type);
            return (
              <Card key={template.id} className="glass-card hover:shadow-hover transition-all">
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <TypeIcon className="w-5 h-5 text-primary" />
                      <CardTitle className="text-lg">{template.name}</CardTitle>
                    </div>
                    <div className="flex items-center gap-2">
                      {template.is_ai_generated && (
                        <Badge variant="secondary" className="text-xs">
                          <Bot className="w-3 h-3 mr-1" />
                          AI
                        </Badge>
                      )}
                      <Badge variant="outline" className="text-xs">
                        {template.category}
                      </Badge>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant="secondary" className="text-xs">
                      {template.template_type}
                    </Badge>
                    <Badge variant="outline" className="text-xs">
                      {template.tone}
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    {template.subject && (
                      <div>
                        <Label className="text-xs text-muted-foreground">Subject</Label>
                        <p className="text-sm font-medium truncate">{template.subject}</p>
                      </div>
                    )}
                    <div>
                      <Label className="text-xs text-muted-foreground">Content Preview</Label>
                      <p className="text-sm line-clamp-3">{template.content}</p>
                    </div>
                    {template.variables_used && template.variables_used.length > 0 && (
                      <div>
                        <Label className="text-xs text-muted-foreground">Variables</Label>
                        <div className="flex flex-wrap gap-1 mt-1">
                          {template.variables_used.slice(0, 3).map(variable => (
                            <Badge key={variable} variant="outline" className="text-xs">
                              {variable}
                            </Badge>
                          ))}
                          {template.variables_used.length > 3 && (
                            <Badge variant="outline" className="text-xs">
                              +{template.variables_used.length - 3}
                            </Badge>
                          )}
                        </div>
                      </div>
                    )}
                    <div className="flex items-center gap-2 pt-2">
                      <Button size="sm" variant="outline" className="flex-1">
                        <Edit className="w-3 h-3 mr-1" />
                        Edit
                      </Button>
                      <Button size="sm" variant="outline">
                        <Copy className="w-3 h-3" />
                      </Button>
                      <Button size="sm" variant="outline">
                        <Trash2 className="w-3 h-3" />
                      </Button>
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