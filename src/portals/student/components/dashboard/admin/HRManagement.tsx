import { useState, useEffect } from 'react';
import { supabase } from '@student/integrations/supabase/client';
import { useToast } from '@student/hooks/use-toast';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@student/components/ui/card';
import { Button } from '@student/components/ui/button';
import { Badge } from '@student/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@student/components/ui/tabs';
import { Textarea } from '@student/components/ui/textarea';
import { Input } from '@student/components/ui/input';
import { Label } from '@student/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@student/components/ui/select';
import { 
  Calendar, 
  Clock, 
  DollarSign, 
  CheckCircle, 
  XCircle,
  UserCheck,
  AlertCircle
} from 'lucide-react';
import { format } from 'date-fns';

interface LeaveRequest {
  id: string;
  counselor_id: string;
  leave_type: string;
  start_date: string;
  end_date: string;
  reason: string;
  status: string;
  applied_on: string;
  total_days: number;
  profiles: { first_name: string; last_name: string } | null;
}

interface AttendanceRecord {
  id: string;
  counselor_id: string;
  date: string;
  clock_in: string | null;
  clock_out: string | null;
  status: string;
  total_hours: number | null;
  profiles: { first_name: string; last_name: string } | null;
}

interface SalaryRecord {
  id: string;
  counselor_id: string;
  month: string;
  year: number;
  basic_salary: number;
  allowances: number;
  deductions: number;
  net_salary: number;
  status: string;
  payment_date: string | null;
  profiles: { first_name: string; last_name: string } | null;
}

