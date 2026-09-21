import { useAuth } from '@student/hooks/useAuth';
import { Card, CardContent, CardHeader, CardTitle } from '@student/components/ui/card';
import { Badge } from '@student/components/ui/badge';
import { Shield, User } from 'lucide-react';

export function AdminTestComponent() {
  const { user, userRole, isAdmin, loading, roleLoading } = useAuth();

  if (loading || roleLoading) {
    return (
      <Card className="glass-card">
        <CardContent className="p-6">
          <div className="animate-pulse">
            <div className="h-4 bg-muted/20 rounded w-3/4 mb-2"></div>
            <div className="h-4 bg-muted/20 rounded w-1/2"></div>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="glass-card">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Shield className="w-5 h-5" />
          Admin Access Debug
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-2">
          <div className="flex items-center justify-between">
            <span className="font-medium">User ID:</span>
            <code className="text-xs bg-muted px-2 py-1 rounded">{user?.id || 'Not logged in'}</code>
          </div>
          <div className="flex items-center justify-between">
            <span className="font-medium">Email:</span>
            <span className="text-sm">{user?.email || 'N/A'}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="font-medium">Role:</span>
            <Badge variant={userRole === 'admin' || userRole === 'super_admin' ? 'default' : 'secondary'}>
              {userRole || 'No role'}
            </Badge>
          </div>
          <div className="flex items-center justify-between">
            <span className="font-medium">Is Admin:</span>
            <Badge variant={isAdmin ? 'default' : 'destructive'}>
              {isAdmin ? 'Yes' : 'No'}
            </Badge>
          </div>
          <div className="flex items-center justify-between">
            <span className="font-medium">Loading States:</span>
            <span className="text-sm">
              Auth: {loading ? 'Loading...' : 'Ready'}, Role: {roleLoading ? 'Loading...' : 'Ready'}
            </span>
          </div>
        </div>
        
        {!isAdmin && (
          <div className="mt-4 p-3 bg-destructive/10 border border-destructive/20 rounded-lg">
            <p className="text-sm text-destructive font-medium">
              Admin access required. Current role: {userRole || 'No role assigned'}
            </p>
          </div>
        )}
        
        {isAdmin && (
          <div className="mt-4 p-3 bg-primary/10 border border-primary/20 rounded-lg">
            <p className="text-sm text-primary font-medium">
              ✅ Admin access granted! You should be able to access the admin dashboard.
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}