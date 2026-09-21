import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@student/integrations/supabase/client';
import { Button } from '@student/components/ui/button';
import { Heart } from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '@student/hooks/useAuth';

interface PackageWishlistProps {
  packageId: string;
}

export default function PackageWishlist({ packageId }: PackageWishlistProps) {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const { data: isInWishlist } = useQuery({
    queryKey: ['wishlist', packageId, user?.id],
    queryFn: async () => {
      if (!user) return false;
      
      const { data } = await supabase
        .from('package_wishlists')
        .select('id')
        .eq('package_id', packageId)
        .eq('user_id', user.id)
        .single();
      
      return !!data;
    },
    enabled: !!user,
  });

  const toggleWishlist = useMutation({
    mutationFn: async () => {
      if (!user) {
        toast.error('Please login to add to wishlist');
        return;
      }

      if (isInWishlist) {
        const { error } = await supabase
          .from('package_wishlists')
          .delete()
          .eq('package_id', packageId)
          .eq('user_id', user.id);
        
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('package_wishlists')
          .insert({
            package_id: packageId,
            user_id: user.id,
          });
        
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['wishlist', packageId, user?.id] });
      toast.success(isInWishlist ? 'Removed from wishlist' : 'Added to wishlist');
    },
    onError: () => {
      toast.error('Failed to update wishlist');
    },
  });

  return (
    <Button
      variant={isInWishlist ? "default" : "outline"}
      size="icon"
      onClick={() => toggleWishlist.mutate()}
      className="gap-2"
    >
      <Heart className={`w-5 h-5 ${isInWishlist ? 'fill-current' : ''}`} />
    </Button>
  );
}
