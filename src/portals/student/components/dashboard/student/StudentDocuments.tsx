import { useState, useEffect } from 'react';
import { useAuth } from '@student/hooks/useAuth';
import { supabase } from '@student/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@student/components/ui/card';
import { Button } from '@student/components/ui/button';
import { Badge } from '@student/components/ui/badge';
import { Progress } from '@student/components/ui/progress';
import { useToast } from '@student/hooks/use-toast';
import { 
  FileText, 
  Upload,
  CheckCircle,
  AlertCircle,
  Clock,
  Download,
  Trash2,
  AlertTriangle
} from 'lucide-react';
import { validateDocumentFile } from '@student/lib/documentTypeValidation';
import { notifyCounselorsOfStudentDocument } from '@student/lib/notifyCounselorsOfStudentDocument';
import { normalizeCountry } from '@student/lib/universityRecommendations';
import { filterDocumentChecklistsForProfile, normalizeDegreeLevel } from '@student/lib/documentChecklistMatching';

interface Document {
  id: string;
  document_type: string;
  file_name: string;
  file_path: string;
  status: string;
  created_at: string;
  admin_comments: string | null;
  expiry_date: string | null;
  request_id: string | null;
}

interface DocumentChecklist {
  id: string;
  document_type: string;
  description: string;
  is_required: boolean;
  max_file_size_mb: number;
  allowed_file_types: string[];
}

interface DocumentRequest {
  id: string;
  document_type: string;
  description: string;
  is_mandatory: boolean;
  max_file_size_mb: number;
  allowed_file_types: string[];
  status: string;
}

const MIN_UPLOAD_SIZE_MB = 20;

const withPracticalUploadLimit = <T extends { max_file_size_mb?: number | null }>(item: T): T => ({
  ...item,
  max_file_size_mb: Math.max(item.max_file_size_mb || 0, MIN_UPLOAD_SIZE_MB),
});

