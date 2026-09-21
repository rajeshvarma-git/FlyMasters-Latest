import { useState, useEffect } from 'react';
import { supabase } from '@student/integrations/supabase/client';
import { useToast } from '@student/components/ui/use-toast';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@student/components/ui/card';
import { Button } from '@student/components/ui/button';
import { Badge } from '@student/components/ui/badge';
import { Input } from '@student/components/ui/input';
import { Textarea } from '@student/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@student/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@student/components/ui/dialog';
import { 
  Bell, 
  Plus,
  Search,
  CheckCircle,
  AlertCircle,
  Info,
  XCircle,
  Clock,
  Users,
  Send
} from 'lucide-react';
import { format } from 'date-fns';

interface Notification {
  id: string;
  user_id: string;
  title: string;
  message: string;
  type: string;
  is_read: boolean;
  action_url?: string;
  created_at: string;
  expires_at?: string;
  profiles?: { first_name: string; last_name: string; } | null;
}

interface User {
  id: string;
  profiles?: { first_name: string; last_name: string; } | null;
  user_roles?: { role: string }[] | null;
}

const notificationTypeConfig = {
  info: { icon: Info, color: 'bg-blue-500', variant: 'default' },
  warning: { icon: AlertCircle, color: 'bg-yellow-500', variant: 'secondary' },
  error: { icon: XCircle, color: 'bg-red-500', variant: 'destructive' },
  success: { icon: CheckCircle, color: 'bg-green-500', variant: 'default' }
};

