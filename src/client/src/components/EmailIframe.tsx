/**
 * EmailIframe component - Renders email HTML in an isolated iframe
 * Based on un-inbox/chatwoot implementations with expandable content
 */

import { useState, useRef, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { ChevronsDown } from 'lucide-react';
import type { EmailMetadata } from '@/types';

/**
 * EmailMetadataHeader component - Shows From/To/CC/Subject info
 */
export function EmailMetadataHeader({
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

interface EmailIframeProps {
  html: string;
  emailMetadata: EmailMetadata | null;
  senderName: string | null;
  senderEmail: string;
}

export function EmailIframe({
  html,
  emailMetadata,
  senderName,
  senderEmail
}: EmailIframeProps) {
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
