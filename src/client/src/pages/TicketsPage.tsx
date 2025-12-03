/**
 * Tickets list page
 * Displays all support tickets with filtering and real-time updates
 */

import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { tickets as ticketsApi, users as usersApi, tags as tagsApi } from '@/lib/api';
import { useSSE } from '@/hooks/useSSE';
import { useNotifications } from '@/hooks/useNotifications';
import { usePersistedFilters } from '@/hooks/usePersistedFilters';
import { useAuth } from '@/contexts/AuthContext';
import type { Ticket, TicketStatus, TicketPriority, NewTicketEvent, TicketUpdateEvent, User, Tag } from '@/types';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { FormModal } from '@/components/FormModal';
import { Input } from '@/components/ui/input';
import { Combobox } from '@/components/ui/combobox';
import { Label } from '@/components/ui/label';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { Separator } from '@/components/ui/separator';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Loader2, Mail, RefreshCw, LogOut, MessageSquare, Users, UserCircle, Moon, Sun, Monitor, Plus, Trash2, MoreVertical, Paperclip, Inbox, User as UserProfileIcon, Search, Menu, ArrowDownWideNarrow, ArrowUpNarrowWide, Bell, BellOff, Calendar } from 'lucide-react';
import { useTheme } from '@/hooks/useTheme';
import { STATUS_COLORS, PRIORITY_COLORS, STATUS_LABELS } from '@/lib/constants';
import { formatRelativeTime, formatNumber } from '@/lib/formatters';
import { Avatar } from '@/components/Avatar';
import { SelectableAvatar } from '@/components/SelectableAvatar';
import { RichTextEditor } from '@/components/RichTextEditor';
import { toast } from 'sonner';
import { fetchWithCache } from '@/lib/cache';

// ============================================================================
// Types and Defaults
// ============================================================================

interface TicketFilters {
  statusFilter: string;
  assigneeFilter: string;
  tagFilter: string;
  sortOrder: string;
}

const DEFAULT_TICKET_FILTERS: TicketFilters = {
  statusFilter: 'new_or_open',
  assigneeFilter: 'all',
  tagFilter: 'all',
  sortOrder: 'desc',
};

// ============================================================================
// TicketFilters Component
// ============================================================================

interface TicketFiltersProps {
  filters: TicketFilters;
  updateFilter: <K extends keyof TicketFilters>(key: K, value: string) => void;
  sortedActiveUsers: User[];
  sortedTags: Tag[];
  variant: 'desktop' | 'mobile';
  onFilterChange?: () => void;
}

function TicketFiltersComponent({
  filters,
  updateFilter,
  sortedActiveUsers,
  sortedTags,
  variant,
  onFilterChange,
}: TicketFiltersProps) {
  const handleChange = <K extends keyof TicketFilters>(key: K) => (value: string) => {
    updateFilter(key, value);
    onFilterChange?.();
  };

  const isMobile = variant === 'mobile';
  const triggerClass = isMobile ? 'w-full' : 'w-[180px]';

  return (
    <div className={isMobile ? 'space-y-3' : 'flex flex-wrap gap-4 items-center'}>
      {/* Status Filter */}
      <div className={isMobile ? '' : undefined}>
        {isMobile && <Label className="text-xs text-muted-foreground mb-1.5 block">Status</Label>}
        <Select value={filters.statusFilter} onValueChange={handleChange('statusFilter')}>
          <SelectTrigger className={triggerClass}>
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

      {/* Assignee Filter */}
      <div className={isMobile ? '' : undefined}>
        {isMobile && <Label className="text-xs text-muted-foreground mb-1.5 block">Assignee</Label>}
        <Select value={filters.assigneeFilter} onValueChange={handleChange('assigneeFilter')}>
          <SelectTrigger className={triggerClass}>
            <SelectValue placeholder="Assignee" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Tickets</SelectItem>
            <SelectItem value="me">Assigned to Me</SelectItem>
            <SelectItem value="unassigned">Unassigned</SelectItem>
            {sortedActiveUsers.length > 0 && (
              <>
                <div className="h-px bg-border my-1" />
                {sortedActiveUsers.map((u) => (
                  <SelectItem key={u.id} value={u.id.toString()}>
                    {u.name}
                  </SelectItem>
                ))}
              </>
            )}
          </SelectContent>
        </Select>
      </div>

      {/* Tag Filter */}
      <div className={isMobile ? '' : undefined}>
        {isMobile && <Label className="text-xs text-muted-foreground mb-1.5 block">Tag</Label>}
        <Select value={filters.tagFilter} onValueChange={handleChange('tagFilter')}>
          <SelectTrigger className={triggerClass}>
            <SelectValue placeholder="Tag" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Tags</SelectItem>
            {sortedTags.length > 0 && (
              <>
                <div className="h-px bg-border my-1" />
                {sortedTags.map((tag) => (
                  <SelectItem key={tag.id} value={tag.id.toString()}>
                    {tag.name}
                  </SelectItem>
                ))}
              </>
            )}
          </SelectContent>
        </Select>
      </div>

      {/* Sort Order - only shown in component on mobile */}
      {isMobile && (
        <div>
          <Label className="text-xs text-muted-foreground mb-1.5 block">Sort Order</Label>
          <Button
            variant="outline"
            className="w-full justify-start gap-2"
            onClick={() => {
              updateFilter('sortOrder', filters.sortOrder === 'desc' ? 'asc' : 'desc');
              onFilterChange?.();
            }}
          >
            {filters.sortOrder === 'desc' ? <ArrowDownWideNarrow className="h-4 w-4" /> : <ArrowUpNarrowWide className="h-4 w-4" />}
            {filters.sortOrder === 'desc' ? 'Newest First' : 'Oldest First'}
          </Button>
        </div>
      )}
    </div>
  );
}

