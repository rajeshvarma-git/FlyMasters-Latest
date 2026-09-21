import { useState } from 'react';
import { Routes, Route, NavLink, useLocation } from 'react-router-dom';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@student/components/ui/card';
import { Mail, Search, MessageSquare, BarChart3, Settings, Zap } from 'lucide-react';
import { ProspectDiscovery } from './outreach/ProspectDiscovery';
import { EmailTemplates } from './outreach/EmailTemplates';
import { ConversationTracker } from './outreach/ConversationTracker';
import { OutreachAnalytics } from './outreach/OutreachAnalytics';
import { EmailConfiguration } from './outreach/EmailConfiguration';

export function UniversityOutreachAdmin() {
  const location = useLocation();

  const outreachNavItems = [
    { title: 'Prospect Discovery', path: '/dashboard/admin/outreach/prospects', icon: Search },
    { title: 'Email Templates', path: '/dashboard/admin/outreach/templates', icon: Mail },
    { title: 'Conversations', path: '/dashboard/admin/outreach/conversations', icon: MessageSquare },
    { title: 'Analytics', path: '/dashboard/admin/outreach/analytics', icon: BarChart3 },
    { title: 'Configuration', path: '/dashboard/admin/outreach/config', icon: Settings },
  ];

  const isActive = (path: string) => location.pathname === path;

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <div className="w-12 h-12 rounded-full bg-gradient-primary flex items-center justify-center">
          <Zap className="w-6 h-6 text-white" />
        </div>
        <div>
          <h1 className="text-3xl font-bold">University Outreach CRM</h1>
          <p className="text-muted-foreground">AI-powered university partnership management</p>
        </div>
      </div>

      {/* Outreach Navigation */}
      <Card className="glass-card">
        <CardContent className="p-4">
          <nav className="flex gap-2 overflow-x-auto">
            {outreachNavItems.map((item) => (
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

      {/* Outreach Content */}
      <Routes>
        <Route index element={<OutreachDashboard />} />
        <Route path="prospects" element={<ProspectDiscovery />} />
        <Route path="templates" element={<EmailTemplates />} />
        <Route path="conversations" element={<ConversationTracker />} />
        <Route path="analytics" element={<OutreachAnalytics />} />
        <Route path="config" element={<EmailConfiguration />} />
      </Routes>
    </div>
  );
}

function OutreachDashboard() {
  return (
    <div className="space-y-6">
      {/* Key Metrics */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card className="glass-card">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Total Prospects</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-primary">0</div>
            <p className="text-xs text-muted-foreground">+0 from last month</p>
          </CardContent>
        </Card>
        
        <Card className="glass-card">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Active Conversations</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-primary">0</div>
            <p className="text-xs text-muted-foreground">0 pending replies</p>
          </CardContent>
        </Card>
        
        <Card className="glass-card">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Reply Rate</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-primary">0%</div>
            <p className="text-xs text-muted-foreground">This month</p>
          </CardContent>
        </Card>
        
        <Card className="glass-card">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Partnerships</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-primary">0</div>
            <p className="text-xs text-muted-foreground">Signed this quarter</p>
          </CardContent>
        </Card>
      </div>

      {/* Quick Actions */}
      <div className="grid gap-6 md:grid-cols-2">
        <Card className="glass-card hover:shadow-hover transition-all">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Search className="w-5 h-5" />
              Discover New Universities
            </CardTitle>
            <CardDescription>Find and add new university prospects</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground mb-4">
              Use AI to discover universities in target markets and automatically extract contact information.
            </p>
            <NavLink
              to="/dashboard/admin/outreach/prospects"
              className="inline-flex items-center px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors"
            >
              Start Discovery
            </NavLink>
          </CardContent>
        </Card>

        <Card className="glass-card hover:shadow-hover transition-all">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Mail className="w-5 h-5" />
              Launch Email Campaign
            </CardTitle>
            <CardDescription>Create and send personalized outreach emails</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground mb-4">
              Generate AI-powered emails tailored to each region and university type.
            </p>
            <NavLink
              to="/dashboard/admin/outreach/templates"
              className="inline-flex items-center px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors"
            >
              Create Campaign
            </NavLink>
          </CardContent>
        </Card>
      </div>

      {/* Recent Activity */}
      <Card className="glass-card">
        <CardHeader>
          <CardTitle>Recent Activity</CardTitle>
          <CardDescription>Latest outreach activities and responses</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="text-center py-8 text-muted-foreground">
            <MessageSquare className="w-12 h-12 mx-auto mb-4 opacity-50" />
            <p>No recent activity. Start your first outreach campaign to see updates here.</p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}