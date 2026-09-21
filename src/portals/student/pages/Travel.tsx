import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@student/integrations/supabase/client';
import { Button } from '@student/components/ui/button';
import { Card, CardContent } from '@student/components/ui/card';
import { Badge } from '@student/components/ui/badge';
import { Phone, MessageCircle, MapPin, Calendar, CheckCircle2, Star, Image as ImageIcon } from 'lucide-react';
import * as Icons from 'lucide-react';
import SEOHead from '@student/components/SEOHead';
import { motion } from 'framer-motion';
import EnhancedBookingModal from '@student/components/travel/EnhancedBookingModal';
import PackageFilters from '@student/components/travel/PackageFilters';
import ImageGallery from '@student/components/travel/ImageGallery';
import TrustBadges from '@student/components/travel/TrustBadges';
import NewsletterSubscription from '@student/components/travel/NewsletterSubscription';
import PackageComparison from '@student/components/travel/PackageComparison';
import TravelHeroCarousel from '@student/components/travel/TravelHeroCarousel';
import AirplaneAnimation from '@student/components/travel/AirplaneAnimation';
import AnimatedTravelCategories from '@student/components/travel/AnimatedTravelCategories';
import ThomasCookPackages from '@student/components/travel/ThomasCookPackages';

interface TravelService {
  id: string;
  title: string;
  subtitle: string | null;
  icon_name: string | null;
  display_order: number;
}

interface TravelOffer {
  id: string;
  title: string;
  description: string | null;
  offer_type: string;
  image_url: string | null;
  discount_text: string | null;
  price_text: string | null;
}

interface TravelNews {
  id: string;
  title: string;
  content: string | null;
}

interface TravelPackage {
  id: string;
  package_name: string;
  destination: string;
  duration_days: number;
  duration_nights: number;
  price_per_person: number;
  currency: string;
  description: string | null;
  inclusions: string[];
  images: string[];
  is_featured: boolean;
  difficulty_level: string;
  best_season: string | null;
  max_travelers?: number;
}

