import { useState, useEffect } from 'react';
import { supabase } from '@student/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@student/components/ui/card';
import { Button } from '@student/components/ui/button';
import { Badge } from '@student/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@student/components/ui/select';
import { Input } from '@student/components/ui/input';
import { Label } from '@student/components/ui/label';
import { useToast } from '@student/hooks/use-toast';
import { 
  Users, 
  AlertCircle, 
  UserPlus, 
  Search,
  Mail,
  Phone,
  Calendar,
  Eye,
  CheckCircle
} from 'lucide-react';
import { format } from 'date-fns';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@student/components/ui/dialog';

interface UnassignedStudent {
  id: string;
  user_id: string;
  full_name: string;
  email: string;
  phone: string;
  preferred_countries: string[];
  field_of_interest: string;
  created_at: string;
  profile_complete: boolean;
}

interface Counselor {
  id: string;
  user_id: string;
  first_name: string;
  last_name: string;
  email: string;
  specializations: string[];
}

export function UnassignedStudentsAdmin() {
  const [students, setStudents] = useState<UnassignedStudent[]>([]);
  const [counselors, setCounselors] = useState<Counselor[]>([]);
  const [selectedStudent, setSelectedStudent] = useState<string | null>(null);
  const [selectedCounselor, setSelectedCounselor] = useState<string>('');
  const [searchTerm, setSearchTerm] = useState('');
  const [loading, setLoading] = useState(true);
  const [assignDialogOpen, setAssignDialogOpen] = useState(false);
  const [viewingStudent, setViewingStudent] = useState<UnassignedStudent | null>(null);
  const { toast } = useToast();

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    setLoading(true);
    try {
      await Promise.all([
        fetchUnassignedStudents(),
        fetchCounselors()
      ]);
    } catch (error) {
      console.error('Error fetching data:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchUnassignedStudents = async () => {
    try {
      // Fetch profiles that are students (via user_roles) but not assigned to any counselor
      const { data: studentRoles, error: rolesError } = await supabase
        .from('user_roles')
        .select('user_id')
        .eq('role', 'student');

      if (rolesError) throw rolesError;

      const studentUserIds = studentRoles?.map(r => r.user_id) || [];
      if (studentUserIds.length === 0) {
        setStudents([]);
        return;
      }

      // Get all student leads
      const { data: studentLeads, error: leadsError } = await supabase
        .from('student_leads')
        .select('*')
        .is('assigned_counselor_id', null);

      if (leadsError) throw leadsError;

      // Get profiles for students
      const { data: profiles } = await supabase
        .from('profiles')
        .select('*')
        .in('user_id', studentUserIds);

      // Combine data - prioritize students who have registered (have profiles)
      const unassignedStudents: UnassignedStudent[] = (profiles || [])
        .filter(profile => {
          // Only include active profiles
          const isActive = (profile as any).is_active !== false;
          const lead = studentLeads?.find(l => l.user_id === profile.user_id);
          return isActive && (!lead || !lead.assigned_counselor_id);
        })
        .map(profile => {
          const lead = studentLeads?.find(l => l.user_id === profile.user_id);
          const profileData: any = profile;
          return {
            id: lead?.id || profile.user_id,
            user_id: profile.user_id,
            full_name: `${profile.first_name || ''} ${profile.last_name || ''}`.trim() || 'N/A',
            email: lead?.email || '',
            phone: profile.phone || lead?.phone || '',
            preferred_countries: profileData.interested_countries || lead?.preferred_countries || [],
            field_of_interest: profileData.field_of_interest || lead?.field_of_interest || '',
            created_at: profile.created_at,
            profile_complete: !!(profile.first_name && profile.last_name && profile.phone)
          };
        });

      setStudents(unassignedStudents);
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive"
      });
    }
  };

  const fetchCounselors = async () => {
    try {
      console.log('Fetching counselors...');
      
      // Fetch ALL counselors first (remove is_active filter to debug)
      const { data: counselorData, error: counselorError } = await supabase
        .from('counselors')
        .select(`
          id,
          user_id,
          specializations,
          is_active
        `);

      console.log('Raw counselor data:', counselorData);
      console.log('Counselor fetch error:', counselorError);

      if (counselorError) {
        throw counselorError;
      }

      if (!counselorData || counselorData.length === 0) {
        console.log('No counselors found in database');
        setCounselors([]);
        toast({
          title: "No Counselors Available",
          description: "No counselors found in the system. Please add counselors first.",
          variant: "destructive"
        });
        return;
      }

      // Filter active counselors
      const activeCounselors = counselorData.filter((c: any) => c.is_active === true);
      console.log('Active counselors:', activeCounselors);

      if (activeCounselors.length === 0) {
        console.log('No active counselors found');
        toast({
          title: "No Active Counselors",
          description: `Found ${counselorData.length} counselor(s) but none are active. Please activate counselors first.`,
          variant: "destructive"
        });
        setCounselors([]);
        return;
      }

      const counselorUserIds = activeCounselors.map((c: any) => c.user_id);
      console.log('Counselor user IDs:', counselorUserIds);
      
      // Get profiles for these counselors
      const { data: profilesData, error: profilesError } = await supabase
        .from('profiles')
        .select('user_id, first_name, last_name')
        .in('user_id', counselorUserIds);

      console.log('Profiles data:', profilesData);
      console.log('Profiles fetch error:', profilesError);

      if (profilesError) {
        throw profilesError;
      }

      // Merge counselor and profile data - use counselor.id (not user_id) as the value
      const counselorsData = activeCounselors.map((counselor: any) => {
        const profile = (profilesData || []).find((p: any) => p.user_id === counselor.user_id);
        return {
          id: counselor.id, // This is the counselor's ID from counselors table
          user_id: counselor.user_id,
          first_name: profile?.first_name || 'Unknown',
          last_name: profile?.last_name || '',
          email: '', // Email not available in profiles table
          specializations: counselor.specializations || []
        };
      });

      console.log('Final counselor list:', counselorsData);
      setCounselors(counselorsData);
      
      if (counselorsData.length === 0) {
        toast({
          title: "No Counselor Profiles",
          description: "Counselors exist but have no profiles. Please complete counselor profiles.",
          variant: "destructive"
        });
      }
    } catch (error: any) {
      console.error('Error fetching counselors:', error);
      toast({
        title: "Database Error",
        description: `Failed to fetch counselors: ${error.message}`,
        variant: "destructive"
      });
      setCounselors([]);
    }
  };

  const handleAssignCounselor = async () => {
    if (!selectedStudent || !selectedCounselor) {
      toast({
        title: "Error",
        description: "Please select both student and counselor",
        variant: "destructive"
      });
      return;
    }

    try {
      const student = students.find(s => s.id === selectedStudent);
      if (!student) return;

      // First, check if student_lead record exists
      const { data: existingLead } = await supabase
        .from('student_leads')
        .select('id')
        .eq('user_id', student.user_id)
        .maybeSingle();

      if (existingLead) {
        // Update existing lead
        const { error } = await supabase
          .from('student_leads')
          .update({ assigned_counselor_id: selectedCounselor })
          .eq('id', existingLead.id);

        if (error) throw error;
      } else {
        // Create new student_lead record
        const { error } = await supabase
          .from('student_leads')
          .insert({
            user_id: student.user_id,
            email: student.email,
            phone: student.phone,
            first_name: student.full_name.split(' ')[0],
            last_name: student.full_name.split(' ').slice(1).join(' '),
            preferred_countries: student.preferred_countries,
            field_of_interest: student.field_of_interest,
            assigned_counselor_id: selectedCounselor,
            status: 'assigned'
          });

        if (error) throw error;
      }

      toast({
        title: "Success",
        description: "Counselor assigned successfully. The counselor has been notified."
      });
      
      setAssignDialogOpen(false);
      setSelectedStudent(null);
      setSelectedCounselor('');
      fetchUnassignedStudents();
    } catch (error: any) {
      toast({
        title: "Error",
        description: "Failed to assign counselor",
        variant: "destructive"
      });
    }
  };

  const filteredStudents = students.filter(student =>
    student.full_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    student.email?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header with Alert */}
      <Card className="glass-card border-2 border-destructive/50 bg-destructive/5">
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-destructive/10 flex items-center justify-center animate-pulse">
              <AlertCircle className="w-5 h-5 text-destructive" />
            </div>
            <div>
              <CardTitle className="text-xl text-destructive">
                High Priority: Unassigned Students
              </CardTitle>
              <CardDescription>
                {students.length} student{students.length !== 1 ? 's' : ''} waiting for counselor assignment
              </CardDescription>
            </div>
          </div>
        </CardHeader>
      </Card>

      {/* Search and Filter */}
      <Card className="glass-card">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Users className="w-5 h-5" />
            Unassigned Students Management
          </CardTitle>
        </CardHeader>
        <CardContent>
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
                <CheckCircle className="w-12 h-12 mx-auto mb-4 opacity-50" />
                <p>All students have been assigned to counselors</p>
              </div>
            ) : (
              filteredStudents.map((student) => (
                <Card key={student.id} className="border-2">
                  <CardContent className="pt-6">
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1 space-y-3">
                        <div className="flex items-start gap-3">
                          <div>
                            <h3 className="font-semibold text-lg">{student.full_name}</h3>
                            <div className="flex items-center gap-4 mt-2 text-sm text-muted-foreground">
                              <span className="flex items-center gap-1">
                                <Mail className="w-3 h-3" />
                                {student.email}
                              </span>
                              <span className="flex items-center gap-1">
                                <Phone className="w-3 h-3" />
                                {student.phone || 'N/A'}
                              </span>
                              <span className="flex items-center gap-1">
                                <Calendar className="w-3 h-3" />
                                {format(new Date(student.created_at), 'MMM dd, yyyy')}
                              </span>
                            </div>
                          </div>
                        </div>

                        <div className="flex items-center gap-2">
                          <Badge variant={student.profile_complete ? "default" : "destructive"}>
                            {student.profile_complete ? 'Profile Complete' : 'Profile Incomplete'}
                          </Badge>
                          {student.preferred_countries && student.preferred_countries.length > 0 && (
                            <Badge variant="outline">
                              {student.preferred_countries.join(', ')}
                            </Badge>
                          )}
                          {student.field_of_interest && (
                            <Badge variant="secondary">
                              {student.field_of_interest}
                            </Badge>
                          )}
                        </div>
                      </div>

                      <div className="flex gap-2">
                        <Dialog>
                          <DialogTrigger asChild>
                            <Button 
                              variant="outline" 
                              size="sm"
                              onClick={() => setViewingStudent(student)}
                            >
                              <Eye className="w-4 h-4 mr-2" />
                              View Details
                            </Button>
                          </DialogTrigger>
                          <DialogContent className="max-w-2xl">
                            <DialogHeader>
                              <DialogTitle>Student Details</DialogTitle>
                              <DialogDescription>
                                Complete profile information for {student.full_name}
                              </DialogDescription>
                            </DialogHeader>
                            <div className="space-y-4">
                              <div className="grid grid-cols-2 gap-4">
                                <div>
                                  <Label>Full Name</Label>
                                  <p className="text-sm">{student.full_name}</p>
                                </div>
                                <div>
                                  <Label>Email</Label>
                                  <p className="text-sm">{student.email}</p>
                                </div>
                                <div>
                                  <Label>Phone</Label>
                                  <p className="text-sm">{student.phone || 'N/A'}</p>
                                </div>
                                <div>
                                  <Label>Registration Date</Label>
                                  <p className="text-sm">{format(new Date(student.created_at), 'PPP')}</p>
                                </div>
                                <div>
                                  <Label>Preferred Countries</Label>
                                  <p className="text-sm">
                                    {student.preferred_countries?.join(', ') || 'Not specified'}
                                  </p>
                                </div>
                                <div>
                                  <Label>Field of Interest</Label>
                                  <p className="text-sm">{student.field_of_interest || 'Not specified'}</p>
                                </div>
                              </div>
                            </div>
                          </DialogContent>
                        </Dialog>

                        <Button 
                          onClick={() => {
                            setSelectedStudent(student.id);
                            setAssignDialogOpen(true);
                          }}
                          size="sm"
                        >
                          <UserPlus className="w-4 h-4 mr-2" />
                          Assign Counselor
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))
            )}
          </div>
        </CardContent>
      </Card>

      {/* Assign Counselor Dialog */}
      <Dialog open={assignDialogOpen} onOpenChange={setAssignDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Assign Counselor</DialogTitle>
            <DialogDescription>
              Select a counselor to assign to this student
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Select Counselor</Label>
              {counselors.length === 0 ? (
                <div className="p-4 border rounded-md bg-muted/50 text-center">
                  <AlertCircle className="w-8 h-8 mx-auto mb-2 text-muted-foreground" />
                  <p className="text-sm text-muted-foreground">
                    No active counselors available. Please add counselors to the system first.
                  </p>
                </div>
              ) : (
                <Select value={selectedCounselor} onValueChange={setSelectedCounselor}>
                  <SelectTrigger>
                    <SelectValue placeholder="Choose a counselor" />
                  </SelectTrigger>
                  <SelectContent>
                    {counselors.map((counselor) => (
                      <SelectItem key={counselor.id} value={counselor.id}>
                        {counselor.first_name} {counselor.last_name}
                        {counselor.specializations.length > 0 && 
                          ` (${counselor.specializations.join(', ')})`
                        }
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setAssignDialogOpen(false)}>
                Cancel
              </Button>
              <Button onClick={handleAssignCounselor}>
                Assign
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
