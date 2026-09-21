import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@student/components/ui/card';
import { Progress } from '@student/components/ui/progress';
import { Badge } from '@student/components/ui/badge';
import { CheckCircle2, Clock, XCircle, AlertCircle, FileText, Target, TrendingUp } from 'lucide-react';
import { Tables } from '@student/integrations/supabase/types';

type Document = Tables<'documents'>;
type DocumentChecklist = Tables<'document_checklists'>;
type StudentProgress = Tables<'student_document_progress'>;

interface DocumentProgressTrackerProps {
  progress: StudentProgress | null;
  checklist: DocumentChecklist[];
  documents: Document[];
  detailed?: boolean;
}

export function DocumentProgressTracker({ 
  progress, 
  checklist, 
  documents, 
  detailed = false 
}: DocumentProgressTrackerProps) {
  const [stats, setStats] = useState({
    totalRequired: 0,
    uploaded: 0,
    approved: 0,
    rejected: 0,
    pending: 0,
    completionPercentage: 0,
    missingDocuments: [] as DocumentChecklist[],
    rejectedDocuments: [] as Document[],
    expiringDocuments: [] as Document[]
  });

  useEffect(() => {
    calculateStats();
  }, [progress, checklist, documents]);

  const calculateStats = () => {
    const requiredDocs = checklist.filter(item => item.is_required);
    const totalRequired = requiredDocs.length;
    
    let uploaded = 0;
    let approved = 0;
    let rejected = 0;
    let pending = 0;
    
    const missingDocuments: DocumentChecklist[] = [];
    const rejectedDocuments: Document[] = [];
    const expiringDocuments: Document[] = [];

    // Check each required document
    requiredDocs.forEach(checklistItem => {
      const userDoc = documents.find(
        doc => doc.document_type === checklistItem.document_type && doc.is_current_version
      );
      
      if (userDoc) {
        uploaded++;
        
        switch (userDoc.status) {
          case 'approved':
            approved++;
            // Check for expiry
            if (userDoc.expiry_date) {
              const expiryDate = new Date(userDoc.expiry_date);
              const today = new Date();
              const daysUntilExpiry = Math.ceil((expiryDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
              
              if (daysUntilExpiry <= 30 && daysUntilExpiry >= 0) {
                expiringDocuments.push(userDoc);
              }
            }
            break;
          case 'rejected':
            rejected++;
            rejectedDocuments.push(userDoc);
            break;
          default:
            pending++;
        }
      } else {
        missingDocuments.push(checklistItem);
      }
    });

    const completionPercentage = totalRequired > 0 ? Math.round((approved / totalRequired) * 100) : 0;

    setStats({
      totalRequired,
      uploaded,
      approved,
      rejected,
      pending,
      completionPercentage,
      missingDocuments,
      rejectedDocuments,
      expiringDocuments
    });
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'approved':
        return <CheckCircle2 className="w-4 h-4 text-success" />;
      case 'rejected':
        return <XCircle className="w-4 h-4 text-destructive" />;
      case 'pending':
        return <Clock className="w-4 h-4 text-warning" />;
      default:
        return <FileText className="w-4 h-4 text-muted-foreground" />;
    }
  };

  const getProgressColor = (percentage: number) => {
    if (percentage >= 80) return 'bg-success';
    if (percentage >= 50) return 'bg-warning';
    return 'bg-destructive';
  };

  if (!checklist.length) {
    return (
      <Card className="glass-card">
        <CardContent className="text-center py-8">
          <Target className="w-12 h-12 mx-auto mb-4 text-muted-foreground opacity-50" />
          <p className="text-muted-foreground">
            Select your country and degree type to see your document progress
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* Main Progress Card */}
      <Card className="glass-card">
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <TrendingUp className="w-5 h-5" />
                Application Progress
              </CardTitle>
              <CardDescription>
                Your document completion status for the selected program
              </CardDescription>
            </div>
            <div className="text-right">
              <div className="text-3xl font-bold">{stats.completionPercentage}%</div>
              <div className="text-sm text-muted-foreground">Complete</div>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <Progress 
            value={stats.completionPercentage} 
            className={`h-3 ${getProgressColor(stats.completionPercentage)}`}
          />
          
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="text-center">
              <div className="text-2xl font-bold text-muted-foreground">{stats.totalRequired}</div>
              <div className="text-xs text-muted-foreground">Required</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-primary">{stats.uploaded}</div>
              <div className="text-xs text-muted-foreground">Uploaded</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-success">{stats.approved}</div>
              <div className="text-xs text-muted-foreground">Approved</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-warning">{stats.pending}</div>
              <div className="text-xs text-muted-foreground">Pending</div>
            </div>
          </div>
        </CardContent>
      </Card>

      {detailed && (
        <>
          {/* Missing Documents Alert */}
          {stats.missingDocuments.length > 0 && (
            <Card className="glass-card border-destructive/20">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-destructive">
                  <AlertCircle className="w-5 h-5" />
                  Missing Required Documents ({stats.missingDocuments.length})
                </CardTitle>
                <CardDescription>
                  These documents are required for your application
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {stats.missingDocuments.map((doc) => (
                    <div key={doc.id} className="flex items-center justify-between p-3 bg-destructive/5 rounded-lg border border-destructive/10">
                      <div>
                        <div className="font-medium">{doc.document_type}</div>
                        <div className="text-sm text-muted-foreground">{doc.description}</div>
                      </div>
                      <Badge variant="destructive">Missing</Badge>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Rejected Documents Alert */}
          {stats.rejectedDocuments.length > 0 && (
            <Card className="glass-card border-warning/20">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-warning">
                  <XCircle className="w-5 h-5" />
                  Rejected Documents ({stats.rejectedDocuments.length})
                </CardTitle>
                <CardDescription>
                  These documents need to be re-uploaded with corrections
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {stats.rejectedDocuments.map((doc) => (
                    <div key={doc.id} className="flex items-center justify-between p-3 bg-warning/5 rounded-lg border border-warning/10">
                      <div>
                        <div className="font-medium">{doc.document_type}</div>
                        <div className="text-sm text-muted-foreground">{doc.file_name}</div>
                        {doc.admin_comments && (
                          <div className="text-sm text-warning mt-1">
                            <strong>Reason:</strong> {doc.admin_comments}
                          </div>
                        )}
                      </div>
                      <Badge variant="outline" className="bg-warning/10 text-warning border-warning/20">
                        Rejected
                      </Badge>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Expiring Documents Alert */}
          {stats.expiringDocuments.length > 0 && (
            <Card className="glass-card border-warning/20">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-warning">
                  <Clock className="w-5 h-5" />
                  Documents Expiring Soon ({stats.expiringDocuments.length})
                </CardTitle>
                <CardDescription>
                  These documents will expire within 30 days
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {stats.expiringDocuments.map((doc) => {
                    const expiryDate = new Date(doc.expiry_date!);
                    const daysLeft = Math.ceil((expiryDate.getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24));
                    
                    return (
                      <div key={doc.id} className="flex items-center justify-between p-3 bg-warning/5 rounded-lg border border-warning/10">
                        <div>
                          <div className="font-medium">{doc.document_type}</div>
                          <div className="text-sm text-muted-foreground">{doc.file_name}</div>
                          <div className="text-sm text-warning">
                            Expires on {expiryDate.toLocaleDateString()}
                          </div>
                        </div>
                        <Badge variant="outline" className="bg-warning/10 text-warning border-warning/20">
                          {daysLeft} days left
                        </Badge>
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Document Status Overview */}
          <Card className="glass-card">
            <CardHeader>
              <CardTitle>Document Status Overview</CardTitle>
              <CardDescription>
                Detailed status of all your documents
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {checklist.map((checklistItem) => {
                  const userDoc = documents.find(
                    doc => doc.document_type === checklistItem.document_type && doc.is_current_version
                  );
                  
                  return (
                    <div key={checklistItem.id} className="flex items-center justify-between p-3 rounded-lg border border-border/20">
                      <div className="flex items-center gap-3">
                        {getStatusIcon(userDoc?.status || 'missing')}
                        <div>
                          <div className="font-medium flex items-center gap-2">
                            {checklistItem.document_type}
                            {checklistItem.is_required && (
                              <Badge variant="outline" className="text-xs">Required</Badge>
                            )}
                          </div>
                          {userDoc && (
                            <div className="text-sm text-muted-foreground">
                              {userDoc.file_name} • v{userDoc.version_number}
                            </div>
                          )}
                        </div>
                      </div>
                      
                      <div className="flex items-center gap-2">
                        {userDoc ? (
                          <>
                            {getStatusIcon(userDoc.status)}
                            <Badge 
                              variant="outline" 
                              className={
                                userDoc.status === 'approved' ? 'bg-success/10 text-success border-success/20' :
                                userDoc.status === 'rejected' ? 'bg-destructive/10 text-destructive border-destructive/20' :
                                'bg-warning/10 text-warning border-warning/20'
                              }
                            >
                              {userDoc.status.charAt(0).toUpperCase() + userDoc.status.slice(1)}
                            </Badge>
                          </>
                        ) : (
                          <Badge variant="outline" className="bg-muted/10 text-muted-foreground border-muted/20">
                            Not Uploaded
                          </Badge>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}