/**
 * Reports page for analytics dashboard
 * Shows charts and statistics for ticket/email data
 */

import { useState, useEffect, useMemo } from 'react';
import { tickets as ticketsApi, users as usersApi } from '@/lib/api';
import { useAuth } from '@/contexts/AuthContext';
import type { ReportData, User } from '@/types';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { BackButton } from '@/components/BackButton';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Loader2, ChevronLeft, ChevronRight, BarChart3, Ticket, MessageSquare, Clock, CheckCircle } from 'lucide-react';
import { STATUS_LABELS, PRIORITY_LABELS } from '@/lib/constants';
import {
  BarChart,
  Bar,
  LineChart,
  Line,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';

// ============================================================================
// Constants
// ============================================================================

const CHART_COLORS = {
  primary: '#8884d8',
  secondary: '#c084fc',
  status: {
    new: '#a855f7',        // purple-500
    open: '#d946ef',       // fuchsia-500
    awaiting_customer: '#ec4899', // pink-500
    resolved: '#7c3aed',   // violet-600
  },
  priority: {
    low: '#c4b5fd',        // violet-300
    normal: '#8884d8',     // purple (primary)
    high: '#d946ef',       // fuchsia-500
    urgent: '#be185d',     // pink-700
  },
  messageType: {
    email: '#8884d8',      // purple
    note: '#c084fc',       // purple-400
    system: '#f0abfc',     // fuchsia-300
  },
};

const DATE_RANGE_OPTIONS = [
  { value: '7', label: 'Last 7 days' },
  { value: '14', label: 'Last 14 days' },
  { value: '30', label: 'Last 30 days' },
  { value: '60', label: 'Last 60 days' },
  { value: '90', label: 'Last 90 days' },
];

// Format date as YYYY-MM-DD in local timezone
function formatDateString(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

// Format date for display (shorter format)
function formatDisplayDate(dateString: string): string {
  const date = new Date(dateString);
  return `${date.getMonth() + 1}/${date.getDate()}`;
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
    <Card className="p-4">
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

// ============================================================================
// Main Component
// ============================================================================

export function ReportsPage() {
  const { user } = useAuth();
  const [reportData, setReportData] = useState<ReportData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [users, setUsers] = useState<User[]>([]);

  // Filters
  const [dateRange, setDateRange] = useState('30');
  const [agentFilter, setAgentFilter] = useState('all');

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
    return [...users]
      .filter(u => u.active)
      .sort((a, b) => {
        if (a.id === user?.id) return -1;
        if (b.id === user?.id) return 1;
        return a.name.localeCompare(b.name);
      });
  }, [users, user?.id]);

  // Load users on mount
  useEffect(() => {
    const loadUsers = async () => {
      try {
        const data = await usersApi.getAll();
        setUsers(data);
      } catch (error) {
        console.error('Failed to load users:', error);
      }
    };
    loadUsers();
  }, []);

  // Load report data when filters change
  useEffect(() => {
    const loadReportData = async () => {
      try {
        const assigneeId = agentFilter !== 'all' ? parseInt(agentFilter, 10) : undefined;
        const data = await ticketsApi.getReports(startDate, endDate, assigneeId);
        setReportData(data);
      } catch (error) {
        console.error('Failed to load report data:', error);
      } finally {
        setIsLoading(false);
      }
    };
    loadReportData();
  }, [startDate, endDate, agentFilter]);

  // Format chart data
  const messagesOverTimeData = useMemo(() => {
    if (!reportData) return [];
    return reportData.messagesOverTime.map(item => ({
      ...item,
      displayDate: formatDisplayDate(item.date),
    }));
  }, [reportData]);

  const statusChartData = useMemo(() => {
    if (!reportData) return [];
    return reportData.ticketsByStatus.map(item => ({
      ...item,
      name: STATUS_LABELS[item.status as keyof typeof STATUS_LABELS] || item.status,
      fill: CHART_COLORS.status[item.status as keyof typeof CHART_COLORS.status] || CHART_COLORS.primary,
    }));
  }, [reportData]);

  const priorityChartData = useMemo(() => {
    if (!reportData) return [];
    return reportData.ticketsByPriority.map(item => ({
      ...item,
      name: PRIORITY_LABELS[item.priority as keyof typeof PRIORITY_LABELS] || item.priority,
      fill: CHART_COLORS.priority[item.priority as keyof typeof CHART_COLORS.priority] || CHART_COLORS.primary,
    }));
  }, [reportData]);

  const agentChartData = useMemo(() => {
    if (!reportData) return [];
    return reportData.ticketsByAgent.map(item => ({
      ...item,
      name: item.agent_name,
    }));
  }, [reportData]);

  const messageTypeData = useMemo(() => {
    if (!reportData) return [];
    return reportData.messagesByType.map(item => ({
      ...item,
      name: item.type.charAt(0).toUpperCase() + item.type.slice(1),
      fill: CHART_COLORS.messageType[item.type as keyof typeof CHART_COLORS.messageType] || CHART_COLORS.primary,
    }));
  }, [reportData]);

  // Get display date range
  const displayDateRange = useMemo(() => {
    const start = new Date(startDate);
    const end = new Date(endDate);
    return `${start.toLocaleDateString()} - ${end.toLocaleDateString()}`;
  }, [startDate, endDate]);

  // Only show full page loader on initial load
  if (isLoading && !reportData) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  // Navigation functions for date range
  const goToPreviousRange = () => {
    const currentIndex = DATE_RANGE_OPTIONS.findIndex(o => o.value === dateRange);
    if (currentIndex > 0) {
      setDateRange(DATE_RANGE_OPTIONS[currentIndex - 1].value);
    }
  };

  const goToNextRange = () => {
    const currentIndex = DATE_RANGE_OPTIONS.findIndex(o => o.value === dateRange);
    if (currentIndex < DATE_RANGE_OPTIONS.length - 1) {
      setDateRange(DATE_RANGE_OPTIONS[currentIndex + 1].value);
    }
  };

  return (
    <div className="min-h-screen bg-muted/20">
      {/* Header */}
      <header className="sticky top-0 z-50 backdrop-blur-lg bg-background/70 border-b">
        <div className="container mx-auto px-4 py-3">
          <div className="flex items-center gap-4">
            <BackButton to="/tickets" />
            <div>
              <div className="flex items-center gap-2">
                <BarChart3 className="h-5 w-5 text-muted-foreground" />
                <h1 className="text-xl font-semibold">Reports</h1>
              </div>
              <p className="text-sm text-muted-foreground">Analytics Dashboard</p>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="container mx-auto px-4 py-6">
        {/* Filters Row */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4 mb-6">
          {/* Date Range Selector */}
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

          {/* Agent Filter */}
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

          {/* Date Range Display */}
          <span className="text-sm text-muted-foreground ml-auto hidden sm:block">{displayDateRange}</span>
        </div>

        {/* Date Range Display - Mobile */}
        <p className="text-sm text-muted-foreground text-center mb-4 sm:hidden">{displayDateRange}</p>

        {/* Stats Cards */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          <StatCard
            title="Total Tickets"
            value={reportData?.totalTickets || 0}
            icon={<Ticket className="h-5 w-5" />}
          />
          <StatCard
            title="Messages"
            value={reportData?.totalMessages || 0}
            icon={<MessageSquare className="h-5 w-5" />}
          />
          <StatCard
            title="Resolved"
            value={reportData?.resolvedTickets || 0}
            icon={<CheckCircle className="h-5 w-5" />}
          />
          <StatCard
            title="Avg Response"
            value={reportData?.avgResponseTime.avg_hours != null
              ? `${Number(reportData.avgResponseTime.avg_hours).toFixed(1)}h`
              : 'N/A'
            }
            icon={<Clock className="h-5 w-5" />}
            description="Time to first reply"
          />
        </div>

        {/* Charts Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Messages Over Time - Full Width */}
          <Card className="p-4 lg:col-span-2">
            <h3 className="text-lg font-semibold mb-4">Messages Over Time</h3>
            <div className="h-[300px]">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={messagesOverTimeData}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                  <XAxis
                    dataKey="displayDate"
                    tick={{ fontSize: 12 }}
                    className="fill-muted-foreground"
                  />
                  <YAxis
                    allowDecimals={false}
                    tick={{ fontSize: 12 }}
                    className="fill-muted-foreground"
                  />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: 'hsl(var(--card))',
                      border: '1px solid hsl(var(--border))',
                      borderRadius: '6px',
                    }}
                  />
                  <Legend />
                  <Line
                    type="monotone"
                    dataKey="received"
                    stroke={CHART_COLORS.primary}
                    strokeWidth={2}
                    dot={{ fill: CHART_COLORS.primary }}
                    name="Received"
                  />
                  <Line
                    type="monotone"
                    dataKey="sent"
                    stroke={CHART_COLORS.secondary}
                    strokeWidth={2}
                    dot={{ fill: CHART_COLORS.secondary }}
                    name="Sent"
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </Card>

          {/* Tickets by Status */}
          <Card className="p-4">
            <h3 className="text-lg font-semibold mb-4">Tickets by Status</h3>
            <div className="h-[300px]">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={statusChartData}
                    dataKey="count"
                    nameKey="name"
                    cx="50%"
                    cy="50%"
                    outerRadius={100}
                    label={({ name, percent }: { name?: string; percent?: number }) => `${name ?? ''} (${((percent ?? 0) * 100).toFixed(0)}%)`}
                  >
                    {statusChartData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.fill} />
                    ))}
                  </Pie>
                  <Tooltip
                    contentStyle={{
                      backgroundColor: 'hsl(var(--card))',
                      border: '1px solid hsl(var(--border))',
                      borderRadius: '6px',
                    }}
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </Card>

          {/* Tickets by Agent */}
          <Card className="p-4">
            <h3 className="text-lg font-semibold mb-4">Tickets by Agent</h3>
            <div className="h-[300px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={agentChartData} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                  <XAxis
                    type="number"
                    allowDecimals={false}
                    tick={{ fontSize: 12 }}
                    className="fill-muted-foreground"
                  />
                  <YAxis
                    dataKey="name"
                    type="category"
                    width={100}
                    tick={{ fontSize: 12 }}
                    className="fill-muted-foreground"
                  />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: 'hsl(var(--card))',
                      border: '1px solid hsl(var(--border))',
                      borderRadius: '6px',
                    }}
                  />
                  <Bar
                    dataKey="count"
                    fill={CHART_COLORS.primary}
                    radius={[0, 4, 4, 0]}
                    name="Tickets"
                  />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </Card>

          {/* Tickets by Priority */}
          <Card className="p-4">
            <h3 className="text-lg font-semibold mb-4">Tickets by Priority</h3>
            <div className="h-[300px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={priorityChartData}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                  <XAxis
                    dataKey="name"
                    tick={{ fontSize: 12 }}
                    className="fill-muted-foreground"
                  />
                  <YAxis
                    allowDecimals={false}
                    tick={{ fontSize: 12 }}
                    className="fill-muted-foreground"
                  />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: 'hsl(var(--card))',
                      border: '1px solid hsl(var(--border))',
                      borderRadius: '6px',
                    }}
                  />
                  <Bar
                    dataKey="count"
                    radius={[4, 4, 0, 0]}
                    name="Tickets"
                  >
                    {priorityChartData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.fill} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </Card>

          {/* Messages by Type */}
          <Card className="p-4">
            <h3 className="text-lg font-semibold mb-4">Messages by Type</h3>
            <div className="h-[300px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={messageTypeData}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                  <XAxis
                    dataKey="name"
                    tick={{ fontSize: 12 }}
                    className="fill-muted-foreground"
                  />
                  <YAxis
                    allowDecimals={false}
                    tick={{ fontSize: 12 }}
                    className="fill-muted-foreground"
                  />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: 'hsl(var(--card))',
                      border: '1px solid hsl(var(--border))',
                      borderRadius: '6px',
                    }}
                  />
                  <Bar
                    dataKey="count"
                    radius={[4, 4, 0, 0]}
                    name="Messages"
                  >
                    {messageTypeData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.fill} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </Card>
        </div>
      </main>

    </div>
  );
}

export default ReportsPage;
