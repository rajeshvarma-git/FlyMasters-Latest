import { useState, useEffect } from 'react';
import { useAuth } from '@student/hooks/useAuth';
import { supabase } from '@student/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@student/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@student/components/ui/tabs';
import { Button } from '@student/components/ui/button';
import { Badge } from '@student/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@student/components/ui/select';
import { Calendar } from '@student/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@student/components/ui/popover';
import { 
  BarChart3, 
  Users, 
  FileText, 
  TrendingUp, 
  TrendingDown,
  DollarSign,
  MessageCircle,
  Globe,
  CalendarIcon,
  Download,
  RefreshCw,
  Filter
} from 'lucide-react';
import { 
  AreaChart, 
  Area, 
  BarChart, 
  Bar, 
  LineChart, 
  Line, 
  PieChart, 
  Pie, 
  Cell,
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  Legend, 
  ResponsiveContainer 
} from 'recharts';
import { format, subDays, startOfMonth, endOfMonth } from 'date-fns';
import { cn } from '@student/lib/utils';

interface AnalyticsData {
  totalLeads: number;
  newLeadsToday: number;
  totalDocuments: number;
  pendingDocuments: number;
  approvedDocuments: number;
  rejectedDocuments: number;
  totalUsers: number;
  activeUsers: number;
  conversionRate: number;
  avgProcessingTime: number;
  topCountries: Array<{country: string; count: number}>;
  leadsBySource: Array<{source: string; count: number; percentage: number}>;
  documentsOverTime: Array<{date: string; uploaded: number; approved: number; rejected: number}>;
  leadConversionFunnel: Array<{stage: string; count: number; percentage: number}>;
  counselorPerformance: Array<{name: string; leads: number; conversion: number; documents: number}>;
  systemUsage: Array<{date: string; users: number; sessions: number; duration: number}>;
}

const COLORS = ['#8884d8', '#82ca9d', '#ffc658', '#ff7300', '#8dd1e1', '#d084d0'];

