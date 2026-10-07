/**
 * Dedicated Search Page
 * Advanced search interface for tickets
 */

import { useState, useEffect, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import { tickets as ticketsApi } from '@/lib/api';
import { useAuth } from '@/contexts/AuthContext';
import type { Ticket } from '@/types';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Loader2, Search, X } from 'lucide-react';
import { formatNumber } from '@/lib/formatters';
import { Avatar } from '@/components/Avatar';
import { toast } from 'sonner';
import { AppHeader } from '@/components/AppHeader';
import { PageHeader } from '@/components/PageHeader';
import { EmptyState } from '@/components/EmptyState';
import { TicketRow } from '@/components/TicketRow';
import { StatusFilterSelect, AssigneeFilterSelect, TagFilterSelect } from '@/components/TicketFilterSelects';
import { useUsers, useActiveUsers } from '@/hooks/useUsers';
import { useTags } from '@/hooks/useTags';

const MAX_RECENT_SEARCHES = 5;

export function SearchPage() {
  const { user } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedSearchQuery, setDebouncedSearchQuery] = useState('');
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [nextOffset, setNextOffset] = useState<number | null>(null);
  const [totalCount, setTotalCount] = useState(0);
  const [totalCapped, setTotalCapped] = useState(false);
  const { data: users = [] } = useUsers();
  const activeUsers = useActiveUsers();
  const { data: tags = [] } = useTags();
  const loadMoreRef = useRef<HTMLDivElement>(null);

  // Advanced filters
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [assigneeFilter, setAssigneeFilter] = useState<string>('all');
  const [tagFilter, setTagFilter] = useState<string>('all');

  // Recent searches
  const [recentSearches, setRecentSearches] = useState<string[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const searchInputRef = useRef<HTMLInputElement>(null);

  // Load query from URL parameter
  useEffect(() => {
    const queryParam = searchParams.get('query');
    if (queryParam) {
      setSearchQuery(queryParam);
      setDebouncedSearchQuery(queryParam);
    }
  }, [searchParams]);

  // Load recent searches from localStorage
  useEffect(() => {
    try {
      const stored = localStorage.getItem('recentSearches');
      if (stored) {
        setRecentSearches(JSON.parse(stored));
      }
    } catch (error) {
      console.error('Failed to load recent searches:', error);
    }
  }, []);

  // Perform search when debounced query changes
  useEffect(() => {
    if (debouncedSearchQuery.trim()) {
      performSearch();
    }
  }, [debouncedSearchQuery, statusFilter, assigneeFilter, tagFilter]);

  // Handle search submission - updates URL history and triggers search
  const handleSearch = () => {
    const query = searchQuery.trim();
    if (!query) return;

    // Close the recent-searches dropdown: the input keeps focus, so onBlur won't fire
    setShowSuggestions(false);

    // Update URL params (pushes to browser history)
    setSearchParams({ query });

    // Trigger the search
    setDebouncedSearchQuery(query);
  };

  const performSearch = async (offset?: number) => {
    if (!debouncedSearchQuery.trim()) return;

    try {
      const isLoadingMore = offset !== undefined && offset > 0;

      if (isLoadingMore) {
        setIsLoadingMore(true);
      } else {
        setIsSearching(true);
        setHasSearched(true);
      }

      const filters: any = {
        search: debouncedSearchQuery.trim(),
        limit: 50,
      };

      if (offset) {
        filters.offset = offset;
      }

      // Apply filters
      if (statusFilter === 'new_or_open') {
        filters.status = 'new,open';
      } else if (statusFilter !== 'all') {
        filters.status = statusFilter;
      }

      if (assigneeFilter === 'unassigned') {
        filters.assignee_id = 'null';
      } else if (assigneeFilter === 'me' && user) {
        filters.assignee_id = user.id.toString();
      } else if (assigneeFilter !== 'all') {
        filters.assignee_id = assigneeFilter;
      }

      if (tagFilter !== 'all') {
        filters.tag_id = tagFilter;
      }

      const response = await ticketsApi.getAll(filters);

      // Append or replace tickets based on whether we're loading more
      if (isLoadingMore) {
        setTickets(prev => [...prev, ...response.tickets]);
      } else {
        setTickets(response.tickets);
      }

      setHasMore(response.pagination.hasMore);
      setNextOffset(response.pagination.nextOffset);
      setTotalCount(response.pagination.total);
      setTotalCapped(!!response.pagination.totalCapped);

      // Save to recent searches (only on initial search, not load more)
      if (!isLoadingMore) {
        saveRecentSearch(debouncedSearchQuery.trim());
      }
    } catch (error) {
      console.error('Search failed:', error);
      toast.error('Search failed');
    } finally {
      setIsSearching(false);
      setIsLoadingMore(false);
    }
  };

  const saveRecentSearch = (query: string) => {
    try {
      const updated = [query, ...recentSearches.filter(s => s !== query)].slice(0, MAX_RECENT_SEARCHES);
      setRecentSearches(updated);
      localStorage.setItem('recentSearches', JSON.stringify(updated));
    } catch (error) {
      console.error('Failed to save recent search:', error);
    }
  };

  const clearRecentSearches = () => {
    setRecentSearches([]);
    localStorage.removeItem('recentSearches');
  };

  const handleSuggestionClick = (suggestion: string) => {
    setSearchQuery(suggestion);
    setShowSuggestions(false);
    // Update URL and trigger search
    setSearchParams({ query: suggestion });
    setDebouncedSearchQuery(suggestion);
  };

  const clearSearch = () => {
    setSearchQuery('');
    setDebouncedSearchQuery('');
    setTickets([]);
    setHasSearched(false);
    setHasMore(false);
    setNextOffset(null);
    setTotalCount(0);
    setStatusFilter('all');
    setAssigneeFilter('all');
    setTagFilter('all');
  };

  // Load more tickets when scrolling to bottom
  const loadMore = async () => {
    if (!hasMore || isLoadingMore || !nextOffset) return;

    try {
      await performSearch(nextOffset);
    } catch (error) {
      console.error('Failed to load more tickets:', error);
    }
  };

  // Intersection Observer for infinite scroll
  useEffect(() => {
    if (!loadMoreRef.current || isSearching) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && hasMore && !isLoadingMore) {
          loadMore();
        }
      },
      { threshold: 0.1 }
    );

    observer.observe(loadMoreRef.current);

    return () => observer.disconnect();
  }, [hasMore, isLoadingMore, isSearching]);

  const getAssigneeName = (assigneeId: number | null) => {
    if (!assigneeId) return null;
    const assignee = users.find(u => u.id === assigneeId);
    return assignee?.name || null;
  };

  return (
    <div className="min-h-screen bg-muted/20">
      {/* Header */}
      <AppHeader>
        <PageHeader icon={Search} title="Search Tickets" subtitle="Find tickets by customer, subject, message content, tag or ticket number" />
      </AppHeader>

      <div className="container mx-auto px-2 sm:px-4 py-4 sm:py-6">
        {/* Search Box */}
        <Card className="p-6 mb-6">
          <div className="space-y-4">
            {/* Main Search Input */}
            <div className="flex gap-2">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-5 w-5 text-muted-foreground" />
                <Input
                  ref={searchInputRef}
                  id="search"
                  type="text"
                  placeholder="Search by subject, customer, content, tags, or ticket ID..."
                  value={searchQuery}
                  onChange={(e) => {
                    setSearchQuery(e.target.value);
                    setShowSuggestions(true); // typing a new search reopens it
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      handleSearch();
                    } else if (e.key === 'Escape') {
                      setShowSuggestions(false);
                    }
                  }}
                  onFocus={() => setShowSuggestions(true)}
                  onClick={() => setShowSuggestions(true)}
                  onBlur={() => setTimeout(() => setShowSuggestions(false), 200)}
                  className="pl-10 pr-10 h-12 text-base"
                  autoFocus
                />
                {searchQuery && (
                  <button
                    onClick={clearSearch}
                    className="absolute right-3 top-1/2 transform -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                    aria-label="Clear search"
                  >
                    <X className="h-5 w-5" />
                  </button>
                )}

                {/* Recent Search Suggestions */}
                {showSuggestions && recentSearches.length > 0 && (
                  <Card className="absolute top-full left-0 right-0 mt-2 p-2 z-10">
                    <div className="flex items-center justify-between px-2 py-1 mb-1">
                      <span className="text-xs text-muted-foreground font-medium">Recent Searches</span>
                      <button
                        onClick={clearRecentSearches}
                        className="text-xs text-muted-foreground hover:text-foreground"
                      >
                        Clear
                      </button>
                    </div>
                    {recentSearches.map((search, index) => (
                      <button
                        key={index}
                        onClick={() => handleSuggestionClick(search)}
                        className="w-full text-left px-3 py-2 text-sm hover:bg-accent rounded-md transition-colors"
                      >
                        {search}
                      </button>
                    ))}
                  </Card>
                )}
              </div>
              <Button
                onClick={handleSearch}
                disabled={!searchQuery.trim() || isSearching}
                className="h-12 px-6"
              >
                Search
              </Button>
            </div>

            {/* Advanced Filters */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <StatusFilterSelect value={statusFilter} onChange={setStatusFilter} />
                </div>

                <div>
                  <AssigneeFilterSelect value={assigneeFilter} onChange={setAssigneeFilter} users={activeUsers} />
                </div>

                <div>
                  <TagFilterSelect value={tagFilter} onChange={setTagFilter} tags={tags} />
                </div>
              </div>
          </div>
        </Card>

        {/* Results */}
        {hasSearched && (
          <div>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold flex items-center gap-2">
                {isSearching && <Loader2 className="h-5 w-5 animate-spin" />}
                {isSearching ? 'Searching...' : totalCount > 0
                  ? `Showing ${formatNumber(tickets.length)} of ${formatNumber(totalCount)}${totalCapped ? '+' : ''} result${totalCount !== 1 ? 's' : ''}`
                  : `${formatNumber(tickets.length)} result${tickets.length !== 1 ? 's' : ''} found`
                }
              </h2>
            </div>

            {tickets.length === 0 && !isSearching ? (
              <EmptyState
                icon={Search}
                title="No tickets found"
                description="Try a different name, email address, word or ticket number."
              />
            ) : (
              <div className="space-y-2">
                {tickets.map((ticket) => (
                  <TicketRow
                    key={ticket.id}
                    ticket={ticket}
                    assigneeName={getAssigneeName(ticket.assignee_id)}
                    avatar={
                      <Avatar
                        name={ticket.customer_name || ticket.customer_email}
                        email={ticket.customer_email}
                        size="md"
                        className="hidden sm:flex flex-shrink-0"
                      />
                    }
                  />
                ))}

                {/* Load More Trigger */}
                {hasMore && (
                  <div ref={loadMoreRef} className="py-8 flex justify-center">
                    <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                  </div>
                )}

                {/* Loading More Indicator */}
                {isLoadingMore && !hasMore && (
                  <div className="py-8 flex justify-center">
                    <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                  </div>
                )}

                {/* End of Results */}
                {!hasMore && tickets.length > 0 && !isLoadingMore && (
                  <div className="py-8 text-center text-sm text-muted-foreground">
                    End of results
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
