import { useEffect, useRef } from "react";
import { showLocalNotification } from "./push-notifications";
import type { FindMeClient } from "./api-client";

const POLL_INTERVAL = 30_000; // 30 seconds in foreground

/**
 * Hook that polls for pending notifications when the app is in the foreground.
 * This replaces Firebase/FCM push notifications for FOSS builds.
 * Notifications are shown as local notifications via notifee.
 */
export function useNotificationPoller(
  apiClient: FindMeClient,
  isAuthenticated: boolean
) {
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (!isAuthenticated) {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      return;
    }

    async function poll() {
      try {
        const baseUrl = apiClient.getBaseUrl();
        if (!baseUrl) return;

        const result = await apiClient.getPendingNotifications();
        if (!result.success || !Array.isArray(result.data)) return;

        for (const notif of result.data) {
          await showLocalNotification(notif.title, notif.body, notif.data || undefined);
        }
      } catch {
        // Polling failure is non-critical
      }
    }

    // Poll immediately, then on interval
    poll();
    intervalRef.current = setInterval(poll, POLL_INTERVAL);

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [isAuthenticated, apiClient]);
}
