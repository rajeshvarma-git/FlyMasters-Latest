import { useState, useRef } from 'react';
import { Button } from '@student/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@student/components/ui/card';
import { Input } from '@student/components/ui/input';
import { Progress } from '@student/components/ui/progress';
import { useToast } from '@student/components/ui/use-toast';
import { supabase } from '@student/integrations/supabase/client';
import { Upload, Download, FileText, AlertCircle, CheckCircle, X } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@student/components/ui/dialog';
import { Badge } from '@student/components/ui/badge';

interface UploadResult {
  success: number;
  failed: number;
  errors: { row: number; error: string; data?: any }[];
}

export function BulkLeadUpload() {
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadResult, setUploadResult] = useState<UploadResult | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();

  const downloadTemplate = () => {
    const template = `first_name,last_name,email,phone,field_of_interest,academic_score,preferred_countries,lead_stage,priority_level,lead_source,notes
John,Doe,john.doe@email.com,+1234567890,Computer Science,85%,"USA,Canada",hot,high,website,Interested in AI programs
Jane,Smith,jane.smith@email.com,+9876543210,Business Administration,78%,"UK,Australia",warm,medium,referral,MBA programs inquiry`;
    
    const blob = new Blob([template], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'lead_upload_template.csv';
    document.body.appendChild(a);
    a.click();
    window.URL.revokeObjectURL(url);
    document.body.removeChild(a);
    
    toast({
      title: 'Template Downloaded',
      description: 'CSV template has been downloaded to your device',
    });
  };

  const parseCSV = (text: string): any[] => {
    const lines = text.split('\n').filter(line => line.trim());
    if (lines.length < 2) return [];
    
    const headers = lines[0].split(',').map(h => h.trim().replace(/"/g, ''));
    const data = [];
    
    for (let i = 1; i < lines.length; i++) {
      const values = lines[i].split(',').map(v => v.trim().replace(/"/g, ''));
      const row: any = {};
      
      headers.forEach((header, index) => {
        let value = values[index] || '';
        
        // Handle array fields
        if (header === 'preferred_countries' && value) {
          row[header] = value.split(';').map(c => c.trim());
        } else {
          row[header] = value;
        }
      });
      
      data.push(row);
    }
    
    return data;
  };

  const validateLeadData = (lead: any, rowIndex: number): { isValid: boolean; errors: string[] } => {
    const errors: string[] = [];
    
    if (!lead.first_name) errors.push('First name is required');
    if (!lead.last_name) errors.push('Last name is required');
    if (!lead.email) errors.push('Email is required');
    if (lead.email && !/\S+@\S+\.\S+/.test(lead.email)) errors.push('Invalid email format');
    if (lead.phone && !/^\+?[\d\s\-\(\)]+$/.test(lead.phone)) errors.push('Invalid phone format');
    
    const validStages = ['hot', 'warm', 'cold', 'converted'];
    if (lead.lead_stage && !validStages.includes(lead.lead_stage)) {
      errors.push(`Invalid lead stage. Must be one of: ${validStages.join(', ')}`);
    }
    
    const validPriorities = ['high', 'medium', 'low'];
    if (lead.priority_level && !validPriorities.includes(lead.priority_level)) {
      errors.push(`Invalid priority level. Must be one of: ${validPriorities.join(', ')}`);
    }
    
    return { isValid: errors.length === 0, errors };
  };

  const uploadLeads = async (leads: any[]) => {
    const result: UploadResult = { success: 0, failed: 0, errors: [] };
    
    for (let i = 0; i < leads.length; i++) {
      const lead = leads[i];
      const { isValid, errors } = validateLeadData(lead, i + 2); // +2 for header row and 0-based index
      
      if (!isValid) {
        result.failed++;
        result.errors.push({
          row: i + 2,
          error: errors.join(', '),
          data: lead
        });
        continue;
      }
      
      try {
        // Get current user
        const { data: user } = await supabase.auth.getUser();
        if (!user.user) throw new Error('User not authenticated');
        
        const leadData = {
          user_id: user.user.id, // Temporary, should be updated based on requirements
          first_name: lead.first_name,
          last_name: lead.last_name,
          email: lead.email,
          phone: lead.phone || null,
          field_of_interest: lead.field_of_interest || null,
          academic_score: lead.academic_score || null,
          preferred_countries: lead.preferred_countries || null,
          lead_stage: lead.lead_stage || 'hot',
          priority_level: lead.priority_level || 'medium',
          lead_source: lead.lead_source || 'bulk_upload',
          notes: lead.notes || null,
          last_activity_at: new Date().toISOString()
        };
        
        const { error } = await supabase
          .from('student_leads')
          .insert(leadData);
          
        if (error) throw error;
        
        result.success++;
      } catch (error: any) {
        result.failed++;
        result.errors.push({
          row: i + 2,
          error: error.message,
          data: lead
        });
      }
      
      setUploadProgress(((i + 1) / leads.length) * 100);
    }
    
    return result;
  };

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    
    if (!file.name.endsWith('.csv')) {
      toast({
        title: 'Invalid File',
        description: 'Please upload a CSV file',
        variant: 'destructive',
      });
      return;
    }
    
    setUploading(true);
    setUploadProgress(0);
    setUploadResult(null);
    
    try {
      const text = await file.text();
      const leads = parseCSV(text);
      
      if (leads.length === 0) {
        throw new Error('No valid data found in CSV file');
      }
      
      const result = await uploadLeads(leads);
      setUploadResult(result);
      
      toast({
        title: 'Upload Complete',
        description: `${result.success} leads uploaded successfully, ${result.failed} failed`,
        variant: result.failed > 0 ? 'destructive' : 'default',
      });
      
    } catch (error: any) {
      toast({
        title: 'Upload Failed',
        description: error.message,
        variant: 'destructive',
      });
    } finally {
      setUploading(false);
      setUploadProgress(0);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Upload className="h-5 w-5" />
          Bulk Lead Upload
        </CardTitle>
        <CardDescription>
          Upload multiple leads from a CSV file. Download the template to ensure proper formatting.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Download Template */}
        <div className="flex items-center justify-between p-4 border rounded-lg">
          <div className="flex items-center gap-3">
            <FileText className="h-5 w-5 text-muted-foreground" />
            <div>
              <h4 className="font-medium">CSV Template</h4>
              <p className="text-sm text-muted-foreground">
                Download the template with sample data and required columns
              </p>
            </div>
          </div>
          <Button variant="outline" onClick={downloadTemplate}>
            <Download className="h-4 w-4 mr-2" />
            Download Template
          </Button>
        </div>
        
        {/* File Upload */}
        <div className="space-y-4">
          <div className="flex items-center gap-4">
            <Input
              ref={fileInputRef}
              type="file"
              accept=".csv"
              onChange={handleFileUpload}
              disabled={uploading}
              className="flex-1"
            />
            <Button 
              onClick={() => fileInputRef.current?.click()} 
              disabled={uploading}
            >
              {uploading ? 'Uploading...' : 'Select CSV File'}
            </Button>
          </div>
          
          {uploading && (
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span>Uploading leads...</span>
                <span>{Math.round(uploadProgress)}%</span>
              </div>
              <Progress value={uploadProgress} className="h-2" />
            </div>
          )}
        </div>
        
        {/* Upload Results */}
        {uploadResult && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="flex items-center gap-2 p-3 bg-green-50 border border-green-200 rounded-lg">
                <CheckCircle className="h-5 w-5 text-green-600" />
                <div>
                  <div className="font-medium text-green-800">Successful</div>
                  <div className="text-sm text-green-600">{uploadResult.success} leads</div>
                </div>
              </div>
              
              <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-200 rounded-lg">
                <X className="h-5 w-5 text-red-600" />
                <div>
                  <div className="font-medium text-red-800">Failed</div>
                  <div className="text-sm text-red-600">{uploadResult.failed} leads</div>
                </div>
              </div>
            </div>
            
            {uploadResult.errors.length > 0 && (
              <Dialog>
                <DialogTrigger asChild>
                  <Button variant="outline" className="w-full">
                    <AlertCircle className="h-4 w-4 mr-2" />
                    View Error Details ({uploadResult.errors.length})
                  </Button>
                </DialogTrigger>
                <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
                  <DialogHeader>
                    <DialogTitle>Upload Errors</DialogTitle>
                  </DialogHeader>
                  <div className="space-y-4">
                    {uploadResult.errors.map((error, index) => (
                      <div key={index} className="border rounded-lg p-4">
                        <div className="flex items-start justify-between">
                          <div className="flex-1">
                            <div className="flex items-center gap-2 mb-2">
                              <Badge variant="destructive">Row {error.row}</Badge>
                              <span className="text-sm font-medium">Error:</span>
                            </div>
                            <p className="text-sm text-red-600 mb-2">{error.error}</p>
                            {error.data && (
                              <div className="text-xs text-muted-foreground">
                                <strong>Data:</strong> {JSON.stringify(error.data, null, 2)}
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </DialogContent>
              </Dialog>
            )}
          </div>
        )}
        
        <div className="text-xs text-muted-foreground space-y-1">
          <p><strong>Supported columns:</strong> first_name, last_name, email, phone, field_of_interest, academic_score, preferred_countries, lead_stage, priority_level, lead_source, notes</p>
          <p><strong>Required columns:</strong> first_name, last_name, email</p>
          <p><strong>Array fields:</strong> preferred_countries (separate with semicolons)</p>
        </div>
      </CardContent>
    </Card>
  );
}