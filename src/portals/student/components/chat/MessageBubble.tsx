import React from 'react';
import { ChatMessage } from '@student/hooks/useChat';

interface MessageBubbleProps {
  message: ChatMessage;
}

const MessageBubble: React.FC<MessageBubbleProps> = ({ message }) => {
  return (
    <div className={`flex ${message.type === 'user' ? 'justify-end' : 'justify-start'} mb-4`}>
      <div
        className={`max-w-[85%] sm:max-w-[80%] p-3 rounded-2xl break-words ${
          message.type === 'user'
            ? 'bg-primary text-primary-foreground ml-4 rounded-br-md'
            : 'bg-muted text-muted-foreground mr-4 rounded-bl-md'
        }`}
        role="log"
        aria-label={`${message.type === 'user' ? 'Your message' : 'AI response'}`}
      >
        <p className="text-sm leading-relaxed whitespace-pre-wrap">{message.content}</p>
        <span className="text-xs opacity-70 mt-1 block">
          {message.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
        </span>
      </div>
    </div>
  );
};

export default MessageBubble;