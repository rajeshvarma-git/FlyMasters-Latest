import { useState, useEffect } from 'react';
import { supabase } from '@student/integrations/supabase/client';
import { useAuth } from '@student/hooks/useAuth';
import { useToast } from '@student/hooks/use-toast';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@student/components/ui/card';
import { Button } from '@student/components/ui/button';
import { Badge } from '@student/components/ui/badge';
import { Input } from '@student/components/ui/input';
import { 
  Users, 
  Search, 
  Mail, 
  Phone, 
  Calendar,
  FileText,
  Eye,
  GraduationCap,
  MapPin,
  Target
} from 'lucide-react';
import { format } from 'date-fns';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@student/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@student/components/ui/tabs';

interface Student {
  id: string;
  user_id: string;
  first_name: string;
  last_name: string;
  email: string;
  phone: string;
  lead_stage: string;
  preferred_countries: string[];
  field_of_interest: string;
  academic_score: string;
  created_at: string;
  profile_phone?: string;
  profile_country?: string;
}

interface StudentProfile {
  full_name: string;
  email: string;
  phone: string;
  country?: string;
  date_of_birth?: string;
  passport_number?: string;
  academic_score: string;
  preferred_countries: string[];
  field_of_interest: string;
  documents_count: number;
  applications_count: number;
  shortlists_count: number;
}

