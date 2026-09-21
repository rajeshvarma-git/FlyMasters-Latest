import { Card } from '@student/components/ui/card';
import { Label } from '@student/components/ui/label';
import { Input } from '@student/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@student/components/ui/select';
import { Slider } from '@student/components/ui/slider';
import { Button } from '@student/components/ui/button';
import { Search, SlidersHorizontal } from 'lucide-react';

interface PackageFiltersProps {
  filters: {
    search: string;
    destination: string;
    minPrice: number;
    maxPrice: number;
    duration: string;
    difficulty: string;
  };
  onFilterChange: (filters: any) => void;
  onReset: () => void;
}

export default function PackageFilters({ filters, onFilterChange, onReset }: PackageFiltersProps) {
  return (
    <Card className="p-6">
      <div className="flex items-center gap-2 mb-6">
        <SlidersHorizontal className="w-5 h-5" />
        <h3 className="text-lg font-semibold">Filter Packages</h3>
      </div>

      <div className="space-y-6">
        <div>
          <Label>Search</Label>
          <div className="relative mt-2">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Search packages..."
              value={filters.search}
              onChange={(e) => onFilterChange({ ...filters, search: e.target.value })}
              className="pl-10"
            />
          </div>
        </div>

        <div>
          <Label>Destination</Label>
          <Select
            value={filters.destination}
            onValueChange={(value) => onFilterChange({ ...filters, destination: value })}
          >
            <SelectTrigger className="mt-2">
              <SelectValue placeholder="All destinations" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Destinations</SelectItem>
              <SelectItem value="europe">Europe</SelectItem>
              <SelectItem value="asia">Asia</SelectItem>
              <SelectItem value="america">America</SelectItem>
              <SelectItem value="australia">Australia</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div>
          <Label>Price Range: ${filters.minPrice} - ${filters.maxPrice}</Label>
          <Slider
            min={0}
            max={10000}
            step={100}
            value={[filters.minPrice, filters.maxPrice]}
            onValueChange={(value) =>
              onFilterChange({ ...filters, minPrice: value[0], maxPrice: value[1] })
            }
            className="mt-4"
          />
        </div>

        <div>
          <Label>Duration</Label>
          <Select
            value={filters.duration}
            onValueChange={(value) => onFilterChange({ ...filters, duration: value })}
          >
            <SelectTrigger className="mt-2">
              <SelectValue placeholder="Any duration" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Any Duration</SelectItem>
              <SelectItem value="1-3">1-3 Days</SelectItem>
              <SelectItem value="4-7">4-7 Days</SelectItem>
              <SelectItem value="8-14">8-14 Days</SelectItem>
              <SelectItem value="15+">15+ Days</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div>
          <Label>Difficulty</Label>
          <Select
            value={filters.difficulty}
            onValueChange={(value) => onFilterChange({ ...filters, difficulty: value })}
          >
            <SelectTrigger className="mt-2">
              <SelectValue placeholder="Any difficulty" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Any Difficulty</SelectItem>
              <SelectItem value="easy">Easy</SelectItem>
              <SelectItem value="moderate">Moderate</SelectItem>
              <SelectItem value="challenging">Challenging</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <Button variant="outline" onClick={onReset} className="w-full">
          Reset Filters
        </Button>
      </div>
    </Card>
  );
}
