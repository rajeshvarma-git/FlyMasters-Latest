import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@student/integrations/supabase/client';
import { Card, CardContent } from '@student/components/ui/card';
import { Badge } from '@student/components/ui/badge';
import { Button } from '@student/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@student/components/ui/tabs';
import { MapPin, Calendar, Users, Star, Heart } from 'lucide-react';
import { motion } from 'framer-motion';
import { toast } from 'sonner';

interface Package {
  id: string;
  package_name: string;
  destination: string;
  duration_days: number;
  price_per_person: number;
  discount_percentage?: number;
  images?: string[];
  inclusions?: string[];
  rating?: number;
  reviews_count?: number;
  category?: string;
}

export default function ThomasCookPackages() {
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [wishlisted, setWishlisted] = useState<Set<string>>(new Set());

  const { data: packages, isLoading } = useQuery({
    queryKey: ['thomas-cook-packages'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('travel_packages')
        .select('*')
        .eq('is_active', true)
        .order('created_at', { ascending: false });
      
      if (error) throw error;
      return data as Package[];
    },
  });

  const categories = [
    { value: 'all', label: 'All Packages' },
    { value: 'beaches', label: 'Beaches' },
    { value: 'temples', label: 'Temples' },
    { value: 'adventure', label: 'Adventure' },
    { value: 'corporate', label: 'Corporate Travel' },
    { value: 'honeymoon', label: 'Honeymoon' },
    { value: 'family', label: 'Family Tours' },
  ];

  const filteredPackages = selectedCategory === 'all' 
    ? packages 
    : packages?.filter(pkg => pkg.category?.toLowerCase() === selectedCategory);

  const toggleWishlist = (pkgId: string) => {
    setWishlisted(prev => {
      const newSet = new Set(prev);
      if (newSet.has(pkgId)) {
        newSet.delete(pkgId);
        toast.success('Removed from wishlist');
      } else {
        newSet.add(pkgId);
        toast.success('Added to wishlist');
      }
      return newSet;
    });
  };

  const calculateDiscountedPrice = (price: number, discount?: number) => {
    if (!discount) return price;
    return price - (price * discount / 100);
  };

  if (isLoading) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {[1, 2, 3, 4, 5, 6].map(i => (
          <Card key={i} className="animate-pulse">
            <div className="h-64 bg-muted" />
            <CardContent className="p-4">
              <div className="h-4 bg-muted rounded mb-2" />
              <div className="h-4 bg-muted rounded w-2/3" />
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* Category Tabs */}
      <Tabs value={selectedCategory} onValueChange={setSelectedCategory} className="w-full">
        <TabsList className="w-full justify-start overflow-x-auto flex-wrap h-auto gap-2 bg-background/50 backdrop-blur-sm p-2">
          {categories.map(cat => (
            <TabsTrigger 
              key={cat.value} 
              value={cat.value}
              className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground"
            >
              {cat.label}
            </TabsTrigger>
          ))}
        </TabsList>

        <TabsContent value={selectedCategory} className="mt-8">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {filteredPackages?.map((pkg, index) => (
              <motion.div
                key={pkg.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.1 }}
              >
                <Card className="group overflow-hidden hover:shadow-xl transition-all duration-300 border-border/50">
                  {/* Image Section */}
                  <div className="relative h-64 overflow-hidden">
                    <img 
                      src={pkg.images?.[0] || '/placeholder.svg'} 
                      alt={pkg.package_name}
                      className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500"
                    />
                    
                    {/* Wishlist Button */}
                    <button
                      onClick={() => toggleWishlist(pkg.id)}
                      className="absolute top-4 right-4 w-10 h-10 bg-white/90 backdrop-blur-sm rounded-full flex items-center justify-center hover:bg-white transition-colors"
                    >
                      <Heart 
                        className={`w-5 h-5 transition-colors ${
                          wishlisted.has(pkg.id) 
                            ? 'fill-red-500 text-red-500' 
                            : 'text-gray-600'
                        }`}
                      />
                    </button>

                    {/* Discount Badge */}
                    {pkg.discount_percentage && pkg.discount_percentage > 0 && (
                      <Badge className="absolute top-4 left-4 bg-red-500 text-white">
                        {pkg.discount_percentage}% OFF
                      </Badge>
                    )}

                    {/* Category Badge */}
                    {pkg.category && (
                      <Badge className="absolute bottom-4 left-4 bg-white/90 text-foreground backdrop-blur-sm">
                        {pkg.category}
                      </Badge>
                    )}
                  </div>

                  {/* Content Section */}
                  <CardContent className="p-6 space-y-4">
                    {/* Title & Rating */}
                    <div>
                      <h3 className="text-xl font-bold text-foreground mb-2 line-clamp-2 group-hover:text-primary transition-colors">
                        {pkg.package_name}
                      </h3>
                      {pkg.rating && (
                        <div className="flex items-center gap-2 text-sm text-muted-foreground">
                          <div className="flex items-center gap-1">
                            <Star className="w-4 h-4 fill-yellow-400 text-yellow-400" />
                            <span className="font-medium">{pkg.rating}</span>
                          </div>
                          {pkg.reviews_count && (
                            <span>({pkg.reviews_count} reviews)</span>
                          )}
                        </div>
                      )}
                    </div>

                    {/* Details */}
                    <div className="space-y-2">
                      <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        <MapPin className="w-4 h-4" />
                        <span>{pkg.destination}</span>
                      </div>
                      <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        <Calendar className="w-4 h-4" />
                        <span>{pkg.duration_days} Days / {pkg.duration_days - 1} Nights</span>
                      </div>
                    </div>

                    {/* Inclusions Preview */}
                    {pkg.inclusions && pkg.inclusions.length > 0 && (
                      <div className="flex flex-wrap gap-2">
                        {pkg.inclusions.slice(0, 3).map((item, i) => (
                          <Badge key={i} variant="outline" className="text-xs">
                            {item}
                          </Badge>
                        ))}
                        {pkg.inclusions.length > 3 && (
                          <Badge variant="outline" className="text-xs">
                            +{pkg.inclusions.length - 3} more
                          </Badge>
                        )}
                      </div>
                    )}

                    {/* Price & CTA */}
                    <div className="pt-4 border-t border-border/50">
                      <div className="flex items-end justify-between">
                        <div>
                          <p className="text-xs text-muted-foreground mb-1">Starting from</p>
                          <div className="flex items-baseline gap-2">
                            {pkg.discount_percentage && pkg.discount_percentage > 0 ? (
                              <>
                                <span className="text-2xl font-bold text-primary">
                                  ₹{calculateDiscountedPrice(pkg.price_per_person, pkg.discount_percentage).toLocaleString()}
                                </span>
                                <span className="text-sm text-muted-foreground line-through">
                                  ₹{pkg.price_per_person.toLocaleString()}
                                </span>
                              </>
                            ) : (
                              <span className="text-2xl font-bold text-primary">
                                ₹{pkg.price_per_person.toLocaleString()}
                              </span>
                            )}
                          </div>
                          <p className="text-xs text-muted-foreground">per person</p>
                        </div>
                        <Button size="sm" className="bg-primary hover:bg-primary/90">
                          View Details
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </motion.div>
            ))}
          </div>

          {/* No Results */}
          {filteredPackages?.length === 0 && (
            <div className="text-center py-16">
              <p className="text-muted-foreground text-lg">
                No packages found in this category
              </p>
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}