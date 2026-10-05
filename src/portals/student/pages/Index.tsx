import Header from "@student/components/Header";
import Enhanced3DHero from "@student/components/Enhanced3DHero";
import Features from "@student/components/Features";
import Enhanced3DFeatures from "@student/components/Enhanced3DFeatures";
import ServicesSection from "@student/components/ServicesSection";
import StatsSection from "@student/components/StatsSection";
import TestimonialsSection from "@student/components/TestimonialsSection";
import VideoTestimonialsSection from "@student/components/VideoTestimonialsSection";
import YouTubeSection from "@student/components/YouTubeSection";
import CTASection from "@student/components/CTASection";
import ChatDemo from "@student/components/ChatDemo";
import ContactSection from "@student/components/ContactSection";
import EnhancedCountryGuides from "@student/components/EnhancedCountryGuides";
import SocialMediaLinks from "@student/components/SocialMediaLinks";
import WhatsAppButton from "@student/components/WhatsAppButton";
import CompanyExperience from "@student/components/CompanyExperience";
import StudentGallery from "@student/components/StudentGallery";
import FoundersSection from "@student/components/FoundersSection";
import { AdminTestComponent } from "@student/components/AdminTestComponent";
import { useAuth } from "@student/hooks/useAuth";
import { Card, CardContent, CardHeader, CardTitle } from "@student/components/ui/card";
import { Button } from "@student/components/ui/button";
import { Link } from "react-router-dom";
import { Shield, ArrowRight } from "lucide-react";
import SEOHead from "@student/components/SEOHead";

const Index = () => {
  const { user, isAdmin } = useAuth();

  return (
    <div className="min-h-screen w-full overflow-x-hidden">
      <SEOHead 
        title="Fly Masters - AI-Powered Study Abroad Guidance | University Selection & Visa Assistance"
        description="Find your perfect university match with AI-powered recommendations. Get expert guidance for studying abroad, visa assistance, and application support. Join 50,000+ students who achieved their dreams."
        keywords="study abroad, university selection, visa assistance, AI university matching, study overseas, international education"
      />
      <Header />

      <div className="pt-16">
      <main className="w-full">
        <Enhanced3DHero />
        
        {/* First CTA Section */}
        <CTASection 
          sectionKey="cta_section_1" 
          variant="primary"
        />
        
        <Enhanced3DFeatures />
        
        {/* Stats Section */}
        <StatsSection />
        
        {/* Services Section */}
        <ServicesSection />
        
        {/* Country Guides */}
        <EnhancedCountryGuides />
        
        {/* Company Experience Timer */}
        <CompanyExperience />
        
        {/* Main CTA Section */}
        <CTASection 
          sectionKey="cta_section_2" 
          variant="gradient"
          className="relative"
        />
        
        {/* Testimonials */}
        <TestimonialsSection />
        
        {/* Student Gallery */}
        <StudentGallery />
        
        {/* Founders Section */}
        <FoundersSection />
        
        {/* Video Testimonials */}
        <VideoTestimonialsSection />
        
        {/* YouTube Section */}
        <YouTubeSection />
        
        {/* Chat Demo */}
        <ChatDemo />
        
        {/* Social Media Links */}
        <SocialMediaLinks />
        
        {/* Contact Section */}
        <ContactSection />
        
        {/* WhatsApp Sticky Button */}
        <WhatsAppButton variant="sticky" />
        
        {/* Admin Access Panel - Only show for logged in users */}
        {user && (
          <section className="py-12 px-4 bg-muted/30">
            <div className="container mx-auto max-w-4xl">
              <div className="grid gap-6 md:grid-cols-2">
                <AdminTestComponent />
                
                {isAdmin && (
                  <Card className="glass-card">
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2">
                        <Shield className="w-5 h-5 text-primary" />
                        Admin Dashboard
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <p className="text-muted-foreground mb-4">
                        Access the admin dashboard to manage users, student leads, website content, and analytics.
                      </p>
                      <Button asChild className="w-full">
                        <Link to="/dashboard/admin" className="flex items-center gap-2">
                          Access Admin Dashboard
                          <ArrowRight className="w-4 h-4" />
                        </Link>
                      </Button>
                    </CardContent>
                  </Card>
                )}
              </div>
            </div>
          </section>
        )}
      </main>
      </div>
    </div>
  );
};

export default Index;