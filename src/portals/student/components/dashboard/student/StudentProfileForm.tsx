import { useState, useEffect } from 'react';
import { useAuth } from '@student/hooks/useAuth';
import { supabase } from '@student/integrations/supabase/client';
import { useToast } from '@student/hooks/use-toast';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@student/components/ui/card';
import { Button } from '@student/components/ui/button';
import { Input } from '@student/components/ui/input';
import { Label } from '@student/components/ui/label';
import { Textarea } from '@student/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@student/components/ui/select';
import { Badge } from '@student/components/ui/badge';
import { DatePicker } from '@student/components/ui/date-picker';
import { Plus, X, Save, User, GraduationCap, FileText, Globe } from 'lucide-react';

const TEST_TYPES = ['IELTS', 'TOEFL', 'GRE', 'SAT', 'GMAT', 'PTE', 'Duolingo'];
const DEGREE_LEVELS = ['Bachelors', 'Masters', 'PhD', 'Diploma', 'Certificate', 'Other'];

const RESIDENCE_COUNTRIES = [
  'India', 'Nepal', 'Bangladesh', 'Sri Lanka', 'Pakistan', 'UAE', 'Qatar',
  'Saudi Arabia', 'USA', 'UK', 'Canada', 'Australia', 'Other'
];

const STUDY_COUNTRIES = [
  'Nepal', 'India', 'USA', 'UK', 'Canada', 'Australia', 'Germany', 'France',
  'Ireland', 'New Zealand', 'Netherlands', 'Switzerland', 'Singapore',
  'Italy', 'Spain', 'UAE', 'Japan', 'South Korea', 'Sweden'
];

interface TestScore {
  type: string;
  score: string;
  date: string;
}

