import { useState, useEffect } from 'react';
import { useAuth } from '@student/hooks/useAuth';
import { supabase } from '@student/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@student/components/ui/card';
import { Button } from '@student/components/ui/button';
import { Input } from '@student/components/ui/input';
import { Textarea } from '@student/components/ui/textarea';
import { Badge } from '@student/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@student/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@student/components/ui/dialog';
import { Label } from '@student/components/ui/label';
import { useToast } from '@student/hooks/use-toast';
import { 
  GraduationCap, 
  Plus, 
  Search, 
  Filter,
  Calendar,
  DollarSign,
  User,
  MessageCircle,
  CheckCircle,
  AlertTriangle,
  FileText,
  Settings
} from 'lucide-react';
import { format } from 'date-fns';

interface Student {
  id: string;
  first_name: string;
  last_name: string;
  email: string;
}

interface University {
  id: string;
  name: string;
  country: string;
}

interface Course {
  id: string;
  name: string;
  degree_type: string;
  university_id: string;
}

interface Shortlist {
  id: string;
  student_id: string;
  university_id: string;
  course_id: string;
  status: string;
  student_consent: boolean;
  priority_level: string;
  counselor_notes: string;
  application_deadline: string;
  estimated_fees: number;
  shortlisted_at: string;
  student_profiles: Student;
  universities: University;
  courses: Course;
}

interface ChecklistTemplate {
  type: string;
  title: string;
  description: string;
  items: { title: string; description: string; required: boolean }[];
}

