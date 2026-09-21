import { useState, useEffect } from 'react';
import { useAuth } from '@student/hooks/useAuth';
import { supabase } from '@student/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@student/components/ui/card';
import { Button } from '@student/components/ui/button';
import { Badge } from '@student/components/ui/badge';
import { Progress } from '@student/components/ui/progress';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@student/components/ui/tabs';
import WhatsAppButton from '@student/components/WhatsAppButton';
import { 
  BookOpen, 
  Clock, 
  Trophy, 
  Target, 
  PlayCircle,
  FileText,
  BarChart3,
  Award,
  Users,
  TrendingUp,
  CheckCircle,
  Lock,
  Phone,
  Download,
  Calendar,
  DollarSign,
  CheckCircle2
} from 'lucide-react';

interface TestPrepSchedule {
  id: string;
  test_type: string;
  title: string;
  description: string | null;
  schedule_image_url: string | null;
  schedule_pdf_url: string | null;
  start_date: string | null;
  end_date: string | null;
  batch_timings: string | null;
  discount_percentage: number;
  original_price: number | null;
  discounted_price: number | null;
  features: string[];
  is_active: boolean;
}

const TestPrep = () => {
  const { user } = useAuth();
  const [schedules, setSchedules] = useState<TestPrepSchedule[]>([]);
  const [loadingSchedules, setLoadingSchedules] = useState(true);
  const [whatsappConfig, setWhatsappConfig] = useState<any>(null);

  // Mock data - replace with actual Supabase queries
  const [testModules] = useState([
    {
      id: '1',
      testType: 'GRE',
      moduleName: 'Quantitative Reasoning Basics',
      description: 'Introduction to GRE Math concepts and problem-solving strategies',
      difficultyLevel: 'beginner',
      estimatedHours: 8,
      isPremium: false,
      orderSequence: 1,
      progress: 65,
      completedAt: null
    },
    {
      id: '2',
      testType: 'GRE',
      moduleName: 'Verbal Reasoning Fundamentals',
      description: 'Reading comprehension and vocabulary building',
      difficultyLevel: 'beginner',
      estimatedHours: 10,
      isPremium: false,
      orderSequence: 2,
      progress: 30,
      completedAt: null
    },
    {
      id: '3',
      testType: 'GRE',
      moduleName: 'Analytical Writing',
      description: 'Essays writing techniques and practice',
      difficultyLevel: 'intermediate',
      estimatedHours: 6,
      isPremium: true,
      orderSequence: 3,
      progress: 0,
      completedAt: null
    },
    {
      id: '4',
      testType: 'TOEFL',
      moduleName: 'Reading Section Prep',
      description: 'Academic reading comprehension strategies',
      difficultyLevel: 'beginner',
      estimatedHours: 5,
      isPremium: false,
      orderSequence: 1,
      progress: 100,
      completedAt: new Date('2024-01-15')
    },
    {
      id: '5',
      testType: 'TOEFL',
      moduleName: 'Listening Skills',
      description: 'Academic listening and note-taking techniques',
      difficultyLevel: 'beginner',
      estimatedHours: 4,
      isPremium: false,
      orderSequence: 2,
      progress: 80,
      completedAt: null
    },
    {
      id: '6',
      testType: 'IELTS',
      moduleName: 'General Training',
      description: 'Overview of IELTS test format and strategies',
      difficultyLevel: 'beginner',
      estimatedHours: 4,
      isPremium: false,
      orderSequence: 1,
      progress: 45,
      completedAt: null
    }
  ]);

  const [userStats] = useState({
    totalModulesCompleted: 1,
    totalHoursStudied: 12,
    averageScore: 85,
    currentStreak: 5,
    rank: 156
  });

  useEffect(() => {
    fetchSchedules();
    fetchWhatsAppConfig();
  }, []);

  const fetchSchedules = async () => {
    try {
      const { data, error } = await supabase
        .from('test_prep_schedules')
        .select('*')
        .eq('is_active', true)
        .order('test_type', { ascending: true })
        .order('display_order', { ascending: true });

      if (error) throw error;
      setSchedules((data || []).map(item => ({
        ...item,
        features: Array.isArray(item.features) ? item.features as string[] : []
      })));
    } catch (error) {
      console.error('Error fetching schedules:', error);
    } finally {
      setLoadingSchedules(false);
    }
  };

  const fetchWhatsAppConfig = async () => {
    try {
      const { data } = await supabase
        .from('website_content')
        .select('metadata')
        .eq('section_key', 'whatsapp_config')
        .single();
      
      if (data?.metadata) setWhatsappConfig(data.metadata);
    } catch (error) {
      console.error('Error fetching WhatsApp config:', error);
    }
  };

  const getSchedulesByTestType = (testType: string) => {
    return schedules.filter(s => s.test_type === testType);
  };

  const testTypes = [
    { id: 'IELTS', name: 'IELTS', fullName: 'International English Language Testing System' },
    { id: 'TOEFL', name: 'TOEFL', fullName: 'Test of English as a Foreign Language' },
    { id: 'GRE', name: 'GRE', fullName: 'Graduate Record Examination' },
    { id: 'PTE', name: 'PTE', fullName: 'Pearson Test of English' },
    { id: 'Duolingo', name: 'Duolingo', fullName: 'Duolingo English Test' },
    { id: 'GMAT', name: 'GMAT', fullName: 'Graduate Management Admission Test' },
    { id: 'SAT', name: 'SAT', fullName: 'Scholastic Assessment Test' },
  ];

  const getDifficultyColor = (level: string) => {
    switch (level) {
      case 'beginner': return 'bg-green-100 text-green-800';
      case 'intermediate': return 'bg-yellow-100 text-yellow-800';
      case 'advanced': return 'bg-red-100 text-red-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  const ModuleCard = ({ module }: { module: any }) => (
    <Card className="hover:shadow-lg transition-all duration-300">
      <CardContent className="p-6">
        <div className="flex items-start justify-between mb-4">
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-2">
              <h3 className="font-semibold text-lg">{module.moduleName}</h3>
              {module.isPremium && (
                <Badge className="bg-gradient-primary text-xs">Premium</Badge>
              )}
              {module.completedAt && (
                <CheckCircle className="w-5 h-5 text-green-500" />
              )}
            </div>
            <p className="text-muted-foreground text-sm mb-3">{module.description}</p>
            
            <div className="flex items-center gap-4 text-sm">
              <Badge variant="outline" className={getDifficultyColor(module.difficultyLevel)}>
                {module.difficultyLevel}
              </Badge>
              <div className="flex items-center gap-1">
                <Clock className="w-4 h-4" />
                <span>{module.estimatedHours}h</span>
              </div>
            </div>
          </div>
          
          {module.isPremium && !user && (
            <Lock className="w-5 h-5 text-muted-foreground" />
          )}
        </div>

        <div className="space-y-3">
          <div className="flex items-center justify-between text-sm">
            <span>Progress</span>
            <span className="font-semibold">{module.progress}%</span>
          </div>
          <Progress value={module.progress} className="h-2" />
          
          <div className="flex gap-2">
            <Button 
              className="flex-1" 
              variant={module.progress === 0 ? "default" : "outline"}
              disabled={module.isPremium && !user}
            >
              <PlayCircle className="w-4 h-4 mr-2" />
              {module.progress === 0 ? 'Start Module' : 'Continue'}
            </Button>
            <Button variant="outline" size="sm">
              <FileText className="w-4 h-4" />
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );

  const ScheduleCard = ({ schedule }: { schedule: TestPrepSchedule }) => (
    <Card className="hover:shadow-xl transition-all duration-300 overflow-hidden">
      {schedule.schedule_image_url && (
        <div className="relative">
          <img 
            src={schedule.schedule_image_url} 
            alt={schedule.title}
            className="w-full h-48 object-cover"
          />
          {schedule.discount_percentage > 0 && (
            <div className="absolute top-4 right-4 bg-red-500 text-white font-bold px-3 py-2 rounded-full text-sm shadow-lg">
              {schedule.discount_percentage}% OFF
            </div>
          )}
        </div>
      )}
      <CardContent className="p-6 space-y-4">
        <div>
          <h3 className="text-xl font-bold mb-2">{schedule.title}</h3>
          {schedule.description && (
            <p className="text-muted-foreground text-sm">{schedule.description}</p>
          )}
        </div>

        {schedule.batch_timings && (
          <div className="flex items-start gap-2 text-sm">
            <Calendar className="w-4 h-4 text-primary mt-0.5 flex-shrink-0" />
            <div>
              <p className="font-semibold">Batch Timings</p>
              <p className="text-muted-foreground">{schedule.batch_timings}</p>
            </div>
          </div>
        )}

        {(schedule.start_date || schedule.end_date) && (
          <div className="flex items-center gap-2 text-sm">
            <Clock className="w-4 h-4 text-primary" />
            <span className="text-muted-foreground">
              {schedule.start_date && new Date(schedule.start_date).toLocaleDateString()}
              {schedule.start_date && schedule.end_date && ' - '}
              {schedule.end_date && new Date(schedule.end_date).toLocaleDateString()}
            </span>
          </div>
        )}

        {schedule.features && schedule.features.length > 0 && (
          <div className="space-y-2">
            <p className="font-semibold text-sm">Features:</p>
            <ul className="space-y-1">
              {schedule.features.slice(0, 4).map((feature, idx) => (
                <li key={idx} className="flex items-start gap-2 text-sm text-muted-foreground">
                  <CheckCircle2 className="w-4 h-4 text-green-500 mt-0.5 flex-shrink-0" />
                  <span>{feature}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {(schedule.original_price || schedule.discounted_price) && (
          <div className="pt-4 border-t">
            <div className="flex items-center gap-3">
              <DollarSign className="w-5 h-5 text-primary" />
              <div className="flex items-center gap-2">
                {schedule.original_price && schedule.discount_percentage > 0 && (
                  <span className="text-lg line-through text-muted-foreground">
                    ₹{schedule.original_price}
                  </span>
                )}
                {schedule.discounted_price && (
                  <span className="text-2xl font-bold text-primary">
                    ₹{schedule.discounted_price}
                  </span>
                )}
              </div>
            </div>
          </div>
        )}

        <div className="pt-4 flex flex-col sm:flex-row gap-3">
          <a
            href={`https://wa.me/${whatsappConfig?.phone_number?.replace(/[^0-9]/g, '')}?text=${encodeURIComponent(`Hi! I'm interested in the ${schedule.test_type} course: ${schedule.title}`)}`}
            target="_blank"
            rel="noopener noreferrer"
            className="flex-1"
          >
            <Button className="w-full bg-green-600 hover:bg-green-700 text-white">
              <Phone className="w-4 h-4 mr-2" />
              WhatsApp
            </Button>
          </a>
          <a 
            href={`tel:${whatsappConfig?.phone_number}`}
            className="flex-1"
          >
            <Button variant="outline" className="w-full">
              <Phone className="w-4 h-4 mr-2" />
              Call Now
            </Button>
          </a>
        </div>

        {schedule.schedule_pdf_url && (
          <a href={schedule.schedule_pdf_url} target="_blank" rel="noopener noreferrer">
            <Button variant="outline" className="w-full">
              <Download className="w-4 h-4 mr-2" />
              Download Schedule
            </Button>
          </a>
        )}
      </CardContent>
    </Card>
  );

  return (
    <div className="min-h-screen bg-gradient-background">
      <div className="container mx-auto px-4 py-6 max-w-7xl">
        {/* Header */}
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold mb-2">Test Preparation</h1>
          <p className="text-muted-foreground text-lg">
            Comprehensive preparation for standardized tests
          </p>
        </div>

        {/* User Stats */}
        {user && (
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-8">
            <Card>
              <CardContent className="p-4 text-center">
                <Trophy className="w-6 h-6 text-primary mx-auto mb-2" />
                <p className="text-lg font-bold">{userStats.totalModulesCompleted}</p>
                <p className="text-xs text-muted-foreground">Completed</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4 text-center">
                <Clock className="w-6 h-6 text-primary mx-auto mb-2" />
                <p className="text-lg font-bold">{userStats.totalHoursStudied}h</p>
                <p className="text-xs text-muted-foreground">Studied</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4 text-center">
                <Target className="w-6 h-6 text-primary mx-auto mb-2" />
                <p className="text-lg font-bold">{userStats.averageScore}%</p>
                <p className="text-xs text-muted-foreground">Avg Score</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4 text-center">
                <TrendingUp className="w-6 h-6 text-primary mx-auto mb-2" />
                <p className="text-lg font-bold">{userStats.currentStreak}</p>
                <p className="text-xs text-muted-foreground">Day Streak</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4 text-center">
                <Award className="w-6 h-6 text-primary mx-auto mb-2" />
                <p className="text-lg font-bold">#{userStats.rank}</p>
                <p className="text-xs text-muted-foreground">Rank</p>
              </CardContent>
            </Card>
          </div>
        )}

        <Tabs defaultValue="IELTS" className="w-full">
          <TabsList className="grid w-full grid-cols-3 sm:grid-cols-4 md:grid-cols-7 mb-6 h-auto">
            {testTypes.map(test => (
              <TabsTrigger key={test.id} value={test.id} className="text-xs sm:text-sm">
                {test.name}
              </TabsTrigger>
            ))}
          </TabsList>

          {testTypes.map(test => {
            const testSchedules = getSchedulesByTestType(test.id);
            
            return (
              <TabsContent key={test.id} value={test.id}>
                <Card className="mb-6 bg-gradient-to-br from-primary/5 to-primary/10 border-primary/20">
                  <CardHeader>
                    <CardTitle className="text-2xl">{test.name}</CardTitle>
                    <p className="text-muted-foreground">{test.fullName}</p>
                  </CardHeader>
                  <CardContent>
                    <p className="text-sm text-muted-foreground">
                      Expert coaching from our white-label partner with proven track record
                    </p>
                  </CardContent>
                </Card>
                
                {loadingSchedules ? (
                  <div className="text-center py-12">
                    <div className="animate-spin w-8 h-8 border-4 border-primary border-t-transparent rounded-full mx-auto"></div>
                    <p className="text-muted-foreground mt-4">Loading schedules...</p>
                  </div>
                ) : testSchedules.length > 0 ? (
                  <div className="space-y-6">
                    <div className="flex items-center justify-between">
                      <h3 className="text-xl font-semibold">Available Batches</h3>
                      <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200">
                        {testSchedules.length} {testSchedules.length === 1 ? 'Batch' : 'Batches'} Available
                      </Badge>
                    </div>
                    
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                      {testSchedules.map(schedule => (
                        <ScheduleCard key={schedule.id} schedule={schedule} />
                      ))}
                    </div>

                    <Card className="bg-primary/5 border-primary/20">
                      <CardContent className="p-6">
                        <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
                          <div>
                            <h4 className="font-semibold text-lg mb-1">Need More Information?</h4>
                            <p className="text-sm text-muted-foreground">
                              Our counselors are here to help you choose the right batch
                            </p>
                          </div>
                          <div className="flex flex-col sm:flex-row gap-2 w-full sm:w-auto">
                            <WhatsAppButton variant="inline" className="justify-center" />
                            {whatsappConfig?.phone_number && (
                              <a href={`tel:${whatsappConfig.phone_number}`}>
                                <Button variant="outline" className="w-full sm:w-auto">
                                  <Phone className="w-4 h-4 mr-2" />
                                  {whatsappConfig.phone_number}
                                </Button>
                              </a>
                            )}
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  </div>
                ) : (
                  <Card>
                    <CardContent className="p-8 text-center">
                      <BookOpen className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
                      <h3 className="text-xl font-semibold mb-2">No Batches Available</h3>
                      <p className="text-muted-foreground mb-6">
                        {test.name} coaching batches are being scheduled. 
                        Contact us to express your interest and get notified.
                      </p>
                      <div className="flex flex-col sm:flex-row gap-3 justify-center">
                        <WhatsAppButton variant="inline" />
                        {whatsappConfig?.phone_number && (
                          <a href={`tel:${whatsappConfig.phone_number}`}>
                            <Button variant="outline">
                              <Phone className="w-4 h-4 mr-2" />
                              Call Us
                            </Button>
                          </a>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                )}
              </TabsContent>
            );
          })}
        </Tabs>

        {/* Additional Resources */}
        <Card className="mt-8">
          <CardHeader>
            <CardTitle>Additional Resources</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <Button variant="outline" className="h-auto p-4 flex flex-col gap-2">
                <BarChart3 className="w-6 h-6" />
                <span className="font-semibold">Score Predictor</span>
                <span className="text-xs text-muted-foreground">
                  Predict your test scores
                </span>
              </Button>
              <Button variant="outline" className="h-auto p-4 flex flex-col gap-2">
                <Users className="w-6 h-6" />
                <span className="font-semibold">Study Groups</span>
                <span className="text-xs text-muted-foreground">
                  Join peer study sessions
                </span>
              </Button>
              <Button variant="outline" className="h-auto p-4 flex flex-col gap-2">
                <FileText className="w-6 h-6" />
                <span className="font-semibold">Test Centers</span>
                <span className="text-xs text-muted-foreground">
                  Find nearby test centers
                </span>
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default TestPrep;