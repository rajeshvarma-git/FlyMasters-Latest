import { Routes, Route, NavLink, Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '@student/hooks/useAuth';
import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@student/components/ui/card';
import { Shield, Users, FileText, BarChart3, Bug, Mail, Zap, Target, Globe, AlertCircle, BookOpen, Plane, Tag, Newspaper, MessageCircle } from 'lucide-react';
import { WhatsAppInbox } from '@student/components/whatsapp/WhatsAppInbox';
import { BulkLeadAssignment } from '../admin/BulkLeadAssignment';
import { StudentLeadsAdmin } from '../admin/StudentLeadsAdmin';
import { UserManagement } from '../admin/UserManagement';
import { AnalyticsAdmin } from '../admin/AnalyticsAdmin';
import { AdminDebug } from '../admin/AdminDebug';
import { MarketingAutomationAdmin } from '../admin/MarketingAutomationAdmin';
import { UniversityOutreachAdmin } from '../admin/UniversityOutreachAdmin';
import { StudentShortlistManagement } from '../admin/StudentShortlistManagement';
import { RoleBasedDocumentsAdmin } from '../admin/RoleBasedDocumentsAdmin';
import { ChatMonitoringAdmin } from '../admin/ChatMonitoringAdmin';
import { LeadLifecycleAdmin } from '../admin/LeadLifecycleAdmin';
import WebsiteContentAdmin from '../admin/WebsiteContentAdmin';
import { AdminDashboardOverview } from '../admin/AdminDashboardOverview';
import { HRManagement } from '../admin/HRManagement';
import { StudentDocumentReview } from '../admin/StudentDocumentReview';
import { UnassignedStudentsAdmin } from '../admin/UnassignedStudentsAdmin';
import { MediaManager } from '../admin/MediaManager';
import { DatabaseConnectionTest } from '../admin/DatabaseConnectionTest';
import { CountriesAdmin } from '../admin/CountriesAdmin';
import { UniversitiesAdmin } from '../admin/UniversitiesAdmin';
import { TestPrepSchedulesAdmin } from '../admin/TestPrepSchedulesAdmin';
import TravelServicesAdmin from '../admin/TravelServicesAdmin';
import TravelOffersAdmin from '../admin/TravelOffersAdmin';
import TravelNewsAdmin from '../admin/TravelNewsAdmin';
import TravelManagementAdmin from '../admin/TravelManagementAdmin';
import TravelInquiriesAdmin from '../admin/TravelInquiriesAdmin';
import TravelAnalyticsAdmin from '../admin/TravelAnalyticsAdmin';
import TravelLeadsAdmin from '../admin/TravelLeadsAdmin';
import TravelInventoryAdmin from '../admin/TravelInventoryAdmin';
import TravelEmailCampaignsAdmin from '../admin/TravelEmailCampaignsAdmin';
import TravelDocumentManagementAdmin from '../admin/TravelDocumentManagementAdmin';
import ThomasCookPackagesAdmin from '../admin/ThomasCookPackagesAdmin';

export function AdminSection() {
  const { isAdmin, isTelecaller, loading, roleLoading, user, userRole } = useAuth();
  const location = useLocation();

  // Prevent navigation on window focus/blur
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        console.log('Admin panel visible, maintaining route:', location.pathname);
      }
    };
    
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, [location.pathname]);

  // Show loading state while auth is being determined
  if (loading || roleLoading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-full bg-muted animate-pulse"></div>
          <div>
            <div className="h-8 bg-muted/20 rounded w-48 mb-2 animate-pulse"></div>
            <div className="h-4 bg-muted/20 rounded w-64 animate-pulse"></div>
          </div>
        </div>
        <Card className="glass-card">
          <CardContent className="p-12 text-center">
            <div className="w-16 h-16 bg-muted/20 rounded-full mx-auto mb-4 animate-pulse"></div>
            <div className="h-6 bg-muted/20 rounded w-48 mx-auto mb-2 animate-pulse"></div>
            <div className="h-4 bg-muted/20 rounded w-64 mx-auto animate-pulse"></div>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!isAdmin && !isTelecaller) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-full bg-gradient-primary flex items-center justify-center">
            <Shield className="w-6 h-6 text-white" />
          </div>
          <div>
            <h1 className="text-3xl font-bold">Access Denied</h1>
            <p className="text-muted-foreground">You don't have admin permissions</p>
          </div>
        </div>

        <Card className="glass-card">
          <CardContent className="p-12 text-center">
            <Shield className="w-16 h-16 text-muted-foreground mx-auto mb-4" />
            <h3 className="text-xl font-semibold mb-2">Admin Access Required</h3>
            <p className="text-muted-foreground mb-4">
              You need admin privileges to access this section.
            </p>
            <p className="text-sm text-muted-foreground mb-4">
              Debug Info: User ID: {JSON.stringify(user?.id)}, Role: {JSON.stringify(userRole)}, Is Admin: {JSON.stringify(isAdmin)}
            </p>
            <p className="text-xs text-muted-foreground">
              If you should have admin access, please check the Debug Panel or contact support.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (isTelecaller && !isAdmin) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-full bg-emerald-500/15 text-emerald-600 flex items-center justify-center">
            <MessageCircle className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-3xl font-bold">Telecaller inbox</h1>
            <p className="text-muted-foreground">WhatsApp threads for your assigned leads</p>
          </div>
        </div>
        <Routes>
          <Route path="whatsapp" element={<WhatsAppInbox title="WhatsApp" subtitle="Threads for leads assigned to you" />} />
          <Route path="*" element={<Navigate to="/dashboard/admin/whatsapp" replace />} />
        </Routes>
      </div>
    );
  }

  const adminNavCategories = [
    {
      title: 'Overview',
      items: [
        { title: 'Dashboard', path: '/dashboard/admin', icon: Shield },
        { title: 'Analytics', path: '/dashboard/admin/analytics', icon: BarChart3 },
      ]
    },
    {
      title: 'Student Management',
      items: [
        { title: 'Unassigned Students', path: '/dashboard/admin/unassigned-students', icon: AlertCircle },
        { title: 'Student Leads', path: '/dashboard/admin/leads', icon: Users },
        { title: 'Lead Lifecycle', path: '/dashboard/admin/lead-lifecycle', icon: Users },
        { title: 'Document Review', path: '/dashboard/admin/document-review', icon: FileText },
      ]
    },
    {
      title: 'User & HR',
      items: [
        { title: 'User Management', path: '/dashboard/admin/users', icon: Users },
        { title: 'HR Management', path: '/dashboard/admin/hr', icon: Users },
      ]
    },
    {
      title: 'Communication',
      items: [
        { title: 'Chat Monitoring', path: '/dashboard/admin/chat', icon: Mail },
        { title: 'WhatsApp', path: '/dashboard/admin/whatsapp', icon: MessageCircle },
        { title: 'Marketing Automation', path: '/dashboard/admin/marketing', icon: Zap },
        { title: 'University Outreach', path: '/dashboard/admin/outreach', icon: Target },
      ]
    },
    {
      title: 'Content & Media',
      items: [
        { title: 'Study Destinations', path: '/dashboard/admin/countries', icon: Globe },
        { title: 'Universities Management', path: '/dashboard/admin/universities', icon: Target },
        { title: 'Test Prep Schedules', path: '/dashboard/admin/test-prep', icon: BookOpen },
        { title: 'Website Content', path: '/dashboard/admin/website', icon: Globe },
        { title: 'Documents', path: '/dashboard/admin/documents', icon: FileText },
        { title: 'Media Manager', path: '/dashboard/admin/media', icon: FileText },
      ]
    },
    {
      title: 'Travel Agency',
      items: [
        { title: 'Travel Overview', path: '/dashboard/admin/travel', icon: Plane },
        { title: 'Travel Packages', path: '/dashboard/admin/travel-packages', icon: Tag },
        { title: 'Travel Analytics', path: '/dashboard/admin/travel-analytics', icon: BarChart3 },
        { title: 'Travel Leads', path: '/dashboard/admin/travel-leads', icon: Users },
        { title: 'Inventory Management', path: '/dashboard/admin/travel-inventory', icon: Target },
        { title: 'Email Campaigns', path: '/dashboard/admin/travel-emails', icon: Mail },
        { title: 'Document Management', path: '/dashboard/admin/travel-documents', icon: FileText },
        { title: 'Booking Inquiries', path: '/dashboard/admin/travel-inquiries', icon: Users },
        { title: 'Travel Services', path: '/dashboard/admin/travel-services', icon: Plane },
        { title: 'Travel Offers', path: '/dashboard/admin/travel-offers', icon: Tag },
        { title: 'Travel News', path: '/dashboard/admin/travel-news', icon: Newspaper },
      ]
    },
    {
      title: 'System',
      items: [
        { title: 'Debug Panel', path: '/dashboard/admin/debug', icon: Bug },
      ]
    }
  ];

  const isActive = (path: string) => {
    if (path === '/dashboard/admin') {
      return location.pathname === '/dashboard/admin';
    }
    return location.pathname.startsWith(path);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <div className="w-12 h-12 rounded-full bg-gradient-primary flex items-center justify-center">
          <Shield className="w-6 h-6 text-white" />
        </div>
        <div>
          <h1 className="text-3xl font-bold">Admin Panel</h1>
          <p className="text-muted-foreground">Manage students, documents, and universities</p>
        </div>
      </div>

      {/* Admin Navigation - Categorized Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {adminNavCategories.map((category) => (
          <Card key={category.title} className="glass-card">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-semibold text-muted-foreground">
                {category.title}
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-0">
              <nav className="flex flex-col gap-1">
                {category.items.map((item) => (
                  <NavLink
                    key={item.path}
                    to={item.path}
                    className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all ${
                      isActive(item.path)
                        ? 'bg-primary text-primary-foreground shadow-sm'
                        : 'hover:bg-muted/50 text-foreground'
                    }`}
                  >
                    <item.icon className="w-4 h-4 flex-shrink-0" />
                    <span className="truncate">{item.title}</span>
                  </NavLink>
                ))}
              </nav>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Admin Content */}
      <Routes>
        <Route index element={<AdminDashboardOverview />} />
        <Route path="db-test" element={<DatabaseConnectionTest />} />
        <Route path="unassigned-students" element={<UnassignedStudentsAdmin />} />
        <Route path="bulk-lead-assignment" element={<BulkLeadAssignment />} />
        <Route path="debug" element={<AdminDebug />} />
        <Route path="users" element={<UserManagement />} />
        <Route path="hr" element={<HRManagement />} />
        <Route path="document-review" element={<StudentDocumentReview />} />
        <Route path="lead-lifecycle" element={<LeadLifecycleAdmin />} />
        <Route path="leads" element={<StudentLeadsAdmin />} />
        <Route path="chat/*" element={<ChatMonitoringAdmin />} />
        <Route path="whatsapp" element={<WhatsAppInbox subtitle="All WhatsApp threads across counselors and telecallers" />} />
        <Route path="documents" element={<RoleBasedDocumentsAdmin />} />
        <Route path="media" element={<MediaManager />} />
        <Route path="marketing/*" element={<MarketingAutomationAdmin />} />
        <Route path="outreach/*" element={<UniversityOutreachAdmin />} />
        <Route path="countries" element={<CountriesAdmin />} />
        <Route path="universities" element={<UniversitiesAdmin />} />
        <Route path="test-prep" element={<TestPrepSchedulesAdmin />} />
        <Route path="travel" element={<TravelManagementAdmin />} />
        <Route path="travel-packages" element={<ThomasCookPackagesAdmin />} />
        <Route path="travel-analytics" element={<TravelAnalyticsAdmin />} />
        <Route path="travel-leads" element={<TravelLeadsAdmin />} />
        <Route path="travel-inventory" element={<TravelInventoryAdmin />} />
        <Route path="travel-emails" element={<TravelEmailCampaignsAdmin />} />
        <Route path="travel-documents" element={<TravelDocumentManagementAdmin />} />
        <Route path="travel-inquiries" element={<TravelInquiriesAdmin />} />
        <Route path="travel-services" element={<TravelServicesAdmin />} />
        <Route path="travel-offers" element={<TravelOffersAdmin />} />
        <Route path="travel-news" element={<TravelNewsAdmin />} />
        <Route path="website" element={<WebsiteContentAdmin />} />
        <Route path="analytics" element={<AnalyticsAdmin />} />
        <Route path="shortlist" element={<StudentShortlistManagement />} />
      </Routes>
    </div>
  );
}

export default AdminSection;