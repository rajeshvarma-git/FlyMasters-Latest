import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '@student/hooks/useAuth';
import { supabase } from '@student/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@student/components/ui/card';
import { Button } from '@student/components/ui/button';
import { Badge } from '@student/components/ui/badge';
import { Textarea } from '@student/components/ui/textarea';
import { Progress } from '@student/components/ui/progress';
import { useToast } from '@student/hooks/use-toast';
import { 
  GraduationCap, 
  Heart, 
  Clock, 
  CheckCircle, 
  AlertCircle,
  MessageCircle,
  FileText,
  Calendar,
  DollarSign,
  User,
  Send,
  Eye,
  EyeOff
} from 'lucide-react';
import { format } from 'date-fns';
import { collectStudentShortlistKeys, shortlistBelongsToStudent } from '@student/lib/studentShortlists';

interface UniversityShortlist {
  id: string;
  university_id: string;
  course_id: string | null;
  status: string;
  student_consent: boolean;
  student_consent_date: string | null;
  priority_level: string;
  counselor_notes: string | null;
  student_notes: string | null;
  application_deadline: string | null;
  estimated_fees: number | null;
  counselor_id: string;
  shortlisted_at: string;
  university_name: string | null;
  course_name: string | null;
  location: string | null;
  course_link: string | null;
  universities?: {
    name: string;
    country: string;
    logo_url?: string;
  } | null;
  courses?: {
    name: string;
    degree_type: string;
  } | null;
  profiles?: {
    first_name: string;
    last_name: string;
  } | null;
  application_status: {
    status: string;
    notes: string | null;
    updated_at: string;
    next_action_required: string | null;
    deadline_date: string | null;
  }[];
  shortlist_notes: {
    id: string;
    author_id: string;
    author_type: string;
    note_text: string;
    is_private: boolean;
    created_at: string;
    profiles?: {
      first_name: string;
      last_name: string;
    } | null;
  }[];
  checklists: {
    id: string;
    title: string;
    description: string;
    items: any[];
    is_active: boolean;
    checklist_type: string;
  }[];
}

