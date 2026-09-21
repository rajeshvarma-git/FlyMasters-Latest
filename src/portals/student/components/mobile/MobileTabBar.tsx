import { ReactNode, useEffect } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { ChevronRight } from 'lucide-react';
import { cn } from '@student/lib/utils';
import { MobileHomeIndicator } from './MobileHomeIndicator';

export interface MobileNavItem {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  path: string;
  end?: boolean;
  badge?: number;
}

interface MobileTabBarProps {
  items: MobileNavItem[];
  moreItem?: MobileNavItem;
  onMoreClick?: () => void;
  isMoreActive?: boolean;
  homePath?: string;
}

export function MobileTabBar({ items, moreItem, onMoreClick, isMoreActive, homePath = '/' }: MobileTabBarProps) {
  const location = useLocation();

  const isActive = (path: string, end?: boolean) => {
    if (end || path.match(/\/(student|counselor)$/)) {
      return location.pathname === path || location.pathname === path.replace(/\/$/, '');
    }
    return location.pathname.startsWith(path);
  };

  return (
    <nav className="ios-tab-bar fixed bottom-0 left-0 right-0 z-50 md:hidden">
      <div className="ios-tab-bar-inner flex items-stretch justify-around px-1 pt-1.5 pb-1">
        {items.map((item) => {
          const active = isActive(item.path, item.end);
          return (
            <NavLink
              key={item.path}
              to={item.path}
              end={item.end}
              className={cn(
                'ios-tab-item flex flex-1 flex-col items-center justify-center gap-0.5 py-1 min-w-0 relative',
                active ? 'text-primary' : 'text-muted-foreground'
              )}
            >
              <item.icon
                className={cn('w-[22px] h-[22px] transition-transform', active && 'scale-105')}
                strokeWidth={active ? 2.25 : 1.75}
              />
              <span className={cn('text-[10px] leading-none', active ? 'font-semibold' : 'font-medium')}>
                {item.label}
              </span>
              {item.badge !== undefined && item.badge > 0 && (
                <span className="absolute top-0.5 right-[calc(50%-18px)] min-w-[16px] h-4 px-1 rounded-full bg-destructive text-destructive-foreground text-[9px] font-bold flex items-center justify-center">
                  {item.badge > 9 ? '9+' : item.badge}
                </span>
              )}
            </NavLink>
          );
        })}

        {moreItem && onMoreClick && (
          <button
            type="button"
            onClick={onMoreClick}
            className={cn(
              'ios-tab-item flex flex-1 flex-col items-center justify-center gap-0.5 py-1 min-w-0',
              isMoreActive ? 'text-primary' : 'text-muted-foreground'
            )}
          >
            <moreItem.icon
              className={cn('w-[22px] h-[22px] transition-transform', isMoreActive && 'scale-105')}
              strokeWidth={isMoreActive ? 2.25 : 1.75}
            />
            <span className={cn('text-[10px] leading-none', isMoreActive ? 'font-semibold' : 'font-medium')}>
              {moreItem.label}
            </span>
          </button>
        )}
      </div>
      <MobileHomeIndicator homePath={homePath} />
    </nav>
  );
}

interface MobileMoreMenuProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title?: string;
  children: ReactNode;
}

export function MobileMoreMenu({ open, onOpenChange, title, children }: MobileMoreMenuProps) {
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  if (!open) return null;

  return (
    <div className="ios-sheet-root fixed inset-0 z-[80] md:hidden flex flex-col justify-end">
      <button
        type="button"
        aria-label="Close menu"
        className="ios-sheet-backdrop absolute inset-0 bg-black/40 backdrop-blur-[2px] animate-in fade-in duration-200"
        onClick={() => onOpenChange(false)}
      />

      <div className="ios-sheet-panel relative mx-2 mb-2 safe-bottom animate-in slide-in-from-bottom duration-300 ease-out">
        {title && (
          <p className="text-center text-xs font-medium text-white/90 mb-2 px-4 drop-shadow-sm">{title}</p>
        )}

        <div className="max-h-[55vh] overflow-y-auto space-y-2">{children}</div>

        <button
          type="button"
          onClick={() => onOpenChange(false)}
          className="ios-sheet-cancel w-full mt-2 py-3.5 text-[17px] font-semibold text-primary bg-white/95 backdrop-blur-xl rounded-2xl shadow-sm active:opacity-70 transition-opacity"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

export function MobileMoreSection({ children }: { children: ReactNode }) {
  return <div className="ios-sheet-group mb-2 overflow-hidden">{children}</div>;
}

interface MobileMoreLinkProps {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  to: string;
  onClick?: () => void;
  badge?: number;
  destructive?: boolean;
}

export function MobileMoreLink({ icon: Icon, label, to, onClick, badge, destructive }: MobileMoreLinkProps) {
  return (
    <NavLink
      to={to}
      onClick={onClick}
      className={cn(
        'ios-sheet-row flex items-center gap-3 px-4 min-h-[52px] bg-white/95 backdrop-blur-xl border-b border-black/[0.06] last:border-b-0 active:bg-black/[0.04] transition-colors',
        destructive && 'text-destructive'
      )}
    >
      <Icon className={cn('w-5 h-5 shrink-0', destructive ? 'text-destructive' : 'text-primary')} strokeWidth={1.75} />
      <span className={cn('flex-1 text-[17px]', destructive ? 'text-destructive' : 'text-foreground')}>{label}</span>
      {badge !== undefined && badge > 0 && (
        <span className="bg-destructive text-destructive-foreground text-xs font-bold min-w-[22px] h-[22px] px-1.5 rounded-full flex items-center justify-center">
          {badge > 99 ? '99+' : badge}
        </span>
      )}
      <ChevronRight className="w-4 h-4 text-muted-foreground/50 shrink-0" strokeWidth={2} />
    </NavLink>
  );
}

interface MobileMoreButtonProps {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  onClick: () => void;
  destructive?: boolean;
}

export function MobileMoreButton({ icon: Icon, label, onClick, destructive }: MobileMoreButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'ios-sheet-row w-full flex items-center gap-3 px-4 min-h-[52px] bg-white/95 backdrop-blur-xl border-b border-black/[0.06] last:border-b-0 active:bg-black/[0.04] transition-colors text-left',
        destructive && 'text-destructive'
      )}
    >
      <Icon className={cn('w-5 h-5 shrink-0', destructive ? 'text-destructive' : 'text-primary')} strokeWidth={1.75} />
      <span className={cn('flex-1 text-[17px]', destructive ? 'text-destructive' : 'text-foreground')}>{label}</span>
      <ChevronRight className="w-4 h-4 text-muted-foreground/50 shrink-0" strokeWidth={2} />
    </button>
  );
}
