import { useState, useEffect } from 'react';
import { useAuth } from '@student/hooks/useAuth';
import { NavLink, useLocation } from 'react-router-dom';
import {
  User,
  MessageCircle,
  Phone,
  GraduationCap,
  Bell,
  BookOpen,
  LogOut,
  Heart,
  List,
  FileText,
  Search,
  Command
} from 'lucide-react';
import { Button } from '@student/components/ui/button';
import { Avatar, AvatarFallback } from '@student/components/ui/avatar';
import { Badge } from '@student/components/ui/badge';
import { GlobalSearch } from '@student/components/GlobalSearch';
import { loadStudentInbox } from '@student/lib/studentInbox';

interface StudentNavItem {
  title: string;
  url: string;
  icon: React.ComponentType<{ className?: string }>;
  badge?: number;
}

const studentNavItems: StudentNavItem[] = [
  {
    title: 'Dashboard',
    url: '/student',
    icon: GraduationCap
  },
  {
    title: 'My Profile',
    url: '/student/profile',
    icon: User,
    badge: 0
  },
  {
    title: 'Universities',
    url: '/student/universities',
    icon: BookOpen
  },
  {
    title: 'My Shortlists',
    url: '/student/shortlists',
    icon: Heart
  },
  {
    title: 'Documents',
    url: '/student/documents',
    icon: FileText
  },
  {
    title: 'Applications',
    url: '/student/applications',
    icon: List
  },
  {
    title: 'Counselor Chat',
    url: '/student/chat',
    icon: MessageCircle
  },
  {
    title: 'Telecaller Chat',
    url: '/student/telecaller-chat',
    icon: Phone
  },
  {
    title: 'Notifications',
    url: '/student/notifications',
    icon: Bell
  }
];

export function StudentSidebar() {
  const { user, signOut } = useAuth();
  const location = useLocation();
  const [searchOpen, setSearchOpen] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);

  useEffect(() => {
    if (!user?.id) return;
    const load = async () => {
      try {
        const items = await loadStudentInbox(user.id);
        setUnreadCount(items.filter((item) => !item.is_read).length);
      } catch {
        setUnreadCount(0);
      }
    };
    void load();
    const poll = window.setInterval(() => {
      void load();
    }, 5000);
    return () => window.clearInterval(poll);
  }, [user?.id]);

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.key === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setSearchOpen(true);
      }
    };

    document.addEventListener("keydown", down);
    return () => document.removeEventListener("keydown", down);
  }, []);
  const currentPath = location.pathname;

  const isActive = (path: string) => {
    if (path === '/student') {
      return currentPath === '/student';
    }
    return currentPath.startsWith(path);
  };

  const getNavCls = (path: string) => {
    return isActive(path) 
      ? "bg-primary/10 text-primary font-medium border-r-2 border-primary" 
      : "hover:bg-muted/50 text-muted-foreground hover:text-foreground";
  };

  const handleSignOut = async () => {
    await signOut();
  };

  const userInitials = user?.email?.[0].toUpperCase() || 'S';

  const SidebarContent = () => (
    <>
      {/* Header */}
      <div className="flex items-center gap-3 p-4 border-b border-border/20">
        <div className="w-8 h-8 rounded-full bg-gradient-primary flex items-center justify-center">
          <GraduationCap className="w-5 h-5 text-white" />
        </div>
        <div>
          <h2 className="font-semibold text-sm">Student Portal</h2>
          <p className="text-xs text-muted-foreground">Study Abroad Journey</p>
        </div>
      </div>

      {/* Global Search */}
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

      {/* Navigation Items */}
      <nav className="flex-1 py-4 overflow-y-auto">
        <div className="space-y-1 px-2">
          {studentNavItems.map((item) => (
            <NavLink
              key={item.url}
              to={item.url}
              end={item.url === '/student'}
              className={({ isActive }) => 
                `flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all ${
                  isActive
                    ? "bg-primary/10 text-primary font-medium"
                    : "text-muted-foreground hover:bg-muted/50 hover:text-foreground"
                }`
              }
            >
              <item.icon className="w-4 h-4 flex-shrink-0" />
              <span className="flex-1">{item.title}</span>
              {item.url === '/student/notifications' && unreadCount > 0 && (
                <Badge variant="destructive" className="h-5 min-w-5 flex items-center justify-center text-xs px-1.5">
                  {unreadCount}
                </Badge>
              )}
              {item.url !== '/student/notifications' && item.badge !== undefined && item.badge > 0 && (
                <Badge variant="destructive" className="h-5 min-w-5 flex items-center justify-center text-xs px-1.5">
                  {item.badge}
                </Badge>
              )}
            </NavLink>
          ))}
        </div>
      </nav>

      {/* User Profile & Sign Out */}
      <div className="p-4 border-t border-border/20">
        <div className="flex items-center gap-3 mb-3">
          <Avatar className="w-8 h-8">
            <AvatarFallback className="bg-primary/10 text-primary text-xs">
              {userInitials}
            </AvatarFallback>
          </Avatar>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium truncate">
              {user?.email?.split('@')[0]}
            </p>
            <p className="text-xs text-muted-foreground truncate">
              Student
            </p>
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
        userRole="student"
        userId={user?.id}
      />
      
      {/* Desktop Sidebar only — mobile uses bottom tab bar */}
      <aside className="hidden md:flex w-64 flex-col bg-background/95 backdrop-blur-sm border-r border-border/20">
        <SidebarContent />
      </aside>
    </>
  );
}