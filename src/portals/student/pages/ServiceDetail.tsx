import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import { Card, CardContent } from '@student/components/ui/card';
import { Button } from '@student/components/ui/button';
import { Badge } from '@student/components/ui/badge';
import {
  GraduationCap,
  FileText,
  Award,
  BookOpen,
  Users,
  Send,
  Check,
  ArrowLeft,
  ArrowRight,
  MessageCircle,
} from 'lucide-react';
import { supabase } from '@student/integrations/supabase/client';
import Header from '@student/components/Header';
import { SERVICE_DETAILS, slugifyService } from '@student/lib/serviceDetails';

const iconMap = {
  GraduationCap,
  FileText,
  Award,
  BookOpen,
  Users,
  Send,
};

interface ServiceOffering {
  id: string;
  service_name: string;
  description: string;
  icon_name: string | null;
  features: string[] | null;
  is_popular: boolean | null;
}

const ServiceDetail = () => {
  const { slug } = useParams();
  const [service, setService] = useState<ServiceOffering | null>(null);
  const [loading, setLoading] = useState(true);

  const details = slug ? SERVICE_DETAILS[slug] : undefined;

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      const { data } = await supabase
        .from('service_offerings')
        .select('id, service_name, description, icon_name, features, is_popular')
        .eq('is_active', true);

      const match = (data || []).find((row) => slugifyService(row.service_name) === slug) || null;
      setService(match);
      setLoading(false);
    };

    if (slug) load();
  }, [slug]);

  const Icon = useMemo(() => {
    const key = (service?.icon_name || 'GraduationCap') as keyof typeof iconMap;
    return iconMap[key] || GraduationCap;
  }, [service]);

  if (loading) {
    return (
      <>
        <Header />
        <div className="min-h-screen pt-24 flex items-center justify-center">
          <div className="h-8 w-8 animate-spin rounded-full border-b-2 border-primary" />
        </div>
      </>
    );
  }

  if (!service) {
    return (
      <>
        <Header />
        <div className="min-h-screen pt-24 px-4 flex items-center justify-center">
          <Card className="max-w-md">
            <CardContent className="p-8 text-center space-y-4">
              <h1 className="text-2xl font-bold">Service not found</h1>
              <p className="text-muted-foreground">This service is not available right now.</p>
              <Button asChild>
                <Link to="/">Back to Home</Link>
              </Button>
            </CardContent>
          </Card>
        </div>
      </>
    );
  }

  const features = service.features || [];

  return (
    <>
      <Helmet>
        <title>{service.service_name} | Fly Masters</title>
        <meta name="description" content={details?.longDescription || service.description} />
      </Helmet>
      <Header />

      <div className="min-h-screen pt-24 pb-16 bg-gradient-to-br from-background via-background to-primary/5">
        <div className="container mx-auto px-4 md:px-6 max-w-4xl">
          <Button variant="ghost" className="mb-6 -ml-2" asChild>
            <Link to="/">
              <ArrowLeft className="w-4 h-4 mr-2" />
              Back to services
            </Link>
          </Button>

          <div className="flex items-start gap-4 mb-8">
            <div className="w-16 h-16 rounded-2xl bg-gradient-primary/10 flex items-center justify-center flex-shrink-0">
              <Icon className="w-8 h-8 text-primary" />
            </div>
            <div>
              <div className="flex items-center gap-2 mb-2">
                <h1 className="text-3xl md:text-4xl font-bold">{service.service_name}</h1>
                {service.is_popular && <Badge className="bg-gradient-primary text-white">Popular</Badge>}
              </div>
              <p className="text-lg text-muted-foreground">{service.description}</p>
            </div>
          </div>

          <Card className="mb-8">
            <CardContent className="p-6 md:p-8 space-y-4">
              <h2 className="text-xl font-semibold">{details?.headline || 'How Fly Masters helps'}</h2>
              <p className="text-muted-foreground leading-relaxed">
                {details?.longDescription || service.description}
              </p>
            </CardContent>
          </Card>

          <div className="grid md:grid-cols-2 gap-6 mb-8">
            <Card>
              <CardContent className="p-6 space-y-3">
                <h2 className="text-lg font-semibold">What is included</h2>
                {features.map((feature) => (
                  <div key={feature} className="flex items-start gap-2">
                    <Check className="w-4 h-4 text-primary mt-1 flex-shrink-0" />
                    <span>{feature}</span>
                  </div>
                ))}
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-6 space-y-3">
                <h2 className="text-lg font-semibold">Who this is for</h2>
                {(details?.whoItsFor || ['Students planning to study abroad with Fly Masters.']).map((item) => (
                  <div key={item} className="flex items-start gap-2">
                    <Check className="w-4 h-4 text-primary mt-1 flex-shrink-0" />
                    <span>{item}</span>
                  </div>
                ))}
              </CardContent>
            </Card>
          </div>

          {details?.howItWorks && (
            <div className="mb-10">
              <h2 className="text-2xl font-bold mb-4">How it works</h2>
              <div className="grid md:grid-cols-3 gap-4">
                {details.howItWorks.map((item) => (
                  <Card key={item.step}>
                    <CardContent className="p-6 space-y-2">
                      <div className="w-8 h-8 rounded-full bg-primary text-primary-foreground flex items-center justify-center font-bold">
                        {item.step}
                      </div>
                      <h3 className="font-semibold">{item.title}</h3>
                      <p className="text-sm text-muted-foreground">{item.text}</p>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>
          )}

          <Card className="bg-gradient-primary/10 border-primary/20">
            <CardContent className="p-8 flex flex-col sm:flex-row items-center justify-between gap-4">
              <div>
                <h2 className="text-xl font-bold mb-1">Ready to start?</h2>
                <p className="text-muted-foreground">Talk to our AI advisor or a counselor about {service.service_name.toLowerCase()}.</p>
              </div>
              <div className="flex flex-col sm:flex-row gap-3">
                <Button asChild>
                  <Link to={details?.ctaPath || '/chat'}>
                    {details?.ctaLabel || 'Get Started'}
                    <ArrowRight className="w-4 h-4 ml-2" />
                  </Link>
                </Button>
                <Button variant="outline" asChild>
                  <Link to="/chat">
                    <MessageCircle className="w-4 h-4 mr-2" />
                    Start AI Chat
                  </Link>
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </>
  );
};

export default ServiceDetail;
