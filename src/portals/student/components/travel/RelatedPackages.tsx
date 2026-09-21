import { useQuery } from '@tanstack/react-query';
import { supabase } from '@student/integrations/supabase/client';
import { Card } from '@student/components/ui/card';
import { Button } from '@student/components/ui/button';
import { Badge } from '@student/components/ui/badge';
import { MapPin, Calendar, Users } from 'lucide-react';
import { useOptimizedImage } from '@student/hooks/useOptimizedImage';

interface RelatedPackagesProps {
  currentPackageId: string;
  destination?: string;
  limit?: number;
}

export default function RelatedPackages({ currentPackageId, destination, limit = 3 }: RelatedPackagesProps) {
  const { data: packages } = useQuery({
    queryKey: ['related-packages', currentPackageId, destination],
    queryFn: async () => {
      let query = supabase
        .from('travel_packages')
        .select('*')
        .eq('is_active', true)
        .neq('id', currentPackageId)
        .limit(limit);

      if (destination) {
        query = query.ilike('destination', `%${destination}%`);
      }

      const { data, error } = await query;
      if (error) throw error;
      return data;
    },
  });

  if (!packages || packages.length === 0) return null;

  return (
    <div className="space-y-4">
      <h3 className="text-2xl font-bold">You Might Also Like</h3>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {packages.map((pkg) => (
          <RelatedPackageCard key={pkg.id} package={pkg} />
        ))}
      </div>
    </div>
  );
}

function RelatedPackageCard({ package: pkg }: { package: any }) {
  const { src: imageSrc, isLoading } = useOptimizedImage({
    src: pkg.images?.[0] || '',
    useThumbnail: true,
  });

  return (
    <Card className="overflow-hidden hover:shadow-lg transition-shadow">
      <div className="relative h-48">
        {isLoading ? (
          <div className="w-full h-full bg-muted animate-pulse" />
        ) : (
          <img
            src={imageSrc}
            alt={pkg.package_name}
            className="w-full h-full object-cover"
          />
        )}
        {pkg.is_featured && (
          <Badge className="absolute top-2 right-2">Featured</Badge>
        )}
      </div>

      <div className="p-4 space-y-3">
        <h4 className="font-semibold text-lg">{pkg.package_name}</h4>

        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <MapPin className="w-4 h-4" />
          {pkg.destination}
        </div>

        <div className="flex items-center justify-between text-sm">
          <div className="flex items-center gap-2">
            <Calendar className="w-4 h-4" />
            {pkg.duration_days} days
          </div>
          <div className="flex items-center gap-2">
            <Users className="w-4 h-4" />
            Up to {pkg.max_travelers}
          </div>
        </div>

        <div className="flex items-center justify-between pt-3 border-t">
          <div>
            <span className="text-2xl font-bold text-primary">
              ${pkg.price_per_person}
            </span>
            <span className="text-sm text-muted-foreground">/person</span>
          </div>
          <Button size="sm">View Details</Button>
        </div>
      </div>
    </Card>
  );
}
