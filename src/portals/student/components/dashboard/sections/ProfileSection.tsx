import { useState, useEffect } from 'react';
import { useAuth } from '@student/hooks/useAuth';
import { supabase } from '@student/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@student/components/ui/card';
import { Button } from '@student/components/ui/button';
import { Input } from '@student/components/ui/input';
import { Label } from '@student/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@student/components/ui/select';
import { useToast } from '@student/hooks/use-toast';
import { Badge } from '@student/components/ui/badge';
import { User, MapPin, Phone, DollarSign, GraduationCap, Save } from 'lucide-react';
import { DocumentManagementOverview } from './DocumentManagementOverview';

interface UserPreferences {
  preferred_countries: string[];
  budget_min: number | null;
  budget_max: number | null;
  field_of_interest: string;
  qualification_level: string;
}

export function ProfileSection() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [preferences, setPreferences] = useState<UserPreferences>({
    preferred_countries: [],
    budget_min: null,
    budget_max: null,
    field_of_interest: '',
    qualification_level: '',
  });
  
  const [profileData, setProfileData] = useState({
    first_name: '',
    last_name: '',
    country: '',
    phone: '',
  });

  useEffect(() => {
    if (user) {
      fetchUserPreferences();
    }
  }, [user]);

  const fetchUserPreferences = async () => {
    try {
      const { data, error } = await supabase
        .from('student_leads')
        .select('preferred_countries, budget_min_usd, budget_max_usd, field_of_interest, qualification_level')
        .eq('user_id', user?.id)
        .maybeSingle();

      if (error && error.code !== 'PGRST116') {
        console.error('Error fetching preferences:', error);
        return;
      }

      if (data) {
        setPreferences({
          preferred_countries: data.preferred_countries || [],
          budget_min: data.budget_min_usd,
          budget_max: data.budget_max_usd,
          field_of_interest: data.field_of_interest || '',
          qualification_level: data.qualification_level || '',
        });
      }
    } catch (error) {
      console.error('Error:', error);
    }
  };

  const handleProfileUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;

    setLoading(true);
    try {
      const { error } = await supabase
        .from('profiles')
        .upsert({
          user_id: user.id,
          ...profileData,
        });

      if (error) throw error;

      toast({
        title: "Profile updated",
        description: "Your profile information has been updated successfully.",
      });
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const handlePreferencesUpdate = async () => {
    if (!user) return;

    setLoading(true);
    try {
      const { error } = await supabase
        .from('student_leads')
        .upsert({
          user_id: user.id,
          email: user.email || '',
          preferred_countries: preferences.preferred_countries,
          budget_min_usd: preferences.budget_min,
          budget_max_usd: preferences.budget_max,
          field_of_interest: preferences.field_of_interest,
          qualification_level: preferences.qualification_level,
        });

      if (error) throw error;

      toast({
        title: "Preferences updated",
        description: "Your study preferences have been updated successfully.",
      });
    } catch (error: any) {
      toast({
        title: "Error", 
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const addCountry = (country: string) => {
    if (!preferences.preferred_countries.includes(country)) {
      setPreferences(prev => ({
        ...prev,
        preferred_countries: [...prev.preferred_countries, country]
      }));
    }
  };

  const removeCountry = (country: string) => {
    setPreferences(prev => ({
      ...prev,
      preferred_countries: prev.preferred_countries.filter(c => c !== country)
    }));
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <div className="w-12 h-12 rounded-full bg-gradient-primary flex items-center justify-center">
          <User className="w-6 h-6 text-white" />
        </div>
        <div>
          <h1 className="text-3xl font-bold">Profile Settings</h1>
          <p className="text-muted-foreground">Manage your personal information and study preferences</p>
        </div>
      </div>

      {/* Document Management Overview */}
      <DocumentManagementOverview />

      <div className="grid gap-6 md:grid-cols-2">
        {/* Personal Information */}
        <Card className="glass-card">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <User className="w-5 h-5" />
              Personal Information
            </CardTitle>
            <CardDescription>Update your basic profile information</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleProfileUpdate} className="space-y-4">
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="first_name">First Name</Label>
                  <Input
                    id="first_name"
                    value={profileData.first_name}
                    onChange={(e) => setProfileData(prev => ({...prev, first_name: e.target.value}))}
                    placeholder="Your first name"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="last_name">Last Name</Label>
                  <Input
                    id="last_name"
                    value={profileData.last_name}
                    onChange={(e) => setProfileData(prev => ({...prev, last_name: e.target.value}))}
                    placeholder="Your last name"
                  />
                </div>
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="country">Country</Label>
                <div className="relative">
                  <MapPin className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                  <Input
                    id="country"
                    value={profileData.country}
                    onChange={(e) => setProfileData(prev => ({...prev, country: e.target.value}))}
                    placeholder="Your home country"
                    className="pl-10"
                  />
                </div>
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="phone">Phone Number</Label>
                <div className="relative">
                  <Phone className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                  <Input
                    id="phone"
                    value={profileData.phone}
                    onChange={(e) => setProfileData(prev => ({...prev, phone: e.target.value}))}
                    placeholder="Your phone number"
                    className="pl-10"
                  />
                </div>
              </div>

              <Button type="submit" disabled={loading} className="w-full">
                <Save className="w-4 h-4 mr-2" />
                {loading ? 'Saving...' : 'Save Profile'}
              </Button>
            </form>
          </CardContent>
        </Card>

        {/* Study Preferences */}
        <Card className="glass-card">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <GraduationCap className="w-5 h-5" />
              Study Preferences
            </CardTitle>
            <CardDescription>Set your study abroad preferences</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Preferred Countries */}
            <div className="space-y-2">
              <Label>Preferred Countries</Label>
              <Select onValueChange={addCountry}>
                <SelectTrigger>
                  <SelectValue placeholder="Add a country" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="USA">United States</SelectItem>
                  <SelectItem value="Canada">Canada</SelectItem>
                  <SelectItem value="UK">United Kingdom</SelectItem>
                  <SelectItem value="Australia">Australia</SelectItem>
                  <SelectItem value="Germany">Germany</SelectItem>
                  <SelectItem value="Netherlands">Netherlands</SelectItem>
                </SelectContent>
              </Select>
              
              <div className="flex flex-wrap gap-2 mt-2">
                {preferences.preferred_countries.map((country) => (
                  <span 
                    key={country}
                    className="inline-flex items-center gap-1 px-3 py-1 bg-primary/10 text-primary rounded-full text-sm cursor-pointer hover:bg-primary/20"
                    onClick={() => removeCountry(country)}
                  >
                    {country}
                    <span className="text-xs">×</span>
                  </span>
                ))}
              </div>
            </div>

            {/* Budget Range */}
            <div className="space-y-2">
              <Label>Budget Range (USD)</Label>
              <div className="grid gap-2 md:grid-cols-2">
                <div className="relative">
                  <DollarSign className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                  <Input
                    type="number"
                    placeholder="Min budget"
                    value={preferences.budget_min || ''}
                    onChange={(e) => setPreferences(prev => ({
                      ...prev, 
                      budget_min: e.target.value ? Number(e.target.value) : null
                    }))}
                    className="pl-10"
                  />
                </div>
                <div className="relative">
                  <DollarSign className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                  <Input
                    type="number"
                    placeholder="Max budget"
                    value={preferences.budget_max || ''}
                    onChange={(e) => setPreferences(prev => ({
                      ...prev,
                      budget_max: e.target.value ? Number(e.target.value) : null
                    }))}
                    className="pl-10"
                  />
                </div>
              </div>
            </div>

            {/* Field of Interest */}
            <div className="space-y-2">
              <Label htmlFor="field">Field of Interest</Label>
              <Select value={preferences.field_of_interest} onValueChange={(value) => 
                setPreferences(prev => ({...prev, field_of_interest: value}))
              }>
                <SelectTrigger>
                  <SelectValue placeholder="Select field of study" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Computer Science">Computer Science</SelectItem>
                  <SelectItem value="Business">Business</SelectItem>
                  <SelectItem value="Engineering">Engineering</SelectItem>
                  <SelectItem value="Medicine">Medicine</SelectItem>
                  <SelectItem value="Arts">Arts</SelectItem>
                  <SelectItem value="Sciences">Sciences</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Qualification Level */}
            <div className="space-y-2">
              <Label htmlFor="qualification">Qualification Level</Label>
              <Select value={preferences.qualification_level} onValueChange={(value) => 
                setPreferences(prev => ({...prev, qualification_level: value}))
              }>
                <SelectTrigger>
                  <SelectValue placeholder="Select qualification" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Bachelors">Bachelor's Degree</SelectItem>
                  <SelectItem value="Masters">Master's Degree</SelectItem>
                  <SelectItem value="PhD">PhD</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <Button onClick={handlePreferencesUpdate} disabled={loading} className="w-full">
              <Save className="w-4 h-4 mr-2" />
              {loading ? 'Saving...' : 'Save Preferences'}
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}