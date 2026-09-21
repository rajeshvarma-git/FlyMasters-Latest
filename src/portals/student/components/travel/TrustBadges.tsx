import { Card } from '@student/components/ui/card';
import { Shield, Award, Users, Clock } from 'lucide-react';

export default function TrustBadges() {
  const badges = [
    {
      icon: Shield,
      title: 'Secure Booking',
      description: '100% secure payment processing',
    },
    {
      icon: Award,
      title: 'Best Price Guarantee',
      description: 'We match any lower price',
    },
    {
      icon: Users,
      title: '10,000+ Happy Travelers',
      description: 'Join our satisfied customers',
    },
    {
      icon: Clock,
      title: '24/7 Support',
      description: 'Round-the-clock assistance',
    },
  ];

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
      {badges.map((badge, index) => (
        <Card key={index} className="p-6 text-center hover:shadow-lg transition-shadow">
          <badge.icon className="w-10 h-10 mx-auto mb-3 text-primary" />
          <h4 className="font-semibold mb-1">{badge.title}</h4>
          <p className="text-sm text-muted-foreground">{badge.description}</p>
        </Card>
      ))}
    </div>
  );
}
