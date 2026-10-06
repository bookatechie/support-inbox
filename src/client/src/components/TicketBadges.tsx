/**
 * Status, priority and tag badges: one look and one set of labels on every screen.
 * Plain spans rather than the generic Badge, whose default variant turns purple on hover.
 */
import { X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { STATUS_COLORS, STATUS_LABELS, PRIORITY_COLORS, PRIORITY_LABELS } from '@/lib/constants';
import type { TicketStatus, TicketPriority } from '@/types';

const pill = 'inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold whitespace-nowrap';

export function StatusBadge({ status, className }: { status: TicketStatus; className?: string }) {
  return <span className={cn(pill, STATUS_COLORS[status], 'text-white', className)}>{STATUS_LABELS[status]}</span>;
}

export function PriorityBadge({ priority, className }: { priority: TicketPriority; className?: string }) {
  return <span className={cn(pill, PRIORITY_COLORS[priority], 'text-white', className)}>{PRIORITY_LABELS[priority]}</span>;
}

export function TagBadge({ name, onRemove, className }: { name: string; onRemove?: () => void; className?: string }) {
  return (
    <span className={cn(pill, 'gap-1 border border-border bg-card text-foreground', onRemove && 'pr-1', className)}>
      {name}
      {onRemove && (
        <button
          type="button"
          onClick={onRemove}
          className="rounded-full p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
          title={`Remove tag ${name}`}
          aria-label={`Remove tag ${name}`}
        >
          <X className="h-3 w-3" />
        </button>
      )}
    </span>
  );
}
