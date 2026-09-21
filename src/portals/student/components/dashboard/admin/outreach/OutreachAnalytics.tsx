import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@student/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@student/components/ui/select';
import { Badge } from '@student/components/ui/badge';
import { useToast } from '@student/components/ui/use-toast';
import { supabase } from '@student/integrations/supabase/client';
import { BarChart3, TrendingUp, Mail, Reply, Users, Globe, Calendar, Zap } from 'lucide-react';

interface AnalyticsData {
  totalProspects: number;
  emailsSent: number;
  repliesReceived: number;
  conversions: number;
  replyRate: number;
  conversionRate: number;
  countryBreakdown: { country: string; count: number; }[];
  stageBreakdown: { stage: string; count: number; }[];
  monthlyTrends: { month: string; sent: number; replies: number; }[];
}

export function OutreachAnalytics() {
  const { toast } = useToast();
  const [analytics, setAnalytics] = useState<AnalyticsData>({
    totalProspects: 0,
    emailsSent: 0,
    repliesReceived: 0,
    conversions: 0,
    replyRate: 0,
    conversionRate: 0,
    countryBreakdown: [],
    stageBreakdown: [],
    monthlyTrends: []
  });
  const [loading, setLoading] = useState(true);
  const [timeRange, setTimeRange] = useState('3months');

  useEffect(() => {
    fetchAnalytics();
  }, [timeRange]);

  const fetchAnalytics = async () => {
    try {
      // Fetch prospects data
      const { data: prospects, error: prospectsError } = await supabase
        .from('university_prospects')
        .select('country, status');

      if (prospectsError) throw prospectsError;

      // Fetch conversations data
      const { data: conversations, error: conversationsError } = await supabase
        .from('email_conversations')
        .select('conversation_stage, total_emails, created_at');

      if (conversationsError) throw conversationsError;

      // Calculate analytics
      const totalProspects = prospects?.length || 0;
      const emailsSent = conversations?.reduce((sum, conv) => sum + (conv.total_emails || 0), 0) || 0;
      const repliesReceived = conversations?.filter(conv => 
        ['replied', 'ongoing', 'converted'].includes(conv.conversation_stage)
      ).length || 0;
      const conversions = conversations?.filter(conv => 
        conv.conversation_stage === 'converted'
      ).length || 0;

      const replyRate = emailsSent > 0 ? (repliesReceived / emailsSent) * 100 : 0;
      const conversionRate = totalProspects > 0 ? (conversions / totalProspects) * 100 : 0;

      // Country breakdown
      const countryBreakdown = prospects?.reduce((acc: { [key: string]: number }, prospect) => {
        acc[prospect.country] = (acc[prospect.country] || 0) + 1;
        return acc;
      }, {});

      const formattedCountryBreakdown = Object.entries(countryBreakdown || {})
        .map(([country, count]) => ({ country, count: count as number }))
        .sort((a, b) => b.count - a.count);

      // Stage breakdown
      const stageBreakdown = conversations?.reduce((acc: { [key: string]: number }, conv) => {
        acc[conv.conversation_stage] = (acc[conv.conversation_stage] || 0) + 1;
        return acc;
      }, {});

      const formattedStageBreakdown = Object.entries(stageBreakdown || {})
        .map(([stage, count]) => ({ stage, count: count as number }));

      setAnalytics({
        totalProspects,
        emailsSent,
        repliesReceived,
        conversions,
        replyRate: Math.round(replyRate * 100) / 100,
        conversionRate: Math.round(conversionRate * 100) / 100,
        countryBreakdown: formattedCountryBreakdown,
        stageBreakdown: formattedStageBreakdown,
        monthlyTrends: [] // TODO: Implement monthly trends
      });

    } catch (error) {
      console.error('Error fetching analytics:', error);
      toast({
        title: 'Error',
        description: 'Failed to fetch analytics data',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const getStatusColor = (stage: string) => {
    const colors = {
      initiated: 'bg-yellow-100 text-yellow-800',
      replied: 'bg-blue-100 text-blue-800',
      ongoing: 'bg-purple-100 text-purple-800',
      converted: 'bg-green-100 text-green-800',
      rejected: 'bg-red-100 text-red-800',
      dormant: 'bg-gray-100 text-gray-800'
    };
    return colors[stage as keyof typeof colors] || colors.initiated;
  };

  if (loading) {
    return <div className="p-6">Loading analytics...</div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">Outreach Analytics</h2>
          <p className="text-muted-foreground">Performance insights and campaign metrics</p>
        </div>
        <Select value={timeRange} onValueChange={setTimeRange}>
          <SelectTrigger className="w-[180px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="1month">Last Month</SelectItem>
            <SelectItem value="3months">Last 3 Months</SelectItem>
            <SelectItem value="6months">Last 6 Months</SelectItem>
            <SelectItem value="1year">Last Year</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Key Metrics */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card className="glass-card">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Users className="w-4 h-4" />
              Total Prospects
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-primary">{analytics.totalProspects}</div>
            <p className="text-xs text-muted-foreground">Universities discovered</p>
          </CardContent>
        </Card>
        
        <Card className="glass-card">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Mail className="w-4 h-4" />
              Emails Sent
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-primary">{analytics.emailsSent}</div>
            <p className="text-xs text-muted-foreground">Outreach emails sent</p>
          </CardContent>
        </Card>
        
        <Card className="glass-card">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Reply className="w-4 h-4" />
              Reply Rate
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-primary">{analytics.replyRate}%</div>
            <p className="text-xs text-muted-foreground">{analytics.repliesReceived} replies received</p>
          </CardContent>
        </Card>
        
        <Card className="glass-card">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <TrendingUp className="w-4 h-4" />
              Conversion Rate
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-primary">{analytics.conversionRate}%</div>
            <p className="text-xs text-muted-foreground">{analytics.conversions} partnerships signed</p>
          </CardContent>
        </Card>
      </div>

      {/* Detailed Analytics */}
      <div className="grid gap-6 md:grid-cols-2">
        {/* Country Breakdown */}
        <Card className="glass-card">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Globe className="w-5 h-5" />
              Prospects by Country
            </CardTitle>
            <CardDescription>Geographic distribution of university prospects</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {analytics.countryBreakdown.slice(0, 8).map((item, index) => (
                <div key={item.country} className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="w-3 h-3 rounded-full bg-primary" style={{
                      backgroundColor: `hsl(var(--primary) / ${1 - (index * 0.1)})`
                    }} />
                    <span className="text-sm font-medium">{item.country}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-muted-foreground">{item.count}</span>
                    <div className="w-20 h-2 bg-muted rounded-full overflow-hidden">
                      <div 
                        className="h-full bg-primary transition-all"
                        style={{ 
                          width: `${(item.count / Math.max(...analytics.countryBreakdown.map(c => c.count))) * 100}%` 
                        }}
                      />
                    </div>
                  </div>
                </div>
              ))}
            </div>
            {analytics.countryBreakdown.length === 0 && (
              <p className="text-center text-muted-foreground py-4">No data available</p>
            )}
          </CardContent>
        </Card>

        {/* Conversation Stages */}
        <Card className="glass-card">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <BarChart3 className="w-5 h-5" />
              Conversation Stages
            </CardTitle>
            <CardDescription>Current status of email conversations</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {analytics.stageBreakdown.map((item) => (
                <div key={item.stage} className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className={getStatusColor(item.stage)}>
                      {item.stage.replace('_', ' ')}
                    </Badge>
                  </div>
                  <div className="text-sm font-medium">{item.count}</div>
                </div>
              ))}
            </div>
            {analytics.stageBreakdown.length === 0 && (
              <p className="text-center text-muted-foreground py-4">No conversations yet</p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Performance Insights */}
      <Card className="glass-card">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Zap className="w-5 h-5" />
            Performance Insights
          </CardTitle>
          <CardDescription>AI-powered recommendations to improve outreach</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {analytics.replyRate > 0 ? (
              <div className="p-4 bg-green-50 dark:bg-green-950/20 rounded-lg border border-green-200 dark:border-green-800">
                <div className="flex items-center gap-2 mb-2">
                  <TrendingUp className="w-4 h-4 text-green-600" />
                  <span className="font-medium text-green-800 dark:text-green-200">Good Reply Rate</span>
                </div>
                <p className="text-sm text-green-700 dark:text-green-300">
                  Your {analytics.replyRate}% reply rate is above average. Consider scaling up your outreach efforts.
                </p>
              </div>
            ) : (
              <div className="p-4 bg-yellow-50 dark:bg-yellow-950/20 rounded-lg border border-yellow-200 dark:border-yellow-800">
                <div className="flex items-center gap-2 mb-2">
                  <Calendar className="w-4 h-4 text-yellow-600" />
                  <span className="font-medium text-yellow-800 dark:text-yellow-200">Getting Started</span>
                </div>
                <p className="text-sm text-yellow-700 dark:text-yellow-300">
                  Start your first outreach campaign to begin tracking performance metrics.
                </p>
              </div>
            )}

            {analytics.countryBreakdown.length > 0 && (
              <div className="p-4 bg-blue-50 dark:bg-blue-950/20 rounded-lg border border-blue-200 dark:border-blue-800">
                <div className="flex items-center gap-2 mb-2">
                  <Globe className="w-4 h-4 text-blue-600" />
                  <span className="font-medium text-blue-800 dark:text-blue-200">Top Market</span>
                </div>
                <p className="text-sm text-blue-700 dark:text-blue-300">
                  {analytics.countryBreakdown[0]?.country} has the most prospects ({analytics.countryBreakdown[0]?.count}). 
                  Consider creating region-specific email templates for better engagement.
                </p>
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}