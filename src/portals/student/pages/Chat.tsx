import React from 'react';
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { ArrowLeft, GraduationCap, LayoutDashboard } from 'lucide-react';
import { StudentCaseChat } from '@student/components/dashboard/student/StudentCaseChat';
import ErrorBoundary from '@student/components/ErrorBoundary';
import { useAuth } from '@student/hooks/useAuth';
import { CHAT_PATH, getAuthRedirectPath } from '@student/lib/auth-utils';

const Chat: React.FC = () => {
  const { user, loading, profileLoading } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();

  if (loading || profileLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-background via-background to-primary/5 flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  }

  if (!user) {
    return (
      <Navigate
        to={getAuthRedirectPath(CHAT_PATH)}
        state={{ from: location }}
        replace
      />
    );
  }

  const goBack = () => {
    const idx = (window.history.state as { idx?: number } | null)?.idx ?? 0;
    if (idx > 0) navigate(-1);
    else navigate('/');
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-primary/5">
      <header className="sticky top-0 z-40 border-b border-border/40 bg-background/90 backdrop-blur-sm">
        <div className="container mx-auto flex h-14 items-center gap-3 px-4">
          <button
            type="button"
            onClick={goBack}
            className="flex h-9 w-9 items-center justify-center rounded-lg border border-border/60 bg-background hover:bg-muted/60"
            aria-label="Go back"
            title="Back"
          >
            <ArrowLeft className="h-4 w-4" />
          </button>
          <Link to="/" className="flex items-center gap-2">
            <span className="flex h-8 w-8 items-center justify-center rounded-full bg-gradient-primary">
              <GraduationCap className="h-4 w-4 text-white" />
            </span>
            <span className="text-sm font-semibold">Fly Masters</span>
          </Link>
          <Link
            to="/student"
            className="ml-auto flex items-center gap-2 rounded-lg bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:opacity-90"
          >
            <LayoutDashboard className="h-4 w-4" /> My Dashboard
          </Link>
        </div>
      </header>
      <div className="container mx-auto px-4 py-8">
        <div className="text-center mb-8">
          <h1 className="text-4xl font-bold mb-4 bg-gradient-to-r from-primary to-primary-foreground bg-clip-text text-transparent">
            University Advisor AI
          </h1>
          <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
            Get personalized university recommendations and expert guidance for your study abroad journey
          </p>
        </div>
        
        <ErrorBoundary>
          <StudentCaseChat />
        </ErrorBoundary>
      </div>
    </div>
  );
};

export default Chat;