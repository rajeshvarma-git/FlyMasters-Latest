import { useState, useRef } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@student/components/ui/card';
import { Button } from '@student/components/ui/button';
import { Label } from '@student/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@student/components/ui/select';
import { Progress } from '@student/components/ui/progress';
import { Badge } from '@student/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@student/components/ui/table';
import { Upload, FileText, CheckCircle, AlertCircle, X, Download } from 'lucide-react';
import { supabase } from '@student/integrations/supabase/client';
import { toast } from 'sonner';

export function StudentDataUploader() {
  const [campaigns, setCampaigns] = useState([]);
  const [selectedCampaign, setSelectedCampaign] = useState('');
  const [uploadedFile, setUploadedFile] = useState(null);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [isProcessing, setIsProcessing] = useState(false);
  const [previewData, setPreviewData] = useState<Record<string, string>[]>([]);
  const [fieldMapping, setFieldMapping] = useState<Record<string, string>>({});
  const [validationResults, setValidationResults] = useState<{
    totalRecords: number;
    validRecords: number;
    duplicates: number;
    missingRequired: number;
    invalidEmails: number;
    invalidPhones: number;
    issues: Array<{
      row: number;
      type: string;
      field: string;
      message: string;
    }>;
  } | null>(null);
  const fileInputRef = useRef(null);

  const requiredFields = [
    { key: 'first_name', label: 'First Name', required: true },
    { key: 'last_name', label: 'Last Name', required: false },
    { key: 'phone', label: 'Phone Number', required: true },
    { key: 'email', label: 'Email Address', required: true },
    { key: 'country', label: 'Current Country', required: false },
    { key: 'destination_country', label: 'Destination Country', required: false },
    { key: 'field_of_interest', label: 'Field of Interest', required: false },
    { key: 'qualification_level', label: 'Qualification Level', required: false }
  ];

  const handleFileUpload = async (event) => {
    const file = event.target.files[0];
    if (!file) return;

    // Validate file type
    const allowedTypes = [
      'text/csv',
      'application/vnd.ms-excel',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    ];
    
    if (!allowedTypes.includes(file.type)) {
      toast.error('Please upload a CSV or Excel file');
      return;
    }

    setUploadedFile(file);
    setIsProcessing(true);
    setUploadProgress(0);

    try {
      // Simulate file processing
      const progressInterval = setInterval(() => {
        setUploadProgress(prev => {
          if (prev >= 90) {
            clearInterval(progressInterval);
            return 90;
          }
          return prev + 10;
        });
      }, 200);

      // Parse file (simplified - in real implementation, use a proper CSV/Excel parser)
      const text = await file.text();
      const lines = text.split('\n');
      const headers = lines[0].split(',').map(h => h.trim().replace(/"/g, ''));
      
      const sampleData = lines.slice(1, 6).map(line => {
        const values = line.split(',').map(v => v.trim().replace(/"/g, ''));
        const row: Record<string, string> = {};
        headers.forEach((header, index) => {
          row[header] = values[index] || '';
        });
        return row;
      });

      setPreviewData(sampleData);
      
      // Auto-map fields
      const autoMapping: Record<string, string> = {};
      headers.forEach(header => {
        const normalizedHeader = header.toLowerCase().replace(/[^a-z]/g, '');
        const field = requiredFields.find(f => 
          normalizedHeader.includes(f.key.replace('_', '')) ||
          f.label.toLowerCase().replace(/[^a-z]/g, '').includes(normalizedHeader)
        );
        if (field) {
          autoMapping[field.key] = header;
        }
      });
      
      setFieldMapping(autoMapping);
      setUploadProgress(100);
      setIsProcessing(false);
      
      toast.success(`File uploaded successfully! Found ${lines.length - 1} records.`);
    } catch (error) {
      console.error('Error processing file:', error);
      toast.error('Error processing file');
      setIsProcessing(false);
    }
  };

  const validateData = () => {
    if (!previewData.length) return;

    const results = {
      totalRecords: previewData.length,
      validRecords: 0,
      duplicates: 0,
      missingRequired: 0,
      invalidEmails: 0,
      invalidPhones: 0,
      issues: []
    };

    previewData.forEach((record, index) => {
      let hasIssues = false;
      
      // Check required fields
      requiredFields.filter(f => f.required).forEach(field => {
        const mappedField = fieldMapping[field.key];
        if (!mappedField || !record[mappedField]) {
          hasIssues = true;
          results.missingRequired++;
          results.issues.push({
            row: index + 1,
            type: 'missing_required',
            field: field.label,
            message: `Missing required field: ${field.label}`
          });
        }
      });

      // Validate email format
      const emailField = fieldMapping.email;
      if (emailField && record[emailField]) {
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(record[emailField])) {
          hasIssues = true;
          results.invalidEmails++;
          results.issues.push({
            row: index + 1,
            type: 'invalid_email',
            field: 'Email',
            message: 'Invalid email format'
          });
        }
      }

      // Validate phone format
      const phoneField = fieldMapping.phone;
      if (phoneField && record[phoneField]) {
        const phoneRegex = /^\+?[\d\s\-\(\)]{10,}$/;
        if (!phoneRegex.test(record[phoneField])) {
          hasIssues = true;
          results.invalidPhones++;
          results.issues.push({
            row: index + 1,
            type: 'invalid_phone',
            field: 'Phone',
            message: 'Invalid phone format'
          });
        }
      }

      if (!hasIssues) {
        results.validRecords++;
      }
    });

    setValidationResults(results);
    toast.info(`Validation complete: ${results.validRecords}/${results.totalRecords} valid records`);
  };

  const importData = async () => {
    if (!selectedCampaign || !previewData.length) {
      toast.error('Please select a campaign and upload data');
      return;
    }

    try {
      setIsProcessing(true);
      
      const recordsToImport = previewData.map(record => ({
        campaign_id: selectedCampaign,
        first_name: record[fieldMapping.first_name] || '',
        last_name: record[fieldMapping.last_name] || '',
        phone: record[fieldMapping.phone] || '',
        email: record[fieldMapping.email] || '',
        country: record[fieldMapping.country] || '',
        destination_country: record[fieldMapping.destination_country] || '',
        field_of_interest: record[fieldMapping.field_of_interest] || '',
        qualification_level: record[fieldMapping.qualification_level] || '',
        consent_given: true, // Assume consent for uploaded data
        lead_source: 'upload'
      }));

      const { data, error } = await supabase
        .from('marketing_leads')
        .insert(recordsToImport)
        .select();

      if (error) throw error;

      toast.success(`Successfully imported ${data.length} records!`);
      
      // Reset form
      setUploadedFile(null);
      setPreviewData([]);
      setFieldMapping({});
      setValidationResults(null);
      setUploadProgress(0);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
      
    } catch (error) {
      console.error('Error importing data:', error);
      toast.error('Failed to import data');
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold">Student Data Upload</h2>
        <p className="text-muted-foreground">Import student data from CSV or Excel files</p>
      </div>

      {/* Campaign Selection */}
      <Card className="glass-card">
        <CardHeader>
          <CardTitle>Select Campaign</CardTitle>
          <CardDescription>Choose which campaign to upload data for</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Target Campaign</Label>
              <Select value={selectedCampaign} onValueChange={setSelectedCampaign}>
                <SelectTrigger>
                  <SelectValue placeholder="Select a campaign" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="demo-campaign">Demo Campaign</SelectItem>
                  {/* Add actual campaigns here */}
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* File Upload */}
      <Card className="glass-card">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Upload className="w-5 h-5" />
            Upload File
          </CardTitle>
          <CardDescription>Upload CSV or Excel file with student data</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div 
              className="border-2 border-dashed border-muted rounded-lg p-8 text-center cursor-pointer hover:border-primary transition-colors"
              onClick={() => fileInputRef.current?.click()}
            >
              <FileText className="w-12 h-12 mx-auto mb-4 text-muted-foreground" />
              <p className="text-lg font-medium mb-2">
                {uploadedFile ? uploadedFile.name : 'Click to upload file'}
              </p>
              <p className="text-sm text-muted-foreground">
                Supports CSV, XLS, and XLSX files up to 10MB
              </p>
              <input
                ref={fileInputRef}
                type="file"
                accept=".csv,.xls,.xlsx"
                className="hidden"
                onChange={handleFileUpload}
              />
            </div>

            {isProcessing && (
              <div className="space-y-2">
                <div className="flex items-center justify-between text-sm">
                  <span>Processing file...</span>
                  <span>{uploadProgress}%</span>
                </div>
                <Progress value={uploadProgress} />
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Field Mapping */}
      {previewData.length > 0 && (
        <Card className="glass-card">
          <CardHeader>
            <CardTitle>Field Mapping</CardTitle>
            <CardDescription>Map your file columns to our system fields</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="grid gap-4 md:grid-cols-2">
                {requiredFields.map(field => (
                  <div key={field.key} className="space-y-2">
                    <Label className="flex items-center gap-2">
                      {field.label}
                      {field.required && <Badge variant="destructive" className="text-xs">Required</Badge>}
                    </Label>
                    <Select 
                      value={fieldMapping[field.key] || ''} 
                      onValueChange={(value) => setFieldMapping(prev => ({...prev, [field.key]: value}))}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select column" />
                      </SelectTrigger>
                      <SelectContent>
                        {Object.keys(previewData[0] || {}).map(column => (
                          <SelectItem key={column} value={column}>
                            {column}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                ))}
              </div>
              
              <div className="flex items-center gap-3">
                <Button onClick={validateData} variant="outline">
                  <CheckCircle className="w-4 h-4 mr-2" />
                  Validate Data
                </Button>
                {validationResults && (
                  <Button onClick={importData} disabled={isProcessing}>
                    Import {validationResults.validRecords} Records
                  </Button>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Validation Results */}
      {validationResults && (
        <Card className="glass-card">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <CheckCircle className="w-5 h-5" />
              Validation Results
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="grid gap-4 md:grid-cols-4">
                <div className="text-center">
                  <div className="text-2xl font-bold text-primary">{validationResults.totalRecords}</div>
                  <div className="text-sm text-muted-foreground">Total Records</div>
                </div>
                <div className="text-center">
                  <div className="text-2xl font-bold text-green-500">{validationResults.validRecords}</div>
                  <div className="text-sm text-muted-foreground">Valid Records</div>
                </div>
                <div className="text-center">
                  <div className="text-2xl font-bold text-orange-500">{validationResults.missingRequired}</div>
                  <div className="text-sm text-muted-foreground">Missing Required</div>
                </div>
                <div className="text-center">
                  <div className="text-2xl font-bold text-red-500">{validationResults.invalidEmails + validationResults.invalidPhones}</div>
                  <div className="text-sm text-muted-foreground">Invalid Formats</div>
                </div>
              </div>

              {validationResults.issues.length > 0 && (
                <div className="space-y-2">
                  <h4 className="font-medium">Issues Found:</h4>
                  <div className="max-h-48 overflow-y-auto">
                    {validationResults.issues.slice(0, 10).map((issue, index) => (
                      <div key={index} className="flex items-center gap-2 text-sm p-2 bg-muted rounded">
                        <AlertCircle className="w-4 h-4 text-orange-500" />
                        <span>Row {issue.row}: {issue.message}</span>
                      </div>
                    ))}
                    {validationResults.issues.length > 10 && (
                      <p className="text-sm text-muted-foreground">
                        And {validationResults.issues.length - 10} more issues...
                      </p>
                    )}
                  </div>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Data Preview */}
      {previewData.length > 0 && (
        <Card className="glass-card">
          <CardHeader>
            <CardTitle>Data Preview</CardTitle>
            <CardDescription>First 5 rows of your uploaded data</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    {Object.keys(previewData[0] || {}).map(column => (
                      <TableHead key={column}>{column}</TableHead>
                    ))}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {previewData.map((row, index) => (
                    <TableRow key={index}>
                      {Object.values(row).map((value, cellIndex) => (
                        <TableCell key={cellIndex} className="max-w-32 truncate">
                          {String(value)}
                        </TableCell>
                      ))}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}