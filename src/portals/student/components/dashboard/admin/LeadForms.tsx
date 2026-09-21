import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@student/components/ui/card';
import { Button } from '@student/components/ui/button';
import { Input } from '@student/components/ui/input';
import { Label } from '@student/components/ui/label';
import { Textarea } from '@student/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@student/components/ui/select';
import { useToast } from '@student/components/ui/use-toast';
import { supabase } from '@student/integrations/supabase/client';
import { 
  UserPlus, 
  Save, 
  RefreshCw, 
  Phone, 
  Mail, 
  GraduationCap,
  Globe,
  Award,
  MapPin
} from 'lucide-react';
import { Badge } from '@student/components/ui/badge';

interface LeadFormData {
  first_name: string;
  last_name: string;
  email: string;
  phone: string;
  field_of_interest: string;
  academic_score: string;
  preferred_countries: string[];
  lead_stage: string;
  priority_level: string;
  lead_source: string;
  notes: string;
  address: string;
  qualification_level: string;
  stream_or_program: string;
  gre_score: string;
  gmat_score: string;
  ielts_score: string;
  toefl_score: string;
}

const initialFormData: LeadFormData = {
  first_name: '',
  last_name: '',
  email: '',
  phone: '',
  field_of_interest: '',
  academic_score: '',
  preferred_countries: [],
  lead_stage: 'hot',
  priority_level: 'medium',
  lead_source: 'manual',
  notes: '',
  address: '',
  qualification_level: '',
  stream_or_program: '',
  gre_score: '',
  gmat_score: '',
  ielts_score: '',
  toefl_score: ''
};

const countries = ['USA', 'Canada', 'UK', 'Australia', 'Germany', 'France', 'Netherlands', 'Switzerland', 'Sweden', 'Ireland'];
const fieldsOfInterest = [
  'Computer Science', 'Business Administration', 'Engineering', 'Medicine', 'Law',
  'Data Science', 'Artificial Intelligence', 'Finance', 'Marketing', 'Psychology',
  'Biotechnology', 'Environmental Science', 'Architecture', 'Design', 'Education'
];

