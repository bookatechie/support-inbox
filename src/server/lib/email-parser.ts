/**
 * Email parsing utilities
 * Converts IMAP messages to structured ParsedEmail objects
 */

import { simpleParser, ParsedMail, AddressObject } from 'mailparser';
import type { ParsedEmail, ParsedAttachment } from './types.js';

/**
 * Parse raw email message (from IMAP) into structured format
 */
export async function parseEmail(rawEmail: Buffer | string): Promise<ParsedEmail> {
  const parsed: ParsedMail = await simpleParser(rawEmail);

  // Extract sender
  const from = extractFirstAddress(parsed.from);
  const fromName = extractFirstName(parsed.from);
  const replyTo = extractFirstAddress(parsed.replyTo);

  // Extract recipients
  const to = extractAllAddresses(parsed.to);
  const cc = extractAllAddresses(parsed.cc);
  const bcc = extractAllAddresses(parsed.bcc);

  // Extract body
  const body = parsed.text || '';
  const bodyHtml = parsed.html || null;

  // Extract headers
  const messageId = parsed.messageId || null;
  const inReplyTo = parsed.inReplyTo || null;
  const references = parsed.references || [];

  // Extract additional headers for debugging and features
  const priority = parsed.priority || null;

  // Note: receivedDate doesn't exist in mailparser, use date as fallback
  const receivedDate = parsed.date || new Date();

  // Extract X-Original-To header (original recipient before forwarding)
  const originalToHeader = parsed.headers.get('x-original-to');
  const originalTo = typeof originalToHeader === 'string' ? originalToHeader : null;

  // Extract email client info (X-Mailer or User-Agent)
  const xMailer = parsed.headers.get('x-mailer');
  const userAgent = parsed.headers.get('user-agent');
  const emailClient = typeof xMailer === 'string' ? xMailer : (typeof userAgent === 'string' ? userAgent : null);

  // Convert headers map to plain object for storage
  const headers: Record<string, string | string[]> = {};
  if (parsed.headers) {
    for (const [key, value] of parsed.headers) {
      // Handle Date objects and other types
      if (value instanceof Date) {
        headers[key] = value.toISOString();
      } else if (Array.isArray(value)) {
        headers[key] = value.map(v => typeof v === 'string' ? v : String(v));
      } else if (typeof value === 'string') {
        headers[key] = value;
      } else if (value != null) {
        headers[key] = String(value);
      }
    }
  }

  // Parse attachments
  const attachments: ParsedAttachment[] = [];
  if (parsed.attachments) {
    for (const att of parsed.attachments) {
      if (att.content) {
        attachments.push({
          filename: att.filename || 'attachment',
          content: att.content,
          contentType: att.contentType || 'application/octet-stream',
          size: att.size || att.content.length,
        });
      }
    }
  }

  return {
    subject: parsed.subject || '(No Subject)',
    from: from || '',
    fromName: fromName,
    replyTo: replyTo,
    to,
    cc,
    bcc,
    body: cleanEmailBody(body),
    bodyHtml: bodyHtml ? String(bodyHtml) : null,
    bodyHtmlStripped: stripHtml(bodyHtml),  // Stripped HTML for full-text search indexing
    messageId,
    inReplyTo,
    references: Array.isArray(references) ? references : [references].filter(Boolean),
    attachments,
    date: parsed.date || new Date(),
    // Additional headers
    priority,
    receivedDate,
    originalTo,
    emailClient,
    headers,
  };
}

/**
 * Extract first email address from AddressObject
 */
function extractFirstAddress(addressObject: AddressObject | AddressObject[] | undefined): string | null {
  if (!addressObject) return null;

  const addresses = Array.isArray(addressObject) ? addressObject : [addressObject];

  for (const addr of addresses) {
    if (addr.value && addr.value.length > 0) {
      return addr.value[0].address || null;
    }
  }

  return null;
}

/**
 * Extract first name from AddressObject
 */
