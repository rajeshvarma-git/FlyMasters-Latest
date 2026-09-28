import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { StudentCaseChat } from '@student/components/dashboard/student/StudentCaseChat';
import ErrorBoundary from '@student/components/ErrorBoundary';
import { useAuth } from '@student/hooks/useAuth';
import { CHAT_PATH, getAuthRedirectPath } from '@student/lib/auth-utils';

const Chat: React.FC = () => {
  const { user, loading, profileLoading } = useAuth();
  const location = useLocation();

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

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-primary/5 py-8">
      <div className="container mx-auto px-4">
        <div className="text-center mb-8">
          <h1 className="text-4xl font-bold mb-4 bg-gradient-to-r from-primary to-primary-foreground bg-clip-text text-transparent">
            Chat with Fly Masters
          </h1>
          <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
            Our AI advisor answers first. Your telecaller and counselor join this same chat as you move ahead.
          </p>
        </div>
        
        <div className="max-w-3xl mx-auto">
          <ErrorBoundary>
            <StudentCaseChat />
          </ErrorBoundary>
        </div>
      </div>
    </div>
  );
};

export default Chat;