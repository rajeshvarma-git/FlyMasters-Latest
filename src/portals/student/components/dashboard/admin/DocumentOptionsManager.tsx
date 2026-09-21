import { useState, useEffect } from 'react';
import { supabase } from '@student/integrations/supabase/client';
import { useToast } from '@student/hooks/use-toast';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@student/components/ui/card';
import { Button } from '@student/components/ui/button';
import { Input } from '@student/components/ui/input';
import { Label } from '@student/components/ui/label';
import { Switch } from '@student/components/ui/switch';
import { Badge } from '@student/components/ui/badge';
import { Plus, Edit, Trash2, Globe, GraduationCap, Save, X } from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@student/components/ui/tabs';

interface Country {
  id: string;
  name: string;
  code: string;
  is_active: boolean;
  display_order: number;
}

interface DegreeType {
  id: string;
  name: string;
  code: string;
  is_active: boolean;
  display_order: number;
}

export function DocumentOptionsManager() {
  const { toast } = useToast();
  const [countries, setCountries] = useState<Country[]>([]);
  const [degreeTypes, setDegreeTypes] = useState<DegreeType[]>([]);
  const [loading, setLoading] = useState(true);
  
  const [editingCountry, setEditingCountry] = useState<Country | null>(null);
  const [editingDegree, setEditingDegree] = useState<DegreeType | null>(null);
  
  const [newCountry, setNewCountry] = useState({ name: '', code: '' });
  const [newDegree, setNewDegree] = useState({ name: '', code: '' });

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      setLoading(true);
      
      const [countriesRes, degreesRes] = await Promise.all([
        supabase.from('document_countries').select('*').order('display_order'),
        supabase.from('document_degree_types').select('*').order('display_order')
      ]);

      if (countriesRes.error) throw countriesRes.error;
      if (degreesRes.error) throw degreesRes.error;

      setCountries(countriesRes.data || []);
      setDegreeTypes(degreesRes.data || []);
    } catch (error: any) {
      toast({
        title: "Error",
        description: "Failed to load options.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleAddCountry = async () => {
    if (!newCountry.name || !newCountry.code) {
      toast({
        title: "Error",
        description: "Please fill in all fields.",
        variant: "destructive",
      });
      return;
    }

    try {
      const { error } = await supabase
        .from('document_countries')
        .insert({
          name: newCountry.name,
          code: newCountry.code,
          display_order: countries.length + 1
        });

      if (error) throw error;

      toast({ title: "Success", description: "Country added successfully." });
      setNewCountry({ name: '', code: '' });
      fetchData();
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    }
  };

  const handleAddDegree = async () => {
    if (!newDegree.name || !newDegree.code) {
      toast({
        title: "Error",
        description: "Please fill in all fields.",
        variant: "destructive",
      });
      return;
    }

    try {
      const { error } = await supabase
        .from('document_degree_types')
        .insert({
          name: newDegree.name,
          code: newDegree.code,
          display_order: degreeTypes.length + 1
        });

      if (error) throw error;

      toast({ title: "Success", description: "Degree type added successfully." });
      setNewDegree({ name: '', code: '' });
      fetchData();
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    }
  };

  const handleUpdateCountry = async (country: Country) => {
    try {
      const { error } = await supabase
        .from('document_countries')
        .update({
          name: country.name,
          code: country.code,
          is_active: country.is_active
        })
        .eq('id', country.id);

      if (error) throw error;

      toast({ title: "Success", description: "Country updated successfully." });
      setEditingCountry(null);
      fetchData();
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    }
  };

  const handleUpdateDegree = async (degree: DegreeType) => {
    try {
      const { error } = await supabase
        .from('document_degree_types')
        .update({
          name: degree.name,
          code: degree.code,
          is_active: degree.is_active
        })
        .eq('id', degree.id);

      if (error) throw error;

      toast({ title: "Success", description: "Degree type updated successfully." });
      setEditingDegree(null);
      fetchData();
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    }
  };

  const handleDeleteCountry = async (id: string) => {
    if (!confirm('Are you sure you want to delete this country?')) return;

    try {
      const { error } = await supabase
        .from('document_countries')
        .delete()
        .eq('id', id);

      if (error) throw error;

      toast({ title: "Success", description: "Country deleted successfully." });
      fetchData();
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    }
  };

  const handleDeleteDegree = async (id: string) => {
    if (!confirm('Are you sure you want to delete this degree type?')) return;

    try {
      const { error } = await supabase
        .from('document_degree_types')
        .delete()
        .eq('id', id);

      if (error) throw error;

      toast({ title: "Success", description: "Degree type deleted successfully." });
      fetchData();
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    }
  };

  if (loading) {
    return <div className="text-center py-8">Loading...</div>;
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold">Document Options Management</h2>
        <p className="text-muted-foreground">Manage available countries and degree types for document requirements</p>
      </div>

      <Tabs defaultValue="countries" className="w-full">
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="countries">
            <Globe className="w-4 h-4 mr-2" />
            Countries
          </TabsTrigger>
          <TabsTrigger value="degrees">
            <GraduationCap className="w-4 h-4 mr-2" />
            Degree Types
          </TabsTrigger>
        </TabsList>

        <TabsContent value="countries" className="space-y-4">
          <Card className="glass-card">
            <CardHeader>
              <CardTitle>Add New Country</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-3 gap-4">
                <div className="space-y-2">
                  <Label>Country Name</Label>
                  <Input
                    value={newCountry.name}
                    onChange={(e) => setNewCountry({ ...newCountry, name: e.target.value })}
                    placeholder="e.g., United States"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Country Code</Label>
                  <Input
                    value={newCountry.code}
                    onChange={(e) => setNewCountry({ ...newCountry, code: e.target.value.toUpperCase() })}
                    placeholder="e.g., USA"
                    maxLength={3}
                  />
                </div>
                <div className="flex items-end">
                  <Button onClick={handleAddCountry} className="w-full">
                    <Plus className="w-4 h-4 mr-2" />
                    Add Country
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>

          <div className="grid gap-4">
            {countries.map((country) => (
              <Card key={country.id} className="glass-card">
                <CardContent className="p-4">
                  {editingCountry?.id === country.id ? (
                    <div className="grid grid-cols-4 gap-4">
                      <Input
                        value={editingCountry.name}
                        onChange={(e) => setEditingCountry({ ...editingCountry, name: e.target.value })}
                      />
                      <Input
                        value={editingCountry.code}
                        onChange={(e) => setEditingCountry({ ...editingCountry, code: e.target.value.toUpperCase() })}
                        maxLength={3}
                      />
                      <div className="flex items-center space-x-2">
                        <Switch
                          checked={editingCountry.is_active}
                          onCheckedChange={(checked) => setEditingCountry({ ...editingCountry, is_active: checked })}
                        />
                        <Label>Active</Label>
                      </div>
                      <div className="flex gap-2">
                        <Button size="sm" onClick={() => handleUpdateCountry(editingCountry)}>
                          <Save className="w-4 h-4" />
                        </Button>
                        <Button size="sm" variant="outline" onClick={() => setEditingCountry(null)}>
                          <X className="w-4 h-4" />
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-4">
                        <div>
                          <div className="font-semibold">{country.name}</div>
                          <div className="text-sm text-muted-foreground">Code: {country.code}</div>
                        </div>
                        {!country.is_active && <Badge variant="secondary">Inactive</Badge>}
                      </div>
                      <div className="flex gap-2">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => setEditingCountry(country)}
                        >
                          <Edit className="w-4 h-4" />
                        </Button>
                        <Button
                          size="sm"
                          variant="destructive"
                          onClick={() => handleDeleteCountry(country.id)}
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>

        <TabsContent value="degrees" className="space-y-4">
          <Card className="glass-card">
            <CardHeader>
              <CardTitle>Add New Degree Type</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-3 gap-4">
                <div className="space-y-2">
                  <Label>Degree Name</Label>
                  <Input
                    value={newDegree.name}
                    onChange={(e) => setNewDegree({ ...newDegree, name: e.target.value })}
                    placeholder="e.g., Masters"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Degree Code</Label>
                  <Input
                    value={newDegree.code}
                    onChange={(e) => setNewDegree({ ...newDegree, code: e.target.value.toUpperCase() })}
                    placeholder="e.g., PG"
                    maxLength={5}
                  />
                </div>
                <div className="flex items-end">
                  <Button onClick={handleAddDegree} className="w-full">
                    <Plus className="w-4 h-4 mr-2" />
                    Add Degree Type
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>

          <div className="grid gap-4">
            {degreeTypes.map((degree) => (
              <Card key={degree.id} className="glass-card">
                <CardContent className="p-4">
                  {editingDegree?.id === degree.id ? (
                    <div className="grid grid-cols-4 gap-4">
                      <Input
                        value={editingDegree.name}
                        onChange={(e) => setEditingDegree({ ...editingDegree, name: e.target.value })}
                      />
                      <Input
                        value={editingDegree.code}
                        onChange={(e) => setEditingDegree({ ...editingDegree, code: e.target.value.toUpperCase() })}
                        maxLength={5}
                      />
                      <div className="flex items-center space-x-2">
                        <Switch
                          checked={editingDegree.is_active}
                          onCheckedChange={(checked) => setEditingDegree({ ...editingDegree, is_active: checked })}
                        />
                        <Label>Active</Label>
                      </div>
                      <div className="flex gap-2">
                        <Button size="sm" onClick={() => handleUpdateDegree(editingDegree)}>
                          <Save className="w-4 h-4" />
                        </Button>
                        <Button size="sm" variant="outline" onClick={() => setEditingDegree(null)}>
                          <X className="w-4 h-4" />
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-4">
                        <div>
                          <div className="font-semibold">{degree.name}</div>
                          <div className="text-sm text-muted-foreground">Code: {degree.code}</div>
                        </div>
                        {!degree.is_active && <Badge variant="secondary">Inactive</Badge>}
                      </div>
                      <div className="flex gap-2">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => setEditingDegree(degree)}
                        >
                          <Edit className="w-4 h-4" />
                        </Button>
                        <Button
                          size="sm"
                          variant="destructive"
                          onClick={() => handleDeleteDegree(degree.id)}
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
