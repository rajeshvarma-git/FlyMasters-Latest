import { useState, useEffect } from 'react';
import { supabase } from '@student/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@student/components/ui/card';
import { Progress } from '@student/components/ui/progress';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@student/components/ui/select';
import { 
  TrendingUp, 
  TrendingDown, 
  Users, 
  UserCheck,
  Clock,
  Calendar,
  Target,
  Award,
  Activity,
  BarChart3
} from 'lucide-react';
import { format, subDays, startOfDay, endOfDay } from 'date-fns';

interface AnalyticsData {
  totalLeads: number;
  hotLeads: number;
  warmLeads: number;
  coldLeads: number;
  convertedLeads: number;
  conversionRate: number;
  avgTimeToConversion: number;
  leadsThisWeek: number;
  leadsLastWeek: number;
  topCounselors: Array<{
    name: string;
    leadsAssigned: number;
    conversions: number;
    conversionRate: number;
  }>;
  leadsBySource: Array<{
    source: string;
    count: number;
    percentage: number;
  }>;
  leadsByCountry: Array<{
    country: string;
    count: number;
    percentage: number;
  }>;
  dailyTrend: Array<{
    date: string;
    leads: number;
    conversions: number;
  }>;
}

export function LeadAnalytics() {
  const [analytics, setAnalytics] = useState<AnalyticsData>({
    totalLeads: 0,
    hotLeads: 0,
    warmLeads: 0,
    coldLeads: 0,
    convertedLeads: 0,
    conversionRate: 0,
    avgTimeToConversion: 0,
    leadsThisWeek: 0,
    leadsLastWeek: 0,
    topCounselors: [],
    leadsBySource: [],
    leadsByCountry: [],
    dailyTrend: []
  });
  const [loading, setLoading] = useState(true);
  const [dateRange, setDateRange] = useState('30');

  const fetchAnalytics = async () => {
    setLoading(true);
    try {
      const daysBack = parseInt(dateRange);
      const startDate = startOfDay(subDays(new Date(), daysBack));
      const endDate = endOfDay(new Date());

      // Fetch all leads data
      const { data: leads, error: leadsError } = await supabase
        .from('student_leads')
        .select(`
          *,
          profiles:assigned_counselor_id(first_name, last_name)
        `)
        .gte('created_at', startDate.toISOString())
        .lte('created_at', endDate.toISOString());

      if (leadsError) throw leadsError;

      // Fetch all-time data for overall stats
      const { data: allTimeLeads, error: allTimeError } = await supabase
        .from('student_leads')
        .select('*');

      if (allTimeError) throw allTimeError;

      // Calculate analytics
      const totalLeads = allTimeLeads?.length || 0;
      const hotLeads = allTimeLeads?.filter(lead => lead.lead_stage === 'hot').length || 0;
      const warmLeads = allTimeLeads?.filter(lead => lead.lead_stage === 'warm').length || 0;
      const coldLeads = allTimeLeads?.filter(lead => lead.lead_stage === 'cold').length || 0;
      const convertedLeads = allTimeLeads?.filter(lead => lead.lead_stage === 'converted').length || 0;
      
      const conversionRate = totalLeads > 0 ? (convertedLeads / totalLeads) * 100 : 0;

      // Weekly comparison
      const oneWeekAgo = subDays(new Date(), 7);
      const twoWeeksAgo = subDays(new Date(), 14);
      
      const leadsThisWeek = allTimeLeads?.filter(lead => 
        new Date(lead.created_at) >= oneWeekAgo
      ).length || 0;
      
      const leadsLastWeek = allTimeLeads?.filter(lead => {
        const date = new Date(lead.created_at);
        return date >= twoWeeksAgo && date < oneWeekAgo;
      }).length || 0;

      // Average time to conversion (simplified calculation)
      const convertedWithTimes = allTimeLeads?.filter(lead => 
        lead.lead_stage === 'converted' && lead.conversion_date
      ) || [];
      
      const avgTimeToConversion = convertedWithTimes.length > 0
        ? convertedWithTimes.reduce((sum, lead) => {
            const created = new Date(lead.created_at);
            const converted = new Date(lead.conversion_date);
            return sum + (converted.getTime() - created.getTime());
          }, 0) / (convertedWithTimes.length * 24 * 60 * 60 * 1000)
        : 0;

      // Top counselors performance
      const counselorStats = new Map();
      allTimeLeads?.forEach(lead => {
        if (lead.assigned_counselor_id) {
          const counselorId = lead.assigned_counselor_id;
          const existing = counselorStats.get(counselorId) || {
            name: 'Unknown',
            leadsAssigned: 0,
            conversions: 0
          };
          
          existing.leadsAssigned++;
          if (lead.lead_stage === 'converted') {
            existing.conversions++;
          }
          
          // We'll get counselor names separately since the relation is complex
          
          counselorStats.set(counselorId, existing);
        }
      });

      const topCounselors = Array.from(counselorStats.values())
        .map(counselor => ({
          ...counselor,
          conversionRate: counselor.leadsAssigned > 0 
            ? (counselor.conversions / counselor.leadsAssigned) * 100 
            : 0
        }))
        .sort((a, b) => b.conversions - a.conversions)
        .slice(0, 5);

      // Leads by source
      const sourceStats = new Map();
      allTimeLeads?.forEach(lead => {
        const source = lead.lead_source || 'Unknown';
        sourceStats.set(source, (sourceStats.get(source) || 0) + 1);
      });

      const leadsBySource = Array.from(sourceStats.entries())
        .map(([source, count]) => ({
          source,
          count,
          percentage: totalLeads > 0 ? (count / totalLeads) * 100 : 0
        }))
        .sort((a, b) => b.count - a.count);

      // Leads by preferred country
      const countryStats = new Map();
      allTimeLeads?.forEach(lead => {
        lead.preferred_countries?.forEach((country: string) => {
          countryStats.set(country, (countryStats.get(country) || 0) + 1);
        });
      });

      const leadsByCountry = Array.from(countryStats.entries())
        .map(([country, count]) => ({
          country,
          count,
          percentage: totalLeads > 0 ? (count / totalLeads) * 100 : 0
        }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 10);

      // Daily trend (last 7 days)
      const dailyTrend = [];
      for (let i = 6; i >= 0; i--) {
        const date = subDays(new Date(), i);
        const dayStart = startOfDay(date);
        const dayEnd = endOfDay(date);
        
        const dayLeads = allTimeLeads?.filter(lead => {
          const leadDate = new Date(lead.created_at);
          return leadDate >= dayStart && leadDate <= dayEnd;
        }).length || 0;
        
        const dayConversions = allTimeLeads?.filter(lead => {
          if (!lead.conversion_date) return false;
          const conversionDate = new Date(lead.conversion_date);
          return conversionDate >= dayStart && conversionDate <= dayEnd;
        }).length || 0;
        
        dailyTrend.push({
          date: format(date, 'MMM dd'),
          leads: dayLeads,
          conversions: dayConversions
        });
      }

      setAnalytics({
        totalLeads,
        hotLeads,
        warmLeads,
        coldLeads,
        convertedLeads,
        conversionRate,
        avgTimeToConversion,
        leadsThisWeek,
        leadsLastWeek,
        topCounselors,
        leadsBySource,
        leadsByCountry,
        dailyTrend
      });

    } catch (error: any) {
      console.error('Error fetching analytics:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAnalytics();
  }, [dateRange]);

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  const weeklyGrowth = analytics.leadsLastWeek > 0 
    ? ((analytics.leadsThisWeek - analytics.leadsLastWeek) / analytics.leadsLastWeek) * 100
    : 0;

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold">Lead Analytics</h2>
          <p className="text-muted-foreground">Track lead performance and conversion rates</p>
        </div>
        <Select value={dateRange} onValueChange={setDateRange}>
          <SelectTrigger className="w-40">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="7">Last 7 days</SelectItem>
            <SelectItem value="30">Last 30 days</SelectItem>
            <SelectItem value="90">Last 90 days</SelectItem>
            <SelectItem value="365">Last year</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Key Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">Total Leads</p>
                <p className="text-2xl font-bold">{analytics.totalLeads}</p>
                <div className="flex items-center gap-1 text-sm">
                  {weeklyGrowth >= 0 ? (
                    <TrendingUp className="h-4 w-4 text-green-500" />
                  ) : (
                    <TrendingDown className="h-4 w-4 text-red-500" />
                  )}
                  <span className={weeklyGrowth >= 0 ? 'text-green-500' : 'text-red-500'}>
                    {Math.abs(weeklyGrowth).toFixed(1)}%
                  </span>
                  <span className="text-muted-foreground">from last week</span>
                </div>
              </div>
              <Users className="h-8 w-8 text-muted-foreground" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">Conversion Rate</p>
                <p className="text-2xl font-bold">{analytics.conversionRate.toFixed(1)}%</p>
                <p className="text-sm text-muted-foreground">
                  {analytics.convertedLeads} out of {analytics.totalLeads}
                </p>
              </div>
              <Target className="h-8 w-8 text-muted-foreground" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">Avg. Time to Convert</p>
                <p className="text-2xl font-bold">{analytics.avgTimeToConversion.toFixed(1)}</p>
                <p className="text-sm text-muted-foreground">days</p>
              </div>
              <Clock className="h-8 w-8 text-muted-foreground" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">Hot Leads</p>
                <p className="text-2xl font-bold">{analytics.hotLeads}</p>
                <p className="text-sm text-muted-foreground">require immediate attention</p>
              </div>
              <Activity className="h-8 w-8 text-red-500" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Lead Pipeline */}
      <Card>
        <CardHeader>
          <CardTitle>Lead Pipeline</CardTitle>
          <CardDescription>Current distribution of leads across stages</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-4 h-4 bg-red-500 rounded"></div>
                <span>Hot ({analytics.hotLeads})</span>
              </div>
              <Progress 
                value={analytics.totalLeads > 0 ? (analytics.hotLeads / analytics.totalLeads) * 100 : 0} 
                className="w-40"
              />
            </div>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-4 h-4 bg-orange-500 rounded"></div>
                <span>Warm ({analytics.warmLeads})</span>
              </div>
              <Progress 
                value={analytics.totalLeads > 0 ? (analytics.warmLeads / analytics.totalLeads) * 100 : 0} 
                className="w-40"
              />
            </div>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-4 h-4 bg-blue-500 rounded"></div>
                <span>Cold ({analytics.coldLeads})</span>
              </div>
              <Progress 
                value={analytics.totalLeads > 0 ? (analytics.coldLeads / analytics.totalLeads) * 100 : 0} 
                className="w-40"
              />
            </div>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-4 h-4 bg-green-500 rounded"></div>
                <span>Converted ({analytics.convertedLeads})</span>
              </div>
              <Progress 
                value={analytics.totalLeads > 0 ? (analytics.convertedLeads / analytics.totalLeads) * 100 : 0} 
                className="w-40"
              />
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Top Counselors */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Award className="h-5 w-5" />
              Top Performing Counselors
            </CardTitle>
            <CardDescription>Ranked by conversions achieved</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {analytics.topCounselors.map((counselor, index) => (
                <div key={index} className="flex items-center justify-between p-3 bg-muted/50 rounded-lg">
                  <div>
                    <p className="font-medium">{counselor.name}</p>
                    <p className="text-sm text-muted-foreground">
                      {counselor.conversions} conversions from {counselor.leadsAssigned} leads
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="font-bold text-lg">{counselor.conversionRate.toFixed(1)}%</p>
                    <p className="text-xs text-muted-foreground">conversion rate</p>
                  </div>
                </div>
              ))}
              {analytics.topCounselors.length === 0 && (
                <p className="text-center text-muted-foreground py-4">
                  No counselor data available
                </p>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Lead Sources */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <BarChart3 className="h-5 w-5" />
              Lead Sources
            </CardTitle>
            <CardDescription>Where your leads are coming from</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {analytics.leadsBySource.map((source, index) => (
                <div key={index} className="flex items-center justify-between">
                  <span className="capitalize">{source.source}</span>
                  <div className="flex items-center gap-2">
                    <Progress value={source.percentage} className="w-20" />
                    <span className="text-sm font-medium w-12">{source.count}</span>
                  </div>
                </div>
              ))}
              {analytics.leadsBySource.length === 0 && (
                <p className="text-center text-muted-foreground py-4">
                  No source data available
                </p>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Popular Countries */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Popular Destinations</CardTitle>
            <CardDescription>Countries students are most interested in</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-4">
              {analytics.leadsByCountry.map((country, index) => (
                <div key={index} className="flex items-center justify-between p-3 bg-muted/50 rounded-lg">
                  <span className="font-medium">{country.country}</span>
                  <div className="flex items-center gap-2">
                    <Progress value={country.percentage} className="w-16" />
                    <span className="text-sm font-medium w-8">{country.count}</span>
                  </div>
                </div>
              ))}
              {analytics.leadsByCountry.length === 0 && (
                <div className="col-span-2 text-center text-muted-foreground py-4">
                  No country preference data available
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}