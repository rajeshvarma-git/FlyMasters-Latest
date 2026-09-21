import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@student/integrations/supabase/client';
import { Button } from '@student/components/ui/button';
import { Card } from '@student/components/ui/card';
import { Badge } from '@student/components/ui/badge';
import { Input } from '@student/components/ui/input';
import { Label } from '@student/components/ui/label';
import { Textarea } from '@student/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@student/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@student/components/ui/dialog';
import { toast } from 'sonner';
import { Calendar, DollarSign, Mail, MapPin, Phone, User, Users, Eye, CheckCircle, Clock, XCircle } from 'lucide-react';
import { format } from 'date-fns';

interface TravelInquiry {
  id: string;
  full_name: string;
  email: string;
  phone: string;
  destination: string;
  travel_start_date: string;
  travel_end_date: string;
  number_of_travelers: number;
  budget_range: string;
  trip_type: string | null;
  special_requirements: string | null;
  status: string;
  assigned_to: string | null;
  admin_notes: string | null;
  created_at: string;
  follow_up_date: string | null;
  source: string;
}

export default function TravelInquiriesAdmin() {
  const [selectedInquiry, setSelectedInquiry] = useState<TravelInquiry | null>(null);
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const queryClient = useQueryClient();

  const { data: inquiries, isLoading } = useQuery({
    queryKey: ['travel-inquiries', statusFilter],
    queryFn: async () => {
      let query = supabase
        .from('travel_inquiries')
        .select('*')
        .order('created_at', { ascending: false });

      if (statusFilter !== 'all') {
        query = query.eq('status', statusFilter);
      }

      const { data, error } = await query;
      if (error) throw error;
      return data as TravelInquiry[];
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, updates }: { id: string; updates: Partial<TravelInquiry> }) => {
      const { error } = await supabase
        .from('travel_inquiries')
        .update(updates)
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['travel-inquiries'] });
      toast.success('Inquiry updated successfully');
      setSelectedInquiry(null);
    },
    onError: () => toast.error('Failed to update inquiry'),
  });

  const filteredInquiries = inquiries?.filter((inquiry) =>
    inquiry.full_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    inquiry.email.toLowerCase().includes(searchQuery.toLowerCase()) ||
    inquiry.destination.toLowerCase().includes(searchQuery.toLowerCase()) ||
    inquiry.phone.includes(searchQuery)
  );

  const getStatusBadge = (status: string) => {
    const statusConfig = {
      new: { variant: 'default' as const, icon: Clock, label: 'New' },
      contacted: { variant: 'secondary' as const, icon: Phone, label: 'Contacted' },
      quoted: { variant: 'outline' as const, icon: DollarSign, label: 'Quoted' },
      booked: { variant: 'default' as const, icon: CheckCircle, label: 'Booked' },
      cancelled: { variant: 'destructive' as const, icon: XCircle, label: 'Cancelled' },
    };

    const config = statusConfig[status as keyof typeof statusConfig] || statusConfig.new;
    const Icon = config.icon;

    return (
      <Badge variant={config.variant} className="gap-1">
        <Icon className="h-3 w-3" />
        {config.label}
      </Badge>
    );
  };

  const stats = {
    total: inquiries?.length || 0,
    new: inquiries?.filter((i) => i.status === 'new').length || 0,
    contacted: inquiries?.filter((i) => i.status === 'contacted').length || 0,
    booked: inquiries?.filter((i) => i.status === 'booked').length || 0,
  };

  if (isLoading) return <div>Loading inquiries...</div>;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h2 className="text-2xl font-bold">Travel Booking Inquiries</h2>
        <p className="text-muted-foreground">Manage customer travel requests and bookings</p>
      </div>

      {/* Stats Cards */}
      <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-muted-foreground">Total Inquiries</p>
              <p className="text-2xl font-bold">{stats.total}</p>
            </div>
            <Users className="h-8 w-8 text-muted-foreground" />
          </div>
        </Card>
        <Card className="p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-muted-foreground">New</p>
              <p className="text-2xl font-bold text-primary">{stats.new}</p>
            </div>
            <Clock className="h-8 w-8 text-primary" />
          </div>
        </Card>
        <Card className="p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-muted-foreground">Contacted</p>
              <p className="text-2xl font-bold text-blue-600">{stats.contacted}</p>
            </div>
            <Phone className="h-8 w-8 text-blue-600" />
          </div>
        </Card>
        <Card className="p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-muted-foreground">Booked</p>
              <p className="text-2xl font-bold text-green-600">{stats.booked}</p>
            </div>
            <CheckCircle className="h-8 w-8 text-green-600" />
          </div>
        </Card>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-4">
        <div className="flex-1">
          <Input
            placeholder="Search by name, email, destination, or phone..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-full sm:w-48">
            <SelectValue placeholder="Filter by status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Inquiries</SelectItem>
            <SelectItem value="new">New</SelectItem>
            <SelectItem value="contacted">Contacted</SelectItem>
            <SelectItem value="quoted">Quoted</SelectItem>
            <SelectItem value="booked">Booked</SelectItem>
            <SelectItem value="cancelled">Cancelled</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Inquiries List */}
      <div className="grid gap-4">
        {filteredInquiries?.map((inquiry) => (
          <Card key={inquiry.id} className="p-6 hover:shadow-lg transition-shadow">
            <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-4">
              <div className="flex-1 space-y-3">
                <div className="flex items-start justify-between">
                  <div>
                    <h3 className="text-lg font-semibold flex items-center gap-2">
                      <User className="h-5 w-5 text-primary" />
                      {inquiry.full_name}
                    </h3>
                    <p className="text-sm text-muted-foreground">
                      Submitted {format(new Date(inquiry.created_at), 'PPP')}
                    </p>
                  </div>
                  {getStatusBadge(inquiry.status)}
                </div>

                <div className="grid sm:grid-cols-2 gap-3 text-sm">
                  <div className="flex items-center gap-2">
                    <Mail className="h-4 w-4 text-muted-foreground" />
                    <a href={`mailto:${inquiry.email}`} className="hover:underline">
                      {inquiry.email}
                    </a>
                  </div>
                  <div className="flex items-center gap-2">
                    <Phone className="h-4 w-4 text-muted-foreground" />
                    <a href={`tel:${inquiry.phone}`} className="hover:underline">
                      {inquiry.phone}
                    </a>
                  </div>
                  <div className="flex items-center gap-2">
                    <MapPin className="h-4 w-4 text-muted-foreground" />
                    <span>{inquiry.destination}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Calendar className="h-4 w-4 text-muted-foreground" />
                    <span>
                      {format(new Date(inquiry.travel_start_date), 'MMM dd')} -{' '}
                      {format(new Date(inquiry.travel_end_date), 'MMM dd, yyyy')}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Users className="h-4 w-4 text-muted-foreground" />
                    <span>{inquiry.number_of_travelers} traveler(s)</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <DollarSign className="h-4 w-4 text-muted-foreground" />
                    <span className="font-medium">{inquiry.budget_range}</span>
                  </div>
                </div>

                {inquiry.trip_type && (
                  <Badge variant="outline">{inquiry.trip_type}</Badge>
                )}

                {inquiry.special_requirements && (
                  <p className="text-sm text-muted-foreground bg-secondary/50 p-3 rounded-lg">
                    <strong>Requirements:</strong> {inquiry.special_requirements}
                  </p>
                )}
              </div>

              <Button
                variant="outline"
                size="sm"
                className="gap-2"
                onClick={() => setSelectedInquiry(inquiry)}
              >
                <Eye className="h-4 w-4" />
                Manage
              </Button>
            </div>
          </Card>
        ))}

        {filteredInquiries?.length === 0 && (
          <Card className="p-12 text-center">
            <p className="text-muted-foreground">No inquiries found</p>
          </Card>
        )}
      </div>

      {/* Edit Dialog */}
      {selectedInquiry && (
        <Dialog open={!!selectedInquiry} onOpenChange={() => setSelectedInquiry(null)}>
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Manage Inquiry - {selectedInquiry.full_name}</DialogTitle>
            </DialogHeader>

            <div className="space-y-6">
              {/* Customer Details (Read-only) */}
              <Card className="p-4 bg-secondary/50">
                <h3 className="font-semibold mb-3">Customer Information</h3>
                <div className="grid sm:grid-cols-2 gap-3 text-sm">
                  <div>
                    <strong>Name:</strong> {selectedInquiry.full_name}
                  </div>
                  <div>
                    <strong>Email:</strong> {selectedInquiry.email}
                  </div>
                  <div>
                    <strong>Phone:</strong> {selectedInquiry.phone}
                  </div>
                  <div>
                    <strong>Destination:</strong> {selectedInquiry.destination}
                  </div>
                  <div>
                    <strong>Travel Dates:</strong>{' '}
                    {format(new Date(selectedInquiry.travel_start_date), 'MMM dd')} -{' '}
                    {format(new Date(selectedInquiry.travel_end_date), 'MMM dd, yyyy')}
                  </div>
                  <div>
                    <strong>Travelers:</strong> {selectedInquiry.number_of_travelers}
                  </div>
                  <div>
                    <strong>Budget:</strong> {selectedInquiry.budget_range}
                  </div>
                  {selectedInquiry.trip_type && (
                    <div>
                      <strong>Trip Type:</strong> {selectedInquiry.trip_type}
                    </div>
                  )}
                </div>
                {selectedInquiry.special_requirements && (
                  <div className="mt-3">
                    <strong>Special Requirements:</strong>
                    <p className="text-muted-foreground mt-1">{selectedInquiry.special_requirements}</p>
                  </div>
                )}
              </Card>

              {/* Management Form */}
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  const formData = new FormData(e.currentTarget);
                  updateMutation.mutate({
                    id: selectedInquiry.id,
                    updates: {
                      status: formData.get('status') as string,
                      admin_notes: formData.get('admin_notes') as string,
                      follow_up_date: formData.get('follow_up_date') as string || null,
                    },
                  });
                }}
                className="space-y-4"
              >
                <div className="space-y-2">
                  <Label htmlFor="status">Status</Label>
                  <Select name="status" defaultValue={selectedInquiry.status}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="new">New</SelectItem>
                      <SelectItem value="contacted">Contacted</SelectItem>
                      <SelectItem value="quoted">Quoted</SelectItem>
                      <SelectItem value="booked">Booked</SelectItem>
                      <SelectItem value="cancelled">Cancelled</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="follow_up_date">Follow-up Date</Label>
                  <Input
                    id="follow_up_date"
                    name="follow_up_date"
                    type="date"
                    defaultValue={selectedInquiry.follow_up_date || ''}
                    min={new Date().toISOString().split('T')[0]}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="admin_notes">Admin Notes</Label>
                  <Textarea
                    id="admin_notes"
                    name="admin_notes"
                    defaultValue={selectedInquiry.admin_notes || ''}
                    rows={4}
                    placeholder="Add notes about this inquiry, quotes sent, conversations, etc."
                  />
                </div>

                <div className="flex gap-3 pt-4">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setSelectedInquiry(null)}
                    className="flex-1"
                  >
                    Cancel
                  </Button>
                  <Button type="submit" className="flex-1" disabled={updateMutation.isPending}>
                    {updateMutation.isPending ? 'Saving...' : 'Save Changes'}
                  </Button>
                </div>
              </form>
            </div>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
