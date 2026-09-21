import { useState, useEffect } from 'react';
import { supabase } from '@student/integrations/supabase/client';
import { useToast } from '@student/hooks/use-toast';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@student/components/ui/card';
import { Button } from '@student/components/ui/button';
import { Badge } from '@student/components/ui/badge';
import { Clock, LogIn, LogOut, Timer } from 'lucide-react';
import { useAuth } from '@student/hooks/useAuth';

export function ShiftTimer() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [todayAttendance, setTodayAttendance] = useState<any>(null);
  const [elapsedTime, setElapsedTime] = useState('00:00:00');
  const [shiftInfo, setShiftInfo] = useState<any>(null);

  useEffect(() => {
    if (user) {
      fetchTodayAttendance();
      fetchShiftInfo();
    }
  }, [user]);

  useEffect(() => {
    let interval: NodeJS.Timeout;
    
    if (todayAttendance?.clock_in && !todayAttendance?.clock_out) {
      interval = setInterval(() => {
        const start = new Date(`${todayAttendance.date}T${todayAttendance.clock_in}`);
        const now = new Date();
        const diff = now.getTime() - start.getTime();
        
        const hours = Math.floor(diff / (1000 * 60 * 60));
        const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
        const seconds = Math.floor((diff % (1000 * 60)) / 1000);
        
        setElapsedTime(
          `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
        );
      }, 1000);
    }
    
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [todayAttendance]);

  const fetchShiftInfo = async () => {
    try {
      const { data: counselorData } = await supabase
        .from('counselors')
        .select('shift_start, shift_end')
        .eq('user_id', user?.id)
        .single();

      if (counselorData) {
        setShiftInfo(counselorData);
      }
    } catch (error) {
      console.error('Error fetching shift info:', error);
    }
  };

  const fetchTodayAttendance = async () => {
    try {
      const today = new Date().toISOString().split('T')[0];
      const { data, error } = await supabase
        .from('counselor_attendance' as any)
        .select('*')
        .eq('counselor_id', user?.id)
        .eq('date', today)
        .single();

      if (error && error.code !== 'PGRST116') throw error;
      
      setTodayAttendance(data);
    } catch (error: any) {
      console.error('Error fetching attendance:', error);
    }
  };

  const handleClockIn = async () => {
    setLoading(true);
    try {
      const now = new Date();
      const today = now.toISOString().split('T')[0];
      const time = now.toTimeString().split(' ')[0];

      const { error } = await supabase
        .from('counselor_attendance' as any)
        .insert({
          counselor_id: user?.id,
          date: today,
          clock_in: time,
          status: 'present'
        });

      if (error) throw error;

      toast({
        title: 'Success',
        description: 'Clocked in successfully!',
      });

      fetchTodayAttendance();
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

  const handleClockOut = async () => {
    setLoading(true);
    try {
      const now = new Date();
      const time = now.toTimeString().split(' ')[0];
      
      const clockIn = new Date(`${todayAttendance.date}T${todayAttendance.clock_in}`);
      const clockOut = new Date(`${todayAttendance.date}T${time}`);
      const totalHours = (clockOut.getTime() - clockIn.getTime()) / (1000 * 60 * 60);

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
        description: `Clocked out successfully! Total hours: ${totalHours.toFixed(2)}`,
      });

      fetchTodayAttendance();
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

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Clock className="h-5 w-5" />
          Shift Timer
        </CardTitle>
        <CardDescription>
          {shiftInfo?.shift_start && shiftInfo?.shift_end
            ? `Shift: ${shiftInfo.shift_start} - ${shiftInfo.shift_end}`
            : 'No shift assigned'}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {todayAttendance?.clock_in && !todayAttendance?.clock_out && (
          <div className="text-center space-y-2">
            <Badge variant="default" className="text-lg px-4 py-2">
              <Timer className="h-4 w-4 mr-2" />
              {elapsedTime}
            </Badge>
            <p className="text-sm text-muted-foreground">
              Started at {todayAttendance.clock_in}
            </p>
          </div>
        )}

        {todayAttendance?.clock_out && (
          <div className="text-center space-y-2">
            <Badge variant="secondary" className="text-lg px-4 py-2">
              Shift Completed
            </Badge>
            <div className="text-sm text-muted-foreground space-y-1">
              <p>In: {todayAttendance.clock_in}</p>
              <p>Out: {todayAttendance.clock_out}</p>
              <p className="font-semibold">Total: {todayAttendance.total_hours?.toFixed(2)} hours</p>
            </div>
          </div>
        )}

        <div className="flex gap-2">
          {!todayAttendance?.clock_in && (
            <Button
              onClick={handleClockIn}
              disabled={loading}
              className="flex-1"
              size="lg"
            >
              <LogIn className="h-4 w-4 mr-2" />
              Clock In
            </Button>
          )}
          
          {todayAttendance?.clock_in && !todayAttendance?.clock_out && (
            <Button
              onClick={handleClockOut}
              disabled={loading}
              variant="destructive"
              className="flex-1"
              size="lg"
            >
              <LogOut className="h-4 w-4 mr-2" />
              Clock Out
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}