import { useEffect, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { Bell, ChevronDown, LogOut, MessageCircle, Search, User } from 'lucide-react';
import { useAuth } from '@student/hooks/useAuth';
import { GlobalSearch } from '@student/components/GlobalSearch';
import { getStudentHeaderTitle } from '@student/components/mobile/StudentMobileNav';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@student/components/ui/dropdown-menu';
import { studentDisplayName, studentInitials } from './studentIdentity';

/**
 * Desktop top bar for the student portal: page title on the left, search in
 * the middle, and Messages / Notifications / profile menu in the top-right
 * corner. Mobile keeps MobilePortalHeader.
 */

function CountBadge({ count, tone = 'red' }: { count: number; tone?: 'red' | 'blue' }) {
  if (count <= 0) return null;
  return (
    <span
      className={`absolute -top-1.5 -right-1.5 min-w-[20px] h-5 px-1 rounded-full border-2 border-background text-[11px] font-bold text-white flex items-center justify-center ${
        tone === 'blue' ? 'bg-primary' : 'bg-destructive'
      }`}
    >
      {count > 99 ? '99+' : count}
    </span>
  );
}

interface StudentTopBarProps {
  notificationCount: number;
  messageCount: number;
}

export function StudentTopBar({ notificationCount, messageCount }: StudentTopBarProps) {
  const { user, userProfile, signOut } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [searchOpen, setSearchOpen] = useState(false);
  const header = getStudentHeaderTitle(location.pathname);
  const name = studentDisplayName(user, userProfile);
  const firstName = name.split(/\s+/)[0];
  const title = location.pathname === '/student' ? 'Dashboard' : header.title;

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.key === 'k' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setSearchOpen(true);
      }
    };
    document.addEventListener('keydown', down);
    return () => document.removeEventListener('keydown', down);
  }, []);

  const iconBtn =
    'relative h-10 w-10 rounded-xl border border-border/60 bg-background flex items-center justify-center text-foreground/80 hover:bg-muted/60 hover:text-foreground transition-colors';

  return (
    <>
      <GlobalSearch open={searchOpen} onOpenChange={setSearchOpen} userRole="student" userId={user?.id} />
      <header className="hidden md:flex h-16 flex-none items-center gap-6 border-b border-border/40 bg-background/90 px-6 backdrop-blur-sm">
        <div className="min-w-0">
          <h1 className="truncate text-lg font-bold leading-tight">{title}</h1>
          <p className="truncate text-xs text-muted-foreground">Welcome back, {firstName}</p>
        </div>

        <button
          type="button"
          onClick={() => setSearchOpen(true)}
          className="flex h-10 w-full max-w-sm items-center gap-2 rounded-xl border border-border/60 bg-background px-3 text-sm text-muted-foreground hover:bg-muted/40"
        >
          <Search className="h-4 w-4" />
          Search universities, documents…
          <kbd className="ml-auto rounded border bg-muted px-1.5 font-mono text-[10px]">Ctrl K</kbd>
        </button>

        <div className="ml-auto flex items-center gap-2.5">
          <Link to="/student/messages" className={iconBtn} aria-label="Messages" title="Messages">
            <MessageCircle className="h-5 w-5" />
            <CountBadge count={messageCount} tone="blue" />
          </Link>
          <Link to="/student/notifications" className={iconBtn} aria-label="Notifications" title="Notifications">
            <Bell className="h-5 w-5" />
            <CountBadge count={notificationCount} />
          </Link>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                className="flex items-center gap-2 rounded-xl border border-border/60 bg-background py-1 pl-1 pr-3 text-sm font-semibold hover:bg-muted/40"
              >
                <span className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/10 text-xs font-bold text-primary">
                  {studentInitials(name)}
                </span>
                <span className="max-w-[120px] truncate">{firstName}</span>
                <ChevronDown className="h-4 w-4 text-muted-foreground" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuLabel className="font-normal">
                <p className="text-sm font-semibold">{name}</p>
                <p className="truncate text-xs text-muted-foreground">{user?.email}</p>
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem onSelect={() => navigate('/student/profile')} className="cursor-pointer">
                <User className="mr-2 h-4 w-4" /> My Profile
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => void signOut()} className="cursor-pointer">
                <LogOut className="mr-2 h-4 w-4" /> Sign out
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </header>
    </>
  );
}