// ============================================================================
// Main Component
// ============================================================================

export function TicketsPage() {
  const { user, logout, refreshUser } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const location = useLocation();
  const navigate = useNavigate();
  const { isSupported: notificationsSupported, permission: notificationPermission, isEnabled: notificationsEnabled, setEnabled: setNotificationsEnabled, requestPermission, notifyIfHidden } = useNotifications();
  const [allTickets, setAllTickets] = useState<Ticket[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isFiltering, setIsFiltering] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [nextOffset, setNextOffset] = useState<number | null>(null);
  const [totalCount, setTotalCount] = useState(0);
  const loadMoreRef = useRef<HTMLDivElement>(null);
  const isInitialMount = useRef(true);
  const reloadTimeoutRef = useRef<number | null>(null);
  const isLoadingTickets = useRef(false);

  // Filter state using custom hook
  const [users, setUsers] = useState<User[]>([]);
  const [tags, setTags] = useState<Tag[]>([]);
  const { filters, updateFilter, setFilters } = usePersistedFilters<TicketFilters>(
    'ticketsPageFilters',
    DEFAULT_TICKET_FILTERS
  );

  // Destructure for easier access and backwards compatibility
  const { statusFilter, assigneeFilter, tagFilter, sortOrder } = filters;

  // Memoize sorted lists to avoid re-sorting on every render
  const sortedActiveUsers = useMemo(() => {
    return [...users]
      .filter((u) => u.active && u.id !== user?.id)
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [users, user?.id]);

  const sortedTags = useMemo(() => {
    return [...tags].sort((a, b) => a.name.localeCompare(b.name));
  }, [tags]);
  const [customerEmails, setCustomerEmails] = useState<string[]>([]);
  const [showNewEmailModal, setShowNewEmailModal] = useState(false);
  const [newEmail, setNewEmail] = useState({
    to: '',
    subject: '',
  });
  const [selectedTicketIds, setSelectedTicketIds] = useState<Set<number>>(new Set());
  const [showBulkDeleteModal, setShowBulkDeleteModal] = useState(false);
  const [lastClickedIndex, setLastClickedIndex] = useState<number | null>(null);

  // Profile editing state
  const [showProfileModal, setShowProfileModal] = useState(false);
  const [profileSignature, setProfileSignature] = useState('');
  const [profileAiProfile, setProfileAiProfile] = useState('');
  const [isUpdatingProfile, setIsUpdatingProfile] = useState(false);
  const [profileError, setProfileError] = useState('');

  // Mobile menu state
  const [showMobileMenu, setShowMobileMenu] = useState(false);

  // Handle URL parameters (customer filter, new email modal)
  useEffect(() => {
    const params = new URLSearchParams(location.search);

    // Check for customer filter
    const customerEmail = params.get('customer');
    if (customerEmail) {
      updateFilter('statusFilter', 'all'); // Show all statuses when filtering by customer
    }

    // Check for new email parameters
    const emailParam = params.get('email');
    const subjectParam = params.get('subject');
    if (emailParam) {
      setNewEmail({
        to: emailParam,
        subject: subjectParam || '',
      });
      setShowNewEmailModal(true);
    }
  }, [location.search]);

  // Build API filters from current filter state
  const buildApiFilters = (offset?: number) => {
    const filters: any = { limit: 50 };

    if (offset) {
      filters.offset = offset;
    }

    // Status filter
    if (statusFilter === 'new_or_open') {
      filters.status = 'new,open'; // Backend supports comma-separated values
    } else if (statusFilter !== 'all') {
      filters.status = statusFilter;
    }

    // Assignee filter
    if (assigneeFilter === 'unassigned') {
      filters.assignee_id = 'null';
    } else if (assigneeFilter === 'me' && user) {
      filters.assignee_id = user.id.toString();
    } else if (assigneeFilter !== 'all') {
      // Specific user ID selected
      filters.assignee_id = assigneeFilter;
    }

    // Tag filter
    if (tagFilter !== 'all') {
      filters.tag_id = tagFilter;
    }

    // Sort order
    filters.sort_order = sortOrder;

    // Customer email from URL
    const params = new URLSearchParams(location.search);
    const customerEmail = params.get('customer');
    if (customerEmail) {
      filters.customer_email = customerEmail;
    }

    return filters;
  };

  // Load tickets
  const loadTickets = async (isInitialLoad = false) => {
    // Prevent concurrent requests
    if (isLoadingTickets.current) {
      return;
    }

    try {
      isLoadingTickets.current = true;
      const filters = buildApiFilters();
      const response = await ticketsApi.getAll(filters);
      setAllTickets(response.tickets);
      setHasMore(response.pagination.hasMore);
      setNextOffset(response.pagination.nextOffset);
      setTotalCount(response.pagination.total);
    } catch (error) {
      console.error('Failed to load tickets:', error);
    } finally {
      isLoadingTickets.current = false;
      if (isInitialLoad) {
        setIsLoading(false);
      } else {
        setIsFiltering(false);
      }
    }
  };

  // Load more tickets
  const loadMore = async () => {
    if (!hasMore || isLoadingMore || nextOffset === null) return;

    try {
      setIsLoadingMore(true);
      const filters = buildApiFilters(nextOffset);
      const response = await ticketsApi.getAll(filters);
      setAllTickets(prev => [...prev, ...response.tickets]);
      setHasMore(response.pagination.hasMore);
      setNextOffset(response.pagination.nextOffset);
    } catch (error) {
      console.error('Failed to load more tickets:', error);
    } finally {
      setIsLoadingMore(false);
    }
  };

  // Reload tickets when filters change
  useEffect(() => {
    // Cancel any pending SSE reload when filters change
    if (reloadTimeoutRef.current) {
      clearTimeout(reloadTimeoutRef.current);
      reloadTimeoutRef.current = null;
    }

    if (isInitialMount.current) {
      // First load - use full page loader
      isInitialMount.current = false;
      setIsLoading(true);
      loadTickets(true);
    } else {
      // Subsequent filter changes - clear old results and use filtering state
      setIsFiltering(true);
      setAllTickets([]); // Clear old results immediately to prevent showing stale data
      setHasMore(false);
      setNextOffset(null);
      loadTickets(false);
    }

    // Reset ref on cleanup for React 18 Strict Mode
    return () => {
      isInitialMount.current = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [statusFilter, assigneeFilter, tagFilter, sortOrder, location.search]);

  // Restore scroll position after tickets are loaded
  useEffect(() => {
    if (!isLoading && allTickets.length > 0) {
      try {
        const savedScrollPosition = sessionStorage.getItem('ticketsPageScrollPosition');
        if (savedScrollPosition) {
          // Use setTimeout to ensure DOM is fully rendered
          setTimeout(() => {
            window.scrollTo(0, parseInt(savedScrollPosition, 10));
            sessionStorage.removeItem('ticketsPageScrollPosition');
          }, 0);
        }
      } catch (error) {
        console.error('Failed to restore scroll position:', error);
      }
    }
  }, [isLoading, allTickets]);

  // Load users on mount (with caching)
  useEffect(() => {
    const loadUsers = async () => {
      try {
        const data = await fetchWithCache('users', () => usersApi.getAll());
        setUsers(data);
      } catch (error) {
        console.error('Failed to load users:', error);
      }
    };

    loadUsers();
  }, []);

  // Load tags on mount (with caching)
  useEffect(() => {
    const loadTags = async () => {
      try {
        const data = await fetchWithCache('tags', () => tagsApi.getAll());
        setTags(data);
      } catch (error) {
        console.error('Failed to load tags:', error);
      }
    };

    loadTags();
  }, []);

  // Debounced email search (fetches filtered results from server as user types)
  useEffect(() => {
    // Only search if there's a query and modal is open
    if (!showNewEmailModal || !newEmail.to || newEmail.to.length < 2) {
      setCustomerEmails([]);
      return;
    }

    const timeoutId = setTimeout(async () => {
      try {
        const data = await ticketsApi.getCustomerEmails(newEmail.to);
        setCustomerEmails(data);
      } catch (error) {
        console.error('Failed to search customer emails:', error);
      }
    }, 300); // 300ms debounce

    return () => clearTimeout(timeoutId);
  }, [newEmail.to, showNewEmailModal]);

  // Clear selection when tickets change
  useEffect(() => {
    clearSelection();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allTickets]);

  // Infinite scroll: load more when sentinel element is visible
  useEffect(() => {
    if (!loadMoreRef.current || isLoading) return;

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
  }, [hasMore, isLoadingMore, isLoading]);

  // Check if a ticket matches current view filters (for notifications)
  const ticketMatchesFilters = useCallback((ticket: Ticket): boolean => {
    // Check status filter
    if (statusFilter === 'new_or_open') {
      if (ticket.status !== 'new' && ticket.status !== 'open') {
        return false;
      }
    } else if (statusFilter !== 'all') {
      if (ticket.status !== statusFilter) {
        return false;
      }
    }

    // Check assignee filter
    if (assigneeFilter === 'unassigned') {
      if (ticket.assignee_id !== null) {
        return false;
      }
    } else if (assigneeFilter === 'me' && user) {
      if (ticket.assignee_id !== user.id) {
        return false;
      }
    } else if (assigneeFilter !== 'all') {
      // Specific user ID
      if (ticket.assignee_id !== parseInt(assigneeFilter, 10)) {
        return false;
      }
    }

    // Check tag filter (note: new tickets from SSE may not have tags populated)
    // We skip tag filtering for notifications since SSE data may be incomplete
    // The list will reload anyway and apply proper filtering

    // Check customer email from URL
    const params = new URLSearchParams(location.search);
    const customerEmail = params.get('customer');
    if (customerEmail && ticket.customer_email !== customerEmail) {
      return false;
    }

    return true;
  }, [statusFilter, assigneeFilter, user, location.search]);

  // Real-time updates - debounced reload from server when changes occur
  // Server handles all filtering, no need to duplicate filter logic client-side
  useSSE({
    onEvent: (event) => {
      if (event.type === 'new-ticket') {
        const ticket = event.data as Ticket;

        // Show browser notification if ticket matches current filters
        if (ticketMatchesFilters(ticket)) {
          notifyIfHidden({
            title: 'New Support Ticket',
            body: `${ticket.customer_name || ticket.customer_email}: ${ticket.subject}`,
            tag: `ticket-${ticket.id}`, // Prevents duplicate notifications for same ticket
            onClick: () => {
              navigate(`/tickets/${ticket.id}`);
            },
          });
        }

        // Debounce reload
        if (reloadTimeoutRef.current) {
          clearTimeout(reloadTimeoutRef.current);
        }
        reloadTimeoutRef.current = setTimeout(() => {
          loadTickets(false);
        }, 300);
      } else if (event.type === 'ticket-update') {
        // Debounce reload to prevent rapid refetches during bulk operations
        if (reloadTimeoutRef.current) {
          clearTimeout(reloadTimeoutRef.current);
        }
        reloadTimeoutRef.current = setTimeout(() => {
          loadTickets(false);
        }, 300); // 300ms debounce
      }
    },
  });

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (reloadTimeoutRef.current) {
        clearTimeout(reloadTimeoutRef.current);
      }
    };
  }, []);

  // Helper to clear ticket selection
  const clearSelection = () => {
    setSelectedTicketIds(new Set());
    setLastClickedIndex(null);
  };

  // Generic bulk operation handler
  const handleBulkOperation = async (
    operation: () => Promise<any>,
    successMessage: string,
    errorMessage: string
  ) => {
    if (selectedTicketIds.size === 0) return;

    try {
      await operation();
      clearSelection();
      toast.success(successMessage);
    } catch (error) {
      console.error(`Bulk operation failed:`, error);
      toast.error(errorMessage);
    }
  };

  // Handle new email submission
  const handleNewEmail = async () => {
    if (!newEmail.to) {
      toast.error('Please enter recipient email address');
      return;
    }

    try {
      // Create ticket via API client
      const data = await ticketsApi.create({
        subject: newEmail.subject || 'New message',
        customer_email: newEmail.to,
        message_body: '',  // Empty body - ticket starts with no messages
      });

      // Reset form and close modal
      setNewEmail({ to: '', subject: '' });
      setShowNewEmailModal(false);

      // Navigate to the new ticket
      window.location.href = `/tickets/${data.id}`;
    } catch (error) {
      console.error('Failed to create ticket:', error);
      toast.error('Failed to create ticket', {
        description: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  };

  // Bulk action handlers
  const toggleTicketSelection = (ticketId: number, index: number, shiftKey: boolean) => {
    const newSelection = new Set(selectedTicketIds);

    // Handle shift-click range selection
    if (shiftKey && lastClickedIndex !== null) {
      const start = Math.min(lastClickedIndex, index);
      const end = Math.max(lastClickedIndex, index);

      // Select all tickets in the range
      for (let i = start; i <= end; i++) {
        newSelection.add(allTickets[i].id);
      }
      setSelectedTicketIds(newSelection);
    } else {
      // Normal click - toggle individual checkbox
      if (newSelection.has(ticketId)) {
        newSelection.delete(ticketId);
      } else {
        newSelection.add(ticketId);
      }
      setSelectedTicketIds(newSelection);
    }

    // Update last clicked index
    setLastClickedIndex(index);
  };

  const handleBulkStatusChange = async (status: TicketStatus) => {
    await handleBulkOperation(
      () => ticketsApi.bulkUpdate(Array.from(selectedTicketIds), { status }),
      `Updated ${selectedTicketIds.size} ticket(s)`,
      'Failed to update tickets'
    );
  };

  const handleBulkAssign = async (assigneeId: number | null) => {
    await handleBulkOperation(
      () => ticketsApi.bulkUpdate(Array.from(selectedTicketIds), { assignee_id: assigneeId }),
      `Assigned ${selectedTicketIds.size} ticket(s)`,
      'Failed to assign tickets'
    );
  };

  const handleBulkDelete = () => {
    if (selectedTicketIds.size === 0) return;
    setShowBulkDeleteModal(true);
  };

  const confirmBulkDelete = async () => {
    const count = selectedTicketIds.size;
    setShowBulkDeleteModal(false);

    await handleBulkOperation(
      () => ticketsApi.bulkDelete(Array.from(selectedTicketIds)),
      `Deleted ${count} ticket(s)`,
      'Failed to delete tickets'
    );
  };

  // Notification toggle handler
  const handleNotificationToggle = async () => {
    if (notificationPermission === 'default') {
      // Request permission first
      const result = await requestPermission();
      if (result === 'granted') {
        setNotificationsEnabled(true);
        toast.success('Notifications enabled');
      } else if (result === 'denied') {
        toast.error('Notification permission denied', {
          description: 'Enable notifications in your browser settings'
        });
      }
    } else if (notificationPermission === 'granted') {
      // Toggle enabled state
      setNotificationsEnabled(!notificationsEnabled);
      toast.success(notificationsEnabled ? 'Notifications disabled' : 'Notifications enabled');
    } else {
      // Permission denied - show instructions
      toast.error('Notifications blocked', {
        description: 'Enable notifications in your browser settings'
      });
    }
  };

  // Notification label based on permission state
  const notificationLabel = notificationPermission === 'default'
    ? 'Enable Notifications'
    : notificationPermission === 'granted'
      ? (notificationsEnabled ? 'Notifications On' : 'Notifications Off')
      : 'Notifications Blocked';

  // Profile editing handlers
  const openProfileModal = () => {
    if (!user) return;
    setProfileSignature(user.signature || '');
    setProfileAiProfile(user.ai_profile || '');
    setProfileError('');
    setShowProfileModal(true);
  };

  const handleProfileUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;

    setProfileError('');

    try {
      setIsUpdatingProfile(true);
      // Only send signature and ai_profile fields for non-admin profile updates
      await usersApi.update(user.id, {
        signature: profileSignature,
        ai_profile: profileAiProfile || null,
      });

      // Refresh user data from API to get updated profile
      await refreshUser();

      // Close modal
      setShowProfileModal(false);

      toast.success('Profile updated successfully');
    } catch (error: any) {
      setProfileError(error?.data?.error || 'Failed to update profile');
      console.error('Failed to update profile:', error);
      toast.error('Failed to update profile');
    } finally {
      setIsUpdatingProfile(false);
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-muted/20">
      {/* Header with integrated filters */}
      <header className="sticky top-0 z-50 backdrop-blur-lg bg-background/70 border-b">
        {/* Top Row: Logo and Actions */}
        <div className="border-b">
          <div className="container mx-auto px-4 py-4 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 sm:gap-4 min-w-0 flex-1">
            <Mail className="h-5 w-5 sm:h-6 sm:w-6 flex-shrink-0" />
            <h1 className="text-lg sm:text-2xl font-bold truncate">Support Inbox</h1>
            <span className="text-xs sm:text-sm text-muted-foreground hidden sm:block">{user?.name}</span>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            {/* Search Button - Desktop Only */}
            <Link to="/search" className="hidden lg:block">
              <Button variant="outline" size="sm" className="whitespace-nowrap h-9">
                <Search className="h-4 w-4 sm:mr-2" />
                <span className="hidden sm:inline">Search</span>
              </Button>
            </Link>

            {/* New Email Button - Desktop Only */}
            <Button variant="default" size="sm" onClick={() => setShowNewEmailModal(true)} className="whitespace-nowrap h-9 hidden lg:flex">
              <Plus className="h-4 w-4 sm:mr-2" />
              <span className="hidden sm:inline">New Email</span>
            </Button>

            {/* Search Icon - Mobile Only */}
            <Link to="/search" className="lg:hidden flex items-center justify-center h-9 w-9 flex-shrink-0">
              <Search className="h-5 w-5" />
            </Link>

            {/* Hamburger Menu - Mobile Only */}
            <Button variant="outline" size="sm" className="lg:hidden flex-shrink-0 h-9" onClick={() => setShowMobileMenu(true)}>
              <Menu className="h-4 w-4" />
            </Button>

            {/* Ellipses Menu - Desktop Only */}
            <DropdownMenu modal={false}>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm" className="hidden lg:flex flex-shrink-0">
                  <MoreVertical className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56" sideOffset={5} collisionPadding={8}>
                <Link to="/calendar">
                  <DropdownMenuItem>
                    <Calendar className="h-4 w-4 mr-2" />
                    Follow-up Calendar
                  </DropdownMenuItem>
                </Link>

                <Link to="/canned-responses">
                  <DropdownMenuItem>
                    <MessageSquare className="h-4 w-4 mr-2" />
                    Canned Responses
                  </DropdownMenuItem>
                </Link>

                {user?.role === 'admin' && (
                  <Link to="/admin/users">
                    <DropdownMenuItem>
                      <Users className="h-4 w-4 mr-2" />
                      Manage Users
                    </DropdownMenuItem>
                  </Link>
                )}

                <DropdownMenuItem onClick={openProfileModal}>
                  <UserProfileIcon className="h-4 w-4 mr-2" />
                  My Profile
                </DropdownMenuItem>

                <DropdownMenuSeparator />

                <DropdownMenuItem onClick={() => loadTickets(false)}>
                  <RefreshCw className="h-4 w-4 mr-2" />
                  Refresh
                </DropdownMenuItem>

                <DropdownMenuItem onClick={toggleTheme}>
                  {theme === 'light' && <Moon className="h-4 w-4 mr-2" />}
                  {theme === 'dark' && <Monitor className="h-4 w-4 mr-2" />}
                  {theme === 'auto' && <Sun className="h-4 w-4 mr-2" />}
                  {theme === 'light' && 'Dark Mode'}
                  {theme === 'dark' && 'Auto Mode'}
                  {theme === 'auto' && 'Light Mode'}
                </DropdownMenuItem>

                {notificationsSupported && (
                  <DropdownMenuItem onClick={handleNotificationToggle}>
                    {notificationsEnabled && notificationPermission === 'granted' ? (
                      <Bell className="h-4 w-4 mr-2" />
                    ) : (
                      <BellOff className="h-4 w-4 mr-2" />
                    )}
                    {notificationLabel}
                  </DropdownMenuItem>
                )}

                <DropdownMenuSeparator />

                <DropdownMenuItem onClick={logout}>
                  <LogOut className="h-4 w-4 mr-2" />
                  Logout
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
          </div>
        </div>

        {/* Second Row: Filters - Desktop Only */}
        <div className="border-b hidden lg:block">
          <div className="container mx-auto px-4 py-3">
            <div className="flex flex-wrap gap-4 items-center">
              <TicketFiltersComponent
                filters={filters}
                updateFilter={updateFilter}
                sortedActiveUsers={sortedActiveUsers}
                sortedTags={sortedTags}
                variant="desktop"
              />

              <Button
                variant="outline"
                size="sm"
                onClick={() => updateFilter('sortOrder', sortOrder === 'desc' ? 'asc' : 'desc')}
                className="w-10 h-10 p-0"
                title={sortOrder === 'desc' ? 'Sorted: Newest First' : 'Sorted: Oldest First'}
              >
                {sortOrder === 'desc' ? <ArrowDownWideNarrow className="h-4 w-4" /> : <ArrowUpNarrowWide className="h-4 w-4" />}
              </Button>

              <div className="ml-auto text-sm text-muted-foreground">
                {selectedTicketIds.size > 0
                  ? `${formatNumber(selectedTicketIds.size)} selected`
                  : `${formatNumber(totalCount)} ticket${totalCount !== 1 ? 's' : ''}`
                }
              </div>
            </div>
          </div>
        </div>

        {/* Third Row: Bulk Actions Toolbar (conditional, floats over content) */}
        {selectedTicketIds.size > 0 && (
          <div className="absolute left-0 right-0 bg-muted border-t border-b shadow-lg z-40 animate-in slide-in-from-top duration-200">
          <div className="container mx-auto px-4 py-3">
            <div className="flex flex-wrap gap-2 items-center">
              <Select onValueChange={(value) => handleBulkStatusChange(value as TicketStatus)}>
                <SelectTrigger className="flex-1 lg:flex-initial lg:w-[160px] h-10">
                  <SelectValue placeholder="Change Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="new">{STATUS_LABELS.new}</SelectItem>
                  <SelectItem value="open">{STATUS_LABELS.open}</SelectItem>
                  <SelectItem value="awaiting_customer">{STATUS_LABELS.awaiting_customer}</SelectItem>
                  <SelectItem value="resolved">{STATUS_LABELS.resolved}</SelectItem>
                </SelectContent>
              </Select>

              <Select onValueChange={(value) => handleBulkAssign(value === 'unassigned' ? null : parseInt(value))}>
                <SelectTrigger className="flex-1 lg:flex-initial lg:w-[160px] h-10">
                  <SelectValue placeholder="Assign To" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="unassigned">Unassigned</SelectItem>
                  {users
                    .filter((u) => u.active)
                    .sort((a, b) => a.name.localeCompare(b.name))
                    .map((u) => (
                      <SelectItem key={u.id} value={u.id.toString()}>
                        {u.name}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>

              {user?.role === 'admin' && (
                <>
                  <div className="border-l h-6 mx-2 hidden lg:block" />
                  <Button variant="destructive" className="flex-1 lg:flex-initial lg:w-[160px] h-10" onClick={handleBulkDelete}>
                    <Trash2 className="h-4 w-4 mr-2" />
                    Delete
                  </Button>
                </>
              )}

              <Button
                variant="outline"
                size="sm"
                className="w-full lg:w-auto lg:ml-auto"
                onClick={() => {
                  setSelectedTicketIds(new Set());
                  setLastClickedIndex(null);
                }}
              >
                Clear Selection
              </Button>
            </div>
          </div>
          </div>
        )}
      </header>

      {/* Tickets List */}
      <div className="container mx-auto px-1 lg:px-4 py-2 lg:py-6">
        <div>
          {/* Filtering indicator */}
          {isFiltering && (
            <div className="flex items-center justify-center gap-2 py-4 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              <span>Updating tickets...</span>
            </div>
          )}

          {!isFiltering && allTickets.length === 0 ? (
            <Card className="p-8 text-center text-muted-foreground">
              No tickets found
            </Card>
          ) : !isFiltering && (
            allTickets.map((ticket, index) => (
              <Card key={ticket.id} className="mb-1 lg:mb-2 hover:bg-accent/50 transition-colors animate-fade-in">
                <div className="flex items-center gap-2 sm:gap-4">
                  <Link
                    to={`/tickets/${ticket.id}`}
                    className="flex-1 py-3 sm:py-4 pl-2 sm:pl-4 pr-2 sm:pr-4 cursor-pointer min-w-0"
                    onClick={() => {
                      // Save scroll position before navigating
                      sessionStorage.setItem('ticketsPageScrollPosition', window.scrollY.toString());
                    }}
                  >
                    <div className="flex flex-col lg:flex-row lg:items-start gap-3 sm:gap-4 lg:gap-6">
                      {/* Left Column - Main Ticket Info */}
                      <div className="flex items-start gap-2 sm:gap-4 flex-1 min-w-0">
                        <SelectableAvatar
                          name={ticket.customer_name || ticket.customer_email}
                          email={ticket.customer_email}
                          size="md"
                          selected={selectedTicketIds.has(ticket.id)}
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            toggleTicketSelection(ticket.id, index, e.shiftKey);
                          }}
                          className="flex-shrink-0"
                        />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-1.5 sm:gap-2 mb-1 flex-wrap">
                            <span className="font-medium text-sm sm:text-base truncate">{ticket.customer_name || ticket.customer_email}</span>
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
                          <div className="flex items-center gap-1.5 sm:gap-2 text-xs text-muted-foreground flex-wrap">
                            <span>#{ticket.id}</span>
                            <span className="hidden sm:inline">•</span>
                            <div className="flex items-center gap-1">
                              <UserCircle className="h-3.5 w-3.5 flex-shrink-0" />
                              <span className="truncate max-w-[100px] sm:max-w-none">
                                {users.find((u) => u.id === ticket.assignee_id)?.name || 'Unassigned'}
                              </span>
                            </div>
                            <span className="hidden sm:inline">•</span>
                            <div className="flex items-center gap-1">
                              <MessageSquare className="h-3.5 w-3.5 flex-shrink-0" />
                              <span className="whitespace-nowrap">{ticket.message_count}</span>
                            </div>
                            {ticket.attachment_count > 0 && (
                              <>
                                <span className="hidden sm:inline">•</span>
                                <div className="flex items-center gap-1">
                                  <Paperclip className="h-3.5 w-3.5 flex-shrink-0" />
                                  <span className="whitespace-nowrap">{ticket.attachment_count}</span>
                                </div>
                              </>
                            )}
                            <span className="hidden sm:inline">•</span>
                            <div className="flex items-center gap-1">
                              <Inbox className="h-3.5 w-3.5 flex-shrink-0" />
                              <span className="whitespace-nowrap">{formatRelativeTime(ticket.created_at)}</span>
                            </div>
                          </div>
                        </div>
                      </div>

                      {/* Right Column - Message Preview */}
                      <div className="flex-1 min-w-0 pt-2 lg:pt-0 lg:pl-6 lg:border-l lg:self-stretch flex flex-col justify-center lg:py-2 gap-1.5 sm:gap-2">
                        {ticket.last_message_sender_email && ticket.last_message_at && (
                          <div className="flex items-center gap-1 text-xs text-muted-foreground/60 truncate">
                            <span className="font-medium flex-shrink-0">Last:</span>
                            <span className="truncate">{ticket.last_message_sender_name || ticket.last_message_sender_email}</span>
                            <span className="flex-shrink-0">• {formatRelativeTime(ticket.last_message_at)}</span>
                          </div>
                        )}
                        {ticket.last_message_preview ? (
                          <div className="text-xs sm:text-sm text-muted-foreground line-clamp-2">
                            {ticket.last_message_preview.replace(/<[^>]*>/g, '').trim()}...
                          </div>
                        ) : (
                          <div className="text-xs sm:text-sm text-muted-foreground/50 italic">
                            No messages yet
                          </div>
                        )}
                      </div>
                    </div>
                  </Link>
                </div>
              </Card>
            ))
          )}

          {/* Load More Indicator */}
          {allTickets.length > 0 && hasMore && (
            <div ref={loadMoreRef} className="py-6 text-center">
              {isLoadingMore ? (
                <Loader2 className="h-5 w-5 animate-spin mx-auto text-muted-foreground" />
              ) : (
                <Button onClick={loadMore} variant="outline" size="lg">
                  Load More Tickets
                </Button>
              )}
            </div>
          )}
        </div>

        {/* Status Legend - Desktop Only */}
        {allTickets.length > 0 && (
          <div className="mt-6 text-xs text-muted-foreground hidden lg:block">
            new: no team member has replied yet • open: customer has replied • awaiting customer: waiting for customer reply • resolved: closed
          </div>
        )}
      </div>

      {/* New Email Modal */}
      <FormModal
        open={showNewEmailModal}
        onOpenChange={setShowNewEmailModal}
        title="New Email"
        onSubmit={(e) => {
          e.preventDefault();
          handleNewEmail();
        }}
        onCancel={() => setShowNewEmailModal(false)}
        submitLabel="Continue"
        size="sm"
      >
        <div>
          <Label htmlFor="recipient-email">Recipient Email</Label>
          <Combobox
            id="recipient-email"
            placeholder="customer@example.com"
            value={newEmail.to}
            onChange={(value) => setNewEmail({ ...newEmail, to: value })}
            options={customerEmails}
            autoFocus
            required
          />
        </div>

        <div>
          <Label htmlFor="subject">Subject (optional)</Label>
          <Input
            id="subject"
            type="text"
            placeholder="Enter subject"
            value={newEmail.subject}
            onChange={(e) => setNewEmail({ ...newEmail, subject: e.target.value })}
          />
        </div>

        <div className="text-sm text-muted-foreground">
          You'll be able to compose your message on the next screen with slash commands and rich text formatting.
        </div>
      </FormModal>

      {/* Bulk Delete Confirmation Dialog */}
      <Dialog open={showBulkDeleteModal} onOpenChange={setShowBulkDeleteModal}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Tickets</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete {selectedTicketIds.size} ticket(s)? This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setShowBulkDeleteModal(false)}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={confirmBulkDelete}
            >
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Profile Edit Modal */}
      <FormModal
        open={showProfileModal}
        onOpenChange={setShowProfileModal}
        title="My Profile"
        onSubmit={handleProfileUpdate}
        onCancel={() => setShowProfileModal(false)}
        isSubmitting={isUpdatingProfile}
        submitLabel="Update Profile"
        error={profileError}
        size="lg"
      >
        <div className="text-sm text-muted-foreground mb-4">
          User ID: <span className="font-mono">{user.id}</span>
        </div>

        <div>
          <Label htmlFor="profile-signature">Email Signature (optional)</Label>
          <RichTextEditor
            content={profileSignature}
            onChange={setProfileSignature}
            placeholder="Add your signature (e.g., name, title, contact info)..."
            disabled={isUpdatingProfile}
          />
        </div>

        <div>
          <Label htmlFor="profile-aiProfile">AI Profile (optional)</Label>
          <textarea
            id="profile-aiProfile"
            className="flex min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
            value={profileAiProfile}
            onChange={(e) => setProfileAiProfile(e.target.value)}
            placeholder="Add context for AI to remember when generating responses (e.g., tone preferences, common instructions)..."
            disabled={isUpdatingProfile}
          />
          <p className="text-xs text-muted-foreground mt-1">
            This will be included in AI-generated email responses for personalization
          </p>
        </div>
      </FormModal>

      {/* Mobile Menu Sheet */}
      <Sheet open={showMobileMenu} onOpenChange={setShowMobileMenu} modal={false}>
        <SheetContent side="right" className="w-full sm:w-[400px] sm:max-w-md overflow-y-auto">
          <SheetHeader>
            <SheetTitle>Menu & Filters</SheetTitle>
          </SheetHeader>

          <div className="mt-6 space-y-6">
            {/* Filters Section */}
            <div className="space-y-4">
              <h3 className="text-sm font-semibold">Filters</h3>

              <TicketFiltersComponent
                filters={filters}
                updateFilter={updateFilter}
                sortedActiveUsers={sortedActiveUsers}
                sortedTags={sortedTags}
                variant="mobile"
                onFilterChange={() => setShowMobileMenu(false)}
              />
            </div>

            <Separator />

            {/* Menu Items Section */}
            <div className="space-y-2">
              <h3 className="text-sm font-semibold mb-3">Menu</h3>

              <Link to="/calendar" onClick={() => setShowMobileMenu(false)}>
                <Button variant="ghost" className="w-full justify-start">
                  <Calendar className="h-4 w-4 mr-2" />
                  Follow-up Calendar
                </Button>
              </Link>

              <Link to="/canned-responses" onClick={() => setShowMobileMenu(false)}>
                <Button variant="ghost" className="w-full justify-start">
                  <MessageSquare className="h-4 w-4 mr-2" />
                  Canned Responses
                </Button>
              </Link>

              {user?.role === 'admin' && (
                <Link to="/admin/users" onClick={() => setShowMobileMenu(false)}>
                  <Button variant="ghost" className="w-full justify-start">
                    <Users className="h-4 w-4 mr-2" />
                    Manage Users
                  </Button>
                </Link>
              )}

              <Button variant="ghost" className="w-full justify-start" onClick={() => {
                setShowMobileMenu(false);
                openProfileModal();
              }}>
                <UserProfileIcon className="h-4 w-4 mr-2" />
                My Profile
              </Button>

              <Button variant="ghost" className="w-full justify-start" onClick={() => {
                setShowMobileMenu(false);
                loadTickets(false);
              }}>
                <RefreshCw className="h-4 w-4 mr-2" />
                Refresh
              </Button>

              <Button variant="ghost" className="w-full justify-start" onClick={() => {
                toggleTheme();
              }}>
                {theme === 'light' && <Moon className="h-4 w-4 mr-2" />}
                {theme === 'dark' && <Monitor className="h-4 w-4 mr-2" />}
                {theme === 'auto' && <Sun className="h-4 w-4 mr-2" />}
                {theme === 'light' && 'Dark Mode'}
                {theme === 'dark' && 'Auto Mode'}
                {theme === 'auto' && 'Light Mode'}
              </Button>

              {notificationsSupported && (
                <Button variant="ghost" className="w-full justify-start" onClick={handleNotificationToggle}>
                  {notificationsEnabled && notificationPermission === 'granted' ? (
                    <Bell className="h-4 w-4 mr-2" />
                  ) : (
                    <BellOff className="h-4 w-4 mr-2" />
                  )}
                  {notificationLabel}
                </Button>
              )}

              <Separator className="my-2" />

              <Button variant="ghost" className="w-full justify-start text-destructive hover:text-destructive" onClick={() => {
                setShowMobileMenu(false);
                logout();
              }}>
                <LogOut className="h-4 w-4 mr-2" />
                Logout
              </Button>
            </div>
          </div>
        </SheetContent>
      </Sheet>

      {/* Floating Action Button - Mobile Only (hidden when bulk selection is active) */}
      {selectedTicketIds.size === 0 && (
        <Button
          variant="default"
          size="icon"
          onClick={() => setShowNewEmailModal(true)}
          className="lg:hidden fixed bottom-6 right-6 h-14 w-14 rounded-full shadow-lg z-40"
        >
          <Plus className="h-6 w-6" />
        </Button>
      )}
    </div>
  );
}
