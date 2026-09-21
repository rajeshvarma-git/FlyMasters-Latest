import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@student/components/ui/card';
import { BarChart3 } from 'lucide-react';

export function AnalyticsSection() {
  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <div className="w-12 h-12 rounded-full bg-gradient-primary flex items-center justify-center">
          <BarChart3 className="w-6 h-6 text-white" />
        </div>
        <div>
          <h1 className="text-3xl font-bold">Analytics</h1>
          <p className="text-muted-foreground">Your application and engagement statistics</p>
        </div>
      </div>

      <Card className="glass-card">
        <CardContent className="p-12 text-center">
          <BarChart3 className="w-16 h-16 text-muted-foreground mx-auto mb-4" />
          <h3 className="text-xl font-semibold mb-2">Analytics Coming Soon</h3>
          <p className="text-muted-foreground">
            We're working on comprehensive analytics to help you track your application progress.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}