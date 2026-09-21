import { useState, useEffect } from 'react';
import { Routes, Route, NavLink, useLocation } from 'react-router-dom';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@student/components/ui/card';
import { Badge } from '@student/components/ui/badge';
import { Button } from '@student/components/ui/button';
import { Input } from '@student/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@student/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@student/components/ui/tabs';
import { supabase } from '@student/integrations/supabase/client';
import {
  MessageCircle,
  Users,
  Clock,
  Activity,
  Search,
  Filter,
  Download,
  Eye,
  AlertCircle,
  TrendingUp,
  Calendar,
  RefreshCw,
  BarChart3,
} from 'lucide-react';

interface ChatSession {
  id: string;
  user_id: string | null;
  current_stage: number;
  conversation_data: any;
  is_completed: boolean;
  created_at: string;
  updated_at: string;
  session_id: string;
  messages?: ChatMessage[];
}

interface ChatMessage {
  id: string;
  session_id: string;
  message_type: 'user' | 'ai';
  content: string;
  metadata: any;
  created_at: string;
}

interface ChatAnalytics {
  totalSessions: number;
  activeSessions: number;
  completedSessions: number;
  averageMessages: number;
  averageCompletion: number;
  popularStages: { stage: number; count: number }[];
}

export function ChatMonitoringAdmin() {
  const location = useLocation();
  
  const navItems = [
    { title: 'Overview', path: '/dashboard/admin/chat', icon: Activity },
    { title: 'Active Sessions', path: '/dashboard/admin/chat/active', icon: Users },
    { title: 'Chat History', path: '/dashboard/admin/chat/history', icon: MessageCircle },
    { title: 'Analytics', path: '/dashboard/admin/chat/analytics', icon: TrendingUp },
  ];

  const isActive = (path: string) => {
    if (path === '/dashboard/admin/chat') {
      return location.pathname === '/dashboard/admin/chat';
    }
    return location.pathname.startsWith(path);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <div className="w-12 h-12 rounded-full bg-gradient-primary flex items-center justify-center">
          <MessageCircle className="w-6 h-6 text-white" />
        </div>
        <div>
          <h1 className="text-3xl font-bold">Chat Monitoring</h1>
          <p className="text-muted-foreground">Monitor and analyze all chat interactions</p>
        </div>
      </div>

      {/* Navigation */}
      <Card className="glass-card">
        <CardContent className="p-4">
          <nav className="flex gap-2 overflow-x-auto">
            {navItems.map((item) => (
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

      {/* Content */}
      <Routes>
        <Route index element={<ChatOverview />} />
        <Route path="active" element={<ActiveSessions />} />
        <Route path="history" element={<ChatHistory />} />
        <Route path="analytics" element={<ChatAnalytics />} />
      </Routes>
    </div>
  );
}

function ChatOverview() {
  const [stats, setStats] = useState({
    totalSessions: 0,
    activeSessions: 0,
    completedSessions: 0,
    totalMessages: 0,
    loading: true
  });

  useEffect(() => {
    fetchOverviewStats();
  }, []);

  const fetchOverviewStats = async () => {
    try {
      // Fetch chat sessions stats
      const [
        { count: totalSessions },
        { count: activeSessions },
        { count: completedSessions },
        { count: totalMessages }
      ] = await Promise.all([
        supabase.from('chat_sessions').select('*', { count: 'exact', head: true }),
        supabase.from('chat_sessions').select('*', { count: 'exact', head: true }).eq('is_completed', false),
        supabase.from('chat_sessions').select('*', { count: 'exact', head: true }).eq('is_completed', true),
        supabase.from('chat_messages').select('*', { count: 'exact', head: true })
      ]);

      setStats({
        totalSessions: totalSessions || 0,
        activeSessions: activeSessions || 0,
        completedSessions: completedSessions || 0,
        totalMessages: totalMessages || 0,
        loading: false
      });
    } catch (error) {
      console.error('Error fetching chat stats:', error);
      setStats(prev => ({ ...prev, loading: false }));
    }
  };

  if (stats.loading) {
    return (
      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
        {[...Array(4)].map((_, i) => (
          <Card key={i} className="glass-card animate-pulse">
            <CardHeader>
              <div className="h-6 bg-muted/20 rounded w-3/4 mb-2"></div>
              <div className="h-4 bg-muted/20 rounded w-full"></div>
            </CardHeader>
            <CardContent>
              <div className="h-8 bg-muted/20 rounded w-1/3"></div>
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
        <Card className="glass-card hover:shadow-hover transition-all">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-sm font-medium">
              <MessageCircle className="w-4 h-4 text-primary" />
              Total Sessions
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.totalSessions}</div>
            <p className="text-xs text-muted-foreground">All time chat sessions</p>
          </CardContent>
        </Card>

        <Card className="glass-card hover:shadow-hover transition-all">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-sm font-medium">
              <Activity className="w-4 h-4 text-green-500" />
              Active Sessions
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">{stats.activeSessions}</div>
            <p className="text-xs text-muted-foreground">Currently ongoing chats</p>
          </CardContent>
        </Card>

        <Card className="glass-card hover:shadow-hover transition-all">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-sm font-medium">
              <Clock className="w-4 h-4 text-blue-500" />
              Completed Sessions
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-blue-600">{stats.completedSessions}</div>
            <p className="text-xs text-muted-foreground">Successfully finished</p>
          </CardContent>
        </Card>

        <Card className="glass-card hover:shadow-hover transition-all">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-sm font-medium">
              <MessageCircle className="w-4 h-4 text-purple-500" />
              Total Messages
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-purple-600">{stats.totalMessages}</div>
            <p className="text-xs text-muted-foreground">Messages exchanged</p>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <Card className="glass-card">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Activity className="w-5 h-5" />
              Quick Actions
            </CardTitle>
            <CardDescription>Common monitoring tasks</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <Button variant="outline" className="w-full justify-start" asChild>
              <NavLink to="/dashboard/admin/chat/active">
                <Users className="w-4 h-4 mr-2" />
                View Active Sessions
              </NavLink>
            </Button>
            <Button variant="outline" className="w-full justify-start" asChild>
              <NavLink to="/dashboard/admin/chat/analytics">
                <TrendingUp className="w-4 h-4 mr-2" />
                View Analytics
              </NavLink>
            </Button>
            <Button variant="outline" className="w-full justify-start" onClick={fetchOverviewStats}>
              <RefreshCw className="w-4 h-4 mr-2" />
              Refresh Stats
            </Button>
          </CardContent>
        </Card>

        <Card className="glass-card">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <AlertCircle className="w-5 h-5" />
              Monitoring Alerts
            </CardTitle>
            <CardDescription>System status and alerts</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              <div className="flex items-center gap-2 p-3 bg-green-50 dark:bg-green-950/20 rounded-lg border border-green-200 dark:border-green-800">
                <div className="w-2 h-2 bg-green-500 rounded-full"></div>
                <span className="text-sm text-green-700 dark:text-green-300">All systems operational</span>
              </div>
              <div className="text-sm text-muted-foreground">
                Last updated: {new Date().toLocaleTimeString()}
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function ActiveSessions() {
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchActiveSessions();
    
    // Set up real-time subscription for active sessions
    const channel = supabase
      .channel('active-sessions')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'chat_sessions' }, () => {
        fetchActiveSessions();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const fetchActiveSessions = async () => {
    try {
      const { data, error } = await supabase
        .from('chat_sessions')
        .select('*')
        .eq('is_completed', false)
        .order('updated_at', { ascending: false });

      if (error) throw error;
      setSessions(data || []);
    } catch (error) {
      console.error('Error fetching active sessions:', error);
    } finally {
      setLoading(false);
    }
  };

  const getStageLabel = (stage: number) => {
    const stages = {
      1: 'Country Selection',
      2: 'Educational Background',
      3: 'Stream/Program',
      4: 'Academic Score',
      5: 'Budget Discussion',
      6: 'Contact Details',
      7: 'OTP Verification',
      8: 'Results Display'
    };
    return stages[stage] || `Stage ${stage}`;
  };

  if (loading) {
    return (
      <div className="space-y-4">
        {[...Array(3)].map((_, i) => (
          <Card key={i} className="glass-card animate-pulse">
            <CardContent className="p-6">
              <div className="space-y-3">
                <div className="flex justify-between items-center">
                  <div className="h-4 bg-muted/20 rounded w-1/4"></div>
                  <div className="h-6 bg-muted/20 rounded w-20"></div>
                </div>
                <div className="h-3 bg-muted/20 rounded w-3/4"></div>
                <div className="h-3 bg-muted/20 rounded w-1/2"></div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold">Active Sessions ({sessions.length})</h2>
        <Button onClick={fetchActiveSessions} variant="outline" size="sm">
          <RefreshCw className="w-4 h-4 mr-2" />
          Refresh
        </Button>
      </div>

      {sessions.length === 0 ? (
        <Card className="glass-card">
          <CardContent className="p-12 text-center">
            <MessageCircle className="w-16 h-16 text-muted-foreground mx-auto mb-4" />
            <h3 className="text-xl font-semibold mb-2">No Active Sessions</h3>
            <p className="text-muted-foreground">There are currently no ongoing chat sessions.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {sessions.map((session) => (
            <Card key={session.id} className="glass-card hover:shadow-hover transition-all">
              <CardContent className="p-6">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
                      <MessageCircle className="w-4 h-4 text-primary" />
                    </div>
                    <div>
                      <h3 className="font-semibold">Session {session.session_id}</h3>
                      <p className="text-sm text-muted-foreground">
                        Started {new Date(session.created_at).toLocaleString()}
                      </p>
                    </div>
                  </div>
                  <Badge variant="secondary" className="bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300">
                    Active
                  </Badge>
                </div>

                <div className="space-y-2">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">Current Stage:</span>
                    <Badge variant="outline">{getStageLabel(session.current_stage)}</Badge>
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">User ID:</span>
                    <span className="font-mono">{session.user_id || 'Anonymous'}</span>
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">Last Updated:</span>
                    <span>{new Date(session.updated_at).toLocaleString()}</span>
                  </div>
                </div>

                <div className="mt-4 pt-4 border-t border-border/20">
                  <div className="flex gap-2">
                    <Button variant="outline" size="sm">
                      <Eye className="w-4 h-4 mr-2" />
                      View Details
                    </Button>
                    <Button variant="outline" size="sm">
                      <MessageCircle className="w-4 h-4 mr-2" />
                      View Messages
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

function ChatHistory() {
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterStatus, setFilterStatus] = useState('all');
  const [filterStage, setFilterStage] = useState('all');

  useEffect(() => {
    fetchChatHistory();
  }, [filterStatus, filterStage]);

  const fetchChatHistory = async () => {
    try {
      let query = supabase
        .from('chat_sessions')
        .select('*')
        .order('updated_at', { ascending: false })
        .limit(100);

      if (filterStatus !== 'all') {
        query = query.eq('is_completed', filterStatus === 'completed');
      }

      if (filterStage !== 'all') {
        query = query.eq('current_stage', parseInt(filterStage));
      }

      const { data, error } = await query;
      if (error) throw error;

      setSessions(data || []);
    } catch (error) {
      console.error('Error fetching chat history:', error);
    } finally {
      setLoading(false);
    }
  };

  const filteredSessions = sessions.filter(session =>
    session.session_id.toLowerCase().includes(searchTerm.toLowerCase()) ||
    (session.user_id && session.user_id.toLowerCase().includes(searchTerm.toLowerCase()))
  );

  const getStageLabel = (stage: number) => {
    const stages = {
      1: 'Country Selection',
      2: 'Educational Background', 
      3: 'Stream/Program',
      4: 'Academic Score',
      5: 'Budget Discussion',
      6: 'Contact Details',
      7: 'OTP Verification',
      8: 'Results Display'
    };
    return stages[stage] || `Stage ${stage}`;
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold">Chat History</h2>
        <Button variant="outline" size="sm">
          <Download className="w-4 h-4 mr-2" />
          Export Data
        </Button>
      </div>

      {/* Filters */}
      <Card className="glass-card">
        <CardContent className="p-4">
          <div className="flex gap-4 flex-wrap">
            <div className="flex-1 min-w-[200px]">
              <Input
                placeholder="Search by session ID or user ID..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full"
              />
            </div>
            <Select value={filterStatus} onValueChange={setFilterStatus}>
              <SelectTrigger className="w-[150px]">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Status</SelectItem>
                <SelectItem value="completed">Completed</SelectItem>
                <SelectItem value="active">Active</SelectItem>
              </SelectContent>
            </Select>
            <Select value={filterStage} onValueChange={setFilterStage}>
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="Stage" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Stages</SelectItem>
                {[...Array(8)].map((_, i) => (
                  <SelectItem key={i + 1} value={(i + 1).toString()}>
                    Stage {i + 1}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button variant="outline" onClick={fetchChatHistory}>
              <RefreshCw className="w-4 h-4 mr-2" />
              Refresh
            </Button>
          </div>
        </CardContent>
      </Card>

      {loading ? (
        <div className="space-y-4">
          {[...Array(5)].map((_, i) => (
            <Card key={i} className="glass-card animate-pulse">
              <CardContent className="p-6">
                <div className="space-y-3">
                  <div className="flex justify-between items-center">
                    <div className="h-4 bg-muted/20 rounded w-1/4"></div>
                    <div className="h-6 bg-muted/20 rounded w-20"></div>
                  </div>
                  <div className="h-3 bg-muted/20 rounded w-3/4"></div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        <div className="space-y-4">
          {filteredSessions.map((session) => (
            <Card key={session.id} className="glass-card hover:shadow-hover transition-all">
              <CardContent className="p-6">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
                      <MessageCircle className="w-4 h-4 text-primary" />
                    </div>
                    <div>
                      <h3 className="font-semibold">Session {session.session_id}</h3>
                      <p className="text-sm text-muted-foreground">
                        {new Date(session.created_at).toLocaleString()}
                      </p>
                    </div>
                  </div>
                  <Badge variant={session.is_completed ? "default" : "secondary"}>
                    {session.is_completed ? 'Completed' : 'Active'}
                  </Badge>
                </div>

                <div className="grid gap-2 md:grid-cols-2">
                  <div className="text-sm">
                    <span className="text-muted-foreground">Stage:</span>
                    <span className="ml-2 font-medium">{getStageLabel(session.current_stage)}</span>
                  </div>
                  <div className="text-sm">
                    <span className="text-muted-foreground">User:</span>
                    <span className="ml-2 font-mono text-xs">{session.user_id || 'Anonymous'}</span>
                  </div>
                </div>

                <div className="mt-4 pt-4 border-t border-border/20">
                  <div className="flex gap-2">
                    <Button variant="outline" size="sm">
                      <Eye className="w-4 h-4 mr-2" />
                      View Details
                    </Button>
                    <Button variant="outline" size="sm">
                      <MessageCircle className="w-4 h-4 mr-2" />
                      View Messages  
                    </Button>
                    <Button variant="outline" size="sm">
                      <Download className="w-4 h-4 mr-2" />
                      Export
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

function ChatAnalytics() {
  const [analytics, setAnalytics] = useState<ChatAnalytics | null>(null);
  const [loading, setLoading] = useState(true);
  const [dateRange, setDateRange] = useState('7d');

  useEffect(() => {
    fetchChatAnalytics();
  }, [dateRange]);

  const fetchChatAnalytics = async () => {
    try {
      const { data: sessions, error } = await supabase
        .from('chat_sessions')
        .select('*, chat_messages(count)')
        .order('created_at', { ascending: false });

      if (error) throw error;

      const totalSessions = sessions?.length || 0;
      const activeSessions = sessions?.filter(s => !s.is_completed).length || 0;
      const completedSessions = sessions?.filter(s => s.is_completed).length || 0;

      // Calculate stage distribution
      const stageCount: { [key: number]: number } = {};
      sessions?.forEach(session => {
        stageCount[session.current_stage] = (stageCount[session.current_stage] || 0) + 1;
      });

      const popularStages = Object.entries(stageCount)
        .map(([stage, count]) => ({ stage: parseInt(stage), count }))
        .sort((a, b) => b.count - a.count);

      const analyticsData: ChatAnalytics = {
        totalSessions,
        activeSessions,
        completedSessions,
        averageMessages: 0, // Would need to calculate from messages
        averageCompletion: completedSessions / totalSessions * 100,
        popularStages
      };

      setAnalytics(analyticsData);
    } catch (error) {
      console.error('Error fetching chat analytics:', error);
    } finally {
      setLoading(false);
    }
  };

  const getStageLabel = (stage: number) => {
    const stages = {
      1: 'Country Selection',
      2: 'Educational Background',
      3: 'Stream/Program', 
      4: 'Academic Score',
      5: 'Budget Discussion',
      6: 'Contact Details',
      7: 'OTP Verification',
      8: 'Results Display'
    };
    return stages[stage] || `Stage ${stage}`;
  };

  if (loading || !analytics) {
    return (
      <div className="space-y-6">
        <div className="grid gap-6 md:grid-cols-3">
          {[...Array(3)].map((_, i) => (
            <Card key={i} className="glass-card animate-pulse">
              <CardHeader>
                <div className="h-6 bg-muted/20 rounded w-3/4"></div>
              </CardHeader>
              <CardContent>
                <div className="h-8 bg-muted/20 rounded w-1/2"></div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold">Chat Analytics</h2>
        <div className="flex gap-2">
          <Select value={dateRange} onValueChange={setDateRange}>
            <SelectTrigger className="w-[120px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="7d">Last 7 days</SelectItem>
              <SelectItem value="30d">Last 30 days</SelectItem>
              <SelectItem value="90d">Last 90 days</SelectItem>
              <SelectItem value="all">All time</SelectItem>
            </SelectContent>
          </Select>
          <Button variant="outline" size="sm" onClick={fetchChatAnalytics}>
            <RefreshCw className="w-4 h-4 mr-2" />
            Refresh
          </Button>
        </div>
      </div>

      {/* Key Metrics */}
      <div className="grid gap-6 md:grid-cols-3">
        <Card className="glass-card">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <MessageCircle className="w-5 h-5 text-blue-500" />
              Completion Rate
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-blue-600">
              {analytics.averageCompletion.toFixed(1)}%
            </div>
            <p className="text-sm text-muted-foreground">
              {analytics.completedSessions} of {analytics.totalSessions} sessions completed
            </p>
          </CardContent>
        </Card>

        <Card className="glass-card">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Activity className="w-5 h-5 text-green-500" />
              Active Sessions
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-green-600">{analytics.activeSessions}</div>
            <p className="text-sm text-muted-foreground">Currently in progress</p>
          </CardContent>
        </Card>

        <Card className="glass-card">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <TrendingUp className="w-5 h-5 text-purple-500" />
              Total Sessions
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-purple-600">{analytics.totalSessions}</div>
            <p className="text-sm text-muted-foreground">All time total</p>
          </CardContent>
        </Card>
      </div>

      {/* Stage Distribution */}
      <Card className="glass-card">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <BarChart3 className="w-5 h-5" />
            Stage Distribution
          </CardTitle>
          <CardDescription>Where users are in the conversation flow</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {analytics.popularStages.slice(0, 5).map((stage, index) => (
              <div key={stage.stage} className="flex items-center gap-4">
                <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-sm font-medium">
                  {stage.stage}
                </div>
                <div className="flex-1">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-sm font-medium">{getStageLabel(stage.stage)}</span>
                    <span className="text-sm text-muted-foreground">{stage.count} sessions</span>
                  </div>
                  <div className="w-full bg-muted rounded-full h-2">
                    <div
                      className="bg-primary rounded-full h-2 transition-all"
                      style={{
                        width: `${(stage.count / analytics.totalSessions) * 100}%`
                      }}
                    />
                  </div>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}