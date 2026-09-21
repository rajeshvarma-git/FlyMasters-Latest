import { useState, useEffect } from 'react';
import { supabase } from '@student/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@student/components/ui/card';
import { Badge } from '@student/components/ui/badge';
import { Input } from '@student/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@student/components/ui/select';
import { useToast } from '@student/hooks/use-toast';
import { Search, Filter, Upload, Check, X, Download, Trash2, Edit, RefreshCw } from 'lucide-react';
import { Tables } from '@student/integrations/supabase/types';

type DocumentAuditLog = Tables<'document_audit_logs'>;

interface DocumentAuditLogWithDoc extends DocumentAuditLog {
  documents?: {
    document_type?: string;
    file_name?: string;
    user_id?: string;
  };
}

interface DocumentAuditLogProps {
  userId?: string;
}

export function DocumentAuditLog({ userId }: DocumentAuditLogProps) {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [auditLogs, setAuditLogs] = useState<DocumentAuditLogWithDoc[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [actionFilter, setActionFilter] = useState<string>('all');

  useEffect(() => {
    fetchAuditLogs();
  }, [userId]);

  const fetchAuditLogs = async () => {
    try {
      setLoading(true);
      
      let query = supabase
        .from('document_audit_logs')
        .select(`
          *,
          documents!inner (
            document_type,
            file_name,
            user_id
          )
        `)
        .order('created_at', { ascending: false });

      // Filter by user if provided
      if (userId) {
        query = query.eq('documents.user_id', userId);
      }

      const { data, error } = await query.limit(100);

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

  const getChangeDescription = (log: DocumentAuditLogWithDoc) => {
    if (!log.old_values && !log.new_values) {
      return `${log.action_type.charAt(0).toUpperCase() + log.action_type.slice(1)} action performed`;
    }

    if (log.action_type === 'status_change' && log.old_values && log.new_values) {
      const oldStatus = (log.old_values as any)?.status;
      const newStatus = (log.new_values as any)?.status;
      if (oldStatus && newStatus) {
        return `Status changed from "${oldStatus}" to "${newStatus}"`;
      }
    }

    if (log.action_type === 'file_update' && log.old_values && log.new_values) {
      const oldFile = (log.old_values as any)?.file_name;
      const newFile = (log.new_values as any)?.file_name;
      if (oldFile && newFile) {
        return `File updated from "${oldFile}" to "${newFile}"`;
      }
    }

    return log.action_type.charAt(0).toUpperCase() + log.action_type.slice(1) + ' action performed';
  };

  const filteredLogs = auditLogs.filter(log => {
    const matchesSearch = log.documents && (
      log.documents.document_type?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      log.documents.file_name?.toLowerCase().includes(searchTerm.toLowerCase())
    );
    const matchesAction = actionFilter === 'all' || log.action_type === actionFilter;
    return matchesSearch && matchesAction;
  });

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
          <h3 className="text-lg font-semibold">Document Activity Log</h3>
          <p className="text-sm text-muted-foreground">
            Track all document-related activities and changes
          </p>
        </div>
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
          </div>
        </CardContent>
      </Card>

      {/* Audit Log Entries */}
      <div className="space-y-4">
        {filteredLogs.length === 0 ? (
          <Card className="glass-card">
            <CardContent className="text-center py-12">
              <RefreshCw className="w-16 h-16 mx-auto mb-4 text-muted-foreground opacity-50" />
              <h3 className="text-lg font-semibold mb-2">No Activity Found</h3>
              <p className="text-muted-foreground">
                {searchTerm || actionFilter !== 'all' 
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
                      {getChangeDescription(log)}
                    </p>
                    
                    {log.documents?.file_name && (
                      <p className="text-xs text-muted-foreground">
                        File: {log.documents.file_name}
                      </p>
                    )}
                    
                    {log.additional_data && Object.keys(log.additional_data).length > 0 && (
                      <details className="mt-2">
                        <summary className="text-xs text-muted-foreground cursor-pointer hover:text-foreground">
                          Additional Details
                        </summary>
                        <pre className="text-xs bg-muted/20 p-2 rounded mt-1 overflow-auto">
                          {JSON.stringify(log.additional_data || {}, null, 2)}
                        </pre>
                      </details>
                    )}
                  </div>
                  
                  <div className="text-right ml-4">
                    <p className="text-xs text-muted-foreground">
                      {formatTimestamp(log.created_at)}
                    </p>
                    {log.ip_address && (
                      <p className="text-xs text-muted-foreground">
                        IP: {String(log.ip_address || 'Unknown')}
                      </p>
                    )}
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
              Showing {filteredLogs.length} of {auditLogs.length} activity records
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}