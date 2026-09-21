import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@student/components/ui/card';
import { Button } from '@student/components/ui/button';
import { Input } from '@student/components/ui/input';
import { Textarea } from '@student/components/ui/textarea';
import { Switch } from '@student/components/ui/switch';
import { Badge } from '@student/components/ui/badge';
import { Plus, Edit3, Save, Trash2, Image, X } from 'lucide-react';
import { supabase } from '@student/integrations/supabase/client';
import { useToast } from '@student/hooks/use-toast';

interface GalleryImage {
  id: string;
  student_name: string;
  image_url: string;
  visa_type: string | null;
  country: string | null;
  year: number | null;
  description: string | null;
  is_active: boolean;
  display_order: number;
}

export const GalleryAdmin = () => {
  const [images, setImages] = useState<GalleryImage[]>([]);
  const [editing, setEditing] = useState<GalleryImage | null>(null);
  const [isAdding, setIsAdding] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    fetchImages();
  }, []);

  const fetchImages = async () => {
    const { data, error } = await supabase
      .from('student_gallery')
      .select('*')
      .order('display_order');
    
    if (error) {
      toast({
        title: 'Error',
        description: 'Failed to fetch gallery images',
        variant: 'destructive'
      });
    } else if (data) {
      setImages(data);
    }
  };

  const handleSave = async (image: GalleryImage) => {
    const { error } = await supabase
      .from('student_gallery')
      .update({
        student_name: image.student_name,
        image_url: image.image_url,
        visa_type: image.visa_type,
        country: image.country,
        year: image.year,
        description: image.description,
        is_active: image.is_active,
        display_order: image.display_order
      })
      .eq('id', image.id);
    
    if (error) {
      toast({
        title: 'Error',
        description: 'Failed to save image',
        variant: 'destructive'
      });
    } else {
      toast({
        title: 'Success',
        description: 'Image saved successfully'
      });
      fetchImages();
      setEditing(null);
    }
  };

  const handleAdd = async () => {
    if (!editing) return;

    const { error } = await supabase
      .from('student_gallery')
      .insert([{
        student_name: editing.student_name,
        image_url: editing.image_url,
        visa_type: editing.visa_type,
        country: editing.country,
        year: editing.year,
        description: editing.description,
        is_active: editing.is_active,
        display_order: editing.display_order
      }]);
    
    if (error) {
      toast({
        title: 'Error',
        description: 'Failed to add image',
        variant: 'destructive'
      });
    } else {
      toast({
        title: 'Success',
        description: 'Image added successfully'
      });
      fetchImages();
      setEditing(null);
      setIsAdding(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to delete this image?')) return;

    const { error } = await supabase
      .from('student_gallery')
      .delete()
      .eq('id', id);
    
    if (error) {
      toast({
        title: 'Error',
        description: 'Failed to delete image',
        variant: 'destructive'
      });
    } else {
      toast({
        title: 'Success',
        description: 'Image deleted successfully'
      });
      fetchImages();
    }
  };

  const startAdding = () => {
    setEditing({
      id: '',
      student_name: '',
      image_url: '',
      visa_type: null,
      country: null,
      year: new Date().getFullYear(),
      description: null,
      is_active: true,
      display_order: images.length
    });
    setIsAdding(true);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-3xl font-bold">Student Gallery Management</h2>
          <p className="text-muted-foreground mt-1">Manage student visa success photos</p>
        </div>
        <Button onClick={startAdding}>
          <Plus className="w-4 h-4 mr-2" />
          Add New Image
        </Button>
      </div>

      {/* Add/Edit Form */}
      {editing && (
        <Card className="glass-card border-primary/50">
          <CardHeader>
            <CardTitle>{isAdding ? 'Add New Image' : 'Edit Image'}</CardTitle>
            <CardDescription>
              {isAdding ? 'Add a new student success photo' : 'Update image details'}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid md:grid-cols-2 gap-4">
              <div>
                <label className="text-sm font-medium">Student Name *</label>
                <Input
                  value={editing.student_name}
                  onChange={(e) => setEditing({ ...editing, student_name: e.target.value })}
                  placeholder="e.g., John Doe"
                  className="mt-1.5"
                />
              </div>

              <div>
                <label className="text-sm font-medium">Image URL *</label>
                <Input
                  value={editing.image_url}
                  onChange={(e) => setEditing({ ...editing, image_url: e.target.value })}
                  placeholder="https://..."
                  className="mt-1.5"
                />
              </div>

              <div>
                <label className="text-sm font-medium">Visa Type</label>
                <Input
                  value={editing.visa_type || ''}
                  onChange={(e) => setEditing({ ...editing, visa_type: e.target.value })}
                  placeholder="e.g., Student Visa"
                  className="mt-1.5"
                />
              </div>

              <div>
                <label className="text-sm font-medium">Country</label>
                <Input
                  value={editing.country || ''}
                  onChange={(e) => setEditing({ ...editing, country: e.target.value })}
                  placeholder="e.g., USA"
                  className="mt-1.5"
                />
              </div>

              <div>
                <label className="text-sm font-medium">Year</label>
                <Input
                  type="number"
                  value={editing.year || ''}
                  onChange={(e) => setEditing({ ...editing, year: parseInt(e.target.value) })}
                  placeholder="2024"
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
              <label className="text-sm font-medium">Description</label>
              <Textarea
                value={editing.description || ''}
                onChange={(e) => setEditing({ ...editing, description: e.target.value })}
                placeholder="Short description about the student's achievement"
                className="mt-1.5"
                rows={3}
              />
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
                  className="w-48 h-64 object-cover rounded-lg"
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
                {isAdding ? 'Add Image' : 'Save Changes'}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Images List */}
      <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
        {images.map((image) => (
          <Card key={image.id} className="glass-card overflow-hidden">
            <div className="relative aspect-[3/4]">
              <img
                src={image.image_url}
                alt={image.student_name}
                className="w-full h-full object-cover"
                onError={(e) => {
                  e.currentTarget.src = '/placeholder.svg';
                }}
              />
              {!image.is_active && (
                <Badge className="absolute top-2 left-2" variant="secondary">
                  Inactive
                </Badge>
              )}
            </div>
            <CardContent className="p-4">
              <h3 className="font-bold mb-1">{image.student_name}</h3>
              <div className="text-sm text-muted-foreground space-y-1 mb-3">
                {image.country && <div>📍 {image.country}</div>}
                {image.visa_type && <div>✈️ {image.visa_type}</div>}
                {image.year && <div>📅 {image.year}</div>}
              </div>
              {image.description && (
                <p className="text-xs text-muted-foreground line-clamp-2 mb-3">
                  {image.description}
                </p>
              )}
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setEditing(image)}
                  className="flex-1"
                >
                  <Edit3 className="w-3 h-3 mr-1" />
                  Edit
                </Button>
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={() => handleDelete(image.id)}
                >
                  <Trash2 className="w-3 h-3" />
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {images.length === 0 && !editing && (
        <Card className="glass-card">
          <CardContent className="py-12 text-center">
            <Image className="w-16 h-16 mx-auto mb-4 text-muted-foreground" />
            <h3 className="text-lg font-semibold mb-2">No Images Yet</h3>
            <p className="text-muted-foreground mb-4">
              Add your first student success photo to showcase achievements
            </p>
            <Button onClick={startAdding}>
              <Plus className="w-4 h-4 mr-2" />
              Add First Image
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
};