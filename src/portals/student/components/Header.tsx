import { useState, useEffect } from "react";
import { Button } from "@student/components/ui/button";
import { Menu, X, GraduationCap, LogOut, User, MessageCircle } from "lucide-react";
import { useAuth } from "@student/hooks/useAuth";
import { useSiteBranding } from "@student/hooks/useSiteBranding";
import { Link } from "react-router-dom";
import { supabase } from "@student/integrations/supabase/client";
import { NotificationBell } from "@student/components/dashboard/NotificationBell";
import { useChatNavigation } from "@student/hooks/useChatNavigation";
import { CHAT_PATH } from "@student/lib/auth-utils";

interface WhatsAppConfig {
  phone_number?: string;
  message?: string;
  show_in_header?: boolean;
}

const Header = () => {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [whatsappConfig, setWhatsappConfig] = useState<WhatsAppConfig | null>(null);
  const { user, signOut } = useAuth();
  const { requireAuthForChat } = useChatNavigation();
  const { branding, loading } = useSiteBranding();

  useEffect(() => {
    fetchWhatsAppConfig();
  }, []);

  const fetchWhatsAppConfig = async () => {
    const { data } = await supabase
      .from('website_content')
      .select('metadata')
      .eq('section_key', 'whatsapp_config')
      .single();
    
    if (data?.metadata) setWhatsappConfig(data.metadata as WhatsAppConfig);
  };

  const whatsappUrl = whatsappConfig?.phone_number 
    ? `https://wa.me/${whatsappConfig.phone_number.replace(/[^0-9]/g, '')}?text=${encodeURIComponent(whatsappConfig.message || 'Hi, I am interested in studying abroad.')}`
    : null;
  
  const navigation = [
    { name: "How it Works", href: "#how-it-works" },
    { name: "Features", href: "#features" },
    { name: "Universities", href: "/universities", isLink: true },
    { name: "Travel Agency", href: "/travel", isLink: true },
    { name: "AI Chat", href: CHAT_PATH, isLink: true, requiresAuth: true },
    { name: "About", href: "#about" }
  ];

  return (
    <header className="fixed top-0 left-0 right-0 z-50 glass-card rounded-none border-0 border-b border-white/20 hidden md:block">
      <div className="container mx-auto px-4 md:px-6">
        <div className="flex items-center justify-between h-16">
          {/* Logo */}
          <div className="flex items-center gap-3">
            {loading ? (
              <div className="w-10 h-10 rounded-full bg-gradient-primary animate-pulse" />
            ) : branding.logoUrl.startsWith('http') || branding.logoUrl.startsWith('/') ? (
              <img 
                src={branding.logoUrl} 
                alt={`${branding.siteName} logo`}
                className="w-10 h-10 rounded-full object-cover"
              />
            ) : (
              <div className="w-10 h-10 rounded-full bg-gradient-primary flex items-center justify-center">
                <GraduationCap className="w-6 h-6 text-white" />
              </div>
            )}
            <div>
              <h1 className="font-bold text-lg">{branding.siteName}</h1>
              <p className="text-xs text-muted-foreground -mt-1">{branding.siteDescription}</p>
            </div>
          </div>

          {/* Desktop Navigation */}
          <nav className="hidden md:flex items-center gap-8">
            {navigation.map(item => 
              item.isLink ? (
                <Link 
                  key={item.name} 
                  to={item.href} 
                  className="text-sm font-medium hover:text-primary transition-colors"
                  onClick={item.requiresAuth ? requireAuthForChat : undefined}
                >
                  {item.name}
                </Link>
              ) : (
                <a 
                  key={item.name} 
                  href={item.href} 
                  className="text-sm font-medium hover:text-primary transition-colors"
                >
                  {item.name}
                </a>
              )
            )}
          </nav>

          {/* CTA Buttons */}
          <div className="hidden md:flex items-center gap-4">
            {whatsappConfig?.show_in_header && whatsappUrl && (
              <Button 
                variant="outline" 
                size="sm"
                className="bg-green-500 hover:bg-green-600 text-white border-green-600"
                asChild
              >
                <a href={whatsappUrl} target="_blank" rel="noopener noreferrer">
                  <MessageCircle className="w-4 h-4 mr-2" />
                  WhatsApp
                </a>
              </Button>
            )}
            
            {user ? (
              <div className="flex items-center gap-2">
                <NotificationBell />
                <Button 
                  variant="hero" 
                  size="lg"
                  className="animate-pulse shadow-lg ring-2 ring-primary/50 ring-offset-2"
                  asChild
                >
                  <Link to="/dashboard">
                    <User className="w-4 h-4 mr-2" />
                    My Dashboard
                  </Link>
                </Button>
                <Button variant="ghost" onClick={signOut}>
                  <LogOut className="w-4 h-4 mr-2" />
                  Sign Out
                </Button>
              </div>
            ) : (
              <>
                <Link to="/auth">
                  <Button variant="ghost">Sign In</Button>
                </Link>
                <Link to="/auth">
                  <Button variant="hero">Get Started</Button>
                </Link>
              </>
            )}
          </div>

          {/* Mobile Menu Button */}
          <button 
            onClick={() => setIsMenuOpen(!isMenuOpen)} 
            className="md:hidden p-2"
          >
            {isMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
          </button>
        </div>

        {/* Mobile Menu */}
        {isMenuOpen && (
          <div className="md:hidden border-t border-white/20 py-4">
            <nav className="flex flex-col gap-4">
              {navigation.map(item => 
                item.isLink ? (
                  <Link 
                    key={item.name} 
                    to={item.href} 
                    className="text-sm font-medium hover:text-primary transition-colors py-2" 
                    onClick={(event) => {
                      if (item.requiresAuth) requireAuthForChat(event);
                      setIsMenuOpen(false);
                    }}
                  >
                    {item.name}
                  </Link>
                ) : (
                  <a 
                    key={item.name} 
                    href={item.href} 
                    className="text-sm font-medium hover:text-primary transition-colors py-2" 
                    onClick={() => setIsMenuOpen(false)}
                  >
                    {item.name}
                  </a>
                )
              )}
              <div className="flex flex-col gap-2 pt-4 border-t border-white/20">
                {user ? (
                  <>
                    <Button 
                      variant="hero" 
                      size="lg"
                      className="justify-start w-full animate-pulse shadow-lg ring-2 ring-primary/50 ring-offset-2" 
                      asChild
                    >
                      <Link to="/dashboard">
                        <User className="w-4 h-4 mr-2" />
                        My Dashboard
                      </Link>
                    </Button>
                    <Button 
                      variant="ghost" 
                      className="justify-start" 
                      onClick={signOut}
                    >
                      <LogOut className="w-4 h-4 mr-2" />
                      Sign Out
                    </Button>
                  </>
                ) : (
                  <>
                    <Link to="/auth">
                      <Button variant="ghost" className="justify-start w-full">
                        Sign In
                      </Button>
                    </Link>
                    <Link to="/auth">
                      <Button variant="hero" className="justify-start w-full">
                        Get Started
                      </Button>
                    </Link>
                  </>
                )}
              </div>
            </nav>
          </div>
        )}
      </div>
    </header>
  );
};

export default Header;