export function AnalyticsAdmin() {
  const { userRole } = useAuth();
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [activeTab, setActiveTab] = useState('overview');
  const [dateRange, setDateRange] = useState<{from: Date; to: Date}>({
    from: subDays(new Date(), 30),
    to: new Date()
  });
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    fetchAnalyticsData();
    
    // Set up real-time updates
    const channel = supabase
      .channel('analytics-updates')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'student_leads' }, () => {
        fetchAnalyticsData();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'documents' }, () => {
        fetchAnalyticsData();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [dateRange]);

  const fetchAnalyticsData = async () => {
    try {
      setRefreshing(true);
      
      // Fetch leads data
      const { data: leads } = await supabase
        .from('student_leads')
        .select('*')
        .gte('created_at', dateRange.from.toISOString())
        .lte('created_at', dateRange.to.toISOString());

      // Fetch documents data
      const { data: documents } = await supabase
        .from('documents')
        .select('*')
        .gte('created_at', dateRange.from.toISOString())
        .lte('created_at', dateRange.to.toISOString());

      // Fetch users data
      const { data: profiles } = await supabase
        .from('profiles')
        .select('*');

      // Calculate metrics
      const analyticsData: AnalyticsData = {
        totalLeads: leads?.length || 0,
        newLeadsToday: leads?.filter(l => new Date(l.created_at).toDateString() === new Date().toDateString()).length || 0,
        totalDocuments: documents?.length || 0,
        pendingDocuments: documents?.filter(d => d.status === 'pending').length || 0,
        approvedDocuments: documents?.filter(d => d.status === 'approved').length || 0,
        rejectedDocuments: documents?.filter(d => d.status === 'rejected').length || 0,
        totalUsers: profiles?.length || 0,
        activeUsers: leads?.filter(l => l.status === 'active').length || 0,
        conversionRate: leads?.length ? ((leads.filter(l => l.status === 'converted').length / leads.length) * 100) : 0,
        avgProcessingTime: 2.4, // Mock data - would calculate from actual processing times
        
        // Top countries
        topCountries: getTopCountries(leads || []),
        
        // Lead sources
        leadsBySource: getLeadsBySource(leads || []),
        
        // Documents over time
        documentsOverTime: getDocumentsOverTime(documents || []),
        
        // Conversion funnel
        leadConversionFunnel: getConversionFunnel(leads || []),
        
        // Counselor performance (mock data)
        counselorPerformance: [
          { name: 'Sarah Johnson', leads: 45, conversion: 78, documents: 120 },
          { name: 'Mike Chen', leads: 38, conversion: 82, documents: 95 },
          { name: 'Emily Davis', leads: 52, conversion: 71, documents: 140 },
        ],
        
        // System usage over time (mock data)
        systemUsage: generateSystemUsageData()
      };

      setData(analyticsData);
    } catch (error) {
      console.error('Error fetching analytics:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const getTopCountries = (leads: any[]) => {
    const countryCount = leads.reduce((acc, lead) => {
      const countries = lead.preferred_countries || [];
      countries.forEach((country: string) => {
        acc[country] = (acc[country] || 0) + 1;
      });
      return acc;
    }, {} as Record<string, number>);

    return Object.entries(countryCount)
      .map(([country, count]) => ({ country, count: Number(count) }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);
  };

  const getLeadsBySource = (leads: any[]) => {
    const sources = ['Website', 'Social Media', 'Referral', 'Direct', 'Ads'];
    const total = leads.length;
    
    return sources.map(source => {
      const count = Math.floor(Math.random() * Math.max(1, total / sources.length)) + 5; // Mock data
      return {
        source,
        count,
        percentage: total > 0 ? Math.round((count / total) * 100) : 0
      };
    });
  };

  const getDocumentsOverTime = (documents: any[]) => {
    const days = Array.from({ length: 30 }, (_, i) => {
      const date = subDays(new Date(), 29 - i);
      const dayDocs = documents.filter(d => 
        new Date(d.created_at).toDateString() === date.toDateString()
      );
      
      return {
        date: format(date, 'MMM dd'),
        uploaded: dayDocs.length,
        approved: dayDocs.filter(d => d.status === 'approved').length,
        rejected: dayDocs.filter(d => d.status === 'rejected').length
      };
    });
    
    return days;
  };

  const getConversionFunnel = (leads: any[]) => {
    const total = leads.length;
    const stages = [
      { stage: 'Visitors', count: total + Math.floor(total * 0.5), percentage: 100 },
      { stage: 'Leads', count: total, percentage: total ? 67 : 0 },
      { stage: 'Qualified', count: Math.floor(total * 0.6), percentage: total ? 40 : 0 },
      { stage: 'Documents Submitted', count: Math.floor(total * 0.4), percentage: total ? 27 : 0 },
      { stage: 'Converted', count: Math.floor(total * 0.2), percentage: total ? 13 : 0 }
    ];
    
    return stages;
  };

  const generateSystemUsageData = () => {
    return Array.from({ length: 30 }, (_, i) => {
      const date = subDays(new Date(), 29 - i);
      return {
        date: format(date, 'MMM dd'),
        users: Math.floor(Math.random() * 100) + 50,
        sessions: Math.floor(Math.random() * 200) + 100,
        duration: Math.floor(Math.random() * 30) + 15
      };
    });
  };

  const MetricCard = ({ title, value, change, icon: Icon, trend }: any) => (
    <Card className="glass-card">
      <CardContent className="p-6">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-muted-foreground">{title}</p>
            <p className="text-2xl font-bold">{value}</p>
            {change && (
              <div className={`flex items-center gap-1 text-sm ${trend === 'up' ? 'text-green-600' : 'text-red-600'}`}>
                {trend === 'up' ? <TrendingUp className="w-4 h-4" /> : <TrendingDown className="w-4 h-4" />}
                {change}
              </div>
            )}
          </div>
          <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center">
            <Icon className="w-6 h-6 text-primary" />
          </div>
        </div>
      </CardContent>
    </Card>
  );

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <h2 className="text-2xl font-bold">Analytics Dashboard</h2>
          <div className="animate-pulse h-10 w-24 bg-muted rounded"></div>
        </div>
        
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
          {[...Array(4)].map((_, i) => (
            <Card key={i} className="glass-card animate-pulse">
              <CardContent className="p-6">
                <div className="h-4 bg-muted/20 rounded mb-2"></div>
                <div className="h-8 bg-muted/20 rounded mb-2"></div>
                <div className="h-4 bg-muted/20 rounded w-1/2"></div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header with controls */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h2 className="text-2xl font-bold">Analytics Dashboard</h2>
          <p className="text-muted-foreground">Monitor key metrics and performance indicators</p>
        </div>
        
        <div className="flex items-center gap-2">
          {/* Date Range Picker */}
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" className="gap-2">
                <CalendarIcon className="w-4 h-4" />
                {format(dateRange.from, 'MMM dd')} - {format(dateRange.to, 'MMM dd')}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="end">
              <div className="p-4 space-y-4">
                <div className="grid grid-cols-2 gap-2">
                  <Button 
                    variant="outline" 
                    size="sm"
                    onClick={() => setDateRange({ from: subDays(new Date(), 7), to: new Date() })}
                  >
                    Last 7 days
                  </Button>
                  <Button 
                    variant="outline" 
                    size="sm"
                    onClick={() => setDateRange({ from: subDays(new Date(), 30), to: new Date() })}
                  >
                    Last 30 days
                  </Button>
                  <Button 
                    variant="outline" 
                    size="sm"
                    onClick={() => setDateRange({ from: startOfMonth(new Date()), to: endOfMonth(new Date()) })}
                  >
                    This month
                  </Button>
                  <Button 
                    variant="outline" 
                    size="sm"
                    onClick={() => setDateRange({ from: subDays(new Date(), 90), to: new Date() })}
                  >
                    Last 90 days
                  </Button>
                </div>
              </div>
            </PopoverContent>
          </Popover>

          <Button 
            variant="outline" 
            size="sm" 
            onClick={fetchAnalyticsData}
            disabled={refreshing}
          >
            <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
          </Button>

          <Button variant="outline" size="sm">
            <Download className="w-4 h-4 mr-2" />
            Export
          </Button>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
        <TabsList className="grid w-full grid-cols-2 md:grid-cols-5">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="students">Students</TabsTrigger>
          <TabsTrigger value="documents">Documents</TabsTrigger>
          <TabsTrigger value="marketing">Marketing</TabsTrigger>
          <TabsTrigger value="operations">Operations</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-6">
          {/* Key Metrics */}
          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
            <MetricCard
              title="Total Leads"
              value={data?.totalLeads || 0}
              change="+12.5%"
              trend="up"
              icon={Users}
            />
            <MetricCard
              title="Documents Processed"
              value={data?.totalDocuments || 0}
              change="+8.2%"
              trend="up"
              icon={FileText}
            />
            <MetricCard
              title="Conversion Rate"
              value={`${data?.conversionRate.toFixed(1) || 0}%`}
              change="+2.1%"
              trend="up"
              icon={TrendingUp}
            />
            <MetricCard
              title="Avg Processing Time"
              value={`${data?.avgProcessingTime || 0} days`}
              change="-0.5 days"
              trend="up"
              icon={MessageCircle}
            />
          </div>

          {/* Charts Row */}
          <div className="grid gap-6 lg:grid-cols-2">
            {/* Lead Conversion Funnel */}
            <Card className="glass-card">
              <CardHeader>
                <CardTitle>Lead Conversion Funnel</CardTitle>
                <CardDescription>Track leads through conversion stages</CardDescription>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={data?.leadConversionFunnel || []}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="stage" />
                    <YAxis />
                    <Tooltip />
                    <Bar dataKey="count" fill="#8884d8" />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            {/* Top Countries */}
            <Card className="glass-card">
              <CardHeader>
                <CardTitle>Top Destination Countries</CardTitle>
                <CardDescription>Most popular study destinations</CardDescription>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={300}>
                  <PieChart>
                    <Pie
                      data={data?.topCountries || []}
                      cx="50%"
                      cy="50%"
                      labelLine={false}
                      label={({ country, count }) => `${country}: ${count}`}
                      outerRadius={80}
                      fill="#8884d8"
                      dataKey="count"
                    >
                      {(data?.topCountries || []).map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip />
                  </PieChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="students" className="space-y-6">
          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            <MetricCard
              title="Active Students"
              value={data?.activeUsers || 0}
              icon={Users}
            />
            <MetricCard
              title="New Today"
              value={data?.newLeadsToday || 0}
              icon={TrendingUp}
            />
            <MetricCard
              title="Total Registered"
              value={data?.totalUsers || 0}
              icon={Globe}
            />
          </div>

          <Card className="glass-card">
            <CardHeader>
              <CardTitle>Lead Sources Distribution</CardTitle>
              <CardDescription>Where our leads are coming from</CardDescription>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={400}>
                <AreaChart data={data?.leadsBySource || []}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="source" />
                  <YAxis />
                  <Tooltip />
                  <Area type="monotone" dataKey="count" stroke="#8884d8" fill="#8884d8" />
                </AreaChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="documents" className="space-y-6">
          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            <MetricCard
              title="Pending Review"
              value={data?.pendingDocuments || 0}
              icon={FileText}
            />
            <MetricCard
              title="Approved"
              value={data?.approvedDocuments || 0}
              icon={TrendingUp}
            />
            <MetricCard
              title="Rejected"
              value={data?.rejectedDocuments || 0}
              icon={TrendingDown}
            />
          </div>

          <Card className="glass-card">
            <CardHeader>
              <CardTitle>Document Processing Timeline</CardTitle>
              <CardDescription>Daily document submissions and approvals</CardDescription>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={400}>
                <LineChart data={data?.documentsOverTime || []}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="date" />
                  <YAxis />
                  <Tooltip />
                  <Legend />
                  <Line type="monotone" dataKey="uploaded" stroke="#8884d8" name="Uploaded" />
                  <Line type="monotone" dataKey="approved" stroke="#82ca9d" name="Approved" />
                  <Line type="monotone" dataKey="rejected" stroke="#ff7300" name="Rejected" />
                </LineChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="marketing" className="space-y-6">
          <div className="grid gap-6">
            <Card className="glass-card">
              <CardHeader>
                <CardTitle>Marketing Campaign Performance</CardTitle>
                <CardDescription>ROI and conversion metrics for marketing efforts</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="text-center py-12">
                  <BarChart3 className="w-16 h-16 text-muted-foreground mx-auto mb-4" />
                  <h3 className="text-lg font-semibold mb-2">Marketing Analytics</h3>
                  <p className="text-muted-foreground">
                    Campaign performance data will be available here once marketing campaigns are active.
                  </p>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="operations" className="space-y-6">
          <Card className="glass-card">
            <CardHeader>
              <CardTitle>System Usage Analytics</CardTitle>
              <CardDescription>Monitor system performance and user engagement</CardDescription>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={400}>
                <LineChart data={data?.systemUsage || []}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="date" />
                  <YAxis />
                  <Tooltip />
                  <Legend />
                  <Line type="monotone" dataKey="users" stroke="#8884d8" name="Daily Users" />
                  <Line type="monotone" dataKey="sessions" stroke="#82ca9d" name="Sessions" />
                </LineChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          {userRole === 'super_admin' && (
            <Card className="glass-card">
              <CardHeader>
                <CardTitle>Counselor Performance</CardTitle>
                <CardDescription>Track individual counselor metrics</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {data?.counselorPerformance.map((counselor, index) => (
                    <div key={index} className="flex items-center justify-between p-4 border rounded-lg">
                      <div>
                        <h4 className="font-medium">{counselor.name}</h4>
                        <p className="text-sm text-muted-foreground">
                          {counselor.leads} leads • {counselor.conversion}% conversion • {counselor.documents} docs
                        </p>
                      </div>
                      <Badge className="bg-green-100 text-green-800">
                        {counselor.conversion}%
                      </Badge>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}