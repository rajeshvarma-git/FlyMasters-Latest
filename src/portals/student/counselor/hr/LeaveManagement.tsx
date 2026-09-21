import { useState, useEffect } from 'react';
import { supabase } from '@student/integrations/supabase/client';
import { useAuth } from '@student/hooks/useAuth';
import { useToast } from '@student/hooks/use-toast';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@student/components/ui/card';
import { Button } from '@student/components/ui/button';
import { Input } from '@student/components/ui/input';
import { Textarea } from '@student/components/ui/textarea';
import { Badge } from '@student/components/ui/badge';
import { Label } from '@student/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@student/components/ui/select';
import { Calendar, FileText, Clock, CheckCircle, XCircle, AlertCircle } from 'lucide-react';
import { format } from 'date-fns';

interface LeaveRequest {
  id: string;
  leave_type: string;
  start_date: string;
  end_date: string;
  reason: string;
  status: string;
  applied_on: string;
  admin_comments: string | null;
  total_days: number;
}

export function LeaveManagement() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [leaves, setLeaves] = useState<LeaveRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  
  const [formData, setFormData] = useState({
    leave_type: 'casual',
    start_date: '',
    end_date: '',
    reason: ''
  });

  const fetchLeaves = async () => {
    if (!user?.id) return;

    try {
      const { data, error } = await supabase
        .from('counselor_leave_requests' as any)
        .select('*')
        .eq('counselor_id', user.id)
        .order('applied_on', { ascending: false });

      if (error) throw error;
      setLeaves(data as any || []);
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
    fetchLeaves();
  }, [user?.id]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!user?.id) return;

    try {
      // Calculate total days
      const start = new Date(formData.start_date);
      const end = new Date(formData.end_date);
      const diffTime = Math.abs(end.getTime() - start.getTime());
      const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1;

      const { error } = await supabase
        .from('counselor_leave_requests' as any)
        .insert({
          counselor_id: user.id,
          leave_type: formData.leave_type,
          start_date: formData.start_date,
          end_date: formData.end_date,
          reason: formData.reason,
          total_days: diffDays,
          status: 'pending'
        });

      if (error) throw error;

      toast({
        title: 'Success',
        description: 'Leave request submitted successfully',
      });

      setFormData({
        leave_type: 'casual',
        start_date: '',
        end_date: '',
        reason: ''
      });
      setShowForm(false);
      fetchLeaves();
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message,
        variant: 'destructive',
      });
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'approved':
        return <CheckCircle className="h-4 w-4 text-green-600" />;
      case 'rejected':
        return <XCircle className="h-4 w-4 text-red-600" />;
      default:
        return <Clock className="h-4 w-4 text-yellow-600" />;
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'approved': return 'default';
      case 'rejected': return 'destructive';
      default: return 'secondary';
    }
  };

  if (loading) {
    return <div className="flex justify-center p-8"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div></div>;
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Calendar className="h-5 w-5" />
                Leave Management
              </CardTitle>
              <CardDescription>Apply for leave and track your requests</CardDescription>
            </div>
            <Button onClick={() => setShowForm(!showForm)}>
              {showForm ? 'Cancel' : 'Apply for Leave'}
            </Button>
          </div>
        </CardHeader>
        
        {showForm && (
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="leave_type">Leave Type *</Label>
                  <Select 
                    value={formData.leave_type} 
                    onValueChange={(value) => setFormData({...formData, leave_type: value})}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="casual">Casual Leave</SelectItem>
                      <SelectItem value="sick">Sick Leave</SelectItem>
                      <SelectItem value="earned">Earned Leave</SelectItem>
                      <SelectItem value="maternity">Maternity Leave</SelectItem>
                      <SelectItem value="paternity">Paternity Leave</SelectItem>
                      <SelectItem value="unpaid">Unpaid Leave</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="start_date">Start Date *</Label>
                  <Input
                    id="start_date"
                    type="date"
                    value={formData.start_date}
                    onChange={(e) => setFormData({...formData, start_date: e.target.value})}
                    required
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="end_date">End Date *</Label>
                  <Input
                    id="end_date"
                    type="date"
                    value={formData.end_date}
                    onChange={(e) => setFormData({...formData, end_date: e.target.value})}
                    required
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="reason">Reason *</Label>
                <Textarea
                  id="reason"
                  value={formData.reason}
                  onChange={(e) => setFormData({...formData, reason: e.target.value})}
                  placeholder="Please provide a reason for your leave"
                  required
                  rows={3}
                />
              </div>

              <Button type="submit" className="w-full">Submit Leave Request</Button>
            </form>
          </CardContent>
        )}
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Leave History</CardTitle>
          <CardDescription>View all your leave requests</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {leaves.map((leave) => (
              <div key={leave.id} className="p-4 border rounded-lg space-y-3">
                <div className="flex items-start justify-between">
                  <div>
                    <div className="flex items-center gap-2 mb-2">
                      <h4 className="font-semibold capitalize">{leave.leave_type.replace('_', ' ')} Leave</h4>
                      {getStatusIcon(leave.status)}
                      <Badge variant={getStatusColor(leave.status) as any}>
                        {leave.status}
                      </Badge>
                    </div>
                    <div className="text-sm text-muted-foreground space-y-1">
                      <div className="flex items-center gap-2">
                        <Calendar className="h-3 w-3" />
                        {format(new Date(leave.start_date), 'MMM dd, yyyy')} - {format(new Date(leave.end_date), 'MMM dd, yyyy')}
                      </div>
                      <div className="flex items-center gap-2">
                        <Clock className="h-3 w-3" />
                        Total Days: {leave.total_days}
                      </div>
                      <div className="flex items-center gap-2">
                        <FileText className="h-3 w-3" />
                        Applied on: {format(new Date(leave.applied_on), 'MMM dd, yyyy')}
                      </div>
                    </div>
                  </div>
                </div>
                
                <div className="space-y-2">
                  <div>
                    <span className="text-sm font-medium">Reason:</span>
                    <p className="text-sm text-muted-foreground mt-1">{leave.reason}</p>
                  </div>
                  
                  {leave.admin_comments && (
                    <div className="bg-muted/50 p-3 rounded">
                      <span className="text-sm font-medium">Admin Comments:</span>
                      <p className="text-sm text-muted-foreground mt-1">{leave.admin_comments}</p>
                    </div>
                  )}
                </div>
              </div>
            ))}

            {leaves.length === 0 && (
              <div className="text-center py-8 text-muted-foreground">
                <Calendar className="h-12 w-12 mx-auto mb-4 opacity-50" />
                <p>No leave requests yet</p>
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
