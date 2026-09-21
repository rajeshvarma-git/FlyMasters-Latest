import { useState } from 'react';
import { supabase } from '@student/integrations/supabase/client';
import { Card, CardContent } from '@student/components/ui/card';
import { Button } from '@student/components/ui/button';
import { Badge } from '@student/components/ui/badge';
import { useToast } from '@student/hooks/use-toast';
import { Check, Bell, CheckCheck, Trash2, AlertCircle, FileText, Upload, X } from 'lucide-react';
import { Tables } from '@student/integrations/supabase/types';

type DocumentNotification = Tables<'document_notifications'>;

interface DocumentNotificationsProps {
  notifications: DocumentNotification[];
  onRefresh: () => void;
}

export function DocumentNotifications({ notifications, onRefresh }: DocumentNotificationsProps) {
  const { toast } = useToast();
  const [loading, setLoading] = useState<string | null>(null);

  const markAsRead = async (notificationId: string) => {
    try {
      setLoading(notificationId);
      const { error } = await supabase
        .from('document_notifications')
        .update({ 
          is_read: true, 
          read_at: new Date().toISOString() 
        })
        .eq('id', notificationId);

      if (error) throw error;

      toast({
        title: "Notification marked as read",
        description: "The notification has been marked as read.",
      });

      onRefresh();
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setLoading(null);
    }
  };

  const markAllAsRead = async () => {
    try {
      setLoading('all');
      const { error } = await supabase
        .from('document_notifications')
        .update({ 
          is_read: true, 
          read_at: new Date().toISOString() 
        })
        .eq('is_read', false);

      if (error) throw error;

      toast({
        title: "All notifications marked as read",
        description: "All notifications have been marked as read.",
      });

      onRefresh();
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setLoading(null);
    }
  };

  const deleteNotification = async (notificationId: string) => {
    try {
      setLoading(notificationId);
      const { error } = await supabase
        .from('document_notifications')
        .delete()
        .eq('id', notificationId);

      if (error) throw error;

      toast({
        title: "Notification deleted",
        description: "The notification has been deleted.",
      });

      onRefresh();
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setLoading(null);
    }
  };

  const getNotificationIcon = (type: string) => {
    switch (type) {
      case 'upload_success':
        return <Upload className="w-5 h-5 text-primary" />;
      case 'approval':
        return <Check className="w-5 h-5 text-success" />;
      case 'rejection':
        return <X className="w-5 h-5 text-destructive" />;
      case 'expiry_warning':
        return <AlertCircle className="w-5 h-5 text-warning" />;
      case 'missing_document':
        return <FileText className="w-5 h-5 text-warning" />;
      default:
        return <Bell className="w-5 h-5 text-muted-foreground" />;
    }
  };

  const getNotificationBadge = (type: string) => {
    const configs = {
      upload_success: { className: "bg-primary/10 text-primary border-primary/20", label: "Upload" },
      approval: { className: "bg-success/10 text-success border-success/20", label: "Approved" },
      rejection: { className: "bg-destructive/10 text-destructive border-destructive/20", label: "Rejected" },
      expiry_warning: { className: "bg-warning/10 text-warning border-warning/20", label: "Expiry" },
      missing_document: { className: "bg-warning/10 text-warning border-warning/20", label: "Missing" },
    };

    const config = configs[type as keyof typeof configs] || {
      className: "bg-muted/10 text-muted-foreground border-muted/20",
      label: "Notification"
    };

    return (
      <Badge variant="outline" className={config.className}>
        {config.label}
      </Badge>
    );
  };

  const formatTimestamp = (timestamp: string) => {
    const date = new Date(timestamp);
    const now = new Date();
    const diffInHours = Math.floor((now.getTime() - date.getTime()) / (1000 * 60 * 60));
    
    if (diffInHours < 1) {
      const diffInMinutes = Math.floor((now.getTime() - date.getTime()) / (1000 * 60));
      return `${diffInMinutes} minutes ago`;
    } else if (diffInHours < 24) {
      return `${diffInHours} hours ago`;
    } else {
      return date.toLocaleDateString();
    }
  };

  if (notifications.length === 0) {
    return (
      <Card className="glass-card">
        <CardContent className="text-center py-8">
          <Bell className="w-12 h-12 mx-auto mb-4 text-muted-foreground opacity-50" />
          <h3 className="text-lg font-semibold mb-2">No New Notifications</h3>
          <p className="text-muted-foreground">
            You're all caught up! We'll notify you of any document updates.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header Actions */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Bell className="w-5 h-5 text-muted-foreground" />
          <span className="font-medium">{notifications.length} notifications</span>
        </div>
        {notifications.some(n => !n.is_read) && (
          <Button
            variant="outline"
            size="sm"
            onClick={markAllAsRead}
            disabled={loading === 'all'}
          >
            <CheckCheck className="w-4 h-4 mr-1" />
            Mark All Read
          </Button>
        )}
      </div>

      {/* Notifications List */}
      <div className="space-y-3 max-h-96 overflow-y-auto">
        {notifications.map((notification) => (
          <Card key={notification.id} className={`glass-card transition-all duration-200 ${
            notification.is_read ? 'opacity-70' : 'border-primary/20'
          }`}>
            <CardContent className="p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-start gap-3 flex-1">
                  <div className="mt-0.5">
                    {getNotificationIcon(notification.notification_type)}
                  </div>
                  
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <h4 className="font-medium text-sm truncate">{notification.title}</h4>
                      {getNotificationBadge(notification.notification_type)}
                    </div>
                    
                    <p className="text-sm text-muted-foreground mb-2 line-clamp-2">
                      {notification.message}
                    </p>
                    
                    <div className="flex items-center justify-between text-xs text-muted-foreground">
                      <span>{formatTimestamp(notification.created_at)}</span>
                      {notification.is_read && notification.read_at && (
                        <span>Read {formatTimestamp(notification.read_at)}</span>
                      )}
                    </div>
                    
                    {notification.additional_data && Object.keys(notification.additional_data).length > 0 && (
                      <details className="mt-2">
                        <summary className="text-xs text-muted-foreground cursor-pointer hover:text-foreground">
                          View Details
                        </summary>
                        <div className="text-xs bg-muted/20 p-2 rounded mt-1 overflow-auto max-h-20">
                          <pre>{JSON.stringify(notification.additional_data, null, 2)}</pre>
                        </div>
                      </details>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-1">
                  {!notification.is_read && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => markAsRead(notification.id)}
                      disabled={loading === notification.id}
                      className="h-8 w-8 p-0"
                    >
                      <Check className="w-4 h-4" />
                    </Button>
                  )}
                  
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => deleteNotification(notification.id)}
                    disabled={loading === notification.id}
                    className="h-8 w-8 p-0 hover:bg-destructive/10 hover:text-destructive"
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Footer */}
      <div className="text-center pt-2 border-t border-border/20">
        <p className="text-xs text-muted-foreground">
          Notifications are automatically sent via email when document status changes
        </p>
      </div>
    </div>
  );
}