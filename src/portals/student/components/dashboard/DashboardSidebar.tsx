import { useState, useEffect } from 'react';
import { useAuth } from '@student/hooks/useAuth';
import { NavLink, useLocation } from 'react-router-dom';
import {
  User,
  FileText,
  Heart,
  MessageCircle,
  Settings,
  LogOut,
  Shield,
  BarChart3,
  GraduationCap,
  Users,
  Bug,
  Database,
  Zap,
  Target,
  Globe,
  Bell,
  Search,
  Command,
  AlertCircle,
  Mail,
  ChevronDown,
} from 'lucide-react';
import { GlobalSearch } from '@student/components/GlobalSearch';
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarTrigger,
  useSidebar,
} from '@student/components/ui/sidebar';
import { Button } from '@student/components/ui/button';
import { Avatar, AvatarFallback } from '@student/components/ui/avatar';

interface SidebarItem {
  title: string;
  url: string;
  icon: React.ComponentType<{ className?: string }>;
  adminOnly?: boolean;
  studentOnly?: boolean;
}

const studentItems: SidebarItem[] = [
  { title: 'Profile', url: '/dashboard', icon: User, studentOnly: true },
  { title: 'Documents', url: '/dashboard/documents', icon: FileText, studentOnly: true },
  { title: 'Favorites', url: '/dashboard/favorites', icon: Heart, studentOnly: true },
  { title: 'Chat History', url: '/dashboard/chat-history', icon: MessageCircle, studentOnly: true },
];

const adminItems: SidebarItem[] = [
  { title: 'Admin Dashboard', url: '/dashboard/admin', icon: Shield, adminOnly: true },
  { title: 'Analytics', url: '/dashboard/admin/analytics', icon: BarChart3, adminOnly: true },
];

const telecallerItems: SidebarItem[] = [
  { title: 'WhatsApp', url: '/dashboard/admin/whatsapp', icon: MessageCircle },
];

export function DashboardSidebar() {
  const { state } = useSidebar();
  const { user, signOut, isAdmin, isTelecaller, roleLoading } = useAuth();
  const location = useLocation();
  const currentPath = location.pathname;
  const collapsed = state === "collapsed";
  const [searchOpen, setSearchOpen] = useState(false);

  // Global keyboard shortcut
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

  // Determine which items to show - avoid flickering during role loading
  const sidebarItems = roleLoading
    ? studentItems
    : isAdmin
      ? adminItems
      : isTelecaller
        ? telecallerItems
        : studentItems;

  const isActive = (path: string) => {
    if (path === '/dashboard') {
      return currentPath === '/dashboard';
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

  const userInitials = user?.email?.[0].toUpperCase() || 'U';
  
  // Show admin items for admins, student items for students
  // const sidebarItems = isAdmin ? adminItems : studentItems;

  return (
    <>
      <GlobalSearch 
        open={searchOpen} 
        onOpenChange={setSearchOpen}
        userRole={isAdmin ? 'admin' : isTelecaller ? 'telecaller' : 'student'}
        userId={user?.id}
      />
      
      <Sidebar className={state === "collapsed" ? "w-16" : "w-64"}>
        <div className="flex items-center gap-3 p-4 border-b border-border/20">
          <div className="w-8 h-8 rounded-full bg-gradient-primary flex items-center justify-center">
            <GraduationCap className="w-5 h-5 text-white" />
          </div>
          {!collapsed && (
            <div>
              <h2 className="font-semibold text-sm">Fly AI Pathfinder</h2>
              <p className="text-xs text-muted-foreground">Dashboard</p>
            </div>
          )}
        </div>

        <SidebarContent className="flex-1">
          {/* Global Search Button */}
          {!collapsed && (
            <div className="px-2 pt-4 pb-2">
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
          )}

          <SidebarGroup>
            <SidebarGroupLabel className={collapsed ? "sr-only" : ""}>
              {isAdmin ? 'Admin Navigation' : isTelecaller ? 'Telecaller Navigation' : 'Navigation'}
            </SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {sidebarItems.map((item) => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton asChild>
                    <NavLink 
                      to={item.url} 
                      end={item.url === '/dashboard' || item.url === '/dashboard/admin'}
                      className={`flex items-center gap-3 px-3 py-2 rounded-lg transition-all ${getNavCls(item.url)}`}
                    >
                      <item.icon className="w-4 h-4 flex-shrink-0" />
                      {!collapsed && <span>{item.title}</span>}
                    </NavLink>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
            </SidebarGroup>
            
            {isAdmin && !collapsed && (
              <div className="px-3 py-2">
                <p className="text-xs text-muted-foreground">
                  Access all admin sections from the dashboard
                </p>
              </div>
            )}
          </SidebarContent>

      <SidebarFooter>
        <div className="p-4 border-t border-border/20">
          <div className="flex items-center gap-3 mb-3">
            <Avatar className="w-8 h-8">
              <AvatarFallback className="bg-primary/10 text-primary text-xs">
                {userInitials}
              </AvatarFallback>
            </Avatar>
            {!collapsed && (
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">
                  {user?.email?.split('@')[0]}
                </p>
                <p className="text-xs text-muted-foreground truncate">
                  {user?.email}
                </p>
              </div>
            )}
          </div>
          
          <div className="flex gap-2">
            <Button
              variant="ghost"
              size="sm"
              className="flex-1"
              onClick={handleSignOut}
            >
              <LogOut className="w-4 h-4" />
              {!collapsed && <span className="ml-2">Sign Out</span>}
            </Button>
          </div>
        </div>
      </SidebarFooter>

        <SidebarTrigger className="absolute -right-3 top-6 z-10" />
      </Sidebar>
    </>
  );
}