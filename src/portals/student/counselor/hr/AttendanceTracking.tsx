import { useState, useEffect } from 'react';
import { supabase } from '@student/integrations/supabase/client';
import { useAuth } from '@student/hooks/useAuth';
import { useToast } from '@student/hooks/use-toast';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@student/components/ui/card';
import { Button } from '@student/components/ui/button';
import { Badge } from '@student/components/ui/badge';
import { ClockIcon, Calendar, CheckCircle, LogIn, LogOut } from 'lucide-react';
import { format, startOfMonth, endOfMonth } from 'date-fns';

interface AttendanceRecord {
  id: string;
  date: string;
  clock_in: string | null;
  clock_out: string | null;
  status: string;
  total_hours: number | null;
}

export function AttendanceTracking() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [attendance, setAttendance] = useState<AttendanceRecord[]>([]);
  const [todayAttendance, setTodayAttendance] = useState<AttendanceRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState({
    present: 0,
    absent: 0,
    late: 0,
    totalHours: 0
  });

  const fetchAttendance = async () => {
    if (!user?.id) return;

    try {
      const startDate = startOfMonth(new Date());
      const endDate = endOfMonth(new Date());

      const { data, error } = await supabase
        .from('counselor_attendance' as any)
        .select('*')
        .eq('counselor_id', user.id)
        .gte('date', format(startDate, 'yyyy-MM-dd'))
        .lte('date', format(endDate, 'yyyy-MM-dd'))
        .order('date', { ascending: false });

      if (error) throw error;

      setAttendance(data as any || []);

      // Find today's attendance
      const today = format(new Date(), 'yyyy-MM-dd');
      const todayRecord = data?.find((record: any) => record.date === today);
      setTodayAttendance(todayRecord as any || null);

      // Calculate stats
      const present = data?.filter((r: any) => r.status === 'present').length || 0;
      const absent = data?.filter((r: any) => r.status === 'absent').length || 0;
      const late = data?.filter((r: any) => r.status === 'late').length || 0;
      const totalHours = data?.reduce((sum: number, r: any) => sum + (r.total_hours || 0), 0) || 0;

      setStats({ present, absent, late, totalHours });
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message,
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAttendance();
  }, [user?.id]);

  const handleClockIn = async () => {
    if (!user?.id) return;

    try {
      const now = new Date();
      const today = format(now, 'yyyy-MM-dd');
      const time = format(now, 'HH:mm:ss');

      // Check if already clocked in
      if (todayAttendance?.clock_in) {
        toast({
          title: 'Already Clocked In',
          description: 'You have already clocked in today',
          variant: 'destructive',
        });
        return;
      }

      const { error } = await supabase
        .from('counselor_attendance' as any)
        .insert({
          counselor_id: user.id,
          date: today,
          clock_in: time,
          status: 'present'
        });

      if (error) throw error;

      toast({
        title: 'Success',
        description: 'Clocked in successfully',
      });

      fetchAttendance();
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message,
        variant: 'destructive',
      });
    }
  };

  const handleClockOut = async () => {
    if (!user?.id || !todayAttendance) return;

    try {
      const now = new Date();
      const time = format(now, 'HH:mm:ss');

      // Calculate total hours
      const clockInTime = new Date(`${todayAttendance.date}T${todayAttendance.clock_in}`);
      const clockOutTime = new Date(`${todayAttendance.date}T${time}`);
      const totalHours = (clockOutTime.getTime() - clockInTime.getTime()) / (1000 * 60 * 60);

      const { error } = await supabase
        .from('counselor_attendance' as any)
        .update({
          clock_out: time,
          total_hours: totalHours
        })
        .eq('id', todayAttendance.id);

      if (error) throw error;

      toast({
        title: 'Success',
        description: `Clocked out successfully. Total hours: ${totalHours.toFixed(2)}`,
      });

      fetchAttendance();
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message,
        variant: 'destructive',
      });
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'present': return 'default';
      case 'absent': return 'destructive';
      case 'late': return 'secondary';
      case 'half_day': return 'outline';
      default: return 'outline';
    }
  };

  if (loading) {
    return <div className="flex justify-center p-8"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div></div>;
  }

  return (
    <div className="space-y-6">
      {/* Clock In/Out Card */}
      <Card className="bg-gradient-to-r from-primary/10 to-primary/5">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ClockIcon className="h-5 w-5" />
            Today's Attendance
          </CardTitle>
          <CardDescription>Mark your attendance for today</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between">
            <div className="space-y-2">
              {todayAttendance?.clock_in ? (
                <>
                  <div className="flex items-center gap-2 text-lg">
                    <CheckCircle className="h-5 w-5 text-green-600" />
                    <span className="font-semibold">Clock In: {todayAttendance.clock_in}</span>
                  </div>
                  {todayAttendance.clock_out && (
                    <div className="flex items-center gap-2 text-lg">
                      <CheckCircle className="h-5 w-5 text-blue-600" />
                      <span className="font-semibold">Clock Out: {todayAttendance.clock_out}</span>
                    </div>
                  )}
                  {todayAttendance.total_hours && (
                    <div className="text-sm text-muted-foreground">
                      Total Hours: {todayAttendance.total_hours.toFixed(2)} hours
                    </div>
                  )}
                </>
              ) : (
                <div className="text-muted-foreground">Not clocked in yet</div>
              )}
            </div>
            
            <div className="flex gap-2">
              {!todayAttendance?.clock_in ? (
                <Button onClick={handleClockIn} size="lg" className="gap-2">
                  <LogIn className="h-4 w-4" />
                  Clock In
                </Button>
              ) : !todayAttendance?.clock_out ? (
                <Button onClick={handleClockOut} size="lg" variant="destructive" className="gap-2">
                  <LogOut className="h-4 w-4" />
                  Clock Out
                </Button>
              ) : (
                <Badge variant="default" className="text-lg py-2 px-4">
                  Completed for Today
                </Badge>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Monthly Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4 text-center">
            <div className="text-2xl font-bold text-green-600">{stats.present}</div>
            <div className="text-sm text-muted-foreground">Present</div>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="p-4 text-center">
            <div className="text-2xl font-bold text-red-600">{stats.absent}</div>
            <div className="text-sm text-muted-foreground">Absent</div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4 text-center">
            <div className="text-2xl font-bold text-orange-600">{stats.late}</div>
            <div className="text-sm text-muted-foreground">Late</div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4 text-center">
            <div className="text-2xl font-bold text-blue-600">{stats.totalHours.toFixed(1)}</div>
            <div className="text-sm text-muted-foreground">Total Hours</div>
          </CardContent>
        </Card>
      </div>

      {/* Attendance History */}
      <Card>
        <CardHeader>
          <CardTitle>This Month's Attendance</CardTitle>
          <CardDescription>View your attendance records</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {attendance.map((record) => (
              <div key={record.id} className="p-4 border rounded-lg flex items-center justify-between">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <Calendar className="h-4 w-4" />
                    <span className="font-semibold">{format(new Date(record.date), 'EEEE, MMM dd, yyyy')}</span>
                  </div>
                  <div className="text-sm text-muted-foreground">
                    {record.clock_in && <span>In: {record.clock_in}</span>}
                    {record.clock_out && <span className="ml-4">Out: {record.clock_out}</span>}
                    {record.total_hours && <span className="ml-4">Hours: {record.total_hours.toFixed(2)}</span>}
                  </div>
                </div>
                <Badge variant={getStatusColor(record.status) as any}>
                  {record.status}
                </Badge>
              </div>
            ))}

            {attendance.length === 0 && (
              <div className="text-center py-8 text-muted-foreground">
                <Calendar className="h-12 w-12 mx-auto mb-4 opacity-50" />
                <p>No attendance records this month</p>
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
