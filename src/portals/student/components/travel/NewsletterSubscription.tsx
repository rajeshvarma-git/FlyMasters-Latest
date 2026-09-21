import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { supabase } from '@student/integrations/supabase/client';
import { Card } from '@student/components/ui/card';
import { Input } from '@student/components/ui/input';
import { Button } from '@student/components/ui/button';
import { Mail } from 'lucide-react';
import { toast } from 'sonner';

export default function NewsletterSubscription() {
  const [email, setEmail] = useState('');

  const subscribe = useMutation({
    mutationFn: async (email: string) => {
      const { error } = await supabase
        .from('newsletter_subscriptions')
        .insert({ email, source: 'travel_page' });
      
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success('Successfully subscribed to our newsletter!');
      setEmail('');
    },
    onError: (error: any) => {
      if (error.code === '23505') {
        toast.error('This email is already subscribed!');
      } else {
        toast.error('Failed to subscribe. Please try again.');
      }
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (email && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      subscribe.mutate(email);
    } else {
      toast.error('Please enter a valid email address');
    }
  };

  return (
    <Card className="p-8 bg-gradient-to-r from-primary/10 to-blue-500/10">
      <div className="max-w-2xl mx-auto text-center">
        <Mail className="w-12 h-12 mx-auto mb-4 text-primary" />
        <h3 className="text-2xl font-bold mb-2">Subscribe to Our Newsletter</h3>
        <p className="text-muted-foreground mb-6">
          Get the latest travel deals, destination guides, and exclusive offers delivered to your inbox!
        </p>
        <form onSubmit={handleSubmit} className="flex gap-2">
          <Input
            type="email"
            placeholder="Enter your email address"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="flex-1"
          />
          <Button type="submit" disabled={subscribe.isPending}>
            {subscribe.isPending ? 'Subscribing...' : 'Subscribe'}
          </Button>
        </form>
      </div>
    </Card>
  );
}
