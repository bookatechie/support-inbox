/**
 * Email sending via SMTP (Nodemailer)
 */

import nodemailer from 'nodemailer';
import type { Transporter } from 'nodemailer';
import type { SmtpConfig, Ticket } from './types.js';
import { config } from './config.js';

// Logger interface for Pino/Fastify logger compatibility
interface Logger {
  info: (objOrMsg: object | string, msg?: string) => void;
  error: (objOrMsg: object | string, msg?: string) => void;
  debug: (objOrMsg: object | string, msg?: string) => void;
}

let transporter: Transporter | null = null;
let logger: Logger | null = null;

/**
 * Set the logger for this module
 */
export function setEmailSenderLogger(log: Logger): void {
  logger = log;
}

/**
 * Initialize SMTP transporter
 */
export function initializeEmailSender(smtpConfig: SmtpConfig): void {
  transporter = nodemailer.createTransport({
    host: smtpConfig.host,
    port: smtpConfig.port,
    secure: smtpConfig.secure, // true for 465, false for other ports
    auth: {
      user: smtpConfig.user,
      pass: smtpConfig.password,
    },
  });

  logger?.info({ host: smtpConfig.host, port: smtpConfig.port }, 'Email sender initialized');
}

/**
 * Get transporter (lazy initialization from config)
 */
function getTransporter(): Transporter {
  if (!transporter) {
    initializeEmailSender(config.smtp);
  }

  return transporter!;
}

/**
 * Send reply email to customer
 * @returns The Message-ID of the sent email for threading
 */
export async function sendReplyEmail(
  ticket: Ticket,
  replyBody: string,
  agentName: string,
  isFirstMessage: boolean = false,
  attachments?: Array<{ filename: string; path?: string; content?: Buffer; cid?: string }>,
  toEmails?: string[],
  ccEmails?: string[],
  signature?: string | null,
  trackingToken?: string,
  agentPersonalEmail?: string | null,
  previousMessages?: Array<{ sender_email: string; sender_name: string | null; body_html: string | null; body: string; created_at: string; message_id: string | null; email_metadata: string | null }>,
  fromEmailOverride?: string | null
): Promise<string> {
  const transport = getTransporter();

  // Append signature if provided
  let finalBody = replyBody;
  if (signature) {
    // Signature is already HTML from RichTextEditor
    finalBody = `${replyBody}<br>${signature}`;
  }

  // Add tracking pixel if tracking token provided
  if (trackingToken) {
    const trackingPixel = `<img src="${config.serverUrl}/api/track/${trackingToken}" alt="" width="1" height="1" style="display:none;" />`;
    finalBody = `${finalBody}${trackingPixel}`;
  }

  // Include quoted previous messages for context (most recent first, then older messages)
  if (previousMessages && previousMessages.length > 0) {
    // Add separator before quoted content
    finalBody += '<br><br><hr style="border: none; border-top: 1px solid #ccc; margin: 20px 0;">';

    // Quote each previous message in reverse chronological order (most recent first)
    for (const msg of previousMessages) {
      const messageDate = new Date(msg.created_at).toLocaleString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      });

      const senderName = msg.sender_name || msg.sender_email;
      const messageBody = msg.body_html || msg.body.replace(/\n/g, '<br>');

      finalBody += `<br><div style="color: #666; font-size: 0.9em;">On ${messageDate}, ${senderName} wrote:</div>`;
      finalBody += `<blockquote style="border-left: 3px solid #ccc; padding-left: 10px; margin: 10px 0; color: #666;">${messageBody}</blockquote>`;
    }
  }

  // Convert HTML to plain text for fallback (strip HTML tags)
  const plainText = finalBody.replace(/<[^>]*>/g, '').replace(/\n\n+/g, '\n\n');

  // Use override email if provided, then agent's personalized email, otherwise shared inbox
  // NEVER use the agent's login email (agentEmail parameter is ignored)
  const fromAddress = fromEmailOverride || agentPersonalEmail || config.smtp.from;

  // Use provided to_emails, or fallback to ticket customer email
  const recipientEmails = toEmails && toEmails.length > 0
    ? toEmails
    : [ticket.reply_to_email || ticket.customer_email];

  // Debug: log inline images
  if (attachments && attachments.some(a => a.cid)) {
    logger?.debug({ inlineImages: attachments.filter(a => a.cid).map(a => ({ filename: a.filename, cid: a.cid })), hasCidRefs: finalBody.includes('cid:') }, 'Sending email with inline images');
  }

  // Build proper References header with all message IDs in the thread
  // Per RFC 5322, we need to maintain the full thread chain by:
  // 1. Getting the References from the most recent incoming message (if any)
  // 2. Appending the In-Reply-To message ID
  // This is how Chatwoot and other proper email systems maintain threading
  let referencesHeader: string | undefined;

  if (previousMessages && previousMessages.length > 0) {
    // Find the most recent incoming message (from customer) to get its References chain
    const mostRecentIncomingMessage = previousMessages.find(
      m => m.sender_email === ticket.customer_email || m.sender_email === ticket.reply_to_email
    );

    let referencesArray: string[] = [];

    // If we found an incoming message with email_metadata, use its References
    if (mostRecentIncomingMessage && mostRecentIncomingMessage.email_metadata) {
      try {
        const metadata = JSON.parse(mostRecentIncomingMessage.email_metadata);
        if (metadata.references && Array.isArray(metadata.references)) {
          referencesArray = metadata.references;
        }
      } catch (e) {
        logger?.error({ err: e }, 'Failed to parse email_metadata for References header');
      }
    }

    // Append the In-Reply-To message ID (most recent message)
    const inReplyToId = previousMessages[0]?.message_id;
    if (inReplyToId && !referencesArray.includes(inReplyToId)) {
      referencesArray.push(inReplyToId);
    }

    // If no References found from metadata, fall back to building from message IDs
    if (referencesArray.length === 0) {
      const messageIds = previousMessages
        .map(m => m.message_id)
        .filter((id): id is string => id !== null && id !== undefined);

      if (ticket.message_id && !messageIds.includes(ticket.message_id)) {
        referencesArray = [ticket.message_id, ...messageIds];
      } else {
        referencesArray = messageIds;
      }
    }

    // Remove duplicates while preserving order
    referencesArray = [...new Set(referencesArray)];

    if (referencesArray.length > 0) {
      referencesHeader = referencesArray.join(' ');
    }
  } else if (ticket.message_id) {
    // Fallback to ticket's message_id if no previous messages provided
    referencesHeader = ticket.message_id;
  }

  const mailOptions = {
    from: {
      name: agentName,
      address: fromAddress,
    },
    to: recipientEmails,
    cc: ccEmails && ccEmails.length > 0 ? ccEmails : undefined,
    subject: isFirstMessage ? ticket.subject : `Re: ${ticket.subject}`,
    text: plainText,
    html: finalBody,
    // Threading headers to keep conversation grouped
    // In-Reply-To should be the most recent message ID
    inReplyTo: previousMessages && previousMessages.length > 0 && previousMessages[0].message_id
      ? previousMessages[0].message_id
      : ticket.message_id || undefined,
    // References should contain all previous message IDs
    references: referencesHeader,
    attachments: attachments,
  };

  try {
    const info = await transport.sendMail(mailOptions);
    logger?.info({ messageId: info.messageId, to: recipientEmails, cc: ccEmails }, 'Email sent');
    return info.messageId || '';
  } catch (error) {
    logger?.error({ err: error }, 'Failed to send email');
    throw new Error('Failed to send email');
  }
}