export function UniversityShortlists() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [shortlists, setShortlists] = useState<UniversityShortlist[]>([]);
  const [loading, setLoading] = useState(true);
  const [newNote, setNewNote] = useState<{ [key: string]: string }>({});
  const [activeTab, setActiveTab] = useState<{ [key: string]: string }>({});

  useEffect(() => {
    if (user) {
      fetchShortlists();
    }
  }, [user]);

  const fetchShortlists = async () => {
    if (!user) return;

    try {
      const [{ data: rows, error }, { data: leads }] = await Promise.all([
        supabase.from('university_shortlists').select('*').order('created_at', { ascending: false }),
        supabase.from('student_leads').select('id, user_id, email'),
      ]);

      const keys = collectStudentShortlistKeys(user, leads || []);
      const shortlistRows = (error ? [] : rows || []).filter((row: any) => shortlistBelongsToStudent(row, user, keys));

      const mapped: UniversityShortlist[] = shortlistRows.map((row: any) => ({
        ...row,
        status: row.status || 'recommended',
        priority_level: row.priority_level || 'medium',
        shortlisted_at: row.shortlisted_at || row.created_at,
        universities: {
          name: row.university_name || 'University',
          country: row.location || '',
        },
        courses: {
          name: row.course_name || 'Course',
          degree_type: row.course_duration || '',
        },
        profiles: {
          first_name: 'Your',
          last_name: 'Counselor',
        },
        application_status: [],
        shortlist_notes: [],
        checklists: [],
      }));

      setShortlists(mapped);

      const counselorIds = [...new Set(mapped.map((row) => row.counselor_id).filter(Boolean))];
      if (counselorIds.length) {
        try {
          const { data: counselors } = await supabase
            .from('profiles')
            .select('user_id, first_name, last_name')
            .in('user_id', counselorIds);
          const counselorMap = new Map((counselors || []).map((profile: any) => [profile.user_id, profile]));
          setShortlists((current) =>
            current.map((item) => {
              const counselor = counselorMap.get(item.counselor_id);
              return counselor
                ? { ...item, profiles: { first_name: counselor.first_name, last_name: counselor.last_name } }
                : item;
            })
          );
        } catch {
          // Names are optional; keep the shortlists even if profiles fail.
        }
      }
    } catch (error) {
      console.error('Error fetching shortlists:', error);
      setShortlists([]);
    } finally {
      setLoading(false);
    }
  };

  const handleConsentChange = async (shortlistId: string, consent: boolean) => {
    try {
      const { error } = await supabase
        .from('university_shortlists')
        .update({
          student_consent: consent,
          student_consent_date: consent ? new Date().toISOString() : null,
          status: consent ? 'consented' : 'recommended'
        })
        .eq('id', shortlistId);

      if (error) throw error;

      toast({
        title: "Success",
        description: consent ? "Application consent given" : "Application consent withdrawn",
      });

      fetchShortlists();
    } catch (error) {
      console.error('Error updating consent:', error);
      toast({
        title: "Error",
        description: "Failed to update consent",
        variant: "destructive",
      });
    }
  };

  const addNote = async (shortlistId: string) => {
    if (!newNote[shortlistId]?.trim()) return;

    try {
      const { error } = await supabase
        .from('shortlist_notes')
        .insert({
          shortlist_id: shortlistId,
          author_id: user?.id,
          author_type: 'student',
          note_text: newNote[shortlistId],
        });

      if (error) throw error;

      setNewNote(prev => ({ ...prev, [shortlistId]: '' }));
      toast({
        title: "Success",
        description: "Note added successfully",
      });

      fetchShortlists();
    } catch (error) {
      console.error('Error adding note:', error);
      toast({
        title: "Error",
        description: "Failed to add note",
        variant: "destructive",
      });
    }
  };

  const updateChecklistItem = async (checklistId: string, itemIndex: number, completed: boolean) => {
    try {
      const checklist = shortlists
        .flatMap(s => s.checklists)
        .find(c => c.id === checklistId);

      if (!checklist) return;

      const updatedItems = [...checklist.items];
      updatedItems[itemIndex] = { ...updatedItems[itemIndex], completed, completed_at: completed ? new Date().toISOString() : null };

      const { error } = await supabase
        .from('student_checklists')
        .update({ 
          items: updatedItems,
          completed_at: updatedItems.every(item => item.completed) ? new Date().toISOString() : null
        })
        .eq('id', checklistId);

      if (error) throw error;

      fetchShortlists();
    } catch (error) {
      console.error('Error updating checklist:', error);
      toast({
        title: "Error",
        description: "Failed to update checklist",
        variant: "destructive",
      });
    }
  };

  const getStatusColor = (status: string) => {
    switch ((status || 'recommended').toLowerCase()) {
      case 'recommended': return 'bg-blue-500';
      case 'consented': return 'bg-green-500';
      case 'applied': return 'bg-purple-500';
      case 'accepted': return 'bg-emerald-500';
      case 'rejected': return 'bg-red-500';
      case 'waitlisted': return 'bg-yellow-500';
      default: return 'bg-gray-500';
    }
  };

  const getPriorityColor = (priority: string) => {
    switch ((priority || '').toLowerCase()) {
      case 'high': return 'destructive';
      case 'medium': return 'default';
      case 'low': return 'secondary';
      default: return 'outline';
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <div className="w-12 h-12 rounded-full bg-gradient-primary flex items-center justify-center">
          <GraduationCap className="w-6 h-6 text-white" />
        </div>
        <div>
          <h1 className="text-3xl font-bold">University Shortlists</h1>
          <p className="text-muted-foreground">Universities recommended by your counselor</p>
        </div>
      </div>

      {shortlists.length === 0 ? (
        <Card className="glass-card">
          <CardContent className="text-center py-12">
            <GraduationCap className="w-16 h-16 mx-auto mb-4 text-muted-foreground opacity-50" />
            <h3 className="text-lg font-semibold mb-2">No University Shortlists Yet</h3>
            <p className="text-muted-foreground mb-4">
              When your counselor adds universities on their Shortlists page, they show up here.
            </p>
            <Button asChild>
              <Link to="/student/chat">Message counselor</Link>
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-6">
          {shortlists.map((shortlist) => (
            <Card key={shortlist.id} className="glass-card">
              <CardHeader>
                <div className="flex justify-between items-start">
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-2">
                      <div className="w-12 h-12 rounded-lg bg-primary/10 flex items-center justify-center">
                        <GraduationCap className="w-6 h-6 text-primary" />
                      </div>
                      <div>
                        <CardTitle className="text-xl">
                          {shortlist.university_name || shortlist.universities?.name || 'University'}
                        </CardTitle>
                        <CardDescription>
                          {[shortlist.course_name || shortlist.courses?.name, shortlist.courses?.degree_type, shortlist.location || shortlist.universities?.country]
                            .filter(Boolean)
                            .join(' • ')}
                        </CardDescription>
                      </div>
                    </div>
                    
                    <div className="flex flex-wrap gap-2 mb-4">
                      <Badge className={`${getStatusColor(shortlist.status)} text-white`}>
                        {shortlist.status}
                      </Badge>
                      <Badge variant={getPriorityColor(shortlist.priority_level)}>
                        {shortlist.priority_level} priority
                      </Badge>
                      {shortlist.estimated_fees && (
                        <Badge variant="outline" className="flex items-center gap-1">
                          <DollarSign className="w-3 h-3" />
                          ${shortlist.estimated_fees.toLocaleString()}
                        </Badge>
                      )}
                    </div>

                    <div className="text-sm text-muted-foreground mb-4">
                      <div className="flex items-center gap-2 mb-1">
                        <User className="w-4 h-4" />
                        Recommended by: {shortlist.profiles?.first_name || 'Your'} {shortlist.profiles?.last_name || 'Counselor'}
                      </div>
                      <div className="flex items-center gap-2">
                        <Clock className="w-4 h-4" />
                        Shortlisted on: {shortlist.shortlisted_at && !Number.isNaN(new Date(shortlist.shortlisted_at).getTime())
                          ? format(new Date(shortlist.shortlisted_at), 'MMM dd, yyyy')
                          : 'Recently'}
                      </div>
                      {shortlist.application_deadline && !Number.isNaN(new Date(shortlist.application_deadline).getTime()) ? (
                        <div className="flex items-center gap-2 mt-1">
                          <Calendar className="w-4 h-4" />
                          Application deadline: {format(new Date(shortlist.application_deadline), 'MMM dd, yyyy')}
                        </div>
                      ) : null}
                      {shortlist.counselor_notes ? (
                        <p className="mt-3 rounded-md bg-muted/50 p-3 text-sm text-foreground">
                          {shortlist.counselor_notes}
                        </p>
                      ) : null}
                    </div>
                  </div>
                </div>
              </CardHeader>

              <CardContent className="space-y-6">
                {/* Consent Section */}
                <div className="p-4 rounded-lg border bg-muted/20">
                  <h4 className="font-semibold mb-2 flex items-center gap-2">
                    <CheckCircle className="w-4 h-4" />
                    Application Consent
                  </h4>
                  <p className="text-sm text-muted-foreground mb-3">
                    Give your consent to proceed with the application to this university.
                  </p>
                  <div className="flex flex-wrap gap-3">
                    <Button size="sm" asChild>
                      <Link to={`/student/applications?shortlist=${encodeURIComponent(shortlist.id)}`}>
                        Start application
                      </Link>
                    </Button>
                    <Button
                      onClick={() => handleConsentChange(shortlist.id, true)}
                      disabled={shortlist.student_consent}
                      variant={shortlist.student_consent ? "default" : "outline"}
                      size="sm"
                    >
                      {shortlist.student_consent ? (
                        <>
                          <CheckCircle className="w-4 h-4 mr-2" />
                          Consented
                        </>
                      ) : (
                        'Give Consent'
                      )}
                    </Button>
                    {shortlist.student_consent && (
                      <Button
                        onClick={() => handleConsentChange(shortlist.id, false)}
                        variant="outline"
                        size="sm"
                      >
                        Withdraw Consent
                      </Button>
                    )}
                  </div>
                  {shortlist.student_consent_date && (
                    <p className="text-xs text-muted-foreground mt-2">
                      Consented on: {format(new Date(shortlist.student_consent_date), 'MMM dd, yyyy')}
                    </p>
                  )}
                </div>

                {/* Tabs for different sections */}
                <div className="space-y-4">
                  <div className="flex gap-2 border-b">
                    {['status', 'notes', 'checklists'].map((tab) => (
                      <button
                        key={tab}
                        onClick={() => setActiveTab(prev => ({ ...prev, [shortlist.id]: tab }))}
                        className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
                          (activeTab[shortlist.id] || 'status') === tab
                            ? 'border-primary text-primary'
                            : 'border-transparent text-muted-foreground hover:text-foreground'
                        }`}
                      >
                        {tab.charAt(0).toUpperCase() + tab.slice(1)}
                      </button>
                    ))}
                  </div>

                  {/* Status Tab */}
                  {(activeTab[shortlist.id] || 'status') === 'status' && (
                    <div className="space-y-4">
                      <h4 className="font-semibold flex items-center gap-2">
                        <AlertCircle className="w-4 h-4" />
                        Application Status Updates
                      </h4>
                      {shortlist.application_status?.length > 0 ? (
                        <div className="space-y-3">
                          {shortlist.application_status
                            .sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime())
                            .map((update, index) => (
                            <div key={index} className="p-3 rounded-lg border bg-muted/10">
                              <div className="flex justify-between items-start mb-2">
                                <Badge className={`${getStatusColor(update.status)} text-white`}>
                                  {update.status.replace('_', ' ')}
                                </Badge>
                                <span className="text-xs text-muted-foreground">
                                  {format(new Date(update.updated_at), 'MMM dd, yyyy')}
                                </span>
                              </div>
                              {update.notes && (
                                <p className="text-sm text-foreground mb-2">{update.notes}</p>
                              )}
                              {update.next_action_required && (
                                <div className="text-sm">
                                  <strong>Next Action:</strong> {update.next_action_required}
                                </div>
                              )}
                              {update.deadline_date && (
                                <div className="text-sm text-orange-600">
                                  <strong>Deadline:</strong> {format(new Date(update.deadline_date), 'MMM dd, yyyy')}
                                </div>
                              )}
                            </div>
                          ))}
                        </div>
                      ) : (
                        <p className="text-muted-foreground text-sm">No status updates yet.</p>
                      )}
                    </div>
                  )}

                  {/* Notes Tab */}
                  {(activeTab[shortlist.id] || 'status') === 'notes' && (
                    <div className="space-y-4">
                      <h4 className="font-semibold flex items-center gap-2">
                        <MessageCircle className="w-4 h-4" />
                        Communication Notes
                      </h4>
                      
                      {/* Add new note */}
                      <div className="flex gap-2">
                        <Textarea
                          placeholder="Add a note or question..."
                          value={newNote[shortlist.id] || ''}
                          onChange={(e) => setNewNote(prev => ({ ...prev, [shortlist.id]: e.target.value }))}
                          className="flex-1"
                          rows={2}
                        />
                        <Button
                          onClick={() => addNote(shortlist.id)}
                          disabled={!newNote[shortlist.id]?.trim()}
                          size="sm"
                        >
                          <Send className="w-4 h-4" />
                        </Button>
                      </div>

                      {/* Display notes */}
                      <div className="space-y-3">
                        {(shortlist.shortlist_notes || [])
                          .filter(note => !note.is_private || note.author_id === user?.id)
                          .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
                          .map((note) => (
                          <div key={note.id} className={`p-3 rounded-lg ${
                            note.author_type === 'student' ? 'bg-primary/5 border-l-4 border-l-primary' : 'bg-muted/20'
                          }`}>
                            <div className="flex justify-between items-start mb-2">
                              <div className="flex items-center gap-2">
                                <Badge variant={note.author_type === 'student' ? 'default' : 'secondary'}>
                                  {note.author_type}
                                </Badge>
                                <span className="text-sm font-medium">
                                  {note.profiles
                                    ? `${note.profiles.first_name || ''} ${note.profiles.last_name || ''}`.trim()
                                    : note.author_type === 'student' ? 'You' : 'Counselor'}
                                </span>
                                {note.is_private && (
                                  <div className="flex items-center gap-1 text-orange-600">
                                    <EyeOff className="w-3 h-3" />
                                    <span className="text-xs">Private</span>
                                  </div>
                                )}
                              </div>
                              <span className="text-xs text-muted-foreground">
                                {format(new Date(note.created_at), 'MMM dd, yyyy HH:mm')}
                              </span>
                            </div>
                            <p className="text-sm">{note.note_text}</p>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Checklists Tab */}
                  {(activeTab[shortlist.id] || 'status') === 'checklists' && (
                    <div className="space-y-4">
                      <h4 className="font-semibold flex items-center gap-2">
                        <FileText className="w-4 h-4" />
                        Application Checklists
                      </h4>
                      
                      {(shortlist.checklists || []).filter(c => c.is_active).length > 0 ? (
                        <div className="space-y-4">
                          {(shortlist.checklists || [])
                            .filter(checklist => checklist.is_active)
                            .map((checklist) => {
                              const completedItems = checklist.items.filter(item => item.completed).length;
                              const totalItems = checklist.items.length;
                              const progress = totalItems > 0 ? (completedItems / totalItems) * 100 : 0;

                              return (
                                <div key={checklist.id} className="p-4 rounded-lg border bg-muted/10">
                                  <div className="flex justify-between items-start mb-3">
                                    <div>
                                      <h5 className="font-medium">{checklist.title}</h5>
                                      <p className="text-sm text-muted-foreground">{checklist.description}</p>
                                    </div>
                                    <Badge variant="outline">
                                      {checklist.checklist_type}
                                    </Badge>
                                  </div>
                                  
                                  <div className="mb-4">
                                    <div className="flex justify-between text-sm mb-1">
                                      <span>Progress</span>
                                      <span>{completedItems}/{totalItems} completed</span>
                                    </div>
                                    <Progress value={progress} className="h-2" />
                                  </div>

                                  <div className="space-y-2">
                                    {checklist.items.map((item, itemIndex) => (
                                      <div key={itemIndex} className="flex items-center gap-3">
                                        <input
                                          type="checkbox"
                                          checked={item.completed || false}
                                          onChange={(e) => updateChecklistItem(checklist.id, itemIndex, e.target.checked)}
                                          className="rounded border-gray-300"
                                        />
                                        <span className={`text-sm ${item.completed ? 'line-through text-muted-foreground' : ''}`}>
                                          {item.title}
                                        </span>
                                        {item.description && (
                                          <span className="text-xs text-muted-foreground">
                                            - {item.description}
                                          </span>
                                        )}
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              );
                            })}
                        </div>
                      ) : (
                        <p className="text-muted-foreground text-sm">No active checklists for this application.</p>
                      )}
                    </div>
                  )}
                </div>

                {/* Counselor Notes */}
                {shortlist.counselor_notes && (
                  <div className="p-4 rounded-lg border bg-blue-50/50 dark:bg-blue-950/20">
                    <h4 className="font-semibold text-blue-800 dark:text-blue-200 mb-2">
                      Counselor Notes
                    </h4>
                    <p className="text-sm text-blue-700 dark:text-blue-300">
                      {shortlist.counselor_notes}
                    </p>
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}