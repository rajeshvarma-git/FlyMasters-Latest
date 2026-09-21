import { useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { supabase } from '@student/integrations/supabase/client';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@student/components/ui/dialog';
import { Input } from '@student/components/ui/input';
import { Textarea } from '@student/components/ui/textarea';
import { Button } from '@student/components/ui/button';
import { Label } from '@student/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@student/components/ui/select';
import { Calendar } from '@student/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@student/components/ui/popover';
import { Calendar as CalendarIcon, Loader2 } from 'lucide-react';
import { format } from 'date-fns';
import { toast } from 'sonner';
import { useAuth } from '@student/hooks/useAuth';

interface EnhancedBookingModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  selectedPackage?: any;
}

export default function EnhancedBookingModal({
  open,
  onOpenChange,
  selectedPackage,
}: EnhancedBookingModalProps) {
  const { user } = useAuth();
  const [formData, setFormData] = useState({
    full_name: '',
    email: '',
    phone: '',
    travel_date: undefined as Date | undefined,
    number_of_travelers: 1,
    accommodation_preference: '',
    dietary_requirements: '',
    special_requests: '',
  });

  const { data: availability } = useQuery({
    queryKey: ['package-availability', selectedPackage?.id],
    queryFn: async () => {
      if (!selectedPackage?.id) return [];
      const { data } = await supabase
        .from('package_availability')
        .select('*')
        .eq('package_id', selectedPackage.id)
        .eq('is_available', true)
        .gte('available_date', new Date().toISOString());
      return data || [];
    },
    enabled: !!selectedPackage?.id,
  });

  const createBooking = useMutation({
    mutationFn: async () => {
      const departureDate = formData.travel_date?.toISOString() || new Date().toISOString();
      const returnDate = new Date(formData.travel_date || new Date());
      returnDate.setDate(returnDate.getDate() + (selectedPackage.duration_days || 7));

      const { data, error } = await supabase
        .from('package_bookings')
        .insert({
          booking_reference: `BK-${Date.now()}`,
          package_id: selectedPackage.id,
          user_id: user?.id || '00000000-0000-0000-0000-000000000000',
          departure_date: departureDate,
          return_date: returnDate.toISOString(),
          number_of_travelers: formData.number_of_travelers,
          price_per_person: selectedPackage.price_per_person,
          total_amount: selectedPackage.price_per_person * formData.number_of_travelers,
          final_amount: selectedPackage.price_per_person * formData.number_of_travelers,
          special_requirements: formData.special_requests,
          dietary_preferences: formData.dietary_requirements,
          accessibility_needs: formData.accommodation_preference,
        })
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      toast.success(`Booking confirmed! Reference: ${data.booking_reference}`);
      onOpenChange(false);
      setFormData({
        full_name: '',
        email: '',
        phone: '',
        travel_date: undefined,
        number_of_travelers: 1,
        accommodation_preference: '',
        dietary_requirements: '',
        special_requests: '',
      });
    },
    onError: () => {
      toast.error('Failed to create booking. Please try again.');
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!formData.full_name || !formData.email || !formData.phone || !formData.travel_date) {
      toast.error('Please fill in all required fields');
      return;
    }

    createBooking.mutate();
  };

  const totalPrice = selectedPackage?.price_per_person * formData.number_of_travelers;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {selectedPackage ? `Book ${selectedPackage.package_name}` : 'Booking Inquiry'}
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Label>Full Name *</Label>
              <Input
                value={formData.full_name}
                onChange={(e) => setFormData({ ...formData, full_name: e.target.value })}
                placeholder="John Doe"
                required
              />
            </div>

            <div>
              <Label>Email *</Label>
              <Input
                type="email"
                value={formData.email}
                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                placeholder="john@example.com"
                required
              />
            </div>

            <div>
              <Label>Phone *</Label>
              <Input
                type="tel"
                value={formData.phone}
                onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                placeholder="+1234567890"
                required
              />
            </div>

            <div>
              <Label>Number of Travelers *</Label>
              <Input
                type="number"
                min="1"
                max={selectedPackage?.max_travelers || 10}
                value={formData.number_of_travelers}
                onChange={(e) =>
                  setFormData({ ...formData, number_of_travelers: parseInt(e.target.value) })
                }
                required
              />
            </div>

            <div>
              <Label>Travel Date *</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" className="w-full justify-start">
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {formData.travel_date ? format(formData.travel_date, 'PPP') : 'Pick a date'}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0">
                  <Calendar
                    mode="single"
                    selected={formData.travel_date}
                    onSelect={(date) => setFormData({ ...formData, travel_date: date })}
                    disabled={(date) => date < new Date()}
                  />
                </PopoverContent>
              </Popover>
            </div>

            <div>
              <Label>Accommodation Preference</Label>
              <Select
                value={formData.accommodation_preference}
                onValueChange={(value) =>
                  setFormData({ ...formData, accommodation_preference: value })
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select preference" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="standard">Standard</SelectItem>
                  <SelectItem value="deluxe">Deluxe</SelectItem>
                  <SelectItem value="suite">Suite</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div>
            <Label>Dietary Requirements</Label>
            <Input
              value={formData.dietary_requirements}
              onChange={(e) => setFormData({ ...formData, dietary_requirements: e.target.value })}
              placeholder="e.g., Vegetarian, Vegan, Allergies"
            />
          </div>

          <div>
            <Label>Special Requests</Label>
            <Textarea
              value={formData.special_requests}
              onChange={(e) => setFormData({ ...formData, special_requests: e.target.value })}
              placeholder="Any special requests or requirements..."
              rows={3}
            />
          </div>

          {selectedPackage && (
            <div className="p-4 bg-muted rounded-lg">
              <div className="flex justify-between items-center mb-2">
                <span>Package Price:</span>
                <span className="font-semibold">${selectedPackage.price_per_person} x {formData.number_of_travelers}</span>
              </div>
              <div className="flex justify-between items-center text-lg font-bold border-t pt-2">
                <span>Total Amount:</span>
                <span className="text-primary">${totalPrice}</span>
              </div>
            </div>
          )}

          <div className="flex gap-2">
            <Button type="submit" disabled={createBooking.isPending} className="flex-1">
              {createBooking.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Confirm Booking
            </Button>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
