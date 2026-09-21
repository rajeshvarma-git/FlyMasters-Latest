import { useState, useEffect } from 'react';
import { supabase } from '@student/integrations/supabase/client';
import { useAuth } from '@student/hooks/useAuth';
import { useToast } from '@student/components/ui/use-toast';
import { Button } from '@student/components/ui/button';
import { Badge } from '@student/components/ui/badge';
import { Card, CardContent } from '@student/components/ui/card';
import { 
  Bell, 
  X, 
  CheckCircle, 
  AlertCircle, 
  Info, 
  XCircle,
  Clock,
  Users,
  Calendar
} from 'lucide-react';
import { format } from 'date-fns';

interface Notification {
  id: string;
  title: string;
  message: string;
  type: 'success' | 'warning' | 'error' | 'info';
  is_read: boolean;
  action_url?: string;
  created_at: string;
  expires_at?: string;
}

const notificationIcons = {
  success: { icon: CheckCircle, color: 'text-green-500' },
  warning: { icon: AlertCircle, color: 'text-yellow-500' },
  error: { icon: XCircle, color: 'text-red-500' },
  info: { icon: Info, color: 'text-blue-500' }
};

export function RealTimeNotifications() {
  const { user } = useAuth();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [showDropdown, setShowDropdown] = useState(false);
  const { toast } = useToast();

  const fetchNotifications = async () => {
    if (!user?.id) return;

    try {
      const { data, error } = await supabase
        .from('notifications')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(10);

      if (error) throw error;

      const activeNotifications = data?.filter(notif => {
        if (!notif.expires_at) return true;
        return new Date(notif.expires_at) > new Date();
      }).map(notif => ({
        ...notif,
        type: ['success', 'warning', 'error', 'info'].includes(notif.type) ? notif.type : 'info'
      })) || [];

      setNotifications(activeNotifications as Notification[]);
      setUnreadCount(activeNotifications.filter(n => !n.is_read).length);
    } catch (error: any) {
      console.error('Error fetching notifications:', error);
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
      setUnreadCount(prev => Math.max(0, prev - 1));
    } catch (error: any) {
      console.error('Error marking notification as read:', error);
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
      setUnreadCount(prev => {
        const deletedNotif = notifications.find(n => n.id === notificationId);
        return deletedNotif && !deletedNotif.is_read ? Math.max(0, prev - 1) : prev;
      });
    } catch (error: any) {
      console.error('Error deleting notification:', error);
    }
  };

  const handleNotificationClick = (notification: Notification) => {
    if (!notification.is_read) {
      markAsRead(notification.id);
    }

    if (notification.action_url) {
      window.open(notification.action_url, '_blank');
    }
  };

  // Set up real-time subscription
  useEffect(() => {
    if (!user?.id) return;

    fetchNotifications();

    const subscription = supabase
      .channel('notifications')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'notifications',
          filter: `user_id=eq.${user.id}`
        },
        (payload) => {
          const newNotification = payload.new as Notification;
          
          // Show toast for new notification
          toast({
            title: newNotification.title,
            description: newNotification.message,
            variant: newNotification.type === 'error' ? 'destructive' : 'default',
          });

          // Add to notifications list
          setNotifications(prev => [newNotification, ...prev.slice(0, 9)]);
          if (!newNotification.is_read) {
            setUnreadCount(prev => prev + 1);
          }
        }
      )
      .subscribe();

    return () => {
      subscription.unsubscribe();
    };
  }, [user?.id, toast]);

  // Auto-check for new leads assignments and follow-ups (simplified version)
  useEffect(() => {
    if (!user?.id) return;

    const checkForUpdates = async () => {
      try {
        // Check for leads with follow-ups due today
        const today = new Date().toISOString().split('T')[0];
        const { data: dueLeads, error } = await supabase
          .from('student_leads')
          .select('id, first_name, last_name, next_follow_up_date')
          .eq('assigned_counselor_id', user.id)
          .gte('next_follow_up_date', `${today}T00:00:00`)
          .lt('next_follow_up_date', `${today}T23:59:59`);

        if (!error && dueLeads && dueLeads.length > 0) {
          // This would typically be handled by a backend cron job
          // For demo purposes, we're showing how it would work
          console.log('Leads due for follow-up:', dueLeads);
        }
      } catch (error) {
        console.error('Error checking for updates:', error);
      }
    };

    // Check every 5 minutes
    const interval = setInterval(checkForUpdates, 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, [user?.id]);

  return (
    <div className="relative">
      {/* Notification Bell */}
      <Button
        variant="ghost"
        size="sm"
        className="relative"
        onClick={() => setShowDropdown(!showDropdown)}
      >
        <Bell className="h-5 w-5" />
        {unreadCount > 0 && (
          <Badge 
            className="absolute -top-1 -right-1 h-5 w-5 rounded-full p-0 flex items-center justify-center bg-red-500 text-white text-xs"
          >
            {unreadCount > 9 ? '9+' : unreadCount}
          </Badge>
        )}
      </Button>

      {/* Notifications Dropdown */}
      {showDropdown && (
        <div className="absolute right-0 top-full mt-2 w-80 bg-background border rounded-lg shadow-lg z-50 max-h-96 overflow-hidden">
          <div className="p-4 border-b">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold">Notifications</h3>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setShowDropdown(false)}
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
            {unreadCount > 0 && (
              <p className="text-sm text-muted-foreground">
                You have {unreadCount} unread notification{unreadCount > 1 ? 's' : ''}
              </p>
            )}
          </div>

          <div className="max-h-64 overflow-y-auto">
            {notifications.length > 0 ? (
              notifications.map((notification) => {
                const IconConfig = notificationIcons[notification.type];
                const Icon = IconConfig.icon;
                
                return (
                  <div
                    key={notification.id}
                    className={`p-4 border-b hover:bg-muted/50 cursor-pointer transition-colors ${
                      !notification.is_read ? 'bg-primary/5 border-l-4 border-l-primary' : ''
                    }`}
                    onClick={() => handleNotificationClick(notification)}
                  >
                    <div className="flex gap-3">
                      <Icon className={`h-5 w-5 mt-0.5 ${IconConfig.color}`} />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-start justify-between">
                          <h4 className={`text-sm font-medium ${!notification.is_read ? 'font-semibold' : ''}`}>
                            {notification.title}
                          </h4>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-6 w-6 p-0"
                            onClick={(e) => {
                              e.stopPropagation();
                              deleteNotification(notification.id);
                            }}
                          >
                            <X className="h-3 w-3" />
                          </Button>
                        </div>
                        <p className="text-sm text-muted-foreground mt-1">
                          {notification.message}
                        </p>
                        <p className="text-xs text-muted-foreground mt-2">
                          {format(new Date(notification.created_at), 'MMM dd, HH:mm')}
                        </p>
                      </div>
                    </div>
                  </div>
                );
              })
            ) : (
              <div className="p-8 text-center text-muted-foreground">
                <Bell className="h-12 w-12 mx-auto mb-4 opacity-50" />
                <p>No notifications yet</p>
                <p className="text-sm">You'll be notified about important updates here</p>
              </div>
            )}
          </div>

          {notifications.length > 0 && (
            <div className="p-4 border-t">
              <Button 
                variant="outline" 
                size="sm" 
                className="w-full"
                onClick={() => {
                  // Navigate to full notifications page
                  setShowDropdown(false);
                }}
              >
                View All Notifications
              </Button>
            </div>
          )}
        </div>
      )}

      {/* Click outside to close */}
      {showDropdown && (
        <div 
          className="fixed inset-0 z-40" 
          onClick={() => setShowDropdown(false)}
        />
      )}
    </div>
  );
}