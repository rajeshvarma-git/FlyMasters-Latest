import { usePWA } from '@student/hooks/usePWA';
import { Alert, AlertDescription } from '@student/components/ui/alert';
import { WifiOff, Wifi } from 'lucide-react';

export function OfflineIndicator() {
  const { isOnline } = usePWA();

  if (isOnline) return null;

  return (
    <Alert className="fixed top-4 left-4 right-4 z-50 bg-yellow-50 border-yellow-200 md:left-auto md:right-4 md:w-96">
      <WifiOff className="h-4 w-4 text-yellow-600" />
      <AlertDescription className="text-yellow-800">
        You're currently offline. Some features may be limited.
      </AlertDescription>
    </Alert>
  );
}