export function StudentShortlistManagement() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [shortlists, setShortlists] = useState<Shortlist[]>([]);
  const [students, setStudents] = useState<Student[]>([]);
  const [universities, setUniversities] = useState<University[]>([]);
  const [courses, setCourses] = useState<Course[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterStatus, setFilterStatus] = useState('all');
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [isChecklistDialogOpen, setIsChecklistDialogOpen] = useState(false);
  const [selectedShortlist, setSelectedShortlist] = useState<string | null>(null);

  const [newShortlist, setNewShortlist] = useState({
    student_id: '',
    university_id: '',
    course_id: '',
    priority_level: 'medium',
    counselor_notes: '',
    application_deadline: '',
    estimated_fees: '',
  });

  const [statusUpdate, setStatusUpdate] = useState({
    status: '',
    notes: '',
    next_action_required: '',
    deadline_date: '',
    is_visible_to_student: true,
  });

  const checklistTemplates: ChecklistTemplate[] = [
    {
      type: 'application',
      title: 'Application Documents',
      description: 'Essential documents for university application',
      items: [
        { title: 'Academic Transcripts', description: 'Official transcripts from previous institutions', required: true },
        { title: 'Statement of Purpose', description: 'Personal essay outlining goals and motivations', required: true },
        { title: 'Letters of Recommendation', description: 'Academic or professional references', required: true },
        { title: 'Passport Copy', description: 'Valid passport for international applications', required: true },
        { title: 'Language Proficiency Test', description: 'IELTS, TOEFL, or equivalent scores', required: true },
      ]
    },
    {
      type: 'visa',
      title: 'Visa Requirements',
      description: 'Documents required for student visa application',
      items: [
        { title: 'Acceptance Letter', description: 'Official university acceptance letter', required: true },
        { title: 'Financial Proof', description: 'Bank statements or sponsor letters', required: true },
        { title: 'Medical Certificate', description: 'Health checkup and vaccinations', required: true },
        { title: 'Visa Application Form', description: 'Completed visa application', required: true },
      ]
    },
    {
      type: 'pre_departure',
      title: 'Pre-Departure Checklist',
      description: 'Tasks to complete before traveling',
      items: [
        { title: 'Accommodation Booking', description: 'Secure housing arrangements', required: true },
        { title: 'Flight Booking', description: 'Book travel to destination', required: true },
        { title: 'Insurance Coverage', description: 'Health and travel insurance', required: true },
        { title: 'Currency Exchange', description: 'Arrange local currency', required: false },
      ]
    }
  ];

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      setLoading(true);
      await Promise.all([
        fetchShortlists(),
        fetchStudents(),
        fetchUniversities(),
        fetchCourses()
      ]);
    } catch (error) {
      console.error('Error fetching data:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchShortlists = async () => {
    const { data, error } = await supabase
      .from('university_shortlists')
      .select(`
        *,
        student_profiles:profiles!university_shortlists_student_id_fkey (id, first_name, last_name),
        universities (id, name, country),
        courses (id, name, degree_type, university_id)
      `)
      .order('shortlisted_at', { ascending: false });

    if (error) throw error;
    
    // Filter out any error objects and ensure proper typing
    const validData = (data || []).filter(item => 
      item && typeof item === 'object' && !('error' in item)
    );
    
    setShortlists(validData as any[]);
  };

  const fetchStudents = async () => {
    const { data, error } = await supabase
      .from('profiles')
      .select('id, first_name, last_name')
      .order('first_name');

    if (error) throw error;
    
    // Filter out any error objects and add default email
    const validData = (data || []).filter(item => 
      item && typeof item === 'object' && !('error' in item)
    ).map(student => ({
      id: student.id,
      first_name: student.first_name || '',
      last_name: student.last_name || '',
      email: `${student.first_name || 'student'}@example.com`
    }));
    
    setStudents(validData);
  };

  const fetchUniversities = async () => {
    const { data, error } = await supabase
      .from('universities')
      .select('id, name, country')
      .eq('is_active', true)
      .order('name');

    if (error) throw error;
    setUniversities(data || []);
  };

  const fetchCourses = async () => {
    const { data, error } = await supabase
      .from('courses')
      .select('id, name, degree_type, university_id')
      .eq('is_active', true)
      .order('name');

    if (error) throw error;
    setCourses(data || []);
  };

  const createShortlist = async () => {
    try {
      const { error } = await supabase
        .from('university_shortlists')
        .insert({
          ...newShortlist,
          counselor_id: user?.id,
          estimated_fees: newShortlist.estimated_fees ? Number(newShortlist.estimated_fees) : null,
        });

      if (error) throw error;

      toast({
        title: "Success",
        description: "University shortlisted successfully",
      });

      setIsCreateDialogOpen(false);
      setNewShortlist({
        student_id: '',
        university_id: '',
        course_id: '',
        priority_level: 'medium',
        counselor_notes: '',
        application_deadline: '',
        estimated_fees: '',
      });
      fetchShortlists();
    } catch (error) {
      console.error('Error creating shortlist:', error);
      toast({
        title: "Error",
        description: "Failed to create shortlist",
        variant: "destructive",
      });
    }
  };

  const updateApplicationStatus = async (shortlistId: string) => {
    try {
      const { error } = await supabase
        .from('application_status_updates')
        .insert({
          shortlist_id: shortlistId,
          updated_by: user?.id,
          ...statusUpdate,
          deadline_date: statusUpdate.deadline_date || null,
        });

      if (error) throw error;

      toast({
        title: "Success",
        description: "Application status updated",
      });

      setStatusUpdate({
        status: '',
        notes: '',
        next_action_required: '',
        deadline_date: '',
        is_visible_to_student: true,
      });
      fetchShortlists();
    } catch (error) {
      console.error('Error updating status:', error);
      toast({
        title: "Error",
        description: "Failed to update status",
        variant: "destructive",
      });
    }
  };

  const activateChecklist = async (shortlistId: string, template: ChecklistTemplate) => {
    try {
      const shortlist = shortlists.find(s => s.id === shortlistId);
      if (!shortlist) return;

      const { error } = await supabase
        .from('student_checklists')
        .insert({
          student_id: shortlist.student_id,
          shortlist_id: shortlistId,
          checklist_type: template.type,
          title: template.title,
          description: template.description,
          items: template.items.map(item => ({ ...item, completed: false })),
          is_active: true,
          activated_by: user?.id,
          activated_at: new Date().toISOString(),
        });

      if (error) throw error;

      toast({
        title: "Success",
        description: "Checklist activated for student",
      });

      setIsChecklistDialogOpen(false);
      setSelectedShortlist(null);
    } catch (error) {
      console.error('Error activating checklist:', error);
      toast({
        title: "Error",
        description: "Failed to activate checklist",
        variant: "destructive",
      });
    }
  };

  const filteredShortlists = shortlists.filter(shortlist => {
    const matchesSearch = 
      shortlist.student_profiles.first_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      shortlist.student_profiles.last_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      shortlist.universities.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      shortlist.courses.name.toLowerCase().includes(searchTerm.toLowerCase());

    const matchesFilter = filterStatus === 'all' || shortlist.status === filterStatus;

    return matchesSearch && matchesFilter;
  });

  const getStatusColor = (status: string) => {
    switch (status.toLowerCase()) {
      case 'recommended': return 'bg-blue-500';
      case 'consented': return 'bg-green-500';
      case 'applied': return 'bg-purple-500';
      case 'accepted': return 'bg-emerald-500';
      case 'rejected': return 'bg-red-500';
      case 'waitlisted': return 'bg-yellow-500';
      default: return 'bg-gray-500';
    }
  };

  const filteredCourses = courses.filter(course => 
    newShortlist.university_id ? course.university_id === newShortlist.university_id : true
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
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold">Student Shortlist Management</h1>
          <p className="text-muted-foreground">Manage university recommendations for students</p>
        </div>
        
        <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="w-4 h-4 mr-2" />
              Create Shortlist
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>Create University Shortlist</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="student">Student</Label>
                  <Select value={newShortlist.student_id} onValueChange={(value) => 
                    setNewShortlist(prev => ({ ...prev, student_id: value }))
                  }>
                    <SelectTrigger>
                      <SelectValue placeholder="Select student" />
                    </SelectTrigger>
                    <SelectContent>
                      {students.map((student) => (
                        <SelectItem key={student.id} value={student.id}>
                          {student.first_name} {student.last_name} ({student.email})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="university">University</Label>
                  <Select value={newShortlist.university_id} onValueChange={(value) => 
                    setNewShortlist(prev => ({ ...prev, university_id: value, course_id: '' }))
                  }>
                    <SelectTrigger>
                      <SelectValue placeholder="Select university" />
                    </SelectTrigger>
                    <SelectContent>
                      {universities.map((university) => (
                        <SelectItem key={university.id} value={university.id}>
                          {university.name} ({university.country})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="course">Course</Label>
                  <Select 
                    value={newShortlist.course_id} 
                    onValueChange={(value) => setNewShortlist(prev => ({ ...prev, course_id: value }))}
                    disabled={!newShortlist.university_id}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select course" />
                    </SelectTrigger>
                    <SelectContent>
                      {filteredCourses.map((course) => (
                        <SelectItem key={course.id} value={course.id}>
                          {course.name} ({course.degree_type})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="priority">Priority Level</Label>
                  <Select value={newShortlist.priority_level} onValueChange={(value) => 
                    setNewShortlist(prev => ({ ...prev, priority_level: value }))
                  }>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="high">High</SelectItem>
                      <SelectItem value="medium">Medium</SelectItem>
                      <SelectItem value="low">Low</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="deadline">Application Deadline</Label>
                  <Input
                    type="date"
                    value={newShortlist.application_deadline}
                    onChange={(e) => setNewShortlist(prev => ({ ...prev, application_deadline: e.target.value }))}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="fees">Estimated Fees (USD)</Label>
                  <Input
                    type="number"
                    placeholder="Enter amount"
                    value={newShortlist.estimated_fees}
                    onChange={(e) => setNewShortlist(prev => ({ ...prev, estimated_fees: e.target.value }))}
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="notes">Counselor Notes</Label>
                <Textarea
                  placeholder="Add notes for the student..."
                  value={newShortlist.counselor_notes}
                  onChange={(e) => setNewShortlist(prev => ({ ...prev, counselor_notes: e.target.value }))}
                  rows={3}
                />
              </div>

              <Button onClick={createShortlist} className="w-full">
                Create Shortlist
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {/* Filters */}
      <div className="flex gap-4">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground w-4 h-4" />
          <Input
            placeholder="Search students or universities..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-10"
          />
        </div>
        <Select value={filterStatus} onValueChange={setFilterStatus}>
          <SelectTrigger className="w-48">
            <Filter className="w-4 h-4 mr-2" />
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Status</SelectItem>
            <SelectItem value="recommended">Recommended</SelectItem>
            <SelectItem value="consented">Consented</SelectItem>
            <SelectItem value="applied">Applied</SelectItem>
            <SelectItem value="accepted">Accepted</SelectItem>
            <SelectItem value="rejected">Rejected</SelectItem>
            <SelectItem value="waitlisted">Waitlisted</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Shortlists */}
      <div className="grid gap-6">
        {filteredShortlists.map((shortlist) => (
          <Card key={shortlist.id} className="glass-card">
            <CardHeader>
              <div className="flex justify-between items-start">
                <div className="flex-1">
                  <div className="flex items-center gap-3 mb-2">
                    <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
                      <User className="w-5 h-5 text-primary" />
                    </div>
                    <div>
                      <CardTitle className="text-xl">
                        {shortlist.student_profiles.first_name} {shortlist.student_profiles.last_name}
                      </CardTitle>
                      <CardDescription>
                        {shortlist.universities.name} • {shortlist.courses.name}
                      </CardDescription>
                    </div>
                  </div>
                  
                  <div className="flex flex-wrap gap-2 mb-4">
                    <Badge className={`${getStatusColor(shortlist.status)} text-white`}>
                      {shortlist.status}
                    </Badge>
                    <Badge variant={shortlist.priority_level === 'high' ? 'destructive' : 'default'}>
                      {shortlist.priority_level} priority
                    </Badge>
                    {shortlist.student_consent && (
                      <Badge variant="outline" className="text-green-600 border-green-600">
                        <CheckCircle className="w-3 h-3 mr-1" />
                        Consented
                      </Badge>
                    )}
                  </div>
                </div>
                
                <div className="flex gap-2">
                  <Dialog>
                    <DialogTrigger asChild>
                      <Button variant="outline" size="sm">
                        <AlertTriangle className="w-4 h-4 mr-2" />
                        Update Status
                      </Button>
                    </DialogTrigger>
                    <DialogContent>
                      <DialogHeader>
                        <DialogTitle>Update Application Status</DialogTitle>
                      </DialogHeader>
                      <div className="space-y-4">
                        <div className="space-y-2">
                          <Label>Status</Label>
                          <Select value={statusUpdate.status} onValueChange={(value) => 
                            setStatusUpdate(prev => ({ ...prev, status: value }))
                          }>
                            <SelectTrigger>
                              <SelectValue placeholder="Select status" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="document_pending">Document Pending</SelectItem>
                              <SelectItem value="submitted">Submitted</SelectItem>
                              <SelectItem value="under_review">Under Review</SelectItem>
                              <SelectItem value="interview_scheduled">Interview Scheduled</SelectItem>
                              <SelectItem value="decision_pending">Decision Pending</SelectItem>
                              <SelectItem value="accepted">Accepted</SelectItem>
                              <SelectItem value="rejected">Rejected</SelectItem>
                              <SelectItem value="waitlisted">Waitlisted</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>

                        <div className="space-y-2">
                          <Label>Notes</Label>
                          <Textarea
                            placeholder="Status update notes..."
                            value={statusUpdate.notes}
                            onChange={(e) => setStatusUpdate(prev => ({ ...prev, notes: e.target.value }))}
                          />
                        </div>

                        <div className="space-y-2">
                          <Label>Next Action Required</Label>
                          <Input
                            placeholder="What should the student do next?"
                            value={statusUpdate.next_action_required}
                            onChange={(e) => setStatusUpdate(prev => ({ ...prev, next_action_required: e.target.value }))}
                          />
                        </div>

                        <div className="space-y-2">
                          <Label>Deadline (optional)</Label>
                          <Input
                            type="date"
                            value={statusUpdate.deadline_date}
                            onChange={(e) => setStatusUpdate(prev => ({ ...prev, deadline_date: e.target.value }))}
                          />
                        </div>

                        <div className="flex items-center space-x-2">
                          <input
                            type="checkbox"
                            id="visible"
                            checked={statusUpdate.is_visible_to_student}
                            onChange={(e) => setStatusUpdate(prev => ({ ...prev, is_visible_to_student: e.target.checked }))}
                          />
                          <Label htmlFor="visible">Visible to student</Label>
                        </div>

                        <Button 
                          onClick={() => updateApplicationStatus(shortlist.id)} 
                          className="w-full"
                          disabled={!statusUpdate.status}
                        >
                          Update Status
                        </Button>
                      </div>
                    </DialogContent>
                  </Dialog>

                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setSelectedShortlist(shortlist.id);
                      setIsChecklistDialogOpen(true);
                    }}
                  >
                    <FileText className="w-4 h-4 mr-2" />
                    Activate Checklist
                  </Button>
                </div>
              </div>
            </CardHeader>

            <CardContent>
              <div className="grid md:grid-cols-3 gap-4 text-sm">
                <div className="flex items-center gap-2">
                  <Calendar className="w-4 h-4 text-muted-foreground" />
                  <span>Shortlisted: {format(new Date(shortlist.shortlisted_at), 'MMM dd, yyyy')}</span>
                </div>
                {shortlist.application_deadline && (
                  <div className="flex items-center gap-2">
                    <AlertTriangle className="w-4 h-4 text-orange-500" />
                    <span>Deadline: {format(new Date(shortlist.application_deadline), 'MMM dd, yyyy')}</span>
                  </div>
                )}
                {shortlist.estimated_fees && (
                  <div className="flex items-center gap-2">
                    <DollarSign className="w-4 h-4 text-muted-foreground" />
                    <span>Est. Fees: ${shortlist.estimated_fees.toLocaleString()}</span>
                  </div>
                )}
              </div>
              
              {shortlist.counselor_notes && (
                <div className="mt-4 p-3 rounded-lg bg-muted/20">
                  <p className="text-sm">{shortlist.counselor_notes}</p>
                </div>
              )}
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Checklist Activation Dialog */}
      <Dialog open={isChecklistDialogOpen} onOpenChange={setIsChecklistDialogOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Activate Checklist for Student</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Choose a checklist template to activate for the student. They will be able to track their progress.
            </p>
            
            <div className="grid gap-4">
              {checklistTemplates.map((template) => (
                <Card key={template.type} className="cursor-pointer hover:bg-muted/20" 
                      onClick={() => selectedShortlist && activateChecklist(selectedShortlist, template)}>
                  <CardHeader>
                    <div className="flex justify-between items-start">
                      <div>
                        <CardTitle className="text-base">{template.title}</CardTitle>
                        <CardDescription>{template.description}</CardDescription>
                      </div>
                      <Badge variant="outline">{template.type}</Badge>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className="text-sm">
                      <strong>{template.items.length}</strong> items including:
                      <ul className="mt-2 list-disc list-inside space-y-1">
                        {template.items.slice(0, 3).map((item, index) => (
                          <li key={index} className="text-muted-foreground">
                            {item.title}
                          </li>
                        ))}
                        {template.items.length > 3 && (
                          <li className="text-muted-foreground">
                            ...and {template.items.length - 3} more
                          </li>
                        )}
                      </ul>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}