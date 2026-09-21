import { useState, useEffect } from 'react';
import { useAuth } from '@student/hooks/useAuth';
import { supabase } from '@student/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@student/components/ui/card';
import { Button } from '@student/components/ui/button';
import { Input } from '@student/components/ui/input';
import { Label } from '@student/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@student/components/ui/select';
import { useToast } from '@student/hooks/use-toast';
import { Badge } from '@student/components/ui/badge';
import { Progress } from '@student/components/ui/progress';
import { Skeleton } from '@student/components/ui/skeleton';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@student/components/ui/dialog';
import { FileText, Upload, Check, X, Clock, Trash2, Download, Search, Filter, Eye, RefreshCw, AlertCircle } from 'lucide-react';
import { Tables } from '@student/integrations/supabase/types';

type Document = Tables<'documents'>;
type DocumentChecklist = Tables<'document_checklists'>;

export { EnhancedDocumentsSection as DocumentsSection } from './EnhancedDocumentsSection';

export function OriginalDocumentsSection() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [documents, setDocuments] = useState<Document[]>([]);
  const [checklist, setChecklist] = useState<DocumentChecklist[]>([]);
  const [uploading, setUploading] = useState<string | null>(null);
  const [uploadProgress, setUploadProgress] = useState<{ [key: string]: number }>({});
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [selectedCountry, setSelectedCountry] = useState('');
  const [selectedDegree, setSelectedDegree] = useState('');

  useEffect(() => {
    if (user) {
      fetchDocuments();
      if (selectedCountry && selectedDegree) {
        fetchChecklist();
      }
    }
  }, [user, selectedCountry, selectedDegree]);

  const fetchDocuments = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('documents')
        .select('*')
        .eq('user_id', user?.id)
        .eq('archived', false)
        .order('created_at', { ascending: false });

      if (error) throw error;
      setDocuments(data || []);
    } catch (error: any) {
      console.error('Error fetching documents:', error);
      toast({
        title: "Error fetching documents",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const fetchChecklist = async () => {
    try {
      const { data, error } = await supabase
        .from('document_checklists')
        .select('*')
        .eq('country', selectedCountry)
        .eq('degree_type', selectedDegree)
        .eq('is_active', true)
        .order('is_required', { ascending: false });

      if (error) throw error;
      setChecklist(data || []);
    } catch (error: any) {
      console.error('Error fetching checklist:', error);
      toast({
        title: "Error fetching requirements",
        description: error.message,
        variant: "destructive",
      });
    }
  };

  const validateFile = (file: File, checklist: DocumentChecklist | null) => {
    const maxSize = (checklist?.max_file_size_mb || 10) * 1024 * 1024;
    const allowedTypes = checklist?.allowed_file_types || ['pdf', 'jpg', 'jpeg', 'png', 'doc', 'docx'];
    
    if (file.size > maxSize) {
      throw new Error(`File size must be less than ${checklist?.max_file_size_mb || 10}MB`);
    }
    
    const fileExtension = file.name.split('.').pop()?.toLowerCase();
    if (!fileExtension || !allowedTypes.includes(fileExtension)) {
      throw new Error(`File type must be one of: ${allowedTypes.join(', ')}`);
    }
  };

  const uploadFile = async (file: File, documentType: string) => {
    if (!user) return;

    const checklistItem = checklist.find(item => item.document_type === documentType);
    
    try {
      validateFile(file, checklistItem);
    } catch (error: any) {
      toast({
        title: "Invalid file",
        description: error.message,
        variant: "destructive",
      });
      return;
    }

    setUploading(documentType);
    setUploadProgress({ ...uploadProgress, [documentType]: 0 });
    
    try {
      const fileExt = file.name.split('.').pop();
      const fileName = `${user.id}/${documentType}_${Date.now()}.${fileExt}`;
      
      const { error: uploadError } = await supabase.storage
        .from('documents')
        .upload(fileName, file);

      if (uploadError) throw uploadError;

      setUploadProgress({ ...uploadProgress, [documentType]: 50 });

      const { error: dbError } = await supabase
        .from('documents')
        .insert({
          user_id: user.id,
          document_type: documentType,
          file_name: file.name,
          file_path: fileName,
          file_size: file.size,
          mime_type: file.type,
        });

      if (dbError) throw dbError;

      setUploadProgress({ ...uploadProgress, [documentType]: 100 });

      toast({
        title: "Document uploaded",
        description: `Your ${documentType} has been uploaded successfully.`,
      });

      fetchDocuments();
    } catch (error: any) {
      toast({
        title: "Upload failed",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setUploading(null);
      const newProgress = { ...uploadProgress };
      delete newProgress[documentType];
      setUploadProgress(newProgress);
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>, documentType: string) => {
    const file = e.target.files?.[0];
    if (file) {
      uploadFile(file, documentType);
    }
    // Reset the input value to allow uploading the same file again
    e.target.value = '';
  };

  const downloadFile = async (document: Document) => {
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

  const deleteDocument = async (document: Document) => {
    try {
      const { error: storageError } = await supabase.storage
        .from('documents')
        .remove([document.file_path]);

      if (storageError) throw storageError;

      const { error: dbError } = await supabase
        .from('documents')
        .delete()
        .eq('id', document.id);

      if (dbError) throw dbError;

      toast({
        title: "Document deleted",
        description: "The document has been removed successfully.",
      });

      fetchDocuments();
    } catch (error: any) {
      toast({
        title: "Delete failed",
        description: error.message,
        variant: "destructive",
      });
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'approved':
        return <Badge variant="secondary" className="bg-success/10 text-success border-success/20"><Check className="w-3 h-3 mr-1" />Approved</Badge>;
      case 'rejected':
        return <Badge variant="destructive" className="bg-destructive/10 text-destructive border-destructive/20"><X className="w-3 h-3 mr-1" />Rejected</Badge>;
      default:
        return <Badge variant="outline" className="bg-warning/10 text-warning border-warning/20"><Clock className="w-3 h-3 mr-1" />Pending</Badge>;
    }
  };

  const filteredDocuments = documents.filter(doc => {
    const matchesSearch = doc.document_type.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         doc.file_name.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesStatus = statusFilter === 'all' || doc.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  const isDocumentUploaded = (documentType: string) => {
    return documents.some(doc => doc.document_type === documentType);
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-4">
          <Skeleton className="w-12 h-12 rounded-full" />
          <div className="space-y-2">
            <Skeleton className="h-8 w-48" />
            <Skeleton className="h-4 w-64" />
          </div>
        </div>
        <div className="grid gap-4">
          {[1, 2, 3].map(i => (
            <Card key={i} className="glass-card">
              <CardHeader>
                <Skeleton className="h-6 w-32" />
                <Skeleton className="h-4 w-48" />
              </CardHeader>
              <CardContent>
                <Skeleton className="h-24 w-full" />
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
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-full bg-gradient-primary flex items-center justify-center">
            <FileText className="w-6 h-6 text-white" />
          </div>
          <div>
            <h1 className="text-3xl font-bold">Documents</h1>
            <p className="text-muted-foreground">Upload and manage your application documents</p>
          </div>
        </div>
        <Button 
          variant="outline" 
          size="sm" 
          onClick={() => {
            fetchDocuments();
            if (selectedCountry && selectedDegree) fetchChecklist();
          }}
        >
          <RefreshCw className="w-4 h-4 mr-2" />
          Refresh
        </Button>
      </div>

      {/* Country and Degree Selection */}
      <Card className="glass-card">
        <CardHeader>
          <CardTitle>Document Requirements</CardTitle>
          <CardDescription>Select your target country and degree to see required documents</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label>Target Country</Label>
              <Select value={selectedCountry} onValueChange={setSelectedCountry}>
                <SelectTrigger>
                  <SelectValue placeholder="Select country" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="USA">United States</SelectItem>
                  <SelectItem value="Canada">Canada</SelectItem>
                  <SelectItem value="UK">United Kingdom</SelectItem>
                  <SelectItem value="Australia">Australia</SelectItem>
                </SelectContent>
              </Select>
            </div>
            
            <div className="space-y-2">
              <Label>Degree Type</Label>
              <Select value={selectedDegree} onValueChange={setSelectedDegree}>
                <SelectTrigger>
                  <SelectValue placeholder="Select degree type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Bachelors">Bachelor's</SelectItem>
                  <SelectItem value="Masters">Master's</SelectItem>
                  <SelectItem value="PhD">PhD</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Document Checklist */}
      {checklist.length > 0 && (
        <Card className="glass-card">
          <CardHeader>
            <CardTitle>Required Documents for {selectedCountry} - {selectedDegree}</CardTitle>
            <CardDescription>Upload the following documents for your application</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {checklist.map((item) => {
                const isUploaded = isDocumentUploaded(item.document_type);
                const uploadedDoc = documents.find(doc => doc.document_type === item.document_type);
                
                return (
                  <div key={item.id} className="flex items-center justify-between p-4 border border-border/20 rounded-lg hover:bg-muted/50 transition-colors">
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <h4 className="font-medium">{item.document_type}</h4>
                        {item.is_required && (
                          <Badge variant="outline" className="text-xs bg-destructive/10 text-destructive border-destructive/20">
                            Required
                          </Badge>
                        )}
                        {isUploaded && (
                          <Check className="w-4 h-4 text-success" />
                        )}
                      </div>
                      <p className="text-sm text-muted-foreground mt-1">{item.description}</p>
                      
                      {/* File requirements */}
                      <div className="flex items-center gap-4 text-xs text-muted-foreground mt-2">
                        <span>Max size: {item.max_file_size_mb}MB</span>
                        <span>Types: {item.allowed_file_types.join(', ')}</span>
                      </div>
                      
                      {uploadedDoc && (
                        <div className="flex flex-col gap-2 mt-3">
                          <div className="flex items-center gap-2">
                            {getStatusBadge(uploadedDoc.status)}
                            <span className="text-xs text-muted-foreground">
                              {uploadedDoc.file_name} • {(uploadedDoc.file_size / 1024 / 1024).toFixed(2)}MB
                            </span>
                          </div>
                          {uploadedDoc.admin_comments && (
                            <div className="flex items-start gap-2 p-2 bg-muted/30 rounded-md">
                              <AlertCircle className="w-4 h-4 text-warning mt-0.5 flex-shrink-0" />
                              <span className="text-xs text-muted-foreground">
                                <strong>Admin Note:</strong> {uploadedDoc.admin_comments}
                              </span>
                            </div>
                          )}
                        </div>
                      )}
                      
                      {/* Upload progress */}
                      {uploading === item.document_type && uploadProgress[item.document_type] !== undefined && (
                        <div className="mt-3">
                          <div className="flex items-center justify-between text-xs text-muted-foreground mb-1">
                            <span>Uploading...</span>
                            <span>{uploadProgress[item.document_type]}%</span>
                          </div>
                          <Progress value={uploadProgress[item.document_type]} className="h-2" />
                        </div>
                      )}
                    </div>
                    
                    <div className="flex items-center gap-2 ml-4">
                      {isUploaded ? (
                        <>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => downloadFile(uploadedDoc!)}
                            className="hover:bg-primary/10"
                          >
                            <Download className="w-4 h-4" />
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => deleteDocument(uploadedDoc!)}
                            className="hover:bg-destructive/10 hover:text-destructive hover:border-destructive/20"
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </>
                      ) : (
                        <div className="relative">
                          <input
                            type="file"
                            id={`file-${item.document_type}`}
                            accept={item.allowed_file_types.map(type => `.${type}`).join(',')}
                            onChange={(e) => handleFileUpload(e, item.document_type)}
                            className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                            disabled={uploading === item.document_type}
                          />
                          <Button
                            size="sm"
                            disabled={uploading === item.document_type}
                            className="bg-primary hover:bg-primary/90"
                          >
                            <Upload className="w-4 h-4 mr-2" />
                            {uploading === item.document_type ? 'Uploading...' : 'Upload'}
                          </Button>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Search and Filter */}
      {documents.length > 0 && (
        <Card className="glass-card">
          <CardHeader>
            <CardTitle className="flex items-center justify-between">
              All Documents
              <span className="text-sm font-normal text-muted-foreground">
                {filteredDocuments.length} of {documents.length} documents
              </span>
            </CardTitle>
            <CardDescription>Search and manage all your uploaded documents</CardDescription>
          </CardHeader>
          <CardContent>
            {/* Search and Filter Controls */}
            <div className="flex flex-col sm:flex-row gap-4 mb-6">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground w-4 h-4" />
                <Input
                  placeholder="Search documents..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10"
                />
              </div>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-full sm:w-48">
                  <Filter className="w-4 h-4 mr-2" />
                  <SelectValue placeholder="Filter by status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Status</SelectItem>
                  <SelectItem value="pending">Pending</SelectItem>
                  <SelectItem value="approved">Approved</SelectItem>
                  <SelectItem value="rejected">Rejected</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Documents List */}
            <div className="space-y-3">
              {filteredDocuments.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <FileText className="w-12 h-12 mx-auto mb-4 opacity-50" />
                  <p>No documents found matching your criteria</p>
                </div>
              ) : (
                filteredDocuments.map((document) => (
                  <div key={document.id} className="flex items-center justify-between p-4 border border-border/20 rounded-lg hover:bg-muted/50 transition-colors">
                    <div className="flex items-center gap-4">
                      <FileText className="w-6 h-6 text-muted-foreground flex-shrink-0" />
                      <div className="min-w-0 flex-1">
                        <h4 className="font-medium truncate">{document.document_type}</h4>
                        <p className="text-sm text-muted-foreground truncate">{document.file_name}</p>
                        <div className="flex items-center gap-4 text-xs text-muted-foreground mt-1">
                          <span>Uploaded {new Date(document.created_at).toLocaleDateString()}</span>
                          <span>{(document.file_size / 1024 / 1024).toFixed(2)}MB</span>
                          {document.mime_type && <span>{document.mime_type}</span>}
                        </div>
                        {document.admin_comments && (
                          <div className="flex items-start gap-2 mt-2 p-2 bg-muted/30 rounded-md">
                            <AlertCircle className="w-4 h-4 text-warning mt-0.5 flex-shrink-0" />
                            <span className="text-xs text-muted-foreground">
                              <strong>Admin Note:</strong> {document.admin_comments}
                            </span>
                          </div>
                        )}
                      </div>
                    </div>
                    
                    <div className="flex items-center gap-3 ml-4">
                      {getStatusBadge(document.status)}
                      <div className="flex gap-1">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => downloadFile(document)}
                          className="hover:bg-primary/10"
                        >
                          <Download className="w-4 h-4" />
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => deleteDocument(document)}
                          className="hover:bg-destructive/10 hover:text-destructive hover:border-destructive/20"
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Empty State */}
      {!loading && documents.length === 0 && (
        <Card className="glass-card">
          <CardContent className="text-center py-12">
            <FileText className="w-16 h-16 mx-auto mb-4 text-muted-foreground opacity-50" />
            <h3 className="text-lg font-semibold mb-2">No documents uploaded yet</h3>
            <p className="text-muted-foreground mb-4">
              Select your target country and degree type above to see required documents and start uploading.
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}