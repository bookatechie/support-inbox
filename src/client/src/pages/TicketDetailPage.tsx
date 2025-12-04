/**
 * Ticket detail page
 * Shows full conversation thread and reply editor
 */

import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useParams, Link } from 'react-router-dom';
import { tickets as ticketsApi, drafts as draftsApi, users as usersApi, cannedResponses as cannedResponsesApi, messages as messagesApi } from '@/lib/api';
import { useSSE } from '@/hooks/useSSE';
import { useAuth } from '@/contexts/AuthContext';
import type { TicketWithMessages, NewMessageEvent, MessageDeletedEvent, User, CannedResponse, UserComposingEvent, Attachment, TicketHistoryEntry } from '@/types';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Combobox } from '@/components/ui/combobox';
import { Checkbox } from '@/components/ui/checkbox';
import { RichTextEditor } from '@/components/RichTextEditor';
import { TagManager } from '@/components/TagManager';
import { BackButton } from '@/components/BackButton';
import { CustomerInfo } from '@/components/CustomerInfo';
import { FormModal } from '@/components/FormModal';
import { TicketChangeEntry } from '@/components/TicketChangeEntry';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Loader2, Mail, Send, Save, User as UserIcon, Trash2, X, File, Plus, Eye, MoreVertical, Search, Edit, Menu, ChevronsDown, Forward, Reply, Clock, Calendar, CalendarClock } from 'lucide-react';
import { formatMessageDate, formatAbsoluteDate, formatRelativeTime } from '@/lib/formatters';
import { ApiError } from '@/lib/api';
import DOMPurify from 'dompurify';
import type { EmailMetadata } from '@/types';
import { STATUS_LABELS, PRIORITY_LABELS } from '@/lib/constants';
import { Avatar } from '@/components/Avatar';
import { toast } from 'sonner';
import { fetchWithCache } from '@/lib/cache';

/**
 * Check if a file type can be viewed in the browser
 */
function isViewableInBrowser(mimeType: string | null): boolean {
  if (!mimeType) return false;

  return (
    mimeType.startsWith('image/') || // All images
    mimeType === 'application/pdf'   // PDFs
  );
}

/**
 * Check if file is an audio file that can be played in browser
 */
function isAudioFile(mimeType: string | null): boolean {
  if (!mimeType) return false;

  return (
    mimeType.startsWith('audio/') || // All audio types (audio/wav, audio/mp3, etc.)
    mimeType === 'application/ogg'   // Some ogg files use this mime type
  );
}

/**
 * Get sanitized HTML for message body
 * Prefers HTML if available, otherwise converts plain text to HTML
 */
function getMessageBodyHtml(body: string, bodyHtml: string | null, attachments?: Attachment[]): string {
  if (bodyHtml) {
    let html = bodyHtml;

    // Replace cid: references with attachment URLs
    if (attachments && attachments.length > 0) {
      attachments.forEach(attachment => {
        // Extract CID from filename (format: image-timestamp-index.ext or just a UUID)
        const cidMatch = attachment.filename.match(/^(.+)\.(png|jpg|jpeg|gif|webp)$/i);
        if (cidMatch) {
          const cid = cidMatch[1]; // filename without extension
          const token = localStorage.getItem('authToken');
          const attachmentUrl = `/api/attachments/${attachment.id}?token=${token}`;

          // Replace cid: references with attachment URL
          html = html.replace(new RegExp(`cid:${cid}`, 'g'), attachmentUrl);
        }
      });
    }

    // Sanitize HTML to prevent XSS while preserving email formatting
    // DOMPurify's defaults are safe - removes script, event handlers, etc.
    const sanitized = DOMPurify.sanitize(html, {
      ADD_TAGS: ['style'], // Allow style tags for email CSS
      ADD_ATTR: ['target', 'style', 'loading'], // Allow lazy loading attribute
      ALLOW_DATA_ATTR: false, // Don't allow data-* attributes
      WHOLE_DOCUMENT: false, // Just sanitize fragment, not full HTML doc
    });

    // Add lazy loading to all images and remove tracking pixels
    const doc = new DOMParser().parseFromString(sanitized, 'text/html');
    const images = doc.querySelectorAll('img');
    images.forEach(img => {
      // Remove tracking pixels (1x1 images pointing to /api/track/)
      const src = img.getAttribute('src') || '';
      if (src.includes('/api/track/') || (img.width === 1 && img.height === 1)) {
        img.remove();
      } else {
        img.setAttribute('loading', 'lazy');
        img.setAttribute('decoding', 'async');
      }
    });

    return doc.body.innerHTML;
  }

  // Fall back to plain text with line breaks converted to <br>
  return body.replace(/\n/g, '<br>');
}

/**
 * Check if HTML is simple enough to render inline (no iframe needed)
 * Simple HTML = basic formatting only, no complex layouts or embedded content
 */