export default function Travel() {
  const [showBookingModal, setShowBookingModal] = useState(false);
  const [selectedPackage, setSelectedPackage] = useState<TravelPackage | null>(null);
  const [selectedPackageForDetails, setSelectedPackageForDetails] = useState<TravelPackage | null>(null);
  const [showImageGallery, setShowImageGallery] = useState(false);
  const [showComparison, setShowComparison] = useState(false);
  
  const [filters, setFilters] = useState({
    search: '',
    destination: 'all',
    minPrice: 0,
    maxPrice: 10000,
    duration: 'all',
    difficulty: 'all',
  });
  
  const { data: services } = useQuery({
    queryKey: ['travel-services-public'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('travel_services')
        .select('*')
        .eq('is_active', true)
        .order('display_order');
      if (error) throw error;
      return data as TravelService[];
    },
  });

  const { data: offers } = useQuery({
    queryKey: ['travel-offers-public'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('travel_offers')
        .select('*')
        .eq('is_active', true)
        .order('display_order')
        .limit(6);
      if (error) throw error;
      return data as TravelOffer[];
    },
  });

  const { data: newsItems } = useQuery({
    queryKey: ['travel-news-public'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('travel_news')
        .select('*')
        .eq('is_active', true)
        .order('publish_date', { ascending: false })
        .limit(10);
      if (error) throw error;
      return data as TravelNews[];
    },
  });

  const { data: allPackages } = useQuery({
    queryKey: ['travel-packages-public'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('travel_packages')
        .select('*')
        .eq('is_active', true)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data as TravelPackage[];
    },
  });

  const filteredPackages = useMemo(() => {
    if (!allPackages) return [];
    return allPackages.filter((pkg) => {
      const matchesSearch = pkg.package_name.toLowerCase().includes(filters.search.toLowerCase()) ||
                           pkg.destination.toLowerCase().includes(filters.search.toLowerCase());
      const matchesDestination = filters.destination === 'all' || pkg.destination === filters.destination;
      const matchesPrice = pkg.price_per_person >= filters.minPrice && pkg.price_per_person <= filters.maxPrice;
      const matchesDuration = filters.duration === 'all' ||
                             (filters.duration === 'short' && pkg.duration_days <= 4) ||
                             (filters.duration === 'medium' && pkg.duration_days > 4 && pkg.duration_days <= 7) ||
                             (filters.duration === 'long' && pkg.duration_days > 7);
      const matchesDifficulty = filters.difficulty === 'all' || pkg.difficulty_level === filters.difficulty;
      return matchesSearch && matchesDestination && matchesPrice && matchesDuration && matchesDifficulty;
    });
  }, [allPackages, filters]);

  const handlePackageSelect = (pkg: TravelPackage) => {
    setSelectedPackage(pkg);
    setShowBookingModal(true);
  };

  const handleViewDetails = (pkg: TravelPackage) => {
    setSelectedPackageForDetails(pkg);
    setShowImageGallery(true);
  };

  const handleResetFilters = () => {
    setFilters({
      search: '',
      destination: 'all',
      minPrice: 0,
      maxPrice: 10000,
      duration: 'all',
      difficulty: 'all',
    });
  };

  return (
    <div className="min-h-screen bg-gradient-background">
      <SEOHead 
        title="Travel with Fly Masters - Curated Holiday Packages & Tours"
        description="Discover amazing travel packages, holiday deals, and tour packages with Fly Masters. Book your dream vacation today with exclusive offers."
        keywords="travel packages, holiday deals, tour packages, vacation bookings, travel agency"
      />
      
      {newsItems && newsItems.length > 0 && (
        <div className="bg-gradient-primary text-primary-foreground py-3 overflow-hidden">
          <div className="scroll-container flex items-center gap-8">
            {[...newsItems, ...newsItems].map((news, index) => (
              <div key={`${news.id}-${index}`} className="flex items-center gap-2 whitespace-nowrap">
                <span className="text-sm font-medium">{news.title}</span>
                <span className="opacity-60">•</span>
              </div>
            ))}
          </div>
        </div>
      )}

      <section className="relative pt-24 pb-12 overflow-hidden">
        <div className="container mx-auto px-4 relative z-10">
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="text-center mb-12">
            <h1 className="text-5xl md:text-7xl font-bold mb-6 bg-gradient-primary bg-clip-text text-transparent">
              Fly Masters Travels
            </h1>
            <p className="text-xl md:text-2xl text-muted-foreground max-w-3xl mx-auto mb-8">
              Your Gateway to Extraordinary Journeys
            </p>
          </motion.div>
          <TravelHeroCarousel />
        </div>
        <AirplaneAnimation />
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          <motion.div className="absolute top-20 left-10 w-72 h-72 bg-primary/10 rounded-full blur-3xl"
            animate={{ scale: [1, 1.2, 1], opacity: [0.3, 0.5, 0.3] }}
            transition={{ duration: 8, repeat: Infinity }} />
          <motion.div className="absolute bottom-20 right-10 w-96 h-96 bg-accent-cyan/10 rounded-full blur-3xl"
            animate={{ scale: [1.2, 1, 1.2], opacity: [0.5, 0.3, 0.5] }}
            transition={{ duration: 10, repeat: Infinity }} />
        </div>
      </section>

      <section className="py-20 relative">
        <div className="container mx-auto px-4">
          <motion.div initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} className="text-center mb-16">
            <h2 className="text-4xl md:text-5xl font-bold mb-4 bg-gradient-primary bg-clip-text text-transparent">
              Explore Your Perfect Journey
            </h2>
            <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
              From serene beaches to sacred temples, thrilling adventures to professional corporate travel
            </p>
          </motion.div>
          <AnimatedTravelCategories />
        </div>
      </section>

      <section className="py-20 relative bg-muted/20">
        <div className="container mx-auto px-4">
          <motion.h2 initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }}
            className="text-4xl md:text-5xl font-bold text-center mb-16 text-foreground">
            Our Travel Services
          </motion.h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8 mb-16">
            {services?.map((service, index) => {
              const Icon = service.icon_name ? Icons[service.icon_name as keyof typeof Icons] as React.ComponentType<{ className?: string }> : null;
              return (
                <motion.div key={service.id} initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }} transition={{ delay: index * 0.1 }}>
                  <Card className="h-full hover:shadow-hover transition-all duration-300 border-border/50 backdrop-blur-sm bg-card/80 group">
                    <CardContent className="p-8 text-center">
                      {Icon && (
                        <motion.div className="w-20 h-20 mx-auto mb-6 rounded-full bg-gradient-primary flex items-center justify-center"
                          whileHover={{ scale: 1.1, rotate: 360 }} transition={{ duration: 0.5 }}>
                          <Icon className="w-10 h-10 text-primary-foreground" />
                        </motion.div>
                      )}
                      <h3 className="text-2xl font-bold mb-3 text-foreground group-hover:text-primary transition-colors">
                        {service.title}
                      </h3>
                      {service.subtitle && <p className="text-muted-foreground leading-relaxed">{service.subtitle}</p>}
                    </CardContent>
                  </Card>
                </motion.div>
              );
            })}
          </div>
          <TrustBadges />
        </div>
      </section>

      <section className="py-20 bg-gradient-to-b from-background to-muted/20">
        <div className="container mx-auto px-4">
          <motion.h2 
            initial={{ opacity: 0, y: 20 }} 
            whileInView={{ opacity: 1, y: 0 }} 
            viewport={{ once: true }}
            className="text-4xl md:text-5xl font-bold text-center mb-6 bg-gradient-primary bg-clip-text text-transparent">
            Explore Our Travel Packages
          </motion.h2>
          <motion.p 
            initial={{ opacity: 0, y: 20 }} 
            whileInView={{ opacity: 1, y: 0 }} 
            viewport={{ once: true }}
            transition={{ delay: 0.1 }} 
            className="text-center text-muted-foreground mb-12 max-w-2xl mx-auto text-lg">
            Discover handpicked destinations and experiences tailored for every traveler
          </motion.p>
          
          <ThomasCookPackages />
        </div>
      </section>

      {offers && offers.length > 0 && (
        <section className="py-20 bg-muted/20 relative overflow-hidden">
          <div className="container mx-auto px-4 relative z-10">
            <motion.h2 initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }}
              className="text-4xl md:text-5xl font-bold text-center mb-16 text-foreground">Special Offers & Deals</motion.h2>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
              {offers.map((offer, index) => (
                <motion.div key={offer.id} initial={{ opacity: 0, scale: 0.9 }} whileInView={{ opacity: 1, scale: 1 }}
                  viewport={{ once: true }} transition={{ delay: index * 0.1 }}>
                  <Card className="overflow-hidden hover:shadow-hover transition-all duration-300 border-border/50 backdrop-blur-sm bg-card/80 h-full group">
                    {offer.image_url && (
                      <div className="relative overflow-hidden">
                        <img src={offer.image_url} alt={offer.title}
                          className="w-full h-48 object-cover group-hover:scale-110 transition-transform duration-500" />
                        {offer.discount_text && (
                          <div className="absolute top-4 right-4 bg-gradient-primary text-primary-foreground px-4 py-2 rounded-full font-bold text-lg shadow-xl">
                            {offer.discount_text}
                          </div>
                        )}
                      </div>
                    )}
                    <CardContent className="p-6">
                      <Badge className="mb-3 bg-gradient-primary text-primary-foreground border-0">{offer.offer_type}</Badge>
                      <h3 className="text-2xl font-bold mb-3 text-foreground group-hover:text-primary transition-colors">{offer.title}</h3>
                      {offer.description && <p className="text-muted-foreground mb-4 line-clamp-3">{offer.description}</p>}
                      {offer.price_text && <div className="text-3xl font-bold text-primary mb-4">{offer.price_text}</div>}
                      <Button className="w-full bg-gradient-primary hover:shadow-hover transition-all">Grab This Offer</Button>
                    </CardContent>
                  </Card>
                </motion.div>
              ))}
            </div>
          </div>
        </section>
      )}

      <NewsletterSubscription />

      <section className="py-20 relative overflow-hidden">
        <div className="container mx-auto px-4 text-center relative z-10">
          <motion.h2 initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }}
            className="text-4xl md:text-5xl font-bold mb-8 bg-gradient-primary bg-clip-text text-transparent">Get in Touch</motion.h2>
          <motion.p initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ delay: 0.1 }}
            className="text-xl text-muted-foreground mb-12 max-w-2xl mx-auto">
            Our travel experts are here to help you plan your perfect journey
          </motion.p>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8 max-w-4xl mx-auto">
            {[
              { icon: Phone, title: 'Call Us', link: 'tel:9259597979', text: '92595 97979', color: 'text-primary' },
              { icon: MessageCircle, title: 'WhatsApp', link: 'https://wa.me/919502127788', text: '95021 27788', color: 'text-success' },
              { icon: MapPin, title: 'Visit Us', text: 'Fly Masters Travels\nHyderabad, India', color: 'text-primary' }
            ].map((contact, idx) => (
              <motion.div key={contact.title} initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }} transition={{ delay: 0.2 + idx * 0.1 }}>
                <Card className="p-8 hover:shadow-hover transition-all duration-300 border-border/50 backdrop-blur-sm bg-card/80 group">
                  <motion.div whileHover={{ scale: 1.1, rotate: 360 }} transition={{ duration: 0.5 }}>
                    <contact.icon className={`w-12 h-12 mx-auto mb-4 ${contact.color}`} />
                  </motion.div>
                  <h3 className="font-bold text-xl mb-2 text-foreground">{contact.title}</h3>
                  {contact.link ? (
                    <a href={contact.link} {...(contact.link.startsWith('http') && { target: '_blank', rel: 'noopener noreferrer' })}
                      className={`${contact.color} hover:opacity-80 transition-opacity text-lg font-semibold`}>
                      {contact.text}
                    </a>
                  ) : (
                    <p className="text-muted-foreground whitespace-pre-line">{contact.text}</p>
                  )}
                </Card>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      <EnhancedBookingModal 
        open={showBookingModal}
        onOpenChange={setShowBookingModal}
        selectedPackage={selectedPackage} 
      />

      {selectedPackageForDetails && (
        <ImageGallery images={selectedPackageForDetails.images || []}
          packageName={selectedPackageForDetails.package_name} />
      )}

      <PackageComparison 
        open={showComparison} 
        onOpenChange={setShowComparison} 
        packages={filteredPackages} 
      />

      <style>{`
        @keyframes scroll {
          0% { transform: translateX(0); }
          100% { transform: translateX(-50%); }
        }
        .scroll-container { animation: scroll 30s linear infinite; }
      `}</style>
    </div>
  );
}