/**
 * Send notification email to agent
 */
export async function sendAgentNotification(
  agentEmail: string,
  subject: string,
  body: string
): Promise<void> {
  const transport = getTransporter();

  const mailOptions = {
    from: config.smtp.from,
    to: agentEmail,
    subject: `[Support Inbox] ${subject}`,
    text: body,
  };

  try {
    const info = await transport.sendMail(mailOptions);
    logger?.info({ to: agentEmail, messageId: info.messageId }, 'Agent notification sent');
  } catch (error) {
    logger?.error({ err: error, to: agentEmail }, 'Failed to send agent notification');
    // Don't throw - notifications are nice-to-have
  }
}

/**
 * Send test email to verify SMTP configuration
 */
export async function sendTestEmail(to: string): Promise<boolean> {
  try {
    const transport = getTransporter();

    await transport.sendMail({
      from: config.smtp.from,
      to,
      subject: 'Support Inbox - SMTP Test',
      text: 'This is a test email from Support Inbox. Your SMTP configuration is working correctly!',
    });

    logger?.info({ to }, 'Test email sent');
    return true;
  } catch (error) {
    logger?.error({ err: error, to }, 'Test email failed');
    return false;
  }
}

/**
 * Verify SMTP connection
 */
export async function verifyEmailConnection(): Promise<boolean> {
  try {
    const transport = getTransporter();
    await transport.verify();
    logger?.info('SMTP connection verified');
    return true;
  } catch (error) {
    logger?.error({ err: error }, 'SMTP verification failed');
    return false;
  }
}

/**
 * Send new outbound email (not a reply)
 */
export async function sendNewEmail(
  to: string,
  subject: string,
  body: string,
  agentName: string,
  agentPersonalEmail?: string | null
): Promise<string | null> {
  const transport = getTransporter();

  // Convert HTML to plain text for fallback
  const plainText = body.replace(/<[^>]*>/g, '').replace(/\n\n+/g, '\n\n');

  // Use agent's personalized email if configured, otherwise use shared inbox
  const fromAddress = agentPersonalEmail || config.smtp.from;

  const mailOptions = {
    from: {
      name: agentName,
      address: fromAddress,
    },
    to,
    subject,
    text: plainText,
    html: body,
  };

  try {
    const info = await transport.sendMail(mailOptions);
    logger?.info({ to, messageId: info.messageId }, 'New email sent');
    return info.messageId || null;
  } catch (error) {
    logger?.error({ err: error, to }, 'Failed to send new email');
    throw new Error('Failed to send email');
  }
}
