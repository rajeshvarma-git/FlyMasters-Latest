import { useState, useEffect } from 'react';
import { supabase } from '@student/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@student/components/ui/card';
import { Button } from '@student/components/ui/button';
import { Badge } from '@student/components/ui/badge';
import { useToast } from '@student/hooks/use-toast';
import { FileText, Download, ArrowRight, Clock, User, RotateCcw } from 'lucide-react';
import { Tables } from '@student/integrations/supabase/types';

type Document = Tables<'documents'>;
type DocumentVersion = Tables<'document_versions'>;

interface DocumentWithVersions extends Document {
  versions: DocumentVersion[];
}

interface DocumentVersionManagerProps {
  documents: DocumentWithVersions[];
  onDownload: (document: Document) => void;
}

export function DocumentVersionManager({ documents, onDownload }: DocumentVersionManagerProps) {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [versions, setVersions] = useState<{ [documentId: string]: DocumentVersion[] }>({});

  useEffect(() => {
    fetchVersions();
  }, [documents]);

  const fetchVersions = async () => {
    try {
      setLoading(true);
      const documentIds = documents.map(doc => doc.id);
      
      if (documentIds.length === 0) return;

      const { data, error } = await supabase
        .from('document_versions')
        .select('*')
        .in('document_id', documentIds)
        .order('version_number', { ascending: false });

      if (error) throw error;

      // Group versions by document_id
      const groupedVersions: { [documentId: string]: DocumentVersion[] } = {};
      data?.forEach(version => {
        if (!groupedVersions[version.document_id]) {
          groupedVersions[version.document_id] = [];
        }
        groupedVersions[version.document_id].push(version);
      });

      setVersions(groupedVersions);
    } catch (error: any) {
      console.error('Error fetching versions:', error);
      toast({
        title: "Error fetching versions",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const rollbackToVersion = async (versionId: string, documentId: string) => {
    try {
      const version = versions[documentId]?.find(v => v.id === versionId);
      if (!version) return;

      // Mark current document as not current
      await supabase
        .from('documents')
        .update({ is_current_version: false })
        .eq('id', documentId);

      // Create new document entry with the rolled-back version
      const { error } = await supabase
        .from('documents')
        .insert({
          user_id: version.uploaded_by,
          document_type: documents.find(d => d.id === documentId)?.document_type,
          file_name: version.file_name,
          file_path: version.file_path,
          file_size: version.file_size,
          mime_type: version.mime_type,
          version_number: version.version_number,
          parent_document_id: documentId,
          is_current_version: true,
        });

      if (error) throw error;

      toast({
        title: "Version rolled back",
        description: `Successfully rolled back to version ${version.version_number}`,
      });

      // Refresh data
      window.location.reload();
    } catch (error: any) {
      toast({
        title: "Rollback failed",
        description: error.message,
        variant: "destructive",
      });
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

  const formatFileSize = (bytes: number | null) => {
    if (!bytes) return 'Unknown size';
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    if (bytes === 0) return '0 Byte';
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    return Math.round(bytes / Math.pow(1024, i) * 100) / 100 + ' ' + sizes[i];
  };

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

  const documentsWithVersions = documents.filter(doc => versions[doc.id] && versions[doc.id].length > 1);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold">Document Version History</h3>
          <p className="text-sm text-muted-foreground">
            Manage and rollback to previous versions of your documents
          </p>
        </div>
      </div>

      {documentsWithVersions.length === 0 ? (
        <Card className="glass-card">
          <CardContent className="text-center py-12">
            <FileText className="w-16 h-16 mx-auto mb-4 text-muted-foreground opacity-50" />
            <h3 className="text-lg font-semibold mb-2">No Version History Available</h3>
            <p className="text-muted-foreground">
              Upload multiple versions of documents to see version history here.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-6">
          {documentsWithVersions.map((document) => (
            <Card key={document.id} className="glass-card">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <FileText className="w-5 h-5" />
                  {document.document_type}
                  <Badge variant="outline">
                    {versions[document.id]?.length || 0} versions
                  </Badge>
                </CardTitle>
                <CardDescription>
                  Current version: {document.version_number} • {document.file_name}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {versions[document.id]?.map((version, index) => (
                    <div
                      key={version.id}
                      className={`flex items-center justify-between p-4 rounded-lg border ${
                        version.is_current ? 'border-primary/20 bg-primary/5' : 'border-border/20'
                      }`}
                    >
                      <div className="flex items-center gap-4">
                        <div className="flex items-center justify-center w-8 h-8 rounded-full bg-muted">
                          <span className="text-sm font-medium">v{version.version_number}</span>
                        </div>
                        
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-1">
                            <span className="font-medium">{version.file_name}</span>
                            {version.is_current && (
                              <Badge className="bg-success/10 text-success border-success/20">
                                Current
                              </Badge>
                            )}
                          </div>
                          <div className="flex items-center gap-4 text-xs text-muted-foreground">
                            <div className="flex items-center gap-1">
                              <Clock className="w-3 h-3" />
                              {new Date(version.created_at).toLocaleDateString()}
                            </div>
                            <span>{formatFileSize(version.file_size)}</span>
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
                            onClick={() => rollbackToVersion(version.id, document.id)}
                            className="hover:bg-warning/10"
                          >
                            <RotateCcw className="w-4 h-4 mr-1" />
                            Rollback
                          </Button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>

                {versions[document.id] && versions[document.id].length > 3 && (
                  <div className="mt-4 pt-4 border-t border-border/20">
                    <div className="flex items-center justify-center">
                      <ArrowRight className="w-4 h-4 text-muted-foreground" />
                      <span className="text-xs text-muted-foreground ml-2">
                        Version timeline shows most recent first
                      </span>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}