export function HRManagement() {
  const { toast } = useToast();
  const [leaves, setLeaves] = useState<LeaveRequest[]>([]);
  const [attendance, setAttendance] = useState<AttendanceRecord[]>([]);
  const [salaries, setSalaries] = useState<SalaryRecord[]>([]);
  const [counselors, setCounselors] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedLeave, setSelectedLeave] = useState<LeaveRequest | null>(null);
  const [adminComments, setAdminComments] = useState('');
  const [showSalaryForm, setShowSalaryForm] = useState(false);
  const [salaryForm, setSalaryForm] = useState({
    counselor_id: '',
    month: '',
    year: new Date().getFullYear(),
    basic_salary: 0,
    allowances: 0,
    deductions: 0
  });

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      // Fetch HR records - these now use direct foreign keys to auth.users
      const [leavesRes, attendanceRes, salariesRes] = await Promise.all([
        supabase
          .from('counselor_leave_requests' as any)
          .select('*')
          .order('applied_on', { ascending: false }),
        supabase
          .from('counselor_attendance' as any)
          .select('*')
          .order('date', { ascending: false })
          .limit(50),
        supabase
          .from('counselor_salary_records' as any)
          .select('*')
          .order('year', { ascending: false })
      ]);

      // Fetch counselors with their profiles and extended info
      const { data: counselorRoles, error: rolesError } = await supabase
        .from('user_roles')
        .select('user_id')
        .eq('role', 'counselor');

      if (rolesError) throw rolesError;

      const counselorUserIds = (counselorRoles || []).map((r: any) => r.user_id);

      let counselorsWithProfiles: any[] = [];
      if (counselorUserIds.length > 0) {
        const { data: profiles, error: profilesError } = await supabase
          .from('profiles')
          .select('user_id, first_name, last_name, email')
          .in('user_id', counselorUserIds);

        if (profilesError) throw profilesError;

        // Fetch counselor extended data
        const { data: counselorsData } = await supabase
          .from('counselors')
          .select('user_id, position, contact_number, hourly_rate, shift_start, shift_end')
          .in('user_id', counselorUserIds);

        // Merge profile and counselor data
        counselorsWithProfiles = (profiles || []).map((profile: any) => {
          const counselorData = (counselorsData || []).find((c: any) => c.user_id === profile.user_id);
          return {
            ...profile,
            ...counselorData
          };
        });
      }

      // Attach profile data to HR records
      const leavesWithProfiles = ((leavesRes.data || []) as any[]).map((leave: any) => ({
        ...leave,
        profiles: counselorsWithProfiles.find((p: any) => p.user_id === leave.counselor_id)
      }));

      const attendanceWithProfiles = ((attendanceRes.data || []) as any[]).map((att: any) => ({
        ...att,
        profiles: counselorsWithProfiles.find((p: any) => p.user_id === att.counselor_id)
      }));

      const salariesWithProfiles = ((salariesRes.data || []) as any[]).map((sal: any) => ({
        ...sal,
        profiles: counselorsWithProfiles.find((p: any) => p.user_id === sal.counselor_id)
      }));

      setLeaves(leavesWithProfiles);
      setAttendance(attendanceWithProfiles);
      setSalaries(salariesWithProfiles);
      setCounselors(counselorsWithProfiles);
    } catch (error: any) {
      console.error('Error fetching HR data:', error);
      toast({
        title: 'Error',
        description: error.message,
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const handleLeaveAction = async (leaveId: string, action: 'approved' | 'rejected') => {
    try {
      const { error } = await supabase
        .from('counselor_leave_requests' as any)
        .update({
          status: action,
          admin_comments: adminComments,
          [action === 'approved' ? 'approved_by' : 'rejected_by']: (await supabase.auth.getUser()).data.user?.id,
          [action === 'approved' ? 'approved_on' : 'rejected_on']: new Date().toISOString()
        })
        .eq('id', leaveId);

      if (error) throw error;

      toast({
        title: 'Success',
        description: `Leave request ${action}`,
      });

      setSelectedLeave(null);
      setAdminComments('');
      fetchData();
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message,
        variant: 'destructive',
      });
    }
  };

  const handleSalarySubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    try {
      const netSalary = salaryForm.basic_salary + salaryForm.allowances - salaryForm.deductions;

      const { error } = await supabase
        .from('counselor_salary_records' as any)
        .insert({
          ...salaryForm,
          net_salary: netSalary,
          status: 'pending',
          generated_by: (await supabase.auth.getUser()).data.user?.id
        });

      if (error) throw error;

      toast({
        title: 'Success',
        description: 'Salary record created',
      });

      setShowSalaryForm(false);
      setSalaryForm({
        counselor_id: '',
        month: '',
        year: new Date().getFullYear(),
        basic_salary: 0,
        allowances: 0,
        deductions: 0
      });
      fetchData();
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message,
        variant: 'destructive',
      });
    }
  };

  const markSalaryPaid = async (salaryId: string) => {
    try {
      const { error } = await supabase
        .from('counselor_salary_records' as any)
        .update({
          status: 'paid',
          payment_date: new Date().toISOString()
        })
        .eq('id', salaryId);

      if (error) throw error;

      toast({
        title: 'Success',
        description: 'Salary marked as paid',
      });

      fetchData();
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message,
        variant: 'destructive',
      });
    }
  };

  if (loading) {
    return <div className="flex justify-center p-8"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div></div>;
  }

  const pendingLeaves = leaves.filter(l => l.status === 'pending');

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-3xl font-bold">HR Management</h2>
          <p className="text-muted-foreground">Manage counselor leaves, attendance, and salaries</p>
        </div>
      </div>

      {pendingLeaves.length > 0 && (
        <Card className="border-orange-200 bg-orange-50 dark:bg-orange-900/10">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-orange-600">
              <AlertCircle className="h-5 w-5" />
              {pendingLeaves.length} Pending Leave Requests
            </CardTitle>
          </CardHeader>
        </Card>
      )}

      <Tabs defaultValue="leaves" className="space-y-6">
        <TabsList className="grid w-full grid-cols-3 max-w-lg">
          <TabsTrigger value="leaves" className="gap-2">
            <Calendar className="h-4 w-4" />
            Leave Requests
          </TabsTrigger>
          <TabsTrigger value="attendance" className="gap-2">
            <Clock className="h-4 w-4" />
            Attendance
          </TabsTrigger>
          <TabsTrigger value="salary" className="gap-2">
            <DollarSign className="h-4 w-4" />
            Salary
          </TabsTrigger>
        </TabsList>

        <TabsContent value="leaves" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Leave Requests</CardTitle>
              <CardDescription>Review and approve/reject leave requests</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {leaves.map((leave) => (
                  <div key={leave.id} className="p-4 border rounded-lg space-y-3">
                    <div className="flex items-start justify-between">
                      <div>
                        <h4 className="font-semibold">
                          {leave.profiles?.first_name} {leave.profiles?.last_name}
                        </h4>
                        <div className="text-sm text-muted-foreground mt-1">
                          <div>{leave.leave_type.toUpperCase()} Leave</div>
                          <div>{format(new Date(leave.start_date), 'MMM dd')} - {format(new Date(leave.end_date), 'MMM dd, yyyy')}</div>
                          <div>Total Days: {leave.total_days}</div>
                        </div>
                      </div>
                      <Badge variant={leave.status === 'pending' ? 'secondary' : leave.status === 'approved' ? 'default' : 'destructive'}>
                        {leave.status}
                      </Badge>
                    </div>

                    <div>
                      <span className="text-sm font-medium">Reason:</span>
                      <p className="text-sm text-muted-foreground mt-1">{leave.reason}</p>
                    </div>

                    {leave.status === 'pending' && (
                      <div className="space-y-3 pt-2">
                        <Textarea
                          placeholder="Add comments (optional)"
                          value={selectedLeave?.id === leave.id ? adminComments : ''}
                          onChange={(e) => {
                            setSelectedLeave(leave);
                            setAdminComments(e.target.value);
                          }}
                          rows={2}
                        />
                        <div className="flex gap-2">
                          <Button 
                            onClick={() => handleLeaveAction(leave.id, 'approved')}
                            className="gap-2"
                            size="sm"
                          >
                            <CheckCircle className="h-4 w-4" />
                            Approve
                          </Button>
                          <Button 
                            onClick={() => handleLeaveAction(leave.id, 'rejected')}
                            variant="destructive"
                            className="gap-2"
                            size="sm"
                          >
                            <XCircle className="h-4 w-4" />
                            Reject
                          </Button>
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="attendance" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Attendance Records</CardTitle>
              <CardDescription>View counselor attendance</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {attendance.map((record) => (
                  <div key={record.id} className="p-4 border rounded-lg flex items-center justify-between">
                    <div>
                      <h4 className="font-semibold">
                        {record.profiles?.first_name} {record.profiles?.last_name}
                      </h4>
                      <div className="text-sm text-muted-foreground">
                        <div>{format(new Date(record.date), 'EEEE, MMM dd, yyyy')}</div>
                        {record.clock_in && <div>In: {record.clock_in}</div>}
                        {record.clock_out && <div>Out: {record.clock_out}</div>}
                        {record.total_hours && <div>Hours: {record.total_hours.toFixed(2)}</div>}
                      </div>
                    </div>
                    <Badge variant={record.status === 'present' ? 'default' : 'destructive'}>
                      {record.status}
                    </Badge>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="salary" className="space-y-4">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>Salary Records</CardTitle>
                  <CardDescription>Manage counselor salaries</CardDescription>
                </div>
                <Button onClick={() => setShowSalaryForm(!showSalaryForm)}>
                  {showSalaryForm ? 'Cancel' : 'Add Salary Record'}
                </Button>
              </div>
            </CardHeader>

            {showSalaryForm && (
              <CardContent>
                <form onSubmit={handleSalarySubmit} className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>Counselor *</Label>
                      <Select 
                        value={salaryForm.counselor_id}
                        onValueChange={(value) => setSalaryForm({...salaryForm, counselor_id: value})}
                        required
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Select counselor" />
                        </SelectTrigger>
                        <SelectContent>
                          {counselors.map((c) => (
                            <SelectItem key={c.user_id} value={c.user_id}>
                              {c.first_name} {c.last_name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="space-y-2">
                      <Label>Month *</Label>
                      <Select 
                        value={salaryForm.month}
                        onValueChange={(value) => setSalaryForm({...salaryForm, month: value})}
                        required
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Select month" />
                        </SelectTrigger>
                        <SelectContent>
                          {['January', 'February', 'March', 'April', 'May', 'June', 
                            'July', 'August', 'September', 'October', 'November', 'December'].map(m => (
                            <SelectItem key={m} value={m}>{m}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="space-y-2">
                      <Label>Basic Salary *</Label>
                      <Input
                        type="number"
                        value={salaryForm.basic_salary}
                        onChange={(e) => setSalaryForm({...salaryForm, basic_salary: parseFloat(e.target.value)})}
                        required
                      />
                    </div>

                    <div className="space-y-2">
                      <Label>Allowances</Label>
                      <Input
                        type="number"
                        value={salaryForm.allowances}
                        onChange={(e) => setSalaryForm({...salaryForm, allowances: parseFloat(e.target.value)})}
                      />
                    </div>

                    <div className="space-y-2">
                      <Label>Deductions</Label>
                      <Input
                        type="number"
                        value={salaryForm.deductions}
                        onChange={(e) => setSalaryForm({...salaryForm, deductions: parseFloat(e.target.value)})}
                      />
                    </div>

                    <div className="space-y-2">
                      <Label>Net Salary</Label>
                      <Input
                        type="number"
                        value={salaryForm.basic_salary + salaryForm.allowances - salaryForm.deductions}
                        disabled
                      />
                    </div>
                  </div>

                  <Button type="submit" className="w-full">Create Salary Record</Button>
                </form>
              </CardContent>
            )}

            <CardContent>
              <div className="space-y-4">
                {salaries.map((salary) => (
                  <div key={salary.id} className="p-4 border rounded-lg space-y-3">
                    <div className="flex items-start justify-between">
                      <div>
                        <h4 className="font-semibold">
                          {salary.profiles?.first_name} {salary.profiles?.last_name}
                        </h4>
                        <div className="text-sm text-muted-foreground">
                          {salary.month} {salary.year}
                        </div>
                      </div>
                      <Badge variant={salary.status === 'paid' ? 'default' : 'secondary'}>
                        {salary.status}
                      </Badge>
                    </div>

                    <div className="grid grid-cols-4 gap-4 text-sm">
                      <div>
                        <span className="text-muted-foreground">Basic</span>
                        <p className="font-semibold">₹{salary.basic_salary.toLocaleString()}</p>
                      </div>
                      <div>
                        <span className="text-muted-foreground">Allowances</span>
                        <p className="font-semibold text-green-600">+₹{salary.allowances.toLocaleString()}</p>
                      </div>
                      <div>
                        <span className="text-muted-foreground">Deductions</span>
                        <p className="font-semibold text-red-600">-₹{salary.deductions.toLocaleString()}</p>
                      </div>
                      <div>
                        <span className="text-muted-foreground">Net</span>
                        <p className="font-semibold text-lg">₹{salary.net_salary.toLocaleString()}</p>
                      </div>
                    </div>

                    {salary.status !== 'paid' && (
                      <Button 
                        onClick={() => markSalaryPaid(salary.id)}
                        size="sm"
                        className="gap-2"
                      >
                        <CheckCircle className="h-4 w-4" />
                        Mark as Paid
                      </Button>
                    )}
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