function extractFirstName(addressObject: AddressObject | AddressObject[] | undefined): string | null {
  if (!addressObject) return null;

  const addresses = Array.isArray(addressObject) ? addressObject : [addressObject];

  for (const addr of addresses) {
    if (addr.value && addr.value.length > 0) {
      return addr.value[0].name || null;
    }
  }

  return null;
}

/**
 * Extract all email addresses from AddressObject
 */
function extractAllAddresses(addressObject: AddressObject | AddressObject[] | undefined): string[] {
  if (!addressObject) return [];

  const addresses = Array.isArray(addressObject) ? addressObject : [addressObject];
  const result: string[] = [];

  for (const addr of addresses) {
    if (addr.value) {
      for (const v of addr.value) {
        if (v.address) {
          result.push(v.address);
        }
      }
    }
  }

  return result;
}

/**
 * Strip HTML tags from a string for full-text search indexing
 */
export function stripHtml(html: string | null): string {
  if (!html) return '';

  return html
    // Remove script and style tags with their content
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
    .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, '')
    // Remove all HTML tags
    .replace(/<[^>]+>/g, ' ')
    // Decode common HTML entities
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    // Collapse multiple spaces
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Clean email body by removing quoted text, signatures, etc.
 */
function cleanEmailBody(body: string): string {
  // Split into lines
  const lines = body.split('\n');
  const cleanedLines: string[] = [];

  let inQuote = false;
  let inSignature = false;

  for (let line of lines) {
    // Trim trailing whitespace
    line = line.trimEnd();

    // Skip empty lines at the end
    if (line.length === 0 && cleanedLines.length === 0) {
      continue;
    }

    // Detect signature markers
    if (line.match(/^--\s*$/) || line.match(/^_{3,}$/) || line.match(/^Sent from my/i)) {
      inSignature = true;
      continue;
    }

    // Skip signature content
    if (inSignature) {
      continue;
    }

    // Detect quoted text (lines starting with >)
    if (line.startsWith('>')) {
      inQuote = true;
      continue;
    }

    // Detect "On ... wrote:" patterns
    if (line.match(/^On .* wrote:$/i)) {
      break; // Stop processing, rest is quoted
    }

    // If we were in a quote and hit a non-quote line, reset
    if (inQuote && !line.startsWith('>')) {
      inQuote = false;
    }

    // Skip quoted content
    if (inQuote) {
      continue;
    }

    cleanedLines.push(line);
  }

  // Trim trailing empty lines
  while (cleanedLines.length > 0 && cleanedLines[cleanedLines.length - 1].trim() === '') {
    cleanedLines.pop();
  }

  return cleanedLines.join('\n').trim();
}

/**
 * Check if email is bulk/mailing list mail that should be filtered.
 *
 * For a support inbox, we want to receive almost everything:
 * - Bounce notifications (know if your reply didn't reach customer)
 * - Out of Office replies (context for why customer isn't responding)
 * - Delivery status notifications (important feedback)
 *
 * Only filter bulk mailing list emails (Precedence: bulk/junk header).
 */
export function isAutoGenerated(parsed: ParsedEmail): boolean {
  if (parsed.headers) {
    const precedence = parsed.headers['precedence'];
    if (precedence && typeof precedence === 'string') {
      const precLower = precedence.toLowerCase();
      if (precLower === 'bulk' || precLower === 'junk') {
        return true;
      }
    }
  }
  return false;
}

/**
 * Extract order numbers, tracking numbers, or other IDs from email body
 */
export function extractIdentifiers(body: string): string[] {
  const identifiers: string[] = [];

  // Order numbers: #12345, Order #12345, Order: 12345
  const orderMatches = body.match(/(order|#)\s*[:#]?\s*([A-Z0-9]{4,})/gi);
  if (orderMatches) {
    identifiers.push(...orderMatches);
  }

  // Tracking numbers: 1Z999AA10123456784 (UPS), 9400 1000 0000 0000 0000 00 (USPS)
  const trackingMatches = body.match(/\b([A-Z0-9]{10,})\b/g);
  if (trackingMatches) {
    identifiers.push(...trackingMatches);
  }

  return [...new Set(identifiers)]; // Remove duplicates
}
