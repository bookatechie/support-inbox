/**
 * Email utility functions for processing and displaying email content
 */

import DOMPurify from 'dompurify';
import { marked } from 'marked';
import Prism from 'prismjs';
import type { Attachment } from '@/types';

/**
 * Check if a file type can be viewed in the browser
 */
export function isViewableInBrowser(mimeType: string | null): boolean {
  if (!mimeType) return false;

  return (
    mimeType.startsWith('image/') || // All images
    mimeType === 'application/pdf'   // PDFs
  );
}

/**
 * Check if file is an audio file that can be played in browser
 */
export function isAudioFile(mimeType: string | null): boolean {
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
export function getMessageBodyHtml(body: string, bodyHtml: string | null, attachments?: Attachment[]): string {
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
      ADD_ATTR: ['target', 'style', 'loading', 'class'], // Allow class for language-* on code blocks
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

    // Process <pre><code class="language-*"> blocks
    const codeBlocks = doc.querySelectorAll('pre > code[class*="language-"]');
    codeBlocks.forEach(codeEl => {
      const pre = codeEl.parentElement;
      if (!pre) return;

      const classAttr = codeEl.getAttribute('class') || '';
      const langMatch = classAttr.match(/language-(\w+)/);
      if (!langMatch) return;

      const lang = langMatch[1];
      const textContent = codeEl.textContent || '';

      if (lang === 'markdown') {
        // Parse markdown and render as HTML
        const rendered = marked.parse(textContent, { async: false }) as string;
        const wrapper = doc.createElement('div');
        wrapper.className = 'rendered-markdown';
        wrapper.innerHTML = DOMPurify.sanitize(rendered, {
          ADD_ATTR: ['class'],
        });
        pre.replaceWith(wrapper);
      } else if (Prism.languages[lang]) {
        // Syntax highlight with Prism
        const highlighted = Prism.highlight(textContent, Prism.languages[lang], lang);
        codeEl.innerHTML = highlighted;
        pre.className = `language-${lang}`;
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
export function isSimpleHtml(html: string): boolean {
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
