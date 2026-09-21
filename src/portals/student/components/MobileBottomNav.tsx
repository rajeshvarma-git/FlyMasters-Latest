import { useState } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { useAuth } from '@student/hooks/useAuth';
import { Home, MessageCircle, GraduationCap, User, Plane, LayoutGrid, LogIn } from 'lucide-react';
import { MobileMoreMenu, MobileMoreLink, MobileMoreSection } from '@student/components/mobile/MobileTabBar';
import { MobileHomeIndicator } from '@student/components/mobile/MobileHomeIndicator';
import { cn } from '@student/lib/utils';

export function MobileBottomNav() {
  const { user, userRole } = useAuth();
  const location = useLocation();
  const [moreOpen, setMoreOpen] = useState(false);

  if (location.pathname === '/auth') return null;

  const dashboardPath =
    userRole === 'counselor'
      ? '/counselor'
      : userRole === 'admin' || userRole === 'super_admin'
        ? '/dashboard/admin'
        : '/student';

  const primaryTabs = [
    { icon: Home, label: 'Home', path: '/' },
    { icon: MessageCircle, label: 'AI Chat', path: '/chat' },
    { icon: GraduationCap, label: 'Universities', path: '/universities' },
    { icon: Plane, label: 'Travel', path: '/travel' },
  ];

  const isActive = (path: string) => {
    if (path === '/') return location.pathname === '/';
    return location.pathname.startsWith(path);
  };

  const close = () => setMoreOpen(false);

  return (
    <>
      <nav className="ios-tab-bar fixed bottom-0 left-0 right-0 z-50 md:hidden">
        <div className="ios-tab-bar-inner flex items-stretch justify-around px-1 pt-1.5 pb-1">
          {primaryTabs.map((item) => {
            const active = isActive(item.path);
            return (
              <NavLink
                key={item.path}
                to={item.path}
                end={item.path === '/'}
                className={cn(
                  'ios-tab-item flex flex-1 flex-col items-center justify-center gap-0.5 py-1 min-w-0',
                  active ? 'text-primary' : 'text-muted-foreground'
                )}
              >
                <item.icon className="w-[22px] h-[22px]" strokeWidth={active ? 2.25 : 1.75} />
                <span className={cn('text-[10px] leading-none', active ? 'font-semibold' : 'font-medium')}>
                  {item.label}
                </span>
              </NavLink>
            );
          })}

          <button
            type="button"
            onClick={() => setMoreOpen(true)}
            className={cn(
              'ios-tab-item flex flex-1 flex-col items-center justify-center gap-0.5 py-1 min-w-0',
              moreOpen ? 'text-primary' : 'text-muted-foreground'
            )}
          >
            <LayoutGrid className="w-[22px] h-[22px]" strokeWidth={moreOpen ? 2.25 : 1.75} />
            <span className={cn('text-[10px] leading-none', moreOpen ? 'font-semibold' : 'font-medium')}>More</span>
          </button>
        </div>
        <MobileHomeIndicator homePath="/" />
      </nav>

      <MobileMoreMenu open={moreOpen} onOpenChange={setMoreOpen} title="Fly Masters">
        <MobileMoreSection>
          {user ? (
            <MobileMoreLink icon={User} label="My Portal" to={dashboardPath} onClick={close} />
          ) : (
            <MobileMoreLink icon={LogIn} label="Sign In" to="/auth" onClick={close} />
          )}
          <MobileMoreLink icon={GraduationCap} label="Student Portal" to="/student" onClick={close} />
          <MobileMoreLink icon={MessageCircle} label="AI University Advisor" to="/chat" onClick={close} />
        </MobileMoreSection>

        <MobileMoreSection>
          <MobileMoreLink icon={Plane} label="Travel Agency" to="/travel" onClick={close} />
          <MobileMoreLink icon={GraduationCap} label="Browse Universities" to="/universities" onClick={close} />
        </MobileMoreSection>
      </MobileMoreMenu>
    </>
  );
}
