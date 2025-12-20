/**
 * MessageItem component - Renders a single message in the ticket thread
 */

import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Avatar } from '@/components/Avatar';
import { EmailIframe, EmailMetadataHeader } from '@/components/EmailIframe';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { MoreVertical, Reply, Forward, Trash2, X, Clock, Eye, File } from 'lucide-react';
import { formatMessageDate, formatRelativeTime, formatFileSize } from '@/lib/formatters';
import { isViewableInBrowser, isAudioFile, getMessageBodyHtml, isSimpleHtml } from '@/lib/email-utils';
import type { MessageWithAttachments, Attachment, EmailMetadata } from '@/types';

interface MessageItemProps {
  message: MessageWithAttachments;
  customerEmail: string;
  isFirstMessage: boolean;
  isDeleting: boolean;
  onReply: (messageId: number) => void;
  onForward: (messageId: number) => void;
  onDelete: (messageId: number) => void;
  onCancelScheduled: (messageId: number) => void;
}

export function MessageItem({
  message,
  customerEmail,
  isFirstMessage,
  isDeleting,
  onReply,
  onForward,
  onDelete,
  onCancelScheduled,
}: MessageItemProps) {
  const isCustomer = message.sender_email === customerEmail;

  return (
    <div
      data-message-id={message.id}
      className={`sm:flex sm:gap-4 group transition-all duration-300 animate-fade-in-up ${
        isDeleting ? 'opacity-0 scale-95' : 'opacity-100 scale-100'
      }`}
    >
      {/* Avatar - Hidden on mobile, shown on tablet+ */}
      <div className="hidden sm:block flex-shrink-0">
        <Avatar
          name={message.sender_name || message.sender_email}
          email={message.sender_email}
          size="md"
        />
      </div>

      {/* Message Content */}
      <div className="flex-1 min-w-0 w-full sm:w-auto">
        <div className="flex items-baseline gap-2 mb-2 flex-wrap">
          <span className="font-semibold">
            {message.sender_name || message.sender_email}
          </span>
          {isCustomer ? (
            <Badge variant="outline" className="text-xs">
              Customer
            </Badge>
          ) : null}
          {message.type === 'note' ? (
            <Badge className="text-xs bg-yellow-600 text-white">
              Internal Note
            </Badge>
          ) : null}
          {isFirstMessage ? (
            <Badge variant="outline" className="text-xs">
              Original Message
            </Badge>
          ) : null}
          {message.scheduled_at && !message.sent_at ? (
            <Badge className="text-xs bg-blue-600 text-white flex items-center gap-1">
              <Clock className="h-3 w-3" />
              Scheduled: {new Date(message.scheduled_at).toLocaleString()}
            </Badge>
          ) : null}
          <div className="ml-auto text-right flex items-center gap-2">
            <div className="text-xs text-muted-foreground">
              {formatMessageDate(message.created_at)}
            </div>
            {/* Actions menu */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  className="text-muted-foreground hover:text-foreground p-1 rounded hover:bg-accent"
                  title="Message actions"
                >
                  <MoreVertical className="h-4 w-4" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                {/* Reply option for email messages only (not internal notes) */}
                {message.type === 'email' && (
                  <DropdownMenuItem onClick={() => onReply(message.id)}>
                    <Reply className="h-4 w-4 mr-2" />
                    Reply
                  </DropdownMenuItem>
                )}
                {/* Forward option for all messages */}
                <DropdownMenuItem onClick={() => onForward(message.id)}>
                  <Forward className="h-4 w-4 mr-2" />
                  Forward Email
                </DropdownMenuItem>
                {/* Delete option only for internal notes */}
                {message.type === 'note' && (
                  <DropdownMenuItem
                    onClick={() => onDelete(message.id)}
                    className="text-destructive focus:text-destructive focus:bg-destructive/10"
                  >
                    <Trash2 className="h-4 w-4 mr-2" />
                    Delete Note
                  </DropdownMenuItem>
                )}
                {/* Cancel option for scheduled messages */}
                {message.scheduled_at && !message.sent_at && (
                  <DropdownMenuItem
                    onClick={() => onCancelScheduled(message.id)}
                    className="text-destructive focus:text-destructive focus:bg-destructive/10"
                  >
                    <X className="h-4 w-4 mr-2" />
                    Cancel Scheduled
                  </DropdownMenuItem>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>

        {(() => {
          const hasEmailMetadata = message.email_metadata && message.body_html;
          const useIframe = message.body_html && !isSimpleHtml(message.body_html);
          const needsCardPadding = !useIframe && !hasEmailMetadata;

          return (
            <Card className={`bg-white dark:bg-card ${
              needsCardPadding
                ? `p-4 ${
                    message.type === 'note'
                      ? 'bg-yellow-50 border-yellow-200 dark:bg-yellow-950/20 dark:text-foreground [&_*]:dark:!text-inherit'
                      : ''
                  }`
                : 'p-0 overflow-hidden'
            }`}>
              {useIframe ? (
                // Complex HTML: Use iframe for isolation and proper rendering
                <EmailIframe
                  html={getMessageBodyHtml(message.body, message.body_html, message.attachments)}
                  emailMetadata={message.email_metadata ? JSON.parse(message.email_metadata) : null}
                  senderName={message.sender_name}
                  senderEmail={message.sender_email}
                />
              ) : (
                // Simple HTML or plain text: Render inline for better performance
                <>
                  {hasEmailMetadata && (
                    <EmailMetadataHeader
                      metadata={JSON.parse(message.email_metadata!) as EmailMetadata}
                      senderName={message.sender_name}
                      senderEmail={message.sender_email}
                    />
                  )}
                  <div
                    className={`prose prose-sm max-w-none dark:prose-invert ${hasEmailMetadata ? 'p-4' : ''}`}
                    dangerouslySetInnerHTML={{ __html: getMessageBodyHtml(message.body, message.body_html, message.attachments) }}
                  />
                </>
              )}

              {/* Display attachments if any */}
              {message.attachments && message.attachments.length > 0 && (
                <div className="mt-4 px-4 pb-4 space-y-2">
                  <div className="text-xs font-medium text-muted-foreground">Attachments:</div>
                  <div className="flex flex-col gap-2">
                    {message.attachments.map((attachment: Attachment) => {
                      const isViewable = isViewableInBrowser(attachment.mime_type);
                      const isAudio = isAudioFile(attachment.mime_type);
                      const attachmentUrl = `/api/attachments/${attachment.id}?token=${localStorage.getItem('authToken')}`;

                      // Audio files get an inline player
                      if (isAudio) {
                        return (
                          <div key={attachment.id} className="flex flex-col gap-1 p-3 bg-background border rounded-md">
                            <div className="flex items-center gap-2 text-sm">
                              <File className="h-4 w-4" />
                              <span className="truncate flex-1">{attachment.filename}</span>
                              {attachment.size_bytes && (
                                <span className="text-muted-foreground text-xs">
                                  ({formatFileSize(attachment.size_bytes)})
                                </span>
                              )}
                            </div>
                            <audio
                              controls
                              preload="none"
                              className="w-full h-8"
                              src={attachmentUrl}
                            >
                              Your browser does not support the audio element.
                            </audio>
                          </div>
                        );
                      }

                      // Other files get the existing link behavior
                      return (
                        <a
                          key={attachment.id}
                          href={attachmentUrl}
                          {...(isViewable
                            ? { target: '_blank', rel: 'noopener noreferrer' }
                            : { download: attachment.filename }
                          )}
                          className="flex items-center gap-2 px-3 py-2 bg-background border rounded-md text-sm hover:bg-accent transition-colors"
                          title={isViewable ? 'Click to view' : 'Click to download'}
                        >
                          {isViewable ? (
                            <Eye className="h-4 w-4" />
                          ) : (
                            <File className="h-4 w-4" />
                          )}
                          <span className="truncate max-w-xs">{attachment.filename}</span>
                          {attachment.size_bytes && (
                            <span className="text-muted-foreground">
                              ({formatFileSize(attachment.size_bytes)})
                            </span>
                          )}
                        </a>
                      );
                    })}
                  </div>
                </div>
              )}
            </Card>
          );
        })()}

        {/* Show read status for agent messages sent to customer */}
        {!isCustomer && message.type !== 'note' && message.first_opened_at && (
          <div className="text-xs text-green-600 dark:text-green-400 flex items-center gap-1 mt-2">
            <Eye className="h-3 w-3" />
            Read {formatRelativeTime(message.first_opened_at)}
          </div>
        )}
      </div>
    </div>
  );
}
