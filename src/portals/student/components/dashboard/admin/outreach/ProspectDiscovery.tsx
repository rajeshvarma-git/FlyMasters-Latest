import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@student/components/ui/card';
import { Button } from '@student/components/ui/button';
import { Input } from '@student/components/ui/input';
import { Label } from '@student/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@student/components/ui/select';
import { Badge } from '@student/components/ui/badge';
import { Textarea } from '@student/components/ui/textarea';
import { useToast } from '@student/components/ui/use-toast';
import { supabase } from '@student/integrations/supabase/client';
import { Search, Plus, Eye, Edit, Globe, Mail, Phone, Star } from 'lucide-react';

interface UniversityProspect {
  id: string;
  name: string;
  country: string;
  website_url?: string;
  contact_email?: string;
  contact_person?: string;
  phone?: string;
  city?: string;
  ranking?: number;
  status: string;
  priority_level: string;
  tags: string[];
  notes?: string;
  discovered_at: string;
}

export function ProspectDiscovery() {
  const { toast } = useToast();
  const [prospects, setProspects] = useState<UniversityProspect[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [countryFilter, setCountryFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [showAddForm, setShowAddForm] = useState(false);

  // Form state for adding new prospect
  const [newProspect, setNewProspect] = useState({
    name: '',
    country: '',
    website_url: '',
    contact_email: '',
    contact_person: '',
    phone: '',
    city: '',
    ranking: '',
    priority_level: 'medium',
    notes: '',
    tags: [] as string[]
  });

  useEffect(() => {
    fetchProspects();
  }, []);

  const fetchProspects = async () => {
    try {
      const { data, error } = await supabase
        .from('university_prospects')
        .select('*')
        .order('discovered_at', { ascending: false });

      if (error) throw error;
      setProspects(data || []);
    } catch (error) {
      console.error('Error fetching prospects:', error);
      toast({
        title: 'Error',
        description: 'Failed to fetch university prospects',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const handleAddProspect = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const { error } = await supabase
        .from('university_prospects')
        .insert([{
          ...newProspect,
          ranking: newProspect.ranking ? parseInt(newProspect.ranking) : null,
          tags: newProspect.tags,
          discovery_source: 'manual'
        }]);

      if (error) throw error;

      toast({
        title: 'Success',
        description: 'University prospect added successfully',
      });

      setShowAddForm(false);
      setNewProspect({
        name: '', country: '', website_url: '', contact_email: '',
        contact_person: '', phone: '', city: '', ranking: '',
        priority_level: 'medium', notes: '', tags: []
      });
      fetchProspects();
    } catch (error) {
      console.error('Error adding prospect:', error);
      toast({
        title: 'Error',
        description: 'Failed to add university prospect',
        variant: 'destructive',
      });
    }
  };

  const updateProspectStatus = async (id: string, status: string) => {
    try {
      const { error } = await supabase
        .from('university_prospects')
        .update({ status })
        .eq('id', id);

      if (error) throw error;

      toast({
        title: 'Success',
        description: 'Prospect status updated',
      });
      fetchProspects();
    } catch (error) {
      console.error('Error updating status:', error);
      toast({
        title: 'Error',
        description: 'Failed to update prospect status',
        variant: 'destructive',
      });
    }
  };

  const getStatusBadge = (status: string) => {
    const statusConfig = {
      discovered: { label: 'Discovered', variant: 'secondary' as const },
      contacted: { label: 'Contacted', variant: 'default' as const },
      replied: { label: 'Replied', variant: 'outline' as const },
      interested: { label: 'Interested', variant: 'default' as const },
      negotiating: { label: 'Negotiating', variant: 'default' as const },
      signed: { label: 'Signed', variant: 'default' as const },
      rejected: { label: 'Rejected', variant: 'destructive' as const }
    };
    const config = statusConfig[status as keyof typeof statusConfig] || statusConfig.discovered;
    return <Badge variant={config.variant}>{config.label}</Badge>;
  };

  const getPriorityBadge = (priority: string) => {
    const priorityConfig = {
      low: { label: 'Low', variant: 'outline' as const },
      medium: { label: 'Medium', variant: 'secondary' as const },
      high: { label: 'High', variant: 'default' as const },
      urgent: { label: 'Urgent', variant: 'destructive' as const }
    };
    const config = priorityConfig[priority as keyof typeof priorityConfig] || priorityConfig.medium;
    return <Badge variant={config.variant}>{config.label}</Badge>;
  };

  const filteredProspects = prospects.filter(prospect => {
    const matchesSearch = prospect.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                         prospect.country.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesCountry = countryFilter === 'all' || prospect.country === countryFilter;
    const matchesStatus = statusFilter === 'all' || prospect.status === statusFilter;
    return matchesSearch && matchesCountry && matchesStatus;
  });

  const countries = [...new Set(prospects.map(p => p.country))];

  if (loading) {
    return <div className="p-6">Loading prospects...</div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">University Prospect Discovery</h2>
          <p className="text-muted-foreground">Discover and manage university prospects</p>
        </div>
        <Button onClick={() => setShowAddForm(true)}>
          <Plus className="w-4 h-4 mr-2" />
          Add Prospect
        </Button>
      </div>

      {/* Filters */}
      <Card className="glass-card">
        <CardContent className="p-4">
          <div className="flex gap-4 flex-wrap">
            <div className="flex-1 min-w-[200px]">
              <div className="relative">
                <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search prospects..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-10"
                />
              </div>
            </div>
            <Select value={countryFilter} onValueChange={setCountryFilter}>
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="Filter by country" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Countries</SelectItem>
                {countries.map(country => (
                  <SelectItem key={country} value={country}>{country}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-[150px]">
                <SelectValue placeholder="Filter by status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Status</SelectItem>
                <SelectItem value="discovered">Discovered</SelectItem>
                <SelectItem value="contacted">Contacted</SelectItem>
                <SelectItem value="replied">Replied</SelectItem>
                <SelectItem value="interested">Interested</SelectItem>
                <SelectItem value="negotiating">Negotiating</SelectItem>
                <SelectItem value="signed">Signed</SelectItem>
                <SelectItem value="rejected">Rejected</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Add Prospect Form */}
      {showAddForm && (
        <Card className="glass-card">
          <CardHeader>
            <CardTitle>Add New University Prospect</CardTitle>
            <CardDescription>Manually add a new university to your prospect list</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleAddProspect} className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="name">University Name *</Label>
                  <Input
                    id="name"
                    value={newProspect.name}
                    onChange={(e) => setNewProspect({...newProspect, name: e.target.value})}
                    required
                  />
                </div>
                <div>
                  <Label htmlFor="country">Country *</Label>
                  <Input
                    id="country"
                    value={newProspect.country}
                    onChange={(e) => setNewProspect({...newProspect, country: e.target.value})}
                    required
                  />
                </div>
                <div>
                  <Label htmlFor="website">Website URL</Label>
                  <Input
                    id="website"
                    type="url"
                    value={newProspect.website_url}
                    onChange={(e) => setNewProspect({...newProspect, website_url: e.target.value})}
                  />
                </div>
                <div>
                  <Label htmlFor="email">Contact Email</Label>
                  <Input
                    id="email"
                    type="email"
                    value={newProspect.contact_email}
                    onChange={(e) => setNewProspect({...newProspect, contact_email: e.target.value})}
                  />
                </div>
                <div>
                  <Label htmlFor="contact_person">Contact Person</Label>
                  <Input
                    id="contact_person"
                    value={newProspect.contact_person}
                    onChange={(e) => setNewProspect({...newProspect, contact_person: e.target.value})}
                  />
                </div>
                <div>
                  <Label htmlFor="city">City</Label>
                  <Input
                    id="city"
                    value={newProspect.city}
                    onChange={(e) => setNewProspect({...newProspect, city: e.target.value})}
                  />
                </div>
                <div>
                  <Label htmlFor="ranking">Ranking</Label>
                  <Input
                    id="ranking"
                    type="number"
                    value={newProspect.ranking}
                    onChange={(e) => setNewProspect({...newProspect, ranking: e.target.value})}
                  />
                </div>
                <div>
                  <Label htmlFor="priority">Priority Level</Label>
                  <Select value={newProspect.priority_level} onValueChange={(value) => setNewProspect({...newProspect, priority_level: value})}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="low">Low</SelectItem>
                      <SelectItem value="medium">Medium</SelectItem>
                      <SelectItem value="high">High</SelectItem>
                      <SelectItem value="urgent">Urgent</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div>
                <Label htmlFor="notes">Notes</Label>
                <Textarea
                  id="notes"
                  value={newProspect.notes}
                  onChange={(e) => setNewProspect({...newProspect, notes: e.target.value})}
                  placeholder="Add any relevant notes about this university..."
                />
              </div>
              <div className="flex gap-2">
                <Button type="submit">Add Prospect</Button>
                <Button type="button" variant="outline" onClick={() => setShowAddForm(false)}>
                  Cancel
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      {/* Prospects List */}
      <div className="grid gap-4">
        {filteredProspects.map((prospect) => (
          <Card key={prospect.id} className="glass-card">
            <CardContent className="p-6">
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <div className="flex items-start gap-4">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-2">
                        <h3 className="text-lg font-semibold">{prospect.name}</h3>
                        {prospect.ranking && (
                          <Badge variant="outline" className="text-xs">
                            <Star className="w-3 h-3 mr-1" />
                            Rank #{prospect.ranking}
                          </Badge>
                        )}
                      </div>
                      <div className="flex flex-wrap gap-2 mb-3">
                        <Badge variant="outline">{prospect.country}</Badge>
                        {getStatusBadge(prospect.status)}
                        {getPriorityBadge(prospect.priority_level)}
                        {prospect.tags.map(tag => (
                          <Badge key={tag} variant="secondary">{tag}</Badge>
                        ))}
                      </div>
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-2 text-sm text-muted-foreground">
                        {prospect.website_url && (
                          <div className="flex items-center gap-1">
                            <Globe className="w-4 h-4" />
                            <a href={prospect.website_url} target="_blank" rel="noopener noreferrer" className="hover:text-primary">
                              Website
                            </a>
                          </div>
                        )}
                        {prospect.contact_email && (
                          <div className="flex items-center gap-1">
                            <Mail className="w-4 h-4" />
                            <span>{prospect.contact_email}</span>
                          </div>
                        )}
                        {prospect.phone && (
                          <div className="flex items-center gap-1">
                            <Phone className="w-4 h-4" />
                            <span>{prospect.phone}</span>
                          </div>
                        )}
                      </div>
                      {prospect.notes && (
                        <p className="text-sm text-muted-foreground mt-2">{prospect.notes}</p>
                      )}
                    </div>
                    <div className="flex flex-col gap-2">
                      <Select value={prospect.status} onValueChange={(value) => updateProspectStatus(prospect.id, value)}>
                        <SelectTrigger className="w-[130px]">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="discovered">Discovered</SelectItem>
                          <SelectItem value="contacted">Contacted</SelectItem>
                          <SelectItem value="replied">Replied</SelectItem>
                          <SelectItem value="interested">Interested</SelectItem>
                          <SelectItem value="negotiating">Negotiating</SelectItem>
                          <SelectItem value="signed">Signed</SelectItem>
                          <SelectItem value="rejected">Rejected</SelectItem>
                        </SelectContent>
                      </Select>
                      <Button variant="outline" size="sm">
                        <Edit className="w-4 h-4 mr-1" />
                        Edit
                      </Button>
                    </div>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {filteredProspects.length === 0 && (
        <Card className="glass-card">
          <CardContent className="p-12 text-center">
            <Search className="w-16 h-16 text-muted-foreground mx-auto mb-4" />
            <h3 className="text-xl font-semibold mb-2">No Prospects Found</h3>
            <p className="text-muted-foreground mb-4">
              {searchQuery || countryFilter !== 'all' || statusFilter !== 'all' 
                ? 'No prospects match your current filters.' 
                : 'Start by adding your first university prospect.'}
            </p>
            <Button onClick={() => setShowAddForm(true)}>
              <Plus className="w-4 h-4 mr-2" />
              Add First Prospect
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}