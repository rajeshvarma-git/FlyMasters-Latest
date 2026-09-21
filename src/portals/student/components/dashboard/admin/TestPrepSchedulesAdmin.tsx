import { useState, useEffect } from 'react';
import { supabase } from '@student/integrations/supabase/client';
import { Button } from '@student/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@student/components/ui/card';
import { Input } from '@student/components/ui/input';
import { Label } from '@student/components/ui/label';
import { Textarea } from '@student/components/ui/textarea';
import { Switch } from '@student/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@student/components/ui/select';
import { useToast } from '@student/hooks/use-toast';
import { Plus, Edit, Trash2, Calendar, Upload, DollarSign, Image } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@student/components/ui/dialog';
import { MediaUploader } from './MediaUploader';

interface TestPrepSchedule {
  id: string;
  test_type: string;
  title: string;
  description: string | null;
  schedule_image_url: string | null;
  schedule_pdf_url: string | null;
  start_date: string | null;
  end_date: string | null;
  batch_timings: string | null;
  discount_percentage: number;
  original_price: number | null;
  discounted_price: number | null;
  features: string[];
  is_active: boolean;
  display_order: number;
}

const TEST_TYPES = ['IELTS', 'TOEFL', 'GRE', 'PTE', 'Duolingo', 'GMAT', 'SAT'];

