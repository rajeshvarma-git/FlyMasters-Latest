import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { supabase } from '@student/integrations/supabase/client';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@student/components/ui/dialog';
import { Button } from '@student/components/ui/button';
import { Input } from '@student/components/ui/input';
import { Label } from '@student/components/ui/label';
import { Textarea } from '@student/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@student/components/ui/select';
import { toast } from 'sonner';
import { Calendar, Users, DollarSign, MapPin, Phone, Mail, User } from 'lucide-react';

interface TravelPackage {
  id: string;
  package_name: string;
  destination: string;
  duration_days: number;
  duration_nights: number;
  price_per_person: number;
  currency: string;
}

interface BookingInquiryModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  selectedPackage?: TravelPackage | null;
}

export default function BookingInquiryModal({ open, onOpenChange, selectedPackage }: BookingInquiryModalProps) {
  const [formData, setFormData] = useState({
    full_name: '',
    email: '',
    phone: '',
    destination: selectedPackage?.destination || '',
    travel_start_date: '',
    travel_end_date: '',
    number_of_travelers: 1,
    budget_range: '',
    trip_type: '',
    special_requirements: '',
    package_id: selectedPackage?.id || null,
  });

  // Update form when package changes
  useState(() => {
    if (selectedPackage) {
      setFormData(prev => ({
        ...prev,
        destination: selectedPackage.destination,
        package_id: selectedPackage.id,
        special_requirements: `Selected Package: ${selectedPackage.package_name}\nDuration: ${selectedPackage.duration_days}D/${selectedPackage.duration_nights}N\nPrice: ${selectedPackage.currency === 'INR' ? '₹' : '$'}${selectedPackage.price_per_person}/person`,
      }));
    }
  });

  const submitMutation = useMutation({
    mutationFn: async (data: typeof formData) => {
      const { error } = await supabase
        .from('travel_inquiries')
        .insert([{ 
          ...data, 
          status: 'new', 
          source: 'website',
          package_id: data.package_id 
        }]);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success('Booking inquiry submitted successfully!', {
        description: 'Our travel experts will contact you within 24 hours.',
      });
      setFormData({
        full_name: '',
        email: '',
        phone: '',
        destination: '',
        travel_start_date: '',
        travel_end_date: '',
        number_of_travelers: 1,
        budget_range: '',
        trip_type: '',
        special_requirements: '',
        package_id: null,
      });
      onOpenChange(false);
    },
    onError: (error: any) => {
      toast.error('Failed to submit inquiry', {
        description: error.message || 'Please try again later.',
      });
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    // Basic validation
    if (!formData.full_name || !formData.email || !formData.phone || !formData.destination) {
      toast.error('Please fill in all required fields');
      return;
    }

    if (!formData.travel_start_date || !formData.travel_end_date) {
      toast.error('Please select travel dates');
      return;
    }

    if (new Date(formData.travel_start_date) >= new Date(formData.travel_end_date)) {
      toast.error('End date must be after start date');
      return;
    }

    if (!formData.budget_range) {
      toast.error('Please select a budget range');
      return;
    }

    submitMutation.mutate(formData);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-2xl">
            {selectedPackage ? `Book: ${selectedPackage.package_name}` : 'Request a Travel Quote'}
          </DialogTitle>
          <DialogDescription>
            {selectedPackage 
              ? `Complete your booking details for ${selectedPackage.destination}` 
              : 'Fill in your details and our travel experts will create a personalized itinerary for you.'}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Personal Information */}
          <div className="space-y-4">
            <h3 className="text-lg font-semibold border-b pb-2">Personal Information</h3>
            
            <div className="grid sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="full_name" className="flex items-center gap-2">
                  <User className="h-4 w-4" />
                  Full Name *
                </Label>
                <Input
                  id="full_name"
                  placeholder="John Doe"
                  value={formData.full_name}
                  onChange={(e) => setFormData({ ...formData, full_name: e.target.value })}
                  required
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="email" className="flex items-center gap-2">
                  <Mail className="h-4 w-4" />
                  Email Address *
                </Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="john@example.com"
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  required
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="phone" className="flex items-center gap-2">
                  <Phone className="h-4 w-4" />
                  Phone Number *
                </Label>
                <Input
                  id="phone"
                  type="tel"
                  placeholder="+91 9876543210"
                  value={formData.phone}
                  onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                  required
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="destination" className="flex items-center gap-2">
                  <MapPin className="h-4 w-4" />
                  Destination *
                </Label>
                <Input
                  id="destination"
                  placeholder="e.g., Paris, Maldives, Dubai"
                  value={formData.destination}
                  onChange={(e) => setFormData({ ...formData, destination: e.target.value })}
                  disabled={!!selectedPackage}
                  required
                />
              </div>
            </div>
          </div>

          {/* Travel Details */}
          <div className="space-y-4">
            <h3 className="text-lg font-semibold border-b pb-2">Travel Details</h3>
            
            <div className="grid sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="travel_start_date" className="flex items-center gap-2">
                  <Calendar className="h-4 w-4" />
                  Start Date *
                </Label>
                <Input
                  id="travel_start_date"
                  type="date"
                  value={formData.travel_start_date}
                  onChange={(e) => setFormData({ ...formData, travel_start_date: e.target.value })}
                  min={new Date().toISOString().split('T')[0]}
                  required
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="travel_end_date" className="flex items-center gap-2">
                  <Calendar className="h-4 w-4" />
                  End Date *
                </Label>
                <Input
                  id="travel_end_date"
                  type="date"
                  value={formData.travel_end_date}
                  onChange={(e) => setFormData({ ...formData, travel_end_date: e.target.value })}
                  min={formData.travel_start_date || new Date().toISOString().split('T')[0]}
                  required
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="number_of_travelers" className="flex items-center gap-2">
                  <Users className="h-4 w-4" />
                  Number of Travelers *
                </Label>
                <Input
                  id="number_of_travelers"
                  type="number"
                  min="1"
                  max="50"
                  value={formData.number_of_travelers}
                  onChange={(e) => setFormData({ ...formData, number_of_travelers: parseInt(e.target.value) || 1 })}
                  required
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="budget_range" className="flex items-center gap-2">
                  <DollarSign className="h-4 w-4" />
                  Budget Range (INR) *
                </Label>
                <Select
                  value={formData.budget_range}
                  onValueChange={(value) => setFormData({ ...formData, budget_range: value })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select budget" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="under-50k">Under ₹50,000</SelectItem>
                    <SelectItem value="50k-1lakh">₹50,000 - ₹1,00,000</SelectItem>
                    <SelectItem value="1lakh-2lakh">₹1,00,000 - ₹2,00,000</SelectItem>
                    <SelectItem value="2lakh-5lakh">₹2,00,000 - ₹5,00,000</SelectItem>
                    <SelectItem value="5lakh-10lakh">₹5,00,000 - ₹10,00,000</SelectItem>
                    <SelectItem value="above-10lakh">Above ₹10,00,000</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2 sm:col-span-2">
                <Label htmlFor="trip_type">Trip Type</Label>
                <Select
                  value={formData.trip_type}
                  onValueChange={(value) => setFormData({ ...formData, trip_type: value })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select trip type" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="honeymoon">Honeymoon</SelectItem>
                    <SelectItem value="family">Family</SelectItem>
                    <SelectItem value="holidays">Holidays</SelectItem>
                    <SelectItem value="road">Road Trip</SelectItem>
                    <SelectItem value="adventure">Adventure</SelectItem>
                    <SelectItem value="solo">Solo</SelectItem>
                    <SelectItem value="cruise">Cruise</SelectItem>
                    <SelectItem value="group">Group Trip</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>

          {/* Special Requirements */}
          <div className="space-y-2">
            <Label htmlFor="special_requirements">Special Requirements or Preferences</Label>
            <Textarea
              id="special_requirements"
              placeholder="Any specific requirements, dietary restrictions, accessibility needs, activities you'd like to include, etc."
              value={formData.special_requirements}
              onChange={(e) => setFormData({ ...formData, special_requirements: e.target.value })}
              rows={4}
            />
          </div>

          {/* Submit Button */}
          <div className="flex gap-3 pt-4">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              className="flex-1"
              disabled={submitMutation.isPending}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              className="flex-1"
              disabled={submitMutation.isPending}
            >
              {submitMutation.isPending ? 'Submitting...' : 'Submit Inquiry'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
