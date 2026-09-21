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
import { Shield, ArrowRight, User } from "lucide-react";
import SEOHead from "@student/components/SEOHead";

const Index = () => {
  const { user, isAdmin, userRole, userProfile } = useAuth();

  return (
    <div className="min-h-screen w-full overflow-x-hidden">
      <SEOHead 
        title="Fly Masters - AI-Powered Study Abroad Guidance | University Selection & Visa Assistance"
        description="Find your perfect university match with AI-powered recommendations. Get expert guidance for studying abroad, visa assistance, and application support. Join 50,000+ students who achieved their dreams."
        keywords="study abroad, university selection, visa assistance, AI university matching, study overseas, international education"
      />
      <Header />

      <div className="pt-16">
      {user && userRole && (
        <div className="bg-gradient-primary/95 border-b border-white/20 shadow-lg">
          <div className="container mx-auto px-4 md:px-6 py-3 md:py-4">
            <div className="flex items-center justify-between flex-wrap gap-3 md:gap-4">
              <div className="flex items-center gap-3 md:gap-4">
                <div className="w-8 h-8 md:w-10 md:h-10 rounded-full bg-white/20 flex items-center justify-center flex-shrink-0">
                  <User className="w-4 h-4 md:w-5 md:h-5 text-white" />
                </div>
                <div>
                  <p className="text-white font-semibold text-sm md:text-lg">
                    Welcome back{userProfile?.first_name ? `, ${userProfile.first_name}` : ''}!
                  </p>
                  <p className="text-white/80 text-xs md:text-sm capitalize">Access your {userRole} dashboard</p>
                </div>
              </div>
              <Button 
                variant="secondary" 
                size="sm"
                className="shadow-xl ring-1 md:ring-2 ring-white/50 ring-offset-1 md:ring-offset-2 ring-offset-primary font-bold text-xs md:text-base"
                asChild
              >
                <Link to={userRole === 'student' ? '/student' : userRole === 'counselor' ? '/counselor' : '/dashboard'} className="flex items-center gap-2">
                  <ArrowRight className="w-4 h-4 md:w-5 md:h-5" />
                  <span className="hidden sm:inline">Go to My Dashboard</span>
                  <span className="sm:hidden">Dashboard</span>
                </Link>
              </Button>
            </div>
          </div>
        </div>
      )}
      
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