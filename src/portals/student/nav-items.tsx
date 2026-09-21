import { HomeIcon, LockIcon, MessageCircle, GraduationCap, User, Users, BookOpen, Award, Calendar, Target, Plane } from "lucide-react";
import Index from "./pages/Index.jsx";
import Auth from "./pages/Auth.jsx";
import Chat from "./pages/Chat.jsx";
import Universities from "./pages/Universities.jsx";
import Courses from "./pages/Courses.jsx";
import Community from "./pages/Community.jsx";
import Experts from "./pages/Experts.jsx";
import TestPrep from "./pages/TestPrep.jsx";
import Scholarships from "./pages/Scholarships.jsx";
import Events from "./pages/Events.jsx";
import Dashboard from "./pages/Dashboard.jsx";
import Travel from "./pages/Travel.jsx";

export const navItems = [
  {
    title: "Home",
    to: "/",
    icon: <HomeIcon className="h-4 w-4" />,
    page: <Index />,
  },
  {
    title: "AI Chat", 
    to: "/chat",
    icon: <MessageCircle className="h-4 w-4" />,
    page: <Chat />,
  },
  {
    title: "Universities",
    to: "/universities", 
    icon: <GraduationCap className="h-4 w-4" />,
    page: <Universities />,
  },
  {
    title: "Courses",
    to: "/courses", 
    icon: <BookOpen className="h-4 w-4" />,
    page: <Courses />,
  },
  {
    title: "Community",
    to: "/community", 
    icon: <Users className="h-4 w-4" />,
    page: <Community />,
  },
  {
    title: "Experts",
    to: "/experts", 
    icon: <Target className="h-4 w-4" />,
    page: <Experts />,
  },
  {
    title: "Test Prep",
    to: "/test-prep", 
    icon: <BookOpen className="h-4 w-4" />,
    page: <TestPrep />,
  },
  {
    title: "Scholarships",
    to: "/scholarships", 
    icon: <Award className="h-4 w-4" />,
    page: <Scholarships />,
  },
  {
    title: "Events",
    to: "/events", 
    icon: <Calendar className="h-4 w-4" />,
    page: <Events />,
  },
  {
    title: "Travel",
    to: "/travel", 
    icon: <Plane className="h-4 w-4" />,
    page: <Travel />,
  },
  {
    title: "Dashboard",
    to: "/dashboard",
    icon: <User className="h-4 w-4" />,
    page: <Dashboard />,
  },
  {
    title: "Auth",
    to: "/auth",
    icon: <LockIcon className="h-4 w-4" />,
    page: <Auth />,
  },
];