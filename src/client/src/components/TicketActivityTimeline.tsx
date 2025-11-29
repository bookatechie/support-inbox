/**
 * TicketActivityTimeline - Displays audit history for ticket changes
 * Shows timeline of status, priority, and assignee changes
 */

import React, { useEffect, useState } from 'react';
import { tickets as ticketsApi } from '@/lib/api';
import type { TicketHistoryEntry, User } from '@/types';
import { Clock, User as UserIcon, AlertCircle } from 'lucide-react';
import { users as usersApi } from '@/lib/api';

interface Props {
  ticketId: number;
}

// Human-readable field names
const FIELD_LABELS: Record<string, string> = {
  status: 'Status',
  priority: 'Priority',
  assignee_id: 'Assignee',
  customer_email: 'Customer Email',
  customer_name: 'Customer Name',
};

// Status labels for display
const STATUS_LABELS: Record<string, string> = {
  new: 'New',
  open: 'Open',
  awaiting_customer: 'Awaiting Customer',
  resolved: 'Resolved',
};

// Priority labels for display
const PRIORITY_LABELS: Record<string, string> = {
  low: 'Low',
  normal: 'Normal',
  high: 'High',
  urgent: 'Urgent',
};

// Badge colors for change sources
const SOURCE_COLORS: Record<string, string> = {
  manual: 'bg-blue-100 text-blue-800',
  automation: 'bg-purple-100 text-purple-800',
  api: 'bg-green-100 text-green-800',
  email_reply: 'bg-orange-100 text-orange-800',
};

export function TicketActivityTimeline({ ticketId }: Props) {
  const [history, setHistory] = useState<TicketHistoryEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [users, setUsers] = useState<Record<number, string>>({});

  useEffect(() => {
    loadHistory();
    loadUsers();
  }, [ticketId]);

  const loadHistory = async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await ticketsApi.getHistory(ticketId);
      setHistory(data);
    } catch (err) {
      console.error('Failed to load ticket history:', err);
      setError('Failed to load activity history');
    } finally {
      setLoading(false);
    }
  };

  const loadUsers = async () => {
    try {
      const allUsers = await usersApi.getAll();
      const userMap: Record<number, string> = {};
      allUsers.forEach((user: User) => {
        userMap[user.id] = user.name;
      });
      setUsers(userMap);
    } catch (err) {
      console.error('Failed to load users:', err);
    }
  };

  const formatValue = (fieldName: string, value: string | null): string => {
    if (value === null || value === 'null') return 'None';

    if (fieldName === 'status') {
      return STATUS_LABELS[value] || value;
    }
    if (fieldName === 'priority') {
      return PRIORITY_LABELS[value] || value;
    }
    if (fieldName === 'assignee_id') {
      return users[Number(value)] || `User #${value}`;
    }
    return value;
  };

  const formatTimestamp = (timestamp: string): string => {
    const date = new Date(timestamp);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;

    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: date.getFullYear() !== now.getFullYear() ? 'numeric' : undefined,
    });
  };

  const renderHistoryEntry = (entry: TicketHistoryEntry, index: number) => {
    const fieldLabel = FIELD_LABELS[entry.field_name] || entry.field_name;
    const oldValueDisplay = formatValue(entry.field_name, entry.old_value);
    const newValueDisplay = formatValue(entry.field_name, entry.new_value);
    const isFirst = index === 0;
    const isLast = index === history.length - 1;

    return (
      <div key={entry.id} className="relative pl-8 pb-8 group">
        {/* Timeline line */}
        {!isLast && (
          <div className="absolute left-3 top-8 bottom-0 w-0.5 bg-gray-200 group-hover:bg-gray-300 transition-colors" />
        )}

        {/* Timeline dot */}
        <div className="absolute left-0 top-1.5 w-6 h-6 rounded-full bg-blue-500 border-4 border-white shadow-sm flex items-center justify-center">
          <div className="w-2 h-2 rounded-full bg-white" />
        </div>

        {/* Content */}
        <div className="bg-white rounded-lg border border-gray-200 p-4 hover:shadow-sm transition-shadow">
          <div className="flex items-start justify-between mb-2">
            <div className="flex items-center gap-2">
              <UserIcon className="w-4 h-4 text-gray-400" />
              <span className="font-medium text-gray-900">
                {entry.changed_by_name || entry.changed_by_email}
              </span>
              <span className="text-gray-500">changed {fieldLabel}</span>
            </div>
            <div className="flex items-center gap-2 text-sm text-gray-500">
              <Clock className="w-3.5 h-3.5" />
              {formatTimestamp(entry.changed_at)}
            </div>
          </div>

          <div className="flex items-center gap-2 text-sm mt-2">
            <span className="px-2 py-1 bg-red-50 text-red-700 rounded line-through">
              {oldValueDisplay}
            </span>
            <span className="text-gray-400">→</span>
            <span className="px-2 py-1 bg-green-50 text-green-700 rounded font-semibold">
              {newValueDisplay}
            </span>
          </div>

          {entry.notes && (
            <div className="mt-2 text-sm text-gray-600 italic bg-gray-50 p-2 rounded">
              {entry.notes}
            </div>
          )}

          {entry.change_source !== 'manual' && (
            <div className="mt-2">
              <span className={`text-xs px-2 py-1 rounded-full ${SOURCE_COLORS[entry.change_source]}`}>
                {entry.change_source === 'email_reply' ? 'Auto-assigned' : entry.change_source}
              </span>
            </div>
          )}
        </div>
      </div>
    );
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center gap-2 p-4 bg-red-50 text-red-700 rounded-lg">
        <AlertCircle className="w-5 h-5" />
        <span>{error}</span>
      </div>
    );
  }

  if (history.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-gray-500">
        <Clock className="w-12 h-12 mb-2 text-gray-300" />
        <p>No activity history yet</p>
        <p className="text-sm">Changes to status, priority, and assignee will appear here</p>
      </div>
    );
  }

  return (
    <div className="space-y-0">
      <h3 className="font-semibold text-lg mb-6 text-gray-900">Activity Timeline</h3>
      <div className="relative">
        {history.map((entry, index) => renderHistoryEntry(entry, index))}
      </div>
    </div>
  );
}
