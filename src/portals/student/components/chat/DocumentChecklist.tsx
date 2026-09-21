import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@student/components/ui/card';
import { Checkbox } from '@student/components/ui/checkbox';
import { Badge } from '@student/components/ui/badge';  
import { Button } from '@student/components/ui/button';
import { FileText, Download, CheckCircle, AlertCircle } from 'lucide-react';

interface DocumentChecklistProps {
  country: string;
  educationLevel: string;
}

const DocumentChecklist: React.FC<DocumentChecklistProps> = ({ country, educationLevel }) => {
  const [checkedItems, setCheckedItems] = useState<{ [key: string]: boolean }>({});

  const getDocuments = () => {
    const baseDocuments = [
      { id: 'passport', name: 'Valid Passport', required: true, description: 'Must be valid for at least 6 months' },
      { id: 'photos', name: 'Passport-sized Photos', required: true, description: 'Recent color photographs as per visa requirements' },
      { id: 'academic', name: 'Academic Transcripts', required: true, description: 'Official transcripts from your previous institution' },
      { id: 'degree', name: 'Degree Certificate', required: educationLevel === 'PG', description: 'Original degree certificate for postgraduate applications' },
      { id: 'english', name: 'English Proficiency Test', required: true, description: 'IELTS/TOEFL/PTE scores' },
    ];

    const countrySpecific: { [key: string]: any[] } = {
      'USA': [
        { id: 'gre', name: 'GRE/GMAT Scores', required: educationLevel === 'PG', description: 'Required for most graduate programs' },
        { id: 'i20', name: 'I-20 Form', required: false, description: 'Will be provided by university after admission' },
        { id: 'financial', name: 'Financial Documents', required: true, description: 'Bank statements, scholarship letters, etc.' },
      ],
      'Canada': [
        { id: 'sop', name: 'Statement of Purpose', required: true, description: 'Detailed essay about your goals' },
        { id: 'financial', name: 'Proof of Funds', required: true, description: 'CAD $10,000+ for tuition and living' },
        { id: 'medical', name: 'Medical Examination', required: false, description: 'May be required for study permit' },
      ],
      'UK': [
        { id: 'cas', name: 'CAS Letter', required: false, description: 'Confirmation of Acceptance for Studies' },
        { id: 'financial', name: 'Financial Evidence', required: true, description: 'Bank statements for visa application' },
        { id: 'tb', name: 'TB Test', required: false, description: 'Required for stays longer than 6 months' },
      ],
      'Australia': [
        { id: 'coe', name: 'CoE (Confirmation of Enrollment)', required: false, description: 'Issued by university after admission' },
        { id: 'health', name: 'Health Insurance (OSHC)', required: true, description: 'Overseas Student Health Cover' },
        { id: 'financial', name: 'Financial Capacity', required: true, description: 'AUD $21,041+ per year proof' },
      ],
    };

    return [...baseDocuments, ...(countrySpecific[country] || countrySpecific['USA'])];
  };

  const documents = getDocuments();
  const checkedCount = Object.values(checkedItems).filter(Boolean).length;
  const requiredCount = documents.filter(doc => doc.required).length;
  const completionRate = Math.round((checkedCount / documents.length) * 100);

  const handleCheck = (id: string) => {
    setCheckedItems(prev => ({ ...prev, [id]: !prev[id] }));
  };

  return (
    <Card className="border-l-4 border-l-blue-500">
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <FileText className="w-5 h-5 text-blue-600" />
            📋 Document Checklist for {country}
          </CardTitle>
          <Badge variant={completionRate === 100 ? "default" : "secondary"}>
            {checkedCount}/{documents.length} Complete
          </Badge>
        </div>
        <div className="w-full bg-gray-200 rounded-full h-2">
          <div 
            className="bg-blue-600 h-2 rounded-full transition-all duration-300" 
            style={{ width: `${completionRate}%` }}
          ></div>
        </div>
      </CardHeader>
      
      <CardContent className="space-y-4">
        {documents.map((doc) => (
          <div key={doc.id} className="flex items-start space-x-3 p-3 rounded-lg border border-gray-100 hover:border-blue-200 transition-colors">
            <Checkbox
              id={doc.id}
              checked={checkedItems[doc.id] || false}
              onCheckedChange={() => handleCheck(doc.id)}
              className="mt-0.5"
            />
            <div className="flex-1 space-y-1">
              <label
                htmlFor={doc.id}
                className={`text-sm font-medium cursor-pointer flex items-center gap-2 ${
                  checkedItems[doc.id] ? 'line-through text-muted-foreground' : 'text-foreground'
                }`}
              >
                {doc.name}
                {doc.required ? (
                  <AlertCircle className="w-4 h-4 text-red-500" />
                ) : (
                  <CheckCircle className="w-4 h-4 text-green-500" />
                )}
              </label>
              <p className="text-xs text-muted-foreground">{doc.description}</p>
            </div>
          </div>
        ))}
        
        <div className="pt-4 border-t">
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">
              <strong>{requiredCount}</strong> documents are mandatory
            </span>
            <Button variant="outline" size="sm" className="text-xs">
              <Download className="w-3 h-3 mr-1" />
              Download PDF Checklist  
            </Button>
          </div>
        </div>
        
        {completionRate === 100 && (
          <div className="p-3 bg-green-50 dark:bg-green-950/20 rounded-lg border border-green-200 dark:border-green-800">
            <div className="flex items-center gap-2 text-green-700 dark:text-green-400">
              <CheckCircle className="w-4 h-4" />
              <span className="text-sm font-medium">Great! You've checked all documents. Contact our counselors to verify your paperwork.</span>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default DocumentChecklist;