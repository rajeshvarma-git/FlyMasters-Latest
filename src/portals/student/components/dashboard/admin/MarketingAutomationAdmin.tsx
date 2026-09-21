import { useState } from 'react';
import { Routes, Route, NavLink, useLocation } from 'react-router-dom';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@student/components/ui/card';
import { MessageSquare, Upload, BarChart3, Settings, Users, Zap, Bot } from 'lucide-react';
import { CampaignCreator } from './marketing/CampaignCreator';
import { StudentDataUploader } from './marketing/StudentDataUploader';
import { MessageTemplates } from './marketing/MessageTemplates';
import { MarketingAnalytics } from './marketing/MarketingAnalytics';
import { EngagementTracking } from './marketing/EngagementTracking';
import { ReengagementFlows } from './marketing/ReengagementFlows';

export function MarketingAutomationAdmin() {
  const location = useLocation();

  const marketingNavItems = [
    { title: 'Campaigns', path: '/dashboard/admin/marketing/campaigns', icon: MessageSquare },
    { title: 'Data Upload', path: '/dashboard/admin/marketing/upload', icon: Upload },
    { title: 'Templates', path: '/dashboard/admin/marketing/templates', icon: Bot },
    { title: 'Engagement', path: '/dashboard/admin/marketing/engagement', icon: Users },
    { title: 'Re-engagement', path: '/dashboard/admin/marketing/flows', icon: Settings },
    { title: 'Analytics', path: '/dashboard/admin/marketing/analytics', icon: BarChart3 },
  ];

  const isActive = (path: string) => location.pathname === path;

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <div className="w-12 h-12 rounded-full bg-gradient-primary flex items-center justify-center">
          <Zap className="w-6 h-6 text-white" />
        </div>
        <div>
          <h1 className="text-3xl font-bold">Marketing Automation</h1>
          <p className="text-muted-foreground">AI-powered student marketing campaigns</p>
        </div>
      </div>

      {/* Marketing Navigation */}
      <Card className="glass-card">
        <CardContent className="p-4">
          <nav className="flex gap-2 overflow-x-auto">
            {marketingNavItems.map((item) => (
              <NavLink
                key={item.path}
                to={item.path}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all whitespace-nowrap ${
                  isActive(item.path)
                    ? 'bg-primary text-primary-foreground'
                    : 'hover:bg-muted text-muted-foreground hover:text-foreground'
                }`}
              >
                <item.icon className="w-4 h-4" />
                {item.title}
              </NavLink>
            ))}
          </nav>
        </CardContent>
      </Card>

      {/* Marketing Content */}
      <Routes>
        <Route index element={<MarketingDashboard />} />
        <Route path="campaigns" element={<CampaignCreator />} />
        <Route path="upload" element={<StudentDataUploader />} />
        <Route path="templates" element={<MessageTemplates />} />
        <Route path="engagement" element={<EngagementTracking />} />
        <Route path="flows" element={<ReengagementFlows />} />
        <Route path="analytics" element={<MarketingAnalytics />} />
      </Routes>
    </div>
  );
}

function MarketingDashboard() {
  return (
    <div className="space-y-6">
      {/* Key Metrics */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card className="glass-card">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Active Campaigns</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-primary">0</div>
            <p className="text-xs text-muted-foreground">Running campaigns</p>
          </CardContent>
        </Card>
        
        <Card className="glass-card">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Total Leads</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-primary">0</div>
            <p className="text-xs text-muted-foreground">Students uploaded</p>
          </CardContent>
        </Card>
        
        <Card className="glass-card">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Messages Sent</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-primary">0</div>
            <p className="text-xs text-muted-foreground">This month</p>
          </CardContent>
        </Card>
        
        <Card className="glass-card">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Response Rate</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-primary">0%</div>
            <p className="text-xs text-muted-foreground">Average engagement</p>
          </CardContent>
        </Card>
      </div>

      {/* Quick Actions */}
      <div className="grid gap-6 md:grid-cols-2">
        <Card className="glass-card hover:shadow-hover transition-all">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <MessageSquare className="w-5 h-5" />
              Create Campaign
            </CardTitle>
            <CardDescription>Launch a new marketing campaign</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground mb-4">
              Create AI-powered campaigns across WhatsApp, SMS, and call channels with automated follow-ups.
            </p>
            <NavLink
              to="/dashboard/admin/marketing/campaigns"
              className="inline-flex items-center px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors"
            >
              Create Campaign
            </NavLink>
          </CardContent>
        </Card>

        <Card className="glass-card hover:shadow-hover transition-all">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Upload className="w-5 h-5" />
              Upload Student Data
            </CardTitle>
            <CardDescription>Import leads from CSV/Excel files</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground mb-4">
              Upload student data with automatic field mapping, validation, and duplicate detection.
            </p>
            <NavLink
              to="/dashboard/admin/marketing/upload"
              className="inline-flex items-center px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors"
            >
              Upload Data
            </NavLink>
          </CardContent>
        </Card>
      </div>

      {/* Recent Activity */}
      <Card className="glass-card">
        <CardHeader>
          <CardTitle>Recent Campaign Activity</CardTitle>
          <CardDescription>Latest marketing activities and performance</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="text-center py-8 text-muted-foreground">
            <MessageSquare className="w-12 h-12 mx-auto mb-4 opacity-50" />
            <p>No campaigns created yet. Start your first marketing campaign to see activity here.</p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}