/**
 * Hook for managing browser notifications
 * Handles permission state and provides notification functions
 */

import { useState, useEffect, useCallback } from 'react';
import {
  isNotificationSupported,
  getNotificationPermission,
  requestNotificationPermission,
  showNotification,
  isDocumentHidden,
  type ShowNotificationOptions,
} from '@/lib/notifications';

// Storage key for notification preference
const NOTIFICATIONS_ENABLED_KEY = 'notificationsEnabled';

interface UseNotificationsReturn {
  // Permission state
  isSupported: boolean;
  permission: NotificationPermission | 'unsupported';

  // User preference (even if granted, user may disable in app)
  isEnabled: boolean;
  setEnabled: (enabled: boolean) => void;

  // Actions
  requestPermission: () => Promise<NotificationPermission | 'unsupported'>;
  notify: (options: ShowNotificationOptions) => Notification | null;
  notifyIfHidden: (options: ShowNotificationOptions) => Notification | null;
}

export function useNotifications(): UseNotificationsReturn {
  const [permission, setPermission] = useState<NotificationPermission | 'unsupported'>(
    getNotificationPermission()
  );

  const [isEnabled, setIsEnabledState] = useState<boolean>(() => {
    // Default to true if not explicitly disabled
    const stored = localStorage.getItem(NOTIFICATIONS_ENABLED_KEY);
    return stored !== 'false';
  });

  const isSupported = isNotificationSupported();

  // Update permission state when it changes
  useEffect(() => {
    if (!isSupported) return;

    // Check permission periodically (in case user changes in browser settings)
    const checkPermission = () => {
      const currentPermission = getNotificationPermission();
      if (currentPermission !== permission) {
        setPermission(currentPermission);
      }
    };

    // Check on visibility change (user returns to tab)
    const handleVisibilityChange = () => {
      if (!document.hidden) {
        checkPermission();
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, [isSupported, permission]);

  // Persist enabled state
  const setEnabled = useCallback((enabled: boolean) => {
    setIsEnabledState(enabled);
    localStorage.setItem(NOTIFICATIONS_ENABLED_KEY, String(enabled));
  }, []);

  // Request permission wrapper
  const requestPermission = useCallback(async () => {
    const result = await requestNotificationPermission();
    setPermission(result);
    return result;
  }, []);

  // Show notification (always, if permitted and enabled)
  const notify = useCallback((options: ShowNotificationOptions): Notification | null => {
    if (!isEnabled || permission !== 'granted') {
      return null;
    }
    return showNotification(options);
  }, [isEnabled, permission]);

  // Show notification only if document is hidden (user on another tab)
  const notifyIfHidden = useCallback((options: ShowNotificationOptions): Notification | null => {
    if (!isDocumentHidden()) {
      return null;
    }
    return notify(options);
  }, [notify]);

  return {
    isSupported,
    permission,
    isEnabled,
    setEnabled,
    requestPermission,
    notify,
    notifyIfHidden,
  };
}
