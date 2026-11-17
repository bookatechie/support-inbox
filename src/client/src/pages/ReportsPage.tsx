/**
 * Reports: how fast customers hear back, what is waiting on whom, and when the team works.
 * Data: /tickets/reports/insights and /tickets/reports/activity (server: lib/team-activity.ts)
 */

import { useState, useEffect, useMemo } from 'react';
import { tickets as ticketsApi } from '@/lib/api';
import { useAuth } from '@/contexts/AuthContext';
import type { ReportInsights } from '@/types';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { ChevronLeft, ChevronRight, BarChart3, Inbox, Clock, Timer, Hourglass } from 'lucide-react';
import {
  BarChart,
  Bar,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';
import { AppHeader } from '@/components/AppHeader';
import { PageHeader } from '@/components/PageHeader';
import { PageLoader } from '@/components/PageLoader';
import { formatDay } from '@/lib/formatters';
import { useActiveUsers } from '@/hooks/useUsers';
import { TeamActivityCard } from '@/components/TeamActivityCard';

// ============================================================================
// Constants
// ============================================================================

const COLORS = {
  received: '#8884d8',   // purple
  team: '#22c55e',       // green-500
  automated: '#94a3b8',  // slate-400
  wait: '#f97316',       // orange-500
  age: {
    under_1d: '#22c55e', // green-500
    '1_3d': '#eab308',   // yellow-500
    '3_7d': '#f97316',   // orange-500
    over_7d: '#dc2626',  // red-600
  },
};

const DATE_RANGE_OPTIONS = [
  { value: '7', label: 'Last 7 days' },
  { value: '14', label: 'Last 14 days' },
  { value: '30', label: 'Last 30 days' },
  { value: '60', label: 'Last 60 days' },
  { value: '90', label: 'Last 90 days' },
];

const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;

const TOOLTIP_STYLE = {
  backgroundColor: 'hsl(var(--card))',
  border: '1px solid hsl(var(--border))',
  borderRadius: '6px',
};

// Format date as YYYY-MM-DD in local timezone
function formatDateString(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

// "2026-11-09" -> "11/9" (parsed as a calendar date, not shifted by time zone)
function formatDisplayDate(dateString: string): string {
  const [, month, day] = dateString.split('-').map(Number);
  return `${month}/${day}`;
}

/** Long waits read better in days */
function formatWait(hours: number | null | undefined): string {
  if (hours == null) return 'N/A';
  return hours >= 48 ? `${(hours / 24).toFixed(1)} d` : `${hours.toFixed(1)} h`;
}

// ============================================================================
// Stat Card Component
// ============================================================================

interface StatCardProps {
  title: string;
  value: string | number;
  icon: React.ReactNode;
  description?: string;
}

function StatCard({ title, value, icon, description }: StatCardProps) {
  return (
    <Card className="p-4 h-full flex items-center">
      <div className="flex items-center gap-3">
        <div className="p-2 bg-primary/10 rounded-lg text-primary">
          {icon}
        </div>
        <div>
          <p className="text-sm text-muted-foreground">{title}</p>
          <p className="text-2xl font-bold">{value}</p>
          {description && <p className="text-xs text-muted-foreground">{description}</p>}
        </div>
      </div>
    </Card>
  );
}

function ChartCard({ title, description, children, wide }: { title: string; description: string; children: React.ReactNode; wide?: boolean }) {
  return (
    <Card className={wide ? 'p-4 lg:col-span-2' : 'p-4'}>
      <h3 className="text-lg font-semibold">{title}</h3>
      <p className="text-xs text-muted-foreground mb-4">{description}</p>
      {children}
    </Card>
  );
}

// ============================================================================
// Main Component
// ============================================================================

export function ReportsPage() {
  const { user } = useAuth();
  const [insights, setInsights] = useState<ReportInsights | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const activeUsers = useActiveUsers();

  // Filters
  const [dateRange, setDateRange] = useState('30');
  const [agentFilter, setAgentFilter] = useState('all');
  const userId = agentFilter !== 'all' ? parseInt(agentFilter, 10) : undefined;

  // Calculate date range
  const { startDate, endDate } = useMemo(() => {
    const days = parseInt(dateRange, 10);
    const end = new Date();
    const start = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
    return {
      startDate: formatDateString(start),
      endDate: formatDateString(end),
    };
  }, [dateRange]);

  // Sorted active users (current user first)
  const sortedActiveUsers = useMemo(() => {
    return [...activeUsers].sort((a, b) => Number(b.id === user?.id) - Number(a.id === user?.id));
  }, [activeUsers, user?.id]);

  useEffect(() => {
    let cancelled = false;
    ticketsApi.getReportInsights(startDate, endDate, timeZone, userId)
      .then(data => { if (!cancelled) setInsights(data); })
      .catch(error => console.error('Failed to load report data:', error))
      .finally(() => { if (!cancelled) setIsLoading(false); });
    return () => { cancelled = true; };
  }, [startDate, endDate, userId]);

  const dailyData = useMemo(
    () => (insights?.daily ?? []).map(d => ({ ...d, displayDate: formatDisplayDate(d.date) })),
    [insights]
  );

  const weekData = useMemo(
    () => (insights?.waitByWeek ?? []).map(w => ({ ...w, displayWeek: formatDisplayDate(w.week) })),
    [insights]
  );

  // Horizontal bar charts need a height that fits their rows
  const backlogHeight = Math.max(160, (insights?.backlog.length ?? 0) * 32 + 60);
  const workloadHeight = Math.max(160, (insights?.workload.length ?? 0) * 40 + 60);

  const displayDateRange = `${formatDay(startDate)} - ${formatDay(endDate)}`;
  const summary = insights?.summary;

  const header = (
    <AppHeader>
      <PageHeader icon={BarChart3} title="Reports" subtitle="Reply speed, backlog and team activity" />
    </AppHeader>
  );

  if (isLoading && !insights) {
    return (
      <div className="min-h-screen bg-muted/20">
        {header}
        <PageLoader />
      </div>
    );
  }

  const goToPreviousRange = () => {
    const currentIndex = DATE_RANGE_OPTIONS.findIndex(o => o.value === dateRange);
    if (currentIndex > 0) setDateRange(DATE_RANGE_OPTIONS[currentIndex - 1].value);
  };

  const goToNextRange = () => {
    const currentIndex = DATE_RANGE_OPTIONS.findIndex(o => o.value === dateRange);
    if (currentIndex < DATE_RANGE_OPTIONS.length - 1) setDateRange(DATE_RANGE_OPTIONS[currentIndex + 1].value);
  };

  return (
    <div className="min-h-screen bg-muted/20">
      {header}

      <main className="container mx-auto px-2 sm:px-4 py-4 sm:py-6">
        {/* Filters Row */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4 mb-6">
          <div className="flex items-center gap-2">
            <Button variant="outline" size="icon" onClick={goToPreviousRange} disabled={dateRange === '7'}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Select value={dateRange} onValueChange={setDateRange}>
              <SelectTrigger className="w-[140px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {DATE_RANGE_OPTIONS.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button variant="outline" size="icon" onClick={goToNextRange} disabled={dateRange === '90'}>
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>

          <Select value={agentFilter} onValueChange={setAgentFilter}>
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder="Agent" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Agents</SelectItem>
              {sortedActiveUsers.map((u) => (
                <SelectItem key={u.id} value={u.id.toString()}>
                  {u.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <span className="text-sm text-muted-foreground ml-auto hidden sm:block">{displayDateRange}</span>
        </div>

        <p className="text-sm text-muted-foreground text-center mb-4 sm:hidden">{displayDateRange}</p>

        {/* Stats Cards */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          <StatCard
            title="Customer emails"
            value={summary?.customer_emails ?? 0}
            icon={<Inbox className="h-5 w-5" />}
            description={`${summary?.replies ?? 0} answered by the team`}
          />
          <StatCard
            title="Customer waits"
            value={formatWait(summary?.median_wait_hours)}
            icon={<Clock className="h-5 w-5" />}
            description="Median, email to reply sent"
          />
          <StatCard
            title="Answered within 4 h"
            value={summary?.replies_within_4h_pct != null ? `${summary.replies_within_4h_pct}%` : 'N/A'}
            icon={<Timer className="h-5 w-5" />}
            description="Share of replies"
          />
          <StatCard
            title="Waiting on us now"
            value={summary?.open_backlog ?? 0}
            icon={<Hourglass className="h-5 w-5" />}
            description={`${summary?.open_backlog_over_3d ?? 0} waiting over 3 days`}
          />
        </div>

        <TeamActivityCard startDate={startDate} endDate={endDate} userId={userId} />

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <ChartCard
            wide
            title="Emails per day"
            description="Emails in from customers, replies written by the team, and emails sent by automations."
          >
            <div className="h-[300px]">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={dailyData}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                  <XAxis dataKey="displayDate" tick={{ fontSize: 12 }} className="fill-muted-foreground" />
                  <YAxis allowDecimals={false} tick={{ fontSize: 12 }} className="fill-muted-foreground" />
                  <Tooltip contentStyle={TOOLTIP_STYLE} />
                  <Legend />
                  <Line type="monotone" dataKey="received" stroke={COLORS.received} strokeWidth={2} dot={false} name="From customers" />
                  <Line type="monotone" dataKey="team" stroke={COLORS.team} strokeWidth={2} dot={false} name="Written by team" />
                  <Line type="monotone" dataKey="automated" stroke={COLORS.automated} strokeWidth={2} dot={false} strokeDasharray="4 3" name="Automated" />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </ChartCard>

          <ChartCard
            title="Waiting on us now"
            description="New and open tickets by assignee, by how long since the customer last wrote."
          >
            <div style={{ height: backlogHeight }}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={insights?.backlog ?? []} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                  <XAxis type="number" allowDecimals={false} tick={{ fontSize: 12 }} className="fill-muted-foreground" />
                  <YAxis dataKey="name" type="category" width={110} tick={{ fontSize: 12 }} className="fill-muted-foreground" />
                  <Tooltip contentStyle={TOOLTIP_STYLE} />
                  <Legend />
                  <Bar dataKey="under_1d" stackId="age" fill={COLORS.age.under_1d} name="Under 1 day" />
                  <Bar dataKey="1_3d" stackId="age" fill={COLORS.age['1_3d']} name="1-3 days" />
                  <Bar dataKey="3_7d" stackId="age" fill={COLORS.age['3_7d']} name="3-7 days" />
                  <Bar dataKey="over_7d" stackId="age" fill={COLORS.age.over_7d} name="Over 7 days" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </ChartCard>

          <ChartCard
            title="Customer wait by week"
            description="Median time from a customer's email to the reply being sent. Scheduled replies count from their send time."
          >
            <div className="h-[300px]">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={weekData}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                  <XAxis dataKey="displayWeek" tick={{ fontSize: 12 }} className="fill-muted-foreground" />
                  <YAxis unit=" h" tick={{ fontSize: 12 }} className="fill-muted-foreground" />
                  <Tooltip
                    contentStyle={TOOLTIP_STYLE}
                    labelFormatter={(label) => `Week of ${label}`}
                    formatter={(value, _name, item) => {
                      const p = item.payload as ReportInsights['waitByWeek'][number];
                      return [`${formatWait(value as number)} (${p.replies} replies, ${p.within_4h_pct ?? 0}% within 4 h)`, 'Median wait'];
                    }}
                  />
                  <Line type="monotone" dataKey="median_wait_hours" stroke={COLORS.wait} strokeWidth={2} dot={{ fill: COLORS.wait }} name="Median wait" />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </ChartCard>

          <ChartCard
            wide
            title="Customer emails vs replies"
            description="Customer emails that came in on each person's tickets, and the replies each person wrote."
          >
            <div style={{ height: workloadHeight }}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={insights?.workload ?? []} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                  <XAxis type="number" allowDecimals={false} tick={{ fontSize: 12 }} className="fill-muted-foreground" />
                  <YAxis dataKey="name" type="category" width={110} tick={{ fontSize: 12 }} className="fill-muted-foreground" />
                  <Tooltip contentStyle={TOOLTIP_STYLE} />
                  <Legend />
                  <Bar dataKey="customer_emails" fill={COLORS.received} name="Customer emails in" radius={[0, 4, 4, 0]} />
                  <Bar dataKey="replies" fill={COLORS.team} name="Replies written" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </ChartCard>
        </div>
      </main>
    </div>
  );
}

export default ReportsPage;
