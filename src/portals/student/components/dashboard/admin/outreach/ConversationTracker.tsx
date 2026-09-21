import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@student/components/ui/card';
import { Button } from '@student/components/ui/button';
import { Input } from '@student/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@student/components/ui/select';
import { Badge } from '@student/components/ui/badge';
import { useToast } from '@student/components/ui/use-toast';
import { supabase } from '@student/integrations/supabase/client';
import { MessageSquare, Search, Mail, Clock, TrendingUp, AlertCircle, User } from 'lucide-react';

interface EmailConversation {
  id: string;
  university_prospect: {
    name: string;
    country: string;
    contact_email?: string;
  };
  subject: string;
  conversation_stage: string;
  last_activity_at: string;
  total_emails: number;
  ai_generated_count: number;
  human_edited_count: number;
  sentiment_score?: number;
  priority_flags: string[];
}

export function ConversationTracker() {
  const { toast } = useToast();
  const [conversations, setConversations] = useState<EmailConversation[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [stageFilter, setStageFilter] = useState<string>('all');

  useEffect(() => {
    fetchConversations();
  }, []);

  const fetchConversations = async () => {
    try {
      const { data, error } = await supabase
        .from('email_conversations')
        .select(`
          *,
          university_prospect:university_prospects(name, country, contact_email)
        `)
        .order('last_activity_at', { ascending: false });

      if (error) throw error;
      setConversations(data || []);
    } catch (error) {
      console.error('Error fetching conversations:', error);
      toast({
        title: 'Error',
        description: 'Failed to fetch conversations',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const updateConversationStage = async (id: string, stage: string) => {
    try {
      const { error } = await supabase
        .from('email_conversations')
        .update({ conversation_stage: stage })
        .eq('id', id);

      if (error) throw error;

      toast({
        title: 'Success',
        description: 'Conversation stage updated',
      });
      fetchConversations();
    } catch (error) {
      console.error('Error updating stage:', error);
      toast({
        title: 'Error',
        description: 'Failed to update conversation stage',
        variant: 'destructive',
      });
    }
  };

  const getStageBadge = (stage: string) => {
    const stageConfig = {
      initiated: { label: 'Initiated', variant: 'secondary' as const },
      replied: { label: 'Replied', variant: 'default' as const },
      ongoing: { label: 'Ongoing', variant: 'default' as const },
      converted: { label: 'Converted', variant: 'default' as const },
      rejected: { label: 'Rejected', variant: 'destructive' as const },
      dormant: { label: 'Dormant', variant: 'outline' as const }
    };
    const config = stageConfig[stage as keyof typeof stageConfig] || stageConfig.initiated;
    return <Badge variant={config.variant}>{config.label}</Badge>;
  };

  const getSentimentIcon = (score?: number) => {
    if (!score) return null;
    if (score > 0.3) return <TrendingUp className="w-4 h-4 text-green-500" />;
    if (score < -0.3) return <AlertCircle className="w-4 h-4 text-red-500" />;
    return <Clock className="w-4 h-4 text-yellow-500" />;
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const filteredConversations = conversations.filter(conversation => {
    const matchesSearch = 
      conversation.university_prospect?.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      conversation.subject.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesStage = stageFilter === 'all' || conversation.conversation_stage === stageFilter;
    return matchesSearch && matchesStage;
  });

  if (loading) {
    return <div className="p-6">Loading conversations...</div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">Conversation Tracker</h2>
          <p className="text-muted-foreground">Monitor and manage email conversations with universities</p>
        </div>
      </div>

      {/* Statistics Cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card className="glass-card">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Active Conversations</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-primary">
              {conversations.filter(c => ['replied', 'ongoing'].includes(c.conversation_stage)).length}
            </div>
            <p className="text-xs text-muted-foreground">Currently active</p>
          </CardContent>
        </Card>
        
        <Card className="glass-card">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Pending Replies</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-primary">
              {conversations.filter(c => c.priority_flags.includes('follow_up_needed')).length}
            </div>
            <p className="text-xs text-muted-foreground">Need follow-up</p>
          </CardContent>
        </Card>
        
        <Card className="glass-card">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Conversions</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-primary">
              {conversations.filter(c => c.conversation_stage === 'converted').length}
            </div>
            <p className="text-xs text-muted-foreground">Successful partnerships</p>
          </CardContent>
        </Card>
        
        <Card className="glass-card">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">AI Efficiency</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-primary">
              {conversations.length > 0 
                ? Math.round((conversations.reduce((acc, c) => acc + c.ai_generated_count, 0) / 
                   conversations.reduce((acc, c) => acc + c.total_emails, 0)) * 100)
                : 0}%
            </div>
            <p className="text-xs text-muted-foreground">AI-generated emails</p>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <Card className="glass-card">
        <CardContent className="p-4">
          <div className="flex gap-4 flex-wrap">
            <div className="flex-1 min-w-[200px]">
              <div className="relative">
                <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search conversations..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-10"
                />
              </div>
            </div>
            <Select value={stageFilter} onValueChange={setStageFilter}>
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="Filter by stage" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Stages</SelectItem>
                <SelectItem value="initiated">Initiated</SelectItem>
                <SelectItem value="replied">Replied</SelectItem>
                <SelectItem value="ongoing">Ongoing</SelectItem>
                <SelectItem value="converted">Converted</SelectItem>
                <SelectItem value="rejected">Rejected</SelectItem>
                <SelectItem value="dormant">Dormant</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Conversations List */}
      <div className="grid gap-4">
        {filteredConversations.map((conversation) => (
          <Card key={conversation.id} className="glass-card">
            <CardContent className="p-6">
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <div className="flex items-start gap-4">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-2">
                        <h3 className="text-lg font-semibold">{conversation.university_prospect?.name}</h3>
                        <Badge variant="outline">{conversation.university_prospect?.country}</Badge>
                        {getStageBadge(conversation.conversation_stage)}
                        {conversation.priority_flags.map(flag => (
                          <Badge key={flag} variant="secondary" className="text-xs">
                            {flag.replace('_', ' ')}
                          </Badge>
                        ))}
                      </div>
                      
                      <p className="text-sm text-muted-foreground mb-3">{conversation.subject}</p>
                      
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                        <div className="flex items-center gap-2">
                          <Mail className="w-4 h-4 text-muted-foreground" />
                          <span>{conversation.total_emails} emails</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <User className="w-4 h-4 text-muted-foreground" />
                          <span>{conversation.ai_generated_count} AI / {conversation.human_edited_count} human</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <Clock className="w-4 h-4 text-muted-foreground" />
                          <span>{formatDate(conversation.last_activity_at)}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          {getSentimentIcon(conversation.sentiment_score)}
                          <span>
                            {conversation.sentiment_score 
                              ? `${(conversation.sentiment_score * 100).toFixed(0)}% sentiment`
                              : 'No sentiment data'}
                          </span>
                        </div>
                      </div>
                      
                      {conversation.university_prospect?.contact_email && (
                        <p className="text-sm text-muted-foreground mt-2">
                          <Mail className="w-4 h-4 inline mr-1" />
                          {conversation.university_prospect.contact_email}
                        </p>
                      )}
                    </div>
                    
                    <div className="flex flex-col gap-2">
                      <Select
                        value={conversation.conversation_stage}
                        onValueChange={(value) => updateConversationStage(conversation.id, value)}
                      >
                        <SelectTrigger className="w-[130px]">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="initiated">Initiated</SelectItem>
                          <SelectItem value="replied">Replied</SelectItem>
                          <SelectItem value="ongoing">Ongoing</SelectItem>
                          <SelectItem value="converted">Converted</SelectItem>
                          <SelectItem value="rejected">Rejected</SelectItem>
                          <SelectItem value="dormant">Dormant</SelectItem>
                        </SelectContent>
                      </Select>
                      <Button variant="outline" size="sm">
                        <MessageSquare className="w-4 h-4 mr-1" />
                        View Thread
                      </Button>
                    </div>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {filteredConversations.length === 0 && (
        <Card className="glass-card">
          <CardContent className="p-12 text-center">
            <MessageSquare className="w-16 h-16 text-muted-foreground mx-auto mb-4" />
            <h3 className="text-xl font-semibold mb-2">No Conversations Found</h3>
            <p className="text-muted-foreground">
              {searchQuery || stageFilter !== 'all' 
                ? 'No conversations match your current filters.' 
                : 'Email conversations will appear here once you start outreach campaigns.'}
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}