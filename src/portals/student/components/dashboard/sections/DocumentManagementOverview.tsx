import { useState, useEffect } from 'react';
import { supabase } from '@student/integrations/supabase/client';
import { useAuth } from '@student/hooks/useAuth';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@student/components/ui/card';
import { Badge } from '@student/components/ui/badge';
import { Progress } from '@student/components/ui/progress';
import { Button } from '@student/components/ui/button';
import { NavLink } from 'react-router-dom';
import { FileText, Clock, CheckCircle2, AlertCircle, History, Bell, TrendingUp, ArrowRight } from 'lucide-react';

export function DocumentManagementOverview() {
  const { user } = useAuth();
  const [stats, setStats] = useState({
    totalDocuments: 0,
    pendingDocuments: 0,
    approvedDocuments: 0,
    rejectedDocuments: 0,
    totalVersions: 0,
    unreadNotifications: 0,
    completionPercentage: 0,
    loading: true
  });

  useEffect(() => {
    if (user) {
      fetchStats();
    }
  }, [user]);

  const fetchStats = async () => {
    try {
      // Fetch document counts
      const { count: totalDocs } = await supabase
        .from('documents')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', user?.id)
        .eq('archived', false);

      const { count: pendingDocs } = await supabase
        .from('documents')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', user?.id)
        .eq('status', 'pending')
        .eq('archived', false);

      const { count: approvedDocs } = await supabase
        .from('documents')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', user?.id)
        .eq('status', 'approved')
        .eq('archived', false);

      const { count: rejectedDocs } = await supabase
        .from('documents')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', user?.id)
        .eq('status', 'rejected')
        .eq('archived', false);

      // Fetch version count
      const { count: versionsCount } = await supabase
        .from('document_versions')
        .select('*', { count: 'exact', head: true })
        .eq('uploaded_by', user?.id);

      // Fetch unread notifications
      const { count: notificationsCount } = await supabase
        .from('document_notifications')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', user?.id)
        .eq('is_read', false);

      // Calculate completion percentage
      const completionPercentage = totalDocs > 0 ? Math.round((approvedDocs || 0) / totalDocs * 100) : 0;

      setStats({
        totalDocuments: totalDocs || 0,
        pendingDocuments: pendingDocs || 0,
        approvedDocuments: approvedDocs || 0,
        rejectedDocuments: rejectedDocs || 0,
        totalVersions: versionsCount || 0,
        unreadNotifications: notificationsCount || 0,
        completionPercentage,
        loading: false
      });
    } catch (error) {
      console.error('Error fetching document stats:', error);
      setStats(prev => ({ ...prev, loading: false }));
    }
  };

  if (stats.loading) {
    return (
      <Card className="glass-card animate-pulse">
        <CardContent className="p-6">
          <div className="h-6 bg-muted/20 rounded w-1/3 mb-2"></div>
          <div className="h-4 bg-muted/20 rounded w-1/2 mb-4"></div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* Main Document Progress Card */}
      <Card className="glass-card">
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <FileText className="w-5 h-5" />
                Document Management Overview
              </CardTitle>
              <CardDescription>
                Your enhanced document management system with version control and tracking
              </CardDescription>
            </div>
            <NavLink 
              to="/dashboard/documents" 
              className="inline-flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors text-sm"
            >
              Open Documents <ArrowRight className="w-4 h-4" />
            </NavLink>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Progress Bar */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium">Application Progress</span>
              <span className="text-sm font-bold text-primary">{stats.completionPercentage}%</span>
            </div>
            <Progress value={stats.completionPercentage} className="h-2" />
          </div>

          {/* Stats Grid */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="text-center p-3 bg-muted/20 rounded-lg">
              <div className="text-2xl font-bold text-primary">{stats.totalDocuments}</div>
              <div className="text-xs text-muted-foreground">Total Documents</div>
            </div>
            <div className="text-center p-3 bg-success/10 rounded-lg">
              <div className="text-2xl font-bold text-success">{stats.approvedDocuments}</div>
              <div className="text-xs text-muted-foreground">Approved</div>
            </div>
            <div className="text-center p-3 bg-warning/10 rounded-lg">
              <div className="text-2xl font-bold text-warning">{stats.pendingDocuments}</div>
              <div className="text-xs text-muted-foreground">Pending</div>
            </div>
            <div className="text-center p-3 bg-destructive/10 rounded-lg">
              <div className="text-2xl font-bold text-destructive">{stats.rejectedDocuments}</div>
              <div className="text-xs text-muted-foreground">Rejected</div>
            </div>
          </div>

          {/* Feature Highlights */}
          <div className="flex flex-wrap gap-2 pt-2">
            <Badge variant="outline" className="bg-primary/10 text-primary border-primary/20">
              <History className="w-3 h-3 mr-1" />
              {stats.totalVersions} Versions
            </Badge>
            {stats.unreadNotifications > 0 && (
              <Badge variant="outline" className="bg-warning/10 text-warning border-warning/20">
                <Bell className="w-3 h-3 mr-1" />
                {stats.unreadNotifications} Notifications
              </Badge>
            )}
            <Badge variant="outline" className="bg-secondary/10 text-secondary-foreground border-secondary/20">
              Version Control
            </Badge>
            <Badge variant="outline" className="bg-secondary/10 text-secondary-foreground border-secondary/20">
              Audit Logs
            </Badge>
            <Badge variant="outline" className="bg-secondary/10 text-secondary-foreground border-secondary/20">
              Progress Tracking
            </Badge>
          </div>
        </CardContent>
      </Card>

      {/* Quick Actions */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card className="glass-card hover:shadow-hover transition-all">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
                <CheckCircle2 className="w-5 h-5 text-primary" />
              </div>
              <div className="flex-1">
                <h4 className="font-medium">Review Status</h4>
                <p className="text-sm text-muted-foreground">Check document approvals</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="glass-card hover:shadow-hover transition-all">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-warning/10 flex items-center justify-center">
                <History className="w-5 h-5 text-warning" />
              </div>
              <div className="flex-1">
                <h4 className="font-medium">Version History</h4>
                <p className="text-sm text-muted-foreground">Manage document versions</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="glass-card hover:shadow-hover transition-all">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-success/10 flex items-center justify-center">
                <TrendingUp className="w-5 h-5 text-success" />
              </div>
              <div className="flex-1">
                <h4 className="font-medium">Progress Tracker</h4>
                <p className="text-sm text-muted-foreground">Monitor completion status</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Alerts */}
      {stats.rejectedDocuments > 0 && (
        <Card className="glass-card border-destructive/20">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <AlertCircle className="w-5 h-5 text-destructive" />
              <div className="flex-1">
                <h4 className="font-medium text-destructive">Action Required</h4>
                <p className="text-sm text-muted-foreground">
                  You have {stats.rejectedDocuments} rejected document{stats.rejectedDocuments > 1 ? 's' : ''} that need to be re-uploaded.
                </p>
              </div>
              <Button size="sm" variant="outline" asChild>
                <NavLink to="/dashboard/documents">
                  View Documents
                </NavLink>
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {stats.pendingDocuments > 0 && (
        <Card className="glass-card border-warning/20">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <Clock className="w-5 h-5 text-warning" />
              <div className="flex-1">
                <h4 className="font-medium text-warning">Under Review</h4>
                <p className="text-sm text-muted-foreground">
                  {stats.pendingDocuments} document{stats.pendingDocuments > 1 ? 's are' : ' is'} currently being reviewed by our team.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}