export function StudentProfileForm() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [dateOfBirth, setDateOfBirth] = useState<Date>();
  const [testScores, setTestScores] = useState<TestScore[]>([]);
  const [selectedCountries, setSelectedCountries] = useState<string[]>([]);
  const [customCountry, setCustomCountry] = useState('');
  const [newTest, setNewTest] = useState({ type: '', score: '', date: '' });

  const [formData, setFormData] = useState({
    first_name: '',
    last_name: '',
    phone: '',
    country: '',
    passport_number: '',
    tenth_grade_score: '',
    twelfth_grade_score: '',
    bachelors_degree: '',
    bachelors_score: '',
    bachelors_institution: '',
    masters_degree: '',
    masters_score: '',
    masters_institution: '',
    backlogs_history: '',
    course_preferences: '',
    degree_level: '',
    student_notes: ''
  });

  useEffect(() => {
    if (user) {
      fetchProfile();
    }
  }, [user]);

  const fetchProfile = async () => {
    setLoading(true);
    try {
      const [{ data: profile }, { data: lead }] = await Promise.all([
        supabase.from('profiles').select('*').eq('user_id', user?.id).maybeSingle(),
        supabase.from('student_leads').select('*').eq('user_id', user?.id).maybeSingle(),
      ]);

      const extras = ((lead?.preferences as Record<string, any> | null) || {});
      const profileExtras = profile as Record<string, any> | null;

      setFormData({
        first_name: profile?.first_name || lead?.first_name || '',
        last_name: profile?.last_name || lead?.last_name || '',
        phone: profile?.phone || lead?.phone || '',
        country: profile?.country || '',
        passport_number: profile?.passport_number || '',
        tenth_grade_score: extras.tenth_grade_score || profileExtras?.tenth_grade_score || '',
        twelfth_grade_score: extras.twelfth_grade_score || profileExtras?.twelfth_grade_score || '',
        bachelors_degree: extras.bachelors_degree || profileExtras?.bachelors_degree || '',
        bachelors_score: extras.bachelors_score || profileExtras?.bachelors_score || '',
        bachelors_institution: extras.bachelors_institution || profileExtras?.bachelors_institution || '',
        masters_degree: extras.masters_degree || profileExtras?.masters_degree || '',
        masters_score: extras.masters_score || profileExtras?.masters_score || '',
        masters_institution: extras.masters_institution || profileExtras?.masters_institution || '',
        backlogs_history: extras.backlogs_history || profileExtras?.backlogs_history || '',
        course_preferences: extras.course_preferences || lead?.field_of_interest || profileExtras?.course_preferences || '',
        degree_level: extras.degree_level || lead?.qualification_level || profileExtras?.degree_level || '',
        student_notes: extras.student_notes || lead?.notes || profileExtras?.student_notes || '',
      });

      if (profile?.date_of_birth) {
        setDateOfBirth(new Date(profile.date_of_birth));
      }
      if (extras.test_scores || lead?.test_scores) {
        setTestScores((extras.test_scores || lead?.test_scores || []) as TestScore[]);
      }
      if (extras.interested_countries || lead?.preferred_countries) {
        setSelectedCountries(extras.interested_countries || lead?.preferred_countries || []);
      }
    } catch (error: any) {
      console.error('Error loading profile:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;

    if (selectedCountries.length === 0) {
      toast({
        title: 'Select a study destination',
        description: 'Choose at least one country you want to study in.',
        variant: 'destructive',
      });
      return;
    }

    if (!formData.degree_level) {
      toast({
        title: 'Select degree level',
        description: 'Choose the degree you want to study next.',
        variant: 'destructive',
      });
      return;
    }

    setSaving(true);

    const saveOnce = async () => {
      const { data: existingProfile } = await supabase
        .from('profiles')
        .select('id')
        .eq('user_id', user.id)
        .maybeSingle();

      const profilePayload = {
        id: existingProfile?.id || crypto.randomUUID(),
        user_id: user.id,
        first_name: formData.first_name,
        last_name: formData.last_name,
        phone: formData.phone || null,
        country: formData.country || null,
        passport_number: formData.passport_number || null,
        date_of_birth: dateOfBirth?.toISOString().split('T')[0] || null,
        tenth_grade_score: formData.tenth_grade_score || null,
        twelfth_grade_score: formData.twelfth_grade_score || null,
        bachelors_degree: formData.bachelors_degree || null,
        bachelors_score: formData.bachelors_score || null,
        bachelors_institution: formData.bachelors_institution || null,
        masters_degree: formData.masters_degree || null,
        masters_score: formData.masters_score || null,
        masters_institution: formData.masters_institution || null,
        backlogs_history: formData.backlogs_history || null,
        course_preferences: formData.course_preferences || null,
        degree_level: formData.degree_level || null,
        student_notes: formData.student_notes || null,
        interested_countries: selectedCountries,
        test_scores: testScores,
        updated_at: new Date().toISOString(),
      };

      const { error: profileError } = await supabase
        .from('profiles')
        .upsert(profilePayload, { onConflict: 'id' });
      if (profileError) throw new Error(profileError.message);

      const academicPreferences = {
        tenth_grade_score: formData.tenth_grade_score,
        twelfth_grade_score: formData.twelfth_grade_score,
        bachelors_degree: formData.bachelors_degree,
        bachelors_score: formData.bachelors_score,
        bachelors_institution: formData.bachelors_institution,
        masters_degree: formData.masters_degree,
        masters_score: formData.masters_score,
        masters_institution: formData.masters_institution,
        backlogs_history: formData.backlogs_history,
        course_preferences: formData.course_preferences,
        degree_level: formData.degree_level,
        student_notes: formData.student_notes,
        test_scores: testScores,
        interested_countries: selectedCountries,
        profile_completed: true,
      };

      const { data: existingLead } = await supabase
        .from('student_leads')
        .select('id')
        .eq('user_id', user.id)
        .maybeSingle();

      const leadPayload = {
        id: existingLead?.id || crypto.randomUUID(),
        user_id: user.id,
        email: user.email,
        first_name: formData.first_name,
        last_name: formData.last_name,
        phone: formData.phone || null,
        preferred_countries: selectedCountries,
        qualification_level: formData.degree_level || null,
        field_of_interest: formData.course_preferences || null,
        stream_or_program: formData.course_preferences || null,
        academic_score: formData.bachelors_score || formData.twelfth_grade_score || null,
        test_scores: testScores,
        notes: formData.student_notes || null,
        preferences: academicPreferences,
        lead_source: 'student_profile',
        updated_at: new Date().toISOString(),
      };

      const { error: leadError } = await supabase
        .from('student_leads')
        .upsert(leadPayload, { onConflict: 'id' });
      if (leadError) throw new Error(leadError.message);
    };

    try {
      try {
        await saveOnce();
      } catch (firstError: any) {
        await new Promise((resolve) => window.setTimeout(resolve, 600));
        await saveOnce();
      }

      toast({
        title: 'Profile saved',
        description: 'Your details were updated successfully.'
      });
    } catch (error: any) {
      const message = String(error?.message || '');
      toast({
        title: 'Could not save profile',
        description: message.toLowerCase().includes('failed to fetch')
          ? 'The page lost its database connection. Refresh once, then click Save Profile again.'
          : (message || 'Please refresh and try again.'),
        variant: 'destructive'
      });
    } finally {
      setSaving(false);
    }
  };

  const addTestScore = () => {
    if (newTest.type && newTest.score) {
      setTestScores([...testScores, newTest]);
      setNewTest({ type: '', score: '', date: '' });
    }
  };

  const removeTestScore = (index: number) => {
    setTestScores(testScores.filter((_, i) => i !== index));
  };

  const addCustomCountry = () => {
    const country = customCountry.trim();
    if (!country) return;
    const label = country.replace(/\b\w/g, (char) => char.toUpperCase());
    if (!selectedCountries.includes(label)) {
      setSelectedCountries((prev) => [...prev, label]);
    }
    setCustomCountry('');
  };

  const toggleCountry = (country: string) => {
    setSelectedCountries(prev =>
      prev.includes(country)
        ? prev.filter(c => c !== country)
        : [...prev, country]
    );
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
          <CardDescription>Where you live now — not the country you want to study in</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Label htmlFor="first_name">First Name *</Label>
              <Input
                id="first_name"
                value={formData.first_name}
                onChange={(e) => setFormData({ ...formData, first_name: e.target.value })}
                required
              />
            </div>
            <div>
              <Label htmlFor="last_name">Last Name *</Label>
              <Input
                id="last_name"
                value={formData.last_name}
                onChange={(e) => setFormData({ ...formData, last_name: e.target.value })}
                required
              />
            </div>
            <div>
              <Label htmlFor="phone">Phone Number *</Label>
              <Input
                id="phone"
                type="tel"
                value={formData.phone}
                onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
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
            <div>
              <Label htmlFor="country">Country of Residence</Label>
              <Select
                value={formData.country || undefined}
                onValueChange={(value) => setFormData({ ...formData, country: value })}
              >
                <SelectTrigger id="country">
                  <SelectValue placeholder="Where you live now (e.g. India)" />
                </SelectTrigger>
                <SelectContent>
                  {[...new Set([formData.country, ...RESIDENCE_COUNTRIES].filter(Boolean))].map((country) => (
                    <SelectItem key={country} value={country}>{country}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground mt-1">Example: India if you live in India</p>
            </div>
            <div>
              <Label htmlFor="passport_number">Passport Number</Label>
              <Input
                id="passport_number"
                placeholder="Optional until you have a passport"
                value={formData.passport_number}
                onChange={(e) => setFormData({ ...formData, passport_number: e.target.value })}
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Academic Information */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <GraduationCap className="w-5 h-5" />
            Academic Background
          </CardTitle>
          <CardDescription>Marks and degrees you have already completed</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Label htmlFor="tenth_grade">10th Grade Score *</Label>
              <Input
                id="tenth_grade"
                placeholder="e.g., 85% or 9.0 CGPA"
                value={formData.tenth_grade_score}
                onChange={(e) => setFormData({ ...formData, tenth_grade_score: e.target.value })}
                required
              />
            </div>
            <div>
              <Label htmlFor="twelfth_grade">12th Grade Score *</Label>
              <Input
                id="twelfth_grade"
                placeholder="e.g., 90% or 9.5 CGPA"
                value={formData.twelfth_grade_score}
                onChange={(e) => setFormData({ ...formData, twelfth_grade_score: e.target.value })}
                required
              />
            </div>
            <div className="md:col-span-2">
              <Label htmlFor="bachelors_degree">Bachelor's Degree Name</Label>
              <Input
                id="bachelors_degree"
                placeholder="e.g., B.Tech Computer Science — not your CGPA"
                value={formData.bachelors_degree}
                onChange={(e) => setFormData({ ...formData, bachelors_degree: e.target.value })}
              />
              <p className="text-xs text-muted-foreground mt-1">Leave blank if you have only completed 12th</p>
            </div>
            <div>
              <Label htmlFor="bachelors_score">Bachelor's Score / CGPA</Label>
              <Input
                id="bachelors_score"
                placeholder="e.g., 7.6 CGPA or 76%"
                value={formData.bachelors_score}
                onChange={(e) => setFormData({ ...formData, bachelors_score: e.target.value })}
              />
            </div>
            <div>
              <Label htmlFor="bachelors_institution">Bachelor's Institution</Label>
              <Input
                id="bachelors_institution"
                placeholder="University name"
                value={formData.bachelors_institution}
                onChange={(e) => setFormData({ ...formData, bachelors_institution: e.target.value })}
              />
            </div>
            <div>
              <Label htmlFor="masters_degree">Master's Degree (if any)</Label>
              <Input
                id="masters_degree"
                placeholder="e.g., M.Tech in AI"
                value={formData.masters_degree}
                onChange={(e) => setFormData({ ...formData, masters_degree: e.target.value })}
              />
            </div>
            <div>
              <Label htmlFor="masters_score">Master's Score</Label>
              <Input
                id="masters_score"
                placeholder="e.g., 9.0 CGPA"
                value={formData.masters_score}
                onChange={(e) => setFormData({ ...formData, masters_score: e.target.value })}
              />
            </div>
            <div className="md:col-span-2">
              <Label htmlFor="masters_institution">Master's Institution</Label>
              <Input
                id="masters_institution"
                placeholder="University name"
                value={formData.masters_institution}
                onChange={(e) => setFormData({ ...formData, masters_institution: e.target.value })}
              />
            </div>
            <div className="md:col-span-2">
              <Label htmlFor="backlogs">Backlogs History</Label>
              <Textarea
                id="backlogs"
                placeholder="Write None if you have no backlogs"
                value={formData.backlogs_history}
                onChange={(e) => setFormData({ ...formData, backlogs_history: e.target.value })}
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Test Scores */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileText className="w-5 h-5" />
            Test Scores
          </CardTitle>
          <CardDescription>IELTS, TOEFL, GRE, and other exams — skip if you have not taken a test yet</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap gap-2 mb-4">
            {testScores.map((test, index) => (
              <Badge key={index} variant="secondary" className="px-3 py-1">
                {test.type}: {test.score}
                {test.date && ` (${test.date})`}
                <button
                  type="button"
                  onClick={() => removeTestScore(index)}
                  className="ml-2 text-destructive hover:text-destructive/80"
                >
                  <X className="w-3 h-3" />
                </button>
              </Badge>
            ))}
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-4 gap-2">
            <Select value={newTest.type} onValueChange={(value) => setNewTest({ ...newTest, type: value })}>
              <SelectTrigger>
                <SelectValue placeholder="Test Type" />
              </SelectTrigger>
              <SelectContent>
                {TEST_TYPES.map((type) => (
                  <SelectItem key={type} value={type}>{type}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Input
              placeholder="Score"
              value={newTest.score}
              onChange={(e) => setNewTest({ ...newTest, score: e.target.value })}
            />
            <Input
              type="date"
              value={newTest.date}
              onChange={(e) => setNewTest({ ...newTest, date: e.target.value })}
            />
            <Button type="button" onClick={addTestScore} variant="outline">
              <Plus className="w-4 h-4 mr-2" />
              Add
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Study Preferences */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Globe className="w-5 h-5" />
            Study Preferences
          </CardTitle>
          <CardDescription>Where you want to study next — this drives university recommendations</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label>Countries you want to study in *</Label>
            <p className="text-xs text-muted-foreground mb-2">Tap to select. Blue means selected. Nepal is available here.</p>
            <div className="flex flex-wrap gap-2 mt-2">
              {STUDY_COUNTRIES.map((country) => (
                <Badge
                  key={country}
                  variant={selectedCountries.includes(country) ? "default" : "outline"}
                  className="cursor-pointer"
                  onClick={() => toggleCountry(country)}
                >
                  {country}
                </Badge>
              ))}
              {selectedCountries
                .filter((country) => !STUDY_COUNTRIES.includes(country))
                .map((country) => (
                  <Badge
                    key={country}
                    variant="default"
                    className="cursor-pointer"
                    onClick={() => toggleCountry(country)}
                  >
                    {country}
                    <X className="w-3 h-3 ml-1" />
                  </Badge>
                ))}
            </div>
            <div className="flex gap-2 mt-3">
              <Input
                placeholder="Other country (e.g. Finland)"
                value={customCountry}
                onChange={(e) => setCustomCountry(e.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') {
                    event.preventDefault();
                    addCustomCountry();
                  }
                }}
              />
              <Button type="button" variant="outline" onClick={addCustomCountry}>
                <Plus className="w-4 h-4 mr-1" />
                Add
              </Button>
            </div>
          </div>

          <div>
            <Label htmlFor="degree_level">Degree you want to study next *</Label>
            <Select value={formData.degree_level} onValueChange={(value) => setFormData({ ...formData, degree_level: value })}>
              <SelectTrigger>
                <SelectValue placeholder="e.g. Masters — not the degree you already have" />
              </SelectTrigger>
              <SelectContent>
                {DEGREE_LEVELS.map((level) => (
                  <SelectItem key={level} value={level}>{level}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label htmlFor="course_preferences">Course/Field Preferences</Label>
            <Textarea
              id="course_preferences"
              placeholder="e.g., Computer Science, Data Science, AI/ML"
              value={formData.course_preferences}
              onChange={(e) => setFormData({ ...formData, course_preferences: e.target.value })}
              rows={3}
            />
          </div>

          <div>
            <Label htmlFor="student_notes">Notes for Counselor</Label>
            <Textarea
              id="student_notes"
              placeholder="Any specific preferences, concerns, or questions you want to share with your counselor"
              value={formData.student_notes}
              onChange={(e) => setFormData({ ...formData, student_notes: e.target.value })}
              rows={4}
            />
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