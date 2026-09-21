import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@student/components/ui/dialog';
import { Button } from '@student/components/ui/button';
import { Card } from '@student/components/ui/card';
import { Checkbox } from '@student/components/ui/checkbox';
import { Badge } from '@student/components/ui/badge';
import { GitCompare, X } from 'lucide-react';

interface TravelPackage {
  id: string;
  package_name: string;
  destination: string;
  duration_days: number;
  price_per_person: number;
  inclusions: string[];
  max_travelers?: number;
  difficulty_level: string;
}

interface PackageComparisonProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  packages: TravelPackage[];
}

export default function PackageComparison({ open, onOpenChange, packages }: PackageComparisonProps) {
  const [selectedPackages, setSelectedPackages] = useState<string[]>([]);

  const togglePackage = (packageId: string) => {
    setSelectedPackages((prev) =>
      prev.includes(packageId)
        ? prev.filter((id) => id !== packageId)
        : prev.length < 3
        ? [...prev, packageId]
        : prev
    );
  };

  const comparePackages = packages.filter((pkg) => selectedPackages.includes(pkg.id));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-6xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Compare Travel Packages</DialogTitle>
          </DialogHeader>

          {selectedPackages.length === 0 ? (
            <div className="py-8">
              <p className="text-center text-muted-foreground mb-6">
                Select up to 3 packages to compare
              </p>
              <div className="space-y-2">
                {packages.map((pkg) => (
                  <div key={pkg.id} className="flex items-center gap-3 p-3 border rounded">
                    <Checkbox
                      checked={selectedPackages.includes(pkg.id)}
                      onCheckedChange={() => togglePackage(pkg.id)}
                      disabled={selectedPackages.length >= 3 && !selectedPackages.includes(pkg.id)}
                    />
                    <span>{pkg.package_name}</span>
                    <Badge variant="outline">${pkg.price_per_person}</Badge>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr>
                    <th className="text-left p-4 border-b">Feature</th>
                    {comparePackages.map((pkg) => (
                      <th key={pkg.id} className="p-4 border-b">
                        <div className="flex items-center justify-between">
                          <span className="font-semibold">{pkg.package_name}</span>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => togglePackage(pkg.id)}
                          >
                            <X className="w-4 h-4" />
                          </Button>
                        </div>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td className="p-4 border-b font-medium">Destination</td>
                    {comparePackages.map((pkg) => (
                      <td key={pkg.id} className="p-4 border-b text-center">
                        {pkg.destination}
                      </td>
                    ))}
                  </tr>
                  <tr>
                    <td className="p-4 border-b font-medium">Price</td>
                    {comparePackages.map((pkg) => (
                      <td key={pkg.id} className="p-4 border-b text-center">
                        ${pkg.price_per_person}
                      </td>
                    ))}
                  </tr>
                  <tr>
                    <td className="p-4 border-b font-medium">Duration</td>
                    {comparePackages.map((pkg) => (
                      <td key={pkg.id} className="p-4 border-b text-center">
                        {pkg.duration_days} days
                      </td>
                    ))}
                  </tr>
                  <tr>
                    <td className="p-4 border-b font-medium">Max Travelers</td>
                    {comparePackages.map((pkg) => (
                      <td key={pkg.id} className="p-4 border-b text-center">
                        {pkg.max_travelers}
                      </td>
                    ))}
                  </tr>
                  <tr>
                    <td className="p-4 border-b font-medium">Difficulty</td>
                    {comparePackages.map((pkg) => (
                      <td key={pkg.id} className="p-4 border-b text-center">
                        <Badge>{pkg.difficulty_level}</Badge>
                      </td>
                    ))}
                  </tr>
                  <tr>
                    <td className="p-4 font-medium">Inclusions</td>
                    {comparePackages.map((pkg) => (
                      <td key={pkg.id} className="p-4 text-center">
                        <ul className="text-sm space-y-1">
                          {pkg.inclusions?.slice(0, 5).map((item, i) => (
                            <li key={i}>✓ {item}</li>
                          ))}
                        </ul>
                      </td>
                    ))}
                  </tr>
                </tbody>
              </table>
            </div>
          )}
        </DialogContent>
      </Dialog>
  );
}
