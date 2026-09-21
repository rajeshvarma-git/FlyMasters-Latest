import { useState, useEffect } from 'react';
import { useAuth } from '@student/hooks/useAuth';
import { Card, CardContent, CardHeader, CardTitle } from '@student/components/ui/card';
import { Button } from '@student/components/ui/button';
import { Input } from '@student/components/ui/input';
import { Textarea } from '@student/components/ui/textarea';
import { Badge } from '@student/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@student/components/ui/avatar';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@student/components/ui/tabs';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@student/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@student/components/ui/select';
import { 
  Heart, 
  MessageCircle, 
  Share2, 
  TrendingUp, 
  Users, 
  PlusCircle,
  Search,
  Filter,
  BarChart3,
  BookOpen,
  DollarSign,
  Globe,
  GraduationCap
} from 'lucide-react';

const Community = () => {
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState('feed');
  const [showCreatePost, setShowCreatePost] = useState(false);

  // Mock data - replace with actual Supabase queries
  const [posts, setPosts] = useState([
    {
      id: '1',
      user: { name: 'Sarah Chen', avatar: '', country: 'India' },
      type: 'question',
      title: 'Country shortlist for MS in Computer Science',
      content: 'Which country would be better for MS in Computer Science - Germany or Australia? Looking at factors like cost, job opportunities, and visa policies.',
      category: 'country_specific',
      tags: ['MS', 'Computer Science', 'Germany', 'Australia'],
      likes: 45,
      comments: 12,
      timeAgo: '2 hours ago',
      isPoll: true,
      pollOptions: [
        { id: 'a', text: 'Germany', votes: 28, percentage: 62 },
        { id: 'b', text: 'Australia', votes: 17, percentage: 38 }
      ],
      totalVotes: 45
    },
    {
      id: '2',
      user: { name: 'Rajesh Kumar', avatar: '', country: 'India' },
      type: 'discussion',
      title: 'I-20 Financial Documentation Query',
      content: 'Hi everyone! I\'m in the process of applying for my I-20 form and the university requires financial documentation. Do online bank statements with bank signature suffice, or do I need physical statements?',
      category: 'financial',
      tags: ['I-20', 'Financial Documentation', 'USA'],
      likes: 23,
      comments: 8,
      timeAgo: '4 hours ago',
      isPoll: true,
      pollOptions: [
        { id: 'a', text: 'Online bank statements accepted', votes: 15 },
        { id: 'b', text: 'Physical statements required', votes: 8 }
      ],
      totalVotes: 23
    },
    {
      id: '3',
      user: { name: 'Profile Evaluation Expert', avatar: '', isExpert: true },
      type: 'announcement',
      title: 'Free AI Profile Evaluation - Limited Time!',
      content: 'Get your comprehensive study abroad profile evaluated by our AI system. Includes university recommendations, scholarship opportunities, and improvement suggestions.',
      category: 'general',
      tags: ['Profile Evaluation', 'Free', 'AI'],
      likes: 156,
      comments: 34,
      timeAgo: '1 day ago',
      isPromoted: true
    }
  ]);

  const categories = [
    { id: 'all', name: 'All Posts', icon: Globe, count: 245 },
    { id: 'country_specific', name: 'Country Guides', icon: Globe, count: 67 },
    { id: 'financial', name: 'Financial Help', icon: DollarSign, count: 89 },
    { id: 'academic', name: 'Academic', icon: BookOpen, count: 45 },
    { id: 'visa', name: 'Visa & Immigration', icon: GraduationCap, count: 34 },
    { id: 'general', name: 'General Discussion', icon: Users, count: 10 }
  ];

  const trendingTopics = [
    { tag: 'Germany MS', posts: 45 },
    { tag: 'IELTS Prep', posts: 38 },
    { tag: 'Scholarship 2025', posts: 29 },
    { tag: 'Canada PR', posts: 24 },
    { tag: 'US Visa', posts: 19 }
  ];

  const PostCard = ({ post }: { post: any }) => (
    <Card className="mb-4 hover:shadow-md transition-all duration-300">
      <CardContent className="p-6">
        <div className="flex items-start gap-4">
          <Avatar className="w-12 h-12">
            <AvatarImage src={post.user.avatar} />
            <AvatarFallback className="bg-primary/10 text-primary">
              {post.user.name.split(' ').map((n: string) => n[0]).join('')}
            </AvatarFallback>
          </Avatar>
          
          <div className="flex-1 space-y-3">
            <div className="flex items-center gap-2">
              <span className="font-semibold">{post.user.name}</span>
              {post.user.isExpert && (
                <Badge variant="secondary" className="text-xs">Expert</Badge>
              )}
              {post.isPromoted && (
                <Badge className="text-xs bg-gradient-primary">Featured</Badge>
              )}
              <span className="text-sm text-muted-foreground">• {post.timeAgo}</span>
            </div>

            <div>
              <h3 className="font-semibold text-lg mb-2">{post.title}</h3>
              <p className="text-muted-foreground">{post.content}</p>
              
              {post.isPoll && post.pollOptions && (
                <div className="mt-4 space-y-2">
                  <p className="text-sm font-medium">Poll Options</p>
                  {post.pollOptions.map((option: any) => (
                    <div key={option.id} className="relative">
                      <Button 
                        variant="outline" 
                        className="w-full justify-between h-auto p-3"
                        onClick={() => {/* Handle vote */}}
                      >
                        <span>{option.text}</span>
                        <span className="font-semibold">{option.percentage}%</span>
                      </Button>
                      <div 
                        className="absolute top-0 left-0 h-full bg-primary/20 rounded-l-md transition-all"
                        style={{ width: `${option.percentage}%` }}
                      />
                    </div>
                  ))}
                  <p className="text-xs text-muted-foreground">{post.totalVotes} votes</p>
                </div>
              )}
            </div>

            <div className="flex items-center gap-2">
              {post.tags.map((tag: string) => (
                <Badge key={tag} variant="outline" className="text-xs">
                  {tag}
                </Badge>
              ))}
            </div>

            <div className="flex items-center gap-6 pt-2">
              <Button variant="ghost" size="sm" className="gap-2">
                <Heart className="w-4 h-4" />
                {post.likes}
              </Button>
              <Button variant="ghost" size="sm" className="gap-2">
                <MessageCircle className="w-4 h-4" />
                {post.comments}
              </Button>
              <Button variant="ghost" size="sm" className="gap-2">
                <Share2 className="w-4 h-4" />
                Share
              </Button>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );

  const CreatePostDialog = () => (
    <Dialog open={showCreatePost} onOpenChange={setShowCreatePost}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Create New Post</DialogTitle>
        </DialogHeader>
        
        <div className="space-y-4">
          <Select defaultValue="discussion">
            <SelectTrigger>
              <SelectValue placeholder="Post Type" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="discussion">Discussion</SelectItem>
              <SelectItem value="question">Question</SelectItem>
              <SelectItem value="poll">Poll</SelectItem>
              <SelectItem value="success_story">Success Story</SelectItem>
            </SelectContent>
          </Select>

          <Input placeholder="Post title..." />
          <Textarea placeholder="Share your thoughts, ask questions, or start a discussion..." className="min-h-32" />
          
          <Select>
            <SelectTrigger>
              <SelectValue placeholder="Select Category" />
            </SelectTrigger>
            <SelectContent>
              {categories.slice(1).map(cat => (
                <SelectItem key={cat.id} value={cat.id}>{cat.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Input placeholder="Add tags (comma separated)" />
          
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setShowCreatePost(false)}>
              Cancel
            </Button>
            <Button className="bg-gradient-primary">
              Publish Post
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );

  return (
    <div className="min-h-screen bg-gradient-background">
      <div className="container mx-auto px-4 py-6 max-w-7xl">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-3xl font-bold">Community</h1>
            <p className="text-muted-foreground">Connect, share, and learn from fellow students</p>
          </div>
          <Button 
            onClick={() => setShowCreatePost(true)}
            className="bg-gradient-primary gap-2"
          >
            <PlusCircle className="w-4 h-4" />
            Create Post
          </Button>
        </div>

        {/* Search and Filter */}
        <div className="flex gap-4 mb-6">
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground w-4 h-4" />
            <Input 
              placeholder="Search posts, topics, or users..." 
              className="pl-10"
            />
          </div>
          <Button variant="outline" className="gap-2">
            <Filter className="w-4 h-4" />
            Filter
          </Button>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
          {/* Sidebar */}
          <div className="lg:col-span-1 space-y-6">
            {/* Categories */}
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Categories</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {categories.map(category => {
                  const Icon = category.icon;
                  return (
                    <Button
                      key={category.id}
                      variant="ghost"
                      className="w-full justify-start gap-3"
                    >
                      <Icon className="w-4 h-4" />
                      <span className="flex-1 text-left">{category.name}</span>
                      <Badge variant="outline" className="text-xs">
                        {category.count}
                      </Badge>
                    </Button>
                  );
                })}
              </CardContent>
            </Card>

            {/* Trending Topics */}
            <Card>
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <TrendingUp className="w-5 h-5" />
                  Trending
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {trendingTopics.map((topic, idx) => (
                  <div key={topic.tag} className="flex items-center gap-3">
                    <span className="text-sm font-medium text-primary">#{idx + 1}</span>
                    <div className="flex-1">
                      <p className="text-sm font-medium">{topic.tag}</p>
                      <p className="text-xs text-muted-foreground">{topic.posts} posts</p>
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>

            {/* Quick Stats */}
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Community Stats</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm">Active Members</span>
                  <span className="font-semibold">12,450+</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm">Posts This Week</span>
                  <span className="font-semibold">234</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm">Success Stories</span>
                  <span className="font-semibold">1,890</span>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Main Content */}
          <div className="lg:col-span-3">
            <Tabs defaultValue="feed" value={activeTab} onValueChange={setActiveTab}>
              <TabsList className="grid grid-cols-4 w-full mb-6">
                <TabsTrigger value="feed">Latest</TabsTrigger>
                <TabsTrigger value="trending">Trending</TabsTrigger>
                <TabsTrigger value="questions">Questions</TabsTrigger>
                <TabsTrigger value="success">Success Stories</TabsTrigger>
              </TabsList>

              <TabsContent value="feed" className="space-y-4">
                {posts.map(post => (
                  <PostCard key={post.id} post={post} />
                ))}
                
                <div className="text-center py-8">
                  <Button variant="outline">Load More Posts</Button>
                </div>
              </TabsContent>

              <TabsContent value="trending">
                <div className="text-center py-12">
                  <BarChart3 className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
                  <h3 className="text-xl font-semibold mb-2">Trending Content</h3>
                  <p className="text-muted-foreground">Popular posts and discussions will appear here</p>
                </div>
              </TabsContent>

              <TabsContent value="questions">
                <div className="text-center py-12">
                  <MessageCircle className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
                  <h3 className="text-xl font-semibold mb-2">Community Q&A</h3>
                  <p className="text-muted-foreground">Questions from fellow students will appear here</p>
                </div>
              </TabsContent>

              <TabsContent value="success">
                <div className="text-center py-12">
                  <GraduationCap className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
                  <h3 className="text-xl font-semibold mb-2">Success Stories</h3>
                  <p className="text-muted-foreground">Inspiring journeys from successful students</p>
                </div>
              </TabsContent>
            </Tabs>
          </div>
        </div>

        <CreatePostDialog />
      </div>
    </div>
  );
};

export default Community;