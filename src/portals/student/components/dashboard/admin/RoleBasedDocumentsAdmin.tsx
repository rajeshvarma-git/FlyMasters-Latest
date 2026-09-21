import { useState, useEffect } from 'react';
import { useAuth } from '@student/hooks/useAuth';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@student/components/ui/tabs';
import { Card, CardContent, CardHeader, CardTitle } from '@student/components/ui/card';
import { Badge } from '@student/components/ui/badge';
import { Shield, Users, FileText, Settings, Eye } from 'lucide-react';
import { DocumentsAdmin } from './DocumentsAdmin';
import { DocumentVersionsAdmin } from './DocumentVersionsAdmin';
import { EnhancedDocumentsAdmin } from './EnhancedDocumentsAdmin';
import { DocumentChecklistAdmin } from './DocumentChecklistAdmin';
import { DocumentOptionsManager } from './DocumentOptionsManager';

export function RoleBasedDocumentsAdmin() {
  const { userRole, isAdmin } = useAuth();
  const [activeTab, setActiveTab] = useState('documents');

  // Define role-based access and capabilities
  const getRoleCapabilities = () => {
    switch (userRole) {
      case 'super_admin':
        return {
          canViewAll: true,
          canManageChecklists: true,
          canViewVersions: true,
          canConfigureSystem: true,
          canBulkActions: true,
          canExport: true,
          tabs: ['documents', 'enhanced', 'versions', 'checklists', 'configuration']
        };
      case 'admin':
        return {
          canViewAll: true,
          canManageChecklists: true,
          canViewVersions: true,
          canConfigureSystem: false,
          canBulkActions: true,
          canExport: false,
          tabs: ['documents', 'enhanced', 'versions', 'checklists']
        };
      case 'counselor':
        return {
          canViewAll: false, // Only assigned students
          canManageChecklists: false,
          canViewVersions: false,
          canConfigureSystem: false,
          canBulkActions: false,
          canExport: false,
          tabs: ['documents']
        };
      default:
        return {
          canViewAll: false,
          canManageChecklists: false,
          canViewVersions: false,
          canConfigureSystem: false,
          canBulkActions: false,
          canExport: false,
          tabs: ['documents']
        };
    }
  };

  const capabilities = getRoleCapabilities();

  // Auto-set default tab based on role
  useEffect(() => {
    if (!capabilities.tabs.includes(activeTab)) {
      setActiveTab(capabilities.tabs[0] || 'documents');
    }
  }, [userRole, capabilities.tabs, activeTab]);

  const getRoleIcon = () => {
    switch (userRole) {
      case 'super_admin':
        return <Shield className="w-5 h-5 text-purple-600" />;
      case 'admin':
        return <Shield className="w-5 h-5 text-blue-600" />;
      case 'counselor':
        return <Users className="w-5 h-5 text-green-600" />;
      default:
        return <Eye className="w-5 h-5 text-gray-600" />;
    }
  };

  const getRoleBadge = () => {
    const badgeColors = {
      super_admin: 'bg-purple-100 text-purple-800 border-purple-200',
      admin: 'bg-blue-100 text-blue-800 border-blue-200',
      counselor: 'bg-green-100 text-green-800 border-green-200',
      student: 'bg-gray-100 text-gray-800 border-gray-200'
    };

    return (
      <Badge className={badgeColors[userRole as keyof typeof badgeColors] || badgeColors.student}>
        {getRoleIcon()}
        <span className="ml-2 capitalize">{userRole?.replace('_', ' ')}</span>
      </Badge>
    );
  };

  if (!isAdmin && userRole !== 'counselor') {
    return (
      <Card className="glass-card">
        <CardContent className="p-12 text-center">
          <Shield className="w-16 h-16 text-muted-foreground mx-auto mb-4" />
          <h3 className="text-xl font-semibold mb-2">Access Denied</h3>
          <p className="text-muted-foreground">
            You don't have permission to access document management.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header with role indicator */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-full bg-gradient-primary flex items-center justify-center">
            <FileText className="w-6 h-6 text-white" />
          </div>
          <div>
            <h1 className="text-3xl font-bold">Document Management</h1>
            <p className="text-muted-foreground">
              {userRole === 'super_admin' && 'Full system configuration and management'}
              {userRole === 'admin' && 'Review and manage all documents'}
              {userRole === 'counselor' && 'Manage assigned student documents'}
            </p>
          </div>
        </div>
        {getRoleBadge()}
      </div>

      {/* Role-based capabilities info */}
      <Card className="glass-card">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Settings className="w-5 h-5" />
            Your Permissions
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className={`p-3 rounded-lg border ${capabilities.canViewAll ? 'bg-green-50 border-green-200' : 'bg-gray-50 border-gray-200'}`}>
              <div className="text-sm font-medium">View All Documents</div>
              <div className={`text-xs ${capabilities.canViewAll ? 'text-green-600' : 'text-gray-500'}`}>
                {capabilities.canViewAll ? 'Enabled' : 'Disabled'}
              </div>
            </div>
            <div className={`p-3 rounded-lg border ${capabilities.canManageChecklists ? 'bg-green-50 border-green-200' : 'bg-gray-50 border-gray-200'}`}>
              <div className="text-sm font-medium">Manage Checklists</div>
              <div className={`text-xs ${capabilities.canManageChecklists ? 'text-green-600' : 'text-gray-500'}`}>
                {capabilities.canManageChecklists ? 'Enabled' : 'Disabled'}
              </div>
            </div>
            <div className={`p-3 rounded-lg border ${capabilities.canViewVersions ? 'bg-green-50 border-green-200' : 'bg-gray-50 border-gray-200'}`}>
              <div className="text-sm font-medium">Version History</div>
              <div className={`text-xs ${capabilities.canViewVersions ? 'text-green-600' : 'text-gray-500'}`}>
                {capabilities.canViewVersions ? 'Enabled' : 'Disabled'}
              </div>
            </div>
            <div className={`p-3 rounded-lg border ${capabilities.canBulkActions ? 'bg-green-50 border-green-200' : 'bg-gray-50 border-gray-200'}`}>
              <div className="text-sm font-medium">Bulk Actions</div>
              <div className={`text-xs ${capabilities.canBulkActions ? 'text-green-600' : 'text-gray-500'}`}>
                {capabilities.canBulkActions ? 'Enabled' : 'Disabled'}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Tab-based interface */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
        <TabsList className="grid w-full grid-cols-2 md:grid-cols-5">
          {capabilities.tabs.includes('documents') && (
            <TabsTrigger value="documents">Documents</TabsTrigger>
          )}
          {capabilities.tabs.includes('enhanced') && (
            <TabsTrigger value="enhanced">Enhanced View</TabsTrigger>
          )}
          {capabilities.tabs.includes('versions') && (
            <TabsTrigger value="versions">Versions</TabsTrigger>
          )}
          {capabilities.tabs.includes('checklists') && (
            <TabsTrigger value="checklists">Checklists</TabsTrigger>
          )}
          {capabilities.tabs.includes('configuration') && (
            <TabsTrigger value="configuration">Configuration</TabsTrigger>
          )}
        </TabsList>

        <TabsContent value="documents" className="space-y-6">
          <DocumentsAdmin />
        </TabsContent>

        {capabilities.tabs.includes('enhanced') && (
          <TabsContent value="enhanced" className="space-y-6">
            <EnhancedDocumentsAdmin />
          </TabsContent>
        )}

        {capabilities.tabs.includes('versions') && (
          <TabsContent value="versions" className="space-y-6">
            <DocumentVersionsAdmin />
          </TabsContent>
        )}

        {capabilities.tabs.includes('checklists') && (
          <TabsContent value="checklists" className="space-y-6">
            <DocumentChecklistAdmin />
          </TabsContent>
        )}

        {capabilities.tabs.includes('configuration') && (
          <TabsContent value="configuration" className="space-y-6">
            <DocumentOptionsManager />
            
            <Card className="glass-card">
              <CardHeader>
                <CardTitle>System Configuration</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid gap-6">
                  <div className="p-4 border rounded-lg">
                    <h4 className="font-semibold mb-2">Document Upload Limits</h4>
                    <p className="text-sm text-muted-foreground mb-2">Configure maximum file sizes and allowed formats</p>
                    <div className="text-sm">
                      <div>Max file size: <span className="font-medium">10 MB</span></div>
                      <div>Allowed formats: <span className="font-medium">PDF, DOC, DOCX, JPG, PNG</span></div>
                    </div>
                  </div>

                  <div className="p-4 border rounded-lg">
                    <h4 className="font-semibold mb-2">Automated Processing</h4>
                    <p className="text-sm text-muted-foreground mb-2">Configure AI-powered document analysis and verification</p>
                    <div className="text-sm">
                      <div>Auto-categorization: <span className="font-medium text-green-600">Enabled</span></div>
                      <div>Quality checks: <span className="font-medium text-green-600">Enabled</span></div>
                      <div>OCR processing: <span className="font-medium text-green-600">Enabled</span></div>
                    </div>
                  </div>

                  <div className="p-4 border rounded-lg">
                    <h4 className="font-semibold mb-2">Notification Settings</h4>
                    <p className="text-sm text-muted-foreground mb-2">Configure alerts for document submissions and reviews</p>
                    <div className="text-sm">
                      <div>Instant notifications: <span className="font-medium text-green-600">Enabled</span></div>
                      <div>Daily digest: <span className="font-medium text-green-600">Enabled</span></div>
                      <div>Email alerts: <span className="font-medium text-green-600">Enabled</span></div>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        )}
      </Tabs>
    </div>
  );
}