export function LeadForms() {
  const [formData, setFormData] = useState<LeadFormData>(initialFormData);
  const [submitting, setSubmitting] = useState(false);
  const [counselors, setCounselors] = useState<any[]>([]);
  const { toast } = useToast();

  const fetchCounselors = async () => {
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select(`
          user_id,
          first_name,
          last_name,
          user_roles!inner(role)
        `)
        .eq('user_roles.role', 'counselor');

      if (error) throw error;
      
      const counselorData = data?.map(item => ({
        id: item.user_id,
        name: `${item.first_name} ${item.last_name}`
      })) || [];
      
      setCounselors(counselorData);
    } catch (error: any) {
      console.error('Error fetching counselors:', error);
    }
  };

  useEffect(() => {
    fetchCounselors();
  }, []);

  const handleInputChange = (field: keyof LeadFormData, value: string | string[]) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const addCountry = (country: string) => {
    if (!formData.preferred_countries.includes(country)) {
      setFormData(prev => ({
        ...prev,
        preferred_countries: [...prev.preferred_countries, country]
      }));
    }
  };

  const removeCountry = (country: string) => {
    setFormData(prev => ({
      ...prev,
      preferred_countries: prev.preferred_countries.filter(c => c !== country)
    }));
  };

  const resetForm = () => {
    setFormData(initialFormData);
  };

  const validateForm = (): string[] => {
    const errors: string[] = [];
    
    if (!formData.first_name.trim()) errors.push('First name is required');
    if (!formData.last_name.trim()) errors.push('Last name is required');
    if (!formData.email.trim()) errors.push('Email is required');
    if (formData.email && !/\S+@\S+\.\S+/.test(formData.email)) errors.push('Invalid email format');
    if (formData.phone && !/^\+?[\d\s\-\(\)]+$/.test(formData.phone)) errors.push('Invalid phone format');
    
    return errors;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    const errors = validateForm();
    if (errors.length > 0) {
      toast({
        title: 'Validation Error',
        description: errors.join(', '),
        variant: 'destructive',
      });
      return;
    }
    
    setSubmitting(true);
    
    try {
      const { data: user } = await supabase.auth.getUser();
      if (!user.user) throw new Error('User not authenticated');
      
      const testScores: any = {};
      if (formData.gre_score) testScores.gre_score = parseInt(formData.gre_score);
      if (formData.gmat_score) testScores.gmat_score = parseInt(formData.gmat_score);
      if (formData.ielts_score) testScores.ielts_score = parseFloat(formData.ielts_score);
      if (formData.toefl_score) testScores.toefl_score = parseInt(formData.toefl_score);
      
      const leadData = {
        user_id: user.user.id,
        first_name: formData.first_name,
        last_name: formData.last_name,
        email: formData.email,
        phone: formData.phone || null,
        field_of_interest: formData.field_of_interest || null,
        academic_score: formData.academic_score || null,
        preferred_countries: formData.preferred_countries.length > 0 ? formData.preferred_countries : null,
        lead_stage: formData.lead_stage,
        priority_level: formData.priority_level,
        lead_source: formData.lead_source,
        notes: formData.notes || null,
        address: formData.address || null,
        qualification_level: formData.qualification_level || null,
        stream_or_program: formData.stream_or_program || null,
        last_activity_at: new Date().toISOString(),
        ...testScores
      };
      
      const { error } = await supabase
        .from('student_leads')
        .insert(leadData);
        
      if (error) throw error;
      
      toast({
        title: 'Success',
        description: 'Lead created successfully',
      });
      
      resetForm();
      
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message,
        variant: 'destructive',
      });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <UserPlus className="h-5 w-5" />
          Add New Lead
        </CardTitle>
        <CardDescription>
          Create a new lead entry with complete information
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Personal Information */}
          <div className="space-y-4">
            <h3 className="text-lg font-medium flex items-center gap-2">
              <UserPlus className="h-4 w-4" />
              Personal Information
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="first_name">First Name *</Label>
                <Input
                  id="first_name"
                  value={formData.first_name}
                  onChange={(e) => handleInputChange('first_name', e.target.value)}
                  placeholder="Enter first name"
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="last_name">Last Name *</Label>
                <Input
                  id="last_name"
                  value={formData.last_name}
                  onChange={(e) => handleInputChange('last_name', e.target.value)}
                  placeholder="Enter last name"
                  required
                />
              </div>
            </div>
          </div>

          {/* Contact Information */}
          <div className="space-y-4">
            <h3 className="text-lg font-medium flex items-center gap-2">
              <Phone className="h-4 w-4" />
              Contact Information
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="email">Email *</Label>
                <Input
                  id="email"
                  type="email"
                  value={formData.email}
                  onChange={(e) => handleInputChange('email', e.target.value)}
                  placeholder="Enter email address"
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="phone">Phone</Label>
                <Input
                  id="phone"
                  value={formData.phone}
                  onChange={(e) => handleInputChange('phone', e.target.value)}
                  placeholder="+1 234 567 8900"
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="address">Address</Label>
              <Input
                id="address"
                value={formData.address}
                onChange={(e) => handleInputChange('address', e.target.value)}
                placeholder="Enter full address"
              />
            </div>
          </div>

          {/* Academic Information */}
          <div className="space-y-4">
            <h3 className="text-lg font-medium flex items-center gap-2">
              <GraduationCap className="h-4 w-4" />
              Academic Information
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="qualification_level">Qualification Level</Label>
                <Select value={formData.qualification_level} onValueChange={(value) => handleInputChange('qualification_level', value)}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select qualification level" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="high_school">High School</SelectItem>
                    <SelectItem value="bachelors">Bachelor's Degree</SelectItem>
                    <SelectItem value="masters">Master's Degree</SelectItem>
                    <SelectItem value="phd">PhD</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="field_of_interest">Field of Interest</Label>
                <Select value={formData.field_of_interest} onValueChange={(value) => handleInputChange('field_of_interest', value)}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select field of interest" />
                  </SelectTrigger>
                  <SelectContent>
                    {fieldsOfInterest.map(field => (
                      <SelectItem key={field} value={field}>{field}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="stream_or_program">Stream/Program</Label>
                <Input
                  id="stream_or_program"
                  value={formData.stream_or_program}
                  onChange={(e) => handleInputChange('stream_or_program', e.target.value)}
                  placeholder="e.g., Computer Engineering"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="academic_score">Academic Score</Label>
                <Input
                  id="academic_score"
                  value={formData.academic_score}
                  onChange={(e) => handleInputChange('academic_score', e.target.value)}
                  placeholder="e.g., 85% or 3.8 GPA"
                />
              </div>
            </div>
          </div>

          {/* Test Scores */}
          <div className="space-y-4">
            <h3 className="text-lg font-medium flex items-center gap-2">
              <Award className="h-4 w-4" />
              Test Scores
            </h3>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="space-y-2">
                <Label htmlFor="gre_score">GRE Score</Label>
                <Input
                  id="gre_score"
                  type="number"
                  value={formData.gre_score}
                  onChange={(e) => handleInputChange('gre_score', e.target.value)}
                  placeholder="340"
                  min="200"
                  max="340"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="gmat_score">GMAT Score</Label>
                <Input
                  id="gmat_score"
                  type="number"
                  value={formData.gmat_score}
                  onChange={(e) => handleInputChange('gmat_score', e.target.value)}
                  placeholder="800"
                  min="200"
                  max="800"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="ielts_score">IELTS Score</Label>
                <Input
                  id="ielts_score"
                  type="number"
                  step="0.5"
                  value={formData.ielts_score}
                  onChange={(e) => handleInputChange('ielts_score', e.target.value)}
                  placeholder="9.0"
                  min="1"
                  max="9"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="toefl_score">TOEFL Score</Label>
                <Input
                  id="toefl_score"
                  type="number"
                  value={formData.toefl_score}
                  onChange={(e) => handleInputChange('toefl_score', e.target.value)}
                  placeholder="120"
                  min="0"
                  max="120"
                />
              </div>
            </div>
          </div>

          {/* Preferences */}
          <div className="space-y-4">
            <h3 className="text-lg font-medium flex items-center gap-2">
              <Globe className="h-4 w-4" />
              Study Preferences
            </h3>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>Preferred Countries</Label>
                <Select onValueChange={addCountry}>
                  <SelectTrigger>
                    <SelectValue placeholder="Add preferred countries" />
                  </SelectTrigger>
                  <SelectContent>
                    {countries.map(country => (
                      <SelectItem key={country} value={country}>{country}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <div className="flex flex-wrap gap-2 mt-2">
                  {formData.preferred_countries.map(country => (
                    <Badge key={country} variant="secondary" className="cursor-pointer" onClick={() => removeCountry(country)}>
                      {country} ×
                    </Badge>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* Lead Management */}
          <div className="space-y-4">
            <h3 className="text-lg font-medium">Lead Management</h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label htmlFor="lead_stage">Lead Stage</Label>
                <Select value={formData.lead_stage} onValueChange={(value) => handleInputChange('lead_stage', value)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="hot">Hot</SelectItem>
                    <SelectItem value="warm">Warm</SelectItem>
                    <SelectItem value="cold">Cold</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="priority_level">Priority Level</Label>
                <Select value={formData.priority_level} onValueChange={(value) => handleInputChange('priority_level', value)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="high">High</SelectItem>
                    <SelectItem value="medium">Medium</SelectItem>
                    <SelectItem value="low">Low</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="lead_source">Lead Source</Label>
                <Select value={formData.lead_source} onValueChange={(value) => handleInputChange('lead_source', value)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="website">Website</SelectItem>
                    <SelectItem value="referral">Referral</SelectItem>
                    <SelectItem value="social_media">Social Media</SelectItem>
                    <SelectItem value="advertisement">Advertisement</SelectItem>
                    <SelectItem value="manual">Manual Entry</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>

          {/* Notes */}
          <div className="space-y-2">
            <Label htmlFor="notes">Notes</Label>
            <Textarea
              id="notes"
              value={formData.notes}
              onChange={(e) => handleInputChange('notes', e.target.value)}
              placeholder="Add any additional notes about this lead..."
              rows={3}
            />
          </div>

          {/* Actions */}
          <div className="flex gap-4 pt-4">
            <Button type="submit" disabled={submitting}>
              <Save className="h-4 w-4 mr-2" />
              {submitting ? 'Creating...' : 'Create Lead'}
            </Button>
            <Button type="button" variant="outline" onClick={resetForm}>
              <RefreshCw className="h-4 w-4 mr-2" />
              Reset Form
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}