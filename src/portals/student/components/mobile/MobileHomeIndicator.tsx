import { useNavigate } from 'react-router-dom';
import { cn } from '@student/lib/utils';

interface MobileHomeIndicatorProps {
  homePath: string;
  className?: string;
}

/** iOS-style tappable home bar — tap to go home */
export function MobileHomeIndicator({ homePath, className }: MobileHomeIndicatorProps) {
  const navigate = useNavigate();

  return (
    <button
      type="button"
      aria-label="Go to home"
      onClick={() => navigate(homePath)}
      className={cn(
        'flex w-full items-center justify-center py-1.5 pb-[max(6px,env(safe-area-inset-bottom))] active:opacity-60 transition-opacity',
        className
      )}
    >
      <span className="ios-home-bar block h-[5px] w-[134px] max-w-[36%] rounded-full bg-foreground/25 active:bg-foreground/40 transition-colors" />
    </button>
  );
}
