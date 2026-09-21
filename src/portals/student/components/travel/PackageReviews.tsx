import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@student/integrations/supabase/client';
import { Card } from '@student/components/ui/card';
import { Button } from '@student/components/ui/button';
import { Textarea } from '@student/components/ui/textarea';
import { Avatar, AvatarFallback } from '@student/components/ui/avatar';
import { Star, ThumbsUp } from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '@student/hooks/useAuth';

interface PackageReviewsProps {
  packageId: string;
}

export default function PackageReviews({ packageId }: PackageReviewsProps) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [showReviewForm, setShowReviewForm] = useState(false);
  const [rating, setRating] = useState(5);
  const [reviewText, setReviewText] = useState('');

  const { data: reviews, isLoading } = useQuery({
    queryKey: ['package-reviews', packageId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('package_reviews')
        .select('*')
        .eq('package_id', packageId)
        .eq('is_approved', true)
        .order('created_at', { ascending: false });
      
      if (error) throw error;
      return data;
    },
  });

  const submitReview = useMutation({
    mutationFn: async () => {
      if (!user) {
        toast.error('Please login to submit a review');
        return;
      }

      const { error } = await supabase.from('package_reviews').insert({
        package_id: packageId,
        user_id: user.id,
        rating,
        review_text: reviewText,
        title: 'Review',
      });

      if (error) throw error;
    },
    onSuccess: () => {
      toast.success('Review submitted! It will be visible after approval.');
      setReviewText('');
      setRating(5);
      setShowReviewForm(false);
      queryClient.invalidateQueries({ queryKey: ['package-reviews', packageId] });
    },
    onError: () => {
      toast.error('Failed to submit review');
    },
  });

  const handleHelpful = useMutation({
    mutationFn: async (reviewId: string) => {
      const { data: review } = await supabase
        .from('package_reviews')
        .select('helpful_count')
        .eq('id', reviewId)
        .single();
      
      const { error } = await supabase
        .from('package_reviews')
        .update({ helpful_count: (review?.helpful_count || 0) + 1 })
        .eq('id', reviewId);
      
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['package-reviews', packageId] });
    },
  });

  const avgRating = reviews?.length 
    ? (reviews.reduce((sum, r) => sum + r.rating, 0) / reviews.length).toFixed(1)
    : '0.0';

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-2xl font-bold">Customer Reviews</h3>
          <div className="flex items-center gap-2 mt-2">
            <div className="flex">
              {[1, 2, 3, 4, 5].map((star) => (
                <Star
                  key={star}
                  className={`w-5 h-5 ${
                    star <= parseFloat(avgRating)
                      ? 'fill-yellow-400 text-yellow-400'
                      : 'text-gray-300'
                  }`}
                />
              ))}
            </div>
            <span className="text-lg font-semibold">{avgRating}</span>
            <span className="text-muted-foreground">({reviews?.length || 0} reviews)</span>
          </div>
        </div>
        <Button onClick={() => setShowReviewForm(!showReviewForm)}>
          Write a Review
        </Button>
      </div>

      {showReviewForm && (
        <Card className="p-6">
          <h4 className="font-semibold mb-4">Write Your Review</h4>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-2">Rating</label>
              <div className="flex gap-2">
                {[1, 2, 3, 4, 5].map((star) => (
                  <Star
                    key={star}
                    className={`w-8 h-8 cursor-pointer ${
                      star <= rating
                        ? 'fill-yellow-400 text-yellow-400'
                        : 'text-gray-300'
                    }`}
                    onClick={() => setRating(star)}
                  />
                ))}
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium mb-2">Your Review</label>
              <Textarea
                value={reviewText}
                onChange={(e) => setReviewText(e.target.value)}
                placeholder="Share your experience with this package..."
                rows={4}
              />
            </div>
            <div className="flex gap-2">
              <Button onClick={() => submitReview.mutate()} disabled={!reviewText.trim()}>
                Submit Review
              </Button>
              <Button variant="outline" onClick={() => setShowReviewForm(false)}>
                Cancel
              </Button>
            </div>
          </div>
        </Card>
      )}

      <div className="space-y-4">
        {isLoading ? (
          <p>Loading reviews...</p>
        ) : reviews?.length === 0 ? (
          <p className="text-muted-foreground">No reviews yet. Be the first to review!</p>
        ) : (
          reviews?.map((review) => (
            <Card key={review.id} className="p-6">
              <div className="flex items-start gap-4">
                <Avatar>
                  <AvatarFallback>U</AvatarFallback>
                </Avatar>
                <div className="flex-1">
                  <div className="flex items-center justify-between mb-2">
                    <div>
                      <p className="font-semibold">Traveler</p>
                      <div className="flex items-center gap-2">
                        <div className="flex">
                          {[1, 2, 3, 4, 5].map((star) => (
                            <Star
                              key={star}
                              className={`w-4 h-4 ${
                                star <= review.rating
                                  ? 'fill-yellow-400 text-yellow-400'
                                  : 'text-gray-300'
                              }`}
                            />
                          ))}
                        </div>
                        <span className="text-sm text-muted-foreground">
                          {new Date(review.created_at).toLocaleDateString()}
                        </span>
                      </div>
                    </div>
                  </div>
                  <p className="text-foreground mb-3">{review.review_text}</p>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleHelpful.mutate(review.id)}
                    className="gap-2"
                  >
                    <ThumbsUp className="w-4 h-4" />
                    Helpful ({review.helpful_count || 0})
                  </Button>
                </div>
              </div>
            </Card>
          ))
        )}
      </div>
    </div>
  );
}
