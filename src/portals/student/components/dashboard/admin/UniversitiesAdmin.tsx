import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@student/components/ui/card';
import { Button } from '@student/components/ui/button';
import { Input } from '@student/components/ui/input';
import { Label } from '@student/components/ui/label';
import { Textarea } from '@student/components/ui/textarea';
import { Switch } from '@student/components/ui/switch';
import { Badge } from '@student/components/ui/badge';
import { supabase } from '@student/integrations/supabase/client';
import { toast } from 'sonner';
import { GraduationCap, Plus, Save, Trash2, Search, Filter } from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@student/components/ui/select';

interface University {
  id: string;
  name: string;
  country: string;
  city: string;
  state_province: string;
  website_url: string;
  logo_url: string;
  description: string;
  ranking: number;
  established_year: number;
  university_type: string;
  is_tie_up: boolean;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export function UniversitiesAdmin() {
  const [universities, setUniversities] = useState<University[]>([]);
  const [filteredUniversities, setFilteredUniversities] = useState<University[]>([]);
  const [selectedUniversity, setSelectedUniversity] = useState<University | null>(null);
  const [loading, setLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [countryFilter, setCountryFilter] = useState('all');
  const [isEditing, setIsEditing] = useState(false);

  useEffect(() => {
    fetchUniversities();
  }, []);

  useEffect(() => {
    filterUniversities();
  }, [universities, searchQuery, countryFilter]);

  const fetchUniversities = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('universities')
        .select('*')
        .order('name');

      if (error) throw error;
      setUniversities(data || []);
    } catch (error: any) {
      toast.error('Failed to fetch universities');
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  const filterUniversities = () => {
    let filtered = universities;

    if (searchQuery) {
      filtered = filtered.filter(uni =>
        uni.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        uni.country.toLowerCase().includes(searchQuery.toLowerCase()) ||
        uni.city?.toLowerCase().includes(searchQuery.toLowerCase())
      );
    }

    if (countryFilter !== 'all') {
      filtered = filtered.filter(uni => uni.country === countryFilter);
    }

    setFilteredUniversities(filtered);
  };

  const saveUniversity = async () => {
    if (!selectedUniversity) return;

    try {
      setLoading(true);
      const { error } = await supabase
        .from('universities')
        .update({
          name: selectedUniversity.name,
          country: selectedUniversity.country,
          city: selectedUniversity.city,
          state_province: selectedUniversity.state_province,
          website_url: selectedUniversity.website_url,
          logo_url: selectedUniversity.logo_url,
          description: selectedUniversity.description,
          ranking: selectedUniversity.ranking,
          established_year: selectedUniversity.established_year,
          university_type: selectedUniversity.university_type,
          is_tie_up: selectedUniversity.is_tie_up,
          is_active: selectedUniversity.is_active
        })
        .eq('id', selectedUniversity.id);

      if (error) throw error;
      toast.success('University updated successfully');
      fetchUniversities();
      setIsEditing(false);
    } catch (error: any) {
      toast.error('Failed to update university');
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  const addNewUniversity = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('universities')
        .insert({
          name: 'New University',
          country: 'USA',
          city: '',
          state_province: '',
          website_url: '',
          logo_url: '',
          description: '',
          ranking: 0,
          established_year: new Date().getFullYear(),
          university_type: 'public',
          is_tie_up: false,
          is_active: false
        })
        .select()
        .single();

      if (error) throw error;
      toast.success('University added successfully');
      fetchUniversities();
      setSelectedUniversity(data);
      setIsEditing(true);
    } catch (error: any) {
      toast.error('Failed to add university');
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  const deleteUniversity = async (id: string) => {
    if (!confirm('Are you sure you want to delete this university? This will also delete all associated courses.')) {
      return;
    }

    try {
      setLoading(true);
      const { error } = await supabase
        .from('universities')
        .delete()
        .eq('id', id);

      if (error) throw error;
      toast.success('University deleted successfully');
      fetchUniversities();
      if (selectedUniversity?.id === id) {
        setSelectedUniversity(null);
        setIsEditing(false);
      }
    } catch (error: any) {
      toast.error('Failed to delete university');
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  const uniqueCountries = Array.from(new Set(universities.map(u => u.country))).sort();

  return (
    <div className="space-y-6 w-full overflow-x-hidden">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-3xl font-bold flex items-center gap-2">
            <GraduationCap className="w-8 h-8" />
            Universities Management
          </h2>
          <p className="text-muted-foreground">Manage universities and their information</p>
        </div>
        <Button onClick={addNewUniversity} size="lg" disabled={loading}>
          <Plus className="w-4 h-4 mr-2" />
          Add University
        </Button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="relative">
          <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search universities..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10"
          />
        </div>
        <Select value={countryFilter} onValueChange={setCountryFilter}>
          <SelectTrigger>
            <Filter className="w-4 h-4 mr-2" />
            <SelectValue placeholder="Filter by country" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Countries</SelectItem>
            {uniqueCountries.map(country => (
              <SelectItem key={country} value={country}>{country}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Universities List */}
        <Card className="lg:col-span-1 max-h-[600px] overflow-y-auto">
          <CardHeader>
            <CardTitle>Universities ({filteredUniversities.length})</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {filteredUniversities.map(university => (
              <div
                key={university.id}
                className={`p-3 rounded-lg border cursor-pointer transition-colors ${
                  selectedUniversity?.id === university.id
                    ? 'bg-primary/10 border-primary'
                    : 'hover:bg-muted/50'
                }`}
                onClick={() => {
                  setSelectedUniversity(university);
                  setIsEditing(false);
                }}
              >
                <div className="flex items-center justify-between">
                  <div className="flex-1">
                    <p className="font-medium">{university.name}</p>
                    <p className="text-sm text-muted-foreground">
                      {university.city ? `${university.city}, ` : ''}{university.country}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    {university.is_tie_up && (
                      <Badge variant="secondary">Tie-up</Badge>
                    )}
                    {!university.is_active && (
                      <Badge variant="outline">Inactive</Badge>
                    )}
                  </div>
                </div>
              </div>
            ))}
            {filteredUniversities.length === 0 && (
              <div className="text-center py-8 text-muted-foreground">
                No universities found
              </div>
            )}
          </CardContent>
        </Card>

        {/* University Details */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle>
                {selectedUniversity ? (isEditing ? 'Edit University' : 'University Details') : 'Select a University'}
              </CardTitle>
              {selectedUniversity && (
                <div className="flex gap-2">
                  {!isEditing ? (
                    <>
                      <Button onClick={() => setIsEditing(true)} variant="outline">
                        Edit
                      </Button>
                      <Button
                        onClick={() => deleteUniversity(selectedUniversity.id)}
                        variant="destructive"
                        disabled={loading}
                      >
                        <Trash2 className="w-4 h-4 mr-2" />
                        Delete
                      </Button>
                    </>
                  ) : (
                    <>
                      <Button onClick={() => setIsEditing(false)} variant="outline">
                        Cancel
                      </Button>
                      <Button onClick={saveUniversity} disabled={loading}>
                        <Save className="w-4 h-4 mr-2" />
                        Save Changes
                      </Button>
                    </>
                  )}
                </div>
              )}
            </div>
          </CardHeader>
          <CardContent>
            {selectedUniversity ? (
              <div className="space-y-4">
                <div>
                  <Label>University Name</Label>
                  <Input
                    value={selectedUniversity.name}
                    onChange={(e) => setSelectedUniversity({...selectedUniversity, name: e.target.value})}
                    disabled={!isEditing}
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label>Country</Label>
                    <Input
                      value={selectedUniversity.country}
                      onChange={(e) => setSelectedUniversity({...selectedUniversity, country: e.target.value})}
                      disabled={!isEditing}
                    />
                  </div>
                  <div>
                    <Label>City</Label>
                    <Input
                      value={selectedUniversity.city}
                      onChange={(e) => setSelectedUniversity({...selectedUniversity, city: e.target.value})}
                      disabled={!isEditing}
                    />
                  </div>
                </div>
                <div>
                  <Label>State/Province</Label>
                  <Input
                    value={selectedUniversity.state_province}
                    onChange={(e) => setSelectedUniversity({...selectedUniversity, state_province: e.target.value})}
                    disabled={!isEditing}
                  />
                </div>
                <div>
                  <Label>Description</Label>
                  <Textarea
                    value={selectedUniversity.description}
                    onChange={(e) => setSelectedUniversity({...selectedUniversity, description: e.target.value})}
                    disabled={!isEditing}
                    rows={3}
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label>Website URL</Label>
                    <Input
                      value={selectedUniversity.website_url}
                      onChange={(e) => setSelectedUniversity({...selectedUniversity, website_url: e.target.value})}
                      disabled={!isEditing}
                      placeholder="https://..."
                    />
                  </div>
                  <div>
                    <Label>Logo URL</Label>
                    <Input
                      value={selectedUniversity.logo_url}
                      onChange={(e) => setSelectedUniversity({...selectedUniversity, logo_url: e.target.value})}
                      disabled={!isEditing}
                      placeholder="https://..."
                    />
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-4">
                  <div>
                    <Label>Ranking</Label>
                    <Input
                      type="number"
                      value={selectedUniversity.ranking}
                      onChange={(e) => setSelectedUniversity({...selectedUniversity, ranking: parseInt(e.target.value) || 0})}
                      disabled={!isEditing}
                    />
                  </div>
                  <div>
                    <Label>Established Year</Label>
                    <Input
                      type="number"
                      value={selectedUniversity.established_year}
                      onChange={(e) => setSelectedUniversity({...selectedUniversity, established_year: parseInt(e.target.value) || new Date().getFullYear()})}
                      disabled={!isEditing}
                    />
                  </div>
                  <div>
                    <Label>Type</Label>
                    <Select
                      value={selectedUniversity.university_type}
                      onValueChange={(value) => setSelectedUniversity({...selectedUniversity, university_type: value})}
                      disabled={!isEditing}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="public">Public</SelectItem>
                        <SelectItem value="private">Private</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="flex items-center gap-4">
                  <div className="flex items-center gap-2">
                    <Switch
                      checked={selectedUniversity.is_tie_up}
                      onCheckedChange={(checked) => setSelectedUniversity({...selectedUniversity, is_tie_up: checked})}
                      disabled={!isEditing}
                    />
                    <Label>Has Tie-up Partnership</Label>
                  </div>
                  <div className="flex items-center gap-2">
                    <Switch
                      checked={selectedUniversity.is_active}
                      onCheckedChange={(checked) => setSelectedUniversity({...selectedUniversity, is_active: checked})}
                      disabled={!isEditing}
                    />
                    <Label>Active (Visible)</Label>
                  </div>
                </div>
              </div>
            ) : (
              <div className="text-center py-12 text-muted-foreground">
                <GraduationCap className="w-16 h-16 mx-auto mb-4 opacity-50" />
                <p>Select a university from the list to view or edit details</p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}