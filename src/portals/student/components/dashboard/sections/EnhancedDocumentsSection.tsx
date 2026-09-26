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
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@student/components/ui/tabs';
import { FileText, Upload, Check, X, Clock, Trash2, Download, RefreshCw, AlertCircle, History, Bell } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@student/components/ui/dialog';
import { DocumentVersionManager } from './DocumentVersionManager';
import { DocumentAuditLog } from './DocumentAuditLog';
import { DocumentProgressTracker } from './DocumentProgressTracker';
import { DocumentNotifications } from './DocumentNotifications';
import { Tables } from '@student/integrations/supabase/types';
import { fetchAssignedChecklists, type AssignedChecklist } from '@student/lib/crmApi';

type Document = Tables<'documents'>;
type DocumentChecklist = Tables<'document_checklists'>;
type DocumentVersion = Tables<'document_versions'>;
type DocumentNotification = Tables<'document_notifications'>;
type StudentProgress = Tables<'student_document_progress'>;

interface DocumentWithVersions extends Document {
  versions: DocumentVersion[];
  notifications: DocumentNotification[];
}

export function EnhancedDocumentsSection() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [documents, setDocuments] = useState<DocumentWithVersions[]>([]);
  const [checklist, setChecklist] = useState<DocumentChecklist[]>([]);
  const [progress, setProgress] = useState<StudentProgress | null>(null);
  const [uploading, setUploading] = useState<string | null>(null);
  const [uploadProgress, setUploadProgress] = useState<{ [key: string]: number }>({});
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [selectedCountry, setSelectedCountry] = useState('');
  const [selectedDegree, setSelectedDegree] = useState('');
  const [selectedUniversity, setSelectedUniversity] = useState('');
  const [notifications, setNotifications] = useState<DocumentNotification[]>([]);
  /**
   * CRM 2.6.2: when a counsellor has activated a country checklist for this
   * student, that is the list they see — pinned to the version that was live
   * when it was activated, with the counsellor's status and next-step note on
   * each item. The country/degree pickers below are the older self-service
   * path and stay only as the fallback for students with nothing activated.
   */
  const [assigned, setAssigned] = useState<AssignedChecklist[]>([]);
  const [assignedLoaded, setAssignedLoaded] = useState(false);

  useEffect(() => {
    if (!user) return;
    fetchDocuments();
    fetchNotifications();
    fetchAssignedChecklist();
  }, [user]);

  useEffect(() => {
    // Only fall back to the self-service list when nothing was activated.
    if (!user || assigned.length > 0) return;
    if (selectedCountry && selectedDegree) {
      fetchChecklist();
      fetchProgress();
    }
  }, [user, assigned.length, selectedCountry, selectedDegree, selectedUniversity]);

  const fetchAssignedChecklist = async () => {
    try {
      const data = await fetchAssignedChecklists();
      setAssigned(data.activated ? data.checklists : []);
      if (data.activated) {
        // Feed the existing uploader the same shape it already expects.
        setChecklist(
          data.checklists.flatMap((list) => list.items) as unknown as DocumentChecklist[],
        );
      }
    } catch (error: any) {
      // A student with no CRM record yet is normal, not an error to shout about.
      console.error('Could not load the assigned checklist:', error?.message || error);
    } finally {
      setAssignedLoaded(true);
    }
  };

  const fetchDocuments = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('documents')
        .select(`
          *,
          document_versions!document_versions_document_id_fkey(*),
          document_notifications!document_notifications_document_id_fkey(*)
        `)
        .eq('user_id', user?.id)
        .eq('archived', false)
        .order('created_at', { ascending: false });

      if (error) throw error;
      setDocuments((data as any) || []);
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
      let query = supabase
        .from('document_checklists')
        .select('*')
        .eq('country', selectedCountry)
        .eq('degree_type', selectedDegree)
        .eq('is_active', true);

      if (selectedUniversity) {
        query = query.or(`university_id.eq.${selectedUniversity},university_id.is.null`);
      }

      const { data, error } = await query.order('display_order', { ascending: true });

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

  const fetchProgress = async () => {
    try {
      const { data, error } = await supabase
        .from('student_document_progress')
        .select('*')
        .eq('user_id', user?.id)
        .eq('country', selectedCountry)
        .eq('degree_type', selectedDegree)
        .maybeSingle();

      if (error) throw error;
      setProgress(data);
    } catch (error: any) {
      console.error('Error fetching progress:', error);
    }
  };

  const fetchNotifications = async () => {
    try {
      const { data, error } = await supabase
        .from('document_notifications')
        .select('*')
        .eq('user_id', user?.id)
        .eq('is_read', false)
        .order('created_at', { ascending: false })
        .limit(10);

      if (error) throw error;
      setNotifications(data || []);
    } catch (error: any) {
      console.error('Error fetching notifications:', error);
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

  const uploadFile = async (file: File, documentType: string, isNewVersion = false, parentDocumentId?: string) => {
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
      const timestamp = Date.now();
      const fileName = `${user.id}/${documentType}_${timestamp}.${fileExt}`;
      
      const { error: uploadError } = await supabase.storage
        .from('documents')
        .upload(fileName, file);

      if (uploadError) throw uploadError;

      setUploadProgress({ ...uploadProgress, [documentType]: 50 });

      // Determine version number
      let versionNumber = 1;
      if (isNewVersion && parentDocumentId) {
        const { data: versions } = await supabase
          .from('document_versions')
          .select('version_number')
          .eq('document_id', parentDocumentId)
          .order('version_number', { ascending: false })
          .limit(1);
        
        versionNumber = (versions?.[0]?.version_number || 0) + 1;

        // Mark previous version as not current
        await supabase
          .from('documents')
          .update({ is_current_version: false })
          .eq('id', parentDocumentId);
      }

      const { error: dbError } = await supabase
        .from('documents')
        .insert({
          user_id: user.id,
          document_type: documentType,
          file_name: file.name,
          file_path: fileName,
          file_size: file.size,
          mime_type: file.type,
          version_number: versionNumber,
          parent_document_id: parentDocumentId,
          is_current_version: true,
          priority_level: checklistItem?.is_required ? 'high' : 'normal'
        });

      if (dbError) throw dbError;

      setUploadProgress({ ...uploadProgress, [documentType]: 100 });

      // Create notification
      await supabase
        .from('document_notifications')
        .insert({
          user_id: user.id,
          notification_type: 'upload_success',
          title: 'Document Uploaded',
          message: `${documentType} has been uploaded successfully and is pending review.`
        });

      toast({
        title: "Document uploaded",
        description: `Your ${documentType} ${isNewVersion ? 'version ' + versionNumber : ''} has been uploaded successfully.`,
      });

      fetchDocuments();
      fetchProgress();
      fetchNotifications();
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
    e.target.value = '';
  };

  const handleVersionUpload = (file: File, documentType: string, parentDocumentId: string) => {
    uploadFile(file, documentType, true, parentDocumentId);
  };

  const downloadFile = async (document: Document) => {
    try {
      // Log download activity
      await supabase
        .from('document_audit_logs')
        .insert({
          document_id: document.id,
          action_type: 'download',
          performed_by: user?.id,
          additional_data: { file_name: document.file_name }
        });

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
      fetchProgress();
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
        return <Badge className="bg-success/10 text-success border-success/20"><Check className="w-3 h-3 mr-1" />Approved</Badge>;
      case 'rejected':
        return <Badge variant="destructive" className="bg-destructive/10 text-destructive border-destructive/20"><X className="w-3 h-3 mr-1" />Rejected</Badge>;
      default:
        return <Badge variant="outline" className="bg-warning/10 text-warning border-warning/20"><Clock className="w-3 h-3 mr-1" />Pending</Badge>;
    }
  };

  const getExpiryStatus = (expiryDate: string | null) => {
    if (!expiryDate) return null;
    
    const today = new Date();
    const expiry = new Date(expiryDate);
    const daysUntilExpiry = Math.ceil((expiry.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
    
    if (daysUntilExpiry < 0) {
      return <Badge variant="destructive">Expired</Badge>;
    } else if (daysUntilExpiry <= 30) {
      return <Badge className="bg-warning/10 text-warning border-warning/20">Expires in {daysUntilExpiry} days</Badge>;
    }
    return null;
  };

  const filteredDocuments = documents.filter(doc => {
    const matchesSearch = doc.document_type.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         doc.file_name.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesStatus = statusFilter === 'all' || doc.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  const isDocumentUploaded = (documentType: string) => {
    return documents.some(doc => doc.document_type === documentType && doc.is_current_version);
  };

  const getCurrentDocument = (documentType: string) => {
    return documents.find(doc => doc.document_type === documentType && doc.is_current_version);
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-full bg-gradient-primary flex items-center justify-center animate-pulse">
            <FileText className="w-6 h-6 text-white" />
          </div>
          <div className="space-y-2">
            <div className="h-8 w-48 bg-muted/20 rounded animate-pulse"></div>
            <div className="h-4 w-64 bg-muted/20 rounded animate-pulse"></div>
          </div>
        </div>
        <div className="grid gap-4">
          {[1, 2, 3].map(i => (
            <Card key={i} className="glass-card animate-pulse">
              <CardHeader>
                <div className="h-6 w-32 bg-muted/20 rounded"></div>
                <div className="h-4 w-48 bg-muted/20 rounded"></div>
              </CardHeader>
              <CardContent>
                <div className="h-24 w-full bg-muted/20 rounded"></div>
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
            <h1 className="text-3xl font-bold">Enhanced Document Management</h1>
            <p className="text-muted-foreground">Upload, manage, and track your application documents with version control</p>
          </div>
        </div>
        <div className="flex gap-2">
          <Button 
            variant="outline" 
            size="sm" 
            onClick={() => {
              fetchDocuments();
              fetchNotifications();
              if (selectedCountry && selectedDegree) {
                fetchChecklist();
                fetchProgress();
              }
            }}
          >
            <RefreshCw className="w-4 h-4 mr-2" />
            Refresh
          </Button>
          
          {notifications.length > 0 && (
            <Dialog>
              <DialogTrigger asChild>
                <Button variant="outline" size="sm" className="relative">
                  <Bell className="w-4 h-4 mr-2" />
                  Notifications
                  <Badge className="absolute -top-2 -right-2 w-5 h-5 flex items-center justify-center p-0 text-xs">
                    {notifications.length}
                  </Badge>
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-2xl">
                <DialogHeader>
                  <DialogTitle>Document Notifications</DialogTitle>
                  <DialogDescription>Recent updates about your documents</DialogDescription>
                </DialogHeader>
                <DocumentNotifications 
                  notifications={notifications} 
                  onRefresh={fetchNotifications}
                />
              </DialogContent>
            </Dialog>
          )}
        </div>
      </div>

      <Tabs defaultValue="documents" className="space-y-6">
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="documents">Documents</TabsTrigger>
          <TabsTrigger value="progress">Progress</TabsTrigger>
          <TabsTrigger value="versions">Versions</TabsTrigger>
          <TabsTrigger value="audit">Audit Log</TabsTrigger>
        </TabsList>

        <TabsContent value="documents" className="space-y-6">
          {/* Progress Overview */}
          <DocumentProgressTracker 
            progress={progress}
            checklist={checklist}
            documents={documents}
          />

          {/* Country and Degree Selection — only when nothing has been activated
              for this student. Once a counsellor activates a checklist, the
              student is told what to upload rather than choosing for themselves. */}
          {assignedLoaded && assigned.length === 0 && (
          <Card className="glass-card">
            <CardHeader>
              <CardTitle>Document Requirements</CardTitle>
              <CardDescription>Select your target country and degree to see required documents</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid gap-4 md:grid-cols-3">
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

                <div className="space-y-2">
                  <Label>University (Optional)</Label>
                  <Select value={selectedUniversity} onValueChange={setSelectedUniversity}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select university" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Universities</SelectItem>
                      <SelectItem value="harvard">Harvard University</SelectItem>
                      <SelectItem value="stanford">Stanford University</SelectItem>
                      <SelectItem value="mit">MIT</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </CardContent>
          </Card>
          )}

          {/* Document Checklist */}
          {checklist.length > 0 && (
            <Card className="glass-card">
              <CardHeader>
                <CardTitle>
                  {assigned.length > 0
                    ? `Documents for ${assigned.map((list) => list.country).join(' and ')}`
                    : `Required Documents for ${selectedCountry} - ${selectedDegree}`}
                </CardTitle>
                <CardDescription>
                  {assigned.length > 0
                    ? 'Your counsellor set this list up for you. Upload each document and they will review it.'
                    : 'Upload the following documents for your application'}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {checklist.map((item) => {
                    const isUploaded = isDocumentUploaded(item.document_type);
                    const currentDoc = getCurrentDocument(item.document_type);
                    
                    return (
                      <div key={item.id} className="flex items-center justify-between p-4 border border-border/20 rounded-lg hover:bg-muted/50 transition-colors">
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-2">
                            <h4 className="font-medium">{item.document_type}</h4>
                            {item.is_required && (
                              <Badge variant="outline" className="text-xs bg-destructive/10 text-destructive border-destructive/20">
                                Required
                              </Badge>
                            )}
                            {isUploaded && <Check className="w-4 h-4 text-success" />}
                          </div>
                          
                          <p className="text-sm text-muted-foreground mb-2">{item.description}</p>
                          
                          <div className="flex items-center gap-4 text-xs text-muted-foreground mb-2">
                            <span>Max size: {item.max_file_size_mb}MB</span>
                            <span>Types: {item.allowed_file_types.join(', ')}</span>
                          </div>

                          {/* What the counsellor said about this document (CRM 2.6.2).
                              Present only on an activated checklist. */}
                          {(item as any).already_available && (
                            <div className="mb-2 flex items-start gap-2 rounded-md bg-violet-50 p-2 text-xs text-violet-800">
                              <Check className="mt-0.5 h-3.5 w-3.5 flex-shrink-0" />
                              <span>Already uploaded for another country — you do not need to send this again.</span>
                            </div>
                          )}
                          {(item as any).rejection_reason && (
                            <div className="mb-2 flex items-start gap-2 rounded-md bg-destructive/10 p-2 text-xs text-destructive">
                              <AlertCircle className="mt-0.5 h-3.5 w-3.5 flex-shrink-0" />
                              <span>{(item as any).rejection_reason}</span>
                            </div>
                          )}
                          {(item as any).next_step_note && (
                            <div className="mb-2 flex items-start gap-2 rounded-md bg-muted/40 p-2 text-xs">
                              <Clock className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 text-warning" />
                              <span><span className="font-medium">Next: </span>{(item as any).next_step_note}</span>
                            </div>
                          )}
                          {(item as any).sample_instructions && (
                            <p className="mb-2 text-xs text-muted-foreground">{(item as any).sample_instructions}</p>
                          )}
                          
                          {currentDoc && (
                            <div className="flex flex-col gap-2 mt-3">
                              <div className="flex items-center gap-2">
                                {getStatusBadge(currentDoc.status)}
                                {getExpiryStatus(currentDoc.expiry_date)}
                                <span className="text-xs text-muted-foreground">
                                  v{currentDoc.version_number} • {currentDoc.file_name} • {(currentDoc.file_size / 1024 / 1024).toFixed(2)}MB
                                </span>
                              </div>
                              {currentDoc.admin_comments && (
                                <div className="flex items-start gap-2 p-2 bg-muted/30 rounded-md">
                                  <AlertCircle className="w-4 h-4 text-warning mt-0.5 flex-shrink-0" />
                                  <span className="text-xs text-muted-foreground">
                                    <strong>Admin Note:</strong> {currentDoc.admin_comments}
                                  </span>
                                </div>
                              )}
                            </div>
                          )}
                          
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
                          {isUploaded && currentDoc ? (
                            <>
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => downloadFile(currentDoc)}
                                className="hover:bg-primary/10"
                              >
                                <Download className="w-4 h-4" />
                              </Button>
                              
                              <div className="relative">
                                <input
                                  type="file"
                                  id={`new-version-${item.document_type}`}
                                  accept={item.allowed_file_types.map(type => `.${type}`).join(',')}
                                  onChange={(e) => {
                                    const file = e.target.files?.[0];
                                    if (file && currentDoc) {
                                      handleVersionUpload(file, item.document_type, currentDoc.id);
                                    }
                                    e.target.value = '';
                                  }}
                                  className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                                  disabled={uploading === item.document_type}
                                />
                                <Button
                                  variant="outline"
                                  size="sm"
                                  disabled={uploading === item.document_type}
                                  className="hover:bg-secondary/10"
                                >
                                  <History className="w-4 h-4 mr-1" />
                                  New Version
                                </Button>
                              </div>
                              
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => deleteDocument(currentDoc)}
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
        </TabsContent>

        <TabsContent value="progress">
          <DocumentProgressTracker 
            progress={progress}
            checklist={checklist}
            documents={documents}
            detailed={true}
          />
        </TabsContent>

        <TabsContent value="versions">
          <DocumentVersionManager 
            documents={documents}
            onDownload={downloadFile}
          />
        </TabsContent>

        <TabsContent value="audit">
          <DocumentAuditLog userId={user?.id} />
        </TabsContent>
      </Tabs>
    </div>
  );
}