import { useState, useEffect } from 'react';
import { supabase } from '@student/integrations/supabase/client';
import { useAuth } from '@student/hooks/useAuth';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@student/components/ui/card';
import { Button } from '@student/components/ui/button';
import { Input } from '@student/components/ui/input';
import { Label } from '@student/components/ui/label';
import { Textarea } from '@student/components/ui/textarea';
import { Badge } from '@student/components/ui/badge';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@student/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@student/components/ui/select';
import { useToast } from '@student/hooks/use-toast';
import { 
  FileText, 
  CheckCircle, 
  XCircle, 
  Eye, 
  Download, 
  Search,
  Plus,
  Send
} from 'lucide-react';
import { format } from 'date-fns';

interface Document {
  id: string;
  user_id: string;
  document_type: string;
  file_name: string;
  file_path: string;
  file_size: number;
  status: string;
  admin_comments: string | null;
  created_at: string;
  reviewed_by: string | null;
  reviewed_at: string | null;
}

interface Student {
  user_id: string;
  first_name: string;
  last_name: string;
  email: string;
}

export function StudentDocumentReview() {
  const { user, isAdmin, isCounselor } = useAuth();
  const { toast } = useToast();
  const [documents, setDocuments] = useState<Document[]>([]);
  const [students, setStudents] = useState<Student[]>([]);
  const [selectedStudent, setSelectedStudent] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<string>('pending');
  const [searchTerm, setSearchTerm] = useState('');
  const [loading, setLoading] = useState(true);
  const [reviewDialog, setReviewDialog] = useState<{ open: boolean; document: Document | null }>({
    open: false,
    document: null
  });
  const [requestDialog, setRequestDialog] = useState<{ open: boolean; studentId: string | null }>({
    open: false,
    studentId: null
  });
  const [reviewData, setReviewData] = useState({ status: 'approved', comments: '' });
  const [requestData, setRequestData] = useState({
    document_type: '',
    description: '',
    is_mandatory: true,
    max_file_size_mb: 10,
    allowed_file_types: ['pdf', 'jpg', 'jpeg', 'png']
  });

  useEffect(() => {
    if (user && (isAdmin || isCounselor)) {
      fetchData();
    }
  }, [user, isAdmin, isCounselor, selectedStudent, statusFilter]);

  const fetchData = async () => {
    setLoading(true);
    await Promise.all([fetchDocuments(), fetchStudents()]);
    setLoading(false);
  };

  const fetchDocuments = async () => {
    try {
      let query = supabase
        .from('documents')
        .select(`
          *,
          profiles!documents_user_id_fkey (
            first_name,
            last_name,
            user_id
          )
        `)
        .eq('archived', false)
        .order('created_at', { ascending: false });

      if (statusFilter !== 'all') {
        query = query.eq('status', statusFilter);
      }

      if (selectedStudent !== 'all') {
        query = query.eq('user_id', selectedStudent);
      }

      // If counselor, only show their assigned students' documents
      if (isCounselor && !isAdmin) {
        const { data: assignedLeads } = await supabase
          .from('student_leads')
          .select('user_id')
          .eq('assigned_counselor_id', user?.id);

        if (assignedLeads) {
          const studentIds = assignedLeads.map(lead => lead.user_id);
          query = query.in('user_id', studentIds);
        }
      }

      const { data, error } = await query;

      if (error) throw error;
      setDocuments(data || []);
    } catch (error: any) {
      console.error('Error fetching documents:', error);
      toast({
        title: 'Error',
        description: 'Failed to load documents',
        variant: 'destructive'
      });
    }
  };

  const fetchStudents = async () => {
    try {
      let query = supabase
        .from('profiles')
        .select('user_id, first_name, last_name')
        .order('first_name', { ascending: true });

      // If counselor, only show their assigned students
      if (isCounselor && !isAdmin) {
        const { data: assignedLeads } = await supabase
          .from('student_leads')
          .select('user_id')
          .eq('assigned_counselor_id', user?.id);

        if (assignedLeads) {
          const studentIds = assignedLeads.map(lead => lead.user_id);
          query = query.in('user_id', studentIds);
        }
      }

      const { data, error } = await query;

      if (error) throw error;
      // Map data to include email from user_id lookup if needed
      const studentsWithEmail = (data || []).map((student: any) => ({
        ...student,
        email: student.user_id // You can enhance this with actual email lookup if needed
      }));
      setStudents(studentsWithEmail);
    } catch (error: any) {
      console.error('Error fetching students:', error);
    }
  };

  const reviewDocument = async () => {
    if (!reviewDialog.document) return;

    try {
      const { error } = await supabase
        .from('documents')
        .update({
          status: reviewData.status,
          admin_comments: reviewData.comments,
          reviewed_by: user?.id,
          reviewed_at: new Date().toISOString()
        })
        .eq('id', reviewDialog.document.id);

      if (error) throw error;

      // Create notification for student
      await supabase
        .from('document_notifications')
        .insert({
          user_id: reviewDialog.document.user_id,
          document_id: reviewDialog.document.id,
          notification_type: reviewData.status === 'approved' ? 'approval' : 'rejection',
          title: `Document ${reviewData.status === 'approved' ? 'Approved' : 'Rejected'}`,
          message: `Your ${reviewDialog.document.document_type} has been ${reviewData.status}. ${reviewData.comments}`,
          sent_via: ['email', 'in_app']
        });

      toast({
        title: 'Document reviewed',
        description: `Document has been ${reviewData.status}`
      });

      setReviewDialog({ open: false, document: null });
      setReviewData({ status: 'approved', comments: '' });
      await fetchDocuments();
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message,
        variant: 'destructive'
      });
    }
  };

  const requestDocument = async () => {
    if (!requestDialog.studentId) return;

    try {
      const { error } = await supabase
        .from('document_requests')
        .insert({
          student_id: requestDialog.studentId,
          requested_by: user?.id,
          ...requestData
        });

      if (error) throw error;

      // Create notification for student
      await supabase
        .from('document_notifications')
        .insert({
          user_id: requestDialog.studentId,
          notification_type: 'request',
          title: 'Additional Document Required',
          message: `Your counselor has requested: ${requestData.document_type}. ${requestData.description}`,
          sent_via: ['email', 'in_app']
        });

      toast({
        title: 'Document requested',
        description: 'Student has been notified about the document request'
      });

      setRequestDialog({ open: false, studentId: null });
      setRequestData({
        document_type: '',
        description: '',
        is_mandatory: true,
        max_file_size_mb: 10,
        allowed_file_types: ['pdf', 'jpg', 'jpeg', 'png']
      });
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message,
        variant: 'destructive'
      });
    }
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

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'approved':
        return <Badge className="bg-success/10 text-success border-success/20">Approved</Badge>;
      case 'rejected':
        return <Badge variant="destructive" className="bg-destructive/10 border-destructive/20">Rejected</Badge>;
      default:
        return <Badge variant="outline" className="bg-warning/10 text-warning border-warning/20">Pending</Badge>;
    }
  };

  const filteredDocuments = documents.filter(doc => {
    const matchesSearch = searchTerm === '' || 
      doc.document_type.toLowerCase().includes(searchTerm.toLowerCase()) ||
      doc.file_name.toLowerCase().includes(searchTerm.toLowerCase());
    
    return matchesSearch;
  });

  const getStudentName = (userId: string) => {
    const student = students.find(s => s.user_id === userId);
    return student ? `${student.first_name} ${student.last_name}` : 'Unknown Student';
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-gradient-primary flex items-center justify-center">
            <FileText className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-bold">Document Review</h1>
            <p className="text-muted-foreground">Review and manage student documents</p>
          </div>
        </div>
      </div>

      {/* Filters */}
      <Card className="glass-card">
        <CardContent className="pt-6">
          <div className="grid gap-4 md:grid-cols-4">
            <div>
              <Label>Student</Label>
              <Select value={selectedStudent} onValueChange={setSelectedStudent}>
                <SelectTrigger>
                  <SelectValue placeholder="All students" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Students</SelectItem>
                  {students.map(student => (
                    <SelectItem key={student.user_id} value={student.user_id}>
                      {student.first_name} {student.last_name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            
            <div>
              <Label>Status</Label>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Status</SelectItem>
                  <SelectItem value="pending">Pending</SelectItem>
                  <SelectItem value="approved">Approved</SelectItem>
                  <SelectItem value="rejected">Rejected</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label>Search</Label>
              <div className="relative">
                <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search documents..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10"
                />
              </div>
            </div>

            <div className="flex items-end">
              <Dialog open={requestDialog.open} onOpenChange={(open) => setRequestDialog({ open, studentId: null })}>
                <DialogTrigger asChild>
                  <Button className="w-full" onClick={() => setRequestDialog({ open: true, studentId: selectedStudent !== 'all' ? selectedStudent : null })}>
                    <Plus className="w-4 h-4 mr-2" />
                    Request Document
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Request Additional Document</DialogTitle>
                    <DialogDescription>Request a specific document from the student</DialogDescription>
                  </DialogHeader>
                  <div className="space-y-4">
                    <div>
                      <Label>Student</Label>
                      <Select 
                        value={requestDialog.studentId || ''} 
                        onValueChange={(value) => setRequestDialog({ ...requestDialog, studentId: value })}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Select student" />
                        </SelectTrigger>
                        <SelectContent>
                          {students.map(student => (
                            <SelectItem key={student.user_id} value={student.user_id}>
                              {student.first_name} {student.last_name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    <div>
                      <Label>Document Type</Label>
                      <Input
                        value={requestData.document_type}
                        onChange={(e) => setRequestData({ ...requestData, document_type: e.target.value })}
                        placeholder="e.g., Additional Letter of Recommendation"
                      />
                    </div>

                    <div>
                      <Label>Description</Label>
                      <Textarea
                        value={requestData.description}
                        onChange={(e) => setRequestData({ ...requestData, description: e.target.value })}
                        placeholder="Explain why this document is needed"
                        rows={3}
                      />
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <Label>Max File Size (MB)</Label>
                        <Input
                          type="number"
                          value={requestData.max_file_size_mb}
                          onChange={(e) => setRequestData({ ...requestData, max_file_size_mb: parseInt(e.target.value) })}
                        />
                      </div>
                      <div>
                        <Label>Is Mandatory?</Label>
                        <Select 
                          value={requestData.is_mandatory.toString()} 
                          onValueChange={(value) => setRequestData({ ...requestData, is_mandatory: value === 'true' })}
                        >
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="true">Yes</SelectItem>
                            <SelectItem value="false">No</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>

                    <Button onClick={requestDocument} className="w-full">
                      <Send className="w-4 h-4 mr-2" />
                      Send Request
                    </Button>
                  </div>
                </DialogContent>
              </Dialog>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Documents List */}
      <div className="grid gap-4">
        {filteredDocuments.length === 0 ? (
          <Card className="glass-card">
            <CardContent className="p-12 text-center">
              <FileText className="w-16 h-16 text-muted-foreground mx-auto mb-4 opacity-50" />
              <h3 className="text-xl font-semibold mb-2">No Documents Found</h3>
              <p className="text-muted-foreground">
                No documents match your current filters.
              </p>
            </CardContent>
          </Card>
        ) : (
          filteredDocuments.map((doc) => (
            <Card key={doc.id} className="glass-card">
              <CardHeader>
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <CardTitle className="text-lg flex items-center gap-2">
                      {doc.document_type}
                      {getStatusBadge(doc.status)}
                    </CardTitle>
                    <CardDescription className="mt-1">
                      Student: {getStudentName(doc.user_id)}
                    </CardDescription>
                  </div>
                  <div className="flex gap-2">
                    <Button variant="outline" size="sm" onClick={() => downloadFile(doc)}>
                      <Download className="w-4 h-4" />
                    </Button>
                    {doc.status === 'pending' && (
                      <Dialog 
                        open={reviewDialog.open && reviewDialog.document?.id === doc.id} 
                        onOpenChange={(open) => setReviewDialog({ open, document: open ? doc : null })}
                      >
                        <DialogTrigger asChild>
                          <Button size="sm">
                            <Eye className="w-4 h-4 mr-2" />
                            Review
                          </Button>
                        </DialogTrigger>
                        <DialogContent>
                          <DialogHeader>
                            <DialogTitle>Review Document</DialogTitle>
                            <DialogDescription>
                              Review and approve or reject this document
                            </DialogDescription>
                          </DialogHeader>
                          <div className="space-y-4">
                            <div>
                              <Label>Decision</Label>
                              <Select value={reviewData.status} onValueChange={(value) => setReviewData({ ...reviewData, status: value })}>
                                <SelectTrigger>
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="approved">
                                    <div className="flex items-center gap-2">
                                      <CheckCircle className="w-4 h-4 text-success" />
                                      Approve
                                    </div>
                                  </SelectItem>
                                  <SelectItem value="rejected">
                                    <div className="flex items-center gap-2">
                                      <XCircle className="w-4 h-4 text-destructive" />
                                      Reject
                                    </div>
                                  </SelectItem>
                                </SelectContent>
                              </Select>
                            </div>

                            <div>
                              <Label>Comments for Student</Label>
                              <Textarea
                                value={reviewData.comments}
                                onChange={(e) => setReviewData({ ...reviewData, comments: e.target.value })}
                                placeholder="Provide feedback to the student..."
                                rows={4}
                              />
                            </div>

                            <Button onClick={reviewDocument} className="w-full">
                              Submit Review
                            </Button>
                          </div>
                        </DialogContent>
                      </Dialog>
                    )}
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <div className="grid gap-2 text-sm">
                  <div className="flex items-center gap-2">
                    <span className="text-muted-foreground">File:</span>
                    <span>{doc.file_name}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-muted-foreground">Size:</span>
                    <span>{(doc.file_size / 1024 / 1024).toFixed(2)}MB</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-muted-foreground">Uploaded:</span>
                    <span>{format(new Date(doc.created_at), 'PPP')}</span>
                  </div>
                  {doc.admin_comments && (
                    <div className="mt-2 p-3 bg-muted/50 rounded-lg">
                      <span className="text-muted-foreground font-medium">Previous Comments:</span>
                      <p className="mt-1">{doc.admin_comments}</p>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          ))
        )}
      </div>
    </div>
  );
}