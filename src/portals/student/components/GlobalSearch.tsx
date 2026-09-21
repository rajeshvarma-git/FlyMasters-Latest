import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, Clock, Command } from 'lucide-react';
import {
  Dialog,
  DialogContent,
} from '@student/components/ui/dialog';
import { Input } from '@student/components/ui/input';
import { ScrollArea } from '@student/components/ui/scroll-area';
import { useGlobalSearch, SearchResult } from '@student/hooks/useGlobalSearch';
import { cn } from '@student/lib/utils';

interface GlobalSearchProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  userRole?: string | null;
  userId?: string;
}

export function GlobalSearch({ open, onOpenChange, userRole, userId }: GlobalSearchProps) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const { search, recentSearches, saveRecentSearch, isLoading } = useGlobalSearch({ 
    userRole: userRole || null, 
    userId 
  });
  const navigate = useNavigate();

  // Perform search when query changes
  useEffect(() => {
    const performSearch = async () => {
      if (query.trim()) {
        const searchResults = await search(query);
        setResults(searchResults);
      } else {
        setResults([]);
      }
      setSelectedIndex(0);
    };

    const debounce = setTimeout(performSearch, 300);
    return () => clearTimeout(debounce);
  }, [query, search]);

  // Handle keyboard navigation
  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    const displayResults = query.trim() ? results : recentSearches;
    
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex(prev => (prev + 1) % displayResults.length);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex(prev => (prev - 1 + displayResults.length) % displayResults.length);
    } else if (e.key === 'Enter' && displayResults[selectedIndex]) {
      e.preventDefault();
      handleSelectResult(displayResults[selectedIndex]);
    } else if (e.key === 'Escape') {
      onOpenChange(false);
    }
  }, [query, results, recentSearches, selectedIndex, onOpenChange]);

  const handleSelectResult = (result: SearchResult) => {
    saveRecentSearch(result);
    navigate(result.path);
    onOpenChange(false);
    setQuery('');
  };

  const displayResults = query.trim() ? results : recentSearches;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="p-0 gap-0 max-w-2xl">
        <div className="flex items-center border-b px-3">
          <Search className="h-4 w-4 opacity-50" />
          <Input
            placeholder="Search anything..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            className="border-0 focus-visible:ring-0 focus-visible:ring-offset-0"
            autoFocus
          />
          <div className="flex items-center gap-1 text-xs text-muted-foreground">
            <Command className="h-3 w-3" />
            <span>K</span>
          </div>
        </div>

        <ScrollArea className="max-h-[400px]">
          {isLoading ? (
            <div className="p-4 text-center text-sm text-muted-foreground">
              Searching...
            </div>
          ) : displayResults.length > 0 ? (
            <div className="p-2">
              {!query.trim() && (
                <div className="px-2 py-1.5 text-xs font-medium text-muted-foreground flex items-center gap-2">
                  <Clock className="h-3 w-3" />
                  Recent Searches
                </div>
              )}
              {displayResults.map((result, index) => (
                <button
                  key={result.id}
                  onClick={() => handleSelectResult(result)}
                  className={cn(
                    "w-full text-left px-3 py-2.5 rounded-md transition-colors",
                    "hover:bg-accent",
                    selectedIndex === index && "bg-accent"
                  )}
                  onMouseEnter={() => setSelectedIndex(index)}
                >
                  <div className="flex items-start gap-3">
                    <div className="mt-0.5">
                      <div className="h-8 w-8 rounded-md bg-primary/10 flex items-center justify-center">
                        <span className="text-xs font-medium text-primary">
                          {result.category.substring(0, 2).toUpperCase()}
                        </span>
                      </div>
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="font-medium text-sm">{result.title}</div>
                      <div className="text-xs text-muted-foreground truncate">
                        {result.description}
                      </div>
                      <div className="text-xs text-muted-foreground mt-1">
                        {result.category}
                      </div>
                    </div>
                  </div>
                </button>
              ))}
            </div>
          ) : query.trim() ? (
            <div className="p-8 text-center">
              <p className="text-sm text-muted-foreground">No results found</p>
              <p className="text-xs text-muted-foreground mt-1">
                Try searching with different keywords
              </p>
            </div>
          ) : (
            <div className="p-8 text-center">
              <Search className="h-8 w-8 mx-auto opacity-20 mb-2" />
              <p className="text-sm text-muted-foreground">
                Start typing to search
              </p>
            </div>
          )}
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}
