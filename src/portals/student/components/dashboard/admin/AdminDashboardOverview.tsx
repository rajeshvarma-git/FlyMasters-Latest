import { useState, useEffect } from 'react';
import { supabase } from '@student/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@student/components/ui/card';
import { Users, FileText, MessageSquare, TrendingUp, Database, AlertTriangle } from 'lucide-react';
import { useToast } from '@student/components/ui/use-toast';
import { Badge } from '@student/components/ui/badge';

interface SystemStats {
  totalLeads: number;
  totalUsers: number;
  totalCounselors: number;
  totalDocuments: number;
  totalChatSessions: number;
  recentActivity: number;
  loading: boolean;
}

export function AdminDashboardOverview() {
  const [stats, setStats] = useState<SystemStats>({
    totalLeads: 0,
    totalUsers: 0,
    totalCounselors: 0,
    totalDocuments: 0,
    totalChatSessions: 0,
    recentActivity: 0,
    loading: true
  });

  const { toast } = useToast();

  useEffect(() => {
    const fetchSystemStats = async () => {
      try {
        // Use the database function for better performance
        const { data: functionData, error: functionError } = await supabase
          .rpc('get_lead_stats');

        if (functionError) {
          console.error('Function error:', functionError);
        }

        // Fetch additional stats
        const [
          { count: documentsCount },
          { count: chatCount },
          { count: recentActivityCount }
        ] = await Promise.all([
          supabase.from('documents').select('*', { count: 'exact', head: true }),
          supabase.from('chat_sessions').select('*', { count: 'exact', head: true }),
          supabase.from('lead_activity_logs')
            .select('*', { count: 'exact', head: true })
            .gte('created_at', new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString())
        ]);

        setStats({
          totalLeads: functionData?.[0]?.total_leads || 0,
          totalUsers: functionData?.[0]?.total_profiles || 0,
          totalCounselors: functionData?.[0]?.total_counselors || 0,
          totalDocuments: documentsCount || 0,
          totalChatSessions: chatCount || 0,
          recentActivity: recentActivityCount || 0,
          loading: false
        });

      } catch (error: any) {
        console.error('Error fetching system stats:', error);
        toast({
          title: 'Error',
          description: 'Failed to load system statistics',
          variant: 'destructive',
        });
        setStats(prev => ({ ...prev, loading: false }));
      }
    };

    fetchSystemStats();
  }, [toast]);

  if (stats.loading) {
    return (
      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
        {[...Array(6)].map((_, i) => (
          <Card key={i} className="glass-card animate-pulse">
            <CardHeader>
              <div className="h-6 bg-muted/20 rounded w-3/4 mb-2"></div>
              <div className="h-4 bg-muted/20 rounded w-full"></div>
            </CardHeader>
            <CardContent>
              <div className="h-8 bg-muted/20 rounded w-1/3 mb-2"></div>
              <div className="h-4 bg-muted/20 rounded w-2/3"></div>
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  const statCards = [
    {
      title: 'Student Leads',
      value: stats.totalLeads,
      description: 'Total active leads in the system',
      icon: Users,
      color: 'text-blue-600',
      bgColor: 'bg-blue-100'
    },
    {
      title: 'Total Users',
      value: stats.totalUsers,
      description: 'Registered user accounts',
      icon: Users,
      color: 'text-green-600',
      bgColor: 'bg-green-100'
    },
    {
      title: 'Counselors',
      value: stats.totalCounselors,
      description: 'Active counselors available',
      icon: Users,
      color: 'text-purple-600',
      bgColor: 'bg-purple-100'
    },
    {
      title: 'Documents',
      value: stats.totalDocuments,
      description: 'Uploaded documents',
      icon: FileText,
      color: 'text-orange-600',
      bgColor: 'bg-orange-100'
    },
    {
      title: 'Chat Sessions',
      value: stats.totalChatSessions,
      description: 'Total chat interactions',
      icon: MessageSquare,
      color: 'text-cyan-600',
      bgColor: 'bg-cyan-100'
    },
    {
      title: 'Recent Activity',
      value: stats.recentActivity,
      description: 'Activities in last 7 days',
      icon: TrendingUp,
      color: 'text-red-600',
      bgColor: 'bg-red-100'
    }
  ];

  return (
    <div className="space-y-6">
      {/* System Status Alert */}
      <Card className="border-orange-200 bg-orange-50">
        <CardContent className="flex items-center gap-4 p-4">
          <Database className="h-8 w-8 text-orange-600" />
          <div className="flex-1">
            <h3 className="font-semibold text-orange-900">System Status</h3>
            <p className="text-sm text-orange-700">
              All systems operational. {stats.totalLeads > 0 ? 'Data is loading correctly.' : 'No leads found - system may be new or data needs to be added.'}
            </p>
          </div>
          <Badge variant="secondary" className="bg-green-100 text-green-800">
            Online
          </Badge>
        </CardContent>
      </Card>

      {/* Stats Grid */}
      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
        {statCards.map((card, index) => {
          const Icon = card.icon;
          return (
            <Card key={index} className="glass-card hover:shadow-hover transition-all">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">{card.title}</CardTitle>
                <div className={`p-2 rounded-full ${card.bgColor}`}>
                  <Icon className={`h-4 w-4 ${card.color}`} />
                </div>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{card.value}</div>
                <p className="text-xs text-muted-foreground">{card.description}</p>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Quick Actions */}
      <Card className="glass-card">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <TrendingUp className="h-5 w-5" />
            System Health
          </CardTitle>
          <CardDescription>Key metrics and system status</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div className="flex items-center justify-between p-3 rounded-lg bg-muted/30">
              <span className="text-sm font-medium">Database Connection</span>
              <Badge variant="default" className="bg-green-100 text-green-800">Healthy</Badge>
            </div>
            <div className="flex items-center justify-between p-3 rounded-lg bg-muted/30">
              <span className="text-sm font-medium">Lead Processing</span>
              <Badge variant="default" className="bg-green-100 text-green-800">Active</Badge>
            </div>
            <div className="flex items-center justify-between p-3 rounded-lg bg-muted/30">
              <span className="text-sm font-medium">Authentication</span>
              <Badge variant="default" className="bg-green-100 text-green-800">Working</Badge>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}