import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@student/integrations/supabase/client';
import { Button } from '@student/components/ui/button';
import { Input } from '@student/components/ui/input';
import { Label } from '@student/components/ui/label';
import { Textarea } from '@student/components/ui/textarea';
import { Switch } from '@student/components/ui/switch';
import { Card } from '@student/components/ui/card';
import { toast } from 'sonner';
import { Plus, Edit, Trash2, Upload } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@student/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@student/components/ui/select';

interface TravelOffer {
  id: string;
  title: string;
  description: string | null;
  offer_type: string;
  image_url: string | null;
  discount_text: string | null;
  price_text: string | null;
  valid_from: string | null;
  valid_until: string | null;
  is_active: boolean;
  display_order: number;
}

export default function TravelOffersAdmin() {
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingOffer, setEditingOffer] = useState<TravelOffer | null>(null);
  const [uploading, setUploading] = useState(false);
  const [formData, setFormData] = useState({
    title: '',
    description: '',
    offer_type: 'flight',
    image_url: '',
    discount_text: '',
    price_text: '',
    valid_from: '',
    valid_until: '',
    is_active: true,
    display_order: 0,
  });

  const queryClient = useQueryClient();

  const { data: offers, isLoading } = useQuery({
    queryKey: ['travel-offers'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('travel_offers')
        .select('*')
        .order('display_order');
      if (error) throw error;
      return data as TravelOffer[];
    },
  });

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploading(true);
    try {
      const fileExt = file.name.split('.').pop();
      const fileName = `${Math.random()}.${fileExt}`;
      const filePath = `travel-offers/${fileName}`;

      const { error: uploadError } = await supabase.storage
        .from('website_media')
        .upload(filePath, file);

      if (uploadError) throw uploadError;

      const { data: urlData } = supabase.storage
        .from('website_media')
        .getPublicUrl(filePath);

      setFormData({ ...formData, image_url: urlData.publicUrl });
      toast.success('Image uploaded successfully');
    } catch (error) {
      toast.error('Failed to upload image');
    } finally {
      setUploading(false);
    }
  };

  const createMutation = useMutation({
    mutationFn: async (data: typeof formData) => {
      const { error } = await supabase.from('travel_offers').insert([data]);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['travel-offers'] });
      toast.success('Offer created successfully');
      resetForm();
    },
    onError: () => toast.error('Failed to create offer'),
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: typeof formData }) => {
      const { error } = await supabase
        .from('travel_offers')
        .update(data)
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['travel-offers'] });
      toast.success('Offer updated successfully');
      resetForm();
    },
    onError: () => toast.error('Failed to update offer'),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('travel_offers').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['travel-offers'] });
      toast.success('Offer deleted successfully');
    },
    onError: () => toast.error('Failed to delete offer'),
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (editingOffer) {
      updateMutation.mutate({ id: editingOffer.id, data: formData });
    } else {
      createMutation.mutate(formData);
    }
  };

  const resetForm = () => {
    setFormData({
      title: '',
      description: '',
      offer_type: 'flight',
      image_url: '',
      discount_text: '',
      price_text: '',
      valid_from: '',
      valid_until: '',
      is_active: true,
      display_order: 0,
    });
    setEditingOffer(null);
    setIsDialogOpen(false);
  };

  const handleEdit = (offer: TravelOffer) => {
    setEditingOffer(offer);
    setFormData({
      title: offer.title,
      description: offer.description || '',
      offer_type: offer.offer_type,
      image_url: offer.image_url || '',
      discount_text: offer.discount_text || '',
      price_text: offer.price_text || '',
      valid_from: offer.valid_from || '',
      valid_until: offer.valid_until || '',
      is_active: offer.is_active,
      display_order: offer.display_order,
    });
    setIsDialogOpen(true);
  };

  if (isLoading) return <div>Loading...</div>;

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold">Travel Offers</h2>
          <p className="text-muted-foreground">Manage flight tickets, packages & special offers</p>
        </div>
        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogTrigger asChild>
            <Button onClick={() => resetForm()}>
              <Plus className="mr-2 h-4 w-4" />
              Add Offer
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>
                {editingOffer ? 'Edit Offer' : 'Add New Offer'}
              </DialogTitle>
            </DialogHeader>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <Label htmlFor="title">Title</Label>
                <Input
                  id="title"
                  value={formData.title}
                  onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                  required
                />
              </div>
              <div>
                <Label htmlFor="description">Description</Label>
                <Textarea
                  id="description"
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  rows={3}
                />
              </div>
              <div>
                <Label htmlFor="offer_type">Offer Type</Label>
                <Select
                  value={formData.offer_type}
                  onValueChange={(value) => setFormData({ ...formData, offer_type: value })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="flight">Flight</SelectItem>
                    <SelectItem value="hotel">Hotel</SelectItem>
                    <SelectItem value="package">Package</SelectItem>
                    <SelectItem value="visa">Visa</SelectItem>
                    <SelectItem value="other">Other</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label htmlFor="image">Offer Image</Label>
                <div className="flex gap-2">
                  <Input
                    id="image"
                    type="file"
                    accept="image/*"
                    onChange={handleFileUpload}
                    disabled={uploading}
                  />
                  {uploading && <span className="text-sm">Uploading...</span>}
                </div>
                {formData.image_url && (
                  <img src={formData.image_url} alt="Preview" className="mt-2 h-32 object-cover rounded" />
                )}
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="discount_text">Discount Text</Label>
                  <Input
                    id="discount_text"
                    value={formData.discount_text}
                    onChange={(e) => setFormData({ ...formData, discount_text: e.target.value })}
                    placeholder="e.g., Up to 50% OFF"
                  />
                </div>
                <div>
                  <Label htmlFor="price_text">Price Text</Label>
                  <Input
                    id="price_text"
                    value={formData.price_text}
                    onChange={(e) => setFormData({ ...formData, price_text: e.target.value })}
                    placeholder="e.g., Starting ₹15,999"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="valid_from">Valid From</Label>
                  <Input
                    id="valid_from"
                    type="date"
                    value={formData.valid_from}
                    onChange={(e) => setFormData({ ...formData, valid_from: e.target.value })}
                  />
                </div>
                <div>
                  <Label htmlFor="valid_until">Valid Until</Label>
                  <Input
                    id="valid_until"
                    type="date"
                    value={formData.valid_until}
                    onChange={(e) => setFormData({ ...formData, valid_until: e.target.value })}
                  />
                </div>
              </div>
              <div>
                <Label htmlFor="display_order">Display Order</Label>
                <Input
                  id="display_order"
                  type="number"
                  value={formData.display_order}
                  onChange={(e) =>
                    setFormData({ ...formData, display_order: parseInt(e.target.value) })
                  }
                />
              </div>
              <div className="flex items-center space-x-2">
                <Switch
                  id="is_active"
                  checked={formData.is_active}
                  onCheckedChange={(checked) =>
                    setFormData({ ...formData, is_active: checked })
                  }
                />
                <Label htmlFor="is_active">Active</Label>
              </div>
              <div className="flex gap-2 justify-end">
                <Button type="button" variant="outline" onClick={resetForm}>
                  Cancel
                </Button>
                <Button type="submit">
                  {editingOffer ? 'Update' : 'Create'}
                </Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
        {offers?.map((offer) => (
          <Card key={offer.id} className="overflow-hidden">
            {offer.image_url && (
              <img src={offer.image_url} alt={offer.title} className="w-full h-48 object-cover" />
            )}
            <div className="p-4">
              <div className="flex items-start justify-between mb-2">
                <div>
                  <h3 className="font-semibold">{offer.title}</h3>
                  <p className="text-xs text-muted-foreground capitalize">{offer.offer_type}</p>
                </div>
                <span
                  className={`px-2 py-1 text-xs rounded ${
                    offer.is_active
                      ? 'bg-green-100 text-green-800'
                      : 'bg-gray-100 text-gray-800'
                  }`}
                >
                  {offer.is_active ? 'Active' : 'Inactive'}
                </span>
              </div>
              <p className="text-sm text-muted-foreground mb-2">{offer.description}</p>
              {offer.discount_text && (
                <p className="text-sm font-semibold text-green-600">{offer.discount_text}</p>
              )}
              {offer.price_text && (
                <p className="text-sm text-muted-foreground">{offer.price_text}</p>
              )}
              <div className="flex gap-2 mt-4">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleEdit(offer)}
                  className="flex-1"
                >
                  <Edit className="h-4 w-4 mr-1" />
                  Edit
                </Button>
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={() => deleteMutation.mutate(offer.id)}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}
