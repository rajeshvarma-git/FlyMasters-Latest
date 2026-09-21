import { useState, useEffect } from 'react';
import { useAuth } from '@student/hooks/useAuth';
import { supabase } from '@student/integrations/supabase/client';
import { useToast } from '@student/hooks/use-toast';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@student/components/ui/card';
import { Button } from '@student/components/ui/button';
import { Input } from '@student/components/ui/input';
import { Label } from '@student/components/ui/label';
import { Textarea } from '@student/components/ui/textarea';
import { DatePicker } from '@student/components/ui/date-picker';
import { Save, User, Briefcase, CreditCard, Phone as PhoneIcon } from 'lucide-react';

export function CounselorProfileForm() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [dateOfBirth, setDateOfBirth] = useState<Date>();
  const [joiningDate, setJoiningDate] = useState<Date>();
  const [counselorId, setCounselorId] = useState<string | null>(null);

  const [profileData, setProfileData] = useState({
    first_name: '',
    last_name: '',
    phone: '',
    country: ''
  });

  const [counselorData, setCounselorData] = useState({
    permanent_address: '',
    correspondence_address: '',
    aadhar_number: '',
    pan_number: '',
    bank_account_number: '',
    bank_ifsc_code: '',
    bank_name: '',
    emergency_contact_name: '',
    emergency_contact_phone: '',
    emergency_contact_relation: '',
    bio: '',
    specializations: [] as string[],
    languages: [] as string[]
  });

  useEffect(() => {
    if (user) {
      fetchProfile();
    }
  }, [user]);

  const fetchProfile = async () => {
    setLoading(true);
    try {
      // Fetch profile
      const { data: profile, error: profileError } = await supabase
        .from('profiles')
        .select('*')
        .eq('user_id', user?.id)
        .single();

      if (profileError) throw profileError;

      if (profile) {
        const profileData = profile as any;
        setProfileData({
          first_name: profileData.first_name || '',
          last_name: profileData.last_name || '',
          phone: profileData.phone || '',
          country: profileData.country || ''
        });

        if (profileData.date_of_birth) {
          setDateOfBirth(new Date(profileData.date_of_birth));
        }
      }

      // Fetch counselor data
      const { data: counselor, error: counselorError } = await supabase
        .from('counselors')
        .select('*')
        .eq('user_id', user?.id)
        .single();

      if (counselorError && counselorError.code !== 'PGRST116') throw counselorError;

      if (counselor) {
        const counselorData = counselor as any;
        setCounselorId(counselorData.id);
        setCounselorData({
          permanent_address: counselorData.permanent_address || '',
          correspondence_address: counselorData.correspondence_address || '',
          aadhar_number: counselorData.aadhar_number || '',
          pan_number: counselorData.pan_number || '',
          bank_account_number: counselorData.bank_account_number || '',
          bank_ifsc_code: counselorData.bank_ifsc_code || '',
          bank_name: counselorData.bank_name || '',
          emergency_contact_name: counselorData.emergency_contact_name || '',
          emergency_contact_phone: counselorData.emergency_contact_phone || '',
          emergency_contact_relation: counselorData.emergency_contact_relation || '',
          bio: counselorData.bio || '',
          specializations: counselorData.specializations || [],
          languages: counselorData.languages || []
        });

        if (counselorData.date_of_birth) {
          setDateOfBirth(new Date(counselorData.date_of_birth));
        }
        if (counselorData.joining_date) {
          setJoiningDate(new Date(counselorData.joining_date));
        }
      }
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message,
        variant: 'destructive'
      });
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);

    try {
      // Update profile
      const { error: profileError } = await supabase
        .from('profiles')
        .update({
          ...profileData,
          date_of_birth: dateOfBirth?.toISOString().split('T')[0]
        })
        .eq('user_id', user?.id);

      if (profileError) throw profileError;

      // Update or insert counselor data
      if (counselorId) {
        const { error: counselorError } = await supabase
          .from('counselors')
          .update({
            ...counselorData,
            date_of_birth: dateOfBirth?.toISOString().split('T')[0],
            joining_date: joiningDate?.toISOString().split('T')[0]
          })
          .eq('id', counselorId);

        if (counselorError) throw counselorError;
      } else {
        const { error: counselorError } = await supabase
          .from('counselors')
          .insert({
            user_id: user?.id,
            ...counselorData,
            date_of_birth: dateOfBirth?.toISOString().split('T')[0],
            joining_date: joiningDate?.toISOString().split('T')[0]
          });

        if (counselorError) throw counselorError;
      }

      toast({
        title: 'Success',
        description: 'Profile updated successfully!'
      });

      // Refresh data
      await fetchProfile();
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message,
        variant: 'destructive'
      });
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {/* Personal Information */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <User className="w-5 h-5" />
            Personal Information
          </CardTitle>
          <CardDescription>Basic details about yourself</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Label htmlFor="first_name">First Name *</Label>
              <Input
                id="first_name"
                value={profileData.first_name}
                onChange={(e) => setProfileData({ ...profileData, first_name: e.target.value })}
                required
              />
            </div>
            <div>
              <Label htmlFor="last_name">Last Name *</Label>
              <Input
                id="last_name"
                value={profileData.last_name}
                onChange={(e) => setProfileData({ ...profileData, last_name: e.target.value })}
                required
              />
            </div>
            <div>
              <Label htmlFor="phone">Phone Number *</Label>
              <Input
                id="phone"
                type="tel"
                value={profileData.phone}
                onChange={(e) => setProfileData({ ...profileData, phone: e.target.value })}
                required
              />
            </div>
            <div>
              <Label>Date of Birth *</Label>
              <DatePicker
                date={dateOfBirth}
                onDateChange={setDateOfBirth}
                placeholder="Pick your date of birth"
                maxDate={new Date()}
                fromYear={1950}
                toYear={new Date().getFullYear()}
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Address Details */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Briefcase className="w-5 h-5" />
            Address Details
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label htmlFor="permanent_address">Permanent Address *</Label>
            <Textarea
              id="permanent_address"
              value={counselorData.permanent_address}
              onChange={(e) => setCounselorData({ ...counselorData, permanent_address: e.target.value })}
              required
              rows={3}
            />
          </div>
          <div>
            <Label htmlFor="correspondence_address">Correspondence Address</Label>
            <Textarea
              id="correspondence_address"
              placeholder="Leave blank if same as permanent address"
              value={counselorData.correspondence_address}
              onChange={(e) => setCounselorData({ ...counselorData, correspondence_address: e.target.value })}
              rows={3}
            />
          </div>
        </CardContent>
      </Card>

      {/* Identity & Bank Details */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <CreditCard className="w-5 h-5" />
            Identity & Banking Information
          </CardTitle>
          <CardDescription>Required for payroll processing</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Label htmlFor="aadhar_number">Aadhar Number *</Label>
              <Input
                id="aadhar_number"
                placeholder="XXXX-XXXX-XXXX"
                value={counselorData.aadhar_number}
                onChange={(e) => setCounselorData({ ...counselorData, aadhar_number: e.target.value })}
                required
              />
            </div>
            <div>
              <Label htmlFor="pan_number">PAN Number *</Label>
              <Input
                id="pan_number"
                placeholder="XXXXX0000X"
                value={counselorData.pan_number}
                onChange={(e) => setCounselorData({ ...counselorData, pan_number: e.target.value })}
                required
              />
            </div>
            <div>
              <Label htmlFor="bank_account_number">Bank Account Number *</Label>
              <Input
                id="bank_account_number"
                value={counselorData.bank_account_number}
                onChange={(e) => setCounselorData({ ...counselorData, bank_account_number: e.target.value })}
                required
              />
            </div>
            <div>
              <Label htmlFor="bank_ifsc_code">Bank IFSC Code *</Label>
              <Input
                id="bank_ifsc_code"
                placeholder="XXXX0000000"
                value={counselorData.bank_ifsc_code}
                onChange={(e) => setCounselorData({ ...counselorData, bank_ifsc_code: e.target.value })}
                required
              />
            </div>
            <div className="md:col-span-2">
              <Label htmlFor="bank_name">Bank Name *</Label>
              <Input
                id="bank_name"
                value={counselorData.bank_name}
                onChange={(e) => setCounselorData({ ...counselorData, bank_name: e.target.value })}
                required
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Emergency Contact */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <PhoneIcon className="w-5 h-5" />
            Emergency Contact
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <Label htmlFor="emergency_contact_name">Contact Name *</Label>
              <Input
                id="emergency_contact_name"
                value={counselorData.emergency_contact_name}
                onChange={(e) => setCounselorData({ ...counselorData, emergency_contact_name: e.target.value })}
                required
              />
            </div>
            <div>
              <Label htmlFor="emergency_contact_phone">Contact Phone *</Label>
              <Input
                id="emergency_contact_phone"
                type="tel"
                value={counselorData.emergency_contact_phone}
                onChange={(e) => setCounselorData({ ...counselorData, emergency_contact_phone: e.target.value })}
                required
              />
            </div>
            <div>
              <Label htmlFor="emergency_contact_relation">Relationship *</Label>
              <Input
                id="emergency_contact_relation"
                placeholder="e.g., Spouse, Parent"
                value={counselorData.emergency_contact_relation}
                onChange={(e) => setCounselorData({ ...counselorData, emergency_contact_relation: e.target.value })}
                required
              />
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="flex justify-end gap-4">
        <Button type="submit" disabled={saving} size="lg">
          <Save className="w-4 h-4 mr-2" />
          {saving ? 'Saving...' : 'Save Profile'}
        </Button>
      </div>
    </form>
  );
}