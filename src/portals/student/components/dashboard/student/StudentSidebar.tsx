import { NavLink } from 'react-router-dom';
import { GraduationCap, BookOpen, Heart, FileText, List, LogOut, ChevronRight } from 'lucide-react';
import { useAuth } from '@student/hooks/useAuth';
import { studentDisplayName, studentInitials } from './studentIdentity';

/**
 * Desktop sidebar: the logo (top-left) goes to the Dashboard, the menu holds
 * the student's work areas, and the bottom block is the student's name
 * (→ My Profile) with Sign out under it. Messages, Notifications and the
 * profile menu live in the top bar (StudentTopBar); chat also opens from the
 * floating button (StudentChatWidget).
 */

const studentNavItems = [
  { title: 'Dashboard', url: '/student', icon: GraduationCap },
  { title: 'Universities', url: '/student/universities', icon: BookOpen },
  { title: 'My Shortlists', url: '/student/shortlists', icon: Heart },
  { title: 'Documents', url: '/student/documents', icon: FileText },
  { title: 'Applications', url: '/student/applications', icon: List },
];

export function StudentSidebar() {
  const { user, userProfile, signOut } = useAuth();
  const name = studentDisplayName(user, userProfile);

  return (
    <aside className="hidden md:flex w-64 flex-none flex-col bg-background/95 backdrop-blur-sm border-r border-border/20 h-screen sticky top-0">
      <NavLink to="/student" end className="flex h-16 flex-none items-center gap-3 px-4 border-b border-border/20 hover:bg-muted/30">
        <div className="w-9 h-9 rounded-full bg-gradient-primary flex items-center justify-center">
          <GraduationCap className="w-5 h-5 text-white" />
        </div>
        <div>
          <h2 className="font-semibold text-sm">Fly Masters</h2>
          <p className="text-xs text-muted-foreground">Student Portal</p>
        </div>
      </NavLink>

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
      </nav>

      <div className="p-3 border-t border-border/20 space-y-1">
        <NavLink
          to="/student/profile"
          className={({ isActive }) =>
            `flex items-center gap-3 rounded-lg p-2 transition-colors ${isActive ? 'bg-primary/10' : 'bg-muted/40 hover:bg-muted/70'}`
          }
        >
          <span className="flex h-9 w-9 flex-none items-center justify-center rounded-full bg-primary/10 text-xs font-bold text-primary">
            {studentInitials(name)}
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-semibold">{name}</span>
            <span className="block text-xs text-primary">View my profile</span>
          </span>
          <ChevronRight className="h-4 w-4 text-muted-foreground" />
        </NavLink>
        <button
          type="button"
          onClick={() => void signOut()}
          className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-muted-foreground hover:bg-muted/50 hover:text-foreground"
        >
          <LogOut className="h-4 w-4" />
          Sign out
        </button>
      </div>
    </aside>
  );
}
