import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@student/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@student/components/ui/select';
import { Badge } from '@student/components/ui/badge';
import { Button } from '@student/components/ui/button';
import { Calendar } from '@student/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@student/components/ui/popover';
import { BarChart3, TrendingUp, MessageSquare, Phone, Mail, Download, Calendar as CalendarIcon, Eye, MousePointer, Reply } from 'lucide-react';
import { LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';

export function MarketingAnalytics() {
  const [selectedCampaign, setSelectedCampaign] = useState('all');
  const [selectedChannel, setSelectedChannel] = useState('all');
  const [dateRange, setDateRange] = useState<{
    from: Date;
    to?: Date;
  }>({
    from: new Date(new Date().setDate(new Date().getDate() - 30)),
    to: new Date()
  });

  // Mock data - replace with real data from Supabase
  const campaignPerformance = [
    { name: 'Week 1', sent: 1200, delivered: 1150, seen: 890, clicked: 234, replied: 89 },
    { name: 'Week 2', sent: 1350, delivered: 1280, seen: 920, clicked: 267, replied: 95 },
    { name: 'Week 3', sent: 1100, delivered: 1050, seen: 780, clicked: 198, replied: 72 },
    { name: 'Week 4', sent: 1450, delivered: 1380, seen: 1020, clicked: 289, replied: 108 }
  ];

  const channelDistribution = [
    { name: 'WhatsApp', value: 60, color: '#10B981' },
    { name: 'SMS', value: 25, color: '#3B82F6' },
    { name: 'Email', value: 15, color: '#8B5CF6' }
  ];

  const conversionFunnel = [
    { stage: 'Sent', count: 5100, percentage: 100 },
    { stage: 'Delivered', count: 4860, percentage: 95.3 },
    { stage: 'Seen', count: 3610, percentage: 70.8 },
    { stage: 'Clicked', count: 988, percentage: 19.4 },
    { stage: 'Replied', count: 364, percentage: 7.1 }
  ];

  const topPerformers = [
    { campaign: 'Scholarship Reminder Q1', sent: 1200, replies: 156, rate: 13.0, revenue: 45600 },
    { campaign: 'University Fair Follow-up', sent: 850, replies: 98, rate: 11.5, revenue: 29400 },
    { campaign: 'Application Deadline Alert', sent: 1500, replies: 165, rate: 11.0, revenue: 49500 },
    { campaign: 'Welcome Series - New Leads', sent: 950, replies: 89, rate: 9.4, revenue: 26700 }
  ];

  const getChannelIcon = (channel) => {
    switch (channel) {
      case 'whatsapp': return <MessageSquare className="w-4 h-4" />;
      case 'sms': return <Phone className="w-4 h-4" />;
      case 'email': return <Mail className="w-4 h-4" />;
      default: return <MessageSquare className="w-4 h-4" />;
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">Marketing Analytics</h2>
          <p className="text-muted-foreground">Track campaign performance and engagement metrics</p>
        </div>
        <div className="flex items-center gap-3">
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" className="flex items-center gap-2">
                <CalendarIcon className="w-4 h-4" />
                Date Range
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="end">
              <Calendar
                mode="range"
                defaultMonth={dateRange.from}
                selected={dateRange}
                onSelect={(range) => setDateRange(range || { from: new Date() })}
                numberOfMonths={2}
              />
            </PopoverContent>
          </Popover>
          <Button className="flex items-center gap-2">
            <Download className="w-4 h-4" />
            Export Report
          </Button>
        </div>
      </div>

      {/* Filters */}
      <Card className="glass-card">
        <CardContent className="p-4">
          <div className="flex gap-4">
            <div className="space-y-1">
              <label className="text-sm font-medium">Campaign</label>
              <Select value={selectedCampaign} onValueChange={setSelectedCampaign}>
                <SelectTrigger className="w-48">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Campaigns</SelectItem>
                  <SelectItem value="scholarship-q1">Scholarship Reminder Q1</SelectItem>
                  <SelectItem value="fair-followup">University Fair Follow-up</SelectItem>
                  <SelectItem value="deadline-alert">Application Deadline Alert</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <label className="text-sm font-medium">Channel</label>
              <Select value={selectedChannel} onValueChange={setSelectedChannel}>
                <SelectTrigger className="w-48">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Channels</SelectItem>
                  <SelectItem value="whatsapp">WhatsApp</SelectItem>
                  <SelectItem value="sms">SMS</SelectItem>
                  <SelectItem value="email">Email</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Key Metrics */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-5">
        <Card className="glass-card">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <MessageSquare className="w-4 h-4" />
              Messages Sent
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-primary">5,100</div>
            <div className="flex items-center gap-1 text-xs text-green-600">
              <TrendingUp className="w-3 h-3" />
              +15.2% from last month
            </div>
          </CardContent>
        </Card>
        
        <Card className="glass-card">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Eye className="w-4 h-4" />
              Delivery Rate
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-primary">95.3%</div>
            <div className="flex items-center gap-1 text-xs text-green-600">
              <TrendingUp className="w-3 h-3" />
              +2.1% from last month
            </div>
          </CardContent>
        </Card>
        
        <Card className="glass-card">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Eye className="w-4 h-4" />
              Open Rate
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-primary">70.8%</div>
            <div className="flex items-center gap-1 text-xs text-red-600">
              <TrendingUp className="w-3 h-3 rotate-180" />
              -3.5% from last month
            </div>
          </CardContent>
        </Card>
        
        <Card className="glass-card">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <MousePointer className="w-4 h-4" />
              Click Rate
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-primary">19.4%</div>
            <div className="flex items-center gap-1 text-xs text-green-600">
              <TrendingUp className="w-3 h-3" />
              +5.7% from last month
            </div>
          </CardContent>
        </Card>
        
        <Card className="glass-card">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Reply className="w-4 h-4" />
              Response Rate
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-primary">7.1%</div>
            <div className="flex items-center gap-1 text-xs text-green-600">
              <TrendingUp className="w-3 h-3" />
              +1.2% from last month
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Charts */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Performance Trend */}
        <Card className="glass-card">
          <CardHeader>
            <CardTitle>Campaign Performance Trend</CardTitle>
            <CardDescription>Weekly performance metrics</CardDescription>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={campaignPerformance}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="name" />
                <YAxis />
                <Tooltip />
                <Line type="monotone" dataKey="sent" stroke="#8884d8" strokeWidth={2} />
                <Line type="monotone" dataKey="delivered" stroke="#82ca9d" strokeWidth={2} />
                <Line type="monotone" dataKey="seen" stroke="#ffc658" strokeWidth={2} />
                <Line type="monotone" dataKey="replied" stroke="#ff7300" strokeWidth={2} />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Channel Distribution */}
        <Card className="glass-card">
          <CardHeader>
            <CardTitle>Channel Distribution</CardTitle>
            <CardDescription>Message volume by channel</CardDescription>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <PieChart>
                <Pie
                  data={channelDistribution}
                  cx="50%"
                  cy="50%"
                  labelLine={false}
                  label={({ name, value }) => `${name}: ${value}%`}
                  outerRadius={80}
                  fill="#8884d8"
                  dataKey="value"
                >
                  {channelDistribution.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      {/* Conversion Funnel */}
      <Card className="glass-card">
        <CardHeader>
          <CardTitle>Conversion Funnel</CardTitle>
          <CardDescription>Track user journey through the engagement process</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {conversionFunnel.map((stage, index) => (
              <div key={stage.stage} className="relative">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-3">
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center text-white text-sm font-medium ${
                      index === 0 ? 'bg-blue-500' :
                      index === 1 ? 'bg-green-500' :
                      index === 2 ? 'bg-yellow-500' :
                      index === 3 ? 'bg-orange-500' : 'bg-red-500'
                    }`}>
                      {index + 1}
                    </div>
                    <span className="font-medium">{stage.stage}</span>
                  </div>
                  <div className="flex items-center gap-4">
                    <span className="text-2xl font-bold">{stage.count.toLocaleString()}</span>
                    <Badge variant={stage.percentage > 50 ? 'default' : 'secondary'}>
                      {stage.percentage}%
                    </Badge>
                  </div>
                </div>
                <div className="w-full bg-muted rounded-full h-2">
                  <div 
                    className="bg-primary h-2 rounded-full transition-all duration-300"
                    style={{ width: `${stage.percentage}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Top Performing Campaigns */}
      <Card className="glass-card">
        <CardHeader>
          <CardTitle>Top Performing Campaigns</CardTitle>
          <CardDescription>Campaigns ranked by response rate</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {topPerformers.map((campaign, index) => (
              <div key={campaign.campaign} className="flex items-center justify-between p-4 bg-muted/50 rounded-lg">
                <div className="flex items-center gap-4">
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center text-white text-sm font-medium ${
                    index === 0 ? 'bg-yellow-500' :
                    index === 1 ? 'bg-gray-400' :
                    index === 2 ? 'bg-amber-600' : 'bg-blue-500'
                  }`}>
                    {index + 1}
                  </div>
                  <div>
                    <h4 className="font-medium">{campaign.campaign}</h4>
                    <p className="text-sm text-muted-foreground">
                      {campaign.sent.toLocaleString()} sent • {campaign.replies} replies
                    </p>
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-lg font-bold text-primary">{campaign.rate}%</div>
                  <div className="text-sm text-muted-foreground">
                    ${campaign.revenue.toLocaleString()} revenue
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