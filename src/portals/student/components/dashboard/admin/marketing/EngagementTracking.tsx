import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@student/components/ui/card';
import { Input } from '@student/components/ui/input';
import { Badge } from '@student/components/ui/badge';
import { Button } from '@student/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@student/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@student/components/ui/table';
import { MessageSquare, Phone, Mail, Search, Filter, Eye, MousePointer, Reply, Clock, CheckCircle, AlertCircle } from 'lucide-react';

export function EngagementTracking() {
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [channelFilter, setChannelFilter] = useState('all');

  // Mock engagement data - replace with real data from Supabase
  const engagementData = [
    {
      id: '1',
      leadName: 'John Smith',
      phone: '+1234567890',
      email: 'john@email.com',
      country: 'USA',
      campaign: 'Scholarship Reminder Q1',
      channel: 'whatsapp',
      status: 'replied',
      sentAt: '2024-01-15 10:30',
      deliveredAt: '2024-01-15 10:31',
      seenAt: '2024-01-15 14:20',
      clickedAt: '2024-01-15 14:22',
      repliedAt: '2024-01-15 16:45',
      message: 'Hi John! Don\'t miss out on our scholarship opportunities...',
      replyText: 'Thanks for the info! I\'m interested in the computer science program.'
    },
    {
      id: '2',
      leadName: 'Sarah Johnson',
      phone: '+1987654321',
      email: 'sarah@email.com',
      country: 'Canada',
      campaign: 'Application Deadline Alert',
      channel: 'sms',
      status: 'clicked',
      sentAt: '2024-01-15 09:15',
      deliveredAt: '2024-01-15 09:16',
      seenAt: null,
      clickedAt: '2024-01-15 11:30',
      repliedAt: null,
      message: 'Sarah, only 5 days left to submit your application!',
      replyText: null
    },
    {
      id: '3',
      leadName: 'Mike Chen',
      phone: '+1122334455',
      email: 'mike@email.com',
      country: 'Australia',
      campaign: 'Welcome Series - New Leads',
      channel: 'whatsapp',
      status: 'seen',
      sentAt: '2024-01-15 08:45',
      deliveredAt: '2024-01-15 08:46',
      seenAt: '2024-01-15 12:15',
      clickedAt: null,
      repliedAt: null,
      message: 'Welcome to Fly Masters! Let\'s help you find your dream university.',
      replyText: null
    },
    {
      id: '4',
      leadName: 'Emma Wilson',
      phone: '+1555666777',
      email: 'emma@email.com',
      country: 'UK',
      campaign: 'University Fair Follow-up',
      channel: 'email',
      status: 'delivered',
      sentAt: '2024-01-15 07:20',
      deliveredAt: '2024-01-15 07:21',
      seenAt: null,
      clickedAt: null,
      repliedAt: null,
      message: 'Thanks for visiting our booth at the University Fair!',
      replyText: null
    },
    {
      id: '5',
      leadName: 'David Brown',
      phone: '+1888999000',
      email: 'david@email.com',
      country: 'Germany',
      campaign: 'Special Offers',
      channel: 'whatsapp',
      status: 'failed',
      sentAt: '2024-01-15 06:10',
      deliveredAt: null,
      seenAt: null,
      clickedAt: null,
      repliedAt: null,
      message: 'Exclusive 20% discount on application fees!',
      replyText: null
    }
  ];

  const getChannelIcon = (channel) => {
    switch (channel) {
      case 'whatsapp': return <MessageSquare className="w-4 h-4 text-green-600" />;
      case 'sms': return <Phone className="w-4 h-4 text-blue-600" />;
      case 'email': return <Mail className="w-4 h-4 text-purple-600" />;
      default: return <MessageSquare className="w-4 h-4" />;
    }
  };

  const getStatusBadge = (status) => {
    const statusConfig = {
      sent: { variant: 'secondary', color: 'text-gray-600', icon: Clock },
      delivered: { variant: 'outline', color: 'text-blue-600', icon: CheckCircle },
      seen: { variant: 'default', color: 'text-green-600', icon: Eye },
      clicked: { variant: 'default', color: 'text-orange-600', icon: MousePointer },
      replied: { variant: 'default', color: 'text-emerald-600', icon: Reply },
      failed: { variant: 'destructive', color: 'text-red-600', icon: AlertCircle }
    };

    const config = statusConfig[status] || statusConfig.sent;
    const Icon = config.icon;

    return (
      <Badge variant={config.variant} className="flex items-center gap-1">
        <Icon className="w-3 h-3" />
        {status.charAt(0).toUpperCase() + status.slice(1)}
      </Badge>
    );
  };

  const getEngagementTimeline = (engagement) => {
    const timeline = [];
    
    if (engagement.sentAt) {
      timeline.push({ step: 'Sent', time: engagement.sentAt, icon: Clock, color: 'text-gray-500' });
    }
    if (engagement.deliveredAt) {
      timeline.push({ step: 'Delivered', time: engagement.deliveredAt, icon: CheckCircle, color: 'text-blue-500' });
    }
    if (engagement.seenAt) {
      timeline.push({ step: 'Seen', time: engagement.seenAt, icon: Eye, color: 'text-green-500' });
    }
    if (engagement.clickedAt) {
      timeline.push({ step: 'Clicked', time: engagement.clickedAt, icon: MousePointer, color: 'text-orange-500' });
    }
    if (engagement.repliedAt) {
      timeline.push({ step: 'Replied', time: engagement.repliedAt, icon: Reply, color: 'text-emerald-500' });
    }

    return timeline;
  };

  const filteredData = engagementData.filter(engagement => {
    const matchesSearch = engagement.leadName.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         engagement.phone.includes(searchTerm) ||
                         engagement.email.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         engagement.campaign.toLowerCase().includes(searchTerm.toLowerCase());
    
    const matchesStatus = statusFilter === 'all' || engagement.status === statusFilter;
    const matchesChannel = channelFilter === 'all' || engagement.channel === channelFilter;
    
    return matchesSearch && matchesStatus && matchesChannel;
  });

  const engagementStats = {
    total: engagementData.length,
    delivered: engagementData.filter(e => e.status !== 'failed').length,
    seen: engagementData.filter(e => ['seen', 'clicked', 'replied'].includes(e.status)).length,
    clicked: engagementData.filter(e => ['clicked', 'replied'].includes(e.status)).length,
    replied: engagementData.filter(e => e.status === 'replied').length
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold">Engagement Tracking</h2>
        <p className="text-muted-foreground">Monitor message delivery and engagement across all channels</p>
      </div>

      {/* Engagement Stats */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-5">
        <Card className="glass-card">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Total Messages</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-primary">{engagementStats.total}</div>
          </CardContent>
        </Card>
        
        <Card className="glass-card">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Delivered</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-blue-600">{engagementStats.delivered}</div>
            <div className="text-xs text-muted-foreground">
              {((engagementStats.delivered / engagementStats.total) * 100).toFixed(1)}%
            </div>
          </CardContent>
        </Card>
        
        <Card className="glass-card">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Seen</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">{engagementStats.seen}</div>
            <div className="text-xs text-muted-foreground">
              {((engagementStats.seen / engagementStats.delivered) * 100).toFixed(1)}%
            </div>
          </CardContent>
        </Card>
        
        <Card className="glass-card">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Clicked</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-orange-600">{engagementStats.clicked}</div>
            <div className="text-xs text-muted-foreground">
              {((engagementStats.clicked / engagementStats.seen) * 100).toFixed(1)}%
            </div>
          </CardContent>
        </Card>
        
        <Card className="glass-card">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Replied</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-emerald-600">{engagementStats.replied}</div>
            <div className="text-xs text-muted-foreground">
              {((engagementStats.replied / engagementStats.clicked) * 100).toFixed(1)}%
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <Card className="glass-card">
        <CardContent className="p-4">
          <div className="flex gap-4 items-end">
            <div className="flex-1 space-y-2">
              <label className="text-sm font-medium">Search</label>
              <div className="relative">
                <Search className="w-4 h-4 absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground" />
                <Input
                  placeholder="Search by name, phone, email, or campaign..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10"
                />
              </div>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Status</label>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-48">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Statuses</SelectItem>
                  <SelectItem value="sent">Sent</SelectItem>
                  <SelectItem value="delivered">Delivered</SelectItem>
                  <SelectItem value="seen">Seen</SelectItem>
                  <SelectItem value="clicked">Clicked</SelectItem>
                  <SelectItem value="replied">Replied</SelectItem>
                  <SelectItem value="failed">Failed</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Channel</label>
              <Select value={channelFilter} onValueChange={setChannelFilter}>
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

      {/* Engagement Table */}
      <Card className="glass-card">
        <CardHeader>
          <CardTitle>Message Engagement Details</CardTitle>
          <CardDescription>Detailed tracking of each message sent</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Student</TableHead>
                  <TableHead>Campaign</TableHead>
                  <TableHead>Channel</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Timeline</TableHead>
                  <TableHead>Message Preview</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredData.map((engagement) => {
                  const timeline = getEngagementTimeline(engagement);
                  return (
                    <TableRow key={engagement.id}>
                      <TableCell>
                        <div>
                          <div className="font-medium">{engagement.leadName}</div>
                          <div className="text-xs text-muted-foreground">{engagement.phone}</div>
                          <div className="text-xs text-muted-foreground">{engagement.email}</div>
                          <Badge variant="outline" className="text-xs mt-1">
                            {engagement.country}
                          </Badge>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="text-sm">{engagement.campaign}</div>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          {getChannelIcon(engagement.channel)}
                          <span className="capitalize">{engagement.channel}</span>
                        </div>
                      </TableCell>
                      <TableCell>
                        {getStatusBadge(engagement.status)}
                      </TableCell>
                      <TableCell>
                        <div className="space-y-1">
                          {timeline.map((step, index) => {
                            const Icon = step.icon;
                            return (
                              <div key={index} className="flex items-center gap-2 text-xs">
                                <Icon className={`w-3 h-3 ${step.color}`} />
                                <span>{step.step}</span>
                                <span className="text-muted-foreground">
                                  {new Date(step.time).toLocaleString()}
                                </span>
                              </div>
                            );
                          })}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="max-w-48">
                          <div className="text-sm truncate">{engagement.message}</div>
                          {engagement.replyText && (
                            <div className="mt-2 p-2 bg-muted rounded text-xs">
                              <strong>Reply:</strong> {engagement.replyText}
                            </div>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        <Button size="sm" variant="outline">
                          View Details
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
          
          {filteredData.length === 0 && (
            <div className="text-center py-8 text-muted-foreground">
              <MessageSquare className="w-12 h-12 mx-auto mb-4 opacity-50" />
              <p>No engagement data found matching your filters.</p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}