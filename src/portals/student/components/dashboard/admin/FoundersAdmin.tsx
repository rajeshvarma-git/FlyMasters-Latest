import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@student/components/ui/card';
import { Button } from '@student/components/ui/button';
import { Input } from '@student/components/ui/input';
import { Textarea } from '@student/components/ui/textarea';
import { Switch } from '@student/components/ui/switch';
import { Badge } from '@student/components/ui/badge';
import { Plus, Edit3, Save, Trash2, User, X, Tag } from 'lucide-react';
import { supabase } from '@student/integrations/supabase/client';
import { useToast } from '@student/hooks/use-toast';

interface Founder {
  id: string;
  name: string;
  title: string;
  bio: string;
  image_url: string | null;
  experience_years: number;
  countries_worked: string[];
  specializations: string[];
  linkedin_url: string | null;
  is_active: boolean;
  display_order: number;
}

export const FoundersAdmin = () => {
  const [founders, setFounders] = useState<Founder[]>([]);
  const [editing, setEditing] = useState<Founder | null>(null);
  const [isAdding, setIsAdding] = useState(false);
  const [newCountry, setNewCountry] = useState('');
  const [newSpec, setNewSpec] = useState('');
  const { toast } = useToast();

  useEffect(() => {
    fetchFounders();
  }, []);

  const fetchFounders = async () => {
    const { data, error } = await supabase
      .from('founders')
      .select('*')
      .order('display_order');
    
    if (error) {
      toast({
        title: 'Error',
        description: 'Failed to fetch founders',
        variant: 'destructive'
      });
    } else if (data) {
      setFounders(data as any);
    }
  };

  const handleSave = async (founder: Founder) => {
    const { error } = await supabase
      .from('founders')
      .update({
        name: founder.name,
        title: founder.title,
        bio: founder.bio,
        image_url: founder.image_url,
        experience_years: founder.experience_years,
        countries_worked: founder.countries_worked,
        specializations: founder.specializations,
        linkedin_url: founder.linkedin_url,
        is_active: founder.is_active,
        display_order: founder.display_order
      })
      .eq('id', founder.id);
    
    if (error) {
      toast({
        title: 'Error',
        description: 'Failed to save founder',
        variant: 'destructive'
      });
    } else {
      toast({
        title: 'Success',
        description: 'Founder saved successfully'
      });
      fetchFounders();
      setEditing(null);
    }
  };

  const handleAdd = async () => {
    if (!editing) return;

    const { error } = await supabase
      .from('founders')
      .insert([{
        name: editing.name,
        title: editing.title,
        bio: editing.bio,
        image_url: editing.image_url,
        experience_years: editing.experience_years,
        countries_worked: editing.countries_worked,
        specializations: editing.specializations,
        linkedin_url: editing.linkedin_url,
        is_active: editing.is_active,
        display_order: editing.display_order
      }]);
    
    if (error) {
      toast({
        title: 'Error',
        description: 'Failed to add founder',
        variant: 'destructive'
      });
    } else {
      toast({
        title: 'Success',
        description: 'Founder added successfully'
      });
      fetchFounders();
      setEditing(null);
      setIsAdding(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to delete this founder?')) return;

    const { error } = await supabase
      .from('founders')
      .delete()
      .eq('id', id);
    
    if (error) {
      toast({
        title: 'Error',
        description: 'Failed to delete founder',
        variant: 'destructive'
      });
    } else {
      toast({
        title: 'Success',
        description: 'Founder deleted successfully'
      });
      fetchFounders();
    }
  };

  const startAdding = () => {
    setEditing({
      id: '',
      name: '',
      title: '',
      bio: '',
      image_url: null,
      experience_years: 0,
      countries_worked: [],
      specializations: [],
      linkedin_url: null,
      is_active: true,
      display_order: founders.length
    });
    setIsAdding(true);
  };

  const addCountry = () => {
    if (!editing || !newCountry.trim()) return;
    setEditing({
      ...editing,
      countries_worked: [...editing.countries_worked, newCountry.trim()]
    });
    setNewCountry('');
  };

  const removeCountry = (index: number) => {
    if (!editing) return;
    setEditing({
      ...editing,
      countries_worked: editing.countries_worked.filter((_, i) => i !== index)
    });
  };

  const addSpecialization = () => {
    if (!editing || !newSpec.trim()) return;
    setEditing({
      ...editing,
      specializations: [...editing.specializations, newSpec.trim()]
    });
    setNewSpec('');
  };

  const removeSpecialization = (index: number) => {
    if (!editing) return;
    setEditing({
      ...editing,
      specializations: editing.specializations.filter((_, i) => i !== index)
    });
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-3xl font-bold">Founders Management</h2>
          <p className="text-muted-foreground mt-1">Manage founder profiles and information</p>
        </div>
        <Button onClick={startAdding}>
          <Plus className="w-4 h-4 mr-2" />
          Add Founder
        </Button>
      </div>

      {/* Add/Edit Form */}
      {editing && (
        <Card className="glass-card border-primary/50">
          <CardHeader>
            <CardTitle>{isAdding ? 'Add New Founder' : 'Edit Founder'}</CardTitle>
            <CardDescription>
              {isAdding ? 'Add a new founder profile' : 'Update founder information'}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid md:grid-cols-2 gap-4">
              <div>
                <label className="text-sm font-medium">Name *</label>
                <Input
                  value={editing.name}
                  onChange={(e) => setEditing({ ...editing, name: e.target.value })}
                  placeholder="e.g., John Smith"
                  className="mt-1.5"
                />
              </div>

              <div>
                <label className="text-sm font-medium">Title *</label>
                <Input
                  value={editing.title}
                  onChange={(e) => setEditing({ ...editing, title: e.target.value })}
                  placeholder="e.g., Co-Founder & CEO"
                  className="mt-1.5"
                />
              </div>

              <div>
                <label className="text-sm font-medium">Image URL</label>
                <Input
                  value={editing.image_url || ''}
                  onChange={(e) => setEditing({ ...editing, image_url: e.target.value })}
                  placeholder="https://..."
                  className="mt-1.5"
                />
              </div>

              <div>
                <label className="text-sm font-medium">Experience (Years) *</label>
                <Input
                  type="number"
                  value={editing.experience_years}
                  onChange={(e) => setEditing({ ...editing, experience_years: parseInt(e.target.value) })}
                  placeholder="10"
                  className="mt-1.5"
                />
              </div>

              <div>
                <label className="text-sm font-medium">LinkedIn URL</label>
                <Input
                  value={editing.linkedin_url || ''}
                  onChange={(e) => setEditing({ ...editing, linkedin_url: e.target.value })}
                  placeholder="https://linkedin.com/in/..."
                  className="mt-1.5"
                />
              </div>

              <div>
                <label className="text-sm font-medium">Display Order</label>
                <Input
                  type="number"
                  value={editing.display_order}
                  onChange={(e) => setEditing({ ...editing, display_order: parseInt(e.target.value) })}
                  className="mt-1.5"
                />
              </div>
            </div>

            <div>
              <label className="text-sm font-medium">Bio *</label>
              <Textarea
                value={editing.bio}
                onChange={(e) => setEditing({ ...editing, bio: e.target.value })}
                placeholder="Write a compelling bio highlighting achievements and experience..."
                className="mt-1.5"
                rows={4}
              />
            </div>

            {/* Countries Worked */}
            <div>
              <label className="text-sm font-medium">Countries Worked</label>
              <div className="flex gap-2 mt-1.5">
                <Input
                  value={newCountry}
                  onChange={(e) => setNewCountry(e.target.value)}
                  placeholder="Add country..."
                  onKeyPress={(e) => e.key === 'Enter' && addCountry()}
                />
                <Button type="button" onClick={addCountry} size="sm">
                  <Plus className="w-4 h-4" />
                </Button>
              </div>
              <div className="flex flex-wrap gap-2 mt-2">
                {editing.countries_worked.map((country, idx) => (
                  <Badge key={idx} variant="secondary" className="gap-1">
                    {country}
                    <X
                      className="w-3 h-3 cursor-pointer hover:text-destructive"
                      onClick={() => removeCountry(idx)}
                    />
                  </Badge>
                ))}
              </div>
            </div>

            {/* Specializations */}
            <div>
              <label className="text-sm font-medium">Specializations</label>
              <div className="flex gap-2 mt-1.5">
                <Input
                  value={newSpec}
                  onChange={(e) => setNewSpec(e.target.value)}
                  placeholder="Add specialization..."
                  onKeyPress={(e) => e.key === 'Enter' && addSpecialization()}
                />
                <Button type="button" onClick={addSpecialization} size="sm">
                  <Plus className="w-4 h-4" />
                </Button>
              </div>
              <div className="flex flex-wrap gap-2 mt-2">
                {editing.specializations.map((spec, idx) => (
                  <Badge key={idx} variant="outline" className="gap-1">
                    {spec}
                    <X
                      className="w-3 h-3 cursor-pointer hover:text-destructive"
                      onClick={() => removeSpecialization(idx)}
                    />
                  </Badge>
                ))}
              </div>
            </div>

            <div className="flex items-center gap-2">
              <Switch
                checked={editing.is_active}
                onCheckedChange={(checked) => setEditing({ ...editing, is_active: checked })}
              />
              <label className="text-sm font-medium">Active</label>
            </div>

            {/* Preview */}
            {editing.image_url && (
              <div className="border rounded-lg p-4">
                <p className="text-sm font-medium mb-2">Preview:</p>
                <img
                  src={editing.image_url}
                  alt="Preview"
                  className="w-48 h-48 object-cover rounded-lg"
                  onError={(e) => {
                    e.currentTarget.src = '/placeholder.svg';
                  }}
                />
              </div>
            )}

            <div className="flex justify-end gap-2 pt-4 border-t">
              <Button
                variant="outline"
                onClick={() => {
                  setEditing(null);
                  setIsAdding(false);
                }}
              >
                <X className="w-4 h-4 mr-2" />
                Cancel
              </Button>
              <Button onClick={isAdding ? handleAdd : () => handleSave(editing)}>
                <Save className="w-4 h-4 mr-2" />
                {isAdding ? 'Add Founder' : 'Save Changes'}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Founders List */}
      <div className="grid md:grid-cols-2 gap-6">
        {founders.map((founder) => (
          <Card key={founder.id} className="glass-card">
            <CardContent className="p-6">
              <div className="flex gap-4 mb-4">
                <img
                  src={founder.image_url || '/placeholder.svg'}
                  alt={founder.name}
                  className="w-24 h-24 rounded-full object-cover"
                  onError={(e) => {
                    e.currentTarget.src = '/placeholder.svg';
                  }}
                />
                <div className="flex-1">
                  <div className="flex items-start justify-between">
                    <div>
                      <h3 className="font-bold text-lg">{founder.name}</h3>
                      <p className="text-sm text-muted-foreground">{founder.title}</p>
                      <p className="text-xs text-muted-foreground mt-1">
                        {founder.experience_years}+ years experience
                      </p>
                    </div>
                    {!founder.is_active && (
                      <Badge variant="secondary">Inactive</Badge>
                    )}
                  </div>
                </div>
              </div>

              <p className="text-sm text-muted-foreground line-clamp-3 mb-3">
                {founder.bio}
              </p>

              {founder.countries_worked.length > 0 && (
                <div className="mb-3">
                  <p className="text-xs font-medium mb-1">Countries:</p>
                  <div className="flex flex-wrap gap-1">
                    {founder.countries_worked.map((country, idx) => (
                      <Badge key={idx} variant="secondary" className="text-xs">
                        {country}
                      </Badge>
                    ))}
                  </div>
                </div>
              )}

              {founder.specializations.length > 0 && (
                <div className="mb-4">
                  <p className="text-xs font-medium mb-1">Specializations:</p>
                  <div className="flex flex-wrap gap-1">
                    {founder.specializations.map((spec, idx) => (
                      <Badge key={idx} variant="outline" className="text-xs">
                        {spec}
                      </Badge>
                    ))}
                  </div>
                </div>
              )}

              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setEditing(founder)}
                  className="flex-1"
                >
                  <Edit3 className="w-3 h-3 mr-1" />
                  Edit
                </Button>
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={() => handleDelete(founder.id)}
                >
                  <Trash2 className="w-3 h-3" />
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {founders.length === 0 && !editing && (
        <Card className="glass-card">
          <CardContent className="py-12 text-center">
            <User className="w-16 h-16 mx-auto mb-4 text-muted-foreground" />
            <h3 className="text-lg font-semibold mb-2">No Founders Yet</h3>
            <p className="text-muted-foreground mb-4">
              Add your first founder profile
            </p>
            <Button onClick={startAdding}>
              <Plus className="w-4 h-4 mr-2" />
              Add First Founder
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
};