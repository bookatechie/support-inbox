import type { Tag, User } from '@/types';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { STATUS_LABELS, PRIORITY_LABELS } from '@/lib/constants';

// Ticket filter dropdowns shared by the inbox, search and calendar, so every page offers the same options.
// Values: 'all' = no filter; status also takes 'new_or_open'; assignee takes 'me', 'unassigned' or a user id.

interface SelectProps {
  value: string;
  onChange: (value: string) => void;
  className?: string;
}

const byName = <T extends { name: string }>(a: T, b: T) => a.name.localeCompare(b.name);

export function StatusFilterSelect({ value, onChange, className }: SelectProps) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger className={className}>
        <SelectValue placeholder="Status" />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="all">All Status</SelectItem>
        <SelectItem value="new_or_open">New or Open</SelectItem>
        <SelectItem value="new">{STATUS_LABELS.new}</SelectItem>
        <SelectItem value="open">{STATUS_LABELS.open}</SelectItem>
        <SelectItem value="awaiting_customer">{STATUS_LABELS.awaiting_customer}</SelectItem>
        <SelectItem value="resolved">{STATUS_LABELS.resolved}</SelectItem>
      </SelectContent>
    </Select>
  );
}

export function AssigneeFilterSelect({ value, onChange, className, users }: SelectProps & { users: User[] }) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger className={className}>
        <SelectValue placeholder="Assignee" />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="all">All Tickets</SelectItem>
        <SelectItem value="me">Assigned to Me</SelectItem>
        <SelectItem value="unassigned">Unassigned</SelectItem>
        {users.length > 0 && (
          <>
            <div className="h-px bg-border my-1" />
            {[...users].sort(byName).map((u) => (
              <SelectItem key={u.id} value={u.id.toString()}>
                {u.name}
              </SelectItem>
            ))}
          </>
        )}
      </SelectContent>
    </Select>
  );
}

export function TagFilterSelect({ value, onChange, className, tags }: SelectProps & { tags: Tag[] }) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger className={className}>
        <SelectValue placeholder="Tag" />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="all">All Tags</SelectItem>
        {tags.length > 0 && (
          <>
            <div className="h-px bg-border my-1" />
            {[...tags].sort(byName).map((tag) => (
              <SelectItem key={tag.id} value={tag.id.toString()}>
                {tag.name}
              </SelectItem>
            ))}
          </>
        )}
      </SelectContent>
    </Select>
  );
}

export function PriorityFilterSelect({ value, onChange, className }: SelectProps) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger className={className}>
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
  );
}
