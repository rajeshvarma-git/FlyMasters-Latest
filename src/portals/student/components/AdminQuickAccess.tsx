import { Button } from '@student/components/ui/button';
import { Shield } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useAuth } from '@student/hooks/useAuth';

export function AdminQuickAccess() {
  const { isAdmin, loading, roleLoading } = useAuth();

  if (loading || roleLoading) {
    return null;
  }

  if (!isAdmin) {
    return null;
  }

  return (
    <div className="fixed bottom-4 right-4 z-50">
      <Link to="/dashboard/admin">
        <Button className="rounded-full w-12 h-12 p-0 shadow-lg">
          <Shield className="w-5 h-5" />
        </Button>
      </Link>
    </div>
  );
}