export function TestPrepSchedulesAdmin() {
  const [schedules, setSchedules] = useState<TestPrepSchedule[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingSchedule, setEditingSchedule] = useState<TestPrepSchedule | null>(null);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const { toast } = useToast();

  const [formData, setFormData] = useState({
    test_type: 'IELTS',
    title: '',
    description: '',
    schedule_image_url: '',
    schedule_pdf_url: '',
    start_date: '',
    end_date: '',
    batch_timings: '',
    discount_percentage: 0,
    original_price: 0,
    discounted_price: 0,
    features: '',
    is_active: true,
    display_order: 0,
  });

  useEffect(() => {
    fetchSchedules();
  }, []);

  const fetchSchedules = async () => {
    try {
      const { data, error } = await supabase
        .from('test_prep_schedules')
        .select('*')
        .order('test_type', { ascending: true })
        .order('display_order', { ascending: true });

      if (error) throw error;
      setSchedules((data || []).map(item => ({
        ...item,
        features: Array.isArray(item.features) ? item.features as string[] : []
      })));
    } catch (error) {
      console.error('Error fetching schedules:', error);
      toast({
        title: 'Error',
        description: 'Failed to load test prep schedules',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    try {
      const scheduleData = {
        ...formData,
        features: formData.features ? formData.features.split('\n').filter(f => f.trim()) : [],
        original_price: formData.original_price || null,
        discounted_price: formData.discounted_price || null,
      };

      if (editingSchedule) {
        const { error } = await supabase
          .from('test_prep_schedules')
          .update(scheduleData)
          .eq('id', editingSchedule.id);

        if (error) throw error;
        toast({ title: 'Success', description: 'Schedule updated successfully' });
      } else {
        const { error } = await supabase
          .from('test_prep_schedules')
          .insert([scheduleData]);

        if (error) throw error;
        toast({ title: 'Success', description: 'Schedule created successfully' });
      }

      setIsDialogOpen(false);
      resetForm();
      fetchSchedules();
    } catch (error) {
      console.error('Error saving schedule:', error);
      toast({
        title: 'Error',
        description: 'Failed to save schedule',
        variant: 'destructive',
      });
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to delete this schedule?')) return;

    try {
      const { error } = await supabase
        .from('test_prep_schedules')
        .delete()
        .eq('id', id);

      if (error) throw error;
      toast({ title: 'Success', description: 'Schedule deleted successfully' });
      fetchSchedules();
    } catch (error) {
      console.error('Error deleting schedule:', error);
      toast({
        title: 'Error',
        description: 'Failed to delete schedule',
        variant: 'destructive',
      });
    }
  };

  const handleEdit = (schedule: TestPrepSchedule) => {
    setEditingSchedule(schedule);
    setFormData({
      test_type: schedule.test_type,
      title: schedule.title,
      description: schedule.description || '',
      schedule_image_url: schedule.schedule_image_url || '',
      schedule_pdf_url: schedule.schedule_pdf_url || '',
      start_date: schedule.start_date || '',
      end_date: schedule.end_date || '',
      batch_timings: schedule.batch_timings || '',
      discount_percentage: schedule.discount_percentage,
      original_price: schedule.original_price || 0,
      discounted_price: schedule.discounted_price || 0,
      features: schedule.features?.join('\n') || '',
      is_active: schedule.is_active,
      display_order: schedule.display_order,
    });
    setIsDialogOpen(true);
  };

  const resetForm = () => {
    setEditingSchedule(null);
    setFormData({
      test_type: 'IELTS',
      title: '',
      description: '',
      schedule_image_url: '',
      schedule_pdf_url: '',
      start_date: '',
      end_date: '',
      batch_timings: '',
      discount_percentage: 0,
      original_price: 0,
      discounted_price: 0,
      features: '',
      is_active: true,
      display_order: 0,
    });
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-3xl font-bold">Test Prep Schedules</h2>
          <p className="text-muted-foreground">Manage coaching schedules for test preparation</p>
        </div>
        <Dialog open={isDialogOpen} onOpenChange={(open) => {
          setIsDialogOpen(open);
          if (!open) resetForm();
        }}>
          <DialogTrigger asChild>
            <Button className="bg-gradient-primary">
              <Plus className="w-4 h-4 mr-2" />
              Add Schedule
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>{editingSchedule ? 'Edit' : 'Add'} Test Prep Schedule</DialogTitle>
              <DialogDescription>
                Create or update test preparation coaching schedules
              </DialogDescription>
            </DialogHeader>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="test_type">Test Type *</Label>
                  <Select value={formData.test_type} onValueChange={(value) => setFormData({ ...formData, test_type: value })}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {TEST_TYPES.map((type) => (
                        <SelectItem key={type} value={type}>{type}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="title">Title *</Label>
                  <Input
                    id="title"
                    value={formData.title}
                    onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                    required
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="description">Description</Label>
                <Textarea
                  id="description"
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  rows={3}
                />
              </div>

              <div className="space-y-2">
                <Label>Schedule Image</Label>
                <MediaUploader
                  bucketName="test-prep-media"
                  acceptedFileTypes="image/*"
                  onUploadComplete={(url) => setFormData({ ...formData, schedule_image_url: url })}
                />
                {formData.schedule_image_url && (
                  <img src={formData.schedule_image_url} alt="Schedule preview" className="w-full h-32 object-cover rounded-lg" />
                )}
              </div>

              <div className="space-y-2">
                <Label>Schedule PDF (Optional)</Label>
                <MediaUploader
                  bucketName="test-prep-media"
                  acceptedFileTypes="application/pdf"
                  onUploadComplete={(url) => setFormData({ ...formData, schedule_pdf_url: url })}
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="start_date">Start Date</Label>
                  <Input
                    id="start_date"
                    type="date"
                    value={formData.start_date}
                    onChange={(e) => setFormData({ ...formData, start_date: e.target.value })}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="end_date">End Date</Label>
                  <Input
                    id="end_date"
                    type="date"
                    value={formData.end_date}
                    onChange={(e) => setFormData({ ...formData, end_date: e.target.value })}
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="batch_timings">Batch Timings</Label>
                <Input
                  id="batch_timings"
                  value={formData.batch_timings}
                  onChange={(e) => setFormData({ ...formData, batch_timings: e.target.value })}
                  placeholder="e.g., Morning: 9 AM - 12 PM, Evening: 6 PM - 9 PM"
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="discount_percentage">Discount %</Label>
                  <Input
                    id="discount_percentage"
                    type="number"
                    min="0"
                    max="100"
                    value={formData.discount_percentage}
                    onChange={(e) => setFormData({ ...formData, discount_percentage: parseInt(e.target.value) || 0 })}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="original_price">Original Price</Label>
                  <Input
                    id="original_price"
                    type="number"
                    min="0"
                    value={formData.original_price}
                    onChange={(e) => setFormData({ ...formData, original_price: parseFloat(e.target.value) || 0 })}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="discounted_price">Discounted Price</Label>
                  <Input
                    id="discounted_price"
                    type="number"
                    min="0"
                    value={formData.discounted_price}
                    onChange={(e) => setFormData({ ...formData, discounted_price: parseFloat(e.target.value) || 0 })}
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="features">Features (one per line)</Label>
                <Textarea
                  id="features"
                  value={formData.features}
                  onChange={(e) => setFormData({ ...formData, features: e.target.value })}
                  rows={4}
                  placeholder="Expert trainers&#10;Live classes&#10;Study materials included"
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="flex items-center space-x-2">
                  <Switch
                    id="is_active"
                    checked={formData.is_active}
                    onCheckedChange={(checked) => setFormData({ ...formData, is_active: checked })}
                  />
                  <Label htmlFor="is_active">Active</Label>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="display_order">Display Order</Label>
                  <Input
                    id="display_order"
                    type="number"
                    value={formData.display_order}
                    onChange={(e) => setFormData({ ...formData, display_order: parseInt(e.target.value) || 0 })}
                  />
                </div>
              </div>

              <div className="flex justify-end gap-2">
                <Button type="button" variant="outline" onClick={() => setIsDialogOpen(false)}>
                  Cancel
                </Button>
                <Button type="submit" className="bg-gradient-primary">
                  {editingSchedule ? 'Update' : 'Create'} Schedule
                </Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {loading ? (
        <div className="text-center py-12">Loading schedules...</div>
      ) : schedules.length === 0 ? (
        <Card>
          <CardContent className="text-center py-12">
            <Calendar className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
            <p className="text-muted-foreground">No test prep schedules yet. Add one to get started.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {schedules.map((schedule) => (
            <Card key={schedule.id} className="hover:shadow-lg transition-shadow">
              <CardHeader>
                <div className="flex items-start justify-between">
                  <div>
                    <div className="flex items-center gap-2">
                      <CardTitle className="text-lg">{schedule.test_type}</CardTitle>
                      {!schedule.is_active && (
                        <span className="text-xs bg-muted px-2 py-1 rounded">Inactive</span>
                      )}
                    </div>
                    <p className="text-sm font-semibold text-muted-foreground">{schedule.title}</p>
                  </div>
                  {schedule.discount_percentage > 0 && (
                    <span className="bg-red-500 text-white text-xs font-bold px-2 py-1 rounded">
                      -{schedule.discount_percentage}%
                    </span>
                  )}
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                {schedule.schedule_image_url && (
                  <img
                    src={schedule.schedule_image_url}
                    alt={schedule.title}
                    className="w-full h-32 object-cover rounded-lg"
                  />
                )}
                {schedule.description && (
                  <p className="text-sm text-muted-foreground line-clamp-2">{schedule.description}</p>
                )}
                {(schedule.original_price || schedule.discounted_price) && (
                  <div className="flex items-center gap-2">
                    {schedule.original_price && schedule.discount_percentage > 0 && (
                      <span className="text-sm line-through text-muted-foreground">
                        ₹{schedule.original_price}
                      </span>
                    )}
                    {schedule.discounted_price && (
                      <span className="text-lg font-bold text-primary">
                        ₹{schedule.discounted_price}
                      </span>
                    )}
                  </div>
                )}
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" onClick={() => handleEdit(schedule)} className="flex-1">
                    <Edit className="w-4 h-4 mr-1" />
                    Edit
                  </Button>
                  <Button variant="destructive" size="sm" onClick={() => handleDelete(schedule.id)}>
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}