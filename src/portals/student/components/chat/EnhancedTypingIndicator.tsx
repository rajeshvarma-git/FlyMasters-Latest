import React from 'react';
import { Bot } from 'lucide-react';

const EnhancedTypingIndicator: React.FC = () => {
  return (
    <div className="flex justify-start mb-4 animate-scale-in">
      <div className="flex-shrink-0 w-10 h-10 rounded-full bg-gradient-primary flex items-center justify-center mr-3 shadow-card">
        <Bot className="w-5 h-5 text-white" />
      </div>
      
      <div className="bg-card backdrop-blur-sm border border-border/50 p-4 rounded-2xl rounded-bl-md shadow-card">
        <div className="flex space-x-2">
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              className="w-2 h-2 bg-primary rounded-full animate-bounce"
              style={{
                animationDelay: `${i * 0.15}s`,
                animationDuration: '1s'
              }}
            />
          ))}
        </div>
      </div>
    </div>
  );
};

export default EnhancedTypingIndicator;