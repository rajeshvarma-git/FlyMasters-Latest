import { useState, useEffect } from 'react';
import { supabase } from '@student/integrations/supabase/client';
import { useAuth } from '@student/hooks/useAuth';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@student/components/ui/card';
import { Button } from '@student/components/ui/button';
import { Input } from '@student/components/ui/input';
import { Textarea } from '@student/components/ui/textarea';
import { Badge } from '@student/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@student/components/ui/select';
import { Switch } from '@student/components/ui/switch';
import { useToast } from '@student/hooks/use-toast';
import { Plus, Edit, Trash2, FileText, Globe, CheckCircle2, XCircle, Archive } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@student/components/ui/dialog';
import { Label } from '@student/components/ui/label';
import { Tables } from '@student/integrations/supabase/types';
import { MultiSelect, MultiSelectOption } from '@student/components/ui/multi-select';

type DocumentChecklist = Tables<'document_checklists'>;

interface DocumentChecklistFormData {
  countries: string[];
  degree_types: string[];
  document_type: string;
  description: string;
  is_required: boolean;
  is_active: boolean;
  max_file_size_mb: number;
  allowed_file_types: string[];
  activation_notes: string;
}

export function DocumentChecklistAdmin() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [checklists, setChecklists] = useState<DocumentChecklist[]>([]);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<DocumentChecklist | null>(null);
  const [countryFilter, setCountryFilter] = useState<string>('all');
  const [degreeFilter, setDegreeFilter] = useState<string>('all');
  
  const [formData, setFormData] = useState<DocumentChecklistFormData>({
    countries: [],
    degree_types: [],
    document_type: '',
    description: '',
    is_required: true,
    is_active: true,
    max_file_size_mb: 20,
    allowed_file_types: ['pdf', 'jpg', 'jpeg', 'png', 'doc', 'docx'],
    activation_notes: ''
  });

  const [availableCountries, setAvailableCountries] = useState<MultiSelectOption[]>([]);
  const [availableDegreeTypes, setAvailableDegreeTypes] = useState<MultiSelectOption[]>([]);
  const fileTypeOptions = [
    { value: 'pdf', label: 'PDF' },
    { value: 'jpg', label: 'JPG' },
    { value: 'jpeg', label: 'JPEG' },
    { value: 'png', label: 'PNG' },
    { value: 'doc', label: 'DOC' },
    { value: 'docx', label: 'DOCX' }
  ];

  useEffect(() => {
    fetchChecklists();
    fetchOptions();
  }, []);

  const fetchOptions = async () => {
    try {
      const [countriesRes, degreesRes] = await Promise.all([
        supabase.from('document_countries').select('*').eq('is_active', true).order('display_order'),
        supabase.from('document_degree_types').select('*').eq('is_active', true).order('display_order')
      ]);

      if (countriesRes.data) {
        setAvailableCountries(countriesRes.data.map(c => ({ value: c.name, label: c.name })));
      }
      if (degreesRes.data) {
        setAvailableDegreeTypes(degreesRes.data.map(d => ({ value: d.name, label: d.name })));
      }
    } catch (error) {
      console.error('Error fetching options:', error);
    }
  };

  const fetchChecklists = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('document_checklists')
        .select('*')
        .order('country', { ascending: true })
        .order('degree_type', { ascending: true })
        .order('document_type', { ascending: true });

      if (error) throw error;
      setChecklists(data || []);
    } catch (error: any) {
      console.error('Error fetching document checklists:', error);
      toast({
        title: "Error",
        description: "Failed to load document checklists.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (formData.countries.length === 0 || formData.degree_types.length === 0) {
      toast({
        title: "Error",
        description: "Please select at least one country and one degree type.",
        variant: "destructive",
      });
      return;
    }
    
    try {
      const payload = {
        ...formData,
        // Maintain backward compatibility
        country: formData.countries[0] || '',
        degree_type: formData.degree_types[0] || '',
        last_modified_by: user?.id,
        ...(editingItem ? {} : { created_by: user?.id })
      };

      if (editingItem) {
        const { error } = await supabase
          .from('document_checklists')
          .update(payload)
          .eq('id', editingItem.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('document_checklists')
          .insert(payload);
        if (error) throw error;
      }

      toast({
        title: "Success",
        description: `Document requirement ${editingItem ? 'updated' : 'created'} successfully.`,
      });

      resetForm();
      fetchChecklists();
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    }
  };

  const handleEdit = (item: DocumentChecklist) => {
    setEditingItem(item);
    setFormData({
      countries: item.countries || [],
      degree_types: item.degree_types || [],
      document_type: item.document_type,
      description: item.description || '',
      is_required: item.is_required,
      is_active: item.is_active || true,
      max_file_size_mb: item.max_file_size_mb || 20,
      allowed_file_types: item.allowed_file_types || ['pdf', 'jpg', 'jpeg', 'png', 'doc', 'docx'],
      activation_notes: item.activation_notes || ''
    });
    setIsFormOpen(true);
  };

  const handleDelete = async (id: string) => {
    try {
      const { error } = await supabase
        .from('document_checklists')
        .delete()
        .eq('id', id);

      if (error) throw error;

      toast({
        title: "Success",
        description: "Document requirement deleted successfully.",
      });
      fetchChecklists();
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    }
  };

  const toggleActive = async (item: DocumentChecklist) => {
    try {
      const { error } = await supabase
        .from('document_checklists')
        .update({ 
          is_active: !item.is_active,
          last_modified_by: user?.id 
        })
        .eq('id', item.id);

      if (error) throw error;

      toast({
        title: "Success",
        description: `Document requirement ${!item.is_active ? 'activated' : 'deactivated'} successfully.`,
      });
      fetchChecklists();
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    }
  };

  const resetForm = () => {
    setFormData({
      countries: [],
      degree_types: [],
      document_type: '',
      description: '',
      is_required: true,
      is_active: true,
      max_file_size_mb: 20,
      allowed_file_types: ['pdf', 'jpg', 'jpeg', 'png', 'doc', 'docx'],
      activation_notes: ''
    });
    setEditingItem(null);
    setIsFormOpen(false);
  };

  const filteredChecklists = checklists.filter(item => {
    if (countryFilter !== 'all' && !item.countries?.includes(countryFilter)) return false;
    if (degreeFilter !== 'all' && !item.degree_types?.includes(degreeFilter)) return false;
    return true;
  });

  const uniqueCountries = [...new Set(checklists.flatMap(item => item.countries || []))];
  const uniqueDegreeTypes = [...new Set(checklists.flatMap(item => item.degree_types || []))];

  if (loading) {
    return (
      <div className="space-y-6">
        <h2 className="text-2xl font-bold">Document Requirements Management</h2>
        <div className="grid gap-4">
          {[...Array(5)].map((_, i) => (
            <Card key={i} className="glass-card animate-pulse">
              <CardContent className="p-6">
                <div className="h-6 bg-muted/20 rounded w-1/3 mb-2"></div>
                <div className="h-4 bg-muted/20 rounded w-1/2 mb-4"></div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">Document Requirements Management</h2>
          <p className="text-muted-foreground">Define and manage document requirements for each country and degree type</p>
        </div>
        <Dialog open={isFormOpen} onOpenChange={setIsFormOpen}>
          <DialogTrigger asChild>
            <Button onClick={() => resetForm()}>
              <Plus className="w-4 h-4 mr-2" />
              Add Requirement
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>{editingItem ? 'Edit' : 'Add'} Document Requirement</DialogTitle>
            </DialogHeader>
            
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Countries *</Label>
                  <MultiSelect
                    options={availableCountries}
                    value={formData.countries}
                    onChange={(value) => setFormData(prev => ({ ...prev, countries: value }))}
                    placeholder="Select countries"
                    emptyMessage="No countries found."
                  />
                  <p className="text-xs text-muted-foreground">
                    Select one or more countries where this document is required
                  </p>
                </div>
                
                <div className="space-y-2">
                  <Label>Degree Types *</Label>
                  <MultiSelect
                    options={availableDegreeTypes}
                    value={formData.degree_types}
                    onChange={(value) => setFormData(prev => ({ ...prev, degree_types: value }))}
                    placeholder="Select degree types"
                    emptyMessage="No degree types found."
                  />
                  <p className="text-xs text-muted-foreground">
                    Select one or more degree types that require this document
                  </p>
                </div>
              </div>

              <div className="space-y-2">
                <Label>Document Type</Label>
                <Input
                  value={formData.document_type}
                  onChange={(e) => setFormData(prev => ({ ...prev, document_type: e.target.value }))}
                  placeholder="e.g., Passport, Transcripts, IELTS/TOEFL"
                  required
                />
              </div>

              <div className="space-y-2">
                <Label>Description</Label>
                <Textarea
                  value={formData.description}
                  onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
                  placeholder="Detailed description of the document requirement"
                  rows={3}
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="flex items-center space-x-2">
                  <Switch
                    id="is_required"
                    checked={formData.is_required}
                    onCheckedChange={(checked) => setFormData(prev => ({ ...prev, is_required: checked }))}
                  />
                  <Label htmlFor="is_required">Mandatory Document</Label>
                </div>

                <div className="flex items-center space-x-2">
                  <Switch
                    id="is_active"
                    checked={formData.is_active}
                    onCheckedChange={(checked) => setFormData(prev => ({ ...prev, is_active: checked }))}
                  />
                  <Label htmlFor="is_active">Currently Active</Label>
                </div>
              </div>

              <div className="space-y-2">
                <Label>Max File Size (MB)</Label>
                <Input
                  type="number"
                  min="1"
                  max="25"
                  value={formData.max_file_size_mb}
                  onChange={(e) => setFormData(prev => ({ ...prev, max_file_size_mb: parseInt(e.target.value) || 20 }))}
                />
              </div>

              <div className="space-y-2">
                <Label>Allowed File Types</Label>
                <div className="grid grid-cols-3 gap-2">
                  {fileTypeOptions.map(option => (
                    <div key={option.value} className="flex items-center space-x-2">
                      <input
                        type="checkbox"
                        id={option.value}
                        checked={formData.allowed_file_types.includes(option.value)}
                        onChange={(e) => {
                          if (e.target.checked) {
                            setFormData(prev => ({
                              ...prev,
                              allowed_file_types: [...prev.allowed_file_types, option.value]
                            }));
                          } else {
                            setFormData(prev => ({
                              ...prev,
                              allowed_file_types: prev.allowed_file_types.filter(type => type !== option.value)
                            }));
                          }
                        }}
                      />
                      <Label htmlFor={option.value}>{option.label}</Label>
                    </div>
                  ))}
                </div>
              </div>

              <div className="space-y-2">
                <Label>Activation Notes</Label>
                <Textarea
                  value={formData.activation_notes}
                  onChange={(e) => setFormData(prev => ({ ...prev, activation_notes: e.target.value }))}
                  placeholder="Notes about when/why this requirement should be activated"
                  rows={2}
                />
              </div>

              <div className="flex gap-2">
                <Button type="submit">
                  {editingItem ? 'Update' : 'Create'} Requirement
                </Button>
                <Button type="button" variant="outline" onClick={resetForm}>
                  Cancel
                </Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {/* Filters */}
      <Card className="glass-card">
        <CardContent className="p-4">
          <div className="flex gap-4">
            <div className="flex-1">
              <Label>Filter by Country</Label>
              <Select value={countryFilter} onValueChange={setCountryFilter}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Countries</SelectItem>
                  {uniqueCountries.map(country => (
                    <SelectItem key={country} value={country}>{country}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex-1">
              <Label>Filter by Degree</Label>
              <Select value={degreeFilter} onValueChange={setDegreeFilter}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Degrees</SelectItem>
                  {uniqueDegreeTypes.map(type => (
                    <SelectItem key={type} value={type}>{type}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Document Requirements List */}
      <div className="grid gap-4">
        {filteredChecklists.length === 0 ? (
          <Card className="glass-card">
            <CardContent className="p-12 text-center">
              <FileText className="w-16 h-16 text-muted-foreground mx-auto mb-4" />
              <h3 className="text-xl font-semibold mb-2">No Document Requirements Found</h3>
              <p className="text-muted-foreground">
                No document requirements match the current filters. Try adjusting the filters or create a new requirement.
              </p>
            </CardContent>
          </Card>
        ) : (
          filteredChecklists.map((item) => (
            <Card key={item.id} className="glass-card">
              <CardHeader>
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <CardTitle className="flex items-center gap-2">
                      <Globe className="w-5 h-5" />
                      {item.document_type}
                      {item.is_required && <Badge variant="destructive">Mandatory</Badge>}
                      {!item.is_active && <Badge variant="secondary">Inactive</Badge>}
                    </CardTitle>
                    <CardDescription>
                      <div className="space-y-1">
                        <div className="flex flex-wrap gap-1">
                          <strong>Countries:</strong>
                          {(item.countries || []).map(country => (
                            <Badge key={country} variant="outline">{country}</Badge>
                          ))}
                        </div>
                        <div className="flex flex-wrap gap-1">
                          <strong>Degrees:</strong>
                          {(item.degree_types || []).map(degree => (
                            <Badge key={degree} variant="outline">{degree}</Badge>
                          ))}
                        </div>
                        <div>
                          Max size: {item.max_file_size_mb || 20}MB | Types: {(item.allowed_file_types || ['pdf']).join(', ')}
                        </div>
                        <div>{item.description}</div>
                      </div>
                    </CardDescription>
                  </div>
                  
                  <div className="flex items-center gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => toggleActive(item)}
                    >
                      {item.is_active ? (
                        <>
                          <XCircle className="w-4 h-4 mr-1" />
                          Deactivate
                        </>
                      ) : (
                        <>
                          <CheckCircle2 className="w-4 h-4 mr-1" />
                          Activate
                        </>
                      )}
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => handleEdit(item)}
                    >
                      <Edit className="w-4 h-4 mr-1" />
                      Edit
                    </Button>
                    <Button
                      size="sm"
                      variant="destructive"
                      onClick={() => handleDelete(item.id)}
                    >
                      <Trash2 className="w-4 h-4 mr-1" />
                      Delete
                    </Button>
                  </div>
                </div>
              </CardHeader>
              
              {item.activation_notes && (
                <CardContent className="pt-0">
                  <div className="bg-muted/50 p-3 rounded-lg">
                    <p className="text-sm"><strong>Activation Notes:</strong> {item.activation_notes}</p>
                  </div>
                </CardContent>
              )}
            </Card>
          ))
        )}
      </div>
    </div>
  );
}