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
import { Plus, Edit, Trash2 } from 'lucide-react';
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
import { format } from 'date-fns';

interface TravelNews {
  id: string;
  title: string;
  content: string | null;
  news_type: string;
  is_active: boolean;
  publish_date: string;
}

export default function TravelNewsAdmin() {
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingNews, setEditingNews] = useState<TravelNews | null>(null);
  const [formData, setFormData] = useState({
    title: '',
    content: '',
    news_type: 'general',
    is_active: true,
    publish_date: new Date().toISOString().split('T')[0],
  });

  const queryClient = useQueryClient();

  const { data: newsItems, isLoading } = useQuery({
    queryKey: ['travel-news'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('travel_news')
        .select('*')
        .order('publish_date', { ascending: false });
      if (error) throw error;
      return data as TravelNews[];
    },
  });

  const createMutation = useMutation({
    mutationFn: async (data: typeof formData) => {
      const { error } = await supabase.from('travel_news').insert([data]);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['travel-news'] });
      toast.success('News created successfully');
      resetForm();
    },
    onError: () => toast.error('Failed to create news'),
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: typeof formData }) => {
      const { error } = await supabase
        .from('travel_news')
        .update(data)
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['travel-news'] });
      toast.success('News updated successfully');
      resetForm();
    },
    onError: () => toast.error('Failed to update news'),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('travel_news').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['travel-news'] });
      toast.success('News deleted successfully');
    },
    onError: () => toast.error('Failed to delete news'),
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (editingNews) {
      updateMutation.mutate({ id: editingNews.id, data: formData });
    } else {
      createMutation.mutate(formData);
    }
  };

  const resetForm = () => {
    setFormData({
      title: '',
      content: '',
      news_type: 'general',
      is_active: true,
      publish_date: new Date().toISOString().split('T')[0],
    });
    setEditingNews(null);
    setIsDialogOpen(false);
  };

  const handleEdit = (news: TravelNews) => {
    setEditingNews(news);
    setFormData({
      title: news.title,
      content: news.content || '',
      news_type: news.news_type,
      is_active: news.is_active,
      publish_date: news.publish_date.split('T')[0],
    });
    setIsDialogOpen(true);
  };

  if (isLoading) return <div>Loading...</div>;

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold">Travel News</h2>
          <p className="text-muted-foreground">Manage news & announcements for scrolling ticker</p>
        </div>
        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogTrigger asChild>
            <Button onClick={() => resetForm()}>
              <Plus className="mr-2 h-4 w-4" />
              Add News
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>
                {editingNews ? 'Edit News' : 'Add New News'}
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
                <Label htmlFor="content">Content</Label>
                <Textarea
                  id="content"
                  value={formData.content}
                  onChange={(e) => setFormData({ ...formData, content: e.target.value })}
                  rows={4}
                />
              </div>
              <div>
                <Label htmlFor="news_type">News Type</Label>
                <Select
                  value={formData.news_type}
                  onValueChange={(value) => setFormData({ ...formData, news_type: value })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="general">General</SelectItem>
                    <SelectItem value="offer">Offer</SelectItem>
                    <SelectItem value="announcement">Announcement</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label htmlFor="publish_date">Publish Date</Label>
                <Input
                  id="publish_date"
                  type="date"
                  value={formData.publish_date}
                  onChange={(e) => setFormData({ ...formData, publish_date: e.target.value })}
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
                  {editingNews ? 'Update' : 'Create'}
                </Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <div className="grid gap-4">
        {newsItems?.map((news) => (
          <Card key={news.id} className="p-4">
            <div className="flex items-start justify-between">
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-2">
                  <h3 className="font-semibold">{news.title}</h3>
                  <span
                    className={`px-2 py-1 text-xs rounded ${
                      news.is_active
                        ? 'bg-green-100 text-green-800'
                        : 'bg-gray-100 text-gray-800'
                    }`}
                  >
                    {news.is_active ? 'Active' : 'Inactive'}
                  </span>
                  <span className="px-2 py-1 text-xs rounded bg-blue-100 text-blue-800 capitalize">
                    {news.news_type}
                  </span>
                </div>
                <p className="text-sm text-muted-foreground mb-2">{news.content}</p>
                <p className="text-xs text-muted-foreground">
                  Published: {format(new Date(news.publish_date), 'MMM dd, yyyy')}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => handleEdit(news)}
                >
                  <Edit className="h-4 w-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => deleteMutation.mutate(news.id)}
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
