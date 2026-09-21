import { useState, useEffect } from 'react';
import { useAuth } from '@student/hooks/useAuth';
import { NavLink } from 'react-router-dom';
import {
  LayoutDashboard,
  Phone,
  Users,
  Target,
  MessageCircle,
  FileText,
  User,
  Calendar,
  Clock,
  DollarSign,
  Bell,
  GraduationCap,
  LogOut,
  Search,
  Command,
} from 'lucide-react';
import { Button } from '@student/components/ui/button';
import { Avatar, AvatarFallback } from '@student/components/ui/avatar';
import { GlobalSearch } from '@student/components/GlobalSearch';

interface CounselorNavItem {
  title: string;
  url: string;
  icon: React.ComponentType<{ className?: string }>;
}

const workItems: CounselorNavItem[] = [
  { title: 'Dashboard', url: '/counselor', icon: LayoutDashboard },
  { title: 'My Leads', url: '/counselor/leads', icon: Phone },
  { title: 'My Students', url: '/counselor/students', icon: Users },
  { title: 'Shortlists', url: '/counselor/shortlists', icon: Target },
  { title: 'Student Chat', url: '/counselor/chat', icon: MessageCircle },
  { title: 'WhatsApp', url: '/counselor/whatsapp', icon: MessageCircle },
  { title: 'Documents', url: '/counselor/documents', icon: FileText },
  { title: 'Notifications', url: '/counselor/notifications', icon: Bell },
];

const accountItems: CounselorNavItem[] = [
  { title: 'My Profile', url: '/counselor/profile', icon: User },
  { title: 'Leave', url: '/counselor/leave', icon: Calendar },
  { title: 'Attendance', url: '/counselor/attendance', icon: Clock },
  { title: 'Salary', url: '/counselor/salary', icon: DollarSign },
];

export function CounselorSidebar() {
  const { user, userProfile, signOut } = useAuth();
  const [searchOpen, setSearchOpen] = useState(false);

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

  const handleSignOut = async () => {
    await signOut();
  };

  const displayName = [userProfile?.first_name, userProfile?.last_name]
    .filter(Boolean)
    .join(' ') || user?.email?.split('@')[0] || 'Counselor';
  const userInitials = (userProfile?.first_name?.[0] || user?.email?.[0] || 'C').toUpperCase();

  const NavList = ({ items }: { items: CounselorNavItem[] }) => (
    <div className="space-y-1 px-2">
      {items.map((item) => (
        <NavLink
          key={item.url}
          to={item.url}
          end={item.url === '/counselor'}
          className={({ isActive }) =>
            `flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all ${
              isActive
                ? 'bg-primary/10 text-primary font-medium'
                : 'text-muted-foreground hover:bg-muted/50 hover:text-foreground'
            }`
          }
        >
          <item.icon className="w-4 h-4 flex-shrink-0" />
          <span className="flex-1">{item.title}</span>
        </NavLink>
      ))}
    </div>
  );

  const SidebarContent = () => (
    <>
      <div className="flex items-center gap-3 p-4 border-b border-border/20">
        <div className="w-8 h-8 rounded-full bg-gradient-primary flex items-center justify-center">
          <GraduationCap className="w-5 h-5 text-white" />
        </div>
        <div>
          <h2 className="font-semibold text-sm">Counselor Portal</h2>
          <p className="text-xs text-muted-foreground">Fly Masters</p>
        </div>
      </div>

      <div className="p-4 border-b">
        <Button
          variant="outline"
          className="w-full justify-start text-sm text-muted-foreground"
          onClick={() => setSearchOpen(true)}
        >
          <Search className="mr-2 h-4 w-4" />
          Search...
          <kbd className="ml-auto pointer-events-none inline-flex h-5 select-none items-center gap-1 rounded border bg-muted px-1.5 font-mono text-[10px] font-medium opacity-100">
            <Command className="h-3 w-3" />K
          </kbd>
        </Button>
      </div>

      <nav className="flex-1 py-4 overflow-y-auto">
        <p className="px-4 pb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Work
        </p>
        <NavList items={workItems} />
        <p className="px-4 pt-5 pb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Account
        </p>
        <NavList items={accountItems} />
      </nav>

      <div className="p-4 border-t border-border/20">
        <div className="flex items-center gap-3 mb-3">
          <Avatar className="w-8 h-8">
            <AvatarFallback className="bg-primary/10 text-primary text-xs">
              {userInitials}
            </AvatarFallback>
          </Avatar>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium truncate">{displayName}</p>
            <p className="text-xs text-muted-foreground truncate">Counselor</p>
          </div>
        </div>

        <Button
          variant="ghost"
          size="sm"
          className="w-full justify-start"
          onClick={handleSignOut}
        >
          <LogOut className="w-4 h-4 mr-2" />
          Sign Out
        </Button>
      </div>
    </>
  );

  return (
    <>
      <GlobalSearch
        open={searchOpen}
        onOpenChange={setSearchOpen}
        userRole="counselor"
        userId={user?.id}
      />

      <aside className="hidden md:flex w-64 flex-col bg-background/95 backdrop-blur-sm border-r border-border/20">
        <SidebarContent />
      </aside>
    </>
  );
}