function isSimpleHtml(html: string): boolean {
  if (!html) return true;

  // Complex indicators that require iframe isolation
  const complexPatterns = [
    /<table/i,           // Tables (often used in email templates)
    /<style/i,           // Style tags (can conflict with page styles)
    /<iframe/i,          // Embedded iframes
    /<form/i,            // Forms
    /<script/i,          // Scripts (should be sanitized anyway, but indicator of complexity)
    /style=["'][^"']*background/i,  // Background images/colors (can be complex)
    /gmail_quote/i,      // Gmail quoted/forwarded messages (often complex)
  ];

  // Check for complex patterns
  for (const pattern of complexPatterns) {
    if (pattern.test(html)) {
      return false;
    }
  }

  // If HTML is longer than 1000 chars, it's likely complex
  if (html.length > 1000) {
    return false;
  }

  return true;
}

/**
 * EmailMetadataHeader component - Shows From/To/CC/Subject info
 */
function EmailMetadataHeader({
  metadata,
  senderName,
  senderEmail
}: {
  metadata: EmailMetadata;
  senderName: string | null;
  senderEmail: string;
}) {
  const hasAnyMetadata = metadata.subject || metadata.to?.length || metadata.cc?.length;

  if (!hasAnyMetadata) return null;

  return (
    <div className="p-3 border-b space-y-1 text-sm bg-muted/30">
      {senderEmail && (
        <div className="text-muted-foreground">
          <span className="font-medium">From:</span> {senderEmail}
        </div>
      )}
      {metadata.to && metadata.to.length > 0 && (
        <div className="text-muted-foreground">
          <span className="font-medium">To:</span> {metadata.to.join(', ')}
        </div>
      )}
      {metadata.cc && metadata.cc.length > 0 && (
        <div className="text-muted-foreground">
          <span className="font-medium">CC:</span> {metadata.cc.join(', ')}
        </div>
      )}
      {metadata.subject && (
        <div className="text-muted-foreground">
          <span className="font-medium">Subject:</span> {metadata.subject}
        </div>
      )}
    </div>
  );
}

/**
 * TicketSubject component - Reusable subject line display
 */
function TicketSubject({ subject, className = '' }: { subject: string; className?: string }) {
  return (
    <div className={`flex items-center gap-2 ${className}`}>
      <Mail className="h-5 w-5 flex-shrink-0 hidden sm:block" />
      <h1 className="text-base sm:text-xl font-bold lg:text-xl">{subject}</h1>
    </div>
  );
}

/**
 * TicketMetadata component - Reusable ticket ID and created date
 */
function TicketMetadata({
  ticketId,
  createdAt,
  className = ''
}: {
  ticketId: number;
  createdAt: string;
  className?: string;
}) {
  return (
    <div className={`flex flex-wrap items-center gap-2 text-sm text-muted-foreground ${className}`}>
      <span className="font-medium">#{ticketId}</span>
      <span>•</span>
      <span className="font-medium">Created:</span>
      <span>{formatAbsoluteDate(createdAt)}</span>
    </div>
  );
}

/**
 * EmailIframe component - Renders email HTML in an isolated iframe
 * Based on un-inbox/chatwoot implementations with expandable content
 */
function EmailIframe({
  html,
  emailMetadata,
  senderName,
  senderEmail
}: {
  html: string;
  emailMetadata: EmailMetadata | null;
  senderName: string | null;
  senderEmail: string;
}) {
  const frameRef = useRef<HTMLIFrameElement | null>(null);
  const contentRef = useRef<HTMLDivElement | null>(null);
  const [height, setHeight] = useState('800px');
  const [isExpandable, setIsExpandable] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);

  const onLoad = () => {
    if (!frameRef.current) return;

    const doc = frameRef.current.contentWindow?.document;
    if (!doc) return;

    const bodyHeight = doc.body.scrollHeight ?? 0;

    // Check if content is expandable (>300px)
    setIsExpandable(bodyHeight > 300);

    // Set height
    if (isExpanded || bodyHeight <= 300) {
      setHeight(`${bodyHeight + 30}px`);
    } else {
      setHeight('300px');
    }

    // Force all links to open in new tab
    doc.querySelectorAll('a').forEach((a) => {
      a.setAttribute('target', '_blank');
      a.setAttribute('rel', 'noopener noreferrer');
    });
  };

  // Re-render iframe when expand changes
  useEffect(() => {
    if (frameRef.current) {
      onLoad();
    }
  }, [isExpanded]);

  // Wrap email HTML with default font and basic styling
  const wrappedHtml = `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1">
        <style>
          html, body {
            margin: 0;
            padding: 0;
            overflow: hidden;
          }
          body {
            padding: 16px;
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
            font-size: 14px;
            line-height: 1.5;
            color: #333;
            background: white;
            overflow-wrap: break-word;
            word-wrap: break-word;
          }
          img {
            max-width: 100%;
            height: auto;
          }
          a {
            color: #4a90e2;
          }
        </style>
      </head>
      <body>
        ${html}
      </body>
    </html>
  `;

  return (
    <div className="relative">
      {/* Email Metadata Header */}
      {emailMetadata && <EmailMetadataHeader metadata={emailMetadata} senderName={senderName} senderEmail={senderEmail} />}

      {/* Email Content Container */}
      <div
        ref={contentRef}
        className={`relative ${isExpandable && !isExpanded ? 'max-h-[300px] overflow-hidden' : ''}`}
      >
        <iframe
          title="Email Content"
          ref={frameRef}
          onLoad={onLoad}
          className="w-full"
          sandbox="allow-same-origin allow-popups allow-popups-to-escape-sandbox"
          srcDoc={wrappedHtml}
          height={height}
          style={{ border: 'none', display: 'block' }}
        />

        {/* Gradient fade and expand button for long emails */}
        {isExpandable && !isExpanded && (
          <div className="absolute left-0 right-0 bottom-0 h-40 bg-gradient-to-t from-white via-white via-20% to-transparent dark:from-card dark:via-card flex items-end justify-center pb-4">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setIsExpanded(true)}
              className="shadow-md"
            >
              <ChevronsDown className="h-4 w-4 mr-2" />
              Expand Email
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}

export function TicketDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { user: currentUser } = useAuth();
  const [ticket, setTicket] = useState<TicketWithMessages | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [replyContent, setReplyContent] = useState('');
  const [isInternal, setIsInternal] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [isGeneratingResponse, setIsGeneratingResponse] = useState(false);
  const [isSavingDraft, setIsSavingDraft] = useState(false);
  const [draftSaved, setDraftSaved] = useState(false);
  const [users, setUsers] = useState<User[]>([]);
  const [cannedResponses, setCannedResponses] = useState<CannedResponse[]>([]);
  const [attachments, setAttachments] = useState<Array<{
    filename: string;
    filePath: string;
    size: number;
    mimeType: string;
  }>>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [toEmails, setToEmails] = useState<string[]>([]);
  const [showToInput, setShowToInput] = useState(false);
  const [toInputValue, setToInputValue] = useState('');
  const [showCcInput, setShowCcInput] = useState(false);
  const [ccEmails, setCcEmails] = useState<string[]>([]);
  const [ccInputValue, setCcInputValue] = useState('');
  const [customerEmails, setCustomerEmails] = useState<string[]>([]);
  const [additionalCustomerInfo, setAdditionalCustomerInfo] = useState<string | null>(null);
  const [isLoadingCustomerInfo, setIsLoadingCustomerInfo] = useState(false);
  const [customerInfoError, setCustomerInfoError] = useState<string | null>(null);
  const [customerInfoDrawerOpen, setCustomerInfoDrawerOpen] = useState(false);
  const [composingUsers, setComposingUsers] = useState<Array<{ email: string; name: string }>>([]);
  const [deletingMessageIds, setDeletingMessageIds] = useState<Set<number>>(new Set());
  const [ticketHistory, setTicketHistory] = useState<TicketHistoryEntry[]>([]);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [messageToDelete, setMessageToDelete] = useState<number | null>(null);
  const [showCollisionWarning, setShowCollisionWarning] = useState(false);
  const [changeContactDialogOpen, setChangeContactDialogOpen] = useState(false);
  const [editedCustomerEmail, setEditedCustomerEmail] = useState('');
  const [editedCustomerName, setEditedCustomerName] = useState('');
  const [showNewEmailModal, setShowNewEmailModal] = useState(false);
  const [newEmailSubject, setNewEmailSubject] = useState('');
  const [showForwardEmailModal, setShowForwardEmailModal] = useState(false);
  const [forwardEmailAddress, setForwardEmailAddress] = useState('');
  const [forwardComments, setForwardComments] = useState('');
  const [messageToForward, setMessageToForward] = useState<number | null>(null);
  const [isForwarding, setIsForwarding] = useState(false);
  const [replyToMessageId, setReplyToMessageId] = useState<number | null>(null);
  const [scheduledAt, setScheduledAt] = useState<string>('');
  const [showSchedulePicker, setShowSchedulePicker] = useState(false);
  const composingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const messagesPanelRef = useRef<HTMLDivElement>(null);

  const loadTicket = useCallback(async () => {
    if (!id) return;

    try {
      const data = await ticketsApi.getById(Number(id));
      setTicket(data);
    } catch (error) {
      console.error('Failed to load ticket:', error);
    } finally {
      setIsLoading(false);
    }
  }, [id]);

  const loadHistory = useCallback(async () => {
    if (!id) return;

    try {
      const data = await ticketsApi.getHistory(Number(id));
      setTicketHistory(data);
    } catch (error) {
      console.error('Failed to load ticket history:', error);
    }
  }, [id]);

  const fetchAdditionalCustomerInfo = useCallback(async () => {
    if (!ticket) return;

    setIsLoadingCustomerInfo(true);
    setCustomerInfoError(null);

    try {
      const data = await ticketsApi.getCustomerInfo(ticket.id);
      setAdditionalCustomerInfo(data.html);
    } catch (error) {
      console.error('Failed to fetch additional customer info:', error);
      // If 404, it means the feature is not configured - silently skip
      if (error instanceof ApiError && error.status === 404) {
        return;
      }
      setCustomerInfoError(error instanceof Error ? error.message : 'Failed to load additional information');
    } finally {
      setIsLoadingCustomerInfo(false);
    }
  }, [ticket]);

  // Load ticket and history on mount
  useEffect(() => {
    loadTicket();
    loadHistory();
  }, [loadTicket, loadHistory]);

  // Fetch additional customer info when ticket loads or customer email changes
  useEffect(() => {
    if (ticket) {
      fetchAdditionalCustomerInfo();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ticket?.id, ticket?.customer_email]);

  // Scroll to bottom when ticket loads
  useEffect(() => {
    if (ticket && messagesPanelRef.current) {
      // Scroll to bottom after a short delay to ensure content is rendered
      setTimeout(() => {
        if (messagesPanelRef.current) {
          messagesPanelRef.current.scrollTop = messagesPanelRef.current.scrollHeight;
        }
      }, 100);
    }
  }, [ticket?.id]);

  // Load users and canned responses on mount (with caching)
  // Note: Customer emails are now loaded on-demand as user types
  useEffect(() => {
    const loadData = async () => {
      try {
        const [usersData, responsesData] = await Promise.all([
          fetchWithCache('users', () => usersApi.getAll()),
          fetchWithCache('canned-responses', () => cannedResponsesApi.getAll()),
        ]);

        setUsers(usersData);
        setCannedResponses(responsesData);
      } catch (error) {
        console.error('Failed to load data:', error);
      }
    };

    loadData();
  }, []);

  // Memoize sorted active users to avoid re-sorting on every render
  const sortedActiveUsers = useMemo(() => {
    return [...users]
      .filter((u) => u.active)
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [users]);

  // Load draft on mount
  useEffect(() => {
    const loadDraft = async () => {
      if (!id) return;

      try {
        const draft = await draftsApi.get(Number(id));
        if (draft) {
          setReplyContent(draft.content);
          setDraftSaved(true);
        }
      } catch (error: any) {
        // 404 means no draft exists yet, which is normal - silently ignore
        if (error?.status !== 404) {
          console.error('Failed to load draft:', error);
        }
      }
    };

    loadDraft();
  }, [id]);

  // Auto-save draft
  useEffect(() => {
    if (!id || !replyContent.trim()) return;

    const timeoutId = setTimeout(async () => {
      try {
        setIsSavingDraft(true);
        await draftsApi.save(Number(id), replyContent);
        setDraftSaved(true);
        setTimeout(() => setDraftSaved(false), 2000);
      } catch (error) {
        console.error('Failed to save draft:', error);
      } finally {
        setIsSavingDraft(false);
      }
    }, 3000); // Debounce 3 seconds

    return () => clearTimeout(timeoutId);
  }, [id, replyContent]);

  // Debounced email search for CC input
  useEffect(() => {
    if (!ccInputValue || ccInputValue.length < 2) {
      setCustomerEmails([]);
      return;
    }

    const timeoutId = setTimeout(async () => {
      try {
        const data = await ticketsApi.getCustomerEmails(ccInputValue);
        setCustomerEmails(data);
      } catch (error) {
        console.error('Failed to search customer emails:', error);
      }
    }, 300); // 300ms debounce

    return () => clearTimeout(timeoutId);
  }, [ccInputValue]);

  // Debounced email search for change contact dialog
  useEffect(() => {
    if (!changeContactDialogOpen || !editedCustomerEmail || editedCustomerEmail.length < 2) {
      // Only clear if dialog is closed
      if (!changeContactDialogOpen) {
        setCustomerEmails([]);
      }
      return;
    }

    const timeoutId = setTimeout(async () => {
      try {
        const data = await ticketsApi.getCustomerEmails(editedCustomerEmail);
        setCustomerEmails(data);
      } catch (error) {
        console.error('Failed to search customer emails:', error);
      }
    }, 300); // 300ms debounce

    return () => clearTimeout(timeoutId);
  }, [editedCustomerEmail, changeContactDialogOpen]);

  // Real-time updates for new messages
  useSSE({
    onEvent: (event) => {
      if (event.type === 'new-message') {
        const messageEvent = event as NewMessageEvent;
        if (messageEvent.data.ticketId === Number(id)) {
          // Add new message to the list (check for duplicates first)
          setTicket((prev) => {
            if (!prev) return prev;

            // Check if message already exists (prevents duplicates from optimistic updates)
            const messageExists = prev.messages.some(m => m.id === messageEvent.data.message.id);
            if (messageExists) return prev;

            return {
              ...prev,
              messages: [...prev.messages, messageEvent.data.message],
            };
          });

          // Scroll to bottom when new message arrives
          setTimeout(() => {
            if (messagesPanelRef.current) {
              messagesPanelRef.current.scrollTop = messagesPanelRef.current.scrollHeight;
            }
          }, 100);
        }
      }

      if (event.type === 'message-deleted') {
        const deleteEvent = event as MessageDeletedEvent;
        if (deleteEvent.data.ticketId === Number(id)) {
          // Mark message as deleting to trigger fade-out animation
          setDeletingMessageIds((prev) => new Set(prev).add(deleteEvent.data.messageId));

          // Remove the message after fade-out animation completes (300ms)
          setTimeout(() => {
            setTicket((prev) => {
              if (!prev) return prev;

              return {
                ...prev,
                messages: prev.messages.filter(m => m.id !== deleteEvent.data.messageId),
              };
            });

            // Clean up deletingMessageIds
            setDeletingMessageIds((prev) => {
              const next = new Set(prev);
              next.delete(deleteEvent.data.messageId);
              return next;
            });
          }, 300);
        }
      }

      if (event.type === 'user-composing') {
        const composingEvent = event as UserComposingEvent;
        if (composingEvent.data.ticketId === Number(id) && composingEvent.data.userEmail !== currentUser?.email) {
          // Add user to composing list
          setComposingUsers((prev) => {
            const existing = prev.find((u) => u.email === composingEvent.data.userEmail);
            if (existing) return prev;
            return [...prev, { email: composingEvent.data.userEmail, name: composingEvent.data.userName }];
          });

          // Remove user after 5 seconds (typing stopped)
          setTimeout(() => {
            setComposingUsers((prev) => prev.filter((u) => u.email !== composingEvent.data.userEmail));
          }, 5000);
        }
      }

      if (event.type === 'ticket-update') {
        const ticketUpdateEvent = event as any;
        if (ticketUpdateEvent.data.id === Number(id)) {
          // Update ticket fields (status, priority, assignee, etc.)
          setTicket((prev) => {
            if (!prev) return prev;

            return {
              ...prev,
              status: ticketUpdateEvent.data.status,
              priority: ticketUpdateEvent.data.priority,
              assignee_id: ticketUpdateEvent.data.assignee_id,
              updated_at: ticketUpdateEvent.data.updated_at,
            };
          });
        }
      }
    },
  });

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0 || !id) return;

    setIsUploading(true);
    try {
      for (const file of Array.from(files)) {
        const formData = new FormData();
        formData.append('file', file);
        formData.append('ticketId', id);

        const response = await fetch('/api/upload', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${localStorage.getItem('authToken')}`,
          },
          body: formData,
        });

        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(errorData.error || 'Upload failed');
        }

        const fileInfo = await response.json();
        setAttachments(prev => [...prev, fileInfo]);
      }
    } catch (error) {
      console.error('Failed to upload file:', error);
      const errorMessage = error instanceof Error ? error.message : 'Failed to upload file. Please try again.';
      toast.error('Failed to upload file', {
        description: errorMessage
      });
    } finally {
      setIsUploading(false);
      // Reset file input
      e.target.value = '';
    }
  };

  const handleRemoveAttachment = (index: number) => {
    setAttachments(prev => prev.filter((_, i) => i !== index));
  };

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  };

  // Notify other agents that user is composing
  const notifyComposing = useCallback(() => {
    if (!id) return;

    // Throttle composing notifications (max once every 3 seconds)
    if (composingTimeoutRef.current) return;

    ticketsApi.notifyComposing(Number(id)).catch(console.error);

    composingTimeoutRef.current = setTimeout(() => {
      composingTimeoutRef.current = null;
    }, 3000);
  }, [id]);

  // Track when user types to notify composing
  useEffect(() => {
    if (replyContent.trim()) {
      notifyComposing();
    }
  }, [replyContent, notifyComposing]);

  // Extract inline images from HTML and convert to file attachments
  const extractInlineImages = async (html: string): Promise<{ html: string; inlineImages: Array<{ blob: Blob; filename: string; cid: string }> }> => {
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, 'text/html');
    const images = doc.querySelectorAll('img[src^="data:"]');
    const inlineImages: Array<{ blob: Blob; filename: string; cid: string }> = [];

    for (let i = 0; i < images.length; i++) {
      const img = images[i] as HTMLImageElement;
      const dataURL = img.src;

      try {
        // Convert data URL to blob
        const response = await fetch(dataURL);
        const blob = await response.blob();

        // Generate unique CID
        const cid = `image-${Date.now()}-${i}`;
        const extension = blob.type.split('/')[1] || 'png';
        const filename = `${cid}.${extension}`;

        // Replace data URL with CID reference in HTML
        img.src = `cid:${cid}`;

        inlineImages.push({ blob, filename, cid });
      } catch (error) {
        console.error('Failed to process inline image:', error);
      }
    }

    return {
      html: doc.body.innerHTML,
      inlineImages,
    };
  };

  const handleSendReply = () => {
    if (!id || !replyContent.trim()) return;

    // Check for collision - warn if someone else is composing
    if (composingUsers.length > 0 && !isInternal) {
      setShowCollisionWarning(true);
      return;
    }

    // No collision, send directly
    sendReply();
  };

  const sendReply = async () => {
    if (!id || !replyContent.trim()) return;

    try {
      setIsSending(true);
      setShowCollisionWarning(false);

      // Extract inline images from HTML
      const { html: htmlWithCids, inlineImages } = await extractInlineImages(replyContent);

      // Upload inline images as attachments
      const inlineAttachments: Array<{
        filename: string;
        filePath: string;
        size: number;
        mimeType: string;
        cid: string;
      }> = [];

      for (const image of inlineImages) {
        try {
          const formData = new FormData();
          formData.append('file', image.blob, image.filename);
          formData.append('ticketId', id.toString());

          const response = await fetch('/api/upload', {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${localStorage.getItem('authToken')}`,
            },
            body: formData,
          });

          if (response.ok) {
            const data = await response.json();
            inlineAttachments.push({
              filename: data.filename,
              filePath: data.filePath,
              size: data.size,
              mimeType: data.mimeType,
              cid: image.cid,
            });
          }
        } catch (error) {
          console.error('Failed to upload inline image:', error);
        }
      }

      // Combine regular attachments with inline image attachments
      const allAttachments = [...attachments, ...inlineAttachments];

      // Determine primary recipient based on reply-to or default
      let primaryRecipient = ticket?.customer_email || '';
      if (replyToMessageId) {
        const replyToMessage = ticket?.messages?.find(m => m.id === replyToMessageId);
        primaryRecipient = replyToMessage?.sender_email || ticket?.customer_email || '';
      }

      // Build complete To list: primary recipient + additional To emails
      const allToEmails = [primaryRecipient, ...toEmails];

      // Send message with cid: references in HTML
      // Backend will convert to cid: for email, and when messages are displayed
      // we'll replace cid: with /api/attachments/:id using attachment IDs
      await ticketsApi.reply(Number(id), {
        body: htmlWithCids,  // Keep cid: references in database
        type: isInternal ? 'note' : 'email',
        uploadedFiles: allAttachments.length > 0 ? allAttachments : undefined,
        to_emails: !isInternal ? allToEmails : undefined, // Always send to_emails for email type
        cc_emails: ccEmails.length > 0 ? ccEmails : undefined,
        reply_to_message_id: replyToMessageId || undefined,
        scheduled_at: scheduledAt || undefined,
      });

      // Message will be added via SSE event (no optimistic update to avoid duplicates)

      // Show toast for scheduled messages
      if (scheduledAt) {
        toast.success('Reply scheduled', {
          description: `Will be sent on ${new Date(scheduledAt).toLocaleString()}`
        });
      }

      // Clear the form
      setReplyContent('');
      setIsInternal(false);
      setAttachments([]);
      setToEmails([]);
      setShowToInput(false);
      setCcEmails([]);
      setShowCcInput(false);
      setReplyToMessageId(null);
      setScheduledAt('');
      setShowSchedulePicker(false);

      // Delete the draft
      try {
        await draftsApi.delete(Number(id));
      } catch (error) {
        console.log('No draft to delete');
      }
    } catch (error) {
      console.error('Failed to send reply:', error);
      toast.error('Failed to send reply. Please try again.');
    } finally {
      setIsSending(false);
    }
  };

  const handleGenerateAIResponse = async () => {
    if (!id) return;

    try {
      setIsGeneratingResponse(true);
      const result = await ticketsApi.generateResponse(Number(id));

      // Insert AI response into the editor
      if (result.response) {
        setReplyContent(result.response);
      }
    } catch (error) {
      console.error('Failed to generate AI response:', error);
      if (error instanceof ApiError && error.status === 404) {
        toast.error('AI response generation is not configured', {
          description: 'Please set AI_RESPONSE_API_URL in the server configuration'
        });
      } else {
        toast.error('Failed to generate AI response. Please try again.');
      }
    } finally {
      setIsGeneratingResponse(false);
    }
  };

  const handleDeleteMessage = (messageId: number) => {
    setMessageToDelete(messageId);
    setDeleteConfirmOpen(true);
  };

  const confirmDeleteMessage = async () => {
    if (!messageToDelete) return;

    try {
      await messagesApi.delete(messageToDelete);
      // Message will be removed via SSE event
      setDeleteConfirmOpen(false);
      setMessageToDelete(null);
      toast.success('Message deleted');
    } catch (error) {
      console.error('Failed to delete message:', error);
      toast.error('Failed to delete message. Please try again.');
    }
  };

  const handleCancelScheduled = async (messageId: number) => {
    try {
      await messagesApi.cancelScheduled(messageId);
      // Remove from UI
      setTicket((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          messages: prev.messages.filter(m => m.id !== messageId),
        };
      });
      toast.success('Scheduled message cancelled');
    } catch (error) {
      console.error('Failed to cancel scheduled message:', error);
      toast.error('Failed to cancel scheduled message. Please try again.');
    }
  };

  const handleStatusChange = async (newStatus: string) => {
    if (!id) return;

    try {
      const updatedTicket = await ticketsApi.update(Number(id), {
        status: newStatus as any,
      });
      setTicket((prev) => (prev ? { ...prev, ...updatedTicket } : prev));
    } catch (error) {
      console.error('Failed to update status:', error);
      toast.error('Failed to update status. Please try again.');
    }
  };

  const handlePriorityChange = async (newPriority: string) => {
    if (!id) return;

    try {
      const updatedTicket = await ticketsApi.update(Number(id), {
        priority: newPriority as any,
      });
      setTicket((prev) => (prev ? { ...prev, ...updatedTicket } : prev));
    } catch (error) {
      console.error('Failed to update priority:', error);
      toast.error('Failed to update priority. Please try again.');
    }
  };

  const handleAssigneeChange = async (value: string) => {
    if (!id) return;

    try {
      const assigneeId = value === 'unassigned' ? null : Number(value);
      const updatedTicket = await ticketsApi.update(Number(id), {
        assignee_id: assigneeId,
      });
      setTicket((prev) => (prev ? { ...prev, ...updatedTicket } : prev));
    } catch (error) {
      console.error('Failed to update assignee:', error);
      toast.error('Failed to update assignee. Please try again.');
    }
  };

  const handleFollowUpChange = async (value: string) => {
    if (!id) return;

    try {
      const followUpAt = value || null;
      const updatedTicket = await ticketsApi.update(Number(id), {
        follow_up_at: followUpAt,
      });
      setTicket((prev) => (prev ? { ...prev, ...updatedTicket } : prev));
      if (followUpAt) {
        toast.success('Follow-up date set');
      } else {
        toast.success('Follow-up date cleared');
      }
    } catch (error) {
      console.error('Failed to update follow-up date:', error);
      toast.error('Failed to update follow-up date. Please try again.');
    }
  };

  const handleDeleteDraft = async () => {
    if (!id) return;

    try {
      await draftsApi.delete(Number(id));
      setReplyContent('');
      setDraftSaved(false);
    } catch (error) {
      console.error('Failed to delete draft:', error);
      toast.error('Failed to delete draft. Please try again.');
    }
  };

  const handleAddCcEmail = () => {
    const email = ccInputValue.trim();
    if (!email) return;

    // Basic email validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      toast.error('Please enter a valid email address');
      return;
    }

    // Check if email already exists
    if (ccEmails.includes(email) || email === ticket?.customer_email) {
      toast.error('This email is already in the recipient list');
      return;
    }

    setCcEmails([...ccEmails, email]);
    setCcInputValue('');
  };

  const handleRemoveCcEmail = (email: string) => {
    setCcEmails(ccEmails.filter(e => e !== email));
  };

  const handleAddToEmail = () => {
    const email = toInputValue.trim();
    if (!email) return;

    // Basic email validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      toast.error('Please enter a valid email address');
      return;
    }

    // Check if email already exists in To or CC
    if (toEmails.includes(email) || ccEmails.includes(email)) {
      toast.error('This email is already in the recipient list');
      return;
    }

    setToEmails([...toEmails, email]);
    setToInputValue('');
  };

  const handleRemoveToEmail = (email: string) => {
    setToEmails(toEmails.filter(e => e !== email));
  };

  const handleOpenChangeContactDialog = () => {
    if (ticket) {
      setEditedCustomerEmail(ticket.customer_email);
      setEditedCustomerName(ticket.customer_name || '');
      setChangeContactDialogOpen(true);
    }
  };

  const handleSaveCustomerContact = async () => {
    if (!id || !editedCustomerEmail.trim()) return;

    // Basic email validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(editedCustomerEmail)) {
      toast.error('Please enter a valid email address');
      return;
    }

    try {
      await ticketsApi.update(Number(id), {
        customer_email: editedCustomerEmail.trim(),
        customer_name: editedCustomerName.trim() || undefined,
      });

      // Reload the full ticket to get updated customer_ticket_count and other data
      await loadTicket();

      setChangeContactDialogOpen(false);
      toast.success('Customer contact updated');
    } catch (error) {
      console.error('Failed to update customer contact:', error);
      toast.error('Failed to update customer contact. Please try again.');
    }
  };

  const handleCancelChangeContact = () => {
    setChangeContactDialogOpen(false);
    setEditedCustomerEmail('');
    setEditedCustomerName('');
  };

  const handleNewConversation = async () => {
    if (!ticket) return;

    try {
      // Create ticket via API client
      const data = await ticketsApi.create({
        subject: newEmailSubject || 'New message',
        customer_email: ticket.customer_email,
        message_body: '',  // Empty body - ticket starts with no messages
      });

      // Reset form and close modal
      setNewEmailSubject('');
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

  const handleReplyToMessage = (messageId: number) => {
    if (!ticket) return;

    // Find the message
    const message = ticket.messages?.find(m => m.id === messageId);
    if (!message) return;

    // Set the reply_to_message_id for backend to quote this specific message
    setReplyToMessageId(messageId);

    // Scroll the message being replied to to the top of the screen
    setTimeout(() => {
      const messageElement = document.querySelector(`[data-message-id="${messageId}"]`);
      if (messageElement) {
        messageElement.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    }, 100);

    const senderName = message.sender_name || message.sender_email;
    toast.success(`Replying to ${senderName}`, {
      description: `Email will be sent to ${message.sender_email}`
    });
  };

  const handleForwardEmail = (messageId: number) => {
    setMessageToForward(messageId);
    setShowForwardEmailModal(true);
  };

  const handleSubmitForwardEmail = async () => {
    if (!messageToForward || !forwardEmailAddress.trim()) return;

    // Basic email validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(forwardEmailAddress)) {
      toast.error('Please enter a valid email address');
      return;
    }

    try {
      setIsForwarding(true);

      // Call the forward API endpoint
      await ticketsApi.forwardMessage(messageToForward, forwardEmailAddress.trim(), forwardComments.trim());

      // Reset form and close modal
      setForwardEmailAddress('');
      setForwardComments('');
      setShowForwardEmailModal(false);
      setMessageToForward(null);

      toast.success('Email forwarded successfully');
    } catch (error) {
      console.error('Failed to forward email:', error);
      toast.error('Failed to forward email', {
        description: error instanceof Error ? error.message : 'Unknown error'
      });
    } finally {
      setIsForwarding(false);
    }
  };

  // Build sorted timeline: messages + history entries by timestamp
  // Must be before early returns to satisfy Rules of Hooks
  const timeline = useMemo(() => {
    if (!ticket) return [];

    // Combine messages and history entries
    const messages = ticket.messages || [];
    const history = ticketHistory || [];
    const combined = [...messages, ...history];

    // Sort by timestamp (oldest first)
    return combined.sort((a, b) => {
      const aTime = 'created_at' in a ? a.created_at : a.changed_at;
      const bTime = 'created_at' in b ? b.created_at : b.changed_at;
      return new Date(aTime).getTime() - new Date(bTime).getTime();
    });
  }, [ticket, ticketHistory]);

  // Create users lookup map for history entries
  const usersMap = useMemo(() =>
    Object.fromEntries(users.map(u => [u.id, u.name])),
    [users]
  );

  // Render reply editor (can be shown inline or at bottom)
  const renderReplyEditor = () => {
    if (!ticket) return null;

    return (
      <div className="space-y-4 my-8">
        <Card className="lg:p-6 lg:border p-0 border-0 lg:bg-card bg-transparent shadow-none">
          <div className="space-y-4">
            {/* Recipients Section with Draft Status */}
            <div className="space-y-2">
              <div className="flex items-center justify-between gap-4">
                {!isInternal ? (
                  <div className="flex items-center flex-wrap gap-2 text-sm">
                    <span className="text-muted-foreground">To:</span>
                    {/* Primary recipient (based on reply-to or default) */}
                    <Badge variant="secondary" className="text-sm">
                      {(() => {
                        // Show specific recipient if replying to a message
                        if (replyToMessageId) {
                          const replyToMessage = ticket?.messages?.find(m => m.id === replyToMessageId);
                          return replyToMessage?.sender_email || ticket?.customer_email;
                        }
                        return ticket?.customer_email;
                      })()}
                    </Badge>
                    {/* Additional To recipients */}
                    {toEmails.map((email) => (
                      <Badge key={email} variant="secondary" className="text-sm">
                        {email}
                        <button
                          onClick={() => handleRemoveToEmail(email)}
                          className="ml-1 hover:text-destructive"
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </Badge>
                    ))}
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setShowToInput(!showToInput)}
                      className="h-6 px-2 text-xs"
                    >
                      <Plus className="h-3 w-3 mr-1" />
                      Add To
                    </Button>

                    {/* CC recipients */}
                    {ccEmails.length > 0 && (
                      <>
                        <span className="text-muted-foreground">Cc:</span>
                        {ccEmails.map((email) => (
                          <Badge key={email} variant="outline" className="text-sm">
                            {email}
                            <button
                              onClick={() => handleRemoveCcEmail(email)}
                              className="ml-1 hover:text-destructive"
                            >
                              <X className="h-3 w-3" />
                            </button>
                          </Badge>
                        ))}
                      </>
                    )}
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setShowCcInput(!showCcInput)}
                      className="h-6 px-2 text-xs"
                    >
                      <Plus className="h-3 w-3 mr-1" />
                      Add Cc
                    </Button>
                  </div>
                ) : (
                  <div />
                )}
                <div className="flex items-center gap-2">
                  {(isSavingDraft || draftSaved) && (
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      {isSavingDraft ? (
                        <>
                          <Save className="h-4 w-4 animate-pulse" />
                          <span>Saving draft...</span>
                        </>
                      ) : (
                        <>
                          <Save className="h-4 w-4 text-green-600" />
                          <span className="text-green-600">Draft saved</span>
                        </>
                      )}
                    </div>
                  )}
                  {replyContent.trim() && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={handleDeleteDraft}
                      className="h-6 w-6 p-0"
                      title="Delete draft"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  )}
                </div>
              </div>

              {/* To Email Input */}
              {!isInternal && showToInput && (
                <div className="flex gap-2">
                  <Combobox
                    placeholder="Enter email address"
                    value={toInputValue}
                    onChange={setToInputValue}
                    options={customerEmails}
                    className="flex-1"
                    onEnter={handleAddToEmail}
                  />
                  <Button
                    size="sm"
                    onClick={handleAddToEmail}
                    className="h-8"
                  >
                    Add
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => {
                      setShowToInput(false);
                      setToInputValue('');
                    }}
                    className="h-8"
                  >
                    Cancel
                  </Button>
                </div>
              )}

              {/* Cc Email Input */}
              {!isInternal && showCcInput && (
                <div className="flex gap-2">
                  <Combobox
                    placeholder="Enter email address"
                    value={ccInputValue}
                    onChange={setCcInputValue}
                    options={customerEmails}
                    className="flex-1"
                    onEnter={handleAddCcEmail}
                  />
                  <Button
                    size="sm"
                    onClick={handleAddCcEmail}
                    className="h-8"
                  >
                    Add
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => {
                      setShowCcInput(false);
                      setCcInputValue('');
                    }}
                    className="h-8"
                  >
                    Cancel
                  </Button>
                </div>
              )}
            </div>

            {/* Composing Indicator */}
            {composingUsers.length > 0 && (
              <div className="flex items-center gap-2 text-sm text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/20 px-3 py-2 rounded-md border border-amber-200 dark:border-amber-900">
                <Loader2 className="h-3 w-3 animate-spin" />
                <span>
                  {composingUsers.map((u) => u.name).join(', ')} {composingUsers.length === 1 ? 'is' : 'are'} composing a reply...
                </span>
              </div>
            )}

            {/* Reply Editor */}
            <div data-reply-editor>
              <RichTextEditor
                content={replyContent}
                onChange={setReplyContent}
                placeholder="Type your reply here... (Press / for templates)"
                disabled={isSending}
                className={isInternal ? 'border-yellow-300 bg-yellow-50' : ''}
                cannedResponses={cannedResponses}
                variables={{
                  customer_name: ticket.customer_name || ticket.customer_email || 'Customer',
                  customer_first_name: (ticket.customer_name || ticket.customer_email || 'Customer').split(' ')[0],
                  customer_email: ticket.customer_email || '',
                  ticket_id: String(ticket.id),
                  ticket_subject: ticket.subject,
                }}
                onFileUpload={handleFileUpload}
                isUploading={isUploading}
                onAiSuggest={handleGenerateAIResponse}
                isGeneratingAi={isGeneratingResponse}
              />
            </div>

            {/* Attachments */}
            {attachments.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {attachments.map((file, index) => (
                  <div
                    key={index}
                    className="flex items-center gap-2 px-3 py-2 bg-muted rounded-md text-sm"
                  >
                    <File className="h-4 w-4" />
                    <span className="truncate max-w-xs">{file.filename}</span>
                    <span className="text-muted-foreground">({formatFileSize(file.size)})</span>
                    <button
                      onClick={() => handleRemoveAttachment(index)}
                      className="hover:text-destructive"
                      title="Remove attachment"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                ))}
              </div>
            )}

            {/* Actions */}
            <div className="flex flex-wrap items-center gap-2">
              <div className="flex items-center gap-2">
                <Checkbox
                  id="internal"
                  checked={isInternal}
                  onCheckedChange={(checked) => setIsInternal(checked === true)}
                />
                <Label htmlFor="internal" className="text-sm cursor-pointer">
                  Internal Note (not sent to customer)
                </Label>
              </div>

              <div className="flex-1" />

              {/* Schedule picker */}
              {!isInternal && (
                <div className="flex items-center gap-2">
                  {showSchedulePicker ? (
                    <div className="flex items-center gap-2">
                      <Input
                        type="datetime-local"
                        value={scheduledAt}
                        onChange={(e) => setScheduledAt(e.target.value)}
                        min={new Date().toISOString().slice(0, 16)}
                        className="w-auto text-sm"
                      />
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          setShowSchedulePicker(false);
                          setScheduledAt('');
                        }}
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                  ) : (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setShowSchedulePicker(true)}
                      title="Schedule for later"
                    >
                      <Clock className="h-4 w-4" />
                    </Button>
                  )}
                </div>
              )}

              <div className="flex gap-2 w-full sm:w-auto">
                <Button
                  onClick={handleSendReply}
                  disabled={!replyContent.trim() || isSending}
                  className="flex-1 sm:flex-initial"
                >
                  {isSending ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      {scheduledAt ? 'Scheduling...' : 'Sending...'}
                    </>
                  ) : (
                    <>
                      {scheduledAt ? (
                        <>
                          <Calendar className="mr-2 h-4 w-4" />
                          Schedule
                        </>
                      ) : (
                        <>
                          <Send className="mr-2 h-4 w-4" />
                          {isInternal ? 'Add Note' : 'Send Reply'}
                        </>
                      )}
                    </>
                  )}
                </Button>
              </div>
            </div>
          </div>
        </Card>
      </div>
    );
  };

  if (isLoading) {
    return (
      <div className="h-full flex flex-col bg-muted/20">
        {/* Header placeholder */}
        <header className="sticky top-0 z-50 flex-shrink-0 border-b backdrop-blur-lg bg-background/70">
          <div className="px-2 sm:px-4 py-2">
            {/* Desktop: Two-column layout */}
            <div className="hidden lg:flex gap-4">
              {/* Left Column: Back Button */}
              <div className="flex-shrink-0">
                <BackButton to="/tickets" />
              </div>

              {/* Right Column: Loading indicator */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <Loader2 className="h-5 w-5 animate-spin" />
                  <span className="text-lg font-semibold">Loading...</span>
                </div>
              </div>
            </div>

            {/* Mobile: Back Button on its own row */}
            <div className="flex lg:hidden items-center gap-2 mb-3">
              <BackButton to="/tickets" />
            </div>

            {/* Mobile: Subject Line Placeholder */}
            <div className="lg:hidden mb-2">
              <div className="flex items-center gap-2">
                <Mail className="h-5 w-5 flex-shrink-0 hidden sm:block" />
                <span className="text-lg font-semibold">Loading...</span>
              </div>
            </div>
          </div>
        </header>

        {/* Loading content */}
        <div className="flex-1 flex flex-col items-center justify-center gap-4 pt-32">
          <Loader2 className="h-12 w-12 animate-spin text-primary" />
          <p className="text-base font-medium text-foreground">Loading ticket...</p>
        </div>
      </div>
    );
  }

  if (!ticket) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Card className="p-8">
          <p className="text-muted-foreground">Ticket not found</p>
          <Link to="/tickets">
            <Button className="mt-4">Back to Tickets</Button>
          </Link>
        </Card>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col bg-muted/20">
      {/* Header - Fixed at top */}
      <header className="sticky top-0 z-50 flex-shrink-0 border-b backdrop-blur-lg bg-background/70">
        <div className="px-2 sm:px-4 py-2">
          {/* Mobile: Top Bar with Back Button and Action Buttons */}
          <div className="flex lg:hidden items-center gap-2 mb-3">
            <BackButton to="/tickets" />
            <div className="flex-1" />
            <div className="flex items-center gap-2">
              <Link to="/search" className="flex items-center justify-center h-9 w-9 flex-shrink-0">
                <Search className="h-5 w-5" />
              </Link>
              <Button
                variant="outline"
                size="icon"
                className="flex-shrink-0"
                onClick={() => setCustomerInfoDrawerOpen(true)}
              >
                <Menu className="h-4 w-4" />
              </Button>
            </div>
          </div>

          {/* Desktop: Two-column layout */}
          <div className="hidden lg:flex gap-4">
            {/* Left Column: Back Button */}
            <div className="flex-shrink-0">
              <BackButton to="/tickets" />
            </div>

            {/* Right Column: Content */}
            <div className="flex-1 min-w-0">
              {/* Top Row: Subject and Controls */}
              <div className="flex items-start gap-4 mb-2">
                {/* Subject */}
                <div className="flex-1 min-w-0">
                  <TicketSubject subject={ticket.subject} />
                </div>

                {/* Action Buttons and Dropdowns */}
                <div className="flex items-center gap-2 flex-shrink-0">
                  <Select value={ticket.status} onValueChange={handleStatusChange}>
                    <SelectTrigger className="w-[140px] text-xs sm:text-sm">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="new">{STATUS_LABELS.new}</SelectItem>
                      <SelectItem value="open">{STATUS_LABELS.open}</SelectItem>
                      <SelectItem value="awaiting_customer">{STATUS_LABELS.awaiting_customer}</SelectItem>
                      <SelectItem value="resolved">{STATUS_LABELS.resolved}</SelectItem>
                    </SelectContent>
                  </Select>

                  <Select value={ticket.priority} onValueChange={handlePriorityChange}>
                    <SelectTrigger className="w-[100px] text-xs sm:text-sm">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="low">{PRIORITY_LABELS.low}</SelectItem>
                      <SelectItem value="normal">{PRIORITY_LABELS.normal}</SelectItem>
                      <SelectItem value="high">{PRIORITY_LABELS.high}</SelectItem>
                      <SelectItem value="urgent">{PRIORITY_LABELS.urgent}</SelectItem>
                    </SelectContent>
                  </Select>

                  <Select
                    value={ticket.assignee_id ? String(ticket.assignee_id) : 'unassigned'}
                    onValueChange={handleAssigneeChange}
                  >
                    <SelectTrigger className="w-[140px] text-xs sm:text-sm">
                      <SelectValue placeholder="Unassigned" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="unassigned">Unassigned</SelectItem>
                      {sortedActiveUsers.map((u) => (
                        <SelectItem key={u.id} value={String(u.id)}>
                          {u.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>

                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        variant="outline"
                        size="icon"
                        className={`flex-shrink-0 ${ticket.follow_up_at ? 'text-primary border-primary' : ''}`}
                        title={ticket.follow_up_at ? `Follow-up: ${new Date(ticket.follow_up_at).toLocaleDateString()}` : 'Set follow-up date'}
                      >
                        <CalendarClock className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="p-3 w-[200px]">
                      <Label className="text-xs text-muted-foreground mb-2 block">Follow-up Date</Label>
                      <Input
                        type="date"
                        value={ticket.follow_up_at ? ticket.follow_up_at.split('T')[0] : ''}
                        onChange={(e) => handleFollowUpChange(e.target.value)}
                        className="w-full"
                      />
                      {ticket.follow_up_at && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="w-full mt-2"
                          onClick={() => handleFollowUpChange('')}
                        >
                          <X className="h-3 w-3 mr-1" />
                          Clear
                        </Button>
                      )}
                    </DropdownMenuContent>
                  </DropdownMenu>

                  <Link to="/search">
                    <Button variant="outline" size="icon" className="flex-shrink-0">
                      <Search className="h-4 w-4" />
                    </Button>
                  </Link>
                </div>
              </div>

              {/* Bottom Row: Ticket Details */}
              <div className="flex flex-wrap items-center gap-2">
                <TicketMetadata
                  ticketId={ticket.id}
                  createdAt={
                    ticket.messages?.find(m => m.sender_email === ticket.customer_email)?.created_at ||
                    ticket.messages?.[0]?.created_at ||
                    ticket.created_at
                  }
                />
                <span className="text-sm text-muted-foreground">•</span>
                <TagManager ticketId={ticket.id} showTags={true} showAddButton={true} />
              </div>
            </div>
          </div>

        </div>
      </header>

      {/* Main Content Area - Two independent scrolling panels */}
      <div className="flex-1 flex overflow-hidden min-h-0">
        {/* Left Panel: Messages Thread - Scrollable */}
        <div ref={messagesPanelRef} className="flex-1 min-w-0 overflow-y-auto lg:overflow-hidden lg:hover:overflow-y-auto h-full">
          <div className="px-2 sm:px-4 pt-4 pb-6 space-y-4 sm:space-y-6">

          {/* Mobile: Subject and Details - At top of scrollable area */}
          <div className="lg:hidden mb-4 pb-4 border-b">
            {/* Subject Line */}
            <div className="mb-2">
              <TicketSubject subject={ticket.subject} />
            </div>

            {/* Ticket Details */}
            <div className="space-y-2">
              {/* Ticket ID and Date */}
              <TicketMetadata
                ticketId={ticket.id}
                createdAt={
                  ticket.messages?.find(m => m.sender_email === ticket.customer_email)?.created_at ||
                  ticket.messages?.[0]?.created_at ||
                  ticket.created_at
                }
              />

              {/* Tags */}
              <div className="flex flex-wrap items-center gap-2">
                <TagManager ticketId={ticket.id} showTags={true} showAddButton={true} />
              </div>
            </div>
          </div>

          {timeline.length === 0 ? (
            <Card className="p-8 text-center">
              <p className="text-muted-foreground">No messages yet</p>
              <p className="text-xs text-muted-foreground mt-2">Compose your first message below to start the conversation</p>
            </Card>
          ) : (
            timeline.map((item, index) => {
            // Discriminate by property: history entries have 'field_name', messages have 'sender_email'
            if ('field_name' in item) {
              return (
                <TicketChangeEntry
                  key={`history-${item.id}`}
                  entry={item}
                  users={usersMap}
                />
              );
            }

            // Handle message
            const message = item;
            const isCustomer = message.sender_email === ticket.customer_email;
            const isFirstMessage = timeline.findIndex(t => 'sender_email' in t) === index;
            const isDeleting = deletingMessageIds.has(message.id);

            const showReplyEditorHere = replyToMessageId === message.id;

            return (
              <React.Fragment key={message.id}>
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
                            <DropdownMenuItem onClick={() => handleReplyToMessage(message.id)}>
                              <Reply className="h-4 w-4 mr-2" />
                              Reply
                            </DropdownMenuItem>
                          )}
                          {/* Forward option for all messages */}
                          <DropdownMenuItem onClick={() => handleForwardEmail(message.id)}>
                            <Forward className="h-4 w-4 mr-2" />
                            Forward Email
                          </DropdownMenuItem>
                          {/* Delete option only for internal notes */}
                          {message.type === 'note' && (
                            <DropdownMenuItem
                              onClick={() => handleDeleteMessage(message.id)}
                              className="text-destructive focus:text-destructive focus:bg-destructive/10"
                            >
                              <Trash2 className="h-4 w-4 mr-2" />
                              Delete Note
                            </DropdownMenuItem>
                          )}
                          {/* Cancel option for scheduled messages */}
                          {message.scheduled_at && !message.sent_at && (
                            <DropdownMenuItem
                              onClick={() => handleCancelScheduled(message.id)}
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
                                metadata={JSON.parse(message.email_metadata!)}
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

              {/* Show reply editor inline after this message if replying to it */}
              {showReplyEditorHere && renderReplyEditor()}
              </React.Fragment>
            );
          })
          )}

            {/* Show reply editor at bottom only if NOT replying to a specific message */}
            {!replyToMessageId && (
              <>
                {/* Separator */}
                <div className="my-8">
                  <Separator />
                </div>

                {/* Reply Editor */}
                {renderReplyEditor()}
              </>
            )}
          </div>
        </div>

        {/* Right Panel: Customer Info Sidebar - Scrollable */}
        <div className="hidden lg:block w-80 xl:w-96 border-l bg-background overflow-y-auto lg:overflow-hidden lg:hover:overflow-y-auto h-full">
          <div className="px-4 pt-4 pb-4 animate-slide-in-right">
            {/* Customer Information Header */}
            <div className="flex items-center gap-2 mb-4">
              <UserIcon className="h-5 w-5 text-muted-foreground" />
              <h3 className="font-semibold">Customer Information</h3>
              <div className="ml-auto">
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 w-7 p-0"
                    >
                      <MoreVertical className="h-4 w-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onClick={() => setShowNewEmailModal(true)}>
                      <Mail className="h-4 w-4 mr-2" />
                      New Email
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={handleOpenChangeContactDialog}>
                      <Edit className="h-4 w-4 mr-2" />
                      Change Contact
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </div>

            <CustomerInfo
              customerName={ticket.customer_name}
              customerEmail={ticket.customer_email}
              customerTicketCount={ticket.customer_ticket_count}
              additionalInfo={additionalCustomerInfo}
              isLoadingAdditionalInfo={isLoadingCustomerInfo}
              additionalInfoError={customerInfoError}
            />
          </div>
        </div>
      </div>

      {/* Mobile Drawer - Dropdowns + Customer Info (only visible on medium screens and smaller) */}
      <Sheet open={customerInfoDrawerOpen} onOpenChange={setCustomerInfoDrawerOpen} modal={false}>
        <SheetContent side="right" className="w-full sm:w-[400px] sm:max-w-md overflow-y-auto">
          <SheetHeader>
            <SheetTitle>Ticket Details</SheetTitle>
          </SheetHeader>

          <div className="mt-6 space-y-6">
            {/* Ticket Controls */}
            <div className="space-y-3">
              <div>
                <Label className="text-xs text-muted-foreground mb-1.5 block">Status</Label>
                <Select value={ticket.status} onValueChange={(value) => {
                  handleStatusChange(value);
                  setCustomerInfoDrawerOpen(false);
                }}>
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="new">{STATUS_LABELS.new}</SelectItem>
                    <SelectItem value="open">{STATUS_LABELS.open}</SelectItem>
                    <SelectItem value="awaiting_customer">{STATUS_LABELS.awaiting_customer}</SelectItem>
                    <SelectItem value="resolved">{STATUS_LABELS.resolved}</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label className="text-xs text-muted-foreground mb-1.5 block">Priority</Label>
                <Select value={ticket.priority} onValueChange={(value) => {
                  handlePriorityChange(value);
                  setCustomerInfoDrawerOpen(false);
                }}>
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="low">{PRIORITY_LABELS.low}</SelectItem>
                    <SelectItem value="normal">{PRIORITY_LABELS.normal}</SelectItem>
                    <SelectItem value="high">{PRIORITY_LABELS.high}</SelectItem>
                    <SelectItem value="urgent">{PRIORITY_LABELS.urgent}</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label className="text-xs text-muted-foreground mb-1.5 block">Assigned To</Label>
                <Select
                  value={ticket.assignee_id ? String(ticket.assignee_id) : 'unassigned'}
                  onValueChange={(value) => {
                    handleAssigneeChange(value);
                    setCustomerInfoDrawerOpen(false);
                  }}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Unassigned" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="unassigned">Unassigned</SelectItem>
                    {sortedActiveUsers.map((u) => (
                      <SelectItem key={u.id} value={String(u.id)}>
                        {u.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label className="text-xs text-muted-foreground mb-1.5 block">Follow-up Date</Label>
                <div className="flex gap-2">
                  <Input
                    type="date"
                    value={ticket.follow_up_at ? ticket.follow_up_at.split('T')[0] : ''}
                    onChange={(e) => {
                      handleFollowUpChange(e.target.value);
                      setCustomerInfoDrawerOpen(false);
                    }}
                    className="flex-1"
                  />
                  {ticket.follow_up_at && (
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => {
                        handleFollowUpChange('');
                        setCustomerInfoDrawerOpen(false);
                      }}
                      title="Clear follow-up date"
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  )}
                </div>
              </div>
            </div>

            <Separator />

            {/* Customer Information */}
            <div className="space-y-4">
              {/* Mobile: Show full-width stacked buttons instead of dropdown */}
              <div className="flex flex-col gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setCustomerInfoDrawerOpen(false);
                    setShowNewEmailModal(true);
                  }}
                  className="w-full h-9"
                >
                  <Mail className="h-4 w-4 mr-2" />
                  New Email
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setCustomerInfoDrawerOpen(false);
                    handleOpenChangeContactDialog();
                  }}
                  className="w-full h-9"
                >
                  <Edit className="h-4 w-4 mr-2" />
                  Change Contact
                </Button>
              </div>

              <h3 className="text-sm font-semibold flex items-center gap-2">
                <UserIcon className="h-4 w-4" />
                Customer Information
              </h3>

              <CustomerInfo
                customerName={ticket.customer_name}
                customerEmail={ticket.customer_email}
                customerTicketCount={ticket.customer_ticket_count}
                additionalInfo={additionalCustomerInfo}
                isLoadingAdditionalInfo={isLoadingCustomerInfo}
                additionalInfoError={customerInfoError}
              />
            </div>
          </div>
        </SheetContent>
      </Sheet>

      {/* Delete Confirmation Dialog */}
      <Dialog open={deleteConfirmOpen} onOpenChange={setDeleteConfirmOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Internal Note</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete this internal note? This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setDeleteConfirmOpen(false);
                setMessageToDelete(null);
              }}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={confirmDeleteMessage}
            >
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Collision Warning Dialog */}
      <Dialog open={showCollisionWarning} onOpenChange={setShowCollisionWarning}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>⚠️ Multiple Agents Composing</DialogTitle>
            <DialogDescription>
              {composingUsers.length > 0 && (
                <>
                  <strong>{composingUsers.map((u) => u.name).join(', ')}</strong>{' '}
                  {composingUsers.length === 1 ? 'is' : 'are'} currently composing a reply to this ticket.
                  <br /><br />
                  Sending now may result in duplicate or conflicting responses.
                  <br /><br />
                  Do you want to send anyway?
                </>
              )}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setShowCollisionWarning(false)}
            >
              Cancel
            </Button>
            <Button
              variant="default"
              onClick={sendReply}
            >
              Send Anyway
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Change Contact Dialog */}
      <Dialog open={changeContactDialogOpen} onOpenChange={setChangeContactDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Change Contact Information</DialogTitle>
            <DialogDescription>
              Update the customer's email address and name for this ticket.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="customer-name">Customer Name</Label>
              <Input
                id="customer-name"
                placeholder="Enter customer name"
                value={editedCustomerName}
                onChange={(e) => setEditedCustomerName(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="customer-email">Customer Email *</Label>
              <Combobox
                id="customer-email"
                placeholder="Enter customer email"
                value={editedCustomerEmail}
                onChange={setEditedCustomerEmail}
                options={customerEmails}
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={handleCancelChangeContact}
            >
              Cancel
            </Button>
            <Button
              onClick={handleSaveCustomerContact}
              disabled={!editedCustomerEmail.trim()}
            >
              Save Changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* New Email Modal */}
      <FormModal
        open={showNewEmailModal}
        onOpenChange={setShowNewEmailModal}
        title="New Email"
        onSubmit={(e) => {
          e.preventDefault();
          handleNewConversation();
        }}
        onCancel={() => {
          setShowNewEmailModal(false);
          setNewEmailSubject('');
        }}
        submitLabel="Continue"
        size="sm"
      >
        <div>
          <Label htmlFor="new-recipient-email">Recipient Email</Label>
          <Input
            id="new-recipient-email"
            type="email"
            value={ticket?.customer_email || ''}
            disabled
            className="bg-muted"
          />
        </div>

        <div>
          <Label htmlFor="new-subject">Subject (optional)</Label>
          <Input
            id="new-subject"
            type="text"
            placeholder="Enter subject"
            value={newEmailSubject}
            onChange={(e) => setNewEmailSubject(e.target.value)}
            autoFocus
          />
        </div>

        <div className="text-sm text-muted-foreground">
          You'll be able to compose your message on the next screen with slash commands and rich text formatting.
        </div>
      </FormModal>

      {/* Forward Email Modal */}
      <FormModal
        open={showForwardEmailModal}
        onOpenChange={(open) => {
          setShowForwardEmailModal(open);
          if (!open) {
            setForwardEmailAddress('');
            setForwardComments('');
            setMessageToForward(null);
          }
        }}
        title="Forward Email"
        onSubmit={(e) => {
          e.preventDefault();
          handleSubmitForwardEmail();
        }}
        onCancel={() => {
          setShowForwardEmailModal(false);
          setForwardEmailAddress('');
          setForwardComments('');
          setMessageToForward(null);
        }}
        submitLabel="Forward"
        isSubmitting={isForwarding}
        size="md"
      >
        <div className="space-y-4">
          <div>
            <Label htmlFor="forward-email">To</Label>
            <Input
              id="forward-email"
              type="email"
              placeholder="Enter email address"
              value={forwardEmailAddress}
              onChange={(e) => setForwardEmailAddress(e.target.value)}
              disabled={isForwarding}
              autoFocus
            />
          </div>

          <div>
            <Label htmlFor="forward-comments">Add a message (optional)</Label>
            <Textarea
              id="forward-comments"
              placeholder="Add context or notes for the recipient..."
              value={forwardComments}
              onChange={(e) => setForwardComments(e.target.value)}
              disabled={isForwarding}
              rows={4}
            />
          </div>

          <div className="text-sm text-muted-foreground">
            The original message will be included below your comments as a forwarded message.
          </div>
        </div>
      </FormModal>
    </div>
  );
}
