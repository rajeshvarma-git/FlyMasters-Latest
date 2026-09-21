import { useState, useEffect } from 'react';
import { supabase } from '@student/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@student/components/ui/card';
import { Button } from '@student/components/ui/button';
import { Input } from '@student/components/ui/input';
import { Textarea } from '@student/components/ui/textarea';
import { Badge } from '@student/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@student/components/ui/select';
import { useToast } from '@student/components/ui/use-toast';
import { FileText, Download, Check, X, Eye, MessageSquare } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@student/components/ui/dialog';
import { Tables } from '@student/integrations/supabase/types';

type Document = Tables<'documents'>;

interface DocumentWithUser extends Document {
  profiles: {
    first_name: string | null;
    last_name: string | null;
  } | null;
}

export function DocumentsAdmin() {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [documents, setDocuments] = useState<DocumentWithUser[]>([]);
  const [statusFilter, setStatusFilter] = useState<string>('pending');
  const [selectedDocument, setSelectedDocument] = useState<DocumentWithUser | null>(null);
  const [reviewComment, setReviewComment] = useState('');
  const [reviewStatus, setReviewStatus] = useState<'approved' | 'rejected'>('approved');

  useEffect(() => {
    fetchDocuments();
  }, []);

  const fetchDocuments = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('documents')
        .select(`
          *,
          profiles (
            first_name,
            last_name
          )
        `)
        .order('created_at', { ascending: false });

      if (error) throw error;
      setDocuments((data as any) || []);
    } catch (error: any) {
      console.error('Error fetching documents:', error);
      toast({
        title: "Error",
        description: "Failed to load documents.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const updateDocumentStatus = async (documentId: string, status: string, comments: string = '') => {
    try {
      const { error } = await supabase
        .from('documents')
        .update({ 
          status,
          admin_comments: comments,
          updated_at: new Date().toISOString()
        })
        .eq('id', documentId);

      if (error) throw error;

      setDocuments(prev => prev.map(doc => 
        doc.id === documentId ? { ...doc, status, admin_comments: comments } : doc
      ));

      toast({
        title: "Document updated",
        description: `Document has been ${status}.`,
      });
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    }
  };

  const handleReview = async () => {
    if (!selectedDocument) return;

    await updateDocumentStatus(selectedDocument.id, reviewStatus, reviewComment);
    setSelectedDocument(null);
    setReviewComment('');
    setReviewStatus('approved');
  };

  const downloadDocument = async (document: Document) => {
    try {
      const { data, error } = await supabase.storage
        .from('documents')
        .download(document.file_path);

      if (error) throw error;

      const url = URL.createObjectURL(data);
      const a = window.document.createElement('a');
      a.href = url;
      a.download = document.file_name;
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

  const filteredDocuments = documents.filter(doc => {
    if (statusFilter === 'all') return true;
    return doc.status === statusFilter;
  });

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'approved':
        return <Badge className="bg-green-100 text-green-800"><Check className="w-3 h-3 mr-1" />Approved</Badge>;
      case 'rejected':
        return <Badge className="bg-red-100 text-red-800"><X className="w-3 h-3 mr-1" />Rejected</Badge>;
      default:
        return <Badge className="bg-yellow-100 text-yellow-800">Pending Review</Badge>;
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
        <h2 className="text-2xl font-bold">Document Reviews</h2>
        <div className="grid gap-4">
          {[...Array(5)].map((_, i) => (
            <Card key={i} className="glass-card animate-pulse">
              <CardContent className="p-6">
                <div className="h-6 bg-muted/20 rounded w-1/3 mb-2"></div>
                <div className="h-4 bg-muted/20 rounded w-1/2 mb-4"></div>
                <div className="flex gap-2">
                  <div className="h-6 bg-muted/20 rounded w-20"></div>
                  <div className="h-6 bg-muted/20 rounded w-20"></div>
                </div>
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
        <h2 className="text-2xl font-bold">Document Reviews</h2>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-48">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Documents</SelectItem>
            <SelectItem value="pending">Pending Review</SelectItem>
            <SelectItem value="approved">Approved</SelectItem>
            <SelectItem value="rejected">Rejected</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="grid gap-4">
        {filteredDocuments.length === 0 ? (
          <Card className="glass-card">
            <CardContent className="p-12 text-center">
              <FileText className="w-16 h-16 text-muted-foreground mx-auto mb-4" />
              <h3 className="text-xl font-semibold mb-2">No Documents Found</h3>
              <p className="text-muted-foreground">
                {statusFilter === 'all' 
                  ? 'No documents have been uploaded yet.'
                  : `No ${statusFilter} documents found.`
                }
              </p>
            </CardContent>
          </Card>
        ) : (
          filteredDocuments.map((document) => (
            <Card key={document.id} className="glass-card">
              <CardHeader>
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <CardTitle className="text-lg">
                      {document.document_type}
                    </CardTitle>
                    <CardDescription>
                      Student: {document.profiles?.first_name} {document.profiles?.last_name}
                      <br />
                      File: {document.file_name} ({formatFileSize(document.file_size)})
                      <br />
                      Uploaded: {new Date(document.created_at).toLocaleDateString()}
                    </CardDescription>
                  </div>

                  <div className="flex items-center gap-2">
                    {getStatusBadge(document.status)}
                  </div>
                </div>
              </CardHeader>

              <CardContent>
                <div className="flex items-center gap-2">
                  <Button
                    size="sm"
                    onClick={() => downloadDocument(document)}
                  >
                    <Download className="w-4 h-4 mr-2" />
                    Download
                  </Button>

                  {document.status === 'pending' && (
                    <Dialog>
                      <DialogTrigger asChild>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => setSelectedDocument(document)}
                        >
                          <Eye className="w-4 h-4 mr-2" />
                          Review
                        </Button>
                      </DialogTrigger>
                      <DialogContent>
                        <DialogHeader>
                          <DialogTitle>Review Document</DialogTitle>
                        </DialogHeader>
                        
                        <div className="space-y-4">
                          <div>
                            <p><strong>Document:</strong> {document.document_type}</p>
                            <p><strong>Student:</strong> {document.profiles?.first_name} {document.profiles?.last_name}</p>
                            <p><strong>File:</strong> {document.file_name}</p>
                          </div>

                          <div className="space-y-2">
                            <label className="text-sm font-medium">Review Decision</label>
                            <Select value={reviewStatus} onValueChange={(value) => setReviewStatus(value as 'approved' | 'rejected')}>
                              <SelectTrigger>
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="approved">Approve</SelectItem>
                                <SelectItem value="rejected">Reject</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>

                          <div className="space-y-2">
                            <label className="text-sm font-medium">Comments (optional)</label>
                            <Textarea
                              placeholder="Add any comments for the student..."
                              value={reviewComment}
                              onChange={(e) => setReviewComment(e.target.value)}
                            />
                          </div>

                          <div className="flex gap-2">
                            <Button onClick={handleReview}>
                              {reviewStatus === 'approved' ? (
                                <>
                                  <Check className="w-4 h-4 mr-2" />
                                  Approve Document
                                </>
                              ) : (
                                <>
                                  <X className="w-4 h-4 mr-2" />
                                  Reject Document
                                </>
                              )}
                            </Button>
                          </div>
                        </div>
                      </DialogContent>
                    </Dialog>
                  )}
                </div>

                {document.admin_comments && (
                  <div className="mt-4 p-3 bg-muted/50 rounded-lg">
                    <div className="flex items-center gap-2 mb-1">
                      <MessageSquare className="w-4 h-4 text-muted-foreground" />
                      <span className="text-sm font-medium">Admin Comments</span>
                    </div>
                    <p className="text-sm text-muted-foreground">{document.admin_comments}</p>
                  </div>
                )}
              </CardContent>
            </Card>
          ))
        )}
      </div>
    </div>
  );
}