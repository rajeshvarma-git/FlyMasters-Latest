import React from 'react';
import { ChatMessage } from '@student/hooks/useChat';
import { Bot, User } from 'lucide-react';

interface EnhancedMessageBubbleProps {
  message: ChatMessage;
  isLast: boolean;
}

const EnhancedMessageBubble: React.FC<EnhancedMessageBubbleProps> = ({ message, isLast }) => {
  const isUser = message.type === 'user';
  
  return (
    <div className={`flex ${isUser ? 'justify-end' : 'justify-start'} mb-4 animate-scale-in`}>
      {!isUser && (
        <div className="flex-shrink-0 w-10 h-10 rounded-full bg-gradient-primary flex items-center justify-center mr-3 shadow-card animate-scale-in">
          <Bot className="w-5 h-5 text-white" />
        </div>
      )}
      
      <div
        className={`
          max-w-[85%] sm:max-w-[75%] p-4 rounded-2xl break-words shadow-card transition-transform hover:scale-[1.02]
          ${isUser 
            ? 'bg-gradient-primary text-white rounded-br-md animate-slide-in-right' 
            : 'bg-card backdrop-blur-sm border border-border/50 text-foreground rounded-bl-md animate-slide-in-left'
          }
        `}
      >
        <p className="text-sm leading-relaxed whitespace-pre-wrap">{message.content}</p>
        <span className={`text-xs mt-2 block ${isUser ? 'opacity-80' : 'opacity-60'}`}>
          {message.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
        </span>
      </div>
      
      {isUser && (
        <div className="flex-shrink-0 w-10 h-10 rounded-full bg-accent-cyan flex items-center justify-center ml-3 shadow-card animate-scale-in">
          <User className="w-5 h-5 text-white" />
        </div>
      )}
    </div>
  );
};

export default EnhancedMessageBubble;