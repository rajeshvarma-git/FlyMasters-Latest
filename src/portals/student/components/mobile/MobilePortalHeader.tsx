import { ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { GraduationCap, ChevronLeft, Bell } from 'lucide-react';
import { Button } from '@student/components/ui/button';
import { Badge } from '@student/components/ui/badge';
import { cn } from '@student/lib/utils';

interface MobilePortalHeaderProps {
  title: string;
  subtitle?: string;
  showBack?: boolean;
  backTo?: string;
  unreadCount?: number;
  onNotificationsClick?: () => void;
  rightSlot?: ReactNode;
  className?: string;
}

export function MobilePortalHeader({
  title,
  subtitle,
  showBack,
  backTo,
  unreadCount = 0,
  onNotificationsClick,
  rightSlot,
  className,
}: MobilePortalHeaderProps) {
  const navigate = useNavigate();

  const handleBack = () => {
    if (backTo) navigate(backTo);
    else navigate(-1);
  };

  return (
    <header className={cn('ios-nav-bar fixed top-0 left-0 right-0 z-40 md:hidden safe-top', className)}>
      <div className="flex items-center justify-between h-11 px-2 gap-2">
        <div className="flex items-center min-w-[72px]">
          {showBack ? (
            <button
              type="button"
              onClick={handleBack}
              className="flex items-center text-primary -ml-1 px-1 py-1 active:opacity-60 transition-opacity"
            >
              <ChevronLeft className="w-6 h-6 shrink-0" strokeWidth={2} />
              <span className="text-[17px] leading-none -ml-0.5">Back</span>
            </button>
          ) : (
            <div className="w-8 h-8 rounded-full bg-gradient-primary flex items-center justify-center ml-1">
              <GraduationCap className="w-4 h-4 text-white" />
            </div>
          )}
        </div>

        <div className="flex-1 min-w-0 text-center px-1">
          <h1 className="font-semibold text-[17px] truncate leading-tight">{title}</h1>
          {!showBack && subtitle && (
            <p className="text-[11px] text-muted-foreground truncate leading-tight">{subtitle}</p>
          )}
        </div>

        <div className="flex items-center justify-end min-w-[72px] gap-0.5">
          {onNotificationsClick && (
            <Button variant="ghost" size="icon" className="relative h-9 w-9 shrink-0" onClick={onNotificationsClick}>
              <Bell className="h-5 w-5" strokeWidth={1.75} />
              {unreadCount > 0 && (
                <Badge
                  variant="destructive"
                  className="absolute top-0.5 right-0.5 h-4 min-w-4 px-1 text-[9px] flex items-center justify-center pointer-events-none"
                >
                  {unreadCount > 9 ? '9+' : unreadCount}
                </Badge>
              )}
            </Button>
          )}
          {rightSlot}
        </div>
      </div>
    </header>
  );
}
