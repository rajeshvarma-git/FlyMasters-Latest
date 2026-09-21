import React from 'react';
import { Button } from '@student/components/ui/button';
import { Phone, MessageCircle, Users } from 'lucide-react';

const ExpertHelpSection: React.FC = () => {
  return (
    <div 
      className="bg-gradient-to-br from-blue-50 to-indigo-50 dark:from-blue-950/20 dark:to-indigo-950/20 p-6 rounded-lg border border-blue-200 dark:border-blue-800"
      role="region"
      aria-label="Expert help contact options"
    >
      <div className="text-center mb-4">
        <Users className="w-8 h-8 mx-auto mb-2 text-blue-600" />
        <h3 className="font-semibold text-lg text-foreground">🌟 Get Expert Help</h3>
        <p className="text-sm text-muted-foreground mt-1">
          Our counselors are available to provide personalized guidance!
        </p>
      </div>
      
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Button 
          className="h-12 bg-green-600 hover:bg-green-700 text-white group" 
          asChild
        >
          <a 
            href="tel:+919259597979" 
            className="flex items-center justify-center space-x-2"
            aria-label="Call our experts at +91 92595 97979"
          >
            <Phone size={18} className="group-hover:animate-bounce" />
            <span>📞 Call: +91 92595 97979</span>
          </a>
        </Button>
        
        <Button 
          className="h-12 bg-green-500 hover:bg-green-600 text-white group" 
          asChild
        >
          <a 
            href="https://wa.me/919502127788" 
            target="_blank" 
            rel="noopener noreferrer" 
            className="flex items-center justify-center space-x-2"
            aria-label="Chat with us on WhatsApp at +91 95021 27788"
          >
            <MessageCircle size={18} className="group-hover:animate-pulse" />
            <span>💬 WhatsApp: +91 95021 27788</span>
          </a>
        </Button>
      </div>
      
      <div className="mt-4 p-3 bg-white/50 dark:bg-black/20 rounded-md">
        <p className="text-xs text-center text-muted-foreground">
          <strong>Available:</strong> Monday - Saturday, 9 AM - 8 PM IST<br/>
          <strong>Response Time:</strong> Usually within 2-4 hours
        </p>
      </div>
    </div>
  );
};

export default ExpertHelpSection;