import React, { useEffect, useState } from 'react';
import { MessageCircle } from 'lucide-react';
import { supabase } from '@student/integrations/supabase/client';

interface WhatsAppConfig {
  phone_number?: string;
  message?: string;
  show_sticky?: boolean;
  sticky_position?: 'bottom-right' | 'bottom-left' | 'top-right' | 'top-left';
}

interface WhatsAppButtonProps {
  variant?: 'sticky' | 'inline';
  className?: string;
}

const WhatsAppButton: React.FC<WhatsAppButtonProps> = ({ variant = 'sticky', className = '' }) => {
  const [config, setConfig] = useState<WhatsAppConfig | null>(null);

  useEffect(() => {
    fetchConfig();
  }, []);

  const fetchConfig = async () => {
    const { data } = await supabase
      .from('website_content')
      .select('metadata')
      .eq('section_key', 'whatsapp_config')
      .single();
    
    if (data?.metadata) setConfig(data.metadata as WhatsAppConfig);
  };

  if (!config?.phone_number) return null;
  if (variant === 'sticky' && !config.show_sticky) return null;

  const phoneNumber = config.phone_number.replace(/[^0-9]/g, '');
  const message = encodeURIComponent(config.message || 'Hi, I am interested in studying abroad. Can you help me?');
  const whatsappUrl = `https://wa.me/${phoneNumber}?text=${message}`;

  const positionClasses = {
    'bottom-right': 'bottom-6 right-6',
    'bottom-left': 'bottom-6 left-6',
    'top-right': 'top-24 right-6',
    'top-left': 'top-24 left-6',
  };

  if (variant === 'sticky') {
    return (
      <a
        href={whatsappUrl}
        target="_blank"
        rel="noopener noreferrer"
        className={`fixed ${positionClasses[config.sticky_position || 'bottom-right']} z-50 group ${className}`}
        aria-label="Chat on WhatsApp"
      >
        <div className="relative">
          {/* Pulse Animation */}
          <div className="absolute inset-0 bg-green-500 rounded-full animate-ping opacity-75"></div>
          
          {/* Button */}
          <div className="relative w-14 h-14 md:w-16 md:h-16 bg-green-500 hover:bg-green-600 rounded-full flex items-center justify-center shadow-lg transition-all duration-300 group-hover:scale-110">
            <MessageCircle className="w-7 h-7 md:w-8 md:h-8 text-white" />
          </div>
          
          {/* Tooltip - Hidden on mobile */}
          <div className="hidden md:block absolute right-full mr-3 top-1/2 -translate-y-1/2 bg-card border border-border rounded-lg px-3 py-2 shadow-lg opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap">
            <span className="text-sm font-medium">Chat with us on WhatsApp</span>
          </div>
        </div>
      </a>
    );
  }

  return (
    <a
      href={whatsappUrl}
      target="_blank"
      rel="noopener noreferrer"
      className={`inline-flex items-center gap-2 ${className}`}
    >
      <MessageCircle className="w-5 h-5" />
      <span>WhatsApp</span>
    </a>
  );
};

export default WhatsAppButton;