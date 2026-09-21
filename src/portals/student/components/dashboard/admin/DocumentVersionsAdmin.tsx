import { useState, useEffect } from 'react';
import { supabase } from '@student/integrations/supabase/client';
import { useAuth } from '@student/hooks/useAuth';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@student/components/ui/card';
import { Button } from '@student/components/ui/button';
import { Input } from '@student/components/ui/input';
import { Badge } from '@student/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@student/components/ui/select';
import { useToast } from '@student/hooks/use-toast';
import { FileText, Download, Search, Filter, History, RotateCcw } from 'lucide-react';
import { Tables } from '@student/integrations/supabase/types';

type DocumentVersion = Tables<'document_versions'>;
type Document = Tables<'documents'>;

interface DocumentVersionWithDoc extends DocumentVersion {
  documents?: Document;
}

export function DocumentVersionsAdmin() {
  const { isAdmin } = useAuth();
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [versions, setVersions] = useState<DocumentVersionWithDoc[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [documentTypeFilter, setDocumentTypeFilter] = useState<string>('all');

  useEffect(() => {
    if (isAdmin) {
      fetchVersions();
    }
  }, [isAdmin]);

  const fetchVersions = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('document_versions')
        .select(`
          *,
          documents (*)
        `)
        .order('created_at', { ascending: false })
        .limit(100);

      if (error) throw error;
      setVersions((data as any) || []);
    } catch (error: any) {
      console.error('Error fetching document versions:', error);
      toast({
        title: "Error fetching document versions",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const downloadVersion = async (version: DocumentVersion) => {
    try {
      const { data, error } = await supabase.storage
        .from('documents')
        .download(version.file_path);

      if (error) throw error;

      const url = URL.createObjectURL(data);
      const a = window.document.createElement('a');
      a.href = url;
      a.download = version.file_name;
      a.click();
      URL.revokeObjectURL(url);
    } catch (error: any) {
      toast({
        title: "Download failed",
        description: error.message,
        variant: "destructive",
      });
    }
  };

  const restoreVersion = async (version: DocumentVersionWithDoc) => {
    try {
      if (!version.documents) return;

      // Mark current document as not current
      await supabase
        .from('documents')
        .update({ is_current_version: false })
        .eq('id', version.document_id);

      // Create new document entry with the restored version
      const { error } = await supabase
        .from('documents')
        .insert({
          user_id: version.uploaded_by,
          document_type: version.documents?.document_type,
          file_name: version.file_name,
          file_path: version.file_path,
          file_size: version.file_size,
          mime_type: version.mime_type,
          version_number: version.version_number,
          parent_document_id: version.document_id,
          is_current_version: true,
        });

      if (error) throw error;

      toast({
        title: "Version restored",
        description: `Successfully restored version ${version.version_number}`,
      });

      fetchVersions();
    } catch (error: any) {
      toast({
        title: "Restore failed",
        description: error.message,
        variant: "destructive",
      });
    }
  };

  const formatFileSize = (bytes: number | null) => {
    if (!bytes) return 'Unknown size';
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    if (bytes === 0) return '0 Byte';
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    return Math.round(bytes / Math.pow(1024, i) * 100) / 100 + ' ' + sizes[i];
  };

  const filteredVersions = versions.filter(version => {
    const matchesSearch = version.file_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         (version.documents?.document_type || '').toLowerCase().includes(searchTerm.toLowerCase());
    const matchesType = documentTypeFilter === 'all' || version.documents?.document_type === documentTypeFilter;
    return matchesSearch && matchesType;
  });

  const uniqueDocumentTypes = [...new Set(versions.map(v => v.documents?.document_type).filter(Boolean))];

  if (!isAdmin) {
    return (
      <Card className="glass-card">
        <CardContent className="p-12 text-center">
          <FileText className="w-16 h-16 text-muted-foreground mx-auto mb-4" />
          <h3 className="text-xl font-semibold mb-2">Admin Access Required</h3>
          <p className="text-muted-foreground">
            You need admin privileges to access document version management.
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
          <h2 className="text-2xl font-bold">Document Version Management</h2>
          <p className="text-muted-foreground">
            Manage and restore document versions across all users
          </p>
        </div>
        <Button onClick={fetchVersions}>
          <History className="w-4 h-4 mr-2" />
          Refresh
        </Button>
      </div>

      {/* Search and Filter */}
      <Card className="glass-card">
        <CardContent className="p-4">
          <div className="flex gap-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground w-4 h-4" />
              <Input
                placeholder="Search by filename or document type..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10"
              />
            </div>
            <Select value={documentTypeFilter} onValueChange={setDocumentTypeFilter}>
              <SelectTrigger className="w-48">
                <Filter className="w-4 h-4 mr-2" />
                <SelectValue placeholder="Filter by document type" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Document Types</SelectItem>
                {uniqueDocumentTypes.map(type => (
                  <SelectItem key={type} value={type!}>{type}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Version History */}
      <div className="space-y-4">
        {filteredVersions.length === 0 ? (
          <Card className="glass-card">
            <CardContent className="text-center py-12">
              <History className="w-16 h-16 mx-auto mb-4 text-muted-foreground opacity-50" />
              <h3 className="text-lg font-semibold mb-2">No Version History Found</h3>
              <p className="text-muted-foreground">
                {searchTerm || documentTypeFilter !== 'all' 
                  ? 'No versions match your current filters.'
                  : 'No document versions have been created yet.'
                }
              </p>
            </CardContent>
          </Card>
        ) : (
          filteredVersions.map((version) => (
            <Card key={version.id} className="glass-card">
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <div className="flex items-center justify-center w-10 h-10 rounded-full bg-muted">
                      <span className="text-sm font-medium">v{version.version_number}</span>
                    </div>
                    
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <h4 className="font-medium">{version.file_name}</h4>
                        <Badge variant="outline">
                          {version.documents?.document_type || 'Unknown Type'}
                        </Badge>
                        {version.is_current && (
                          <Badge className="bg-success/10 text-success border-success/20">
                            Current
                          </Badge>
                        )}
                      </div>
                      
                      <div className="flex items-center gap-4 text-sm text-muted-foreground">
                        <span>Size: {formatFileSize(version.file_size)}</span>
                        <span>Created: {new Date(version.created_at).toLocaleDateString()}</span>
                        {version.change_reason && (
                          <span>Reason: {version.change_reason}</span>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => downloadVersion(version)}
                    >
                      <Download className="w-4 h-4" />
                    </Button>
                    
                    {!version.is_current && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => restoreVersion(version)}
                        className="hover:bg-warning/10"
                      >
                        <RotateCcw className="w-4 h-4 mr-1" />
                        Restore
                      </Button>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          ))
        )}
      </div>

      {filteredVersions.length > 0 && (
        <Card className="glass-card">
          <CardContent className="p-4 text-center">
            <p className="text-sm text-muted-foreground">
              Showing {filteredVersions.length} of {versions.length} document versions
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}