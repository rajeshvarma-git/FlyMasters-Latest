import { useState, useEffect } from 'react';
import { supabase } from '@student/integrations/supabase/client';
import { useAuth } from '@student/hooks/useAuth';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@student/components/ui/card';
import { Button } from '@student/components/ui/button';
import { Input } from '@student/components/ui/input';
import { Badge } from '@student/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@student/components/ui/select';
import { useToast } from '@student/hooks/use-toast';
import { Textarea } from '@student/components/ui/textarea';
import { Users, Shield, UserCheck, Search, Filter, RefreshCw, Key, Phone } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@student/components/ui/dialog';
import { Label } from '@student/components/ui/label';
import { ROLES, getRoleDisplayName } from '@student/lib/auth-utils';
import type { Database } from '@student/integrations/supabase/types';

type UserRole = Database['public']['Enums']['app_role'];

interface UserProfile {
  user_id: string;
  first_name: string | null;
  last_name: string | null;
  phone: string | null;
  country: string | null;
  created_at: string;
  role: UserRole | null;
  email?: string;
  is_active?: boolean;
  deactivated_at?: string | null;
  deactivation_reason?: string | null;
}

export function UserManagement() {
  const { user, userRole } = useAuth();
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [selectedUser, setSelectedUser] = useState<UserProfile | null>(null);
  const [isRoleDialogOpen, setIsRoleDialogOpen] = useState(false);
  const [isPasswordDialogOpen, setIsPasswordDialogOpen] = useState(false);
  const [newRole, setNewRole] = useState<UserRole>(ROLES.STUDENT);
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passwordLoading, setPasswordLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [roleFilter, setRoleFilter] = useState<string>('all');
  const [isDeactivateDialogOpen, setIsDeactivateDialogOpen] = useState(false);
  const [deactivationReason, setDeactivationReason] = useState('');

  useEffect(() => {
    fetchUsers();
  }, []);

  const fetchUsers = async () => {
    try {
      setLoading(true);
      
      // First get all profiles
      const { data: profiles, error: profileError } = await supabase
        .from('profiles')
        .select('*')
        .order('created_at', { ascending: false });

      if (profileError) throw profileError;

      // Then get all user roles
      const { data: userRoles, error: roleError } = await supabase
        .from('user_roles')
        .select('user_id, role');

      if (roleError) throw roleError;

      // Combine the data
      const usersWithRoles = profiles?.map(profile => {
        const userRole = userRoles?.find(role => role.user_id === profile.user_id);
        return {
          ...profile,
          role: userRole?.role || ROLES.STUDENT
        };
      }) || [];

      setUsers(usersWithRoles);
    } catch (error: any) {
      console.error('Error fetching users:', error);
      toast({
        title: "Error",
        description: "Failed to load users.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleRoleChange = async () => {
    if (!selectedUser) return;

    try {
      // Check if user already has a role record
      const { data: existingRole } = await supabase
        .from('user_roles')
        .select('*')
        .eq('user_id', selectedUser.user_id)
        .maybeSingle();

      if (existingRole) {
        // Update existing role
        const { error } = await supabase
          .from('user_roles')
          .update({ role: newRole })
          .eq('user_id', selectedUser.user_id);

        if (error) throw error;
      } else {
        // Insert new role
        const { error } = await supabase
          .from('user_roles')
          .insert({ user_id: selectedUser.user_id, role: newRole });

        if (error) throw error;
      }

      toast({
        title: "Success",
        description: `User role updated to ${getRoleDisplayName(newRole)}.`,
      });

      setIsRoleDialogOpen(false);
      setSelectedUser(null);
      fetchUsers();
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    }
  };

  const openRoleDialog = (user: UserProfile) => {
    setSelectedUser(user);
    setNewRole(user.role || ROLES.STUDENT);
    setIsRoleDialogOpen(true);
  };

  const canResetPassword = (targetUserRole: UserRole | null): boolean => {
    if (!userRole || !targetUserRole) return false;
    
    // Super admin can reset all passwords
    if (userRole === ROLES.SUPER_ADMIN) return true;
    
    // Admin cannot reset super admin passwords
    if (userRole === ROLES.ADMIN) {
      return targetUserRole !== ROLES.SUPER_ADMIN;
    }
    
    return false;
  };

  const handleDeactivateUser = async () => {
    if (!selectedUser) return;

    try {
      const isDeactivating = selectedUser.is_active !== false;
      
      const { error } = await supabase
        .from('profiles')
        .update({
          is_active: !isDeactivating,
          deactivated_at: isDeactivating ? new Date().toISOString() : null,
          deactivated_by: isDeactivating ? user?.id : null,
          deactivation_reason: isDeactivating ? deactivationReason : null
        } as any)
        .eq('user_id', selectedUser.user_id);

      if (error) throw error;

      toast({
        title: "Success",
        description: isDeactivating ? "User has been deactivated" : "User has been reactivated",
      });

      setIsDeactivateDialogOpen(false);
      setSelectedUser(null);
      setDeactivationReason('');
      fetchUsers();
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    }
  };

  const openDeactivateDialog = (user: UserProfile) => {
    setSelectedUser(user);
    setDeactivationReason('');
    setIsDeactivateDialogOpen(true);
  };

  const openPasswordDialog = (user: UserProfile) => {
    setSelectedUser(user);
    setNewPassword('');
    setConfirmPassword('');
    setIsPasswordDialogOpen(true);
  };

  const handlePasswordReset = async () => {
    if (!selectedUser) return;

    if (newPassword.length < 6) {
      toast({
        title: "Error",
        description: "Password must be at least 6 characters long.",
        variant: "destructive",
      });
      return;
    }

    if (newPassword !== confirmPassword) {
      toast({
        title: "Error",
        description: "Passwords do not match.",
        variant: "destructive",
      });
      return;
    }

    try {
      setPasswordLoading(true);
      
      const dbRes = await fetch('/__local_db');
      const db = await dbRes.json();
      const found = (db.authUsers || []).find((user: any) => user.id === selectedUser.user_id);
      if (!found) throw new Error('User not found');
      found.password = newPassword;
      await fetch('/__local_db', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(db),
      });

      toast({
        title: "Success",
        description: "Password has been reset successfully.",
      });

      setIsPasswordDialogOpen(false);
      setSelectedUser(null);
      setNewPassword('');
      setConfirmPassword('');
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setPasswordLoading(false);
    }
  };

  const getRoleBadge = (role: UserRole | null) => {
    switch (role) {
      case ROLES.SUPER_ADMIN:
        return <Badge className="bg-red-100 text-red-800"><Shield className="w-3 h-3 mr-1" />Super Admin</Badge>;
      case ROLES.ADMIN:
        return <Badge className="bg-purple-100 text-purple-800"><Shield className="w-3 h-3 mr-1" />Admin</Badge>;
      case ROLES.COUNSELOR:
        return <Badge className="bg-blue-100 text-blue-800"><UserCheck className="w-3 h-3 mr-1" />Counselor</Badge>;
      case ROLES.TELECALLER:
        return <Badge className="bg-emerald-100 text-emerald-800"><Phone className="w-3 h-3 mr-1" />Telecaller</Badge>;
      default:
        return <Badge className="bg-green-100 text-green-800">Student</Badge>;
    }
  };

  const filteredUsers = users.filter(user => {
    const matchesSearch = !searchTerm || 
      user.first_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      user.last_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      user.email?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      user.phone?.includes(searchTerm);
    
    const matchesRole = roleFilter === 'all' || user.role === roleFilter;
    
    return matchesSearch && matchesRole;
  });

  const uniqueRoles = [...new Set(users.map(user => user.role).filter((role): role is UserRole => Boolean(role) && role !== null && role !== undefined))];
  const userStats = {
    total: users.length,
    students: users.filter(u => u.role === ROLES.STUDENT).length,
    counselors: users.filter(u => u.role === ROLES.COUNSELOR).length,
    admins: users.filter(u => u.role === ROLES.ADMIN || u.role === ROLES.SUPER_ADMIN).length,
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <h2 className="text-2xl font-bold">User Management</h2>
        <div className="grid gap-4 md:grid-cols-4">
          {[...Array(4)].map((_, i) => (
            <Card key={i} className="glass-card animate-pulse">
              <CardContent className="p-6">
                <div className="h-6 bg-muted/20 rounded w-1/3 mb-2"></div>
                <div className="h-8 bg-muted/20 rounded w-2/3"></div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">User Management</h2>
          <p className="text-muted-foreground">Manage user accounts and assign roles</p>
        </div>
        <Button onClick={fetchUsers} variant="outline">
          <RefreshCw className="w-4 h-4 mr-2" />
          Refresh
        </Button>
      </div>

      {/* Statistics Cards */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card className="glass-card">
          <CardContent className="p-6">
            <div className="flex items-center gap-2">
              <Users className="w-5 h-5 text-primary" />
              <div>
                <p className="text-2xl font-bold text-primary">{userStats.total}</p>
                <p className="text-sm text-muted-foreground">Total Users</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="glass-card">
          <CardContent className="p-6">
            <div className="flex items-center gap-2">
              <div className="w-5 h-5 rounded-full bg-green-100"></div>
              <div>
                <p className="text-2xl font-bold text-primary">{userStats.students}</p>
                <p className="text-sm text-muted-foreground">Students</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="glass-card">
          <CardContent className="p-6">
            <div className="flex items-center gap-2">
              <UserCheck className="w-5 h-5 text-blue-600" />
              <div>
                <p className="text-2xl font-bold text-primary">{userStats.counselors}</p>
                <p className="text-sm text-muted-foreground">Counselors</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="glass-card">
          <CardContent className="p-6">
            <div className="flex items-center gap-2">
              <Shield className="w-5 h-5 text-purple-600" />
              <div>
                <p className="text-2xl font-bold text-primary">{userStats.admins}</p>
                <p className="text-sm text-muted-foreground">Admins</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <Card className="glass-card">
        <CardContent className="p-4">
          <div className="flex gap-4">
            <div className="flex-1">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground w-4 h-4" />
                <Input
                  placeholder="Search by name, email, or phone..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10"
                />
              </div>
            </div>
            <div className="w-48">
              <Select value={roleFilter} onValueChange={setRoleFilter}>
                <SelectTrigger>
                  <SelectValue placeholder="Filter by role" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Roles</SelectItem>
                  {uniqueRoles.map(role => (
                    <SelectItem key={role} value={role}>
                      {getRoleDisplayName(role)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Users List */}
      <div className="grid gap-4">
        {filteredUsers.length === 0 ? (
          <Card className="glass-card">
            <CardContent className="p-12 text-center">
              <Users className="w-16 h-16 text-muted-foreground mx-auto mb-4" />
              <h3 className="text-xl font-semibold mb-2">No Users Found</h3>
              <p className="text-muted-foreground">
                No users match the current search and filter criteria.
              </p>
            </CardContent>
          </Card>
        ) : (
          filteredUsers.map((userProfile) => (
            <Card key={userProfile.user_id} className="glass-card">
              <CardHeader>
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <CardTitle className="flex items-center gap-2">
                      <Users className="w-5 h-5" />
                      {userProfile.first_name} {userProfile.last_name}
                      {getRoleBadge(userProfile.role)}
                    </CardTitle>
                    <CardDescription>
                      User ID: {userProfile.user_id}
                      <br />
                      {userProfile.phone && <>Phone: {userProfile.phone}<br /></>}
                      {userProfile.country && <>Country: {userProfile.country}<br /></>}
                      Joined: {new Date(userProfile.created_at).toLocaleDateString()}
                    </CardDescription>
                  </div>
                  
                  <div className="flex items-center gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => openRoleDialog(userProfile)}
                    >
                      <Shield className="w-4 h-4 mr-1" />
                      Change Role
                    </Button>
                    {canResetPassword(userProfile.role) && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => openPasswordDialog(userProfile)}
                      >
                        <Key className="w-4 h-4 mr-1" />
                        Reset Password
                      </Button>
                    )}
                    <Button
                      size="sm"
                      variant={userProfile.is_active === false ? "default" : "destructive"}
                      onClick={() => openDeactivateDialog(userProfile)}
                    >
                      {userProfile.is_active === false ? 'Reactivate' : 'Deactivate'}
                    </Button>
                  </div>
                </div>
              </CardHeader>
            </Card>
          ))
        )}
      </div>

      {/* Role Change Dialog */}
      <Dialog open={isRoleDialogOpen} onOpenChange={setIsRoleDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Change User Role</DialogTitle>
          </DialogHeader>
          
          {selectedUser && (
            <div className="space-y-4">
              <div>
                <p><strong>User:</strong> {selectedUser.first_name} {selectedUser.last_name}</p>
                <p><strong>Current Role:</strong> {getRoleDisplayName(selectedUser.role)}</p>
              </div>

              <div className="space-y-2">
                <Label>New Role</Label>
                <Select value={newRole} onValueChange={(value) => setNewRole(value as UserRole)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={ROLES.STUDENT}>Student</SelectItem>
                    <SelectItem value={ROLES.TELECALLER}>Telecaller</SelectItem>
                    <SelectItem value={ROLES.COUNSELOR}>Counselor</SelectItem>
                    <SelectItem value={ROLES.ADMIN}>Admin</SelectItem>
                    <SelectItem value={ROLES.SUPER_ADMIN}>Super Admin</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="flex gap-2">
                <Button onClick={handleRoleChange}>
                  Update Role
                </Button>
                <Button variant="outline" onClick={() => setIsRoleDialogOpen(false)}>
                  Cancel
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Password Reset Dialog */}
      <Dialog open={isPasswordDialogOpen} onOpenChange={setIsPasswordDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reset User Password</DialogTitle>
          </DialogHeader>
          
          {selectedUser && (
            <div className="space-y-4">
              <div className="p-4 bg-muted/50 rounded-lg">
                <p><strong>User:</strong> {selectedUser.first_name} {selectedUser.last_name}</p>
                <p><strong>Role:</strong> {getRoleDisplayName(selectedUser.role)}</p>
                <p className="text-sm text-muted-foreground mt-2">
                  You are about to reset the password for this user.
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="newPassword">New Password</Label>
                <Input
                  id="newPassword"
                  type="password"
                  placeholder="Enter new password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  disabled={passwordLoading}
                />
                <p className="text-xs text-muted-foreground">Minimum 6 characters</p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="confirmPassword">Confirm Password</Label>
                <Input
                  id="confirmPassword"
                  type="password"
                  placeholder="Confirm new password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  disabled={passwordLoading}
                />
              </div>

              <div className="flex gap-2">
                <Button 
                  onClick={handlePasswordReset}
                  disabled={passwordLoading || !newPassword || !confirmPassword}
                >
                  {passwordLoading ? "Resetting..." : "Reset Password"}
                </Button>
                <Button 
                  variant="outline" 
                  onClick={() => setIsPasswordDialogOpen(false)}
                  disabled={passwordLoading}
                >
                  Cancel
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Deactivate User Dialog */}
      <Dialog open={isDeactivateDialogOpen} onOpenChange={setIsDeactivateDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {selectedUser?.is_active === false ? 'Reactivate User' : 'Deactivate User'}
            </DialogTitle>
          </DialogHeader>
          
          {selectedUser && (
            <div className="space-y-4">
              <div className="p-4 bg-muted/50 rounded-lg">
                <p><strong>User:</strong> {selectedUser.first_name} {selectedUser.last_name}</p>
                <p><strong>Role:</strong> {getRoleDisplayName(selectedUser.role)}</p>
                <p className="text-sm text-muted-foreground mt-2">
                  {selectedUser.is_active === false 
                    ? 'This will reactivate the user account and restore access.'
                    : 'This will prevent the user from logging in and accessing the system.'
                  }
                </p>
                {selectedUser.deactivation_reason && (
                  <div className="mt-4 p-3 bg-destructive/10 rounded-md">
                    <p className="text-sm font-medium">Previous Deactivation Reason:</p>
                    <p className="text-sm text-muted-foreground">{selectedUser.deactivation_reason}</p>
                  </div>
                )}
              </div>

              {selectedUser.is_active !== false && (
                <div className="space-y-2">
                  <Label htmlFor="deactivationReason">Reason for Deactivation</Label>
                  <Textarea
                    id="deactivationReason"
                    placeholder="Enter the reason for deactivating this user account..."
                    value={deactivationReason}
                    onChange={(e) => setDeactivationReason(e.target.value)}
                    rows={3}
                  />
                  <p className="text-xs text-muted-foreground">
                    This reason will be logged for future reference
                  </p>
                </div>
              )}

              <div className="flex gap-2">
                <Button 
                  onClick={handleDeactivateUser}
                  variant={selectedUser.is_active === false ? "default" : "destructive"}
                  disabled={selectedUser.is_active !== false && !deactivationReason.trim()}
                >
                  {selectedUser.is_active === false ? 'Reactivate User' : 'Deactivate User'}
                </Button>
                <Button 
                  variant="outline" 
                  onClick={() => setIsDeactivateDialogOpen(false)}
                >
                  Cancel
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}