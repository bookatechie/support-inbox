/**
 * Calendar page for viewing follow-up dates
 * Shows a month view with tickets that have follow-ups scheduled
 */

import { useState, useEffect, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { tickets as ticketsApi, tags as tagsApi, users as usersApi } from '@/lib/api';
import { useAuth } from '@/contexts/AuthContext';
import { usePersistedFilters } from '@/hooks/usePersistedFilters';
import type { Ticket, Tag, User } from '@/types';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { BackButton } from '@/components/BackButton';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Loader2, ChevronLeft, ChevronRight, Calendar as CalendarIcon, Menu } from 'lucide-react';
import { STATUS_COLORS, STATUS_LABELS, PRIORITY_LABELS } from '@/lib/constants';

// ============================================================================
// Constants
// ============================================================================

const DAYS_OF_WEEK = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
];
const CALENDAR_GRID_SIZE = 42; // 6 rows × 7 days
const MAX_VISIBLE_TICKETS_PER_DAY = 5;

const CALENDAR_TICKET_COLORS = {
  new: 'bg-blue-100 dark:bg-blue-900/30 text-blue-800 dark:text-blue-200',
  open: 'bg-yellow-100 dark:bg-yellow-900/30 text-yellow-800 dark:text-yellow-200',
  awaiting_customer: 'bg-orange-100 dark:bg-orange-900/30 text-orange-800 dark:text-orange-200',
  resolved: 'bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-200',
  default: 'bg-gray-100 dark:bg-gray-900/30 text-gray-800 dark:text-gray-200',
} as const;

