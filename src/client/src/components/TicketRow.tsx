import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { Calendar, Inbox, MessageSquare, Paperclip, UserCircle } from 'lucide-react';
import type { Ticket } from '@/types';
import { Card } from '@/components/ui/card';
import { StatusBadge, PriorityBadge, TagBadge } from '@/components/TicketBadges';
import { formatRelativeTime } from '@/lib/formatters';

interface TicketRowProps {
  ticket: Ticket;
  assigneeName?: string | null;
  /** Avatar slot: the inbox passes a selectable one, search a plain one */
  avatar: ReactNode;
  onOpen?: () => void;
  className?: string;
}

// One ticket in a list (inbox, search). Left: customer, badges, subject, meta. Right: last message.
export function TicketRow({ ticket, assigneeName, avatar, onOpen, className = '' }: TicketRowProps) {
  const preview = ticket.last_message_preview?.replace(/<[^>]*>/g, '').trim();

  return (
    <Card className={`hover:bg-accent/50 transition-colors ${className}`}>
      <Link
        to={`/tickets/${ticket.id}`}
        className="block py-3 sm:py-4 px-2 sm:px-4 cursor-pointer min-w-0"
        onClick={onOpen}
      >
        <div className="flex flex-col lg:flex-row lg:items-start gap-3 sm:gap-4 lg:gap-6">
          {/* Left column: main ticket info */}
          <div className="flex items-start gap-2 sm:gap-4 flex-1 min-w-0">
            {avatar}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1.5 sm:gap-2 mb-1 flex-wrap">
                <span className="font-medium text-sm sm:text-base truncate">{ticket.customer_name || ticket.customer_email}</span>
                <StatusBadge status={ticket.status} />
                {ticket.priority !== 'normal' && <PriorityBadge priority={ticket.priority} />}
                {ticket.tags?.map((tag) => <TagBadge key={tag.id} name={tag.name} />)}
              </div>
              <div className="text-muted-foreground mb-1 text-sm line-clamp-2">
                {ticket.subject}
              </div>
              <div className="flex items-center gap-1.5 sm:gap-2 text-xs text-muted-foreground flex-wrap">
                <span>#{ticket.id}</span>
                <Meta icon={UserCircle} label="Assignee" textClassName="truncate max-w-[100px] sm:max-w-none">
                  {assigneeName || 'Unassigned'}
                </Meta>
                <Meta icon={MessageSquare} label="Messages">{ticket.message_count}</Meta>
                {ticket.follow_up_at && <Meta icon={Calendar} label="Has a follow-up date" />}
                {ticket.attachment_count > 0 && <Meta icon={Paperclip} label="Attachments">{ticket.attachment_count}</Meta>}
                <Meta icon={Inbox} label="Created">{formatRelativeTime(ticket.created_at)}</Meta>
              </div>
            </div>
          </div>

          {/* Right column: last message preview */}
          <div className="flex-1 min-w-0 pt-2 lg:pt-0 lg:pl-6 lg:border-l lg:self-stretch flex flex-col justify-center lg:py-2 gap-1.5 sm:gap-2">
            {ticket.last_message_sender_email && ticket.last_message_at && (
              <div className="flex items-center gap-1 text-xs text-muted-foreground/60 truncate">
                <span className="font-medium flex-shrink-0">Last:</span>
                <span className="truncate">{ticket.last_message_sender_name || ticket.last_message_sender_email}</span>
                <span className="flex-shrink-0">• {formatRelativeTime(ticket.last_message_at)}</span>
              </div>
            )}
            {preview ? (
              <div className="text-xs sm:text-sm text-muted-foreground line-clamp-2">{preview}...</div>
            ) : (
              <div className="text-xs sm:text-sm text-muted-foreground/50 italic">No messages yet</div>
            )}
          </div>
        </div>
      </Link>
    </Card>
  );
}

function Meta({ icon: Icon, label, textClassName = 'whitespace-nowrap', children }: {
  icon: typeof Inbox;
  label: string;
  textClassName?: string;
  children?: ReactNode;
}) {
  return (
    <>
      <span className="hidden sm:inline">•</span>
      <div className="flex items-center gap-1" title={label}>
        <Icon className="h-3.5 w-3.5 flex-shrink-0" />
        {children !== undefined && <span className={textClassName}>{children}</span>}
      </div>
    </>
  );
}
