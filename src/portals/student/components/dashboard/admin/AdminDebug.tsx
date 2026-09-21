import { useAuth } from '@student/hooks/useAuth';
import { Card, CardContent, CardHeader, CardTitle } from '@student/components/ui/card';
import { Badge } from '@student/components/ui/badge';
import { Button } from '@student/components/ui/button';
import { useState, useEffect } from 'react';
import { supabase } from '@student/integrations/supabase/client';
import { User, Shield, AlertCircle, CheckCircle } from 'lucide-react';

export function AdminDebug() {
  const { user, userRole, isAdmin, loading, roleLoading, hasRole } = useAuth();
  const [userRoles, setUserRoles] = useState<any[]>([]);
  const [profiles, setProfiles] = useState<any[]>([]);
  const [debugLoading, setDebugLoading] = useState(false);

  const fetchDebugData = async () => {
    if (!user) return;
    
    try {
      setDebugLoading(true);
      
      // Fetch all user roles
      const { data: roles, error: rolesError } = await supabase
        .from('user_roles')
        .select('*');
      
      if (rolesError) {
        console.error('Error fetching roles:', rolesError);
      } else {
        setUserRoles(roles || []);
      }

      // Fetch all profiles
      const { data: profilesData, error: profilesError } = await supabase
        .from('profiles')
        .select('*');
      
      if (profilesError) {
        console.error('Error fetching profiles:', profilesError);
      } else {
        setProfiles(profilesData || []);
      }
    } catch (error) {
      console.error('Debug fetch error:', error);
    } finally {
      setDebugLoading(false);
    }
  };

  useEffect(() => {
    if (user && !roleLoading) {
      fetchDebugData();
    }
  }, [user, roleLoading]);

  const assignAdminRole = async () => {
    if (!user) return;
    
    try {
      const { error } = await supabase
        .from('user_roles')
        .upsert({ user_id: user.id, role: 'admin' });
      
      if (error) {
        console.error('Error assigning admin role:', error);
      } else {
        console.log('Admin role assigned successfully');
        // Refresh page to update auth state
        window.location.reload();
      }
    } catch (error) {
      console.error('Error assigning admin role:', error);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <div className="w-12 h-12 rounded-full bg-gradient-primary flex items-center justify-center">
          <AlertCircle className="w-6 h-6 text-white" />
        </div>
        <div>
          <h1 className="text-3xl font-bold">Admin Debug Panel</h1>
          <p className="text-muted-foreground">Debug authentication and admin access</p>
        </div>
      </div>

      {/* Auth Status */}
      <Card className="glass-card">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <User className="w-5 h-5" />
            Authentication Status
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <p className="text-sm font-medium">User ID:</p>
              <p className="text-sm text-muted-foreground font-mono">{user?.id || 'Not logged in'}</p>
            </div>
            <div>
              <p className="text-sm font-medium">Email:</p>
              <p className="text-sm text-muted-foreground">{user?.email || 'N/A'}</p>
            </div>
            <div>
              <p className="text-sm font-medium">Current Role:</p>
              <Badge variant={userRole ? 'default' : 'destructive'}>
                {userRole || 'No role assigned'}
              </Badge>
            </div>
            <div>
              <p className="text-sm font-medium">Admin Access:</p>
              <div className="flex items-center gap-2">
                {isAdmin ? (
                  <CheckCircle className="w-4 h-4 text-green-500" />
                ) : (
                  <AlertCircle className="w-4 h-4 text-red-500" />
                )}
                <span className={isAdmin ? 'text-green-600' : 'text-red-600'}>
                  {isAdmin ? 'Granted' : 'Denied'}
                </span>
              </div>
            </div>
          </div>

          <div className="flex gap-2">
            <Button onClick={fetchDebugData} disabled={debugLoading}>
              Refresh Debug Data
            </Button>
            {user && !isAdmin && (
              <Button onClick={assignAdminRole} variant="outline">
                <Shield className="w-4 h-4 mr-2" />
                Assign Admin Role
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Role Assignment Debug */}
      <Card className="glass-card">
        <CardHeader>
          <CardTitle>User Roles in Database</CardTitle>
        </CardHeader>
        <CardContent>
          {userRoles.length > 0 ? (
            <div className="space-y-2">
              {userRoles.map((role, index) => (
                <div key={index} className="flex items-center justify-between p-3 bg-muted/50 rounded-lg">
                  <div>
                    <p className="font-mono text-sm">{role.user_id}</p>
                    <Badge>{role.role}</Badge>
                  </div>
                  {role.user_id === user?.id && (
                    <Badge variant="outline">Current User</Badge>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <p className="text-muted-foreground">No user roles found</p>
          )}
        </CardContent>
      </Card>

      {/* Loading States */}
      <Card className="glass-card">
        <CardHeader>
          <CardTitle>Loading States</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 md:grid-cols-3">
            <div className="text-center">
              <p className="text-sm font-medium">Auth Loading</p>
              <Badge variant={loading ? 'destructive' : 'default'}>
                {loading ? 'Loading...' : 'Complete'}
              </Badge>
            </div>
            <div className="text-center">
              <p className="text-sm font-medium">Role Loading</p>
              <Badge variant={roleLoading ? 'destructive' : 'default'}>
                {roleLoading ? 'Loading...' : 'Complete'}
              </Badge>
            </div>
            <div className="text-center">
              <p className="text-sm font-medium">Debug Loading</p>
              <Badge variant={debugLoading ? 'destructive' : 'default'}>
                {debugLoading ? 'Loading...' : 'Complete'}
              </Badge>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}