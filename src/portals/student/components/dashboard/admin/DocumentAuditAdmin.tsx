import { useState, useEffect } from 'react';
import { supabase } from '@student/integrations/supabase/client';
import { useAuth } from '@student/hooks/useAuth';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@student/components/ui/card';
import { Button } from '@student/components/ui/button';
import { Input } from '@student/components/ui/input';
import { Badge } from '@student/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@student/components/ui/select';
import { useToast } from '@student/hooks/use-toast';
import { Shield, Search, Filter, Upload, Check, X, Download, Trash2, Edit, RefreshCw, Calendar, User } from 'lucide-react';
import { Tables } from '@student/integrations/supabase/types';

type DocumentAuditLog = Tables<'document_audit_logs'>;

interface DocumentAuditLogWithDoc extends DocumentAuditLog {
  documents?: {
    document_type?: string;
    file_name?: string;
    user_id?: string;
  };
}

export function DocumentAuditAdmin() {
  const { isAdmin } = useAuth();
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [auditLogs, setAuditLogs] = useState<DocumentAuditLogWithDoc[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [actionFilter, setActionFilter] = useState<string>('all');
  const [dateFilter, setDateFilter] = useState<string>('all');

  useEffect(() => {
    if (isAdmin) {
      fetchAuditLogs();
    }
  }, [isAdmin]);

  const fetchAuditLogs = async () => {
    try {
      setLoading(true);
      
      let query = supabase
        .from('document_audit_logs')
        .select(`
          *,
          documents (
            document_type,
            file_name,
            user_id
          )
        `)
        .order('created_at', { ascending: false });

      // Apply date filter
      if (dateFilter !== 'all') {
        const now = new Date();
        let filterDate = new Date();
        
        switch (dateFilter) {
          case 'today':
            filterDate.setHours(0, 0, 0, 0);
            break;
          case 'week':
            filterDate.setDate(now.getDate() - 7);
            break;
          case 'month':
            filterDate.setMonth(now.getMonth() - 1);
            break;
        }
        
        query = query.gte('created_at', filterDate.toISOString());
      }

      const { data, error } = await query.limit(200);

      if (error) throw error;
      setAuditLogs((data as any) || []);
    } catch (error: any) {
      console.error('Error fetching audit logs:', error);
      toast({
        title: "Error fetching audit logs",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const exportAuditLogs = async () => {
    try {
      const csvData = filteredLogs.map(log => ({
        timestamp: new Date(log.created_at).toISOString(),
        action: log.action_type,
        document_type: log.documents?.document_type || 'Unknown',
        file_name: log.documents?.file_name || 'Unknown',
        user_id: log.documents?.user_id || 'Unknown',
        performed_by: log.performed_by || 'System',
        ip_address: log.ip_address || 'Unknown'
      }));

      const csvContent = [
        Object.keys(csvData[0]).join(','),
        ...csvData.map(row => Object.values(row).map(val => `"${val}"`).join(','))
      ].join('\n');

      const blob = new Blob([csvContent], { type: 'text/csv' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `audit_logs_${new Date().toISOString().split('T')[0]}.csv`;
      a.click();
      URL.revokeObjectURL(url);

      toast({
        title: "Export successful",
        description: "Audit logs have been exported to CSV.",
      });
    } catch (error: any) {
      toast({
        title: "Export failed",
        description: error.message,
        variant: "destructive",
      });
    }
  };

  const getActionIcon = (actionType: string) => {
    switch (actionType) {
      case 'upload':
        return <Upload className="w-4 h-4" />;
      case 'approve':
      case 'status_change':
        return <Check className="w-4 h-4" />;
      case 'reject':
        return <X className="w-4 h-4" />;
      case 'download':
        return <Download className="w-4 h-4" />;
      case 'delete':
        return <Trash2 className="w-4 h-4" />;
      case 'file_update':
        return <Edit className="w-4 h-4" />;
      default:
        return <RefreshCw className="w-4 h-4" />;
    }
  };

  const getActionBadge = (actionType: string) => {
    const configs = {
      upload: { className: "bg-primary/10 text-primary border-primary/20", label: "Upload" },
      approve: { className: "bg-success/10 text-success border-success/20", label: "Approved" },
      reject: { className: "bg-destructive/10 text-destructive border-destructive/20", label: "Rejected" },
      download: { className: "bg-secondary/10 text-secondary-foreground border-secondary/20", label: "Download" },
      delete: { className: "bg-destructive/10 text-destructive border-destructive/20", label: "Deleted" },
      file_update: { className: "bg-warning/10 text-warning border-warning/20", label: "Updated" },
      status_change: { className: "bg-warning/10 text-warning border-warning/20", label: "Status Changed" },
    };

    const config = configs[actionType as keyof typeof configs] || {
      className: "bg-muted/10 text-muted-foreground border-muted/20",
      label: actionType.charAt(0).toUpperCase() + actionType.slice(1)
    };

    return (
      <Badge variant="outline" className={config.className}>
        {getActionIcon(actionType)}
        <span className="ml-1">{config.label}</span>
      </Badge>
    );
  };

  const formatTimestamp = (timestamp: string) => {
    const date = new Date(timestamp);
    return date.toLocaleDateString() + ' at ' + date.toLocaleTimeString([], { 
      hour: '2-digit', 
      minute: '2-digit' 
    });
  };

  const filteredLogs = auditLogs.filter(log => {
    const matchesSearch = log.documents && (
      log.documents.document_type?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      log.documents.file_name?.toLowerCase().includes(searchTerm.toLowerCase())
    );
    const matchesAction = actionFilter === 'all' || log.action_type === actionFilter;
    return matchesSearch && matchesAction;
  });

  if (!isAdmin) {
    return (
      <Card className="glass-card">
        <CardContent className="p-12 text-center">
          <Shield className="w-16 h-16 text-muted-foreground mx-auto mb-4" />
          <h3 className="text-xl font-semibold mb-2">Admin Access Required</h3>
          <p className="text-muted-foreground">
            You need admin privileges to access audit logs.
          </p>
        </CardContent>
      </Card>
    );
  }

  if (loading) {
    return (
      <div className="space-y-6">
        <Card className="glass-card animate-pulse">
          <CardContent className="p-6">
            <div className="h-6 bg-muted/20 rounded w-1/3 mb-2"></div>
            <div className="h-4 bg-muted/20 rounded w-1/2 mb-4"></div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">Document Audit Logs</h2>
          <p className="text-muted-foreground">
            Monitor all document-related activities across the system
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={exportAuditLogs}>
            <Download className="w-4 h-4 mr-2" />
            Export CSV
          </Button>
          <Button onClick={fetchAuditLogs}>
            <RefreshCw className="w-4 h-4 mr-2" />
            Refresh
          </Button>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card className="glass-card">
          <CardContent className="p-4">
            <div className="text-2xl font-bold text-primary">
              {auditLogs.filter(log => log.action_type === 'upload').length}
            </div>
            <div className="text-sm text-muted-foreground">Total Uploads</div>
          </CardContent>
        </Card>
        <Card className="glass-card">
          <CardContent className="p-4">
            <div className="text-2xl font-bold text-success">
              {auditLogs.filter(log => log.action_type === 'approve').length}
            </div>
            <div className="text-sm text-muted-foreground">Approvals</div>
          </CardContent>
        </Card>
        <Card className="glass-card">
          <CardContent className="p-4">
            <div className="text-2xl font-bold text-destructive">
              {auditLogs.filter(log => log.action_type === 'reject').length}
            </div>
            <div className="text-sm text-muted-foreground">Rejections</div>
          </CardContent>
        </Card>
        <Card className="glass-card">
          <CardContent className="p-4">
            <div className="text-2xl font-bold text-secondary-foreground">
              {auditLogs.filter(log => log.action_type === 'download').length}
            </div>
            <div className="text-sm text-muted-foreground">Downloads</div>
          </CardContent>
        </Card>
      </div>

      {/* Search and Filter */}
      <Card className="glass-card">
        <CardContent className="p-4">
          <div className="flex gap-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground w-4 h-4" />
              <Input
                placeholder="Search by document type or filename..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10"
              />
            </div>
            <Select value={actionFilter} onValueChange={setActionFilter}>
              <SelectTrigger className="w-48">
                <Filter className="w-4 h-4 mr-2" />
                <SelectValue placeholder="Filter by action" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Actions</SelectItem>
                <SelectItem value="upload">Upload</SelectItem>
                <SelectItem value="approve">Approve</SelectItem>
                <SelectItem value="reject">Reject</SelectItem>
                <SelectItem value="download">Download</SelectItem>
                <SelectItem value="delete">Delete</SelectItem>
                <SelectItem value="file_update">File Update</SelectItem>
                <SelectItem value="status_change">Status Change</SelectItem>
              </SelectContent>
            </Select>
            <Select value={dateFilter} onValueChange={setDateFilter}>
              <SelectTrigger className="w-32">
                <Calendar className="w-4 h-4 mr-2" />
                <SelectValue placeholder="Date" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Time</SelectItem>
                <SelectItem value="today">Today</SelectItem>
                <SelectItem value="week">This Week</SelectItem>
                <SelectItem value="month">This Month</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Audit Log Entries */}
      <div className="space-y-3">
        {filteredLogs.length === 0 ? (
          <Card className="glass-card">
            <CardContent className="text-center py-12">
              <RefreshCw className="w-16 h-16 mx-auto mb-4 text-muted-foreground opacity-50" />
              <h3 className="text-lg font-semibold mb-2">No Audit Logs Found</h3>
              <p className="text-muted-foreground">
                {searchTerm || actionFilter !== 'all' || dateFilter !== 'all'
                  ? 'No activities match your current filters.'
                  : 'No document activities have been recorded yet.'
                }
              </p>
            </CardContent>
          </Card>
        ) : (
          filteredLogs.map((log) => (
            <Card key={log.id} className="glass-card">
              <CardContent className="p-4">
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-2">
                      {getActionBadge(log.action_type)}
                      <span className="font-medium">
                        {log.documents?.document_type || 'Unknown Document'}
                      </span>
                    </div>
                    
                    <p className="text-sm text-muted-foreground mb-2">
                      Action performed on document: {log.documents?.file_name || 'Unknown File'}
                    </p>
                    
                    <div className="flex items-center gap-4 text-xs text-muted-foreground">
                      <div className="flex items-center gap-1">
                        <User className="w-3 h-3" />
                        User ID: {log.documents?.user_id || 'Unknown'}
                      </div>
                      {log.performed_by && (
                        <span>Performed by: {log.performed_by}</span>
                      )}
                      {log.ip_address && (
                        <span>IP: {String(log.ip_address)}</span>
                      )}
                    </div>
                    
                    {log.additional_data && Object.keys(log.additional_data as any).length > 0 && (
                      <details className="mt-2">
                        <summary className="text-xs text-muted-foreground cursor-pointer hover:text-foreground">
                          Additional Details
                        </summary>
                        <pre className="text-xs bg-muted/20 p-2 rounded mt-1 overflow-auto max-h-20">
                          {JSON.stringify(log.additional_data || {}, null, 2)}
                        </pre>
                      </details>
                    )}
                  </div>
                  
                  <div className="text-right ml-4">
                    <p className="text-xs text-muted-foreground">
                      {formatTimestamp(log.created_at)}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))
        )}
      </div>

      {filteredLogs.length > 0 && (
        <Card className="glass-card">
          <CardContent className="p-4 text-center">
            <p className="text-sm text-muted-foreground">
              Showing {filteredLogs.length} of {auditLogs.length} audit records
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}