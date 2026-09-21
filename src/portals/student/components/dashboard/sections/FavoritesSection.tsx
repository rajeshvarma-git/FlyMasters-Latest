import { useState, useEffect } from 'react';
import { useAuth } from '@student/hooks/useAuth';
import { supabase } from '@student/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@student/components/ui/card';
import { Button } from '@student/components/ui/button';
import { Badge } from '@student/components/ui/badge';
import { useToast } from '@student/hooks/use-toast';
import { Heart, MapPin, DollarSign, Calendar, Globe, Trash2, ExternalLink } from 'lucide-react';
import { Tables } from '@student/integrations/supabase/types';

type University = Tables<'universities'>;
type Course = Tables<'courses'>;

interface FavoriteUniversity extends University {
  courses: Course[];
  favorited_at: string;
}

export function FavoritesSection() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [favorites, setFavorites] = useState<FavoriteUniversity[]>([]);

  useEffect(() => {
    if (user) {
      fetchFavorites();
    }
  }, [user]);

  const fetchFavorites = async () => {
    try {
      setLoading(true);

      // Fetch favorites with university details
      const { data: favoritesData, error: favoritesError } = await supabase
        .from('user_favorites')
        .select(`
          created_at,
          universities (
            *,
            courses (*)
          )
        `)
        .eq('user_id', user?.id)
        .order('created_at', { ascending: false });

      if (favoritesError) throw favoritesError;

      // Transform the data to match our interface
      const formattedFavorites = favoritesData?.map((fav: any) => ({
        ...fav.universities,
        courses: fav.universities.courses || [],
        favorited_at: fav.created_at,
      })) || [];

      setFavorites(formattedFavorites);
    } catch (error: any) {
      console.error('Error fetching favorites:', error);
      toast({
        title: "Error",
        description: "Failed to load your favorite universities.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const removeFavorite = async (universityId: string) => {
    if (!user) return;

    try {
      const { error } = await supabase
        .from('user_favorites')
        .delete()
        .eq('user_id', user.id)
        .eq('university_id', universityId);

      if (error) throw error;

      setFavorites(prev => prev.filter(fav => fav.id !== universityId));
      
      toast({
        title: "Removed from favorites",
        description: "University has been removed from your favorites.",
      });
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    }
  };

  const getLowestTuition = (courses: Course[]) => {
    if (courses.length === 0) return null;
    return Math.min(...courses.map(c => c.tuition_fee_usd || 0));
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-full bg-gradient-primary flex items-center justify-center">
            <Heart className="w-6 h-6 text-white" />
          </div>
          <div>
            <h1 className="text-3xl font-bold">Favorite Universities</h1>
            <p className="text-muted-foreground">Your shortlisted universities for applications</p>
          </div>
        </div>

        <div className="grid gap-4">
          {[...Array(3)].map((_, i) => (
            <Card key={i} className="glass-card animate-pulse">
              <CardContent className="p-6">
                <div className="h-6 bg-muted/20 rounded w-1/3 mb-2"></div>
                <div className="h-4 bg-muted/20 rounded w-1/2 mb-4"></div>
                <div className="flex gap-2">
                  <div className="h-6 bg-muted/20 rounded w-20"></div>
                  <div className="h-6 bg-muted/20 rounded w-20"></div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <div className="w-12 h-12 rounded-full bg-gradient-primary flex items-center justify-center">
          <Heart className="w-6 h-6 text-white" />
        </div>
        <div>
          <h1 className="text-3xl font-bold">Favorite Universities</h1>
          <p className="text-muted-foreground">
            {favorites.length > 0 
              ? `You have ${favorites.length} universities in your favorites`
              : "No favorite universities yet"
            }
          </p>
        </div>
      </div>

      {favorites.length === 0 ? (
        <Card className="glass-card">
          <CardContent className="p-12 text-center">
            <Heart className="w-16 h-16 text-muted-foreground mx-auto mb-4" />
            <h3 className="text-xl font-semibold mb-2">No Favorites Yet</h3>
            <p className="text-muted-foreground mb-6">
              Start exploring universities and add them to your favorites to track them here.
            </p>
            <Button asChild>
              <a href="/universities">Browse Universities</a>
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-6">
          {favorites.map((university) => {
            const lowestTuition = getLowestTuition(university.courses);
            
            return (
              <Card key={university.id} className="glass-card hover:shadow-hover transition-all">
                <CardHeader className="pb-4">
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-3 mb-2">
                        <CardTitle className="text-xl">{university.name}</CardTitle>
                        {university.is_tie_up && (
                          <Badge className="bg-green-100 text-green-800">Partner</Badge>
                        )}
                        {university.ranking && (
                          <Badge variant="outline">#{university.ranking}</Badge>
                        )}
                      </div>
                      
                      <div className="flex items-center gap-4 text-sm text-muted-foreground">
                        <div className="flex items-center gap-1">
                          <MapPin className="w-4 h-4" />
                          <span>{university.city}, {university.country}</span>
                        </div>
                        
                        {university.established_year && (
                          <div className="flex items-center gap-1">
                            <Calendar className="w-4 h-4" />
                            <span>Est. {university.established_year}</span>
                          </div>
                        )}

                        {university.university_type && (
                          <div className="flex items-center gap-1">
                            <Globe className="w-4 h-4" />
                            <span>{university.university_type}</span>
                          </div>
                        )}
                      </div>
                    </div>

                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => removeFavorite(university.id)}
                      className="text-red-600 hover:text-red-700 hover:bg-red-50"
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                </CardHeader>

                <CardContent>
                  {university.description && (
                    <p className="text-muted-foreground mb-4 text-sm line-clamp-2">
                      {university.description}
                    </p>
                  )}

                  <div className="grid gap-4 md:grid-cols-2 mb-4">
                    <div>
                      <h4 className="font-medium mb-2">Available Programs ({university.courses.length})</h4>
                      <div className="space-y-1">
                        {university.courses.slice(0, 3).map((course) => (
                          <div key={course.id} className="text-sm">
                            <div className="flex items-center justify-between">
                              <span className="text-foreground">{course.name}</span>
                              <span className="text-muted-foreground">
                                ${course.tuition_fee_usd?.toLocaleString()}
                              </span>
                            </div>
                            <div className="text-xs text-muted-foreground">
                              {course.degree_type} • {course.duration_months} months
                            </div>
                          </div>
                        ))}
                        
                        {university.courses.length > 3 && (
                          <p className="text-xs text-muted-foreground">
                            +{university.courses.length - 3} more programs
                          </p>
                        )}
                      </div>
                    </div>

                    <div>
                      <h4 className="font-medium mb-2">Quick Info</h4>
                      <div className="space-y-2 text-sm">
                        {lowestTuition && (
                          <div className="flex items-center gap-2">
                            <DollarSign className="w-4 h-4 text-muted-foreground" />
                            <span>From ${lowestTuition.toLocaleString()}/year</span>
                          </div>
                        )}
                        
                        <div className="text-xs text-muted-foreground">
                          Added to favorites {new Date(university.favorited_at).toLocaleDateString()}
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="flex gap-2">
                    <Button size="sm" asChild>
                      <a href={`/universities?search=${encodeURIComponent(university.name)}`}>
                        <ExternalLink className="w-4 h-4 mr-2" />
                        View Details
                      </a>
                    </Button>
                    
                    {university.website_url && (
                      <Button variant="outline" size="sm" asChild>
                        <a href={university.website_url} target="_blank" rel="noopener noreferrer">
                          <Globe className="w-4 h-4 mr-2" />
                          Website
                        </a>
                      </Button>
                    )}
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