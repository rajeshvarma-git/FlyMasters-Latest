import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@student/integrations/supabase/client';
import { Card } from '@student/components/ui/card';
import { Button } from '@student/components/ui/button';
import { Input } from '@student/components/ui/input';
import { Label } from '@student/components/ui/label';
import { Textarea } from '@student/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@student/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@student/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@student/components/ui/table';
import { Badge } from '@student/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@student/components/ui/tabs';
import { toast } from 'sonner';
import { FileText, Upload, CheckCircle, XCircle, Clock, AlertTriangle, Download, Eye } from 'lucide-react';

export default function TravelDocumentManagementAdmin() {
  const queryClient = useQueryClient();
  const [selectedBooking, setSelectedBooking] = useState<string>('');
  const [showRequirementDialog, setShowRequirementDialog] = useState(false);
  const [selectedDocument, setSelectedDocument] = useState<any>(null);

  const { data: bookings } = useQuery({
    queryKey: ['bookings-for-documents'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('package_bookings')
        .select('id, booking_reference, full_name, travel_packages(package_name)')
        .order('created_at', { ascending: false })
        .limit(50);
      if (error) throw error;
      return data;
    },
  });

  const { data: documentRequirements } = useQuery({
    queryKey: ['document-requirements', selectedBooking],
    queryFn: async () => {
      if (!selectedBooking) return [];
      const { data, error } = await supabase
        .from('travel_document_requirements')
        .select('*')
        .eq('booking_id', selectedBooking)
        .order('display_order');
      if (error) throw error;
      return data;
    },
    enabled: !!selectedBooking,
  });

  const { data: documentUploads } = useQuery({
    queryKey: ['document-uploads', selectedBooking],
    queryFn: async () => {
      if (!selectedBooking) return [];
      const { data, error } = await supabase
        .from('travel_document_uploads')
        .select('*, profiles(first_name, last_name)')
        .eq('booking_id', selectedBooking)
        .order('created_at', { ascending: false});
      if (error) throw error;
      return data;
    },
    enabled: !!selectedBooking,
  });

  const addRequirement = useMutation({
    mutationFn: async (requirement: any) => {
      const { error } = await supabase
        .from('travel_document_requirements')
        .insert({ ...requirement, booking_id: selectedBooking });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['document-requirements'] });
      toast.success('Requirement added');
      setShowRequirementDialog(false);
    },
    onError: () => toast.error('Failed to add requirement'),
  });

  const updateDocumentStatus = useMutation({
    mutationFn: async ({ id, status, notes }: any) => {
      const { data: user } = await supabase.auth.getUser();
      const { error } = await supabase
        .from('travel_document_uploads')
        .update({
          verification_status: status,
          verified_by: user.user?.id,
          verified_at: new Date().toISOString(),
          rejection_reason: status === 'rejected' ? notes : null,
          notes,
        })
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['document-uploads'] });
      toast.success('Document status updated');
    },
    onError: () => toast.error('Failed to update status'),
  });

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'verified':
        return <CheckCircle className="w-4 h-4 text-green-600" />;
      case 'rejected':
        return <XCircle className="w-4 h-4 text-red-600" />;
      case 'expired':
        return <AlertTriangle className="w-4 h-4 text-orange-600" />;
      default:
        return <Clock className="w-4 h-4 text-gray-600" />;
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'verified':
        return 'bg-green-500';
      case 'rejected':
        return 'bg-red-500';
      case 'expired':
        return 'bg-orange-500';
      default:
        return 'bg-gray-500';
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-3xl font-bold">Document Management</h2>
          <p className="text-muted-foreground">Manage travel documents and verification workflow</p>
        </div>
      </div>

      {/* Booking Selector */}
      <Card className="p-4">
        <div className="flex gap-4 items-end">
          <div className="flex-1">
            <Label>Select Booking</Label>
            <Select value={selectedBooking} onValueChange={setSelectedBooking}>
              <SelectTrigger>
                <SelectValue placeholder="Choose a booking to manage documents" />
              </SelectTrigger>
              <SelectContent>
                {bookings?.map((booking: any) => (
                  <SelectItem key={booking.id} value={booking.id}>
                    {booking.booking_reference} - {booking.full_name} ({booking.travel_packages?.package_name})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {selectedBooking && (
            <Button variant="outline" onClick={() => setSelectedBooking('')}>
              Clear Selection
            </Button>
          )}
        </div>
      </Card>

      {selectedBooking && (
        <Tabs defaultValue="uploads" className="space-y-4">
          <TabsList>
            <TabsTrigger value="uploads">Uploaded Documents</TabsTrigger>
            <TabsTrigger value="requirements">Requirements</TabsTrigger>
            <TabsTrigger value="verification">Verification</TabsTrigger>
          </TabsList>

          <TabsContent value="uploads" className="space-y-4">
            <Card>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Document Type</TableHead>
                    <TableHead>File Name</TableHead>
                    <TableHead>Uploaded By</TableHead>
                    <TableHead>Upload Date</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {documentUploads?.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center">No documents uploaded yet</TableCell>
                    </TableRow>
                  ) : (
                    documentUploads?.map((doc: any) => (
                      <TableRow key={doc.id}>
                        <TableCell className="font-medium">{doc.document_type}</TableCell>
                        <TableCell>{doc.file_name}</TableCell>
                        <TableCell>
                          {doc.profiles ? `${doc.profiles.first_name} ${doc.profiles.last_name}` : 'Unknown'}
                        </TableCell>
                        <TableCell>{new Date(doc.created_at).toLocaleDateString()}</TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            {getStatusIcon(doc.verification_status)}
                            <Badge className={getStatusColor(doc.verification_status)}>
                              {doc.verification_status}
                            </Badge>
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="flex gap-2">
                            <Button size="sm" variant="ghost">
                              <Eye className="w-4 h-4" />
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => setSelectedDocument(doc)}
                            >
                              Verify
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </Card>
          </TabsContent>

          <TabsContent value="requirements" className="space-y-4">
            <div className="flex justify-end">
              <Button onClick={() => setShowRequirementDialog(true)}>
                Add Requirement
              </Button>
            </div>

            <Card>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Document Type</TableHead>
                    <TableHead>Description</TableHead>
                    <TableHead>Required</TableHead>
                    <TableHead>Max Size</TableHead>
                    <TableHead>Formats</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {documentRequirements?.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={5} className="text-center">
                        No requirements set. Add requirements to get started.
                      </TableCell>
                    </TableRow>
                  ) : (
                    documentRequirements?.map((req: any) => (
                      <TableRow key={req.id}>
                        <TableCell className="font-medium">{req.document_type}</TableCell>
                        <TableCell>{req.description || 'N/A'}</TableCell>
                        <TableCell>
                          <Badge variant={req.is_required ? 'default' : 'secondary'}>
                            {req.is_required ? 'Required' : 'Optional'}
                          </Badge>
                        </TableCell>
                        <TableCell>{req.max_size_mb} MB</TableCell>
                        <TableCell>
                          <div className="flex flex-wrap gap-1">
                            {req.allowed_formats?.map((format: string) => (
                              <Badge key={format} variant="outline" className="text-xs">
                                {format}
                              </Badge>
                            ))}
                          </div>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </Card>
          </TabsContent>

          <TabsContent value="verification" className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <Card className="p-6">
                <div className="flex items-center gap-3">
                  <Clock className="w-8 h-8 text-gray-600" />
                  <div>
                    <p className="text-sm text-muted-foreground">Pending</p>
                    <h3 className="text-2xl font-bold">
                      {documentUploads?.filter(d => d.verification_status === 'pending').length || 0}
                    </h3>
                  </div>
                </div>
              </Card>

              <Card className="p-6">
                <div className="flex items-center gap-3">
                  <CheckCircle className="w-8 h-8 text-green-600" />
                  <div>
                    <p className="text-sm text-muted-foreground">Verified</p>
                    <h3 className="text-2xl font-bold">
                      {documentUploads?.filter(d => d.verification_status === 'verified').length || 0}
                    </h3>
                  </div>
                </div>
              </Card>

              <Card className="p-6">
                <div className="flex items-center gap-3">
                  <XCircle className="w-8 h-8 text-red-600" />
                  <div>
                    <p className="text-sm text-muted-foreground">Rejected</p>
                    <h3 className="text-2xl font-bold">
                      {documentUploads?.filter(d => d.verification_status === 'rejected').length || 0}
                    </h3>
                  </div>
                </div>
              </Card>

              <Card className="p-6">
                <div className="flex items-center gap-3">
                  <AlertTriangle className="w-8 h-8 text-orange-600" />
                  <div>
                    <p className="text-sm text-muted-foreground">Expired</p>
                    <h3 className="text-2xl font-bold">
                      {documentUploads?.filter(d => d.verification_status === 'expired').length || 0}
                    </h3>
                  </div>
                </div>
              </Card>
            </div>
          </TabsContent>
        </Tabs>
      )}

      {/* Add Requirement Dialog */}
      <Dialog open={showRequirementDialog} onOpenChange={setShowRequirementDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Document Requirement</DialogTitle>
          </DialogHeader>
          <RequirementForm
            onSubmit={(data: any) => addRequirement.mutate(data)}
            onCancel={() => setShowRequirementDialog(false)}
          />
        </DialogContent>
      </Dialog>

      {/* Verification Dialog */}
      <Dialog open={!!selectedDocument} onOpenChange={() => setSelectedDocument(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Verify Document</DialogTitle>
          </DialogHeader>
          <VerificationForm
            document={selectedDocument}
            onSubmit={(data: any) => {
              updateDocumentStatus.mutate({ id: selectedDocument.id, ...data });
              setSelectedDocument(null);
            }}
            onCancel={() => setSelectedDocument(null)}
          />
        </DialogContent>
      </Dialog>
    </div>
  );
}

function RequirementForm({ onSubmit, onCancel }: any) {
  const [formData, setFormData] = useState({
    document_type: '',
    document_name: '',
    description: '',
    is_required: true,
    allowed_formats: ['pdf', 'jpg', 'jpeg', 'png'],
    max_size_mb: 5,
  });

  return (
    <form onSubmit={(e) => { e.preventDefault(); onSubmit(formData); }} className="space-y-4">
      <div>
        <Label>Document Type *</Label>
        <Select
          value={formData.document_type}
          onValueChange={(value) => setFormData({ ...formData, document_type: value, document_name: value })}
        >
          <SelectTrigger>
            <SelectValue placeholder="Select type" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="passport">Passport</SelectItem>
            <SelectItem value="visa">Visa</SelectItem>
            <SelectItem value="id_card">ID Card</SelectItem>
            <SelectItem value="travel_insurance">Travel Insurance</SelectItem>
            <SelectItem value="vaccination_certificate">Vaccination Certificate</SelectItem>
            <SelectItem value="flight_ticket">Flight Ticket</SelectItem>
            <SelectItem value="hotel_booking">Hotel Booking</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div>
        <Label>Description</Label>
        <Textarea
          value={formData.description}
          onChange={(e) => setFormData({ ...formData, description: e.target.value })}
          rows={2}
        />
      </div>

      <div>
        <Label>Max File Size (MB)</Label>
        <Input
          type="number"
          min="1"
          max="50"
          value={formData.max_size_mb}
          onChange={(e) => setFormData({ ...formData, max_size_mb: parseInt(e.target.value) })}
        />
      </div>

      <div className="flex gap-2">
        <Button type="submit" className="flex-1">Add Requirement</Button>
        <Button type="button" variant="outline" onClick={onCancel}>Cancel</Button>
      </div>
    </form>
  );
}

function VerificationForm({ document, onSubmit, onCancel }: any) {
  const [status, setStatus] = useState('verified');
  const [notes, setNotes] = useState('');

  return (
    <div className="space-y-4">
      <div>
        <p className="text-sm text-muted-foreground">Document: {document?.document_type}</p>
        <p className="text-sm text-muted-foreground">File: {document?.file_name}</p>
      </div>

      <div>
        <Label>Verification Status *</Label>
        <Select value={status} onValueChange={setStatus}>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="verified">Verified</SelectItem>
            <SelectItem value="rejected">Rejected</SelectItem>
            <SelectItem value="expired">Expired</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div>
        <Label>Notes</Label>
        <Textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={3}
          placeholder="Add verification notes or rejection reason..."
        />
      </div>

      <div className="flex gap-2">
        <Button onClick={() => onSubmit({ status, notes })} className="flex-1">
          Submit
        </Button>
        <Button variant="outline" onClick={onCancel}>Cancel</Button>
      </div>
    </div>
  );
}
