import { useState, useEffect } from 'react';
import { supabase } from '@student/integrations/supabase/client';
import { useAuth } from '@student/hooks/useAuth';
import { useToast } from '@student/hooks/use-toast';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@student/components/ui/card';
import { Badge } from '@student/components/ui/badge';
import { DollarSign, Calendar, Download, TrendingUp } from 'lucide-react';
import { format } from 'date-fns';
import { Button } from '@student/components/ui/button';

interface SalaryRecord {
  id: string;
  month: string;
  year: number;
  basic_salary: number;
  allowances: number;
  deductions: number;
  net_salary: number;
  status: string;
  payment_date: string | null;
  payment_mode: string | null;
}

export function SalaryRecords() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [salaries, setSalaries] = useState<SalaryRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [ytdEarnings, setYtdEarnings] = useState(0);

  const fetchSalaries = async () => {
    if (!user?.id) return;

    try {
      const { data, error } = await supabase
        .from('counselor_salary_records' as any)
        .select('*')
        .eq('counselor_id', user.id)
        .order('year', { ascending: false })
        .order('month', { ascending: false });

      if (error) throw error;

      setSalaries(data as any || []);
      
      // Calculate YTD earnings
      const currentYear = new Date().getFullYear();
      const ytd = data
        ?.filter((s: any) => s.year === currentYear && s.status === 'paid')
        .reduce((sum: number, s: any) => sum + s.net_salary, 0) || 0;
      setYtdEarnings(ytd);
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
    fetchSalaries();
  }, [user?.id]);

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'paid': return 'default';
      case 'pending': return 'secondary';
      case 'processing': return 'outline';
      default: return 'outline';
    }
  };

  const downloadPayslip = (salary: SalaryRecord) => {
    toast({
      title: 'Download Started',
      description: 'Your payslip is being generated...',
    });
    // In a real app, this would generate and download a PDF
  };

  if (loading) {
    return <div className="flex justify-center p-8"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div></div>;
  }

  return (
    <div className="space-y-6">
      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">YTD Earnings</p>
                <p className="text-2xl font-bold">₹{ytdEarnings.toLocaleString()}</p>
              </div>
              <TrendingUp className="h-8 w-8 text-green-600" />
            </div>
          </CardContent>
        </Card>

        {salaries[0] && (
          <>
            <Card>
              <CardContent className="p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-muted-foreground">Last Month</p>
                    <p className="text-2xl font-bold">₹{salaries[0].net_salary.toLocaleString()}</p>
                  </div>
                  <DollarSign className="h-8 w-8 text-primary" />
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-muted-foreground">Status</p>
                    <Badge variant={getStatusColor(salaries[0].status) as any} className="mt-2">
                      {salaries[0].status}
                    </Badge>
                  </div>
                  <Calendar className="h-8 w-8 text-blue-600" />
                </div>
              </CardContent>
            </Card>
          </>
        )}
      </div>

      {/* Salary Records */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <DollarSign className="h-5 w-5" />
            Salary Records
          </CardTitle>
          <CardDescription>View your salary history and download payslips</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {salaries.map((salary) => (
              <div key={salary.id} className="p-4 border rounded-lg space-y-3">
                <div className="flex items-start justify-between">
                  <div>
                    <h4 className="font-semibold text-lg">
                      {salary.month} {salary.year}
                    </h4>
                    <div className="text-sm text-muted-foreground mt-1">
                      {salary.payment_date && (
                        <div>Paid on: {format(new Date(salary.payment_date), 'MMM dd, yyyy')}</div>
                      )}
                      {salary.payment_mode && (
                        <div>Payment Mode: {salary.payment_mode}</div>
                      )}
                    </div>
                  </div>
                  <div className="text-right">
                    <Badge variant={getStatusColor(salary.status) as any}>
                      {salary.status}
                    </Badge>
                  </div>
                </div>

                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                  <div>
                    <span className="text-muted-foreground">Basic Salary</span>
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
                    <span className="text-muted-foreground">Net Salary</span>
                    <p className="font-semibold text-lg">₹{salary.net_salary.toLocaleString()}</p>
                  </div>
                </div>

                {salary.status === 'paid' && (
                  <Button 
                    variant="outline" 
                    size="sm" 
                    onClick={() => downloadPayslip(salary)}
                    className="gap-2"
                  >
                    <Download className="h-4 w-4" />
                    Download Payslip
                  </Button>
                )}
              </div>
            ))}

            {salaries.length === 0 && (
              <div className="text-center py-8 text-muted-foreground">
                <DollarSign className="h-12 w-12 mx-auto mb-4 opacity-50" />
                <p>No salary records available</p>
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