export function NotificationsAdmin() {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [typeFilter, setTypeFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [newNotification, setNewNotification] = useState({
    title: '',
    message: '',
    type: 'info',
    recipients: 'all',
    specificUser: '',
    actionUrl: '',
    expiresAt: ''
  });
  const { toast } = useToast();

  const fetchNotifications = async () => {
    try {
      const { data, error } = await supabase
        .from('notifications')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      setNotifications(data || []);
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message,
        variant: 'destructive',
      });
    }
  };

  const fetchUsers = async () => {
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select(`
          user_id,
          first_name,
          last_name
        `);

      if (error) throw error;
      
      // Get user roles separately
      const { data: rolesData } = await supabase
        .from('user_roles')
        .select('user_id, role');
      
      const userData = data?.map(item => ({
        id: item.user_id,
        profiles: { first_name: item.first_name, last_name: item.last_name },
        user_roles: rolesData?.filter(role => role.user_id === item.user_id).map(r => ({ role: r.role })) || []
      })) || [];
      
      setUsers(userData);
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message,
        variant: 'destructive',
      });
    }
  };

  const createNotification = async () => {
    if (!newNotification.title || !newNotification.message) {
      toast({
        title: 'Error',
        description: 'Please fill in all required fields',
        variant: 'destructive',
      });
      return;
    }

    try {
      let userIds: string[] = [];

      if (newNotification.recipients === 'all') {
        userIds = users.map(user => user.id);
      } else if (newNotification.recipients === 'admins') {
        userIds = users
          .filter(user => user.user_roles?.some(role => role.role === 'admin' || role.role === 'super_admin'))
          .map(user => user.id);
      } else if (newNotification.recipients === 'counselors') {
        userIds = users
          .filter(user => user.user_roles?.some(role => role.role === 'counselor'))
          .map(user => user.id);
      } else if (newNotification.recipients === 'students') {
        userIds = users
          .filter(user => user.user_roles?.some(role => role.role === 'student'))
          .map(user => user.id);
      } else if (newNotification.recipients === 'specific' && newNotification.specificUser) {
        userIds = [newNotification.specificUser];
      }

      const notifications = userIds.map(userId => ({
        user_id: userId,
        title: newNotification.title,
        message: newNotification.message,
        type: newNotification.type,
        action_url: newNotification.actionUrl || null,
        expires_at: newNotification.expiresAt || null
      }));

      const { error } = await supabase
        .from('notifications')
        .insert(notifications);

      if (error) throw error;

      toast({
        title: 'Success',
        description: `Notification sent to ${userIds.length} user(s)`,
      });

      setShowCreateDialog(false);
      setNewNotification({
        title: '',
        message: '',
        type: 'info',
        recipients: 'all',
        specificUser: '',
        actionUrl: '',
        expiresAt: ''
      });
      
      await fetchNotifications();
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message,
        variant: 'destructive',
      });
    }
  };

  const markAsRead = async (notificationId: string) => {
    try {
      const { error } = await supabase
        .from('notifications')
        .update({ is_read: true })
        .eq('id', notificationId);

      if (error) throw error;

      setNotifications(prev => 
        prev.map(notif => 
          notif.id === notificationId ? { ...notif, is_read: true } : notif
        )
      );

      toast({
        title: 'Success',
        description: 'Notification marked as read',
      });
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message,
        variant: 'destructive',
      });
    }
  };

  const deleteNotification = async (notificationId: string) => {
    try {
      const { error } = await supabase
        .from('notifications')
        .delete()
        .eq('id', notificationId);

      if (error) throw error;

      setNotifications(prev => prev.filter(notif => notif.id !== notificationId));

      toast({
        title: 'Success',
        description: 'Notification deleted',
      });
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message,
        variant: 'destructive',
      });
    }
  };

  useEffect(() => {
    Promise.all([fetchNotifications(), fetchUsers()]).finally(() => setLoading(false));
  }, []);

  const filteredNotifications = notifications.filter(notification => {
    const matchesSearch = !searchQuery || 
      notification.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      notification.message.toLowerCase().includes(searchQuery.toLowerCase()) ||
      `${notification.profiles?.first_name} ${notification.profiles?.last_name}`.toLowerCase().includes(searchQuery.toLowerCase());
    
    const matchesType = typeFilter === 'all' || notification.type === typeFilter;
    const matchesStatus = statusFilter === 'all' || 
      (statusFilter === 'read' && notification.is_read) ||
      (statusFilter === 'unread' && !notification.is_read);
    
    return matchesSearch && matchesType && matchesStatus;
  });

  const notificationStats = notifications.reduce((acc, notif) => {
    acc.total++;
    acc[notif.type]++;
    if (!notif.is_read) acc.unread++;
    return acc;
  }, { total: 0, info: 0, warning: 0, error: 0, success: 0, unread: 0 });

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Stats Overview */}
      <div className="grid grid-cols-2 md:grid-cols-6 gap-4">
        <Card>
          <CardContent className="p-4 text-center">
            <div className="text-2xl font-bold">{notificationStats.total}</div>
            <div className="text-sm text-muted-foreground">Total</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <div className="text-2xl font-bold text-red-600">{notificationStats.unread}</div>
            <div className="text-sm text-muted-foreground">Unread</div>
          </CardContent>
        </Card>
        {Object.entries(notificationTypeConfig).map(([type, config]) => (
          <Card key={type}>
            <CardContent className="p-4 text-center">
              <div className="text-2xl font-bold">{notificationStats[type as keyof typeof notificationStats] as number}</div>
              <div className="text-sm text-muted-foreground capitalize">{type}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Controls */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Bell className="h-5 w-5" />
                Notifications Management
              </CardTitle>
              <CardDescription>
                Send and manage notifications to users
              </CardDescription>
            </div>
            <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
              <DialogTrigger asChild>
                <Button>
                  <Plus className="h-4 w-4 mr-2" />
                  Create Notification
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-lg">
                <DialogHeader>
                  <DialogTitle>Create New Notification</DialogTitle>
                </DialogHeader>
                <div className="space-y-4">
                  <div>
                    <label className="text-sm font-medium">Title</label>
                    <Input
                      placeholder="Notification title"
                      value={newNotification.title}
                      onChange={(e) => setNewNotification(prev => ({ ...prev, title: e.target.value }))}
                    />
                  </div>
                  
                  <div>
                    <label className="text-sm font-medium">Message</label>
                    <Textarea
                      placeholder="Notification message"
                      value={newNotification.message}
                      onChange={(e) => setNewNotification(prev => ({ ...prev, message: e.target.value }))}
                    />
                  </div>
                  
                  <div>
                    <label className="text-sm font-medium">Type</label>
                    <Select
                      value={newNotification.type}
                      onValueChange={(value) => setNewNotification(prev => ({ ...prev, type: value }))}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="info">Info</SelectItem>
                        <SelectItem value="warning">Warning</SelectItem>
                        <SelectItem value="error">Error</SelectItem>
                        <SelectItem value="success">Success</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  
                  <div>
                    <label className="text-sm font-medium">Recipients</label>
                    <Select
                      value={newNotification.recipients}
                      onValueChange={(value) => setNewNotification(prev => ({ ...prev, recipients: value }))}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All Users</SelectItem>
                        <SelectItem value="admins">Admins Only</SelectItem>
                        <SelectItem value="counselors">Counselors Only</SelectItem>
                        <SelectItem value="students">Students Only</SelectItem>
                        <SelectItem value="specific">Specific User</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  
                  {newNotification.recipients === 'specific' && (
                    <div>
                      <label className="text-sm font-medium">Select User</label>
                      <Select
                        value={newNotification.specificUser}
                        onValueChange={(value) => setNewNotification(prev => ({ ...prev, specificUser: value }))}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Choose user" />
                        </SelectTrigger>
                        <SelectContent>
                          {users.map(user => (
                            <SelectItem key={user.id} value={user.id}>
                              {user.profiles?.first_name} {user.profiles?.last_name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  )}
                  
                  <div>
                    <label className="text-sm font-medium">Action URL (Optional)</label>
                    <Input
                      placeholder="https://..."
                      value={newNotification.actionUrl}
                      onChange={(e) => setNewNotification(prev => ({ ...prev, actionUrl: e.target.value }))}
                    />
                  </div>
                  
                  <div>
                    <label className="text-sm font-medium">Expires At (Optional)</label>
                    <Input
                      type="datetime-local"
                      value={newNotification.expiresAt}
                      onChange={(e) => setNewNotification(prev => ({ ...prev, expiresAt: e.target.value }))}
                    />
                  </div>
                  
                  <div className="flex gap-2">
                    <Button onClick={createNotification} className="flex-1">
                      <Send className="h-4 w-4 mr-2" />
                      Send Notification
                    </Button>
                    <Button 
                      variant="outline" 
                      onClick={() => setShowCreateDialog(false)}
                    >
                      Cancel
                    </Button>
                  </div>
                </div>
              </DialogContent>
            </Dialog>
          </div>
        </CardHeader>
        <CardContent>
          {/* Filters */}
          <div className="flex gap-4 mb-6">
            <div className="flex-1">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground h-4 w-4" />
                <Input
                  placeholder="Search notifications..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-10"
                />
              </div>
            </div>
            <Select value={typeFilter} onValueChange={setTypeFilter}>
              <SelectTrigger className="w-32">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Types</SelectItem>
                <SelectItem value="info">Info</SelectItem>
                <SelectItem value="warning">Warning</SelectItem>
                <SelectItem value="error">Error</SelectItem>
                <SelectItem value="success">Success</SelectItem>
              </SelectContent>
            </Select>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-32">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Status</SelectItem>
                <SelectItem value="read">Read</SelectItem>
                <SelectItem value="unread">Unread</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Notifications List */}
          <div className="space-y-3">
            {filteredNotifications.map((notification) => {
              const typeConfig = notificationTypeConfig[notification.type];
              const Icon = typeConfig.icon;
              const isExpired = notification.expires_at && new Date(notification.expires_at) < new Date();
              
              return (
                <Card key={notification.id} className={`${!notification.is_read ? 'border-l-4 border-l-primary' : ''} ${isExpired ? 'opacity-60' : ''}`}>
                  <CardContent className="p-4">
                    <div className="flex items-start gap-4">
                      <div className={`p-2 rounded-full ${typeConfig.color} text-white flex-shrink-0`}>
                        <Icon className="h-4 w-4" />
                      </div>
                      
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <h4 className="font-medium">{notification.title}</h4>
                          {!notification.is_read && (
                            <Badge variant="secondary" className="text-xs">
                              Unread
                            </Badge>
                          )}
                          {isExpired && (
                            <Badge variant="outline" className="text-xs">
                              <Clock className="h-3 w-3 mr-1" />
                              Expired
                            </Badge>
                          )}
                        </div>
                        
                        <p className="text-sm text-muted-foreground mb-2">
                          {notification.message}
                        </p>
                        
                        <div className="flex items-center gap-4 text-xs text-muted-foreground">
                          <span>
                            To: {notification.profiles?.first_name} {notification.profiles?.last_name}
                          </span>
                          <span>{format(new Date(notification.created_at), 'MMM dd, yyyy HH:mm')}</span>
                          {notification.expires_at && (
                            <span>
                              Expires: {format(new Date(notification.expires_at), 'MMM dd, yyyy HH:mm')}
                            </span>
                          )}
                        </div>
                      </div>
                      
                      <div className="flex gap-2">
                        {!notification.is_read && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => markAsRead(notification.id)}
                          >
                            <CheckCircle className="h-4 w-4" />
                          </Button>
                        )}
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => deleteNotification(notification.id)}
                        >
                          <XCircle className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
            
            {filteredNotifications.length === 0 && (
              <div className="text-center py-12">
                <Bell className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                <h3 className="text-lg font-medium mb-2">No notifications found</h3>
                <p className="text-muted-foreground">
                  {searchQuery || typeFilter !== 'all' || statusFilter !== 'all'
                    ? 'Try adjusting your filters'
                    : 'Create your first notification'}
                </p>
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}