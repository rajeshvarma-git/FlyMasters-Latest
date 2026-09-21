import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@student/integrations/supabase/client';
import { Card } from '@student/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@student/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@student/components/ui/select';
import { BarChart, Bar, LineChart, Line, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { TrendingUp, DollarSign, Users, MapPin, Calendar, Package } from 'lucide-react';

export default function TravelAnalyticsAdmin() {
  const [dateRange, setDateRange] = useState('30');

  const { data: bookingStats } = useQuery({
    queryKey: ['travel-booking-stats', dateRange],
    queryFn: async () => {
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - parseInt(dateRange));

      const { data, error } = await supabase
        .from('travel_booking_analytics')
        .select('*, package_bookings(status), travel_packages(package_name, destination)')
        .gte('booking_date', startDate.toISOString().split('T')[0])
        .order('booking_date', { ascending: true });

      if (error) throw error;
      return data;
    },
  });

  const { data: revenueData } = useQuery({
    queryKey: ['travel-revenue', dateRange],
    queryFn: async () => {
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - parseInt(dateRange));

      const { data, error } = await supabase
        .from('package_bookings')
        .select('final_amount, created_at')
        .gte('created_at', startDate.toISOString())
        .order('created_at', { ascending: true });

      if (error) throw error;
      return data;
    },
  });

  const { data: popularPackages } = useQuery({
    queryKey: ['popular-packages', dateRange],
    queryFn: async () => {
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - parseInt(dateRange));

      const { data, error } = await supabase
        .from('travel_booking_analytics')
        .select('package_id, travel_packages(package_name), count')
        .gte('booking_date', startDate.toISOString().split('T')[0]);

      if (error) throw error;

      // Group by package and count
      const packageCounts = data.reduce((acc: any, item: any) => {
        const packageName = item.travel_packages?.package_name || 'Unknown';
        acc[packageName] = (acc[packageName] || 0) + 1;
        return acc;
      }, {});

      return Object.entries(packageCounts).map(([name, count]) => ({
        name,
        value: count,
      }));
    },
  });

      const { data: conversionStats } = useQuery({
    queryKey: ['conversion-stats', dateRange],
    queryFn: async () => {
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - parseInt(dateRange));

      const [leadsResult, bookingsResult] = await Promise.all([
        supabase
          .from('travel_leads')
          .select('id', { count: 'exact' })
          .gte('created_at', startDate.toISOString()),
        supabase
          .from('package_bookings')
          .select('id', { count: 'exact' })
          .gte('created_at', startDate.toISOString()),
      ]);

      const totalLeads = leadsResult.count || 0;
      const totalBookings = bookingsResult.count || 0;
      const conversionRate = totalLeads > 0 ? (totalBookings / totalLeads) * 100 : 0;

      return { totalLeads, totalBookings, conversionRate };
    },
  });

  const totalRevenue = revenueData?.reduce((sum, booking) => sum + (Number(booking.final_amount) || 0), 0) || 0;
  const totalBookings = bookingStats?.length || 0;

  const bookingTrends = bookingStats?.reduce((acc: any[], booking) => {
    const date = new Date(booking.booking_date).toLocaleDateString();
    const existing = acc.find(item => item.date === date);
    if (existing) {
      existing.bookings += 1;
    } else {
      acc.push({ date, bookings: 1 });
    }
    return acc;
  }, []) || [];

  const revenueTrends = revenueData?.reduce((acc: any[], booking) => {
    const date = new Date(booking.created_at).toLocaleDateString();
    const existing = acc.find(item => item.date === date);
    if (existing) {
      existing.revenue += Number(booking.final_amount) || 0;
    } else {
      acc.push({ date, revenue: Number(booking.final_amount) || 0 });
    }
    return acc;
  }, []) || [];

  const COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042', '#8884D8'];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-3xl font-bold">Travel Analytics Dashboard</h2>
          <p className="text-muted-foreground">Comprehensive insights into your travel business</p>
        </div>
        <Select value={dateRange} onValueChange={setDateRange}>
          <SelectTrigger className="w-40">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="7">Last 7 days</SelectItem>
            <SelectItem value="30">Last 30 days</SelectItem>
            <SelectItem value="90">Last 90 days</SelectItem>
            <SelectItem value="365">Last year</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-muted-foreground">Total Revenue</p>
              <h3 className="text-2xl font-bold">${totalRevenue.toLocaleString()}</h3>
            </div>
            <DollarSign className="w-8 h-8 text-green-600" />
          </div>
        </Card>

        <Card className="p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-muted-foreground">Total Bookings</p>
              <h3 className="text-2xl font-bold">{totalBookings}</h3>
            </div>
            <Package className="w-8 h-8 text-blue-600" />
          </div>
        </Card>

        <Card className="p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-muted-foreground">Conversion Rate</p>
              <h3 className="text-2xl font-bold">{conversionStats?.conversionRate.toFixed(1)}%</h3>
            </div>
            <TrendingUp className="w-8 h-8 text-purple-600" />
          </div>
        </Card>

        <Card className="p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-muted-foreground">Total Leads</p>
              <h3 className="text-2xl font-bold">{conversionStats?.totalLeads || 0}</h3>
            </div>
            <Users className="w-8 h-8 text-orange-600" />
          </div>
        </Card>
      </div>

      {/* Charts */}
      <Tabs defaultValue="bookings" className="space-y-4">
        <TabsList>
          <TabsTrigger value="bookings">Booking Trends</TabsTrigger>
          <TabsTrigger value="revenue">Revenue Trends</TabsTrigger>
          <TabsTrigger value="packages">Popular Packages</TabsTrigger>
          <TabsTrigger value="demographics">Demographics</TabsTrigger>
        </TabsList>

        <TabsContent value="bookings" className="space-y-4">
          <Card className="p-6">
            <h3 className="text-lg font-semibold mb-4">Booking Trends</h3>
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={bookingTrends}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="date" />
                <YAxis />
                <Tooltip />
                <Legend />
                <Line type="monotone" dataKey="bookings" stroke="#8884d8" name="Bookings" />
              </LineChart>
            </ResponsiveContainer>
          </Card>
        </TabsContent>

        <TabsContent value="revenue" className="space-y-4">
          <Card className="p-6">
            <h3 className="text-lg font-semibold mb-4">Revenue Trends</h3>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={revenueTrends}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="date" />
                <YAxis />
                <Tooltip />
                <Legend />
                <Bar dataKey="revenue" fill="#82ca9d" name="Revenue ($)" />
              </BarChart>
            </ResponsiveContainer>
          </Card>
        </TabsContent>

        <TabsContent value="packages" className="space-y-4">
          <Card className="p-6">
            <h3 className="text-lg font-semibold mb-4">Popular Packages</h3>
            <ResponsiveContainer width="100%" height={300}>
              <PieChart>
                <Pie
                  data={popularPackages}
                  cx="50%"
                  cy="50%"
                  labelLine={false}
                  label={({ name, percent }) => `${name}: ${(percent * 100).toFixed(0)}%`}
                  outerRadius={80}
                  fill="#8884d8"
                  dataKey="value"
                >
                  {popularPackages?.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          </Card>
        </TabsContent>

        <TabsContent value="demographics" className="space-y-4">
          <Card className="p-6">
            <h3 className="text-lg font-semibold mb-4">Customer Demographics</h3>
            <div className="space-y-4">
              <div className="flex items-center justify-between p-4 bg-muted rounded-lg">
                <div className="flex items-center gap-3">
                  <MapPin className="w-5 h-5 text-primary" />
                  <span>Top Countries</span>
                </div>
                <span className="font-semibold">Coming Soon</span>
              </div>
              <div className="flex items-center justify-between p-4 bg-muted rounded-lg">
                <div className="flex items-center gap-3">
                  <Users className="w-5 h-5 text-primary" />
                  <span>Age Groups</span>
                </div>
                <span className="font-semibold">Coming Soon</span>
              </div>
            </div>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
