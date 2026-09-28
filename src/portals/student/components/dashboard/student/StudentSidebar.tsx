import { NavLink } from 'react-router-dom';
import { GraduationCap, BookOpen, Heart, FileText, List, MessageCircle, Phone } from 'lucide-react';
import { whatsappLink } from '@student/lib/contact';

/**
 * Desktop sidebar: the logo (top-left) goes to the Dashboard and the menu holds
 * the student's work areas.
 * Messages, Notifications and the profile menu (My Profile, Sign out) live
 * only in the top bar (StudentTopBar); chat also opens from the floating
 * button (StudentChatWidget). The bottom card is quick contact.
 */

const studentNavItems = [
  { title: 'Dashboard', url: '/student', icon: GraduationCap },
  { title: 'Universities', url: '/student/universities', icon: BookOpen },
  { title: 'My Shortlists', url: '/student/shortlists', icon: Heart },
  { title: 'Documents', url: '/student/documents', icon: FileText },
  { title: 'Applications', url: '/student/applications', icon: List },
];

export function StudentSidebar() {
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

      {/* Profile and Sign out live only in the top-right profile menu. */}
      <div className="m-3 rounded-xl border border-border/40 bg-muted/30 p-3">
        <p className="text-sm font-semibold">Need help?</p>
        <p className="mt-0.5 text-xs text-muted-foreground">Talk to a Fly Masters advisor.</p>
        <div className="mt-2 grid grid-cols-2 gap-2">
          <a
            href={whatsappLink('Hi, I need help with my study abroad application.')}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center justify-center gap-1.5 rounded-lg bg-emerald-600 px-2 py-1.5 text-xs font-medium text-white hover:bg-emerald-700"
          >
            <MessageCircle className="h-3.5 w-3.5" /> WhatsApp
          </a>
          <a
            href="tel:+919259597979"
            className="flex items-center justify-center gap-1.5 rounded-lg border border-border/60 bg-background px-2 py-1.5 text-xs font-medium hover:bg-muted/60"
          >
            <Phone className="h-3.5 w-3.5" /> Call
          </a>
        </div>
      </div>
    </aside>
  );
}