export function StudentDocuments() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [documents, setDocuments] = useState<Document[]>([]);
  const [checklist, setChecklist] = useState<DocumentChecklist[]>([]);
  const [requests, setRequests] = useState<DocumentRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState<string | null>(null);
  const [uploadProgress, setUploadProgress] = useState<{ [key: string]: number }>({});
  const [profileSummary, setProfileSummary] = useState<{ countries: string[]; degreeLevel: string }>({
    countries: [],
    degreeLevel: '',
  });

  useEffect(() => {
    if (user) {
      fetchAllData();
      const poll = window.setInterval(() => {
        void fetchDocuments(true);
      }, 4000);
      return () => window.clearInterval(poll);
    }
  }, [user]);

  const fetchAllData = async (silent = false) => {
    if (!silent) setLoading(true);
    await Promise.all([
      fetchDocuments(),
      fetchChecklistFromProfile(),
      fetchDocumentRequests()
    ]);
    if (!silent) setLoading(false);
  };

  const fetchDocuments = async (silent = false) => {
    if (!user) return;
    
    try {
      const { data, error } = await supabase
        .from('documents')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });

      if (error) throw error;

      const rows = (Array.isArray(data) ? data : [])
        .filter((doc) => doc && typeof doc === 'object' && doc.archived !== true);
      const now = new Date().toISOString();

      await Promise.all(rows.map(async (doc) => {
        try {
          const match = validateDocumentFile(doc.document_type, doc.file_name);
          if (!match.ok && doc.status !== 'rejected') {
            await supabase
              .from('documents')
              .update({
                status: 'rejected',
                reviewed_at: now,
                admin_comments: match.reason,
              })
              .eq('id', doc.id);
            doc.status = 'rejected';
            doc.admin_comments = match.reason;
          }
        } catch (validationError) {
          console.error('Document validation skipped:', validationError);
        }
      }));

      setDocuments(rows);
    } catch (error: any) {
      console.error('Error fetching documents:', error);
      if (!silent) {
        toast({
          title: 'Error',
          description: error?.message || 'Failed to load documents',
          variant: 'destructive'
        });
      }
    }
  };

  const fetchChecklistFromProfile = async () => {
    if (!user) return;
    
    try {
      const [leadResult, profileResult, appsResult, shortlistsResult, checklistResult] = await Promise.all([
        supabase
          .from('student_leads')
          .select('preferred_countries, preferences, qualification_level')
          .eq('user_id', user.id)
          .maybeSingle(),
        supabase
          .from('profiles')
          .select('interested_countries, degree_level')
          .eq('user_id', user.id)
          .maybeSingle(),
        supabase
          .from('applications')
          .select('university_id')
          .eq('user_id', user.id),
        supabase
          .from('university_shortlists')
          .select('university_id, student_id, student_email, email'),
        supabase
          .from('document_checklists')
          .select('*')
          .eq('is_active', true)
          .order('display_order', { ascending: true }),
      ]);

      const lead = leadResult.data;
      const profile = profileResult.data;
      const extras = ((lead?.preferences as Record<string, any> | null) || {});
      const rawCountries = (lead?.preferred_countries || extras.interested_countries || profile?.interested_countries || []) as string[];
      const countries = Array.from(new Set(rawCountries.map((item) => normalizeCountry(item)).filter(Boolean)));
      const degreeLevel = normalizeDegreeLevel(
        extras.degree_level || lead?.qualification_level || profile?.degree_level || 'Masters'
      );

      const universityIds = Array.from(new Set([
        ...(appsResult.data || []).map((row) => row.university_id).filter(Boolean),
        ...(shortlistsResult.data || [])
          .filter((row) =>
            String(row.student_id) === String(user.id) ||
            (user.email && (row.student_email === user.email || row.email === user.email))
          )
          .map((row) => row.university_id)
          .filter(Boolean),
      ])) as string[];

      setProfileSummary({ countries, degreeLevel });

      if (checklistResult.error) throw checklistResult.error;

      const matched = filterDocumentChecklistsForProfile(checklistResult.data || [], {
        countries,
        degreeLevel,
        universityIds,
      });

      setChecklist(matched.map(withPracticalUploadLimit));
    } catch (error: any) {
      console.error('Error fetching checklist:', error);
      setChecklist([]);
    }
  };

  const fetchDocumentRequests = async () => {
    if (!user) return;
    
    try {
      const { data, error } = await supabase
        .from('document_requests')
        .select('*')
        .eq('student_id', user.id)
        .in('status', ['pending', 'uploaded'])
        .order('created_at', { ascending: false });

      if (error) throw error;
      setRequests((data || []).map(withPracticalUploadLimit));
    } catch (error: any) {
      console.error('Error fetching document requests:', error);
    }
  };

  const uploadFile = async (file: File, documentType: string, requestId?: string) => {
    if (!user) return;

    const checklistItem = checklist.find(item => item.document_type === documentType);
    const requestItem = requests.find(req => req.id === requestId);
    const maxSizeMb = Math.max(
      checklistItem?.max_file_size_mb || 0,
      requestItem?.max_file_size_mb || 0,
      MIN_UPLOAD_SIZE_MB
    );
    const maxSize = maxSizeMb * 1024 * 1024;
    const allowedTypes = checklistItem?.allowed_file_types || requestItem?.allowed_file_types || ['pdf', 'jpg', 'jpeg', 'png'];

    // Validate file
    if (file.size > maxSize) {
      toast({
        title: 'File too large',
        description: `Maximum file size is ${maxSize / 1024 / 1024}MB`,
        variant: 'destructive'
      });
      return;
    }

    const fileExt = file.name.split('.').pop()?.toLowerCase();
    if (!fileExt || !allowedTypes.includes(fileExt)) {
      toast({
        title: 'Invalid file type',
        description: `Allowed types: ${allowedTypes.join(', ')}`,
        variant: 'destructive'
      });
      return;
    }

    const match = validateDocumentFile(documentType, file.name, file.type);
    if (!match.ok) {
      toast({
        title: 'Wrong document',
        description: match.reason,
        variant: 'destructive'
      });
      return;
    }

    setUploading(documentType);
    setUploadProgress({ ...uploadProgress, [documentType]: 0 });
    
    try {
      const fileName = `${user.id}/${documentType}_${Date.now()}.${fileExt}`;
      
      const { error: uploadError } = await supabase.storage
        .from('documents')
        .upload(fileName, file);

      if (uploadError) throw uploadError;

      setUploadProgress({ ...uploadProgress, [documentType]: 50 });

      const existing = documents.find((doc) =>
        doc.document_type === documentType &&
        (!requestId || doc.request_id === requestId)
      );

      const submittedAt = new Date().toISOString();
      const savedId = existing?.id || crypto.randomUUID();
      const payload = {
        file_name: file.name,
        file_path: fileName,
        file_size: file.size,
        mime_type: file.type,
        status: 'uploaded',
        archived: false,
        reviewed_at: null,
        reviewed_by: null,
        admin_comments: null,
        request_id: requestId || existing?.request_id || null,
        updated_at: submittedAt,
      };
      const savedDoc: Document = {
        id: savedId,
        document_type: documentType,
        file_name: file.name,
        file_path: fileName,
        status: 'uploaded',
        created_at: existing?.created_at || submittedAt,
        admin_comments: null,
        expiry_date: existing?.expiry_date || null,
        request_id: payload.request_id,
      };

      if (existing) {
        const { error: dbError } = await supabase
          .from('documents')
          .update(payload)
          .eq('id', existing.id);
        if (dbError) throw dbError;
        if (existing.file_path && existing.file_path !== fileName) {
          await supabase.storage.from('documents').remove([existing.file_path]);
        }
      } else {
        const { error: dbError } = await supabase
          .from('documents')
          .insert({
            id: savedId,
            user_id: user.id,
            document_type: documentType,
            created_at: submittedAt,
            ...payload,
          });
        if (dbError) throw dbError;
      }

      setDocuments((prev) => {
        const withoutCurrent = prev.filter((doc) => doc.id !== savedId && doc.document_type !== documentType);
        return [savedDoc, ...withoutCurrent];
      });

      setUploadProgress({ ...uploadProgress, [documentType]: 100 });

      try {
        await notifyCounselorsOfStudentDocument(user, documentType, file.name);
      } catch (notifyError) {
        console.error('Document notification failed:', notifyError);
      }

      toast({
        title: 'Document submitted',
        description: `${documentType} was sent to your counselor for review.`
      });

      await fetchAllData(true);
    } catch (error: any) {
      const message = String(error?.message || 'Upload failed');
      toast({
        title: 'Upload failed',
        description: message.includes('reach') || message.includes('timed out')
          ? 'Could not save the file on the server. Check your connection and try again.'
          : message,
        variant: 'destructive'
      });
    } finally {
      setUploading(null);
      const newProgress = { ...uploadProgress };
      delete newProgress[documentType];
      setUploadProgress(newProgress);
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>, documentType: string, requestId?: string) => {
    const file = e.target.files?.[0];
    if (file) {
      uploadFile(file, documentType, requestId);
    }
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
        title: 'Download failed',
        description: error.message,
        variant: 'destructive'
      });
    }
  };

  const deleteDocument = async (document: Document) => {
    if (document.status === 'rejected') {
      toast({
        title: 'Cannot delete',
        description: 'Rejected documents stay on file. Please re-upload a corrected version.',
        variant: 'destructive'
      });
      return;
    }

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
        title: 'Document deleted',
        description: 'The document has been removed successfully.'
      });

      await fetchAllData();
    } catch (error: any) {
      toast({
        title: 'Delete failed',
        description: error.message,
        variant: 'destructive'
      });
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'approved': return <CheckCircle className="w-4 h-4 text-success" />;
      case 'rejected': return <AlertCircle className="w-4 h-4 text-destructive" />;
      case 'pending':
      case 'uploaded': return <Clock className="w-4 h-4 text-warning" />;
      default: return <FileText className="w-4 h-4" />;
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'approved':
        return <Badge className="bg-success/10 text-success border-success/20"><CheckCircle className="w-3 h-3 mr-1" />Approved</Badge>;
      case 'rejected':
        return <Badge variant="destructive" className="bg-destructive/10 border-destructive/20"><AlertCircle className="w-3 h-3 mr-1" />Rejected</Badge>;
      default:
        return <Badge variant="outline" className="bg-success/10 text-success border-success/20"><CheckCircle className="w-3 h-3 mr-1" />Submitted</Badge>;
    }
  };

  const getUploadedDocument = (documentType: string) => {
    return documents.find((doc) => doc.document_type === documentType && doc.status !== 'rejected')
      || documents.find((doc) => doc.document_type === documentType);
  };

  const requiredTypes = new Set([
    ...checklist.filter((item) => item.is_required).map((item) => item.document_type),
    ...requests.filter((req) => req.is_mandatory).map((req) => req.document_type),
  ]);
  const submittedTypes = new Set(
    documents
      .filter((doc) => doc.status !== 'rejected' && requiredTypes.has(doc.document_type))
      .map((doc) => doc.document_type)
  );
  const submittedCount = submittedTypes.size;
  const rejectedCount = documents.filter((doc) => doc.status === 'rejected' && !submittedTypes.has(doc.document_type)).length;
  const totalRequired = checklist.filter((item) => item.is_required).length + requests.filter((req) => req.is_mandatory).length;
  const remainingCount = Math.max(totalRequired - submittedCount, 0);
  const completionPercentage = totalRequired > 0 ? (submittedCount / totalRequired) * 100 : submittedCount > 0 ? 100 : 0;

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  return (
    <div className="space-y-4 md:space-y-6 min-w-0 max-w-full">
      {/* Header — desktop only; mobile uses MobilePortalHeader */}
      <div className="hidden md:flex items-center gap-3">
        <div className="w-10 h-10 rounded-full bg-gradient-primary flex items-center justify-center shrink-0">
          <FileText className="w-5 h-5 text-white" />
        </div>
        <div className="min-w-0">
          <h1 className="text-2xl font-bold">My Documents</h1>
          <p className="text-muted-foreground">Upload and manage your application documents</p>
        </div>
      </div>
      <p className="text-sm text-muted-foreground md:hidden">
        Upload and manage your application documents
      </p>

      {/* Progress Overview */}
      <Card className="glass-card overflow-hidden">
        <CardHeader className="p-4 md:p-6">
          <CardTitle className="flex items-center gap-2 text-base md:text-lg">
            <CheckCircle className="w-5 h-5 shrink-0" />
            Document Progress
          </CardTitle>
          <CardDescription className="text-xs md:text-sm">
            Upload each file, then your counselor reviews it and marks it approved or rejected.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4 p-4 pt-0 md:p-6 md:pt-0">
          <div className="space-y-2">
            <div className="flex justify-between text-sm">
              <span>Overall Progress</span>
              <span>{Math.round(completionPercentage)}%</span>
            </div>
            <Progress value={completionPercentage} className="h-2" />
          </div>

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 sm:gap-4 text-center">
            <div>
              <div className="text-2xl font-bold text-primary">{totalRequired || documents.length}</div>
              <div className="text-xs text-muted-foreground">Required</div>
            </div>
            <div>
              <div className="text-2xl font-bold text-success">{submittedCount}</div>
              <div className="text-xs text-muted-foreground">Submitted</div>
            </div>
            <div>
              <div className="text-2xl font-bold text-warning">{remainingCount}</div>
              <div className="text-xs text-muted-foreground">Remaining</div>
            </div>
            <div>
              <div className="text-2xl font-bold text-destructive">{rejectedCount}</div>
              <div className="text-xs text-muted-foreground">Rejected</div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Additional Document Requests */}
      {requests.length > 0 && (
        <Card className="glass-card border-warning/50 overflow-hidden">
          <CardHeader className="p-4 md:p-6">
            <CardTitle className="flex items-center gap-2 text-warning text-base md:text-lg">
              <AlertTriangle className="w-5 h-5 shrink-0" />
              Additional Documents Requested
            </CardTitle>
            <CardDescription className="text-xs md:text-sm">Your counselor has requested these additional documents</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 p-4 pt-0 md:p-6 md:pt-0">
            {requests.map((request) => {
              const uploadedDoc = documents.find(doc => doc.request_id === request.id);

              return (
                <div
                  key={request.id}
                  className="flex flex-col gap-3 p-3 md:p-4 border border-warning/20 rounded-lg bg-warning/5 sm:flex-row sm:items-start sm:justify-between"
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h4 className="font-medium text-sm md:text-base break-words">{request.document_type}</h4>
                      {request.is_mandatory && (
                        <Badge variant="outline" className="text-xs bg-destructive/10 text-destructive border-destructive/20 shrink-0">
                          Required
                        </Badge>
                      )}
                      {uploadedDoc && getStatusIcon(uploadedDoc.status)}
                    </div>
                    <p className="text-xs md:text-sm text-muted-foreground mt-1 break-words">{request.description}</p>

                    <div className="flex flex-col gap-0.5 sm:flex-row sm:gap-4 text-xs text-muted-foreground mt-2">
                      <span>Max size: {request.max_file_size_mb}MB</span>
                      <span>Types: {request.allowed_file_types.join(', ')}</span>
                    </div>

                    {uploadedDoc && (
                      <div className="mt-3 space-y-2">
                        {getStatusBadge(uploadedDoc.status)}
                        {uploadedDoc.admin_comments && (
                          <div className="p-2 bg-muted/30 rounded text-xs md:text-sm break-words">
                            <strong>Counselor Note:</strong> {uploadedDoc.admin_comments}
                          </div>
                        )}
                      </div>
                    )}
                  </div>

                  <div className="flex flex-wrap gap-2 w-full sm:w-auto sm:shrink-0">
                    {!uploadedDoc || uploadedDoc.status === 'rejected' ? (
                      <div className="relative w-full sm:w-auto">
                        <input
                          type="file"
                          id={`request-${request.id}`}
                          accept={request.allowed_file_types.map(type => `.${type}`).join(',')}
                          onChange={(e) => handleFileUpload(e, request.document_type, request.id)}
                          className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                          disabled={uploading === request.document_type}
                        />
                        <Button
                          size="sm"
                          disabled={uploading === request.document_type}
                          className="w-full sm:w-auto bg-primary hover:bg-primary/90"
                        >
                          <Upload className="w-4 h-4 mr-2" />
                          {uploading === request.document_type ? 'Uploading...' : uploadedDoc ? 'Re-upload' : 'Upload'}
                        </Button>
                      </div>
                    ) : (
                      <Button variant="outline" size="sm" className="w-full sm:w-auto" onClick={() => downloadFile(uploadedDoc)}>
                        <Download className="w-4 h-4 mr-2" />
                        Download
                      </Button>
                    )}
                  </div>
                </div>
              );
            })}
          </CardContent>
        </Card>
      )}

      {/* Required Documents Checklist */}
      {checklist.length > 0 && (
        <Card className="glass-card overflow-hidden">
          <CardHeader className="p-4 md:p-6">
            <CardTitle className="text-base md:text-lg">Required Documents</CardTitle>
            <CardDescription className="text-xs md:text-sm">
              {profileSummary.countries.length > 0
                ? `Based on your profile: ${profileSummary.countries.join(', ')}${profileSummary.degreeLevel ? ` · ${profileSummary.degreeLevel}` : ''}. Upload the matching document for each item.`
                : 'Upload the matching document for each item. A resume cannot be submitted as Original Degree (OD).'}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 p-4 pt-0 md:p-6 md:pt-0">
            {checklist.map((item) => {
              const uploadedDoc = getUploadedDocument(item.document_type);
              const isUploaded = !!uploadedDoc;

              return (
                <div
                  key={item.id}
                  className="flex flex-col gap-3 p-3 md:p-4 border border-border/20 rounded-lg hover:bg-muted/50 transition-colors sm:flex-row sm:items-start sm:justify-between"
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h4 className="font-medium text-sm md:text-base break-words">{item.document_type}</h4>
                      {item.is_required && (
                        <Badge variant="outline" className="text-xs bg-destructive/10 text-destructive border-destructive/20 shrink-0">
                          Required
                        </Badge>
                      )}
                      {isUploaded && getStatusIcon(uploadedDoc.status)}
                    </div>
                    <p className="text-xs md:text-sm text-muted-foreground mt-1 break-words">{item.description}</p>

                    <div className="flex flex-col gap-0.5 sm:flex-row sm:gap-4 text-xs text-muted-foreground mt-2">
                      <span>Max size: {item.max_file_size_mb}MB</span>
                      <span>Types: {item.allowed_file_types.join(', ')}</span>
                    </div>

                    {uploadedDoc && (
                      <div className="flex flex-col gap-2 mt-3">
                        <div className="flex flex-wrap items-center gap-2">
                          {getStatusBadge(uploadedDoc.status)}
                          <span className="text-xs text-muted-foreground break-all">
                            {uploadedDoc.file_name}
                          </span>
                        </div>
                        {uploadedDoc.admin_comments && (
                          <div className="flex items-start gap-2 p-2 bg-muted/30 rounded-md">
                            <AlertCircle className="w-4 h-4 text-warning mt-0.5 shrink-0" />
                            <span className="text-xs text-muted-foreground break-words">
                              <strong>Counselor Note:</strong> {uploadedDoc.admin_comments}
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

                  <div className="flex flex-col gap-2 w-full sm:w-auto sm:shrink-0">
                    {isUploaded && uploadedDoc.status !== 'rejected' && (
                      <div className="flex gap-2 w-full sm:w-auto">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => downloadFile(uploadedDoc)}
                          className="flex-1 sm:flex-none hover:bg-primary/10"
                        >
                          <Download className="w-4 h-4 sm:mr-0 mr-2" />
                          <span className="sm:hidden">Download</span>
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => deleteDocument(uploadedDoc)}
                          className="flex-1 sm:flex-none hover:bg-destructive/10 hover:text-destructive"
                        >
                          <Trash2 className="w-4 h-4 sm:mr-0 mr-2" />
                          <span className="sm:hidden">Delete</span>
                        </Button>
                      </div>
                    )}
                    <div className="relative w-full sm:w-auto">
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
                        className="w-full sm:w-auto bg-primary hover:bg-primary/90"
                      >
                        <Upload className="w-4 h-4 mr-2" />
                        {uploading === item.document_type
                          ? 'Uploading...'
                          : isUploaded && uploadedDoc.status !== 'rejected'
                            ? 'Replace'
                            : uploadedDoc
                              ? 'Re-upload'
                              : 'Upload'}
                      </Button>
                    </div>
                  </div>
                </div>
              );
            })}
          </CardContent>
        </Card>
      )}

      {checklist.length === 0 && requests.length === 0 && (
        <Card className="glass-card">
          <CardContent className="p-12 text-center">
            <FileText className="w-16 h-16 text-muted-foreground mx-auto mb-4 opacity-50" />
            <h3 className="text-xl font-semibold mb-2">
              {profileSummary.countries.length === 0 ? 'Complete Your Profile First' : 'No Required Documents Yet'}
            </h3>
            <p className="text-muted-foreground">
              {profileSummary.countries.length === 0
                ? 'Add your interested countries and degree level on My Profile to see required documents.'
                : `No document requirements have been configured yet for ${profileSummary.countries.join(', ')}${profileSummary.degreeLevel ? ` (${profileSummary.degreeLevel})` : ''}. Your counselor will add them from the admin portal.`}
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}