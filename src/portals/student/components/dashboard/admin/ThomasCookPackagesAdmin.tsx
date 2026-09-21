import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@student/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@student/components/ui/card';
import { Button } from '@student/components/ui/button';
import { Input } from '@student/components/ui/input';
import { Label } from '@student/components/ui/label';
import { Textarea } from '@student/components/ui/textarea';
import { Badge } from '@student/components/ui/badge';
import { Switch } from '@student/components/ui/switch';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@student/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@student/components/ui/dialog';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@student/components/ui/table';
import { Plus, Edit, Trash2, Eye, EyeOff } from 'lucide-react';
import { toast } from 'sonner';

interface TravelPackage {
  id: string;
  package_name: string;
  destination: string;
  duration_days: number;
  duration_nights: number;
  price_per_person: number;
  discount_percentage?: number;
  category?: string;
  description?: string;
  inclusions?: string[];
  images?: string[];
  is_active: boolean;
  is_featured: boolean;
  rating?: number;
  reviews_count?: number;
}

export default function ThomasCookPackagesAdmin() {
  const queryClient = useQueryClient();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingPackage, setEditingPackage] = useState<TravelPackage | null>(null);
  const [formData, setFormData] = useState<Partial<TravelPackage>>({
    package_name: '',
    destination: '',
    duration_days: 1,
    duration_nights: 0,
    price_per_person: 0,
    discount_percentage: 0,
    category: 'beaches',
    description: '',
    inclusions: [],
    images: [],
    is_active: true,
    is_featured: false,
  });

  const { data: packages, isLoading } = useQuery({
    queryKey: ['admin-travel-packages'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('travel_packages')
        .select('*')
        .order('created_at', { ascending: false });
      
      if (error) throw error;
      return data as TravelPackage[];
    },
  });

  const createPackage = useMutation({
    mutationFn: async (data: Partial<TravelPackage>) => {
      const { error } = await supabase
        .from('travel_packages')
        .insert([data as any]);
      
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-travel-packages'] });
      queryClient.invalidateQueries({ queryKey: ['thomas-cook-packages'] });
      toast.success('Package created successfully');
      resetForm();
    },
    onError: () => {
      toast.error('Failed to create package');
    },
  });

  const updatePackage = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Partial<TravelPackage> }) => {
      const { error } = await supabase
        .from('travel_packages')
        .update(data)
        .eq('id', id);
      
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-travel-packages'] });
      queryClient.invalidateQueries({ queryKey: ['thomas-cook-packages'] });
      toast.success('Package updated successfully');
      resetForm();
    },
    onError: () => {
      toast.error('Failed to update package');
    },
  });

  const deletePackage = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('travel_packages')
        .delete()
        .eq('id', id);
      
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-travel-packages'] });
      queryClient.invalidateQueries({ queryKey: ['thomas-cook-packages'] });
      toast.success('Package deleted successfully');
    },
    onError: () => {
      toast.error('Failed to delete package');
    },
  });

  const toggleActive = useMutation({
    mutationFn: async ({ id, is_active }: { id: string; is_active: boolean }) => {
      const { error } = await supabase
        .from('travel_packages')
        .update({ is_active })
        .eq('id', id);
      
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-travel-packages'] });
      queryClient.invalidateQueries({ queryKey: ['thomas-cook-packages'] });
      toast.success('Package status updated');
    },
  });

  const resetForm = () => {
    setFormData({
      package_name: '',
      destination: '',
      duration_days: 1,
      duration_nights: 0,
      price_per_person: 0,
      discount_percentage: 0,
      category: 'beaches',
      description: '',
      inclusions: [],
      images: [],
      is_active: true,
      is_featured: false,
    });
    setEditingPackage(null);
    setIsDialogOpen(false);
  };

  const handleEdit = (pkg: TravelPackage) => {
    setEditingPackage(pkg);
    setFormData(pkg);
    setIsDialogOpen(true);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    if (editingPackage) {
      updatePackage.mutate({ id: editingPackage.id, data: formData });
    } else {
      createPackage.mutate(formData);
    }
  };

  const categories = [
    'beaches', 'temples', 'adventure', 'corporate', 'honeymoon', 'family'
  ];

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>Thomas Cook Style Packages</CardTitle>
          <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
            <DialogTrigger asChild>
              <Button onClick={() => resetForm()}>
                <Plus className="w-4 h-4 mr-2" />
                Add Package
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>
                  {editingPackage ? 'Edit Package' : 'Add New Package'}
                </DialogTitle>
              </DialogHeader>

              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label>Package Name *</Label>
                    <Input
                      value={formData.package_name}
                      onChange={(e) => setFormData({ ...formData, package_name: e.target.value })}
                      required
                    />
                  </div>

                  <div>
                    <Label>Destination *</Label>
                    <Input
                      value={formData.destination}
                      onChange={(e) => setFormData({ ...formData, destination: e.target.value })}
                      required
                    />
                  </div>

                  <div>
                    <Label>Duration (Days) *</Label>
                    <Input
                      type="number"
                      value={formData.duration_days}
                      onChange={(e) => setFormData({ ...formData, duration_days: parseInt(e.target.value) })}
                      required
                    />
                  </div>

                  <div>
                    <Label>Duration (Nights)</Label>
                    <Input
                      type="number"
                      value={formData.duration_nights}
                      onChange={(e) => setFormData({ ...formData, duration_nights: parseInt(e.target.value) })}
                    />
                  </div>

                  <div>
                    <Label>Price per Person (₹) *</Label>
                    <Input
                      type="number"
                      value={formData.price_per_person}
                      onChange={(e) => setFormData({ ...formData, price_per_person: parseFloat(e.target.value) })}
                      required
                    />
                  </div>

                  <div>
                    <Label>Discount %</Label>
                    <Input
                      type="number"
                      value={formData.discount_percentage || 0}
                      onChange={(e) => setFormData({ ...formData, discount_percentage: parseFloat(e.target.value) })}
                    />
                  </div>

                  <div>
                    <Label>Category *</Label>
                    <Select
                      value={formData.category}
                      onValueChange={(value) => setFormData({ ...formData, category: value })}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {categories.map(cat => (
                          <SelectItem key={cat} value={cat}>
                            {cat.charAt(0).toUpperCase() + cat.slice(1)}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div>
                    <Label>Rating (1-5)</Label>
                    <Input
                      type="number"
                      step="0.1"
                      min="1"
                      max="5"
                      value={formData.rating || ''}
                      onChange={(e) => setFormData({ ...formData, rating: parseFloat(e.target.value) })}
                    />
                  </div>
                </div>

                <div>
                  <Label>Description</Label>
                  <Textarea
                    value={formData.description || ''}
                    onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                    rows={4}
                  />
                </div>

                <div>
                  <Label>Inclusions (comma separated)</Label>
                  <Textarea
                    value={formData.inclusions?.join(', ') || ''}
                    onChange={(e) => setFormData({ 
                      ...formData, 
                      inclusions: e.target.value.split(',').map(s => s.trim()).filter(Boolean)
                    })}
                    rows={3}
                    placeholder="e.g., Flights, Hotels, Meals, Sightseeing"
                  />
                </div>

                <div>
                  <Label>Image URLs (comma separated)</Label>
                  <Textarea
                    value={formData.images?.join(', ') || ''}
                    onChange={(e) => setFormData({ 
                      ...formData, 
                      images: e.target.value.split(',').map(s => s.trim()).filter(Boolean)
                    })}
                    rows={2}
                    placeholder="https://example.com/image1.jpg, https://example.com/image2.jpg"
                  />
                </div>

                <div className="flex gap-6">
                  <div className="flex items-center gap-2">
                    <Switch
                      checked={formData.is_active}
                      onCheckedChange={(checked) => setFormData({ ...formData, is_active: checked })}
                    />
                    <Label>Active</Label>
                  </div>

                  <div className="flex items-center gap-2">
                    <Switch
                      checked={formData.is_featured}
                      onCheckedChange={(checked) => setFormData({ ...formData, is_featured: checked })}
                    />
                    <Label>Featured</Label>
                  </div>
                </div>

                <div className="flex gap-2 justify-end">
                  <Button type="button" variant="outline" onClick={resetForm}>
                    Cancel
                  </Button>
                  <Button type="submit">
                    {editingPackage ? 'Update' : 'Create'} Package
                  </Button>
                </div>
              </form>
            </DialogContent>
          </Dialog>
        </CardHeader>

        <CardContent>
          {isLoading ? (
            <div className="text-center py-8">Loading packages...</div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Package Name</TableHead>
                  <TableHead>Destination</TableHead>
                  <TableHead>Category</TableHead>
                  <TableHead>Duration</TableHead>
                  <TableHead>Price</TableHead>
                  <TableHead>Discount</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {packages?.map((pkg) => (
                  <TableRow key={pkg.id}>
                    <TableCell className="font-medium">
                      {pkg.package_name}
                      {pkg.is_featured && (
                        <Badge variant="secondary" className="ml-2">Featured</Badge>
                      )}
                    </TableCell>
                    <TableCell>{pkg.destination}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className="capitalize">
                        {pkg.category}
                      </Badge>
                    </TableCell>
                    <TableCell>{pkg.duration_days}D/{pkg.duration_nights}N</TableCell>
                    <TableCell>₹{pkg.price_per_person.toLocaleString()}</TableCell>
                    <TableCell>
                      {pkg.discount_percentage && pkg.discount_percentage > 0 ? (
                        <Badge variant="destructive">{pkg.discount_percentage}% OFF</Badge>
                      ) : (
                        '-'
                      )}
                    </TableCell>
                    <TableCell>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => toggleActive.mutate({ id: pkg.id, is_active: !pkg.is_active })}
                      >
                        {pkg.is_active ? (
                          <Eye className="w-4 h-4 text-green-600" />
                        ) : (
                          <EyeOff className="w-4 h-4 text-gray-400" />
                        )}
                      </Button>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex gap-2 justify-end">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleEdit(pkg)}
                        >
                          <Edit className="w-4 h-4" />
                        </Button>
                        <Button
                          variant="destructive"
                          size="sm"
                          onClick={() => {
                            if (confirm('Are you sure you want to delete this package?')) {
                              deletePackage.mutate(pkg.id);
                            }
                          }}
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}