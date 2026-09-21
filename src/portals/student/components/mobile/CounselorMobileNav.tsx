import { useState } from 'react';
import { useLocation } from 'react-router-dom';
import {
  LayoutDashboard,
  Phone,
  Users,
  MessageCircle,
  LayoutGrid,
  Target,
  FileText,
  Bell,
  User,
  Calendar,
  Clock,
  DollarSign,
} from 'lucide-react';
import { MobileTabBar, MobileMoreMenu, MobileMoreLink, MobileMoreSection, MobileNavItem } from './MobileTabBar';

const primaryTabs: MobileNavItem[] = [
  { icon: LayoutDashboard, label: 'Home', path: '/counselor', end: true },
  { icon: Phone, label: 'Leads', path: '/counselor/leads' },
  { icon: Users, label: 'Students', path: '/counselor/students' },
  { icon: MessageCircle, label: 'Chat', path: '/counselor/chat' },
];

const moreWorkPaths = ['/counselor/whatsapp'];

const morePaths = [
  '/counselor/shortlists',
  '/counselor/documents',
  '/counselor/notifications',
  '/counselor/profile',
  '/counselor/leave',
  '/counselor/attendance',
  '/counselor/salary',
];

export function CounselorMobileNav() {
  const [moreOpen, setMoreOpen] = useState(false);
  const location = useLocation();
  const isMoreActive = [...morePaths, ...moreWorkPaths].some((p) => location.pathname.startsWith(p));

  const close = () => setMoreOpen(false);

  return (
    <>
      <MobileTabBar
        items={primaryTabs}
        moreItem={{ icon: LayoutGrid, label: 'More', path: '' }}
        onMoreClick={() => setMoreOpen(true)}
        isMoreActive={isMoreActive || moreOpen}
        homePath="/counselor"
      />

      <MobileMoreMenu open={moreOpen} onOpenChange={setMoreOpen} title="Counselor options">
        <MobileMoreSection>
          <MobileMoreLink icon={MessageCircle} label="WhatsApp" to="/counselor/whatsapp" onClick={close} />
          <MobileMoreLink icon={Target} label="Shortlists" to="/counselor/shortlists" onClick={close} />
          <MobileMoreLink icon={FileText} label="Documents" to="/counselor/documents" onClick={close} />
          <MobileMoreLink icon={Bell} label="Notifications" to="/counselor/notifications" onClick={close} />
        </MobileMoreSection>

        <MobileMoreSection>
          <MobileMoreLink icon={User} label="My Profile" to="/counselor/profile" onClick={close} />
          <MobileMoreLink icon={Calendar} label="Leave" to="/counselor/leave" onClick={close} />
          <MobileMoreLink icon={Clock} label="Attendance" to="/counselor/attendance" onClick={close} />
          <MobileMoreLink icon={DollarSign} label="Salary" to="/counselor/salary" onClick={close} />
        </MobileMoreSection>
      </MobileMoreMenu>
    </>
  );
}

export function getCounselorHeaderTitle(pathname: string): {
  title: string;
  subtitle?: string;
  showBack?: boolean;
  backTo?: string;
} {
  if (pathname === '/counselor') return { title: 'Counselor Portal', subtitle: 'Fly Masters' };
  if (pathname.includes('/leads')) return { title: 'My Leads', showBack: true, backTo: '/counselor' };
  if (pathname.includes('/students')) return { title: 'My Students', showBack: true, backTo: '/counselor' };
  if (pathname.includes('/shortlists')) return { title: 'Shortlists', showBack: true, backTo: '/counselor' };
  if (pathname.includes('/whatsapp')) return { title: 'WhatsApp', showBack: true, backTo: '/counselor' };
  if (pathname.includes('/chat')) return { title: 'Student Chat', showBack: true, backTo: '/counselor' };
  if (pathname.includes('/documents')) return { title: 'Documents', showBack: true, backTo: '/counselor' };
  if (pathname.includes('/notifications')) return { title: 'Notifications', showBack: true, backTo: '/counselor' };
  if (pathname.includes('/profile')) return { title: 'My Profile', showBack: true, backTo: '/counselor' };
  if (pathname.includes('/leave')) return { title: 'Leave', showBack: true, backTo: '/counselor' };
  if (pathname.includes('/attendance')) return { title: 'Attendance', showBack: true, backTo: '/counselor' };
  if (pathname.includes('/salary')) return { title: 'Salary', showBack: true, backTo: '/counselor' };
  return { title: 'Counselor Portal' };
}
