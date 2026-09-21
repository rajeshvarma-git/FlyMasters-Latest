import { ReactNode } from 'react';
import { Button as BaseButton } from '@student/components/ui/button';
import { Card as BaseCard } from '@student/components/ui/card';
import { cn } from '@student/lib/utils';

interface TouchButtonProps extends React.ComponentProps<typeof BaseButton> {
  children: ReactNode;
}

export function TouchButton({ children, className, ...props }: TouchButtonProps) {
  return (
    <BaseButton
      className={cn(
        "touch-bounce min-h-[44px] min-w-[44px] text-base px-4",
        "focus:ring-2 focus:ring-primary focus:ring-offset-2",
        "active:bg-primary/90 active:scale-95 transition-transform",
        className
      )}
      {...props}
    >
      {children}
    </BaseButton>
  );
}

interface TouchCardProps extends React.ComponentProps<typeof BaseCard> {
  children: ReactNode;
  interactive?: boolean;
}

export function TouchCard({ children, className, interactive = false, ...props }: TouchCardProps) {
  return (
    <BaseCard
      className={cn(
        "glass-card",
        interactive && "touch-bounce cursor-pointer hover:shadow-hover active:scale-[0.98] transition-transform",
        "focus-within:ring-2 focus-within:ring-primary focus-within:ring-offset-2",
        className
      )}
      {...props}
    >
      {children}
    </BaseCard>
  );
}

// Mobile-optimized input component
interface TouchInputProps extends React.InputHTMLAttributes<HTMLInputElement> {}

export function TouchInput({ className, ...props }: TouchInputProps) {
  return (
    <input
      className={cn(
        "min-h-[44px] px-4 py-3 text-base rounded-lg border border-border bg-background w-full",
        "focus:border-primary focus:ring-2 focus:ring-primary focus:ring-offset-2",
        "disabled:opacity-50 disabled:cursor-not-allowed",
        "transition-all duration-200",
        className
      )}
      {...props}
    />
  );
}

// Mobile-optimized text area
interface TouchTextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {}

export function TouchTextarea({ className, ...props }: TouchTextareaProps) {
  return (
    <textarea
      className={cn(
        "min-h-[96px] px-4 py-3 text-base rounded-lg border border-border bg-background resize-vertical w-full",
        "focus:border-primary focus:ring-2 focus:ring-primary focus:ring-offset-2",
        "disabled:opacity-50 disabled:cursor-not-allowed",
        "transition-all duration-200",
        className
      )}
      {...props}
    />
  );
}