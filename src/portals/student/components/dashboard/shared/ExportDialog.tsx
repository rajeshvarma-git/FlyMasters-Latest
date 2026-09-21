import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@student/components/ui/dialog';
import { Button } from '@student/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@student/components/ui/select';
import { Input } from '@student/components/ui/input';
import { Label } from '@student/components/ui/label';
import { Checkbox } from '@student/components/ui/checkbox';
import { useToast } from '@student/components/ui/use-toast';
import { Download, FileText, Table } from 'lucide-react';
import { format } from 'date-fns';

interface ExportOptions {
  format: 'csv' | 'pdf';
  dateRange: 'all' | 'week' | 'month' | '3months' | 'custom';
  startDate?: string;
  endDate?: string;
  includeFields: string[];
  filterBy?: {
    stage?: string;
    priority?: string;
    counselor?: string;
  };
}

interface Props {
  title: string;
  type: 'leads' | 'analytics' | 'logs' | 'notes';
  onExport: (options: ExportOptions) => Promise<void>;
  availableFields: { key: string; label: string; }[];
  children: React.ReactNode;
}

export function ExportDialog({ title, type, onExport, availableFields, children }: Props) {
  const [open, setOpen] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [options, setOptions] = useState<ExportOptions>({
    format: 'csv',
    dateRange: 'month',
    includeFields: availableFields.slice(0, 5).map(f => f.key), // Default first 5 fields
    filterBy: {}
  });
  const { toast } = useToast();

  const handleExport = async () => {
    setExporting(true);
    try {
      await onExport(options);
      toast({
        title: 'Export Started',
        description: 'Your file will be ready for download shortly.',
      });
      setOpen(false);
    } catch (error: any) {
      toast({
        title: 'Export Failed',
        description: error.message || 'Failed to export data',
        variant: 'destructive',
      });
    } finally {
      setExporting(false);
    }
  };

  const handleFieldToggle = (fieldKey: string, checked: boolean) => {
    setOptions(prev => ({
      ...prev,
      includeFields: checked 
        ? [...prev.includeFields, fieldKey]
        : prev.includeFields.filter(f => f !== fieldKey)
    }));
  };

  const getDateRangeLabel = (range: string) => {
    switch (range) {
      case 'all': return 'All Time';
      case 'week': return 'Last 7 Days';
      case 'month': return 'Last 30 Days';
      case '3months': return 'Last 3 Months';
      case 'custom': return 'Custom Range';
      default: return range;
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {children}
      </DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Download className="h-5 w-5" />
            Export {title}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-6">
          {/* Format Selection */}
          <div>
            <Label className="text-sm font-medium">Export Format</Label>
            <Select 
              value={options.format} 
              onValueChange={(value: 'csv' | 'pdf') => 
                setOptions(prev => ({ ...prev, format: value }))
              }
            >
              <SelectTrigger className="mt-2">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="csv">
                  <div className="flex items-center gap-2">
                    <Table className="h-4 w-4" />
                    CSV Spreadsheet
                  </div>
                </SelectItem>
                <SelectItem value="pdf">
                  <div className="flex items-center gap-2">
                    <FileText className="h-4 w-4" />
                    PDF Report
                  </div>
                </SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Date Range */}
          <div>
            <Label className="text-sm font-medium">Date Range</Label>
            <Select 
              value={options.dateRange} 
              onValueChange={(value: any) => 
                setOptions(prev => ({ ...prev, dateRange: value }))
              }
            >
              <SelectTrigger className="mt-2">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Time</SelectItem>
                <SelectItem value="week">Last 7 Days</SelectItem>
                <SelectItem value="month">Last 30 Days</SelectItem>
                <SelectItem value="3months">Last 3 Months</SelectItem>
                <SelectItem value="custom">Custom Range</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Custom Date Range */}
          {options.dateRange === 'custom' && (
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label className="text-sm font-medium">Start Date</Label>
                <Input
                  type="date"
                  value={options.startDate || ''}
                  onChange={(e) => setOptions(prev => ({ ...prev, startDate: e.target.value }))}
                  className="mt-2"
                />
              </div>
              <div>
                <Label className="text-sm font-medium">End Date</Label>
                <Input
                  type="date"
                  value={options.endDate || ''}
                  onChange={(e) => setOptions(prev => ({ ...prev, endDate: e.target.value }))}
                  className="mt-2"
                />
              </div>
            </div>
          )}

          {/* Fields Selection */}
          <div>
            <Label className="text-sm font-medium mb-3 block">
              Include Fields ({options.includeFields.length} selected)
            </Label>
            <div className="max-h-40 overflow-y-auto border rounded-md p-3">
              <div className="space-y-2">
                {availableFields.map(field => (
                  <div key={field.key} className="flex items-center space-x-2">
                    <Checkbox
                      id={field.key}
                      checked={options.includeFields.includes(field.key)}
                      onCheckedChange={(checked) => 
                        handleFieldToggle(field.key, checked as boolean)
                      }
                    />
                    <Label htmlFor={field.key} className="text-sm font-normal">
                      {field.label}
                    </Label>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Additional Filters for specific types */}
          {type === 'leads' && (
            <div>
              <Label className="text-sm font-medium mb-3 block">Filters (Optional)</Label>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Select 
                    value={options.filterBy?.stage || 'all'} 
                    onValueChange={(value) => 
                      setOptions(prev => ({ 
                        ...prev, 
                        filterBy: { ...prev.filterBy, stage: value === 'all' ? undefined : value }
                      }))
                    }
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="All Stages" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Stages</SelectItem>
                      <SelectItem value="hot">Hot</SelectItem>
                      <SelectItem value="warm">Warm</SelectItem>
                      <SelectItem value="cold">Cold</SelectItem>
                      <SelectItem value="converted">Converted</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Select 
                    value={options.filterBy?.priority || 'all'} 
                    onValueChange={(value) => 
                      setOptions(prev => ({ 
                        ...prev, 
                        filterBy: { ...prev.filterBy, priority: value === 'all' ? undefined : value }
                      }))
                    }
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="All Priorities" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Priorities</SelectItem>
                      <SelectItem value="high">High</SelectItem>
                      <SelectItem value="medium">Medium</SelectItem>
                      <SelectItem value="low">Low</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>
          )}

          {/* Export Actions */}
          <div className="flex gap-3 pt-4 border-t">
            <Button 
              onClick={handleExport} 
              disabled={exporting || options.includeFields.length === 0}
              className="flex-1"
            >
              {exporting ? (
                <>
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                  Exporting...
                </>
              ) : (
                <>
                  <Download className="h-4 w-4 mr-2" />
                  Export {options.format.toUpperCase()}
                </>
              )}
            </Button>
            <Button variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
          </div>

          {/* Export Summary */}
          <div className="text-xs text-muted-foreground bg-muted/50 p-3 rounded-lg">
            <div className="font-medium mb-1">Export Summary:</div>
            <div>Format: {options.format.toUpperCase()}</div>
            <div>Range: {getDateRangeLabel(options.dateRange)}</div>
            <div>Fields: {options.includeFields.length} selected</div>
            {options.filterBy?.stage && <div>Stage: {options.filterBy.stage}</div>}
            {options.filterBy?.priority && <div>Priority: {options.filterBy.priority}</div>}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}