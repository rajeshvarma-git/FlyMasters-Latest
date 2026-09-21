import { useState, useEffect } from 'react';
import { supabase } from '@student/integrations/supabase/client';
import { useAuth } from '@student/hooks/useAuth';
import { useToast } from '@student/hooks/use-toast';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@student/components/ui/card';
import { Button } from '@student/components/ui/button';
import { Input } from '@student/components/ui/input';
import { Label } from '@student/components/ui/label';
import { Textarea } from '@student/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@student/components/ui/select';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@student/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@student/components/ui/table';
import { Badge } from '@student/components/ui/badge';
import { Plus, Upload, X, Save, Send, FileSpreadsheet, GraduationCap } from 'lucide-react';
import { notifyStudent } from '@student/lib/studentInbox';
import * as XLSX from 'xlsx';

interface Student {
  user_id: string;
  first_name: string;
  last_name: string;
  email: string;
}

interface ShortlistEntry {
  id?: string;
  university_name: string;
  course_name: string;
  location: string;
  course_link: string;
  entry_requirements: string;
  tuition_fees: number;
  course_duration: string;
  application_fees: number;
  counselor_notes: string;
  priority_level: string;
}

export function UniversityShortlisting() {
  const { user } = useAuth();
  const [students, setStudents] = useState<Student[]>([]);
  const [selectedStudent, setSelectedStudent] = useState<string>('');
  const [shortlistEntries, setShortlistEntries] = useState<ShortlistEntry[]>([]);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();

  const emptyEntry: ShortlistEntry = {
    university_name: '',
    course_name: '',
    location: '',
    course_link: '',
    entry_requirements: '',
    tuition_fees: 0,
    course_duration: '',
    application_fees: 0,
    counselor_notes: '',
    priority_level: 'medium'
  };

  useEffect(() => {
    fetchMyStudents();
  }, [user?.id]);

  const fetchMyStudents = async () => {
    if (!user?.id) return;

    try {
      const { data, error } = await supabase
        .from('student_leads')
        .select('user_id, first_name, last_name, email')
        .eq('assigned_counselor_id', user.id);

      if (error) throw error;
      setStudents(data || []);
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive"
      });
    }
  };

  const handleExcelUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target?.result as ArrayBuffer);
        const workbook = XLSX.read(data, { type: 'array' });
        const sheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[sheetName];
        const jsonData = XLSX.utils.sheet_to_json(worksheet);

        const entries: ShortlistEntry[] = jsonData.map((row: any) => ({
          university_name: row['University Name'] || row['university_name'] || '',
          course_name: row['Course Name'] || row['course_name'] || '',
          location: row['Location'] || row['location'] || '',
          course_link: row['Course Link'] || row['course_link'] || '',
          entry_requirements: row['Entry Requirements'] || row['entry_requirements'] || '',
          tuition_fees: parseFloat(row['Tuition Fees'] || row['tuition_fees'] || 0),
          course_duration: row['Course Duration'] || row['course_duration'] || '',
          application_fees: parseFloat(row['Application Fees'] || row['application_fees'] || 0),
          counselor_notes: row['Notes'] || row['counselor_notes'] || '',
          priority_level: row['Priority'] || row['priority_level'] || 'medium'
        }));

        setShortlistEntries(entries);
        toast({
          title: "Success",
          description: `Imported ${entries.length} universities from Excel`
        });
      } catch (error) {
        toast({
          title: "Error",
          description: "Failed to parse Excel file",
          variant: "destructive"
        });
      }
    };
    reader.readAsArrayBuffer(file);
  };

  const addManualEntry = () => {
    setShortlistEntries([...shortlistEntries, { ...emptyEntry }]);
  };

  const updateEntry = (index: number, field: keyof ShortlistEntry, value: any) => {
    const updated = [...shortlistEntries];
    updated[index] = { ...updated[index], [field]: value };
    setShortlistEntries(updated);
  };

  const removeEntry = (index: number) => {
    setShortlistEntries(shortlistEntries.filter((_, i) => i !== index));
  };

  const saveShortlist = async (sendToStudent: boolean = false) => {
    if (!selectedStudent) {
      toast({
        title: "Error",
        description: "Please select a student",
        variant: "destructive"
      });
      return;
    }

    if (shortlistEntries.length === 0) {
      toast({
        title: "Error",
        description: "Please add at least one university",
        variant: "destructive"
      });
      return;
    }

    setLoading(true);
    try {
      const now = new Date().toISOString();
      const entries = shortlistEntries.map((entry) => ({
        id: crypto.randomUUID(),
        student_id: selectedStudent,
        counselor_id: user?.id,
        university_id: `uni-${crypto.randomUUID()}`,
        university_name: entry.university_name,
        course_name: entry.course_name,
        location: entry.location,
        course_link: entry.course_link,
        entry_requirements: entry.entry_requirements,
        tuition_fees: entry.tuition_fees,
        course_duration: entry.course_duration,
        application_fees: entry.application_fees,
        counselor_notes: entry.counselor_notes,
        priority_level: entry.priority_level,
        status: sendToStudent ? 'recommended' : 'draft',
        student_consent: false,
        shortlisted_at: now,
        created_at: now,
        updated_at: now,
      }));

      const { error } = await supabase
        .from('university_shortlists')
        .insert(entries);

      if (error) throw error;

      if (sendToStudent) {
        await notifyStudent({
          userId: selectedStudent,
          title: 'New university shortlist',
          message: `Your counselor added ${entries.length} universit${entries.length === 1 ? 'y' : 'ies'} to your shortlist.`,
          type: 'info',
          actionUrl: '/student/shortlists',
        });
      }

      toast({
        title: "Success",
        description: sendToStudent 
          ? "Shortlist sent to student successfully" 
          : "Shortlist saved as draft"
      });

      setDialogOpen(false);
      setSelectedStudent('');
      setShortlistEntries([]);
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

  return (
    <Card className="glass-card">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <GraduationCap className="w-5 h-5" />
          University Shortlisting
        </CardTitle>
        <CardDescription>
          Create and send university shortlists to your students
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button className="w-full" size="lg">
              <Plus className="w-4 h-4 mr-2" />
              Create New Shortlist
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-6xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Create University Shortlist</DialogTitle>
              <DialogDescription>
                Add universities manually or upload via Excel
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-6">
              {/* Student Selection */}
              <div>
                <Label>Select Student *</Label>
                <Select value={selectedStudent} onValueChange={setSelectedStudent}>
                  <SelectTrigger>
                    <SelectValue placeholder="Choose a student" />
                  </SelectTrigger>
                  <SelectContent>
                    {students.map((student) => (
                      <SelectItem key={student.user_id} value={student.user_id}>
                        {student.first_name} {student.last_name} - {student.email}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Upload Options */}
              <div className="flex gap-3">
                <Button variant="outline" onClick={addManualEntry} className="flex-1">
                  <Plus className="w-4 h-4 mr-2" />
                  Add Manually
                </Button>
                <Button variant="outline" asChild className="flex-1">
                  <label>
                    <FileSpreadsheet className="w-4 h-4 mr-2" />
                    Upload Excel
                    <input
                      type="file"
                      accept=".xlsx,.xls"
                      onChange={handleExcelUpload}
                      className="hidden"
                    />
                  </label>
                </Button>
              </div>

              {/* Shortlist Table */}
              {shortlistEntries.length > 0 && (
                <div className="border rounded-lg overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>University</TableHead>
                        <TableHead>Course</TableHead>
                        <TableHead>Location</TableHead>
                        <TableHead>Tuition</TableHead>
                        <TableHead>Duration</TableHead>
                        <TableHead>Priority</TableHead>
                        <TableHead></TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {shortlistEntries.map((entry, index) => (
                        <TableRow key={index}>
                          <TableCell>
                            <Input
                              value={entry.university_name}
                              onChange={(e) => updateEntry(index, 'university_name', e.target.value)}
                              placeholder="University name"
                            />
                          </TableCell>
                          <TableCell>
                            <Input
                              value={entry.course_name}
                              onChange={(e) => updateEntry(index, 'course_name', e.target.value)}
                              placeholder="Course name"
                            />
                          </TableCell>
                          <TableCell>
                            <Input
                              value={entry.location}
                              onChange={(e) => updateEntry(index, 'location', e.target.value)}
                              placeholder="Location"
                            />
                          </TableCell>
                          <TableCell>
                            <Input
                              type="number"
                              value={entry.tuition_fees}
                              onChange={(e) => updateEntry(index, 'tuition_fees', parseFloat(e.target.value))}
                              placeholder="Fees"
                            />
                          </TableCell>
                          <TableCell>
                            <Input
                              value={entry.course_duration}
                              onChange={(e) => updateEntry(index, 'course_duration', e.target.value)}
                              placeholder="Duration"
                            />
                          </TableCell>
                          <TableCell>
                            <Select
                              value={entry.priority_level}
                              onValueChange={(value) => updateEntry(index, 'priority_level', value)}
                            >
                              <SelectTrigger className="w-[100px]">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="high">High</SelectItem>
                                <SelectItem value="medium">Medium</SelectItem>
                                <SelectItem value="low">Low</SelectItem>
                              </SelectContent>
                            </Select>
                          </TableCell>
                          <TableCell>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => removeEntry(index)}
                            >
                              <X className="w-4 h-4" />
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}

              {/* Action Buttons */}
              <div className="flex justify-end gap-3">
                <Button
                  variant="outline"
                  onClick={() => saveShortlist(false)}
                  disabled={loading}
                >
                  <Save className="w-4 h-4 mr-2" />
                  Save as Draft
                </Button>
                <Button
                  onClick={() => saveShortlist(true)}
                  disabled={loading}
                >
                  <Send className="w-4 h-4 mr-2" />
                  Send to Student
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </CardContent>
    </Card>
  );
}
