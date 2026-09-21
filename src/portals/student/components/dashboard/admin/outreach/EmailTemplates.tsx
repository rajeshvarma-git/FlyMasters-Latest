import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@student/components/ui/card';
import { Button } from '@student/components/ui/button';
import { Input } from '@student/components/ui/input';
import { Label } from '@student/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@student/components/ui/select';
import { Badge } from '@student/components/ui/badge';
import { Textarea } from '@student/components/ui/textarea';
import { useToast } from '@student/components/ui/use-toast';
import { supabase } from '@student/integrations/supabase/client';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@student/components/ui/dialog';
import { Mail, Plus, Edit, Eye, Wand2, Copy, Trash2 } from 'lucide-react';

interface EmailTemplate {
  id: string;
  name: string;
  subject_template: string;
  body_template: string;
  template_type: string;
  region?: string;
  tone: string;
  is_active: boolean;
  variables_used: string[];
  created_at: string;
}

export function EmailTemplates() {
  const { toast } = useToast();
  const [templates, setTemplates] = useState<EmailTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<EmailTemplate | null>(null);
  const [generatingAI, setGeneratingAI] = useState(false);

  // Form state
  const [templateForm, setTemplateForm] = useState({
    name: '',
    subject_template: '',
    body_template: '',
    template_type: 'outreach',
    region: '',
    tone: 'professional',
    variables_used: [] as string[]
  });

  useEffect(() => {
    fetchTemplates();
  }, []);

  const fetchTemplates = async () => {
    try {
      const { data, error } = await supabase
        .from('email_templates')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      setTemplates(data || []);
    } catch (error) {
      console.error('Error fetching templates:', error);
      toast({
        title: 'Error',
        description: 'Failed to fetch email templates',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const generateAITemplate = async () => {
    if (!templateForm.region || !templateForm.template_type) {
      toast({
        title: 'Missing Information',
        description: 'Please select region and template type first',
        variant: 'destructive',
      });
      return;
    }

    setGeneratingAI(true);
    try {
      // This would call an OpenAI edge function to generate the template
      const { data, error } = await supabase.functions.invoke('generate-email-template', {
        body: {
          region: templateForm.region,
          template_type: templateForm.template_type,
          tone: templateForm.tone
        }
      });

      if (error) throw error;

      setTemplateForm({
        ...templateForm,
        subject_template: data.subject || '',
        body_template: data.body || '',
        variables_used: data.variables || []
      });

      toast({
        title: 'Success',
        description: 'AI template generated successfully',
      });
    } catch (error) {
      console.error('Error generating AI template:', error);
      toast({
        title: 'Error',
        description: 'Failed to generate AI template. Feature coming soon!',
        variant: 'destructive',
      });
    } finally {
      setGeneratingAI(false);
    }
  };

  const handleSaveTemplate = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      if (editingTemplate) {
        const { error } = await supabase
          .from('email_templates')
          .update(templateForm)
          .eq('id', editingTemplate.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('email_templates')
          .insert([templateForm]);
        if (error) throw error;
      }

      toast({
        title: 'Success',
        description: `Template ${editingTemplate ? 'updated' : 'created'} successfully`,
      });

      setShowCreateDialog(false);
      setEditingTemplate(null);
      resetForm();
      fetchTemplates();
    } catch (error) {
      console.error('Error saving template:', error);
      toast({
        title: 'Error',
        description: 'Failed to save template',
        variant: 'destructive',
      });
    }
  };

  const resetForm = () => {
    setTemplateForm({
      name: '',
      subject_template: '',
      body_template: '',
      template_type: 'outreach',
      region: '',
      tone: 'professional',
      variables_used: []
    });
  };

  const handleEdit = (template: EmailTemplate) => {
    setEditingTemplate(template);
    setTemplateForm({
      name: template.name,
      subject_template: template.subject_template,
      body_template: template.body_template,
      template_type: template.template_type,
      region: template.region || '',
      tone: template.tone,
      variables_used: template.variables_used
    });
    setShowCreateDialog(true);
  };

  const toggleTemplateStatus = async (id: string, currentStatus: boolean) => {
    try {
      const { error } = await supabase
        .from('email_templates')
        .update({ is_active: !currentStatus })
        .eq('id', id);

      if (error) throw error;

      toast({
        title: 'Success',
        description: `Template ${!currentStatus ? 'activated' : 'deactivated'}`,
      });
      fetchTemplates();
    } catch (error) {
      console.error('Error updating template status:', error);
      toast({
        title: 'Error',
        description: 'Failed to update template status',
        variant: 'destructive',
      });
    }
  };

  const deleteTemplate = async (id: string) => {
    if (!confirm('Are you sure you want to delete this template?')) return;

    try {
      const { error } = await supabase
        .from('email_templates')
        .delete()
        .eq('id', id);

      if (error) throw error;

      toast({
        title: 'Success',
        description: 'Template deleted successfully',
      });
      fetchTemplates();
    } catch (error) {
      console.error('Error deleting template:', error);
      toast({
        title: 'Error',
        description: 'Failed to delete template',
        variant: 'destructive',
      });
    }
  };

  const getTemplateTypeBadge = (type: string) => {
    const config = {
      outreach: { label: 'Outreach', variant: 'default' as const },
      follow_up: { label: 'Follow-up', variant: 'secondary' as const },
      reply: { label: 'Reply', variant: 'outline' as const },
      closing: { label: 'Closing', variant: 'destructive' as const }
    };
    const typeConfig = config[type as keyof typeof config] || config.outreach;
    return <Badge variant={typeConfig.variant}>{typeConfig.label}</Badge>;
  };

  if (loading) {
    return <div className="p-6">Loading templates...</div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">Email Templates</h2>
          <p className="text-muted-foreground">Create and manage AI-powered email templates</p>
        </div>
        <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
          <DialogTrigger asChild>
            <Button onClick={() => { resetForm(); setEditingTemplate(null); }}>
              <Plus className="w-4 h-4 mr-2" />
              Create Template
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>{editingTemplate ? 'Edit' : 'Create'} Email Template</DialogTitle>
              <DialogDescription>
                Create personalized email templates for different regions and use cases
              </DialogDescription>
            </DialogHeader>
            <form onSubmit={handleSaveTemplate} className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="name">Template Name *</Label>
                  <Input
                    id="name"
                    value={templateForm.name}
                    onChange={(e) => setTemplateForm({...templateForm, name: e.target.value})}
                    required
                  />
                </div>
                <div>
                  <Label htmlFor="template_type">Template Type</Label>
                  <Select value={templateForm.template_type} onValueChange={(value) => setTemplateForm({...templateForm, template_type: value})}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="outreach">Initial Outreach</SelectItem>
                      <SelectItem value="follow_up">Follow-up</SelectItem>
                      <SelectItem value="reply">Reply</SelectItem>
                      <SelectItem value="closing">Closing</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label htmlFor="region">Target Region</Label>
                  <Select value={templateForm.region} onValueChange={(value) => setTemplateForm({...templateForm, region: value})}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select region" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Europe">Europe</SelectItem>
                      <SelectItem value="USA">USA</SelectItem>
                      <SelectItem value="Canada">Canada</SelectItem>
                      <SelectItem value="Australia">Australia</SelectItem>
                      <SelectItem value="UK">UK</SelectItem>
                      <SelectItem value="Asia">Asia</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label htmlFor="tone">Email Tone</Label>
                  <Select value={templateForm.tone} onValueChange={(value) => setTemplateForm({...templateForm, tone: value})}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="formal">Formal</SelectItem>
                      <SelectItem value="professional">Professional</SelectItem>
                      <SelectItem value="casual">Casual</SelectItem>
                      <SelectItem value="friendly">Friendly</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="flex gap-2">
                <Button type="button" onClick={generateAITemplate} disabled={generatingAI} variant="outline">
                  <Wand2 className="w-4 h-4 mr-2" />
                  {generatingAI ? 'Generating...' : 'Generate with AI'}
                </Button>
              </div>

              <div>
                <Label htmlFor="subject">Subject Template *</Label>
                <Input
                  id="subject"
                  value={templateForm.subject_template}
                  onChange={(e) => setTemplateForm({...templateForm, subject_template: e.target.value})}
                  placeholder="Partnership Opportunity with {university_name}"
                  required
                />
              </div>

              <div>
                <Label htmlFor="body">Email Body Template *</Label>
                <Textarea
                  id="body"
                  value={templateForm.body_template}
                  onChange={(e) => setTemplateForm({...templateForm, body_template: e.target.value})}
                  placeholder="Dear {contact_person},&#10;&#10;I hope this email finds you well..."
                  rows={10}
                  required
                />
              </div>

              <div className="text-sm text-muted-foreground">
                <p className="mb-2">Available variables:</p>
                <div className="flex flex-wrap gap-1">
                  {['{university_name}', '{contact_person}', '{country}', '{region}', '{student_count}', '{our_company}'].map(variable => (
                    <Badge key={variable} variant="outline" className="text-xs">{variable}</Badge>
                  ))}
                </div>
              </div>

              <div className="flex gap-2">
                <Button type="submit">{editingTemplate ? 'Update' : 'Create'} Template</Button>
                <Button type="button" variant="outline" onClick={() => setShowCreateDialog(false)}>
                  Cancel
                </Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {/* Templates List */}
      <div className="grid gap-4">
        {templates.map((template) => (
          <Card key={template.id} className="glass-card">
            <CardContent className="p-6">
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-2">
                    <h3 className="text-lg font-semibold">{template.name}</h3>
                    {getTemplateTypeBadge(template.template_type)}
                    {template.region && (
                      <Badge variant="outline">{template.region}</Badge>
                    )}
                    <Badge variant={template.is_active ? 'default' : 'secondary'}>
                      {template.is_active ? 'Active' : 'Inactive'}
                    </Badge>
                  </div>
                  
                  <div className="space-y-2 mb-4">
                    <div>
                      <p className="text-sm font-medium text-muted-foreground">Subject:</p>
                      <p className="text-sm">{template.subject_template}</p>
                    </div>
                    <div>
                      <p className="text-sm font-medium text-muted-foreground">Body Preview:</p>
                      <p className="text-sm line-clamp-3">{template.body_template}</p>
                    </div>
                  </div>

                  {template.variables_used.length > 0 && (
                    <div className="flex flex-wrap gap-1 mb-2">
                      {template.variables_used.map(variable => (
                        <Badge key={variable} variant="outline" className="text-xs">{variable}</Badge>
                      ))}
                    </div>
                  )}
                </div>

                <div className="flex flex-col gap-2 ml-4">
                  <Button variant="outline" size="sm" onClick={() => handleEdit(template)}>
                    <Edit className="w-4 h-4 mr-1" />
                    Edit
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => toggleTemplateStatus(template.id, template.is_active)}
                  >
                    {template.is_active ? 'Deactivate' : 'Activate'}
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => deleteTemplate(template.id)}
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

      {templates.length === 0 && (
        <Card className="glass-card">
          <CardContent className="p-12 text-center">
            <Mail className="w-16 h-16 text-muted-foreground mx-auto mb-4" />
            <h3 className="text-xl font-semibold mb-2">No Email Templates</h3>
            <p className="text-muted-foreground mb-4">
              Create your first email template to get started with outreach campaigns.
            </p>
            <Button onClick={() => setShowCreateDialog(true)}>
              <Plus className="w-4 h-4 mr-2" />
              Create First Template
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}