// Format date as YYYY-MM-DD in local timezone (avoids UTC conversion issues)
function formatDateString(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

// ============================================================================
// Types and Defaults
// ============================================================================

interface CalendarFilters {
  statusFilter: string;
  priorityFilter: string;
  tagFilter: string;
  assigneeFilter: string;
}

const DEFAULT_CALENDAR_FILTERS: CalendarFilters = {
  statusFilter: 'all',
  priorityFilter: 'all',
  tagFilter: 'all',
  assigneeFilter: 'all',
};

// ============================================================================
// CalendarFilters Component
// ============================================================================

interface CalendarFiltersProps {
  filters: CalendarFilters;
  updateFilter: <K extends keyof CalendarFilters>(key: K, value: string) => void;
  sortedActiveUsers: User[];
  sortedTags: Tag[];
  variant: 'desktop' | 'mobile';
  onFilterChange?: () => void;
}

function CalendarFiltersComponent({
  filters,
  updateFilter,
  sortedActiveUsers,
  sortedTags,
  variant,
  onFilterChange,
}: CalendarFiltersProps) {
  const handleChange = <K extends keyof CalendarFilters>(key: K) => (value: string) => {
    updateFilter(key, value);
    onFilterChange?.();
  };

  const isMobile = variant === 'mobile';
  const triggerClass = isMobile ? 'w-full' : 'w-[180px]';

  return (
    <div className={isMobile ? 'space-y-4' : 'flex flex-wrap gap-4 items-center'}>
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
            <SelectItem value="all">All Assignees</SelectItem>
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

      {/* Priority Filter */}
      <div className={isMobile ? '' : undefined}>
        {isMobile && <Label className="text-xs text-muted-foreground mb-1.5 block">Priority</Label>}
        <Select value={filters.priorityFilter} onValueChange={handleChange('priorityFilter')}>
          <SelectTrigger className={triggerClass}>
            <SelectValue placeholder="Priority" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Priority</SelectItem>
            <SelectItem value="low">{PRIORITY_LABELS.low}</SelectItem>
            <SelectItem value="normal">{PRIORITY_LABELS.normal}</SelectItem>
            <SelectItem value="high">{PRIORITY_LABELS.high}</SelectItem>
            <SelectItem value="urgent">{PRIORITY_LABELS.urgent}</SelectItem>
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
    </div>
  );
}

// ============================================================================
// Main Component
// ============================================================================

export function CalendarPage() {
  const { user } = useAuth();
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [currentDate, setCurrentDate] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [showMobileMenu, setShowMobileMenu] = useState(false);

  // Filter state using custom hook
  const [tags, setTags] = useState<Tag[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const { filters, updateFilter } = usePersistedFilters<CalendarFilters>(
    'calendarPageFilters',
    DEFAULT_CALENDAR_FILTERS
  );

  // Memoize sorted lists to avoid re-sorting on every render
  const sortedActiveUsers = useMemo(() => {
    return [...users]
      .filter((u) => u.active && u.id !== user?.id)
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [users, user?.id]);

  const sortedTags = useMemo(() => {
    return [...tags].sort((a, b) => a.name.localeCompare(b.name));
  }, [tags]);

  // Load tags and users on mount
  useEffect(() => {
    const loadTags = async () => {
      try {
        const data = await tagsApi.getAll();
        setTags(data);
      } catch (error) {
        console.error('Failed to load tags:', error);
      }
    };
    const loadUsers = async () => {
      try {
        const data = await usersApi.getAll();
        setUsers(data);
      } catch (error) {
        console.error('Failed to load users:', error);
      }
    };
    loadTags();
    loadUsers();
  }, []);

  // Get first and last day of current month view (including padding days)
  const { firstDay, lastDay, daysInMonth, startDayOfWeek } = useMemo(() => {
    const year = currentDate.getFullYear();
    const month = currentDate.getMonth();
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    const daysInMonth = lastDay.getDate();
    const startDayOfWeek = firstDay.getDay();
    return { firstDay, lastDay, daysInMonth, startDayOfWeek };
  }, [currentDate]);

  // Load tickets with follow-ups
  useEffect(() => {
    const loadTickets = async () => {
      setIsLoading(true);
      try {
        // Get first day of previous month and last day of next month for buffer
        const year = currentDate.getFullYear();
        const month = currentDate.getMonth();
        const start = formatDateString(new Date(year, month - 1, 1));
        const end = formatDateString(new Date(year, month + 2, 0));

        const data = await ticketsApi.getCalendar(start, end);
        setTickets(data);
      } catch (error) {
        console.error('Failed to load calendar data:', error);
      } finally {
        setIsLoading(false);
      }
    };

    loadTickets();
  }, [currentDate]);

  // Filter and group tickets by date
  const ticketsByDate = useMemo(() => {
    const grouped: Record<string, Ticket[]> = {};
    const { statusFilter, priorityFilter, tagFilter, assigneeFilter } = filters;

    tickets.forEach(ticket => {
      if (!ticket.follow_up_at) return;

      // Apply status filter
      if (statusFilter === 'new_or_open') {
        if (ticket.status !== 'new' && ticket.status !== 'open') return;
      } else if (statusFilter !== 'all' && ticket.status !== statusFilter) {
        return;
      }

      // Apply priority filter
      if (priorityFilter !== 'all' && ticket.priority !== priorityFilter) return;

      // Apply tag filter
      if (tagFilter !== 'all') {
        const hasTag = ticket.tags?.some(t => t.id.toString() === tagFilter);
        if (!hasTag) return;
      }

      // Apply assignee filter
      if (assigneeFilter === 'unassigned') {
        if (ticket.assignee_id !== null) return;
      } else if (assigneeFilter === 'me' && user) {
        if (ticket.assignee_id !== user.id) return;
      } else if (assigneeFilter !== 'all') {
        if (ticket.assignee_id !== parseInt(assigneeFilter, 10)) return;
      }

      const date = ticket.follow_up_at.split('T')[0];
      if (!grouped[date]) {
        grouped[date] = [];
      }
      grouped[date].push(ticket);
    });

    return grouped;
  }, [tickets, filters, user]);

  // Navigate months
  const goToPreviousMonth = () => {
    setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() - 1, 1));
    setSelectedDate(null);
  };

  const goToNextMonth = () => {
    setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 1));
    setSelectedDate(null);
  };

  const goToToday = () => {
    setCurrentDate(new Date());
    setSelectedDate(null);
  };

  // Build calendar grid
  const calendarDays = useMemo(() => {
    const days: { date: Date; isCurrentMonth: boolean; dateString: string }[] = [];
    const year = currentDate.getFullYear();
    const month = currentDate.getMonth();

    // Add padding days from previous month
    const prevMonth = new Date(year, month, 0);
    const prevMonthDays = prevMonth.getDate();
    for (let i = startDayOfWeek - 1; i >= 0; i--) {
      const date = new Date(year, month - 1, prevMonthDays - i);
      days.push({
        date,
        isCurrentMonth: false,
        dateString: formatDateString(date)
      });
    }

    // Add days of current month
    for (let day = 1; day <= daysInMonth; day++) {
      const date = new Date(year, month, day);
      days.push({
        date,
        isCurrentMonth: true,
        dateString: formatDateString(date)
      });
    }

    // Add padding days for next month to complete the grid
    const remainingDays = CALENDAR_GRID_SIZE - days.length;
    for (let day = 1; day <= remainingDays; day++) {
      const date = new Date(year, month + 1, day);
      days.push({
        date,
        isCurrentMonth: false,
        dateString: formatDateString(date)
      });
    }

    return days;
  }, [currentDate, daysInMonth, startDayOfWeek]);

  // Get today's date string for comparison
  const todayString = formatDateString(new Date());

  // Memoize calendar stats to avoid recalculating on every render
  const calendarStats = useMemo(() => {
    const allTickets = Object.values(ticketsByDate).flat();
    const firstDayStr = formatDateString(firstDay);
    const lastDayStr = formatDateString(lastDay);

    const thisMonthCount = allTickets.filter(t => {
      const date = t.follow_up_at?.split('T')[0];
      return date && date >= firstDayStr && date <= lastDayStr;
    }).length;

    const overdueCount = Object.entries(ticketsByDate)
      .filter(([date]) => date < todayString)
      .flatMap(([, t]) => t)
      .length;

    return { thisMonthCount, overdueCount };
  }, [ticketsByDate, firstDay, lastDay, todayString]);

  // Selected date tickets
  const selectedDateTickets = selectedDate ? ticketsByDate[selectedDate] || [] : [];

  return (
    <div className="min-h-screen bg-muted/20 flex flex-col">
      {/* Header */}
      <header className="sticky top-0 z-50 backdrop-blur-lg bg-background/70 border-b">
        <div className="container mx-auto px-4 py-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <BackButton to="/tickets" />
              <div className="flex items-center gap-2">
                <CalendarIcon className="h-5 w-5 text-muted-foreground" />
                <h1 className="text-xl font-semibold">Follow-up Calendar</h1>
              </div>
            </div>

            {/* Month Navigation - Desktop Only */}
            <div className="hidden lg:flex items-center gap-2">
              <Button variant="outline" size="sm" onClick={goToToday}>
                Today
              </Button>
              <Button variant="outline" size="icon" onClick={goToPreviousMonth}>
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <span className="min-w-[160px] text-center font-medium">
                {MONTHS[currentDate.getMonth()]} {currentDate.getFullYear()}
              </span>
              <Button variant="outline" size="icon" onClick={goToNextMonth}>
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>

            {/* Hamburger Menu - Mobile Only */}
            <Button variant="outline" size="icon" className="lg:hidden" onClick={() => setShowMobileMenu(true)}>
              <Menu className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {/* Filter Bar - Desktop Only */}
        <div className="border-b hidden lg:block">
          <div className="container mx-auto px-4 py-3">
            <CalendarFiltersComponent
              filters={filters}
              updateFilter={updateFilter}
              sortedActiveUsers={sortedActiveUsers}
              sortedTags={sortedTags}
              variant="desktop"
            />
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 container mx-auto px-4 py-6">
        {isLoading ? (
          <div className="flex items-center justify-center h-64">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div>
            {/* Month Navigation - Mobile Only */}
            <div className="flex lg:hidden items-center justify-center gap-2 mb-4">
              <Button variant="outline" size="icon" onClick={goToPreviousMonth}>
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <span className="min-w-[140px] text-center font-medium">
                {MONTHS[currentDate.getMonth()]} {currentDate.getFullYear()}
              </span>
              <Button variant="outline" size="icon" onClick={goToNextMonth}>
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>

            {/* Day Headers */}
                <div className="grid grid-cols-7 mb-2">
                  {DAYS_OF_WEEK.map(day => (
                    <div key={day} className="text-center text-sm font-medium text-muted-foreground py-2">
                      {day}
                    </div>
                  ))}
                </div>

                {/* Calendar Days */}
                <div className="grid grid-cols-7 gap-1">
                  {calendarDays.map(({ date, isCurrentMonth, dateString }) => {
                    const dayTickets = ticketsByDate[dateString] || [];
                    const isToday = dateString === todayString;
                    const isSelected = dateString === selectedDate;

                    return (
                      <button
                        key={dateString}
                        onClick={() => setSelectedDate(dateString === selectedDate ? null : dateString)}
                        className={`
                          min-h-[80px] p-1 rounded-md border text-left transition-colors flex flex-col
                          ${isCurrentMonth ? 'bg-white dark:bg-zinc-900' : 'bg-muted/30 text-muted-foreground'}
                          ${isToday ? 'border-primary border-2' : 'border-border'}
                          ${isSelected ? 'ring-2 ring-primary ring-offset-2' : ''}
                          ${dayTickets.length > 0 ? 'cursor-pointer hover:bg-accent' : 'cursor-default'}
                        `}
                      >
                        <div className={`text-sm font-medium mb-1 flex-shrink-0 flex items-center justify-between ${isToday ? 'text-primary' : ''}`}>
                          <span>{date.getDate()}</span>
                          {dayTickets.length > 0 && (
                            <span className="text-xs text-muted-foreground">{dayTickets.length}</span>
                          )}
                        </div>
                        {dayTickets.length > 0 && (
                          <div className="space-y-0.5 flex-1 overflow-hidden">
                            {dayTickets.slice(0, MAX_VISIBLE_TICKETS_PER_DAY).map(ticket => {
                              const statusBg = CALENDAR_TICKET_COLORS[ticket.status as keyof typeof CALENDAR_TICKET_COLORS]
                                || CALENDAR_TICKET_COLORS.default;

                              return (
                                <div
                                  key={ticket.id}
                                  className={`text-xs truncate px-1 py-0.5 rounded ${statusBg}`}
                                  title={ticket.subject}
                                >
                                  {ticket.subject.length > 20 ? ticket.subject.slice(0, 20) + '...' : ticket.subject}
                                </div>
                              );
                            })}
                            {dayTickets.length > MAX_VISIBLE_TICKETS_PER_DAY && (
                              <div className="text-xs text-muted-foreground px-1">
                                +{dayTickets.length - MAX_VISIBLE_TICKETS_PER_DAY} more
                              </div>
                            )}
                          </div>
                        )}
                      </button>
                    );
                  })}
                </div>

                {/* Stats Line */}
                <div className="flex gap-6 text-sm text-muted-foreground mt-3">
                  <span>
                    <span className="font-medium text-foreground">
                      {calendarStats.thisMonthCount}
                    </span>{' '}
                    follow-ups this month
                  </span>
                  <span>
                    <span className="font-medium text-red-600">
                      {calendarStats.overdueCount}
                    </span>{' '}
                    overdue
                  </span>
            </div>
          </div>
        )}
      </main>

      {/* Mobile Menu Sheet */}
      <Sheet open={showMobileMenu} onOpenChange={setShowMobileMenu} modal={false}>
        <SheetContent side="right" className="w-full sm:w-[400px] sm:max-w-md overflow-y-auto">
          <SheetHeader>
            <SheetTitle>Filters</SheetTitle>
          </SheetHeader>

          <div className="mt-6">
            <CalendarFiltersComponent
              filters={filters}
              updateFilter={updateFilter}
              sortedActiveUsers={sortedActiveUsers}
              sortedTags={sortedTags}
              variant="mobile"
              onFilterChange={() => setShowMobileMenu(false)}
            />

            <div className="pt-4">
              <Button variant="outline" className="w-full" onClick={goToToday}>
                Go to Today
              </Button>
            </div>
          </div>
        </SheetContent>
      </Sheet>

      {/* Selected Date Dialog */}
      <Dialog open={!!selectedDate} onOpenChange={(open) => !open && setSelectedDate(null)}>
        <DialogContent className="max-w-lg max-h-[80vh] flex flex-col">
          <DialogHeader>
            <DialogTitle>
              {selectedDate && new Date(selectedDate + 'T12:00:00').toLocaleDateString('en-US', {
                weekday: 'long',
                month: 'long',
                day: 'numeric'
              })}
            </DialogTitle>
          </DialogHeader>
          <div className="flex-1 overflow-y-auto">
            {selectedDateTickets.length === 0 ? (
              <p className="text-sm text-muted-foreground">No follow-ups scheduled for this date.</p>
            ) : (
              <div className="space-y-3">
                {selectedDateTickets.map(ticket => (
                  <Link
                    key={ticket.id}
                    to={`/tickets/${ticket.id}`}
                    className="block p-3 rounded-lg border hover:bg-accent transition-colors"
                  >
                    <div className="flex items-start justify-between gap-2 mb-1">
                      <span className="text-xs text-muted-foreground">#{ticket.id}</span>
                      <Badge className={STATUS_COLORS[ticket.status]}>
                        {ticket.status.replace('_', ' ')}
                      </Badge>
                    </div>
                    <p className="font-medium text-sm">{ticket.subject}</p>
                    <p className="text-xs text-muted-foreground mt-1">
                      {ticket.customer_email}
                    </p>
                  </Link>
                ))}
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default CalendarPage;
