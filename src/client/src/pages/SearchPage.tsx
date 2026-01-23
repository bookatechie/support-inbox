/**
 * Dedicated Search Page
 * Advanced search interface for tickets
 */

import { useState, useEffect, useRef } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { tickets as ticketsApi, users as usersApi, tags as tagsApi } from '@/lib/api';
import { useAuth } from '@/contexts/AuthContext';
import type { Ticket, User, Tag } from '@/types';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Loader2, Search, X, UserCircle, MessageSquare, Paperclip, Inbox } from 'lucide-react';
import { STATUS_COLORS, PRIORITY_COLORS, STATUS_LABELS } from '@/lib/constants';
import { formatRelativeTime, formatNumber } from '@/lib/formatters';
import { Avatar } from '@/components/Avatar';
import { BackButton } from '@/components/BackButton';
import { toast } from 'sonner';
import { fetchWithCache } from '@/lib/cache';

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
  const [users, setUsers] = useState<User[]>([]);
  const [tags, setTags] = useState<Tag[]>([]);
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

    // Update URL params (pushes to browser history)
    setSearchParams({ query });

    // Trigger the search
    setDebouncedSearchQuery(query);
  };

  // Load users and tags on mount (with caching)
  useEffect(() => {
    const loadData = async () => {
      try {
        const [usersData, tagsData] = await Promise.all([
          fetchWithCache('users', () => usersApi.getAll()),
          fetchWithCache('tags', () => tagsApi.getAll()),
        ]);

        setUsers(usersData);
        setTags(tagsData);
      } catch (error) {
        console.error('Failed to load data:', error);
      }
    };

    loadData();
  }, []);

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
      <header className="sticky top-0 z-50 border-b bg-background">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center gap-4">
            <BackButton to="/tickets" />
            <Search className="h-6 w-6" />
            <h1 className="text-xl font-bold">Search Tickets</h1>
          </div>
        </div>
      </header>

      <div className="container mx-auto px-4 py-6 max-w-6xl">
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
                  onChange={(e) => setSearchQuery(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      handleSearch();
                    }
                  }}
                  onFocus={() => setShowSuggestions(true)}
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
                  <Select value={statusFilter} onValueChange={setStatusFilter}>
                    <SelectTrigger>
                      <SelectValue placeholder="Status" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Status</SelectItem>
                      <SelectItem value="new_or_open">New or Open</SelectItem>
                      <SelectItem value="awaiting_customer">{STATUS_LABELS.awaiting_customer}</SelectItem>
                      <SelectItem value="resolved">{STATUS_LABELS.resolved}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <Select value={assigneeFilter} onValueChange={setAssigneeFilter}>
                    <SelectTrigger>
                      <SelectValue placeholder="Assignee" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Tickets</SelectItem>
                      <SelectItem value="me">Assigned to Me</SelectItem>
                      <SelectItem value="unassigned">Unassigned</SelectItem>
                      {users.length > 0 && (
                        <>
                          <div className="h-px bg-border my-1" />
                          {[...users]
                            .sort((a, b) => a.name.localeCompare(b.name))
                            .map((u) => (
                              <SelectItem key={u.id} value={u.id.toString()}>
                                {u.name}
                              </SelectItem>
                            ))}
                        </>
                      )}
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <Select value={tagFilter} onValueChange={setTagFilter}>
                    <SelectTrigger>
                      <SelectValue placeholder="Tag" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Tags</SelectItem>
                      {tags.length > 0 && (
                        <>
                          <div className="h-px bg-border my-1" />
                          {[...tags]
                            .sort((a, b) => a.name.localeCompare(b.name))
                            .map((tag) => (
                              <SelectItem key={tag.id} value={tag.id.toString()}>
                                {tag.name}
                              </SelectItem>
                            ))}
                        </>
                      )}
                    </SelectContent>
                  </Select>
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
                  ? `Showing ${formatNumber(tickets.length)} of ${formatNumber(totalCount)} result${totalCount !== 1 ? 's' : ''}`
                  : `${formatNumber(tickets.length)} result${tickets.length !== 1 ? 's' : ''} found`
                }
              </h2>
            </div>

            {tickets.length === 0 && !isSearching ? (
              <Card className="p-8 text-center text-muted-foreground">
                No tickets found matching your search
              </Card>
            ) : (
              <div className="space-y-2">
                {tickets.map((ticket) => (
                  <Card key={ticket.id} className="hover:bg-accent/50 transition-colors">
                    <Link
                      to={`/tickets/${ticket.id}`}
                      className="flex-1 p-4 cursor-pointer block"
                    >
                      <div className="flex flex-col lg:flex-row lg:items-start gap-4 lg:gap-6">
                        {/* Left Column - Main Ticket Info */}
                        <div className="flex items-start gap-4 flex-1 min-w-0">
                          <Avatar
                            name={ticket.customer_name || ticket.customer_email}
                            email={ticket.customer_email}
                            size="md"
                            className="hidden sm:flex"
                          />
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-1 flex-wrap">
                              <span className="font-medium text-base truncate">{ticket.customer_name || ticket.customer_email}</span>
                              <Badge className={`${STATUS_COLORS[ticket.status]} text-white text-xs`}>
                                {ticket.status.replace('_', ' ')}
                              </Badge>
                              {ticket.priority !== 'normal' && (
                                <Badge className={`${PRIORITY_COLORS[ticket.priority]} text-white text-xs`}>
                                  {ticket.priority}
                                </Badge>
                              )}
                              {ticket.tags && ticket.tags.length > 0 && (
                                <>
                                  {ticket.tags.map((tag) => (
                                    <Badge key={tag.id} variant="outline" className="text-xs">
                                      {tag.name}
                                    </Badge>
                                  ))}
                                </>
                              )}
                            </div>
                            <div className="text-muted-foreground mb-1 text-sm line-clamp-2">
                              {ticket.subject}
                            </div>
                            <div className="flex items-center gap-2 text-xs text-muted-foreground flex-wrap">
                              <span>#{ticket.id}</span>
                              <span>•</span>
                              <div className="flex items-center gap-1">
                                <UserCircle className="h-3.5 w-3.5" />
                                <span>{getAssigneeName(ticket.assignee_id) || 'Unassigned'}</span>
                              </div>
                              <span>•</span>
                              <div className="flex items-center gap-1">
                                <MessageSquare className="h-3.5 w-3.5" />
                                <span>{ticket.message_count}</span>
                              </div>
                              {ticket.attachment_count > 0 && (
                                <>
                                  <span>•</span>
                                  <div className="flex items-center gap-1">
                                    <Paperclip className="h-3.5 w-3.5" />
                                    <span>{ticket.attachment_count}</span>
                                  </div>
                                </>
                              )}
                              <span>•</span>
                              <div className="flex items-center gap-1">
                                <Inbox className="h-3.5 w-3.5" />
                                <span>{formatRelativeTime(ticket.created_at)}</span>
                              </div>
                            </div>
                          </div>
                        </div>

                        {/* Right Column - Message Preview */}
                        <div className="flex-1 min-w-0 pt-2 lg:pt-0 lg:pl-6 lg:border-l flex flex-col justify-center gap-2">
                          {ticket.last_message_sender_email && ticket.last_message_at && (
                            <div className="flex items-center gap-1 text-xs text-muted-foreground/60 truncate">
                              <span className="font-medium flex-shrink-0">Last:</span>
                              <span className="truncate">{ticket.last_message_sender_name || ticket.last_message_sender_email}</span>
                              <span className="flex-shrink-0">• {formatRelativeTime(ticket.last_message_at)}</span>
                            </div>
                          )}
                          {ticket.last_message_preview && (
                            <div className="text-xs text-muted-foreground/80 line-clamp-2">
                              {ticket.last_message_preview}
                            </div>
                          )}
                        </div>
                      </div>
                    </Link>
                  </Card>
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
