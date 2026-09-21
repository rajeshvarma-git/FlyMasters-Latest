import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '@student/hooks/useAuth';
import { supabase } from '@student/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@student/components/ui/card';
import { Input } from '@student/components/ui/input';
import { Button } from '@student/components/ui/button';
import { Badge } from '@student/components/ui/badge';
import { useToast } from '@student/hooks/use-toast';
import { 
  GraduationCap, 
  Search,
  MapPin,
  Heart,
  ExternalLink
} from 'lucide-react';
import { matchesAnyCountry, normalizeCountry } from '@student/lib/universityRecommendations';

interface University {
  id: string;
  name: string;
  country: string;
  city: string | null;
  website_url: string | null;
  ranking: number | null;
  is_active: boolean;
  university_type: string | null;
  description: string | null;
}

export function StudentUniversities() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [universities, setUniversities] = useState<University[]>([]);
  const [preferredCountries, setPreferredCountries] = useState<string[]>([]);
  const [favoriteIds, setFavoriteIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCountry, setSelectedCountry] = useState('profile');
  const [savingId, setSavingId] = useState<string | null>(null);

  useEffect(() => {
    fetchPageData();
  }, [user]);

  const fetchPageData = async () => {
    try {
      setLoading(true);
      const [{ data: catalog }, leadResult, profileResult] = await Promise.all([
        supabase.from('universities').select('*').eq('is_active', true).order('ranking', { ascending: true }),
        user
          ? supabase.from('student_leads').select('preferred_countries, preferences').eq('user_id', user.id).maybeSingle()
          : Promise.resolve({ data: null }),
        user
          ? supabase.from('profiles').select('interested_countries').eq('user_id', user.id).maybeSingle()
          : Promise.resolve({ data: null }),
      ]);

      const lead = leadResult.data;
      const extras = ((lead?.preferences as Record<string, any> | null) || {});
      const fromLead = (lead?.preferred_countries || extras.interested_countries || profileResult.data?.interested_countries || []) as string[];
      const destinations = Array.from(new Set(fromLead.map((item) => normalizeCountry(item)).filter(Boolean)));

      setPreferredCountries(destinations);
      setUniversities(catalog || []);
      setSelectedCountry(destinations.length > 0 ? 'profile' : '');
    } catch (error) {
      console.error('Error fetching universities:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchFavorites = async () => {
    if (!user) return;
    const { data, error } = await supabase
      .from('user_favorites')
      .select('university_id')
      .eq('user_id', user.id);

    if (!error && data) {
      setFavoriteIds(new Set(data.map((row) => row.university_id)));
    }
  };

  useEffect(() => {
    if (user) fetchFavorites();
  }, [user]);

  const toggleFavorite = async (universityId: string) => {
    if (!user) {
      toast({
        title: 'Sign in required',
        description: 'Please sign in to save universities.',
        variant: 'destructive',
      });
      return;
    }

    const isFavorite = favoriteIds.has(universityId);
    setSavingId(universityId);

    try {
      if (isFavorite) {
        const { error } = await supabase
          .from('user_favorites')
          .delete()
          .eq('user_id', user.id)
          .eq('university_id', universityId);
        if (error) throw error;
        setFavoriteIds((prev) => {
          const next = new Set(prev);
          next.delete(universityId);
          return next;
        });
        toast({ title: 'Removed from saved universities' });
      } else {
        const { error } = await supabase
          .from('user_favorites')
          .insert({ user_id: user.id, university_id: universityId });
        if (error) throw error;
        setFavoriteIds((prev) => new Set(prev).add(universityId));
        toast({ title: 'Saved to your favorites' });
      }
    } catch (error: any) {
      toast({
        title: 'Could not update favorites',
        description: error.message,
        variant: 'destructive',
      });
    } finally {
      setSavingId(null);
    }
  };

  const filteredUniversities = universities.filter((uni) => {
    const matchesSearch = !searchTerm ||
      uni.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      uni.country.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (uni.city || '').toLowerCase().includes(searchTerm.toLowerCase());

    const matchesCountry =
      selectedCountry === 'profile'
        ? matchesAnyCountry(uni.country, preferredCountries)
        : !selectedCountry || matchesAnyCountry(uni.country, [selectedCountry]);

    return matchesSearch && matchesCountry;
  }).sort((a, b) => {
    const aMatch = matchesAnyCountry(a.country, preferredCountries) ? 0 : 1;
    const bMatch = matchesAnyCountry(b.country, preferredCountries) ? 0 : 1;
    return aMatch - bMatch;
  });

  const countries = Array.from(new Set(universities.map((uni) => uni.country))).sort();

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-full bg-gradient-primary flex items-center justify-center">
          <GraduationCap className="w-5 h-5 text-white" />
        </div>
        <div>
          <h1 className="text-2xl font-bold">Universities</h1>
          <p className="text-muted-foreground">
            {preferredCountries.length > 0
              ? `Matched to your profile destinations: ${preferredCountries.join(', ')}`
              : 'Save study destinations on My Profile to personalize this list'}
          </p>
        </div>
      </div>

      <Card className="glass-card">
        <CardContent className="p-4">
          <div className="flex flex-col sm:flex-row gap-4">
            <div className="flex-1">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground w-4 h-4" />
                <Input
                  placeholder="Search universities or countries..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10"
                />
              </div>
            </div>
            <select
              value={selectedCountry}
              onChange={(e) => setSelectedCountry(e.target.value)}
              className="px-3 py-2 border rounded-md bg-background"
            >
              {preferredCountries.length > 0 && (
                <option value="profile">My destinations ({preferredCountries.join(', ')})</option>
              )}
              <option value="">All catalog countries</option>
              {countries.map((country) => (
                <option key={country} value={country}>{country}</option>
              ))}
            </select>
          </div>
        </CardContent>
      </Card>

      {filteredUniversities.length === 0 ? (
        <Card className="glass-card">
          <CardContent className="text-center py-12">
            <GraduationCap className="w-16 h-16 mx-auto mb-4 opacity-50" />
            <h3 className="text-lg font-semibold mb-2">
              {universities.length === 0 ? 'No Universities Yet' : 'No Universities Found'}
            </h3>
            <p className="text-muted-foreground">
              {preferredCountries.length === 0
                ? 'Add interested countries on My Profile to see matching universities.'
                : universities.length === 0
                ? 'No universities have been added for your destinations yet. Your counselor will add them from the admin portal.'
                : 'Try another country filter or update destinations on My Profile.'}
            </p>
            <div className="flex justify-center gap-2 mt-4">
              {preferredCountries.length === 0 ? (
                <Button asChild>
                  <Link to="/student/profile">Update My Profile</Link>
                </Button>
              ) : (
                <Button
                  variant="outline"
                  onClick={() => {
                    setSearchTerm('');
                    setSelectedCountry('');
                  }}
                >
                  Show all catalog
                </Button>
              )}
            </div>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {filteredUniversities.map((university) => {
            const isFavorite = favoriteIds.has(university.id);
            return (
              <Card key={university.id} className="glass-card hover:shadow-lg transition-shadow">
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <CardTitle className="text-lg line-clamp-2">{university.name}</CardTitle>
                      <CardDescription className="flex items-center gap-1 mt-1">
                        <MapPin className="w-3 h-3" />
                        {university.city ? `${university.city}, ` : ''}{university.country}
                      </CardDescription>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      disabled={savingId === university.id}
                      onClick={() => toggleFavorite(university.id)}
                      aria-label={isFavorite ? 'Remove from favorites' : 'Save university'}
                    >
                      <Heart className={`w-4 h-4 ${isFavorite ? 'fill-red-500 text-red-500' : ''}`} />
                    </Button>
                  </div>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="flex flex-wrap items-center gap-2">
                    {university.ranking ? (
                      <Badge variant="secondary">#{university.ranking} Global Ranking</Badge>
                    ) : null}
                    {university.university_type ? (
                      <Badge variant="outline">{university.university_type}</Badge>
                    ) : null}
                    {matchesAnyCountry(university.country, preferredCountries) ? (
                      <Badge>Matches your profile</Badge>
                    ) : null}
                  </div>

                  {university.description ? (
                    <p className="text-sm text-muted-foreground line-clamp-2">
                      {university.description}
                    </p>
                  ) : (
                    <p className="text-sm text-muted-foreground">
                      Contact your counselor for fees and admission details.
                    </p>
                  )}

                  <div className="flex gap-2 pt-2">
                    <Button size="sm" className="flex-1" asChild>
                      <Link to={`/student/applications?university=${encodeURIComponent(university.id)}`}>
                        Apply
                      </Link>
                    </Button>
                    {university.website_url ? (
                      <Button variant="outline" size="sm" className="flex-1" asChild>
                        <a href={university.website_url} target="_blank" rel="noopener noreferrer">
                          View Details
                        </a>
                      </Button>
                    ) : (
                      <Button variant="outline" size="sm" className="flex-1" disabled>
                        Details coming soon
                      </Button>
                    )}
                    {university.website_url ? (
                      <Button variant="ghost" size="sm" asChild>
                        <a href={university.website_url} target="_blank" rel="noopener noreferrer">
                          <ExternalLink className="w-4 h-4" />
                        </a>
                      </Button>
                    ) : null}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
