import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@student/integrations/supabase/client';
import { Button } from '@student/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@student/components/ui/card';
import { Input } from '@student/components/ui/input';
import { Label } from '@student/components/ui/label';
import { Textarea } from '@student/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@student/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@student/components/ui/select';
import { Switch } from '@student/components/ui/switch';
import { Badge } from '@student/components/ui/badge';
import { toast } from 'sonner';
import { Plus, Edit2, Trash2, Image as ImageIcon, MapPin, Calendar, Users, DollarSign, Star } from 'lucide-react';
import ImageUploader from './ImageUploader';

interface TravelPackage {
  id: string;
  package_name: string;
  destination: string;
  duration_days: number;
  duration_nights: number;
  price_per_person: number;
  currency: string;
  description: string;
  inclusions: string[];
  exclusions: string[];
  itinerary: any[];
  images: string[];
  is_featured: boolean;
  is_active: boolean;
  max_travelers: number;
  difficulty_level: string;
  best_season: string;
}

export default function TravelPackagesAdmin() {
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingPackage, setEditingPackage] = useState<TravelPackage | null>(null);
  const queryClient = useQueryClient();

  const { data: packages = [], isLoading } = useQuery({
    queryKey: ['travel-packages-admin'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('travel_packages')
        .select('*')
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data as TravelPackage[];
    },
  });

  const [formData, setFormData] = useState({
    package_name: '',
    destination: '',
    duration_days: 1,
    duration_nights: 0,
    price_per_person: 0,
    currency: 'INR',
    description: '',
    inclusions: '',
    exclusions: '',
    itinerary: '',
    images: [] as string[],
    is_featured: false,
    is_active: true,
    max_travelers: 50,
    difficulty_level: 'moderate',
    best_season: '',
  });

  const saveMutation = useMutation({
    mutationFn: async (data: typeof formData) => {
      const packageData = {
        package_name: data.package_name,
        destination: data.destination,
        duration_days: data.duration_days,
        duration_nights: data.duration_nights,
        price_per_person: data.price_per_person,
        currency: data.currency,
        description: data.description,
        inclusions: typeof data.inclusions === 'string' 
          ? data.inclusions.split('\n').filter(Boolean) 
          : data.inclusions,
        exclusions: typeof data.exclusions === 'string' 
          ? data.exclusions.split('\n').filter(Boolean) 
          : data.exclusions,
        itinerary: typeof data.itinerary === 'string' 
          ? (data.itinerary ? JSON.parse(data.itinerary) : [])
          : data.itinerary,
        images: Array.isArray(data.images) ? data.images : [],
        is_featured: data.is_featured,
        is_active: data.is_active,
        max_travelers: data.max_travelers,
        difficulty_level: data.difficulty_level,
        best_season: data.best_season,
      };

      if (editingPackage) {
        const { error } = await supabase
          .from('travel_packages')
          .update(packageData)
          .eq('id', editingPackage.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('travel_packages').insert([packageData]);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['travel-packages-admin'] });
      queryClient.invalidateQueries({ queryKey: ['travel-packages'] });
      toast.success(editingPackage ? 'Package updated!' : 'Package created!');
      handleCloseDialog();
    },
    onError: (error: any) => {
      toast.error('Failed to save package', { description: error.message });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('travel_packages').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['travel-packages-admin'] });
      queryClient.invalidateQueries({ queryKey: ['travel-packages'] });
      toast.success('Package deleted');
    },
  });

  const handleEdit = (pkg: TravelPackage) => {
    setEditingPackage(pkg);
    setFormData({
      package_name: pkg.package_name,
      destination: pkg.destination,
      duration_days: pkg.duration_days,
      duration_nights: pkg.duration_nights,
      price_per_person: pkg.price_per_person,
      currency: pkg.currency,
      description: pkg.description || '',
      inclusions: pkg.inclusions?.join('\n') || '',
      exclusions: pkg.exclusions?.join('\n') || '',
      itinerary: JSON.stringify(pkg.itinerary, null, 2),
      images: pkg.images || [],
      is_featured: pkg.is_featured,
      is_active: pkg.is_active,
      max_travelers: pkg.max_travelers,
      difficulty_level: pkg.difficulty_level,
      best_season: pkg.best_season || '',
    });
    setIsDialogOpen(true);
  };

  const handleCloseDialog = () => {
    setIsDialogOpen(false);
    setEditingPackage(null);
    setFormData({
      package_name: '',
      destination: '',
      duration_days: 1,
      duration_nights: 0,
      price_per_person: 0,
      currency: 'INR',
      description: '',
      inclusions: '',
      exclusions: '',
      itinerary: '',
      images: [],
      is_featured: false,
      is_active: true,
      max_travelers: 50,
      difficulty_level: 'moderate',
      best_season: '',
    });
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    saveMutation.mutate(formData);
  };

  if (isLoading) {
    return <div className="text-center py-8">Loading packages...</div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold">Travel Packages</h2>
          <p className="text-muted-foreground">Manage your pre-made travel packages</p>
        </div>
        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogTrigger asChild>
            <Button onClick={() => setEditingPackage(null)}>
              <Plus className="h-4 w-4 mr-2" />
              Add Package
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>{editingPackage ? 'Edit Package' : 'Create New Package'}</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleSubmit} className="space-y-6">
              <div className="grid sm:grid-cols-2 gap-4">
                <div className="space-y-2 sm:col-span-2">
                  <Label htmlFor="package_name">Package Name *</Label>
                  <Input
                    id="package_name"
                    value={formData.package_name}
                    onChange={(e) => setFormData({ ...formData, package_name: e.target.value })}
                    placeholder="Exotic Bali Adventure"
                    required
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="destination">Destination *</Label>
                  <Input
                    id="destination"
                    value={formData.destination}
                    onChange={(e) => setFormData({ ...formData, destination: e.target.value })}
                    placeholder="Bali, Indonesia"
                    required
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="best_season">Best Season</Label>
                  <Input
                    id="best_season"
                    value={formData.best_season}
                    onChange={(e) => setFormData({ ...formData, best_season: e.target.value })}
                    placeholder="April - October"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="duration_days">Duration (Days) *</Label>
                  <Input
                    id="duration_days"
                    type="number"
                    min="1"
                    value={formData.duration_days}
                    onChange={(e) => setFormData({ ...formData, duration_days: parseInt(e.target.value) })}
                    required
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="duration_nights">Duration (Nights) *</Label>
                  <Input
                    id="duration_nights"
                    type="number"
                    min="0"
                    value={formData.duration_nights}
                    onChange={(e) => setFormData({ ...formData, duration_nights: parseInt(e.target.value) })}
                    required
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="price_per_person">Price per Person *</Label>
                  <Input
                    id="price_per_person"
                    type="number"
                    min="0"
                    value={formData.price_per_person}
                    onChange={(e) => setFormData({ ...formData, price_per_person: parseFloat(e.target.value) })}
                    required
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="currency">Currency</Label>
                  <Select value={formData.currency} onValueChange={(value) => setFormData({ ...formData, currency: value })}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="INR">INR (₹)</SelectItem>
                      <SelectItem value="USD">USD ($)</SelectItem>
                      <SelectItem value="EUR">EUR (€)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="max_travelers">Max Travelers</Label>
                  <Input
                    id="max_travelers"
                    type="number"
                    min="1"
                    value={formData.max_travelers}
                    onChange={(e) => setFormData({ ...formData, max_travelers: parseInt(e.target.value) })}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="difficulty_level">Difficulty Level</Label>
                  <Select value={formData.difficulty_level} onValueChange={(value) => setFormData({ ...formData, difficulty_level: value })}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="easy">Easy</SelectItem>
                      <SelectItem value="moderate">Moderate</SelectItem>
                      <SelectItem value="challenging">Challenging</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2 sm:col-span-2">
                  <Label htmlFor="description">Description</Label>
                  <Textarea
                    id="description"
                    value={formData.description}
                    onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                    placeholder="Detailed package description..."
                    rows={3}
                  />
                </div>

                <div className="space-y-2 sm:col-span-2">
                  <Label htmlFor="inclusions">Inclusions (one per line)</Label>
                  <Textarea
                    id="inclusions"
                    value={formData.inclusions}
                    onChange={(e) => setFormData({ ...formData, inclusions: e.target.value })}
                    placeholder="Accommodation&#10;Meals&#10;Airport transfers"
                    rows={4}
                  />
                </div>

                <div className="space-y-2 sm:col-span-2">
                  <Label htmlFor="exclusions">Exclusions (one per line)</Label>
                  <Textarea
                    id="exclusions"
                    value={formData.exclusions}
                    onChange={(e) => setFormData({ ...formData, exclusions: e.target.value })}
                    placeholder="International flights&#10;Travel insurance"
                    rows={3}
                  />
                </div>

                <div className="space-y-2 sm:col-span-2">
                  <ImageUploader
                    images={Array.isArray(formData.images) ? formData.images : []}
                    onImagesChange={(newImages) => setFormData({ ...formData, images: newImages })}
                    bucketName="travel-packages"
                    folderPath={editingPackage?.id || 'temp'}
                  />
                </div>

                <div className="space-y-2 sm:col-span-2">
                  <Label htmlFor="itinerary">Itinerary (JSON format)</Label>
                  <Textarea
                    id="itinerary"
                    value={formData.itinerary}
                    onChange={(e) => setFormData({ ...formData, itinerary: e.target.value })}
                    placeholder='[{"day": 1, "title": "Arrival", "description": "Check-in and welcome dinner"}]'
                    rows={5}
                  />
                </div>

                <div className="flex items-center space-x-2">
                  <Switch
                    id="is_featured"
                    checked={formData.is_featured}
                    onCheckedChange={(checked) => setFormData({ ...formData, is_featured: checked })}
                  />
                  <Label htmlFor="is_featured">Featured Package</Label>
                </div>

                <div className="flex items-center space-x-2">
                  <Switch
                    id="is_active"
                    checked={formData.is_active}
                    onCheckedChange={(checked) => setFormData({ ...formData, is_active: checked })}
                  />
                  <Label htmlFor="is_active">Active</Label>
                </div>
              </div>

              <div className="flex gap-3">
                <Button type="button" variant="outline" onClick={handleCloseDialog} className="flex-1">
                  Cancel
                </Button>
                <Button type="submit" className="flex-1" disabled={saveMutation.isPending}>
                  {saveMutation.isPending ? 'Saving...' : editingPackage ? 'Update' : 'Create'}
                </Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <div className="grid gap-4">
        {packages.map((pkg) => (
          <Card key={pkg.id}>
            <CardHeader>
              <div className="flex items-start justify-between">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <CardTitle>{pkg.package_name}</CardTitle>
                    {pkg.is_featured && <Badge variant="default"><Star className="h-3 w-3 mr-1" />Featured</Badge>}
                    {!pkg.is_active && <Badge variant="secondary">Inactive</Badge>}
                  </div>
                  <CardDescription className="flex items-center gap-4 text-sm">
                    <span className="flex items-center gap-1">
                      <MapPin className="h-3 w-3" />
                      {pkg.destination}
                    </span>
                    <span className="flex items-center gap-1">
                      <Calendar className="h-3 w-3" />
                      {pkg.duration_days}D/{pkg.duration_nights}N
                    </span>
                    <span className="flex items-center gap-1">
                      <DollarSign className="h-3 w-3" />
                      {pkg.currency === 'INR' ? '₹' : pkg.currency === 'USD' ? '$' : '€'}
                      {pkg.price_per_person.toLocaleString()}
                    </span>
                  </CardDescription>
                </div>
                <div className="flex gap-2">
                  <Button size="sm" variant="outline" onClick={() => handleEdit(pkg)}>
                    <Edit2 className="h-4 w-4" />
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      if (confirm('Delete this package?')) deleteMutation.mutate(pkg.id);
                    }}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </CardHeader>
            {pkg.description && (
              <CardContent>
                <p className="text-sm text-muted-foreground line-clamp-2">{pkg.description}</p>
              </CardContent>
            )}
          </Card>
        ))}

        {packages.length === 0 && (
          <Card>
            <CardContent className="py-12 text-center">
              <p className="text-muted-foreground">No packages yet. Create your first one!</p>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