export function MyStudents() {
  const { user } = useAuth();
  const [students, setStudents] = useState<Student[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedStudent, setSelectedStudent] = useState<StudentProfile | null>(null);
  const [viewDialogOpen, setViewDialogOpen] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    fetchMyStudents();
  }, [user?.id]);

  const fetchMyStudents = async () => {
    if (!user?.id) return;

    try {
      setLoading(true);

      // Get students assigned to this counselor
      const { data: studentLeads, error: leadsError } = await supabase
        .from('student_leads')
        .select('*')
        .eq('assigned_counselor_id', user.id)
        .eq('entity_type', 'student')
        .order('priority', { ascending: false })
        .order('created_at', { ascending: false });

      if (leadsError) throw leadsError;

      // Get additional profile information
      const studentUserIds = studentLeads?.map(lead => lead.user_id) || [];
      
      if (studentUserIds.length > 0) {
        const { data: profiles } = await supabase
          .from('profiles')
          .select('user_id, phone, country')
          .in('user_id', studentUserIds);

        const studentsWithProfiles = studentLeads.map(lead => ({
          ...lead,
          profile_phone: profiles?.find(p => p.user_id === lead.user_id)?.phone,
          profile_country: profiles?.find(p => p.user_id === lead.user_id)?.country
        }));

        setStudents(studentsWithProfiles);
      } else {
        setStudents([]);
      }
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  const fetchStudentDetails = async (studentUserId: string) => {
    try {
      // Fetch comprehensive student data
      const [profileRes, documentsRes, applicationsRes, shortlistsRes] = await Promise.all([
        supabase.from('profiles').select('*').eq('user_id', studentUserId).single(),
        supabase.from('documents').select('id', { count: 'exact' }).eq('user_id', studentUserId),
        supabase.from('applications').select('id', { count: 'exact' }).eq('user_id', studentUserId),
        supabase.from('university_shortlists').select('id', { count: 'exact' }).eq('student_id', studentUserId)
      ]);

      const studentLead = students.find(s => s.user_id === studentUserId);
      
      if (profileRes.data && studentLead) {
        setSelectedStudent({
          full_name: `${studentLead.first_name} ${studentLead.last_name}`,
          email: studentLead.email,
          phone: profileRes.data.phone || studentLead.phone || 'N/A',
          country: profileRes.data.country,
          date_of_birth: profileRes.data.date_of_birth,
          passport_number: profileRes.data.passport_number,
          academic_score: studentLead.academic_score,
          preferred_countries: studentLead.preferred_countries || [],
          field_of_interest: studentLead.field_of_interest,
          documents_count: documentsRes.count || 0,
          applications_count: applicationsRes.count || 0,
          shortlists_count: shortlistsRes.count || 0
        });
        setViewDialogOpen(true);
      }
    } catch (error: any) {
      toast({
        title: "Error",
        description: "Failed to fetch student details",
        variant: "destructive"
      });
    }
  };

  const filteredStudents = students.filter(student =>
    `${student.first_name} ${student.last_name}`.toLowerCase().includes(searchTerm.toLowerCase()) ||
    student.email?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const getStageColor = (stage: string) => {
    switch (stage?.toLowerCase()) {
      case 'hot': return 'destructive';
      case 'warm': return 'default';
      case 'cold': return 'secondary';
      case 'converted': return 'outline';
      default: return 'outline';
    }
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
      <Card className="glass-card">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Users className="w-5 h-5" />
            My Students ({students.length})
          </CardTitle>
          <CardDescription>
            Students assigned to you for counseling
          </CardDescription>
        </CardHeader>
        <CardContent>
          {/* Search */}
          <div className="flex items-center gap-3 mb-6">
            <Search className="w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Search by name or email..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="flex-1"
            />
          </div>

          {/* Students List */}
          <div className="space-y-3">
            {filteredStudents.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <Users className="w-12 h-12 mx-auto mb-4 opacity-50" />
                <p>No students assigned yet</p>
              </div>
            ) : (
              filteredStudents.map((student) => (
                <Card key={student.id} className="border-2 hover:shadow-md transition-shadow">
                  <CardContent className="pt-6">
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1 space-y-3">
                        <div>
                          <h3 className="font-semibold text-lg">
                            {student.first_name} {student.last_name}
                          </h3>
                          <div className="flex flex-wrap items-center gap-4 mt-2 text-sm text-muted-foreground">
                            <span className="flex items-center gap-1">
                              <Mail className="w-3 h-3" />
                              {student.email}
                            </span>
                            <span className="flex items-center gap-1">
                              <Phone className="w-3 h-3" />
                              {student.profile_phone || student.phone || 'N/A'}
                            </span>
                            <span className="flex items-center gap-1">
                              <Calendar className="w-3 h-3" />
                              {format(new Date(student.created_at), 'MMM dd, yyyy')}
                            </span>
                          </div>
                        </div>

                        <div className="flex flex-wrap items-center gap-2">
                          <Badge variant={getStageColor(student.lead_stage)}>
                            {student.lead_stage || 'new'}
                          </Badge>
                          {student.profile_country && (
                            <Badge variant="outline">
                              <MapPin className="w-3 h-3 mr-1" />
                              {student.profile_country}
                            </Badge>
                          )}
                          {student.preferred_countries && student.preferred_countries.length > 0 && (
                            <Badge variant="secondary">
                              <Target className="w-3 h-3 mr-1" />
                              {student.preferred_countries.join(', ')}
                            </Badge>
                          )}
                          {student.field_of_interest && (
                            <Badge variant="outline">
                              <GraduationCap className="w-3 h-3 mr-1" />
                              {student.field_of_interest}
                            </Badge>
                          )}
                        </div>
                      </div>

                      <Button 
                        variant="outline"
                        size="sm"
                        onClick={() => fetchStudentDetails(student.user_id)}
                      >
                        <Eye className="w-4 h-4 mr-2" />
                        View Profile
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))
            )}
          </div>
        </CardContent>
      </Card>

      {/* Student Profile Dialog */}
      <Dialog open={viewDialogOpen} onOpenChange={setViewDialogOpen}>
        <DialogContent className="max-w-3xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Student Profile</DialogTitle>
            <DialogDescription>
              Comprehensive student information and progress
            </DialogDescription>
          </DialogHeader>

          {selectedStudent && (
            <Tabs defaultValue="personal" className="w-full">
              <TabsList className="grid w-full grid-cols-3">
                <TabsTrigger value="personal">Personal Info</TabsTrigger>
                <TabsTrigger value="academic">Academic</TabsTrigger>
                <TabsTrigger value="progress">Progress</TabsTrigger>
              </TabsList>

              <TabsContent value="personal" className="space-y-4 mt-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-sm font-medium">Full Name</label>
                    <p className="text-sm text-muted-foreground">{selectedStudent.full_name}</p>
                  </div>
                  <div>
                    <label className="text-sm font-medium">Email</label>
                    <p className="text-sm text-muted-foreground">{selectedStudent.email}</p>
                  </div>
                  <div>
                    <label className="text-sm font-medium">Phone</label>
                    <p className="text-sm text-muted-foreground">{selectedStudent.phone}</p>
                  </div>
                  <div>
                    <label className="text-sm font-medium">Country</label>
                    <p className="text-sm text-muted-foreground">{selectedStudent.country || 'N/A'}</p>
                  </div>
                  <div>
                    <label className="text-sm font-medium">Date of Birth</label>
                    <p className="text-sm text-muted-foreground">
                      {selectedStudent.date_of_birth 
                        ? format(new Date(selectedStudent.date_of_birth), 'PPP') 
                        : 'N/A'}
                    </p>
                  </div>
                  <div>
                    <label className="text-sm font-medium">Passport Number</label>
                    <p className="text-sm text-muted-foreground">{selectedStudent.passport_number || 'N/A'}</p>
                  </div>
                </div>
              </TabsContent>

              <TabsContent value="academic" className="space-y-4 mt-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-sm font-medium">Academic Score</label>
                    <p className="text-sm text-muted-foreground">{selectedStudent.academic_score || 'N/A'}</p>
                  </div>
                  <div>
                    <label className="text-sm font-medium">Field of Interest</label>
                    <p className="text-sm text-muted-foreground">{selectedStudent.field_of_interest || 'N/A'}</p>
                  </div>
                  <div className="col-span-2">
                    <label className="text-sm font-medium">Preferred Countries</label>
                    <div className="flex flex-wrap gap-2 mt-1">
                      {selectedStudent.preferred_countries.length > 0 ? (
                        selectedStudent.preferred_countries.map((country, idx) => (
                          <Badge key={idx} variant="secondary">{country}</Badge>
                        ))
                      ) : (
                        <p className="text-sm text-muted-foreground">Not specified</p>
                      )}
                    </div>
                  </div>
                </div>
              </TabsContent>

              <TabsContent value="progress" className="space-y-4 mt-4">
                <div className="grid grid-cols-3 gap-4">
                  <Card>
                    <CardContent className="pt-6 text-center">
                      <FileText className="w-8 h-8 mx-auto mb-2 text-primary" />
                      <div className="text-2xl font-bold">{selectedStudent.documents_count}</div>
                      <div className="text-sm text-muted-foreground">Documents</div>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardContent className="pt-6 text-center">
                      <GraduationCap className="w-8 h-8 mx-auto mb-2 text-primary" />
                      <div className="text-2xl font-bold">{selectedStudent.applications_count}</div>
                      <div className="text-sm text-muted-foreground">Applications</div>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardContent className="pt-6 text-center">
                      <Target className="w-8 h-8 mx-auto mb-2 text-primary" />
                      <div className="text-2xl font-bold">{selectedStudent.shortlists_count}</div>
                      <div className="text-sm text-muted-foreground">Shortlists</div>
                    </CardContent>
                  </Card>
                </div>
              </TabsContent>
            </Tabs>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}