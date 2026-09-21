import React, { useState, useRef, useEffect } from 'react';
import { Button } from '@student/components/ui/button';
import { Input } from '@student/components/ui/input';
import { Loader2, Send } from 'lucide-react';

interface ChatInputProps {
  onSendMessage: (message: string) => Promise<void>;
  isLoading: boolean;
  otpMode: boolean;
  phoneNumber: string;
  disabled?: boolean;
}

const ChatInput: React.FC<ChatInputProps> = ({
  onSendMessage,
  isLoading,
  otpMode,
  phoneNumber,
  disabled = false,
}) => {
  const [currentInput, setCurrentInput] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!isLoading && inputRef.current) {
      inputRef.current.focus();
    }
  }, [isLoading]);

  const handleSend = async () => {
    if (!currentInput.trim() || isLoading || disabled) return;
    const message = currentInput.trim();
    setCurrentInput('');
    await onSendMessage(message);
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      void handleSend();
    }
  };

  const validateInput = (value: string) => {
    if (otpMode) {
      return /^\d*$/.test(value) && value.length <= 6;
    }
    return true;
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    if (validateInput(value)) {
      setCurrentInput(value);
    }
  };

  const placeholder = otpMode
    ? 'Enter 6-digit verification code...'
    : 'Type your message...';

  const isValid = otpMode ? /^\d{6}$/.test(currentInput) : currentInput.trim().length > 0;

  return (
    <div className="border-t bg-background p-4">
      <div className="flex space-x-2 max-w-4xl mx-auto">
        <Input
          ref={inputRef}
          value={currentInput}
          onChange={handleInputChange}
          onKeyPress={handleKeyPress}
          placeholder={placeholder}
          disabled={isLoading || disabled}
          className="flex-1 focus-visible:ring-2 focus-visible:ring-primary"
          type={otpMode ? 'tel' : 'text'}
          maxLength={otpMode ? 6 : undefined}
          pattern={otpMode ? '\\d{6}' : undefined}
          aria-label={placeholder}
          autoComplete="off"
        />
        <Button
          onClick={() => void handleSend()}
          disabled={isLoading || !isValid || disabled}
          className="px-4"
          aria-label="Send message"
        >
          {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
        </Button>
      </div>

      {otpMode && (
        <p className="text-xs text-muted-foreground mt-2 text-center max-w-4xl mx-auto">
          Enter the 6-digit code sent to <span className="font-medium">{phoneNumber}</span>
        </p>
      )}

      {!isLoading && !disabled && !otpMode && (
        <p className="text-xs text-muted-foreground/60 mt-1 text-center">
          Press Enter to send • Shift + Enter for new line
        </p>
      )}

      {disabled && (
        <p className="text-xs text-muted-foreground mt-2 text-center">
          Chat complete. Contact our counselors below for next steps.
        </p>
      )}
    </div>
  );
};

export default ChatInput;
