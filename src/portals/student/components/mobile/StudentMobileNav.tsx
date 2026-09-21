import { useState } from 'react';
import { useLocation } from 'react-router-dom';
import {
  GraduationCap,
  BookOpen,
  FileText,
  MessageCircle,
  LayoutGrid,
  User,
  Heart,
  List,
  Phone,
  Bell,
} from 'lucide-react';
import { MobileTabBar, MobileMoreMenu, MobileMoreLink, MobileMoreSection, MobileNavItem } from './MobileTabBar';

const primaryTabs: MobileNavItem[] = [
  { icon: GraduationCap, label: 'Home', path: '/student', end: true },
  { icon: BookOpen, label: 'Universities', path: '/student/universities' },
  { icon: FileText, label: 'Documents', path: '/student/documents' },
  { icon: MessageCircle, label: 'Chat', path: '/student/chat' },
];

const morePaths = [
  '/student/profile',
  '/student/shortlists',
  '/student/applications',
  '/student/telecaller-chat',
  '/student/notifications',
];

interface StudentMobileNavProps {
  unreadCount?: number;
}

export function StudentMobileNav({ unreadCount = 0 }: StudentMobileNavProps) {
  const [moreOpen, setMoreOpen] = useState(false);
  const location = useLocation();
  const isMoreActive = morePaths.some((p) => location.pathname.startsWith(p));

  const close = () => setMoreOpen(false);

  return (
    <>
      <MobileTabBar
        items={primaryTabs}
        moreItem={{ icon: LayoutGrid, label: 'More', path: '' }}
        onMoreClick={() => setMoreOpen(true)}
        isMoreActive={isMoreActive || moreOpen}
        homePath="/student"
      />

      <MobileMoreMenu open={moreOpen} onOpenChange={setMoreOpen} title="Student options">
        <MobileMoreSection>
          <MobileMoreLink icon={User} label="My Profile" to="/student/profile" onClick={close} />
          <MobileMoreLink icon={Heart} label="My Shortlists" to="/student/shortlists" onClick={close} />
          <MobileMoreLink icon={List} label="Applications" to="/student/applications" onClick={close} />
        </MobileMoreSection>

        <MobileMoreSection>
          <MobileMoreLink icon={Phone} label="Telecaller Chat" to="/student/telecaller-chat" onClick={close} />
          <MobileMoreLink icon={Bell} label="Notifications" to="/student/notifications" badge={unreadCount} onClick={close} />
        </MobileMoreSection>
      </MobileMoreMenu>
    </>
  );
}

export function getStudentHeaderTitle(pathname: string): {
  title: string;
  subtitle?: string;
  showBack?: boolean;
  backTo?: string;
} {
  if (pathname === '/student' || pathname === '/dashboard') {
    return { title: 'Student Portal', subtitle: 'Your study abroad journey' };
  }
  if (pathname.startsWith('/student/profile') || pathname.startsWith('/dashboard/profile')) {
    return { title: 'My Profile', showBack: true, backTo: '/student' };
  }
  if (pathname.includes('/universities')) return { title: 'Universities', showBack: true, backTo: '/student' };
  if (pathname.includes('/shortlists')) return { title: 'My Shortlists', showBack: true, backTo: '/student' };
  if (pathname.includes('/documents')) return { title: 'Documents', showBack: true, backTo: '/student' };
  if (pathname.includes('/applications')) return { title: 'Applications', showBack: true, backTo: '/student' };
  if (pathname.includes('/telecaller')) return { title: 'Telecaller Chat', showBack: true, backTo: '/student' };
  if (pathname.includes('/chat')) return { title: 'Counselor Chat', showBack: true, backTo: '/student' };
  if (pathname.includes('/notifications')) return { title: 'Notifications', showBack: true, backTo: '/student' };
  return { title: 'Student Portal' };
}
