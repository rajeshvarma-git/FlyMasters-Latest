import { useState } from 'react';
import { usePWA } from '@student/hooks/usePWA';
import { Button } from '@student/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@student/components/ui/card';
import { X, Download } from 'lucide-react';

const DISMISS_KEY = 'pwa-install-dismissed-at';
const DISMISS_MS = 7 * 24 * 60 * 60 * 1000;

function wasRecentlyDismissed() {
  const raw = localStorage.getItem(DISMISS_KEY);
  if (!raw) return false;
  const dismissedAt = Number(raw);
  return Number.isFinite(dismissedAt) && Date.now() - dismissedAt < DISMISS_MS;
}

export function PWAInstallPrompt() {
  const { isInstallable, installApp } = usePWA();
  const [isDismissed, setIsDismissed] = useState(wasRecentlyDismissed);

  if (!isInstallable || isDismissed) return null;

  const handleInstall = async () => {
    const success = await installApp();
    if (success) {
      setIsDismissed(true);
    }
  };

  const handleDismiss = () => {
    localStorage.setItem(DISMISS_KEY, String(Date.now()));
    setIsDismissed(true);
  };

  return (
    <Card className="fixed bottom-4 left-4 right-4 z-50 glass-card border-primary/20 md:left-auto md:right-4 md:w-96">
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            <img
              src="/icon-192.png"
              alt="Fly Masters"
              className="h-10 w-10 rounded-xl object-cover shadow-sm"
            />
            <div>
              <CardTitle className="text-lg">Install Fly Masters</CardTitle>
              <CardDescription className="text-sm">
                Add the app to your device for faster access
              </CardDescription>
            </div>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={handleDismiss}
            className="p-1 h-8 w-8"
            aria-label="Dismiss install prompt"
          >
            <X className="w-4 h-4" />
          </Button>
        </div>
      </CardHeader>
      
      <CardContent className="pt-0">
        <div className="space-y-3">
          <ul className="text-sm space-y-1 text-muted-foreground">
            <li>• Open like a native app</li>
            <li>• Faster loading on return visits</li>
            <li>• Works on your Home Screen</li>
          </ul>
          
          <div className="flex gap-2">
            <Button onClick={handleInstall} size="sm" className="flex-1">
              <Download className="w-4 h-4 mr-2" />
              Install Now
            </Button>
            <Button variant="outline" size="sm" onClick={handleDismiss}>
              Later
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
