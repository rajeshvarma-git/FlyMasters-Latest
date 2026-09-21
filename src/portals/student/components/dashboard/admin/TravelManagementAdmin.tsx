import { Tabs, TabsContent, TabsList, TabsTrigger } from '@student/components/ui/tabs';
import { Card } from '@student/components/ui/card';
import { Plane, Tag, Newspaper, Package } from 'lucide-react';
import TravelServicesAdmin from './TravelServicesAdmin';
import TravelOffersAdmin from './TravelOffersAdmin';
import TravelNewsAdmin from './TravelNewsAdmin';
import TravelPackagesAdmin from './TravelPackagesAdmin';

export default function TravelManagementAdmin() {
  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <div className="w-12 h-12 rounded-full bg-gradient-to-r from-primary to-blue-600 flex items-center justify-center">
          <Plane className="w-6 h-6 text-white" />
        </div>
        <div>
          <h1 className="text-3xl font-bold">Travel Agency Management</h1>
          <p className="text-muted-foreground">Manage travel services, offers, and news updates</p>
        </div>
      </div>

      <Card className="p-6">
        <Tabs defaultValue="packages" className="w-full">
          <TabsList className="grid w-full grid-cols-4 mb-6">
            <TabsTrigger value="packages" className="gap-2">
              <Package className="h-4 w-4" />
              Packages
            </TabsTrigger>
            <TabsTrigger value="services" className="gap-2">
              <Plane className="h-4 w-4" />
              Services
            </TabsTrigger>
            <TabsTrigger value="offers" className="gap-2">
              <Tag className="h-4 w-4" />
              Offers
            </TabsTrigger>
            <TabsTrigger value="news" className="gap-2">
              <Newspaper className="h-4 w-4" />
              News
            </TabsTrigger>
          </TabsList>

          <TabsContent value="packages">
            <TravelPackagesAdmin />
          </TabsContent>

          <TabsContent value="services">
            <TravelServicesAdmin />
          </TabsContent>

          <TabsContent value="offers">
            <TravelOffersAdmin />
          </TabsContent>

          <TabsContent value="news">
            <TravelNewsAdmin />
          </TabsContent>
        </Tabs>
      </Card>
    </div>
  );
}
