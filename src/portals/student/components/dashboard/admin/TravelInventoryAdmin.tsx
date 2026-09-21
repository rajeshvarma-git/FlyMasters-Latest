import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@student/integrations/supabase/client';
import { Card } from '@student/components/ui/card';
import { Button } from '@student/components/ui/button';
import { Input } from '@student/components/ui/input';
import { Label } from '@student/components/ui/label';
import { Textarea } from '@student/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@student/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@student/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@student/components/ui/table';
import { Badge } from '@student/components/ui/badge';
import { Switch } from '@student/components/ui/switch';
import { Calendar } from '@student/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@student/components/ui/popover';
import { toast } from 'sonner';
import { Package, Calendar as CalendarIcon, AlertTriangle, CheckCircle, Plus, Edit, Ban } from 'lucide-react';
import { format, addDays } from 'date-fns';

export default function TravelInventoryAdmin() {
  const queryClient = useQueryClient();
  const [selectedPackage, setSelectedPackage] = useState<string>('');
  const [selectedDate, setSelectedDate] = useState<Date>();
  const [showInventoryDialog, setShowInventoryDialog] = useState(false);
  const [showBlackoutDialog, setShowBlackoutDialog] = useState(false);

  const { data: packages } = useQuery({
    queryKey: ['travel-packages-for-inventory'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('travel_packages')
        .select('id, package_name, destination')
        .eq('is_active', true)
        .order('package_name');
      if (error) throw error;
      return data;
    },
  });

  const { data: inventory, isLoading } = useQuery({
    queryKey: ['package-inventory', selectedPackage],
    queryFn: async () => {
      if (!selectedPackage) return [];

      const startDate = new Date();
      const endDate = addDays(startDate, 90);

      const { data, error } = await supabase
        .from('package_inventory')
        .select('*, travel_packages(package_name)')
        .eq('package_id', selectedPackage)
        .gte('date', startDate.toISOString().split('T')[0])
        .lte('date', endDate.toISOString().split('T')[0])
        .order('date', { ascending: true });

      if (error) throw error;
      return data;
    },
    enabled: !!selectedPackage,
  });

  const updateInventory = useMutation({
    mutationFn: async (data: any) => {
      const { error } = await supabase
        .from('package_inventory')
        .upsert({
          package_id: selectedPackage,
          ...data,
          updated_at: new Date().toISOString(),
        }, {
          onConflict: 'package_id,date',
        });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['package-inventory'] });
      toast.success('Inventory updated successfully');
      setShowInventoryDialog(false);
      setShowBlackoutDialog(false);
    },
    onError: () => {
      toast.error('Failed to update inventory');
    },
  });

  const getAvailabilityColor = (available: number, total: number) => {
    const percentage = (available / total) * 100;
    if (percentage >= 70) return 'text-green-600';
    if (percentage >= 30) return 'text-yellow-600';
    return 'text-red-600';
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-3xl font-bold">Inventory Management</h2>
          <p className="text-muted-foreground">Manage package availability and blackout dates</p>
        </div>
        <div className="flex gap-2">
          <Button onClick={() => setShowInventoryDialog(true)} disabled={!selectedPackage}>
            <Plus className="w-4 h-4 mr-2" />
            Add Inventory
          </Button>
          <Button variant="outline" onClick={() => setShowBlackoutDialog(true)} disabled={!selectedPackage}>
            <Ban className="w-4 h-4 mr-2" />
            Add Blackout Date
          </Button>
        </div>
      </div>

      {/* Package Selector */}
      <Card className="p-4">
        <div className="flex gap-4 items-end">
          <div className="flex-1">
            <Label>Select Package</Label>
            <Select value={selectedPackage} onValueChange={setSelectedPackage}>
              <SelectTrigger>
                <SelectValue placeholder="Choose a package to manage" />
              </SelectTrigger>
              <SelectContent>
                {packages?.map((pkg) => (
                  <SelectItem key={pkg.id} value={pkg.id}>
                    {pkg.package_name} - {pkg.destination}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {selectedPackage && (
            <Button variant="outline" onClick={() => setSelectedPackage('')}>
              Clear Selection
            </Button>
          )}
        </div>
      </Card>

      {/* Summary Stats */}
      {selectedPackage && inventory && (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card className="p-4">
            <div className="flex items-center gap-3">
              <Package className="w-8 h-8 text-blue-600" />
              <div>
                <p className="text-sm text-muted-foreground">Total Slots</p>
                <h3 className="text-2xl font-bold">
                  {inventory.reduce((sum, item) => sum + item.total_slots, 0)}
                </h3>
              </div>
            </div>
          </Card>

          <Card className="p-4">
            <div className="flex items-center gap-3">
              <CheckCircle className="w-8 h-8 text-green-600" />
              <div>
                <p className="text-sm text-muted-foreground">Available</p>
                <h3 className="text-2xl font-bold">
                  {inventory.reduce((sum, item) => sum + (item.available_slots || 0), 0)}
                </h3>
              </div>
            </div>
          </Card>

          <Card className="p-4">
            <div className="flex items-center gap-3">
              <Package className="w-8 h-8 text-orange-600" />
              <div>
                <p className="text-sm text-muted-foreground">Booked</p>
                <h3 className="text-2xl font-bold">
                  {inventory.reduce((sum, item) => sum + item.booked_slots, 0)}
                </h3>
              </div>
            </div>
          </Card>

          <Card className="p-4">
            <div className="flex items-center gap-3">
              <Ban className="w-8 h-8 text-red-600" />
              <div>
                <p className="text-sm text-muted-foreground">Blackout Days</p>
                <h3 className="text-2xl font-bold">
                  {inventory.filter(item => item.is_blackout_date).length}
                </h3>
              </div>
            </div>
          </Card>
        </div>
      )}

      {/* Inventory Table */}
      {selectedPackage && (
        <Card>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Total Slots</TableHead>
                <TableHead>Booked</TableHead>
                <TableHead>Blocked</TableHead>
                <TableHead>Available</TableHead>
                <TableHead>Hotel Status</TableHead>
                <TableHead>Flight Status</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={9} className="text-center">Loading...</TableCell>
                </TableRow>
              ) : inventory?.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={9} className="text-center">
                    No inventory data. Add inventory to get started.
                  </TableCell>
                </TableRow>
              ) : (
                inventory?.map((item) => (
                  <TableRow key={item.id} className={item.is_blackout_date ? 'bg-red-50' : ''}>
                    <TableCell className="font-medium">
                      {format(new Date(item.date), 'MMM dd, yyyy')}
                    </TableCell>
                    <TableCell>{item.total_slots}</TableCell>
                    <TableCell>{item.booked_slots}</TableCell>
                    <TableCell>{item.blocked_slots}</TableCell>
                    <TableCell>
                      <span className={`font-semibold ${getAvailabilityColor(item.available_slots || 0, item.total_slots)}`}>
                        {item.available_slots || 0}
                      </span>
                    </TableCell>
                    <TableCell>
                      <Badge variant={item.hotel_inventory_status === 'available' ? 'default' : 'destructive'}>
                        {item.hotel_inventory_status}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Badge variant={item.flight_inventory_status === 'available' ? 'default' : 'destructive'}>
                        {item.flight_inventory_status}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {item.is_blackout_date ? (
                        <Badge variant="destructive">
                          <Ban className="w-3 h-3 mr-1" />
                          Blackout
                        </Badge>
                      ) : item.available_slots === 0 ? (
                        <Badge variant="secondary">Full</Badge>
                      ) : (
                        <Badge variant="default">Active</Badge>
                      )}
                    </TableCell>
                    <TableCell>
                      <Button size="sm" variant="ghost">
                        <Edit className="w-4 h-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </Card>
      )}

      {/* Add Inventory Dialog */}
      <Dialog open={showInventoryDialog} onOpenChange={setShowInventoryDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Inventory</DialogTitle>
          </DialogHeader>
          <InventoryForm
            packageId={selectedPackage}
            onSubmit={(data) => updateInventory.mutate(data)}
            onCancel={() => setShowInventoryDialog(false)}
          />
        </DialogContent>
      </Dialog>

      {/* Add Blackout Date Dialog */}
      <Dialog open={showBlackoutDialog} onOpenChange={setShowBlackoutDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Blackout Date</DialogTitle>
          </DialogHeader>
          <BlackoutForm
            packageId={selectedPackage}
            onSubmit={(data) => updateInventory.mutate({ ...data, is_blackout_date: true })}
            onCancel={() => setShowBlackoutDialog(false)}
          />
        </DialogContent>
      </Dialog>
    </div>
  );
}

function InventoryForm({ packageId, onSubmit, onCancel }: any) {
  const [formData, setFormData] = useState({
    date: '',
    total_slots: 10,
    blocked_slots: 0,
    hotel_inventory_status: 'available',
    flight_inventory_status: 'available',
    notes: '',
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit(formData);
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <Label>Date *</Label>
        <Input
          type="date"
          value={formData.date}
          onChange={(e) => setFormData({ ...formData, date: e.target.value })}
          required
        />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <Label>Total Slots *</Label>
          <Input
            type="number"
            min="1"
            value={formData.total_slots}
            onChange={(e) => setFormData({ ...formData, total_slots: parseInt(e.target.value) })}
            required
          />
        </div>
        <div>
          <Label>Blocked Slots</Label>
          <Input
            type="number"
            min="0"
            value={formData.blocked_slots}
            onChange={(e) => setFormData({ ...formData, blocked_slots: parseInt(e.target.value) })}
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <Label>Hotel Status</Label>
          <Select
            value={formData.hotel_inventory_status}
            onValueChange={(value) => setFormData({ ...formData, hotel_inventory_status: value })}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="available">Available</SelectItem>
              <SelectItem value="limited">Limited</SelectItem>
              <SelectItem value="sold_out">Sold Out</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label>Flight Status</Label>
          <Select
            value={formData.flight_inventory_status}
            onValueChange={(value) => setFormData({ ...formData, flight_inventory_status: value })}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="available">Available</SelectItem>
              <SelectItem value="limited">Limited</SelectItem>
              <SelectItem value="sold_out">Sold Out</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <div>
        <Label>Notes</Label>
        <Textarea
          value={formData.notes}
          onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
          rows={2}
        />
      </div>

      <div className="flex gap-2">
        <Button type="submit" className="flex-1">Add Inventory</Button>
        <Button type="button" variant="outline" onClick={onCancel}>Cancel</Button>
      </div>
    </form>
  );
}

function BlackoutForm({ packageId, onSubmit, onCancel }: any) {
  const [formData, setFormData] = useState({
    date: '',
    total_slots: 0,
    booked_slots: 0,
    blocked_slots: 0,
    blackout_reason: '',
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit(formData);
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <Label>Date *</Label>
        <Input
          type="date"
          value={formData.date}
          onChange={(e) => setFormData({ ...formData, date: e.target.value })}
          required
        />
      </div>

      <div>
        <Label>Reason *</Label>
        <Textarea
          value={formData.blackout_reason}
          onChange={(e) => setFormData({ ...formData, blackout_reason: e.target.value })}
          placeholder="e.g., Maintenance, Holiday, Weather concerns"
          required
          rows={3}
        />
      </div>

      <div className="flex gap-2">
        <Button type="submit" className="flex-1">Add Blackout Date</Button>
        <Button type="button" variant="outline" onClick={onCancel}>Cancel</Button>
      </div>
    </form>
  );
}
