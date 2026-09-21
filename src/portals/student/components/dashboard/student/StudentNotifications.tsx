import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '@student/hooks/useAuth';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@student/components/ui/card';
import { Button } from '@student/components/ui/button';
import { Badge } from '@student/components/ui/badge';
import { Separator } from '@student/components/ui/separator';
import { 
  Bell, 
  CheckCircle, 
  AlertCircle, 
  Info, 
  RefreshCw
} from 'lucide-react';
import { format } from 'date-fns';
import { toast } from 'sonner';
import { loadStudentInbox, markInboxRead, type StudentInboxItem } from '@student/lib/studentInbox';

export function StudentNotifications() {
  const { user } = useAuth();
  const [notifications, setNotifications] = useState<StudentInboxItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [markingAsRead, setMarkingAsRead] = useState<string[]>([]);

  useEffect(() => {
    if (!user) return;
    fetchNotifications();
    const poll = window.setInterval(() => {
      void fetchNotifications(true);
    }, 4000);
    return () => window.clearInterval(poll);
  }, [user?.id]);

  const fetchNotifications = async (silent = false) => {
    if (!user) return;
    
    try {
      if (!silent) setLoading(true);
      const items = await loadStudentInbox(user.id);
      setNotifications(items);
    } catch (error) {
      console.error('Error fetching notifications:', error);
      if (!silent) toast.error('Failed to load notifications');
    } finally {
      if (!silent) setLoading(false);
    }
  };

  const markAsRead = async (notificationId: string) => {
    setMarkingAsRead(prev => [...prev, notificationId]);
    
    try {
      await markInboxRead([notificationId]);
      setNotifications(prev => 
        prev.map(notif => 
          notif.id === notificationId 
            ? { ...notif, is_read: true }
            : notif
        )
      );
    } catch (error) {
      console.error('Error marking notification as read:', error);
      toast.error('Failed to mark as read');
    } finally {
      setMarkingAsRead(prev => prev.filter(id => id !== notificationId));
    }
  };

  const markAllAsRead = async () => {
    const unreadIds = notifications.filter(n => !n.is_read).map(n => n.id);
    if (unreadIds.length === 0) return;

    try {
      await markInboxRead(unreadIds);
      setNotifications(prev => 
        prev.map(notif => ({ ...notif, is_read: true }))
      );
      toast.success('All notifications marked as read');
    } catch (error) {
      console.error('Error marking all notifications as read:', error);
      toast.error('Failed to mark all as read');
    }
  };

  const getNotificationIcon = (type: string) => {
    switch (type) {
      case 'success': return <CheckCircle className="w-5 h-5 text-green-500" />;
      case 'warning': return <AlertCircle className="w-5 h-5 text-yellow-500" />;
      case 'error': return <AlertCircle className="w-5 h-5 text-red-500" />;
      default: return <Info className="w-5 h-5 text-blue-500" />;
    }
  };

  const getNotificationBadgeVariant = (type: string) => {
    switch (type) {
      case 'success': return 'default';
      case 'warning': return 'secondary';
      case 'error': return 'destructive';
      default: return 'outline';
    }
  };

  const unreadCount = notifications.filter(n => !n.is_read).length;

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-gradient-primary flex items-center justify-center">
            <Bell className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-bold">Notifications</h1>
            <p className="text-muted-foreground">Stay updated on your application progress</p>
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={fetchNotifications}>
            <RefreshCw className="w-4 h-4 mr-1" />
            Refresh
          </Button>
          {unreadCount > 0 && (
            <Button variant="outline" size="sm" onClick={markAllAsRead}>
              Mark All Read ({unreadCount})
            </Button>
          )}
        </div>
      </div>

      {/* Notifications List */}
      <Card className="glass-card">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Bell className="w-5 h-5" />
            Recent Notifications
            {unreadCount > 0 && (
              <Badge variant="secondary" className="bg-primary/20 text-primary">
                {unreadCount} new
              </Badge>
            )}
          </CardTitle>
          <CardDescription>
            Important updates about your study abroad journey
          </CardDescription>
        </CardHeader>
        <CardContent>
          {notifications.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <Bell className="w-12 h-12 mx-auto mb-4 opacity-50" />
              <p>No notifications yet</p>
              <p className="text-sm">When your counselor reviews a document, requests a file, or messages you, it will show here.</p>
            </div>
          ) : (
            <div className="space-y-4">
              {notifications.map((notification, index) => (
                <div key={notification.id}>
                  <div className={`flex gap-4 p-4 rounded-lg transition-all ${
                    !notification.is_read 
                      ? 'bg-primary/5 border border-primary/20' 
                      : 'bg-muted/30'
                  }`}>
                    <div className="flex-shrink-0 mt-1">
                      {getNotificationIcon(notification.type)}
                    </div>
                    <div className="flex-1 space-y-2">
                      <div className="flex items-start justify-between gap-2">
                        <h3 className="font-semibold text-sm">
                          {notification.title}
                        </h3>
                        <div className="flex items-center gap-2">
                          <Badge variant={getNotificationBadgeVariant(notification.type)}>
                            {notification.type === 'success' ? 'Approved' : notification.type === 'error' ? 'Action needed' : notification.type === 'warning' ? 'Request' : 'Update'}
                          </Badge>
                          {!notification.is_read && (
                            <div className="w-2 h-2 bg-primary rounded-full"></div>
                          )}
                        </div>
                      </div>
                      <p className="text-sm text-muted-foreground">
                        {notification.message}
                      </p>
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-muted-foreground">
                          {format(new Date(notification.created_at), 'MMM dd, yyyy at HH:mm')}
                        </span>
                        <div className="flex gap-2">
                          {notification.action_url && (
                            <Button size="sm" variant="ghost" asChild>
                              <Link to={notification.action_url}>
                                View
                              </Link>
                            </Button>
                          )}
                          {!notification.is_read && (
                            <Button 
                              size="sm" 
                              variant="ghost"
                              onClick={() => markAsRead(notification.id)}
                              disabled={markingAsRead.includes(notification.id)}
                            >
                              <CheckCircle className="w-3 h-3 mr-1" />
                              Mark Read
                            </Button>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                  {index < notifications.length - 1 && <Separator className="my-2" />}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}