import { useState } from 'react';
import { supabase } from '@student/integrations/supabase/client';
import { Button } from '@student/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@student/components/ui/card';
import { Badge } from '@student/components/ui/badge';
import { CheckCircle, XCircle, Loader2 } from 'lucide-react';

interface TestResult {
  name: string;
  status: 'success' | 'error' | 'pending';
  message: string;
  data?: any;
}

export function DatabaseConnectionTest() {
  const [testing, setTesting] = useState(false);
  const [results, setResults] = useState<TestResult[]>([]);

  const runTests = async () => {
    setTesting(true);
    const testResults: TestResult[] = [];

    // Test 1: Profiles table
    try {
      const { data, error } = await supabase.from('profiles').select('*').limit(1);
      testResults.push({
        name: 'Profiles Table',
        status: error ? 'error' : 'success',
        message: error ? error.message : `Found ${data?.length || 0} profiles`,
        data: data?.[0]
      });
    } catch (error: any) {
      testResults.push({
        name: 'Profiles Table',
        status: 'error',
        message: error.message
      });
    }

    // Test 2: User Roles
    try {
      const { data, error } = await supabase.from('user_roles').select('*').limit(5);
      testResults.push({
        name: 'User Roles',
        status: error ? 'error' : 'success',
        message: error ? error.message : `Found ${data?.length || 0} roles`,
        data: data
      });
    } catch (error: any) {
      testResults.push({
        name: 'User Roles',
        status: 'error',
        message: error.message
      });
    }

    // Test 3: Student Leads
    try {
      const { data, error } = await supabase.from('student_leads').select('*').limit(1);
      testResults.push({
        name: 'Student Leads',
        status: error ? 'error' : 'success',
        message: error ? error.message : `Found ${data?.length || 0} leads`,
        data: data?.[0]
      });
    } catch (error: any) {
      testResults.push({
        name: 'Student Leads',
        status: 'error',
        message: error.message
      });
    }

    // Test 4: Applications
    try {
      const { data, error } = await supabase.from('applications').select('*').limit(1);
      testResults.push({
        name: 'Applications',
        status: error ? 'error' : 'success',
        message: error ? error.message : `Found ${data?.length || 0} applications`,
        data: data?.[0]
      });
    } catch (error: any) {
      testResults.push({
        name: 'Applications',
        status: 'error',
        message: error.message
      });
    }

    // Test 5: Documents
    try {
      const { data, error } = await supabase.from('documents').select('*').limit(1);
      testResults.push({
        name: 'Documents',
        status: error ? 'error' : 'success',
        message: error ? error.message : `Found ${data?.length || 0} documents`,
        data: data?.[0]
      });
    } catch (error: any) {
      testResults.push({
        name: 'Documents',
        status: 'error',
        message: error.message
      });
    }

    // Test 6: Chat Sessions
    try {
      const { data, error } = await supabase.from('chat_sessions').select('*').limit(1);
      testResults.push({
        name: 'Chat Sessions',
        status: error ? 'error' : 'success',
        message: error ? error.message : `Found ${data?.length || 0} sessions`,
        data: data?.[0]
      });
    } catch (error: any) {
      testResults.push({
        name: 'Chat Sessions',
        status: 'error',
        message: error.message
      });
    }

    // Test 7: Universities
    try {
      const { data, error } = await supabase.from('universities').select('*').limit(1);
      testResults.push({
        name: 'Universities',
        status: error ? 'error' : 'success',
        message: error ? error.message : `Found ${data?.length || 0} universities`,
        data: data?.[0]
      });
    } catch (error: any) {
      testResults.push({
        name: 'Universities',
        status: 'error',
        message: error.message
      });
    }

    // Test 8: Counselors
    try {
      const { data, error } = await supabase.from('counselors').select('*').limit(1);
      testResults.push({
        name: 'Counselors',
        status: error ? 'error' : 'success',
        message: error ? error.message : `Found ${data?.length || 0} counselors`,
        data: data?.[0]
      });
    } catch (error: any) {
      testResults.push({
        name: 'Counselors',
        status: 'error',
        message: error.message
      });
    }

    // Test 9: User Favorites
    try {
      const { data, error } = await supabase.from('user_favorites').select('*').limit(1);
      testResults.push({
        name: 'User Favorites',
        status: error ? 'error' : 'success',
        message: error ? error.message : `Found ${data?.length || 0} favorites`,
        data: data?.[0]
      });
    } catch (error: any) {
      testResults.push({
        name: 'User Favorites',
        status: 'error',
        message: error.message
      });
    }

    // Test 10: Document Progress View
    try {
      const { data, error } = await supabase.from('student_document_progress').select('*').limit(1);
      testResults.push({
        name: 'Student Document Progress',
        status: error ? 'error' : 'success',
        message: error ? error.message : `Found ${data?.length || 0} records`,
        data: data?.[0]
      });
    } catch (error: any) {
      testResults.push({
        name: 'Student Document Progress',
        status: 'error',
        message: error.message
      });
    }

    setResults(testResults);
    setTesting(false);
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'success':
        return <CheckCircle className="h-5 w-5 text-green-600" />;
      case 'error':
        return <XCircle className="h-5 w-5 text-red-600" />;
      default:
        return <Loader2 className="h-5 w-5 animate-spin" />;
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'success':
        return <Badge className="bg-green-600">Success</Badge>;
      case 'error':
        return <Badge variant="destructive">Error</Badge>;
      default:
        return <Badge variant="secondary">Pending</Badge>;
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Database Connection Test</CardTitle>
        <CardDescription>
          Test all database tables and verify data fetching is working correctly
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <Button onClick={runTests} disabled={testing}>
          {testing ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Running Tests...
            </>
          ) : (
            'Run Connection Tests'
          )}
        </Button>

        {results.length > 0 && (
          <div className="space-y-3 mt-4">
            <div className="flex items-center justify-between pb-2 border-b">
              <h3 className="font-semibold">Test Results</h3>
              <div className="flex gap-2">
                <Badge variant="outline">
                  {results.filter(r => r.status === 'success').length} Passed
                </Badge>
                <Badge variant="destructive">
                  {results.filter(r => r.status === 'error').length} Failed
                </Badge>
              </div>
            </div>

            {results.map((result, index) => (
              <div
                key={index}
                className="flex items-start gap-3 p-3 border rounded-lg bg-muted/30"
              >
                {getStatusIcon(result.status)}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2 mb-1">
                    <span className="font-medium">{result.name}</span>
                    {getStatusBadge(result.status)}
                  </div>
                  <p className="text-sm text-muted-foreground">{result.message}</p>
                  {result.data && (
                    <details className="mt-2">
                      <summary className="text-xs cursor-pointer text-primary">
                        View Sample Data
                      </summary>
                      <pre className="mt-2 text-xs bg-background p-2 rounded border overflow-auto">
                        {JSON.stringify(result.data, null, 2)}
                      </pre>
                    </details>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
