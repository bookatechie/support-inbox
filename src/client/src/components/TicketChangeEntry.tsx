/**
 * TicketChangeEntry - Shows a ticket change inline in the messages timeline
 * Displays as a system message showing what changed and who changed it
 */

import React from 'react';
import type { TicketHistoryEntry } from '@/types';
import { Settings, User as UserIcon, Clock } from 'lucide-react';

interface Props {
  entry: TicketHistoryEntry;
  users: Record<number, string>;
}

// Human-readable field names
const FIELD_LABELS: Record<string, string> = {
  status: 'status',
  priority: 'priority',
  assignee_id: 'assignee',
  customer_email: 'customer email',
  customer_name: 'customer name',
};

// Status labels
const STATUS_LABELS: Record<string, string> = {
  new: 'New',
  open: 'Open',
  awaiting_customer: 'Awaiting Customer',
  resolved: 'Resolved',
};

// Priority labels
const PRIORITY_LABELS: Record<string, string> = {
  low: 'Low',
  normal: 'Normal',
  high: 'High',
  urgent: 'Urgent',
};

export function TicketChangeEntry({ entry, users }: Props) {
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
    return date.toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    });
  };

  const fieldLabel = FIELD_LABELS[entry.field_name] || entry.field_name;
  const oldValue = formatValue(entry.field_name, entry.old_value);
  const newValue = formatValue(entry.field_name, entry.new_value);

  return (
    <div className="flex items-center justify-center my-6">
      <div className="flex items-center gap-2 px-4 py-2 bg-muted/50 border border-border rounded-full text-sm text-muted-foreground">
        <Settings className="w-3.5 h-3.5" />
        <span>
          <span className="font-medium">{entry.changed_by_name || entry.changed_by_email}</span>
          {' changed '}
          <span className="font-medium">{fieldLabel}</span>
          {' from '}
          <span className="font-mono text-xs px-1.5 py-0.5 bg-background rounded">{oldValue}</span>
          {' to '}
          <span className="font-mono text-xs px-1.5 py-0.5 bg-background rounded font-semibold">{newValue}</span>
        </span>
        <span className="text-xs opacity-70">•</span>
        <Clock className="w-3 h-3" />
        <span className="text-xs">{formatTimestamp(entry.changed_at)}</span>
      </div>
    </div>
  );
}
