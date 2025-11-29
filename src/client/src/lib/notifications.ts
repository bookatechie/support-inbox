/**
 * Browser Notification utilities for Support Inbox
 * Handles permission requests and showing notifications
 */

// Check if notifications are supported
export function isNotificationSupported(): boolean {
  return 'Notification' in window;
}

// Get current permission status
export function getNotificationPermission(): NotificationPermission | 'unsupported' {
  if (!isNotificationSupported()) {
    return 'unsupported';
  }
  return Notification.permission;
}

// Request notification permission
export async function requestNotificationPermission(): Promise<NotificationPermission | 'unsupported'> {
  if (!isNotificationSupported()) {
    return 'unsupported';
  }

  if (Notification.permission === 'granted') {
    return 'granted';
  }

  if (Notification.permission === 'denied') {
    return 'denied';
  }

  // Request permission
  const permission = await Notification.requestPermission();
  return permission;
}

// Notification options interface
export interface ShowNotificationOptions {
  title: string;
  body: string;
  tag?: string; // Used to replace/deduplicate notifications
  icon?: string;
  onClick?: () => void;
  timeout?: number; // Auto-close after ms (default: 5000)
}

// Show a browser notification
export function showNotification(options: ShowNotificationOptions): Notification | null {
  if (!isNotificationSupported() || Notification.permission !== 'granted') {
    return null;
  }

  const notification = new Notification(options.title, {
    body: options.body,
    tag: options.tag,
    icon: options.icon || '/favicon.ico',
    requireInteraction: false,
  });

  if (options.onClick) {
    notification.onclick = () => {
      options.onClick?.();
      notification.close();
      // Focus the window when notification is clicked
      window.focus();
    };
  }

  // Auto-close after timeout
  if (options.timeout !== 0) {
    setTimeout(() => {
      notification.close();
    }, options.timeout || 5000);
  }

  return notification;
}

// Check if the document is hidden (user is on another tab/window)
export function isDocumentHidden(): boolean {
  return document.hidden;
}
